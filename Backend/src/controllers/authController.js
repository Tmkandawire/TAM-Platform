import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import { UnauthorizedError } from "../errors/index.js";
import authService from "../services/authService.js";
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
 * path: "/" — auth cookies (accessToken, refreshToken, csrfToken) must be
 * sent on every request, not just /api/auth. Scoping to /api/auth would
 * silently drop cookies from /api/documents, /api/admin, etc., breaking
 * authentication on all protected routes. Narrowing path is only safe if
 * a reverse proxy or gateway forwards cookies explicitly — not the case here.
 *
 * sameSite: "none" requires secure: true (HTTPS). In development,
 * sameSite: "lax" is used instead — lax blocks cross-site POST requests
 * while still allowing same-site navigation, which is sufficient locally.
 */
const BASE_COOKIE_OPTIONS = {
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
  path: "/",
};

/**
 * httpOnly token cookies (accessToken, refreshToken).
 *
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
 * and attach it to requests as a header for validation.
 * No maxAge: expires with the browser session.
 */
const CSRF_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  httpOnly: false,
};

/**
 * clearCookie options must exactly match the options used at set time
 * (excluding maxAge/expires). Mismatch causes the browser to ignore the
 * clear instruction — the cookie survives logout.
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
export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);

  const response = ApiResponse.created(user, "User registered successfully.");
  return res.status(response.statusCode).json(response);
});

// LOGIN
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // authService.login is responsible for logging failed attempts and
  // brute-force patterns before throwing. The controller only sees success.
  const { user, accessToken, refreshToken } = await authService.login(
    email,
    password,
    {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  );

  const csrfToken = crypto.randomBytes(32).toString("hex");

  // NOTE: csrfToken is a stateless random value tied to this session via
  // the httpOnly refreshToken cookie. Full CSRF enforcement requires a
  // csrfMiddleware that validates the token from the request header against
  // this cookie on every state-changing request. Issuance here is step one;
  // enforcement is a middleware concern.
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
  // Header fallback intentionally absent — refresh tokens must travel via
  // httpOnly cookie only. Accepting them from headers exposes tokens to
  // logs, proxies, and JS context, breaking the cookie security model.
  const token = req.cookies.refreshToken;

  if (!token) {
    throw UnauthorizedError.missingToken();
  }

  // authService.refresh is responsible for rotation detection — if a token
  // is reused after rotation, the service should revoke the entire family
  // and log the suspicious event before throwing.
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
      // Logout must not fail the user — cookies are cleared regardless.
      // Log the service failure so on-call can investigate token cleanup.
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
  // req.user is populated by the protect middleware
  const response = ApiResponse.ok(req.user, "User fetched.");
  return res.status(response.statusCode).json(response);
});
