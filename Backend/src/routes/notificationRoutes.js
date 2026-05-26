/**
 * @file routes/notificationRoutes.js
 * @module routes
 *
 * FIX: Replaced validate() with validateQuery() on the GET feed route
 * and validateParams() on all /:id routes.
 *
 * Root cause: the shared validate() middleware calls safeParse(req.body).
 * GET requests have no body — query params live in req.query and params
 * in req.params. validate() was silently passing an empty object to Zod,
 * so page/limit/status were never coerced and the controller received
 * raw strings. This caused the 400 on the feed and made pagination break.
 *
 * validateQuery() and validateParams() are defined in notificationDto.js
 * alongside the schemas they validate — keeping the validation logic and
 * its middleware in the same file.
 */

import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  notificationQuerySchema,
  notificationParamsSchema,
  validateQuery,
  validateParams,
} from "../dto/notificationDto.js";
import {
  getMyNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  archiveNotification,
  deleteAllNotifications,
  deleteNotification,
} from "../controllers/notificationController.js";

const router = Router();

/* ── Auth guard — applies to every route in this file ───────────────────── */
router.use(protect);

/* ── Static-segment routes (must precede /:id routes) ───────────────────── */

// GET /  — validateQuery coerces req.query (page, limit, status strings → typed values)
router.get("/", validateQuery(notificationQuerySchema), getMyNotifications);

// No query params to validate on these
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.delete("/", deleteAllNotifications);

/* ── Parameterised routes ────────────────────────────────────────────────── */

// validateParams validates req.params.id as a 24-char hex ObjectId
router.patch("/:id/read", validateParams(notificationParamsSchema), markAsRead);
router.patch(
  "/:id/archive",
  validateParams(notificationParamsSchema),
  archiveNotification,
);
router.delete(
  "/:id",
  validateParams(notificationParamsSchema),
  deleteNotification,
);

export default router;
