import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize, atLeastRole } from "../middleware/authorize.js";
import { ROLES } from "../constants/roles.js";
import { adminActionLimiter } from "../middleware/rateLimitMiddleware.js";

import {
  getAuditLogs,
  getAuditLogById,
} from "../controllers/auditController.js";

const router = Router();

/* GLOBAL ADMIN GUARD */
router.use(protect);
router.use(atLeastRole(ROLES.ADMIN));

/* AUDIT LOGS */
router.get("/", adminActionLimiter, getAuditLogs);
router.get("/:id", adminActionLimiter, getAuditLogById);

export default router;
