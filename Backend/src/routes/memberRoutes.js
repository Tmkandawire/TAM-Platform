import express from "express";
import {
  upsertProfile,
  getMyProfile,
  updateProfile,
  getDirectory,
  submitForVerification,
  uploadDocs, // ✅ Match the name in memberController.js
} from "../controllers/memberController.js";

import { profileSchema, updateProfileSchema } from "../dto/memberDto.js";

// Middlewares
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";

const router = express.Router();

/**
 * @route   GET /api/v1/members/directory
 */
router.get("/directory", getDirectory);

/**
 * @route   GET /api/v1/members/me
 */
router.get("/me", protect, getMyProfile);

/**
 * @route   POST /api/v1/members/profile
 */
router.post("/profile", protect, validate(profileSchema), upsertProfile);

/**
 * @route   PATCH /api/v1/members/profile
 */
router.patch("/profile", protect, validate(updateProfileSchema), updateProfile);

/**
 * @route   POST /api/v1/members/submit
 */
router.post("/submit", protect, authRateLimiter, submitForVerification);

export default router;
