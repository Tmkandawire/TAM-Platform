/**
 * @file routes/notificationRoutes.js
 * @module routes
 *
 * Express router for member notification endpoints.
 *
 * All routes are mounted at /api/v1/notifications (see app.js / index.js).
 * All routes require authentication via the protect middleware.
 * All routes are member-scoped — operations are restricted to req.user.id.
 *
 * Validation middleware:
 *  • notificationQuerySchema  — sanitises and coerces GET / query params
 *    (page, limit, status) before they reach the controller.
 *  • notificationParamsSchema — validates :id is a 24-char hex ObjectId
 *    on every parameterised route, preventing Mongoose CastErrors from
 *    surfacing as unhandled 500s on malformed requests.
 *
 * Route declaration order matters:
 *  • /unread-count and /read-all are declared before /:id/* to prevent
 *    the literal strings "unread-count" and "read-all" being captured
 *    as :id param values.
 *  • DELETE / (deleteAllNotifications) is declared before DELETE /:id
 *    for the same reason.
 */

import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import {
  notificationQuerySchema,
  notificationParamsSchema,
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
router.get("/", validate(notificationQuerySchema), getMyNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.delete("/", deleteAllNotifications);

/* ── Parameterised routes ────────────────────────────────────────────────── */
router.patch("/:id/read", validate(notificationParamsSchema), markAsRead);
router.patch(
  "/:id/archive",
  validate(notificationParamsSchema),
  archiveNotification,
);
router.delete("/:id", validate(notificationParamsSchema), deleteNotification);

export default router;
