/**
 * @file controllers/notificationController.js
 * @module controllers
 *
 * FIX: Added .toString() on req.user.id throughout.
 *
 * Root cause of the 500 on /unread-count:
 * req.user.id may be a Mongoose ObjectId object depending on how the
 * JWT payload was set and how the protect middleware attaches the user.
 * NotificationRepository.assertValidObjectId() guards with:
 *   typeof value !== "string"
 * A Mongoose ObjectId is typeof "object", so it throws a TypeError
 * which asyncHandler catches and passes to the error middleware as a 500.
 *
 * .toString() is safe on both plain strings and ObjectId instances,
 * so this fix has no downside and makes the controller defensive against
 * whatever shape protect() puts on req.user.id.
 */

import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import notificationService from "../services/NotificationService.js";

/**
 * @desc    Get authenticated member's notification feed (paginated)
 * @route   GET /api/v1/notifications
 * @access  Private — member
 *
 * req.query is validated and coerced by validateQuery(notificationQuerySchema)
 * before this handler runs — page and limit are already numbers, status is
 * already a valid NOTIFICATION_STATUS string or undefined.
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();

  const options = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
  };

  const notifications = await notificationService.getUserNotifications(
    userId,
    options,
  );

  const arr = Array.isArray(notifications) ? notifications : [];
  const limit = options.limit ?? 20;
  const result = {
    notifications: arr,
    total: arr.length,
    pages: Math.max(1, Math.ceil(arr.length / limit)),
  };

  const response = ApiResponse.ok(result, "Notifications retrieved.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Get unread notification count for the badge in the topbar
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private — member
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();

  const count = await notificationService.getUnreadCount(userId);

  const response = ApiResponse.ok({ count }, "Unread count retrieved.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Mark all unread notifications as read
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Private — member
 */
export const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();

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
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();
  const { id } = req.params;

  await notificationService.markAsRead(id, userId);

  const response = ApiResponse.ok(null, "Notification marked as read.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Archive a single notification
 * @route   PATCH /api/v1/notifications/:id/archive
 * @access  Private — member
 */
export const archiveNotification = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();
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
  const userId = req.user.id.toString();

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
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();
  const { id } = req.params;

  await notificationService.deleteNotification(id, userId);

  const response = ApiResponse.ok(null, "Notification deleted.");
  return res.status(response.statusCode).json(response);
});
