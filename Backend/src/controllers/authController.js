import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import { UnauthorizedError, ValidationError } from "../errors/index.js";
import authService from "../services/authService.js";
import memberService from "../services/memberService.js";
import logger from "../utils/logger.js";
import crypto from "crypto";
import ms from "ms";

/* ─────────────────────────────────────────────
   COOKIE OPTION FACTORIES
───────────────────────────────────────────── */

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Base options shared by all auth cookies.
 *
 * path: "/" — auth cookies must be sent on every request, not just /api/auth.
 * Scoping to /api/auth would silently drop cookies from /api/documents,
 * /api/members, etc., breaking authentication on all protected routes.
 *
 * sameSite: "none" requires secure: true (HTTPS). In development,
 * sameSite: "lax" is used instead — sufficient for same-site localhost.
 */
const BASE_COOKIE_OPTIONS = {
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
  path: "/",
};

/**
 * httpOnly token cookies (accessToken, refreshToken).
 * @param {string} expiryEnvKey - env var name holding the expiry string
 * @param {string} fallback     - fallback expiry if env var is unset
 */
const tokenCookieOptions = (expiryEnvKey, fallback) => ({
  ...BASE_COOKIE_OPTIONS,
  httpOnly: true,
  maxAge: ms(process.env[expiryEnvKey] || fallback),
});

/**
 * CSRF cookie — intentionally NOT httpOnly so frontend JS can read it
 * and attach it to mutation requests as a header for validation.
 */
const CSRF_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  httpOnly: false,
};

/**
 * clearCookie options must exactly match the options used at set time
 * (excluding maxAge/expires). Mismatch causes the browser to ignore the
 * clear and the cookie survives logout.
 */
const CLEAR_TOKEN_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  httpOnly: true,
};

const CLEAR_CSRF_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  httpOnly: false,
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/** Attaches the three auth cookies to a response chain. */
function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  return res
    .cookie(
      "accessToken",
      accessToken,
      tokenCookieOptions("JWT_ACCESS_EXPIRY", "15m"),
    )
    .cookie(
      "refreshToken",
      refreshToken,
      tokenCookieOptions("JWT_REFRESH_EXPIRY", "7d"),
    )
    .cookie("csrfToken", csrfToken, CSRF_COOKIE_OPTIONS);
}

/* ─────────────────────────────────────────────
   CONTROLLERS
───────────────────────────────────────────── */

// REGISTER
//
// Sets auth cookies immediately after account creation so the frontend
// redirects to /onboarding already authenticated with status "pending".
// The response body includes the user object so the auth store populates
// role and status exactly as it does after login.
export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(
    req.body,
    {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  );

  const csrfToken = crypto.randomBytes(32).toString("hex");

  logger.info("User registered and session created", {
    userId: user._id ?? user.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.context?.requestId,
  });

  const response = ApiResponse.created(user, "Account created successfully.");

  return setAuthCookies(res, { accessToken, refreshToken, csrfToken })
    .status(response.statusCode)
    .json(response);
});

// LOGIN
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { user, accessToken, refreshToken } = await authService.login(
    email,
    password,
    {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  );

  const csrfToken = crypto.randomBytes(32).toString("hex");

  logger.info("User login successful", {
    userId: user._id ?? user.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.context?.requestId,
  });

  const response = ApiResponse.ok(user, "Login successful.");

  return setAuthCookies(res, { accessToken, refreshToken, csrfToken })
    .status(response.statusCode)
    .json(response);
});

// REFRESH
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    throw UnauthorizedError.missingToken();
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await authService.refresh(token);

  const newCsrfToken = crypto.randomBytes(32).toString("hex");

  logger.info("Token refreshed", {
    ip: req.ip,
    requestId: req.context?.requestId,
  });

  const response = ApiResponse.ok(null, "Token refreshed.");

  return setAuthCookies(res, {
    accessToken,
    refreshToken: newRefreshToken,
    csrfToken: newCsrfToken,
  })
    .status(response.statusCode)
    .json(response);
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;

  if (token) {
    try {
      await authService.logout(token);
    } catch (err) {
      logger.warn("authService.logout failed — cookies cleared regardless", {
        error: err.message,
        ip: req.ip,
        requestId: req.context?.requestId,
      });
    }
  }

  logger.info("User logged out", {
    ip: req.ip,
    requestId: req.context?.requestId,
  });

  const response = ApiResponse.ok(null, "Logged out successfully.");

  return res
    .clearCookie("accessToken", CLEAR_TOKEN_COOKIE_OPTIONS)
    .clearCookie("refreshToken", CLEAR_TOKEN_COOKIE_OPTIONS)
    .clearCookie("csrfToken", CLEAR_CSRF_COOKIE_OPTIONS)
    .status(response.statusCode)
    .json(response);
});

// ME
export const me = asyncHandler(async (req, res) => {
  const response = ApiResponse.ok(req.user, "User fetched.");
  return res.status(response.statusCode).json(response);
});

// COMPLETE ONBOARDING
//
// Single endpoint that creates the member profile and uploads their initial
// KYC documents in one request. Called at the end of the onboarding wizard.
//
// This endpoint is idempotent on the profile step — if a profile already
// exists (e.g. a previous attempt succeeded in creating the profile but
// failed before the response reached the frontend), creation is skipped
// and document upload proceeds normally. This prevents the user from being
// stuck on the onboarding page with no way to proceed.
//
// Request shape (multipart/form-data):
//   Profile fields — businessName, registrationNumber, taxId,
//                    membershipType, contactPerson, phoneNumber,
//                    physicalAddress, city, fleetSize, vehicleTypes[]
//   Document files — one or more files on the field names defined in
//                    cloudinaryUploadMiddleware (nationalId, passport,
//                    businessCert, tinCertificate, utilityBill)
//
// Middleware chain on this route (see authRoutes.js):
//   protect → cloudinaryUpload → postUploadValidation → transformDocuments
//   → completeOnboarding
//
// By the time this controller runs:
//   req.user           — populated by protect (id, role, status, email)
//   req.normalizedDocs — populated by transformDocuments (validated doc array)
export const completeOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // ── 1. Validate documents are present ────────────────────────────────────
  // transformDocuments passes through with [] when no files are uploaded.
  // File presence is the controller's responsibility per the middleware's
  // documented non-responsibilities.
  const documents = req.normalizedDocs ?? [];

  if (documents.length === 0) {
    throw ValidationError.dto(
      "files",
      "At least one document is required to complete onboarding.",
      "MISSING_DOCS",
    );
  }

  // ── 2. Parse profile fields from req.body ────────────────────────────────
  // The request is multipart/form-data (required for file uploads).
  // Profile fields arrive as strings in req.body alongside the files.
  // fleetSize and vehicleTypes need type coercion — all other fields are
  // strings and pass through to the service unchanged.
  const {
    businessName,
    registrationNumber,
    taxId,
    membershipType,
    contactPerson,
    phoneNumber,
    physicalAddress,
    city,
    fleetSize,
    vehicleTypes,
  } = req.body;

  const profileData = {
    businessName,
    registrationNumber,
    taxId,
    membershipType,
    contactPerson,
    phoneNumber,
    physicalAddress,
    city,
    // fleetSize arrives as a string from multipart/form-data — coerce to int.
    fleetSize: fleetSize !== undefined ? parseInt(fleetSize, 10) : undefined,
    // vehicleTypes may arrive as a comma-separated string or a repeated
    // field array depending on how the frontend serializes FormData.
    // Both forms are normalized to a clean string array here.
    vehicleTypes:
      typeof vehicleTypes === "string"
        ? vehicleTypes
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : Array.isArray(vehicleTypes)
          ? vehicleTypes
          : [],
  };

  // ── 3. Create profile (idempotent) ────────────────────────────────────────
  // If a profile already exists — e.g. the user submitted once but the
  // response never reached the frontend due to a network error — skip
  // creation silently and proceed to document upload. Both PROFILE_EXISTS
  // (thrown by the explicit duplicate check in createProfile) and
  // DUPLICATE_KEY (thrown when the MongoDB unique index fires) are handled.
  try {
    await memberService.createProfile({ userId, data: profileData });

    logger.info("Onboarding: profile created", {
      userId,
      requestId: req.context?.requestId,
    });
  } catch (err) {
    if (err.code === "PROFILE_EXISTS" || err.code === "DUPLICATE_KEY") {
      logger.info("Onboarding: profile already exists — skipping creation", {
        userId,
        requestId: req.context?.requestId,
      });
      // Fall through to document upload below
    } else {
      throw err;
    }
  }

  // ── 4. Upload documents ───────────────────────────────────────────────────
  // Runs after profile creation. A failure here leaves the profile intact
  // so the user can retry without re-entering their business information.
  // memberService.handleDocumentUpload handles overwrites safely via
  // fileService.safeDelete on existing Cloudinary assets.
  const profile = await memberService.handleDocumentUpload({
    userId,
    documents,
  });

  logger.info("Onboarding: documents uploaded", {
    userId,
    documentTypes: documents.map((d) => d.documentType),
    requestId: req.context?.requestId,
  });

  const response = ApiResponse.ok(
    profile,
    "Onboarding complete. Your application is pending review.",
  );

  return res.status(response.statusCode).json(response);
});
