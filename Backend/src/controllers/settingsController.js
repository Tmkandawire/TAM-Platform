/**
 * @file controllers/settingsController.js
 * @module controllers
 *
 * HTTP orchestration layer for the member settings API.
 *
 * Route summary (all prefixed /api/v1/settings):
 * ─────────────────────────────────────────────────────────────
 *  GET    /notification-preferences → getNotificationPrefs
 *  PATCH  /profile                  → updateAccountDetails
 *  PATCH  /password                 → changePassword
 *  PATCH  /notification-preferences → updateNotificationPrefs
 *
 * Design decisions
 * ─────────────────────────────────────────────────────────────
 *  • asyncHandler wraps every handler — consistent with authController,
 *    memberController, notificationController across this project.
 *  • ApiResponse.ok() formats all responses — consistent envelope shape.
 *  • SettingsService owns all business rules (approval lock, password
 *    identity check, preference merging). This controller only extracts
 *    HTTP inputs, delegates, and formats the response.
 *  • All input validation lives in settingsDto.js, enforced by
 *    validate() middleware at the route boundary — no manual coercion here.
 *  • changePassword passes req context (ip, userAgent) to the service
 *    so audit logs capture the request origin without the service
 *    needing to know about HTTP.
 */

import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import settingsService from "../services/SettingsService.js";

/* ─────────────────────────────────────────────
   GET /settings/notification-preferences
───────────────────────────────────────────── */

/**
 * @desc    Get the authenticated member's notification preferences
 * @route   GET /api/v1/settings/notification-preferences
 * @access  Private — member only
 */
export const getNotificationPrefs = asyncHandler(async (req, res) => {
  const notificationPreferences = await settingsService.getNotificationPrefs(
    req.user.id,
  );

  const response = ApiResponse.ok(
    { notificationPreferences },
    "Notification preferences retrieved successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/* ─────────────────────────────────────────────
   PATCH /settings/profile
───────────────────────────────────────────── */

/**
 * @desc    Update contactPerson and/or phoneNumber on the member's profile
 * @route   PATCH /api/v1/settings/profile
 * @access  Private — member only
 *
 * Blocked with 403 if profile.isApproved — enforced in SettingsService.
 * req.body is validated and sanitised by updateAccountDetailsSchema before
 * this handler runs.
 */
export const updateAccountDetails = asyncHandler(async (req, res) => {
  const { contactPerson, phoneNumber } = req.body;

  const updated = await settingsService.updateAccountDetails(req.user.id, {
    contactPerson,
    phoneNumber,
  });

  const response = ApiResponse.ok(
    updated,
    "Account details updated successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/* ─────────────────────────────────────────────
   PATCH /settings/password
───────────────────────────────────────────── */

/**
 * @desc    Change the authenticated member's password
 * @route   PATCH /api/v1/settings/password
 * @access  Private — member only
 *
 * currentPassword is required for identity confirmation — the service
 * calls matchPassword() and throws 401 if it fails.
 * confirmNewPassword is validated by the DTO (cross-field refinement)
 * and is not forwarded to the service — it serves only as a UI safety net.
 * req.body is validated and sanitised by changePasswordSchema before
 * this handler runs.
 *
 * Request context (ip, userAgent) is forwarded so the service can write
 * audit log entries with the correct origin without accessing req directly.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await settingsService.changePassword(
    req.user.id,
    currentPassword,
    newPassword,
    {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  );

  const response = ApiResponse.ok(null, "Password updated successfully.");
  return res.status(response.statusCode).json(response);
});

/* ─────────────────────────────────────────────
   PATCH /settings/notification-preferences
───────────────────────────────────────────── */

/**
 * @desc    Update one or more notification preference toggles
 * @route   PATCH /api/v1/settings/notification-preferences
 * @access  Private — member only
 *
 * Partial updates are supported — only the fields present in req.body
 * are written. Unset fields retain their current values (merge semantics,
 * not replace). The service uses dot-notation $set to ensure this.
 * req.body is validated and sanitised by updateNotificationPrefsSchema
 * before this handler runs.
 */
export const updateNotificationPrefs = asyncHandler(async (req, res) => {
  const { documentUpdates, accountAlerts, broadcasts } = req.body;

  const notificationPreferences = await settingsService.updateNotificationPrefs(
    req.user.id,
    { documentUpdates, accountAlerts, broadcasts },
  );

  const response = ApiResponse.ok(
    { notificationPreferences },
    "Notification preferences updated successfully.",
  );
  return res.status(response.statusCode).json(response);
});
