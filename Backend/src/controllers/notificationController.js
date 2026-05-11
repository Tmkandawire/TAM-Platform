/**
 * @file controllers/notificationController.js
 * @module controllers
 *
 * HTTP controller for member notification operations.
 *
 * Route summary (all prefixed /api/v1/notifications):
 * ─────────────────────────────────────────────────────────────
 *  GET    /              → getMyNotifications   (paginated feed)
 *  GET    /unread-count  → getUnreadCount       (badge count)
 *  PATCH  /read-all      → markAllAsRead        (bulk)
 *  PATCH  /:id/read      → markAsRead           (single)
 *  PATCH  /:id/archive   → archiveNotification  (single)
 *  DELETE /              → deleteAllNotifications (bulk)
 *  DELETE /:id           → deleteNotification   (single)
 *
 * Design decisions
 * ─────────────────────────────────────────────────────────────
 *  • All operations are scoped to req.user.id — members can only
 *    touch their own notifications. No admin override in this controller.
 *  • Ownership-sensitive single-resource operations (markAsRead,
 *    archiveNotification, deleteNotification) pass userId explicitly
 *    alongside the notification id so the service and repository can
 *    scope queries to { _id: id, user: userId }. A member guessing a
 *    valid ObjectId cannot operate on another member's notification.
 *  • NotificationService owns all business logic and validation.
 *    This controller only extracts HTTP inputs, delegates, and formats
 *    the ApiResponse.
 *  • Query params and :id params are validated and sanitised by
 *    notificationQuerySchema / notificationParamsSchema in the route
 *    layer before any handler runs. No manual coercion needed here.
 *  • NOTIFICATION_STATUS import removed — status enum validation now
 *    owned entirely by notificationDto.js at the route boundary.
 */

import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import notificationService from "../services/NotificationService.js";

/**
 * @desc    Get authenticated member's notification feed (paginated)
 * @route   GET /api/v1/notifications
 * @access  Private — member
 *
 * req.query is validated and coerced by notificationQuerySchema before
 * this handler runs — page and limit are already numbers, status is
 * already a valid NOTIFICATION_STATUS string or undefined.
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const options = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
  };

  const result = await notificationService.getUserNotifications(
    userId,
    options,
  );

  const response = ApiResponse.ok(result, "Notifications retrieved.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Get unread notification count for the badge in the topbar
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private — member
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await notificationService.getUnreadCount(userId);

  const response = ApiResponse.ok({ count }, "Unread count retrieved.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Mark all unread notifications as read
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Private — member
 *
 * Declared before /:id/read in the router to prevent "read-all" being
 * captured as an :id param.
 */
export const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const updatedCount = await notificationService.markAllAsRead(userId);

  const response = ApiResponse.ok(
    { updatedCount },
    `${updatedCount} notification(s) marked as read.`,
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/v1/notifications/:id/read
 * @access  Private — member
 *
 * req.params.id is validated as a 24-char hex ObjectId by
 * notificationParamsSchema before this handler runs.
 *
 * userId is passed explicitly so the service and repository scope the
 * update to { _id: id, user: userId } — a member cannot mark another
 * member's notification as read by guessing a valid ObjectId.
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await notificationService.markAsRead(id, userId);

  const response = ApiResponse.ok(null, "Notification marked as read.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Archive a single notification (soft-hide from feed)
 * @route   PATCH /api/v1/notifications/:id/archive
 * @access  Private — member
 *
 * req.params.id is validated as a 24-char hex ObjectId by
 * notificationParamsSchema before this handler runs.
 *
 * userId is passed explicitly — prevents cross-member archival.
 */
export const archiveNotification = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await notificationService.archiveNotification(id, userId);

  const response = ApiResponse.ok(null, "Notification archived.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Delete all notifications for the authenticated member
 * @route   DELETE /api/v1/notifications
 * @access  Private — member
 */
export const deleteAllNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const deletedCount =
    await notificationService.deleteAllUserNotifications(userId);

  const response = ApiResponse.ok(
    { deletedCount },
    `${deletedCount} notification(s) deleted.`,
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Delete a single notification
 * @route   DELETE /api/v1/notifications/:id
 * @access  Private — member
 *
 * req.params.id is validated as a 24-char hex ObjectId by
 * notificationParamsSchema before this handler runs.
 *
 * userId is passed explicitly — prevents cross-member deletion.
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await notificationService.deleteNotification(id, userId);

  const response = ApiResponse.ok(null, "Notification deleted.");
  return res.status(response.statusCode).json(response);
});
