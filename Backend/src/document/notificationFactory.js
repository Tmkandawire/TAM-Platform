/**
 * @file notificationFactory.js
 * @module document
 *
 * Centralized notification payload factory for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Construct validated, consistently shaped notification DTOs
 *  • Centralise all title and message formatting per event type
 *  • Enforce metadata contracts explicitly per event type
 *  • Prevent duplicated formatting logic across callers
 *
 * This factory intentionally does NOT:
 *  • persist notifications
 *  • call NotificationService or NotificationRepository
 *  • know about admin workflows or document business logic
 *  • perform any I/O
 *
 * Usage
 * ─────────────────────────────────────────────────────────────
 * Each factory function returns a frozen DTO that can be passed
 * directly to NotificationService:
 *
 *   import notificationFactory from "./notificationFactory.js";
 *   import notificationService from "../services/NotificationService.js";
 *
 *   const dto = notificationFactory.documentApproved({
 *     userId,
 *     documentId,
 *     documentTitle,
 *     approvedBy,
 *   });
 *
 *   await notificationService.createNotification(dto, session);
 */

import { NOTIFICATION_TYPE } from "../../models/Notification.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum character lengths for factory input fields.
 *
 * These mirror the limits enforced in NotificationService so that
 * the factory catches oversized values at the construction site —
 * before the DTO ever reaches the service layer.
 */
const MAX_LENGTH = Object.freeze({
  USER_ID: 128,
  DOCUMENT_ID: 128,
  DOCUMENT_TITLE: 200,
  ACTOR_ID: 128, // approvedBy, rejectedBy, sentBy
  REASON: 500,
  BROADCAST_ID: 128,
  TITLE: 200,
  MESSAGE: 2000,
  ACTION_TYPE: 64,
});

/**
 * Permitted values for the accountAction `actionType` field.
 *
 * Constraining to an enum prevents callers from inventing free-form
 * strings that drift from the documented metadata contract over time.
 * Add new values here as the platform introduces new account events.
 */
const ACCOUNT_ACTION_TYPE = Object.freeze({
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  EMAIL_UPDATED: "EMAIL_UPDATED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_REINSTATED: "ACCOUNT_REINSTATED",
  TWO_FA_ENABLED: "TWO_FA_ENABLED",
  TWO_FA_DISABLED: "TWO_FA_DISABLED",
});

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Validates that a value is a non-empty string after trimming,
 * and that it does not exceed the specified maximum length.
 *
 * Factory inputs are caller-supplied strings, not validated DB records.
 * Failing fast here prevents malformed payloads from reaching the service
 * layer and producing misleading error messages there.
 *
 * @param {unknown} value
 * @param {string}  fieldName
 * @param {number}  maxLength
 * @throws {TypeError}
 */
function assertString(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `notificationFactory: "${fieldName}" must be a non-empty string.`,
    );
  }

  if (value.trim().length > maxLength) {
    throw new TypeError(
      `notificationFactory: "${fieldName}" must not exceed ${maxLength} characters ` +
        `(received ${value.trim().length}).`,
    );
  }
}

/**
 * Builds and returns a frozen notification DTO.
 *
 * Freezing the output makes the contract explicit:
 * factory outputs are value objects — they are passed through, not mutated.
 *
 * @param {{
 *   userId:   string,
 *   type:     string,
 *   title:    string,
 *   message:  string,
 *   metadata: Object
 * }} fields
 * @returns {Readonly<{
 *   userId:   string,
 *   type:     string,
 *   title:    string,
 *   message:  string,
 *   metadata: Readonly<Object>
 * }>}
 */
function buildDto({ userId, type, title, message, metadata }) {
  return Object.freeze({
    user: userId,
    type,
    title,
    message,
    metadata: Object.freeze(metadata),
  });
}

/* ─────────────────────────────────────────────
   STANDALONE FACTORY FUNCTIONS
   (module-level, no `this` dependency)
───────────────────────────────────────────── */

/**
 * Builds a DTO for a document approval notification.
 *
 * Metadata contract:
 * ┌───────────────┬─────────────────────────────────────────────┐
 * │ documentId    │ ObjectId string of the approved document     │
 * │ documentTitle │ Human-readable title for UI deep-links       │
 * │ approvedBy    │ ObjectId string of the approving admin       │
 * └───────────────┴─────────────────────────────────────────────┘
 *
 * @param {{
 *   userId:        string,
 *   documentId:    string,
 *   documentTitle: string,
 *   approvedBy:    string,
 * }} params
 * @returns {Readonly<Object>}
 * @throws {TypeError} on invalid input
 */
function documentApproved({ userId, documentId, documentTitle, approvedBy }) {
  assertString(userId, "userId", MAX_LENGTH.USER_ID);
  assertString(documentId, "documentId", MAX_LENGTH.DOCUMENT_ID);
  assertString(documentTitle, "documentTitle", MAX_LENGTH.DOCUMENT_TITLE);
  assertString(approvedBy, "approvedBy", MAX_LENGTH.ACTOR_ID);

  return buildDto({
    userId,
    type: NOTIFICATION_TYPE.DOCUMENT_APPROVED,
    title: "Document Approved",
    message: `Your document "${documentTitle.trim()}" has been approved.`,
    metadata: {
      documentId,
      documentTitle: documentTitle.trim(),
      approvedBy,
    },
  });
}

/**
 * Builds a DTO for a document rejection notification.
 *
 * An optional rejection reason is surfaced in the message when provided.
 *
 * Metadata contract:
 * ┌───────────────┬─────────────────────────────────────────────┐
 * │ documentId    │ ObjectId string of the rejected document     │
 * │ documentTitle │ Human-readable title for UI deep-links       │
 * │ rejectedBy    │ ObjectId string of the rejecting admin       │
 * │ reason        │ Optional plain-text rejection reason         │
 * └───────────────┴─────────────────────────────────────────────┘
 *
 * @param {{
 *   userId:        string,
 *   documentId:    string,
 *   documentTitle: string,
 *   rejectedBy:    string,
 *   reason?:       string,
 * }} params
 * @returns {Readonly<Object>}
 * @throws {TypeError} on invalid input
 */
function documentRejected({
  userId,
  documentId,
  documentTitle,
  rejectedBy,
  reason,
}) {
  assertString(userId, "userId", MAX_LENGTH.USER_ID);
  assertString(documentId, "documentId", MAX_LENGTH.DOCUMENT_ID);
  assertString(documentTitle, "documentTitle", MAX_LENGTH.DOCUMENT_TITLE);
  assertString(rejectedBy, "rejectedBy", MAX_LENGTH.ACTOR_ID);

  // reason is optional — validate only when provided
  const trimmedReason =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim()
      : null;

  if (trimmedReason !== null && trimmedReason.length > MAX_LENGTH.REASON) {
    throw new TypeError(
      `notificationFactory: "reason" must not exceed ${MAX_LENGTH.REASON} characters ` +
        `(received ${trimmedReason.length}).`,
    );
  }

  const message = trimmedReason
    ? `Your document "${documentTitle.trim()}" was rejected. Reason: ${trimmedReason}`
    : `Your document "${documentTitle.trim()}" was rejected.`;

  return buildDto({
    userId,
    type: NOTIFICATION_TYPE.DOCUMENT_REJECTED,
    title: "Document Rejected",
    message,
    metadata: {
      documentId,
      documentTitle: documentTitle.trim(),
      rejectedBy,
      ...(trimmedReason !== null && { reason: trimmedReason }),
    },
  });
}

/**
 * Builds a DTO for an account action notification.
 *
 * Sent to a user when a significant action occurs on their account —
 * either performed by them or applied by an admin.
 *
 * Metadata contract:
 * ┌────────────┬──────────────────────────────────────────────────┐
 * │ actionType │ ACCOUNT_ACTION_TYPE member describing the event   │
 * │ performedBy│ ObjectId string of the actor (user or admin)      │
 * └────────────┴──────────────────────────────────────────────────┘
 *
 * @param {{
 *   userId:      string,
 *   actionType:  string,  - ACCOUNT_ACTION_TYPE member
 *   title:       string,
 *   message:     string,
 *   performedBy: string,
 * }} params
 * @returns {Readonly<Object>}
 * @throws {TypeError} on invalid input or unrecognised actionType
 */
function accountAction({ userId, actionType, title, message, performedBy }) {
  assertString(userId, "userId", MAX_LENGTH.USER_ID);
  assertString(title, "title", MAX_LENGTH.TITLE);
  assertString(message, "message", MAX_LENGTH.MESSAGE);
  assertString(performedBy, "performedBy", MAX_LENGTH.ACTOR_ID);

  const validActionTypes = Object.values(ACCOUNT_ACTION_TYPE);

  if (!validActionTypes.includes(actionType)) {
    throw new TypeError(
      `notificationFactory: invalid actionType "${actionType}". ` +
        `Expected one of: ${validActionTypes.join(", ")}.`,
    );
  }

  return buildDto({
    userId,
    type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
    title: title.trim(),
    message: message.trim(),
    metadata: {
      actionType,
      performedBy,
    },
  });
}

/**
 * Builds a DTO for a broadcast notification targeting a single recipient.
 *
 * Broadcast notifications are platform-wide or group-level messages
 * authored by admins. This function produces one DTO per recipient —
 * callers building fan-out payloads should use broadcastMany().
 *
 * Metadata contract:
 * ┌─────────────┬──────────────────────────────────────────────────┐
 * │ broadcastId │ Shared identifier grouping all recipients of the  │
 * │             │ same broadcast event                              │
 * │ sentBy      │ ObjectId string of the authoring admin            │
 * └─────────────┴──────────────────────────────────────────────────┘
 *
 * @param {{
 *   userId:      string,
 *   title:       string,
 *   message:     string,
 *   broadcastId: string,
 *   sentBy:      string,
 * }} params
 * @returns {Readonly<Object>}
 * @throws {TypeError} on invalid input
 */
function broadcast({ userId, title, message, broadcastId, sentBy }) {
  assertString(userId, "userId", MAX_LENGTH.USER_ID);
  assertString(title, "title", MAX_LENGTH.TITLE);
  assertString(message, "message", MAX_LENGTH.MESSAGE);
  assertString(broadcastId, "broadcastId", MAX_LENGTH.BROADCAST_ID);
  assertString(sentBy, "sentBy", MAX_LENGTH.ACTOR_ID);

  return buildDto({
    userId,
    type: NOTIFICATION_TYPE.BROADCAST,
    title: title.trim(),
    message: message.trim(),
    metadata: {
      broadcastId,
      sentBy,
    },
  });
}

/**
 * Builds an array of broadcast DTOs for a list of recipients.
 *
 * Convenience wrapper for fan-out scenarios. Validates the recipient list
 * before mapping to prevent partial construction on malformed input.
 *
 * The resulting array can be passed directly to:
 *   NotificationService.bulkCreateNotifications(dtos, session)
 *
 * If the recipient list exceeds NotificationService's BULK_CREATE_LIMIT,
 * callers are responsible for chunking before calling the service.
 *
 * @param {{
 *   userIds:     string[],
 *   title:       string,
 *   message:     string,
 *   broadcastId: string,
 *   sentBy:      string,
 * }} params
 * @returns {ReadonlyArray<Readonly<Object>>}
 * @throws {TypeError} on invalid input
 */
function broadcastMany({ userIds, title, message, broadcastId, sentBy }) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new TypeError(
      'notificationFactory: "userIds" must be a non-empty array.',
    );
  }

  // Validate shared fields before touching the recipient list.
  assertString(title, "title", MAX_LENGTH.TITLE);
  assertString(message, "message", MAX_LENGTH.MESSAGE);
  assertString(broadcastId, "broadcastId", MAX_LENGTH.BROADCAST_ID);
  assertString(sentBy, "sentBy", MAX_LENGTH.ACTOR_ID);

  // Validate each userId before mapping — fail fast on any invalid entry.
  userIds.forEach((userId, index) => {
    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw new TypeError(
        `notificationFactory: "userIds[${index}]" must be a non-empty string.`,
      );
    }
  });

  // Call the standalone broadcast() function directly.
  // No `this` dependency — safe to destructure, pass as a callback, or call
  // from any context without binding.
  return Object.freeze(
    userIds.map((userId) =>
      broadcast({ userId, title, message, broadcastId, sentBy }),
    ),
  );
}

/* ─────────────────────────────────────────────
   FACTORY OBJECT & EXPORTS
───────────────────────────────────────────── */

const notificationFactory = Object.freeze({
  documentApproved,
  documentRejected,
  accountAction,
  broadcast,
  broadcastMany,
});

/**
 * Named export for ACCOUNT_ACTION_TYPE — callers should use these constants
 * when constructing account action notifications rather than raw strings.
 *
 * Usage:
 *   import notificationFactory, { ACCOUNT_ACTION_TYPE } from "./notificationFactory.js";
 *
 *   const dto = notificationFactory.accountAction({
 *     userId,
 *     actionType: ACCOUNT_ACTION_TYPE.PASSWORD_CHANGED,
 *     ...
 *   });
 */
export { ACCOUNT_ACTION_TYPE };
export default notificationFactory;
