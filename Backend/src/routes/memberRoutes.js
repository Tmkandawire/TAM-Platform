import express from "express";
import {
  upsertProfile,
  getMyProfile,
  updateProfile,
  getDirectory,
  submitForVerification,
} from "../controllers/memberController.js";
import { profileSchema, updateProfileSchema } from "../dto/memberDto.js";

// Middlewares
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";

const router = express.Router();

/**
 * @route   GET /api/v1/members/directory
 * @desc    Public directory of all approved transporters
 * @access  Public
 */
router.get("/directory", getDirectory);

/**
 * @route   GET /api/v1/members/me
 * @desc    Get current member's own profile
 * @access  Private
 */
router.get("/me", protect, getMyProfile);

/**
 * @route   POST /api/v1/members/profile
 * @desc    Initial profile setup
 * @access  Private
 */
router.post("/profile", protect, validate(profileSchema), upsertProfile);

/**
 * @route   PATCH /api/v1/members/profile
 * @desc    Update specific profile fields
 * @access  Private
 */
router.patch("/profile", protect, validate(updateProfileSchema), updateProfile);

/**
 * @route   POST /api/v1/members/submit
 * @desc    Flag profile as ready for TAM admin review
 * @access  Private (Rate-limited to prevent spam)
 */
router.post("/submit", protect, authRateLimiter, submitForVerification);

export default router;
