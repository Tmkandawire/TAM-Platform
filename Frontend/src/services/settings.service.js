/**
 * @file services/settings.service.js
 * @module services
 *
 * Settings API service — all calls to /api/v1/settings/* endpoints.
 *
 * Returns raw Axios promises (envelope intact) so React Query hooks unwrap
 * the `.data` field themselves — consistent with member.service.js.
 *
 * Endpoints covered:
 *  GET    /settings/notification-preferences → current member's prefs
 *  PATCH  /settings/profile                  → update contactPerson / phoneNumber
 *  PATCH  /settings/password                 → change password (requires current)
 *  PATCH  /settings/notification-preferences → update one or more pref toggles
 *
 * Query keys:
 *  All React Query keys for settings data are defined here so every hook
 *  and page that touches settings cache imports from one source of truth.
 */

import api from "./api.js";

// ─── Query keys ───────────────────────────────────────────────────────────────

/**
 * React Query cache keys for all settings data.
 *
 * Usage:
 *   useQuery({ queryKey: SETTINGS_QUERY_KEYS.notificationPrefs })
 *   queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.all })
 */
export const SETTINGS_QUERY_KEYS = Object.freeze({
  /** Invalidates every settings cache entry. */
  all: Object.freeze(["settings"]),

  /**
   * Notification preferences — the only settings query that fetches data.
   * Password and account detail mutations have no associated GET.
   */
  notificationPrefs: Object.freeze(["settings", "notification-preferences"]),
});

// ─── Type definitions (JSDoc) ────────────────────────────────────────────────

/**
 * @typedef {Object} NotificationPreferences
 * @property {boolean} documentUpdates  In-app alerts for document approved/rejected.
 * @property {boolean} accountAlerts    In-app alerts for account status changes.
 * @property {boolean} broadcasts       In-app TAM broadcast notices.
 */

/**
 * @typedef {Object} UpdateAccountDetailsPayload
 * @property {string} [contactPerson]  Display name / contact person. Min 2, max 100 chars.
 * @property {string} [phoneNumber]    E.164-style phone. 7–15 digits, optional leading +.
 */

/**
 * @typedef {Object} ChangePasswordPayload
 * @property {string} currentPassword    Must match stored hash (backend enforces).
 * @property {string} newPassword        Min 8 chars, upper + lower + digit required.
 * @property {string} confirmNewPassword Must equal newPassword (DTO enforces).
 */

// ─── Service ──────────────────────────────────────────────────────────────────

const settingsService = {
  /**
   * Fetch the current member's notification preferences.
   *
   * Response is merged over backend defaults — all three fields are always
   * present even for accounts that predate the preferences field.
   *
   * @route  GET /api/v1/settings/notification-preferences
   * @access Private — member only
   *
   * @returns {Promise<ApiResponse<{ notificationPreferences: NotificationPreferences }>>}
   */
  getNotificationPrefs: () => api.get("/settings/notification-preferences"),

  /**
   * Update contactPerson and/or phoneNumber on the member's profile.
   *
   * At least one field must be present (DTO enforces).
   * Blocked with 403 if the profile has been approved.
   *
   * @route  PATCH /api/v1/settings/profile
   * @access Private — member only
   *
   * @param {UpdateAccountDetailsPayload} payload
   * @returns {Promise<ApiResponse<{ contactPerson: string, phoneNumber: string }>>}
   */
  updateAccountDetails: (payload) => api.patch("/settings/profile", payload),

  /**
   * Change the member's password.
   *
   * currentPassword is required for identity confirmation — the backend
   * calls bcrypt.compare before accepting the change. On success the auth
   * cookie remains valid (no session rotation currently).
   *
   * @route  PATCH /api/v1/settings/password
   * @access Private — member only
   *
   * @param {ChangePasswordPayload} payload
   * @returns {Promise<ApiResponse<void>>}
   */
  changePassword: (payload) => api.patch("/settings/password", payload),

  /**
   * Update one or more notification preference toggles.
   *
   * Partial updates are supported — send only the fields that changed.
   * The backend merges onto the existing subdocument; unset fields are
   * preserved. At least one field must be present (DTO enforces).
   *
   * @route  PATCH /api/v1/settings/notification-preferences
   * @access Private — member only
   *
   * @param {Partial<NotificationPreferences>} payload
   * @returns {Promise<ApiResponse<{ notificationPreferences: NotificationPreferences }>>}
   */
  updateNotificationPrefs: (payload) =>
    api.patch("/settings/notification-preferences", payload),
};

export default settingsService;
