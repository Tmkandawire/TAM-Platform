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
  pendingQuerySchema,
} from "../dto/adminDocumentDto.js";

const router = express.Router();

/* GLOBAL ADMIN GUARD */
router.use(protect);
router.use(authorize("admin"));

/* QUEUE */
router.get(
  "/pending",
  adminRateLimiter,
  validate(pendingQuerySchema, "query"),
  getPendingDocuments,
);

/* ACTIONS */
router.patch(
  "/:userId/:docId/approve",
  adminRateLimiter,
  validate(approveDocumentSchema),
  approveDocument,
);

router.patch(
  "/:userId/:docId/reject",
  adminRateLimiter,
  validate(rejectDocumentSchema),
  rejectDocument,
);

export default router;
