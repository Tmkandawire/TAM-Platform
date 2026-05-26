/**
 * @file NotificationRepository.js
 * @module repositories
 *
 * Enterprise-grade persistence repository for Notification documents.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Own all Notification persistence access
 *  • Centralise query construction
 *  • Enforce repository-level consistency
 *  • Return immutable plain JS objects only
 *  • Forward sessions for transactional safety
 *  • Prevent raw Mongoose usage from leaking into services
 *
 * This repository intentionally does NOT:
 *  • contain business logic
 *  • dispatch events
 *  • perform orchestration
 *  • validate application workflows
 *  • create notification payloads
 */

import mongoose from "mongoose";

import Notification from "../models/Notification.js";
import { NOTIFICATION_STATUS } from "../constants/notificationTypes.js";

import { NotFoundError } from "../errors/NotFoundError.js";
import { OBJECT_ID_REGEX } from "../dto/shared/objectId.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const ENTITY_NAME = "Notification";

/**
 * Upper bound for paginated notification feeds.
 *
 * Prevents:
 *  • abusive large queries
 *  • accidental memory pressure
 *  • oversized API responses
 */
const MAX_PAGE_SIZE = 100;

/**
 * Shared serialization behaviour.
 */
const LEAN_OPTIONS = Object.freeze({
  getters: true,
  virtuals: true,
  versionKey: false,
});

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Builds standardized query options.
 *
 * @param {import("mongoose").ClientSession} [session]
 * @returns {{ session?: import("mongoose").ClientSession }}
 */
function buildQueryOptions(session) {
  return session ? { session } : {};
}

/**
 * Deep-freezes a cloned object graph.
 *
 * Ensures repository consumers cannot mutate persistence results.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreezeClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  // BSON ObjectId — serialize to hex string
  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  // BSON Binary / Buffer-backed types — serialize to hex string
  if (typeof value.toString === "function" && value._bsontype !== undefined) {
    return value.toString("hex");
  }

  // Native Date — return as-is (JSON.stringify handles it correctly)
  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepFreezeClone(item)));
  }

  const clone = {};

  for (const key of Object.keys(value)) {
    clone[key] = deepFreezeClone(value[key]);
  }

  return Object.freeze(clone);
}

/**
 * Executes a standardized lean query.
 *
 * @template T
 * @param {import("mongoose").Query<T>} query
 * @returns {Promise<Readonly<T>>}
 */
async function executeLeanQuery(query) {
  const result = await query.lean(LEAN_OPTIONS).exec();

  return deepFreezeClone(result);
}

/**
 * Throws when an entity is not found.
 *
 * @param {unknown} doc
 * @param {string} identifier
 * @throws {NotFoundError}
 */
function assertFound(doc, identifier) {
  if (doc === null || doc === undefined) {
    throw new NotFoundError(`${ENTITY_NAME} not found: ${identifier}`);
  }
}

/**
 * Validates pagination input safely.
 *
 * @param {number} page
 * @param {number} limit
 * @returns {{ safePage: number, safeLimit: number, skip: number }}
 */
function normalizePagination(page, limit) {
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 20, 1),
    MAX_PAGE_SIZE,
  );

  return {
    safePage,
    safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

/**
 * Validates that a provided status value is a known NOTIFICATION_STATUS member.
 *
 * Prevents invalid status strings from silently producing empty query results
 * and wasting a DB round-trip.
 *
 * @param {string} status
 * @throws {TypeError}
 */
function assertValidStatus(status) {
  if (!Object.values(NOTIFICATION_STATUS).includes(status)) {
    throw new TypeError(
      `NotificationRepository: invalid status "${status}". ` +
        `Expected one of: ${Object.values(NOTIFICATION_STATUS).join(", ")}.`,
    );
  }
}

// Note: ObjectId validation is intentionally lenient to avoid false negatives.
function assertValidObjectId(value, fieldName) {
  if (typeof value !== "string" || !OBJECT_ID_REGEX.test(value)) {
    throw new TypeError(
      `NotificationRepository: invalid ObjectId for field "${fieldName}": ${JSON.stringify(value)}.`,
    );
  }
}

/* ─────────────────────────────────────────────
   REPOSITORY
───────────────────────────────────────────── */

export class NotificationRepository {
  constructor() {
    Object.freeze(this);
  }

  /* ─────────────────────────────────────────
     CREATION
  ───────────────────────────────────────── */

  /**
   * Creates a single notification.
   *
   * Returns immutable plain object output.
   *
   * @param {Object} payload
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   */
  async create(payload, session) {
    const [created] = await Notification.create(
      [payload],
      buildQueryOptions(session),
    );

    return deepFreezeClone(created.toObject(LEAN_OPTIONS));
  }

  /**
   * Creates multiple notifications atomically.
   *
   * insertMany is used intentionally for bulk efficiency.
   * ordered: true preserves deterministic failure behaviour.
   *
   * Note: lean is not passed to insertMany — it is not a supported option.
   * Documents are serialized via toObject() after creation.
   *
   * @param {Object[]} payloads
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async createMany(payloads, session) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      throw new TypeError(
        "NotificationRepository: payloads must be a non-empty array.",
      );
    }

    const created = await Notification.insertMany(payloads, {
      ordered: true,
      ...buildQueryOptions(session),
    });

    return deepFreezeClone(created.map((doc) => doc.toObject(LEAN_OPTIONS)));
  }

  /* ─────────────────────────────────────────
     READS
  ───────────────────────────────────────── */

  /**
   * Returns a single notification by ID.
   *
   * @param {string} notificationId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async findById(notificationId, session) {
    assertValidObjectId(notificationId, "notificationId");

    const doc = await executeLeanQuery(
      Notification.findById(notificationId, null, buildQueryOptions(session)),
    );

    assertFound(doc, notificationId);

    return doc;
  }

  /**
   * Returns paginated notifications for a user.
   *
   * Newest notifications appear first.
   *
   * @param {string} userId
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string
   * }} [options]
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async findByUser(userId, { page = 1, limit = 20, status } = {}, session) {
    assertValidObjectId(userId, "userId");

    const { safeLimit, skip } = normalizePagination(page, limit);

    const query = { user: userId };

    if (status !== undefined) {
      assertValidStatus(status);
      query.status = status;
    }

    return executeLeanQuery(
      Notification.find(query, null, buildQueryOptions(session))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
    );
  }

  /**
   * Returns total notification count for a user, optionally filtered by status.
   * Used by the feed controller to build accurate pagination metadata.
   *
   * @param {string} userId
   * @param {string} [status]
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<number>}
   */
  async countByUser(userId, status, session) {
    assertValidObjectId(userId, "userId");

    const query = { user: userId };

    if (status !== undefined) {
      assertValidStatus(status);
      query.status = status;
    }

    return Notification.countDocuments(query, buildQueryOptions(session));
  }

  /**
   * Returns unread notification count for a user.
   *
   * Session is forwarded to ensure consistent reads inside transactions.
   *
   * @param {string} userId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<number>}
   */
  async countUnreadByUser(userId, session) {
    assertValidObjectId(userId, "userId");

    return Notification.countDocuments(
      { user: userId, status: NOTIFICATION_STATUS.UNREAD },
      buildQueryOptions(session),
    );
  }

  /* ─────────────────────────────────────────
     MUTATIONS
  ───────────────────────────────────────── */

  /**
   * Marks a single notification as READ.
   *
   * Returns updated immutable object.
   * The pre-update hook on the model ensures readAt is set consistently.
   *
   * @param {string} notificationId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async markAsRead(notificationId, userId, session) {
    assertValidObjectId(notificationId, "notificationId");
    assertValidObjectId(userId, "userId");

    const updated = await executeLeanQuery(
      Notification.findByIdAndUpdate(
        notificationId,
        { $set: { status: NOTIFICATION_STATUS.READ } },
        {
          returnDocument: "after",
          runValidators: true,
          ...buildQueryOptions(session),
        },
      ),
    );

    assertFound(updated, notificationId);

    return updated;
  }

  /**
   * Marks all UNREAD notifications for a user as READ in a single operation.
   *
   * Uses updateMany for efficiency — avoids loading documents into memory.
   * The pre-update hook on the model ensures readAt is set consistently.
   *
   * @param {string} userId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<{ modifiedCount: number }>}
   */
  async markAllReadByUser(userId, session) {
    assertValidObjectId(userId, "userId");

    const result = await Notification.updateMany(
      { user: userId, status: NOTIFICATION_STATUS.UNREAD },
      { $set: { status: NOTIFICATION_STATUS.READ } },
      buildQueryOptions(session),
    );

    return Object.freeze({ modifiedCount: result.modifiedCount });
  }

  /**
   * Archives a single notification by ID.
   *
   * ARCHIVED notifications are excluded from standard feeds
   * but retained for audit purposes.
   *
   * @param {string} notificationId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async archive(notificationId, userId, session) {
    assertValidObjectId(notificationId, "notificationId");
    assertValidObjectId(userId, "userId");

    const updated = await executeLeanQuery(
      Notification.findByIdAndUpdate(
        notificationId,
        { $set: { status: NOTIFICATION_STATUS.ARCHIVED } },
        {
          returnDocument: "after",
          runValidators: true,
          ...buildQueryOptions(session),
        },
      ),
    );

    assertFound(updated, notificationId);

    return updated;
  }

  /**
   * Deletes a single notification by ID.
   *
   * Hard delete. Use archive() for soft deletion with audit retention.
   *
   * @param {string} notificationId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<void>}
   * @throws {NotFoundError}
   */
  async deleteById(notificationId, userId, session) {
    assertValidObjectId(notificationId, "notificationId");
    assertValidObjectId(userId, "userId");

    const result = await Notification.findByIdAndDelete(
      notificationId,
      buildQueryOptions(session),
    );

    assertFound(result, notificationId);
  }

  /**
   * Deletes all ARCHIVED notifications for a user.
   * Scoped to ARCHIVED only — never touches UNREAD or READ notifications.
   *
   * @param {string} userId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<{ deletedCount: number }>}
   */
  async deleteArchivedByUser(userId, session) {
    assertValidObjectId(userId, "userId");

    const result = await Notification.deleteMany(
      { user: userId, status: NOTIFICATION_STATUS.ARCHIVED },
      buildQueryOptions(session),
    );

    return Object.freeze({ deletedCount: result.deletedCount });
  }

  /**
   * Deletes all notifications for a user.
   *
   * Intended for account deletion / GDPR erasure flows.
   * Caller is responsible for wrapping in a transaction when
   * coordinating across multiple collections.
   *
   * @param {string} userId
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<{ deletedCount: number }>}
   */
  async deleteAllByUser(userId, session) {
    assertValidObjectId(userId, "userId");

    const result = await Notification.deleteMany(
      { user: userId },
      buildQueryOptions(session),
    );

    return Object.freeze({ deletedCount: result.deletedCount });
  }
}

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

/**
 * Named class export allows consumers to:
 *  • import the class directly for unit testing / mocking
 *  • extend the repository in specialised contexts
 *
 * Default instance export retains the convenience of a singleton
 * for standard DI / service-layer usage.
 */
export default new NotificationRepository();
