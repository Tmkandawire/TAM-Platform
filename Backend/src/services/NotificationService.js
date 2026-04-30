/**
 * @file NotificationService.js
 * @module services
 *
 * Notification orchestration layer for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Serve as the public API for all notification operations
 *  • Validate and sanitize service-level inputs
 *  • Build notification payloads from structured DTOs
 *  • Delegate all persistence to NotificationRepository
 *  • Enforce bulk operation safety limits and atomicity contracts
 *  • Provide read and lifecycle management operations
 *
 * This service intentionally does NOT:
 *  • know about admin workflows
 *  • know about document repositories
 *  • contain persistence logic
 *  • perform direct database access
 *  • dispatch emails, push events, or webhooks
 */

import notificationRepository from "../repositories/NotificationRepository.js";
import { NOTIFICATION_TYPE } from "../models/Notification.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum number of notifications accepted in a single bulk call.
 *
 * Prevents runaway broadcast payloads, accidental full-table fan-out,
 * and memory pressure from oversized arrays.
 *
 * For audiences larger than this limit, callers must chunk their data
 * and call bulkCreateNotifications() in batches.
 */
const BULK_CREATE_LIMIT = 500;

/**
 * Maximum character lengths for user-supplied string fields.
 * These are enforced at the service boundary before any DB interaction.
 */
const MAX_LENGTH = Object.freeze({
  USER_ID: 128,
  TITLE: 200,
  MESSAGE: 2000,
});

/* ─────────────────────────────────────────────
   INTERNAL VALIDATION HELPERS
───────────────────────────────────────────── */

/**
 * Validates that a value is a non-empty string after trimming,
 * and that it does not exceed the specified maximum length.
 *
 * @param {unknown} value
 * @param {string}  fieldName
 * @param {number}  maxLength
 * @throws {TypeError}
 */
function assertString(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `NotificationService: "${fieldName}" must be a non-empty string.`,
    );
  }

  if (value.trim().length > maxLength) {
    throw new TypeError(
      `NotificationService: "${fieldName}" must not exceed ${maxLength} characters ` +
        `(received ${value.trim().length}).`,
    );
  }
}

/**
 * Validates that a value is a known NOTIFICATION_TYPE member.
 *
 * @param {string} type
 * @throws {TypeError}
 */
function assertValidType(type) {
  const validTypes = Object.values(NOTIFICATION_TYPE);

  if (!validTypes.includes(type)) {
    throw new TypeError(
      `NotificationService: invalid notification type "${type}". ` +
        `Expected one of: ${validTypes.join(", ")}.`,
    );
  }
}

/**
 * Deep-clones a metadata object via JSON serialization.
 *
 * This serves two purposes:
 *  1. Strips prototype chains, preventing prototype pollution attacks.
 *  2. Surfaces circular reference errors immediately at the service boundary
 *     rather than allowing them to propagate as opaque DB errors.
 *
 * The result is frozen to prevent mutation after validation.
 *
 * @param {unknown} metadata
 * @param {string}  fieldName
 * @returns {Readonly<object>}
 * @throws {TypeError}
 */
function sanitiseMetadata(metadata, fieldName) {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new TypeError(
      `NotificationService: "${fieldName}" must be a plain object.`,
    );
  }

  try {
    return Object.freeze(JSON.parse(JSON.stringify(metadata)));
  } catch {
    throw new TypeError(
      `NotificationService: "${fieldName}" must be serializable ` +
        `(no circular references or non-JSON-safe values).`,
    );
  }
}

/* ─────────────────────────────────────────────
   PAYLOAD BUILDER
───────────────────────────────────────────── */

/**
 * Validates, sanitises, and normalises a single notification DTO
 * into a clean payload ready for persistence.
 *
 * This is the canonical validation path for both single and bulk creates.
 * Centralising here ensures both code paths are held to identical standards.
 *
 * @param {Object}  dto
 * @param {string}  dto.userId      - Recipient ObjectId string
 * @param {string}  dto.type        - NOTIFICATION_TYPE member
 * @param {string}  dto.title       - Human-readable title
 * @param {string}  dto.message     - Human-readable body
 * @param {Object}  [dto.metadata]  - Optional structured context payload
 * @returns {{ user: string, type: string, title: string, message: string, metadata: Readonly<Object> }}
 * @throws {TypeError}
 */
function buildPayload({ userId, type, title, message, metadata = {} }) {
  assertString(userId, "userId", MAX_LENGTH.USER_ID);
  assertValidType(type);
  assertString(title, "title", MAX_LENGTH.TITLE);
  assertString(message, "message", MAX_LENGTH.MESSAGE);

  const safeMetadata = sanitiseMetadata(metadata, "metadata");

  return Object.freeze({
    user: userId.trim(),
    type,
    title: title.trim(),
    message: message.trim(),
    metadata: safeMetadata,
  });
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class NotificationService {
  /**
   * @param {object} repository - NotificationRepository instance.
   *
   * Accepting the repository as a constructor argument makes this class
   * fully testable without module-level patching. In production, the
   * default export below supplies the real repository automatically.
   */
  constructor(repository) {
    this.#repository = repository;
  }

  /** @type {object} */
  #repository;

  /* ─────────────────────────────────────────
     CREATION
  ───────────────────────────────────────── */

  /**
   * Creates a single notification for one recipient.
   *
   * Intended for targeted, event-driven notifications:
   *  • Document approved
   *  • Document rejected
   *  • Account actions
   *
   * @param {Object}  dto
   * @param {string}  dto.userId      - Recipient user ObjectId string
   * @param {string}  dto.type        - NOTIFICATION_TYPE member
   * @param {string}  dto.title       - Human-readable notification title
   * @param {string}  dto.message     - Human-readable notification body
   * @param {Object}  [dto.metadata]  - Optional structured context payload
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {TypeError} on invalid input
   */
  async createNotification(dto, session) {
    const payload = buildPayload(dto);
    return this.#repository.create(payload, session);
  }

  /**
   * Creates notifications for multiple recipients in a single operation.
   *
   * Intended for fan-out scenarios:
   *  • Broadcast messages
   *  • Bulk document review actions
   *  • Future campaign systems
   *
   * All DTOs are validated before any persistence occurs, so the operation
   * fails fast on bad input rather than producing a partial write.
   *
   * ⚠ Atomicity requirement: a Mongoose ClientSession MUST be provided.
   * This method will throw if session is absent. Callers are responsible
   * for wrapping this call in a transaction.
   *
   * If the recipient list exceeds BULK_CREATE_LIMIT, callers must chunk
   * the array and call this method in batches.
   *
   * @param {Array<{
   *   userId:    string,
   *   type:      string,
   *   title:     string,
   *   message:   string,
   *   metadata?: Object
   * }>} dtos
   * @param {import('mongoose').ClientSession} session - Required for atomicity.
   * @returns {Promise<Readonly<Object[]>>}
   * @throws {TypeError} on invalid input, missing session, or limit exceeded
   */
  async bulkCreateNotifications(dtos, session) {
    // Enforce the atomicity contract at runtime, not just in documentation.
    if (!session) {
      throw new TypeError(
        "NotificationService: bulkCreateNotifications() requires a Mongoose " +
          "ClientSession. Wrap this call in a transaction to guarantee atomicity.",
      );
    }

    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new TypeError(
        "NotificationService: dtos must be a non-empty array.",
      );
    }

    if (dtos.length > BULK_CREATE_LIMIT) {
      throw new TypeError(
        `NotificationService: bulk create limit exceeded. ` +
          `Received ${dtos.length} items; maximum is ${BULK_CREATE_LIMIT}. ` +
          `Chunk the input and call bulkCreateNotifications() in batches.`,
      );
    }

    // Validate every DTO before touching the database.
    // An error here aborts the entire operation with a clear index reference.
    const payloads = dtos.map((dto, index) => {
      try {
        return buildPayload(dto);
      } catch (error) {
        throw new TypeError(
          `NotificationService: invalid DTO at index ${index}: ${error.message}`,
        );
      }
    });

    return this.#repository.createMany(payloads, session);
  }

  /* ─────────────────────────────────────────
     READS
  ───────────────────────────────────────── */

  /**
   * Returns a single notification by ID.
   *
   * @param {string} notificationId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async getNotificationById(notificationId, session) {
    assertString(notificationId, "notificationId", MAX_LENGTH.USER_ID);
    return this.#repository.findById(notificationId, session);
  }

  /**
   * Returns a paginated notification feed for a user.
   *
   * @param {string} userId
   * @param {{ page?: number, limit?: number, status?: string }} [options]
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async getUserNotifications(userId, options = {}, session) {
    assertString(userId, "userId", MAX_LENGTH.USER_ID);
    return this.#repository.findByUser(userId, options, session);
  }

  /**
   * Returns the unread notification count for a user.
   * Intended for notification badge counts in UI and API surfaces.
   *
   * @param {string} userId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId, session) {
    assertString(userId, "userId", MAX_LENGTH.USER_ID);
    return this.#repository.countUnreadByUser(userId, session);
  }

  /* ─────────────────────────────────────────
     LIFECYCLE MANAGEMENT
  ───────────────────────────────────────── */

  /**
   * Marks a single notification as READ.
   *
   * @param {string} notificationId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async markAsRead(notificationId, session) {
    assertString(notificationId, "notificationId", MAX_LENGTH.USER_ID);
    return this.#repository.markAsRead(notificationId, session);
  }

  /**
   * Marks all unread notifications for a user as READ.
   * Intended for "mark all as read" UI actions.
   *
   * @param {string} userId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<{ modifiedCount: number }>}
   */
  async markAllAsRead(userId, session) {
    assertString(userId, "userId", MAX_LENGTH.USER_ID);
    return this.#repository.markAllReadByUser(userId, session);
  }

  /**
   * Archives a single notification.
   *
   * Archived notifications are hidden from standard feeds
   * but retained for audit purposes.
   *
   * @param {string} notificationId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async archiveNotification(notificationId, session) {
    assertString(notificationId, "notificationId", MAX_LENGTH.USER_ID);
    return this.#repository.archive(notificationId, session);
  }

  /**
   * Permanently deletes a single notification.
   *
   * Prefer archiveNotification() for standard dismissal flows.
   * Reserve this for explicit deletion requirements only
   * (e.g. GDPR erasure, admin correction).
   *
   * @param {string} notificationId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<void>}
   * @throws {NotFoundError}
   */
  async deleteNotification(notificationId, session) {
    assertString(notificationId, "notificationId", MAX_LENGTH.USER_ID);
    return this.#repository.deleteById(notificationId, session);
  }

  /**
   * Permanently deletes all notifications for a user.
   *
   * Intended exclusively for account deletion and GDPR erasure flows.
   * Callers must wrap this in a transaction when coordinating deletion
   * across multiple collections.
   *
   * @param {string} userId
   * @param {import('mongoose').ClientSession} [session]
   * @returns {Promise<{ deletedCount: number }>}
   */
  async deleteAllUserNotifications(userId, session) {
    assertString(userId, "userId", MAX_LENGTH.USER_ID);
    return this.#repository.deleteAllByUser(userId, session);
  }
}

/* ─────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────── */

/**
 * Named class export — for testing (inject a mock repository)
 * and for any future subclassing needs.
 *
 * Usage in tests:
 *   const service = new NotificationService(mockRepository);
 */
export { NotificationService };

/**
 * Default singleton export — for standard service-layer consumption.
 * The real repository is wired in here so callers import and use directly.
 */
export default new NotificationService(notificationRepository);
