/**
 * @file broadcastFactory.js
 * @module document
 *
 * Transforms a validated broadcast payload and a resolved recipient
 * into a frozen notification DTO ready for NotificationService,
 * or a frozen email payload ready for EmailService.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Accept pre-validated, pre-sanitised inputs (no re-validation here)
 *  • Produce a deeply frozen, immutable notification DTO per recipient
 *  • Produce a deeply frozen, immutable email payload per recipient
 *  • Map broadcast fields to the notification DTO contract
 *  • Map broadcast fields to the email payload contract
 *  • Throw early and clearly on missing or malformed required inputs
 *
 * This factory intentionally does NOT:
 *  • validate broadcast payloads (broadcastValidator responsibility)
 *  • resolve recipients (BroadcastService responsibility)
 *  • persist notifications (NotificationService responsibility)
 *  • dispatch emails (EmailService responsibility)
 *  • send emails — broadcast notifications have no per-recipient
 *    transactional email by design (NotificationService returns null
 *    for SYSTEM-type DTOs in buildEmailPayload)
 */

import mongoose from "mongoose";
import { NOTIFICATION_TYPE } from "../constants/notificationTypes.js";
import { buildBroadcastEmail } from "../email/factories/emailFactory.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Cached at module load — avoids repeated Object.values() calls in the hot
 * fan-out path and ensures the error message never drifts from the check.
 */
const VALID_NOTIFICATION_TYPES = Object.freeze(
  Object.values(NOTIFICATION_TYPE),
);

/** Matches a 24-character lowercase hex Mongo ObjectId. */
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/* ─────────────────────────────────────────────
   ERRORS
───────────────────────────────────────────── */

/**
 * Thrown when a required factory input is missing or the wrong type.
 * Carries `.code` and `.field` for precise upstream error handling.
 *
 * @extends TypeError
 */
export class BroadcastFactoryError extends TypeError {
  /**
   * @param {string} message
   * @param {string} field - The offending input field name.
   */
  constructor(message, field) {
    super(`broadcastFactory: ${message}`);
    this.name = "BroadcastFactoryError";
    this.code = "BROADCAST_FACTORY_ERROR";
    this.field = field;
  }
}

/* ─────────────────────────────────────────────
   GUARDS
   Lightweight shape assertions — not domain validation.
   Full validation belongs in broadcastValidator / BroadcastService.
───────────────────────────────────────────── */

/**
 * Assert that a value is a non-empty string.
 *
 * @param {unknown} value
 * @param {string}  field
 * @returns {string} The trimmed value.
 * @throws {BroadcastFactoryError}
 */
function assertString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BroadcastFactoryError(
      `"${field}" must be a non-empty string.`,
      field,
    );
  }
  return value.trim();
}

/**
 * Assert that a value is a plain object (not null, not an array).
 *
 * @param {unknown} value
 * @param {string}  field
 * @returns {Record<string, unknown>}
 * @throws {BroadcastFactoryError}
 */
function assertPlainObject(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BroadcastFactoryError(
      `"${field}" must be a plain object.`,
      field,
    );
  }
  return value;
}

/**
 * Assert that a string is a valid Mongo ObjectId format.
 *
 * Uses both a regex check and mongoose.Types.ObjectId.isValid for
 * defence-in-depth — the regex rejects obviously malformed strings
 * before the mongoose call, which has a broader notion of "valid".
 *
 * @param {string} value - Already asserted to be a non-empty string.
 * @param {string} field
 * @returns {string} The original value unchanged.
 * @throws {BroadcastFactoryError}
 */
function assertObjectId(value, field) {
  if (
    !OBJECT_ID_PATTERN.test(value) ||
    !mongoose.Types.ObjectId.isValid(value)
  ) {
    throw new BroadcastFactoryError(
      `"${field}" must be a valid 24-character Mongo ObjectId.`,
      field,
    );
  }
  return value;
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Deep-freeze an object recursively.
 *
 * `Object.freeze` is shallow — nested objects remain mutable without this.
 * Applied to all DTO metadata and the DTO itself to enforce the immutability
 * contract across service boundaries.
 *
 * Only own, non-null object properties are traversed — primitives and
 * already-frozen objects are skipped safely.
 *
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
    return obj;
  }

  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }

  return obj;
}

/**
 * Sanitise and deep-freeze broadcast metadata.
 *
 * JSON round-trip strips non-serializable values (functions, undefined,
 * Symbols) and circular references — ensuring the metadata that reaches
 * the DB is exactly what was validated at the transport layer.
 *
 * @param {unknown} value
 * @returns {Readonly<Record<string, unknown>>}
 * @throws {BroadcastFactoryError}
 */
function sanitiseMetadata(value) {
  const metadata = value ?? {};

  assertPlainObject(metadata, "broadcast.metadata");

  try {
    // JSON round-trip guarantees serializability and strips non-primitives.
    // deepFreeze enforces immutability at all nesting levels.
    return deepFreeze(JSON.parse(JSON.stringify(metadata)));
  } catch {
    throw new BroadcastFactoryError(
      '"broadcast.metadata" must be JSON-serializable (no circular refs or non-serializable values).',
      "broadcast.metadata",
    );
  }
}

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

/**
 * @typedef {Object} BroadcastInput
 * @property {string}                  title                      - Broadcast title (pre-validated, pre-trimmed).
 * @property {string}                  subject                    - Broadcast email subject (pre-validated, pre-trimmed).
 * @property {string}                  message                    - Broadcast message body (pre-validated, pre-trimmed).
 * @property {string}                  [notificationType]         - Must be a valid NOTIFICATION_TYPE value.
 *                                                                  Defaults to NOTIFICATION_TYPE.SYSTEM if omitted.
 * @property {Record<string, unknown>} [metadata]                 - Arbitrary broadcast metadata (pre-sanitised).
 *                                                                  Defaults to {} if omitted.
 */

/**
 * @typedef {Object} RecipientInput
 * @property {string} [userId]  - String representation of the recipient's Mongo ObjectId.
 *                                Falls back to `_id.toString()` if absent.
 * @property {*}      [_id]     - Raw Mongoose ObjectId, used as userId fallback.
 * @property {string} [email]   - Recipient email address. Trimmed and lowercased for
 *                                consistency with User model canonicalization.
 */

/**
 * @typedef {Object} BroadcastNotificationDto
 * @property {string}                  userId          - Recipient user ID (validated ObjectId string).
 * @property {string}                  type            - Notification type (from NOTIFICATION_TYPE).
 * @property {string}                  title           - Notification title.
 * @property {string}                  message         - Notification message body.
 * @property {Readonly<Record<string, unknown>>} metadata - Deeply frozen broadcast metadata.
 * @property {string}                  [recipientEmail] - Lowercased recipient email, if resolved.
 */

/**
 * @typedef {Object} BroadcastEmailPayload
 * @property {string} to       - Recipient email address (normalized).
 * @property {string} subject  - Email subject line.
 * @property {string} html     - Full HTML email (layout + body fragment).
 * @property {string} text     - Plain-text fallback body.
 * @property {string} [replyTo] - Optional reply-to address.
 */

/* ─────────────────────────────────────────────
   INTERNAL DTO BUILDER
───────────────────────────────────────────── */

/**
 * Core DTO construction logic shared by forRecipient and forAllRecipients.
 *
 * @param {BroadcastInput}  broadcast
 * @param {RecipientInput}  recipient
 * @returns {Readonly<BroadcastNotificationDto>}
 * @throws {BroadcastFactoryError}
 */
function buildDto(broadcast, recipient) {
  assertPlainObject(broadcast, "broadcast");
  assertPlainObject(recipient, "recipient");

  const title = assertString(broadcast.title, "broadcast.title");
  const message = assertString(broadcast.message, "broadcast.message");

  // Default to SYSTEM if caller omits notificationType — matches the
  // BroadcastService default and notificationType validator default.
  const type = assertString(
    broadcast.notificationType ?? NOTIFICATION_TYPE.SYSTEM,
    "broadcast.notificationType",
  );

  if (!VALID_NOTIFICATION_TYPES.includes(type)) {
    throw new BroadcastFactoryError(
      `"broadcast.notificationType" must be one of: ${VALID_NOTIFICATION_TYPES.join(", ")}.`,
      "broadcast.notificationType",
    );
  }

  // Accept pre-mapped userId or fall back to raw Mongoose _id.
  const rawUserId = recipient.userId ?? recipient._id?.toString?.();
  const userId = assertObjectId(
    assertString(rawUserId, "recipient.userId"),
    "recipient.userId",
  );

  const dto = {
    user: userId,
    type,
    title,
    message,
    metadata: sanitiseMetadata(broadcast.metadata),
  };

  // Normalise email to lowercase for consistency with User model
  // canonicalization — prevents duplicates in log correlation and
  // any future deduplication logic that compares email strings.
  if (
    typeof recipient.email === "string" &&
    recipient.email.trim().length > 0
  ) {
    dto.recipientEmail = recipient.email.trim().toLowerCase();
  }

  return deepFreeze(dto);
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Build a single deeply frozen notification DTO for one broadcast recipient.
 *
 * Called per recipient during BroadcastService fan-out when individual
 * DTO construction is needed (e.g. partial retries, targeted sends).
 *
 * @param {BroadcastInput}  broadcast  - The validated broadcast payload.
 * @param {RecipientInput}  recipient  - A resolved recipient from the audience query.
 * @returns {Readonly<BroadcastNotificationDto>}
 * @throws {BroadcastFactoryError} If any required field is missing or invalid.
 *
 * @example
 * const dto = broadcastFactory.forRecipient(
 *   { title: "Maintenance window", message: "Down at midnight.", notificationType: "SYSTEM" },
 *   { userId: "64a1f2b3c4d5e6f7a8b9c0d1", email: "user@example.com" },
 * );
 */
function forRecipient(broadcast, recipient) {
  return buildDto(broadcast, recipient);
}

/**
 * Build deeply frozen notification DTOs for all broadcast recipients in one pass.
 *
 * Replaces the inline recipients.map(...) block in BroadcastService,
 * keeping DTO construction responsibility in the factory layer.
 *
 * @param {BroadcastInput}   broadcast   - The validated broadcast payload.
 * @param {RecipientInput[]} recipients  - All resolved recipients (must be non-empty).
 * @returns {ReadonlyArray<Readonly<BroadcastNotificationDto>>}
 * @throws {BroadcastFactoryError} If recipients is not a non-empty array,
 *                                 or if any individual DTO fails construction.
 *
 * @example
 * const dtos = broadcastFactory.forAllRecipients(broadcast, resolvedUsers);
 * await notificationService.bulkCreateNotifications(dtos, session);
 */
function forAllRecipients(broadcast, recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastFactoryError(
      '"recipients" must be a non-empty array.',
      "recipients",
    );
  }

  return Object.freeze(
    recipients.map((recipient) => buildDto(broadcast, recipient)),
  );
}

/**
 * Build a single deeply frozen email payload for one broadcast recipient.
 *
 * Delegates to buildBroadcastEmail (emailFactory) for payload construction,
 * keeping email formatting concerns in the factory layer.
 *
 * Only called when the recipient has a resolvable email address — callers
 * are responsible for filtering recipients without email before invoking
 * this method. Recipients without email are silently skipped in
 * forAllEmailRecipients.
 *
 * @param {BroadcastInput}  broadcast  - The validated broadcast payload.
 * @param {RecipientInput}  recipient  - A resolved recipient with a valid email.
 * @returns {Readonly<BroadcastEmailPayload>}
 * @throws {BroadcastFactoryError} If broadcast fields are missing or invalid.
 *
 * @example
 * const payload = broadcastFactory.forEmailRecipient(
 *   { title: "Maintenance", subject: "Scheduled downtime", message: "Down at midnight." },
 *   { email: "user@example.com" },
 * );
 */
function forEmailRecipient(broadcast, recipient) {
  assertPlainObject(broadcast, "broadcast");
  assertPlainObject(recipient, "recipient");

  const title = assertString(broadcast.title, "broadcast.title");
  const message = assertString(broadcast.message, "broadcast.message");

  // subject is optional — buildBroadcastEmail falls back to title when absent.
  const subject =
    typeof broadcast.subject === "string" && broadcast.subject.trim().length > 0
      ? broadcast.subject.trim()
      : null;

  // Normalise recipient email — mirrors the normalization in buildDto.
  const userEmail = assertString(recipient.email, "recipient.email");

  return deepFreeze(
    buildBroadcastEmail({
      userEmail,
      title,
      subject,
      message,
    }),
  );
}

/**
 * Build deeply frozen email payloads for all broadcast recipients in one pass.
 *
 * Recipients without a resolvable email address are skipped — this is
 * expected behaviour for users who have not provided an email. The count
 * of skipped recipients is returned alongside the payloads so BroadcastService
 * can track delivery coverage accurately.
 *
 * @param {BroadcastInput}   broadcast   - The validated broadcast payload.
 * @param {RecipientInput[]} recipients  - All resolved recipients.
 * @returns {{ payloads: ReadonlyArray<Readonly<BroadcastEmailPayload>>, skipped: number }}
 * @throws {BroadcastFactoryError} If recipients is not an array,
 *                                 or if any individual payload fails construction.
 *
 * @example
 * const { payloads, skipped } = broadcastFactory.forAllEmailRecipients(broadcast, resolvedUsers);
 * await emailService.sendBulkEmails(payloads);
 */
function forAllEmailRecipients(broadcast, recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastFactoryError(
      '"recipients" must be a non-empty array.',
      "recipients",
    );
  }

  const payloads = [];
  let skipped = 0;

  for (const recipient of recipients) {
    if (
      typeof recipient.email !== "string" ||
      recipient.email.trim().length === 0
    ) {
      skipped++;
      continue;
    }
    payloads.push(forEmailRecipient(broadcast, recipient));
  }

  return { payloads: Object.freeze(payloads), skipped };
}

/* ─────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────── */

const broadcastFactory = Object.freeze({
  forRecipient,
  forAllRecipients,
  forEmailRecipient,
  forAllEmailRecipients,
});

export default broadcastFactory;
