import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize, atLeastRole } from "../middleware/authorize.js";
import { ROLES } from "../constants/roles.js";
import { adminActionLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";

import {
  getPendingDocuments,
  approveDocument,
  rejectDocument,
  bulkReviewDocuments,
  requestResubmission,
} from "../controllers/adminDocumentController.js";

import {
  approveDocumentSchema,
  rejectDocumentSchema,
  requestResubmissionSchema,
  pendingQuerySchema,
} from "../dto/adminDocumentDto.js";

const router = express.Router();

/* GLOBAL ADMIN GUARD */
router.use(protect);
router.use(atLeastRole(ROLES.ADMIN));

/* QUEUE
 * Mounted at /admin/documents in routes/index.js.
 * Frontend calls GET /admin/documents — so the queue handler lives at /
 * not /pending. /pending would make the full path /admin/documents/pending
 * which no frontend call uses.
 */
router.get(
  "/",
  adminActionLimiter,
  validate(pendingQuerySchema, "query"),
  getPendingDocuments,
);

/* ACTIONS */
router.patch("/:userId/:docId/approve", adminActionLimiter, approveDocument);

router.patch("/:userId/:docId/reject", adminActionLimiter, rejectDocument);

router.patch(
  "/:userId/:docId/request-resubmission",
  adminActionLimiter,
  requestResubmission,
);

/* BULK */
router.post("/bulk-review", adminActionLimiter, bulkReviewDocuments);

export default router;
