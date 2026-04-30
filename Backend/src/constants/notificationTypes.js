/**
 * @file notificationTypes.js
 * @module constants
 *
 * Single source of truth for all notification-related enumerations
 * on the TAM Platform.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Define all notification type identifiers
 *  • Define all notification status identifiers
 *  • Define all document event names consumed by listeners
 *
 * Why this file exists
 * ─────────────────────────────────────────────────────────────
 * Without a centralised constants file, notification strings are
 * duplicated across:
 *
 *   models/Notification.js          → NOTIFICATION_TYPE, NOTIFICATION_STATUS
 *   listeners/documentNotification  → DOCUMENT_EVENTS (local copy)
 *   services/NotificationService.js → imports from model (wrong layer)
 *   factories/notificationFactory   → imports from model (wrong layer)
 *
 * A single typo in any one of those locations produces a silent runtime
 * failure — a notification that is never created, never delivered, and
 * never surfaces as an error.
 *
 * This file eliminates that risk. Every module imports from here.
 *
 * Dependency rule
 * ─────────────────────────────────────────────────────────────
 * This file has zero imports. It is a pure constants module.
 * Nothing in the application graph sits below it. It may be
 * imported by any layer: models, services, repositories,
 * factories, listeners, controllers, and tests.
 *
 *   constants/notificationTypes.js
 *           ▲
 *           │  imported by
 *   ┌───────┼────────────────────────────┐
 *   │       │                            │
 * models  services   factories       listeners
 */

/* ─────────────────────────────────────────────
   NOTIFICATION TYPES
───────────────────────────────────────────── */

/**
 * Machine-readable identifiers for notification event types.
 *
 * These values are persisted to the database. Renaming a key is safe.
 * Changing a value is a breaking migration — all existing documents
 * with the old value will no longer match queries using the new value.
 *
 * Adding new types here is the only required step to introduce a new
 * notification category. The following must also be updated to match:
 *  • The Notification model schema enum
 *  • Any relevant factory functions in notificationFactory.js
 *
 * @enum {string}
 */
export const NOTIFICATION_TYPE = Object.freeze({
  /**
   * Sent to a document owner when their submission is approved by an admin.
   */
  DOCUMENT_APPROVED: "DOCUMENT_APPROVED",

  /**
   * Sent to a document owner when their submission is rejected by an admin.
   * May include an optional plain-text rejection reason.
   */
  DOCUMENT_REJECTED: "DOCUMENT_REJECTED",

  /**
   * Sent to a user when a significant action occurs on their account —
   * either performed by them or applied by an admin.
   *
   * The specific action subtype is carried in the notification's metadata
   * as an ACCOUNT_ACTION_TYPE value (defined in notificationFactory.js).
   * Separating the broad category (this type) from the specific action
   * (the metadata field) keeps the schema enum stable while allowing
   * account event coverage to grow without schema migrations.
   */
  ACCOUNT_ACTION: "ACCOUNT_ACTION",

  /**
   * Sent to one or more users as a platform-wide or group-level message
   * authored by an admin. Used for broadcasts and future campaigns.
   */
  BROADCAST: "BROADCAST",
});

/* ─────────────────────────────────────────────
   NOTIFICATION STATUSES
───────────────────────────────────────────── */

/**
 * Lifecycle states for a notification document.
 *
 * These values are persisted to the database. The same migration
 * warning applies as for NOTIFICATION_TYPE — value changes require
 * a data migration, not just a code change.
 *
 * State transitions:
 *
 *   UNREAD ──► READ ──► ARCHIVED
 *     │                    ▲
 *     └────────────────────┘
 *
 * Notes:
 *  • UNREAD → READ is enforced by the Notification model's pre-save
 *    and pre-update hooks, which set readAt automatically.
 *  • ARCHIVED is a soft-delete state. Archived notifications are
 *    hidden from standard feeds but retained for audit purposes.
 *
 * @enum {string}
 */
export const NOTIFICATION_STATUS = Object.freeze({
  /**
   * Default state. The recipient has not yet read the notification.
   * readAt is null while in this state.
   */
  UNREAD: "UNREAD",

  /**
   * The recipient has read the notification.
   * readAt is set automatically when transitioning to this state.
   */
  READ: "READ",

  /**
   * The notification has been archived by the recipient or system.
   * readAt is preserved from the READ transition if it occurred.
   */
  ARCHIVED: "ARCHIVED",
});

/* ─────────────────────────────────────────────
   DOCUMENT EVENT NAMES
───────────────────────────────────────────── */

/**
 * Canonical Node.js EventEmitter event name strings for document
 * lifecycle events emitted by AdminDocumentService (or equivalent).
 *
 * These values are NOT persisted. They are runtime strings used by
 * emitter.emit() and emitter.on(). They are intentionally aligned
 * with NOTIFICATION_TYPE values where the event maps 1:1 to a
 * notification type, making the relationship explicit and traceable.
 *
 * Both emitting services and listeners must import from here rather
 * than defining local copies or using raw strings. This ensures event
 * name mismatches are caught at import time, not silently at runtime.
 *
 * @enum {string}
 */
export const DOCUMENT_EVENT = Object.freeze({
  /**
   * Emitted by AdminDocumentService when a document is approved.
   *
   * Expected payload:
   * ┌───────────────┬──────────────────────────────────────────────┐
   * │ userId        │ ObjectId string — document owner             │
   * │ documentId    │ ObjectId string — approved document          │
   * │ documentTitle │ Human-readable document title                │
   * │ approvedBy    │ ObjectId string — admin who approved         │
   * └───────────────┴──────────────────────────────────────────────┘
   */
  APPROVED: "DOCUMENT_APPROVED",

  /**
   * Emitted by AdminDocumentService when a document is rejected.
   *
   * Expected payload:
   * ┌───────────────┬──────────────────────────────────────────────┐
   * │ userId        │ ObjectId string — document owner             │
   * │ documentId    │ ObjectId string — rejected document          │
   * │ documentTitle │ Human-readable document title                │
   * │ rejectedBy    │ ObjectId string — admin who rejected         │
   * │ reason        │ Optional plain-text rejection reason         │
   * └───────────────┴──────────────────────────────────────────────┘
   */
  REJECTED: "DOCUMENT_REJECTED",
});
