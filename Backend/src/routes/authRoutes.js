/**
 * @file routes/authRoutes.js
 *
 * Route definitions for authentication endpoints.
 * ─────────────────────────────────────────────────────────────
 *  1. /refresh uses refreshLimiter (separate bucket, 15-min window) so
 *     refresh retries don't consume the login/register quota.
 *
 *  2. /logout has no protect middleware — access token may be expired at
 *     logout time. authService.logout() reads req.cookies.refreshToken
 *     directly and clears cookies regardless of token validity.
 *
 *  3. CSRF skipCsrf pattern preserved on register/login/refresh — these
 *     are cookie-setting endpoints that need the CSRF middleware to run
 *     but skip the token check on the first request.
 *
 *  4. /onboarding/complete — multipart/form-data endpoint that accepts
 *     profile fields + document files in a single request. Requires
 *     protect (pending users explicitly allowed through per authMiddleware)
 *     and the full document upload pipeline:
 *       cloudinaryUpload → postUploadValidation → transformDocuments
 *     No validate() middleware — profile field validation is delegated
 *     to memberService.createProfile which has its own typed error layer.
 */

import express from "express";
import {
  register,
  login,
  refresh,
  logout,
  me,
  completeOnboarding,
} from "../controllers/authController.js";

import {
  authRateLimiter,
  refreshLimiter,
  uploadRateLimiter,
} from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { registerSchema, loginSchema } from "../dto/authDto.js";
import { protect } from "../middleware/authMiddleware.js";
import csrfProtection from "../middleware/csrfMiddleware.js";
import {
  cloudinaryUpload,
  postUploadValidation,
} from "../middleware/cloudinaryUploadMiddleware.js";
import { transformDocuments } from "../middleware/documentTransformMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 *
 * Creates the user account and opens a session immediately.
 * Returns auth cookies so the frontend redirects to /onboarding
 * already authenticated — no separate login step needed.
 */
router.post(
  "/register",
  authRateLimiter,
  (req, _res, next) => {
    req.skipCsrf = true;
    next();
  },
  csrfProtection,
  validate(registerSchema),
  register,
);

/**
 * @route   POST /api/v1/auth/login
 */
router.post(
  "/login",
  authRateLimiter,
  (req, _res, next) => {
    req.skipCsrf = true;
    next();
  },
  csrfProtection,
  validate(loginSchema),
  login,
);

/**
 * @route   POST /api/v1/auth/refresh
 *
 * Uses refreshLimiter — separate bucket so refresh retries don't
 * exhaust the login/register auth quota.
 */
router.post(
  "/refresh",
  refreshLimiter,
  (req, _res, next) => {
    req.skipCsrf = true;
    next();
  },
  csrfProtection,
  refresh,
);

/**
 * @route   POST /api/v1/auth/logout
 *
 * NO protect — access token may be expired at logout time.
 * NO csrfProtection — cookie clearing only reduces privileges.
 */
router.post("/logout", authRateLimiter, logout);

/**
 * @route   GET /api/v1/auth/me
 */
router.get("/me", protect, csrfProtection, me);

/**
 * @route   POST /api/v1/auth/onboarding/complete
 *
 * Accepts multipart/form-data with profile fields + document files.
 * Creates the member profile and uploads KYC documents in sequence.
 *
 * Middleware chain:
 *  1. protect           — validates access token; pending users allowed through
 *  2. csrfProtection    — CSRF token validation for state-changing request
 *  3. uploadRateLimiter — per-user upload throttle (separate from auth quota)
 *  4. cloudinaryUpload  — field name, MIME type, extension validation + upload
 *  5. postUploadValidation — magic byte check + virus scan hook
 *  6. transformDocuments   — normalizes req.files → req.normalizedDocs
 *  7. completeOnboarding   — creates profile, saves documents, returns profile
 *
 * On success: profile created, documents saved with status "pending",
 * user status remains "pending" until admin approves.
 */
router.post(
  "/onboarding/complete",
  protect,
  csrfProtection,
  uploadRateLimiter,
  cloudinaryUpload,
  postUploadValidation,
  transformDocuments,
  completeOnboarding,
);

export default router;
