import express from "express";
import {
  register,
  login,
  refresh,
  logout,
  me,
} from "../controllers/authController.js";

import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { registerSchema, loginSchema } from "../dto/authDto.js";
import { protect } from "../middleware/authMiddleware.js";
import csrfProtection from "../middleware/csrfMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 */
router.post(
  "/register",
  authRateLimiter,
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
  csrfProtection,
  validate(loginSchema),
  login,
);

/**
 * @route   POST /api/v1/auth/refresh
 */

router.post("/refresh", authRateLimiter, csrfProtection, refresh);

/**
 * @route   POST /api/v1/auth/logout
 */
router.post("/logout", protect, csrfProtection, logout);

/**
 * @route   GET /api/v1/auth/me
 */
router.get("/me", protect, csrfProtection, me);

export default router;
