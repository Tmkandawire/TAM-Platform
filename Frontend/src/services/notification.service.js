/**
 * @file services/notification.service.js
 * @module services
 *
 * Notification API service — all calls to /api/v1/notifications/* endpoints.
 *
 * Returns raw Axios promises (envelope intact) so React Query hooks unwrap
 * the `.data` field themselves — consistent with member.service.js.
 *
 * Endpoints covered:
 *  GET    /notifications              → paginated feed (status filter)
 *  GET    /notifications/unread-count → live badge count
 *  PATCH  /notifications/:id/read     → mark single notification read
 *  PATCH  /notifications/read-all     → mark all unread → read
 *  PATCH  /notifications/:id/archive  → archive single notification
 *  DELETE /notifications/:id          → delete single notification
 *  DELETE /notifications              → bulk-delete all archived notifications
 *
 * Query keys:
 *  All React Query keys for notification data are defined here so every hook
 *  and page that touches notification cache imports from one source of truth.
 *  This prevents silent cache misses from key drift across files.
 *
 * Ownership:
 *  Every mutation is user-scoped on the backend (controller passes userId to
 *  the service + repository). The frontend never passes a userId — the server
 *  reads it from req.user.id set by the protect middleware.
 */

import api from "./api.js";

// ─── Notification domain constants ────────────────────────────────────────────

/**
 * Mirrors NOTIFICATION_STATUS from constants/notificationTypes.js.
 *
 * Defined here so UI components can import a single value and compare
 * against it directly — no magic strings, no import from a backend file.
 *
 * @example
 *   import { NOTIFICATION_STATUS } from "./notification.service.js";
 *   if (notification.status === NOTIFICATION_STATUS.UNREAD) { ... }
 */
export const NOTIFICATION_STATUS = Object.freeze({
  UNREAD: "UNREAD",
  READ: "READ",
  ARCHIVED: "ARCHIVED",
});

/**
 * Mirrors NOTIFICATION_TYPE from constants/notificationTypes.js.
 *
 * Used by NotificationsPage to render type-specific icons/colours without
 * scattering raw strings across component files.
 */
export const NOTIFICATION_TYPE = Object.freeze({
  DOCUMENT_APPROVED: "DOCUMENT_APPROVED",
  DOCUMENT_REJECTED: "DOCUMENT_REJECTED",
  ACCOUNT_ACTION: "ACCOUNT_ACTION",
  BROADCAST: "BROADCAST",
});

/**
 * Valid client-side transitions for the notification state machine.
 *
 * Mirrors the ALLOWED_TRANSITIONS map enforced by the Notification model's
 * pre-save hook on the backend. The frontend uses this to guard mutation
 * calls before they hit the network — avoiding a round-trip that will
 * always fail (e.g. trying to mark an ARCHIVED notification as read).
 *
 * Shape: { [fromStatus]: Set<toStatus> }
 *
 * Rules (backend-authoritative, frontend mirrors for UX guard only):
 *   UNREAD   → READ, ARCHIVED
 *   READ     → ARCHIVED
 *   ARCHIVED → (terminal — no outbound transitions)
 *
 * @type {Readonly<Record<NotificationStatus, ReadonlySet<NotificationStatus>>>}
 *
 * @example
 *   if (!NOTIFICATION_TRANSITIONS[notification.status].has(NOTIFICATION_STATUS.READ)) {
 *     return; // skip — backend would reject this anyway
 *   }
 *   markAsReadMutation.mutate(notification._id);
 */
export const NOTIFICATION_TRANSITIONS = Object.freeze({
  [NOTIFICATION_STATUS.UNREAD]: Object.freeze(
    new Set([NOTIFICATION_STATUS.READ, NOTIFICATION_STATUS.ARCHIVED]),
  ),
  [NOTIFICATION_STATUS.READ]: Object.freeze(
    new Set([NOTIFICATION_STATUS.ARCHIVED]),
  ),
  [NOTIFICATION_STATUS.ARCHIVED]: Object.freeze(new Set()),
});

/**
 * Guard helper — returns true if the transition from → to is permitted.
 *
 * @param {NotificationStatus} from  Current status of the notification.
 * @param {NotificationStatus} to    Desired new status.
 * @returns {boolean}
 *
 * @example
 *   canTransition(notification.status, NOTIFICATION_STATUS.READ) // true/false
 */
export function canTransition(from, to) {
  return NOTIFICATION_TRANSITIONS[from]?.has(to) ?? false;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

/**
 * React Query cache keys for all notification data.
 *
 * Usage:
 *   useQuery({ queryKey: NOTIFICATION_QUERY_KEYS.feed() })
 *   useQuery({ queryKey: NOTIFICATION_QUERY_KEYS.feed({ status: "UNREAD", page: 2 }) })
 *   useQuery({ queryKey: NOTIFICATION_QUERY_KEYS.unreadCount })
 *   queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all })
 */
export const NOTIFICATION_QUERY_KEYS = Object.freeze({
  /** Invalidates every notification cache entry — use after bulk mutations. */
  all: Object.freeze(["notifications"]),

  /**
   * Paginated notification feed.
   * Pass params to scope to a specific page/status slice.
   * Omit params to get the broad feed key (invalidates all pages).
   *
   * Note: the arrays returned by feed() are not frozen because React Query
   * performs internal mutations on query key arrays during reconciliation.
   * The factory itself is frozen — individual key instances are transient.
   *
   * @param {{ page?: number, limit?: number, status?: NotificationStatus }} [params]
   * @returns {unknown[]}
   */
  feed: (params) =>
    params ? ["notifications", "feed", params] : ["notifications", "feed"],

  /**
   * Unread badge count — kept separate from the feed so the topbar
   * can subscribe independently without triggering a full feed refetch.
   */
  unreadCount: Object.freeze(["notifications", "unread-count"]),
});

// ─── Type definitions (JSDoc) ────────────────────────────────────────────────

/**
 * @typedef {keyof typeof NOTIFICATION_STATUS} NotificationStatus
 * Derive from the exported constant — no string duplication.
 */

/**
 * @typedef {keyof typeof NOTIFICATION_TYPE} NotificationType
 * Derive from the exported constant — no string duplication.
 */

/**
 * @typedef {Object} NotificationFeedParams
 * @property {number}             [page=1]   1-indexed page number.
 * @property {number}             [limit=20] Items per page. Backend max: 50.
 * @property {NotificationStatus} [status]   Filter by status. Omit for all statuses.
 */

/**
 * @typedef {Object} Notification
 * @property {string}             _id
 * @property {string}             user       ObjectId ref — current member's id.
 * @property {NotificationType}   type
 * @property {NotificationStatus} status
 * @property {string}             title
 * @property {string}             message
 * @property {string|null}        [readAt]   ISO timestamp; null when UNREAD.
 * @property {string}             createdAt  ISO timestamp.
 * @property {string}             updatedAt  ISO timestamp.
 */

/**
 * @typedef {Object} NotificationFeedResult
 * @property {Notification[]} notifications
 * @property {number}         total  Total documents matching the filter.
 * @property {number}         page   Current page (1-indexed).
 * @property {number}         limit  Page size used.
 * @property {number}         pages  Total pages available.
 */

/**
 * @typedef {Object} UnreadCountResult
 * @property {number} count  Number of notifications with status UNREAD.
 */

// ─── Service ──────────────────────────────────────────────────────────────────

const notificationService = {
  /**
   * Fetch a paginated page of notifications, optionally filtered by status.
   *
   * Query params are validated by notificationQuerySchema on the backend:
   * page/limit are coerced to numbers; status is uppercased and checked
   * against the NOTIFICATION_STATUS enum.
   *
   * @route  GET /api/v1/notifications
   * @access Private — member only
   *
   * @param {NotificationFeedParams} [params={}]
   * @returns {Promise<ApiResponse<NotificationFeedResult>>}
   */
  getFeed: (params = {}) => api.get("/notifications", { params }),

  /**
   * Fetch the count of UNREAD notifications for the current member.
   *
   * Intended for the topbar badge — poll this independently of the feed
   * so badge updates don't force a full feed refetch.
   *
   * @route  GET /api/v1/notifications/unread-count
   * @access Private — member only
   *
   * @returns {Promise<ApiResponse<UnreadCountResult>>}
   */
  getUnreadCount: () => api.get("/notifications/unread-count"),

  /**
   * Transition a single notification from UNREAD → READ.
   *
   * The backend enforces the state machine: calling this on a READ or
   * ARCHIVED notification will return a 409 / validation error — the
   * mutation's onError handler should handle that gracefully (e.g. refetch
   * rather than surface an error toast for a stale optimistic update).
   *
   * @route  PATCH /api/v1/notifications/:id/read
   * @access Private — member only; ownership-scoped on the backend
   *
   * @param {string} notificationId  24-char hex ObjectId.
   * @returns {Promise<ApiResponse<Notification>>}
   */
  markAsRead: (notificationId) =>
    api.patch(`/notifications/${notificationId}/read`),

  /**
   * Transition all UNREAD notifications for the current member → READ.
   *
   * Prefer invalidating NOTIFICATION_QUERY_KEYS.all after this mutation
   * rather than updating individual cache entries — the blast radius is
   * unknown until the server responds.
   *
   * @route  PATCH /api/v1/notifications/read-all
   * @access Private — member only
   *
   * @returns {Promise<ApiResponse<{ modifiedCount: number }>>}
   */
  markAllAsRead: () => api.patch("/notifications/read-all"),

  /**
   * Transition a single notification to ARCHIVED (terminal state).
   *
   * ARCHIVED is a one-way transition — there is no unarchive endpoint.
   * The backend model enforces this; attempting to re-archive an already-
   * archived notification will return an error.
   *
   * @route  PATCH /api/v1/notifications/:id/archive
   * @access Private — member only; ownership-scoped on the backend
   *
   * @param {string} notificationId  24-char hex ObjectId.
   * @returns {Promise<ApiResponse<Notification>>}
   */
  archive: (notificationId) =>
    api.patch(`/notifications/${notificationId}/archive`),

  /**
   * Hard-delete a single notification by id.
   *
   * No soft-delete — this is permanent. The UI should confirm before
   * calling, or provide an undo window via optimistic update + timeout.
   *
   * @route  DELETE /api/v1/notifications/:id
   * @access Private — member only; ownership-scoped on the backend
   *
   * @param {string} notificationId  24-char hex ObjectId.
   * @returns {Promise<ApiResponse<{ deleted: true }>>}
   */
  deleteOne: (notificationId) => api.delete(`/notifications/${notificationId}`),

  /**
   * Hard-delete ALL notifications with status ARCHIVED for the current member.
   *
   * Scoped to ARCHIVED only — UNREAD and READ notifications are untouched.
   * Invalidate NOTIFICATION_QUERY_KEYS.all after this mutation.
   *
   * @route  DELETE /api/v1/notifications
   * @access Private — member only
   *
   * @returns {Promise<ApiResponse<{ deletedCount: number }>>}
   */
  clearArchived: () => api.delete("/notifications"),
};

export default notificationService;
