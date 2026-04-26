import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";
import { adminRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";

import {
  getPendingDocuments,
  approveDocument,
  rejectDocument,
} from "../controllers/adminDocumentController.js";

import {
  approveDocumentSchema,
  rejectDocumentSchema,
} from "../dto/adminDocumentDto.js";

const router = express.Router();

/* -------------------------
   GLOBAL MIDDLEWARE (ADMIN ONLY)
------------------------- */
router.use(protect);
router.use(authorize("admin"));

/* -------------------------
   ROUTES
------------------------- */

/**
 * @route   GET /api/v1/admin/documents/pending
 * @desc    Get all profiles with documents waiting for review
 */
router.get(
  "/pending",
  adminRateLimiter, // 🔒 prevent dashboard abuse
  getPendingDocuments,
);

/**
 * @route   PATCH /api/v1/admin/documents/:userId/:docId/approve
 */
router.patch(
  "/:userId/:docId/approve",
  adminRateLimiter,
  validate(approveDocumentSchema), // ✅ move validation out of controller
  approveDocument,
);

/**
 * @route   PATCH /api/v1/admin/documents/:userId/:docId/reject
 */
router.patch(
  "/:userId/:docId/reject",
  adminRateLimiter,
  validate(rejectDocumentSchema), // ✅ enforce reason properly
  rejectDocument,
);

export default router;
