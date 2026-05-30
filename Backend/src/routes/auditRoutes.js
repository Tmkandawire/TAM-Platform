import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";
import { adminActionLimiter } from "../middleware/rateLimitMiddleware.js";

import {
  getAuditLogs,
  getAuditLogById,
} from "../controllers/auditController.js";

const router = Router();

/* GLOBAL ADMIN GUARD */
router.use(protect);
router.use(authorize("admin"));

/* AUDIT LOGS */
router.get("/", adminActionLimiter, getAuditLogs);
router.get("/:id", adminActionLimiter, getAuditLogById);

export default router;
