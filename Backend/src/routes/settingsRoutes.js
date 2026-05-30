/**
 * @file routes/settingsRoutes.js
 * @description Member settings routes.
 *
 * All routes are behind the protect middleware — unauthenticated requests
 * are rejected before reaching any controller or DTO.
 *
 * Static segments (/notification-preferences) are declared before param
 * routes to prevent Express param capture — consistent with notificationRoutes.js.
 *
 * Manual update required:
 *   app.js → app.use("/api/v1/settings", settingsRoutes)
 */

import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import {
  updateAccountDetailsSchema,
  changePasswordSchema,
  updateNotificationPrefsSchema,
} from "../dto/settingsDto.js";
import {
  getNotificationPrefs,
  updateAccountDetails,
  changePassword,
  updateNotificationPrefs,
} from "../controllers/settingsController.js";

const router = Router();

// All settings routes require authentication.
router.use(protect);

// ── Account details ──────────────────────────────────────────────────────────
router.patch(
  "/profile",
  validate(updateAccountDetailsSchema),
  updateAccountDetails,
);

// ── Password ─────────────────────────────────────────────────────────────────
router.patch("/password", validate(changePasswordSchema), changePassword);

// ── Notification preferences ──────────────────────────────────────────────────
router
  .route("/notification-preferences")
  .get(getNotificationPrefs)
  .patch(validate(updateNotificationPrefsSchema), updateNotificationPrefs);

export default router;
