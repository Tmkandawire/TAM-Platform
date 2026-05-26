import express from "express";
import {
  upsertProfile,
  getMyProfile,
  updateProfile,
  getDirectory,
  submitForVerification,
  uploadDocs,
} from "../controllers/memberController.js";

import { profileSchema, updateProfileSchema } from "../dto/memberDto.js";

// Middlewares
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import {
  uploadRateLimiter,
  globalLimiter,
} from "../middleware/rateLimitMiddleware.js";
import {
  cloudinaryUpload,
  postUploadValidation,
} from "../middleware/cloudinaryUploadMiddleware.js";
import csrfProtection from "../middleware/csrfMiddleware.js";

import { profilePictureUpload } from "../middleware/profilePictureUploadMiddleware.js";

import {
  updateProfilePicture,
  removeProfilePicture,
} from "../controllers/memberController.js";

const router = express.Router();

/**
 * @route   GET /api/v1/members/directory
 */
router.get("/directory", globalLimiter, getDirectory);

/**
 * @route   GET /api/v1/members/me
 */
router.get("/me", protect, getMyProfile);

/**
 * @route   POST /api/v1/members/profile
 */
router.post(
  "/profile",
  protect,
  csrfProtection,
  validate(profileSchema),
  upsertProfile,
);

/**
 * @route   PATCH /api/v1/members/profile
 */
router.patch(
  "/profile",
  protect,
  csrfProtection,
  validate(updateProfileSchema),
  updateProfile,
);

/**
 * @route   POST /api/v1/members/submit
 */
router.post(
  "/submit",
  protect,
  csrfProtection,
  authRateLimiter,
  submitForVerification,
);

/**
 * @route   POST /api/v1/members/documents
 */
router.post(
  "/documents",
  protect,
  csrfProtection,
  uploadRateLimiter,
  cloudinaryUpload,
  postUploadValidation,
  uploadDocs,
);

/**
 * @route   POST /api/v1/members/profile/picture
 */
router.post(
  "/profile/picture",
  protect,
  csrfProtection,
  uploadRateLimiter,
  profilePictureUpload,
  updateProfilePicture,
);

/**
 * @route   DELETE /api/v1/members/profile/picture
 */
router.delete(
  "/profile/picture",
  protect,
  csrfProtection,
  removeProfilePicture,
);

export default router;
