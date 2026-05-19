/**
 * @file AuditLogRepository.js
 * @module repositories
 *
 * Enterprise-grade data access layer for AuditLog documents.
 *
 * ─── Responsibilities ────────────────────────────────────────────────────────
 *
 *  • Own all Mongoose query construction for the AuditLog collection
 *  • Return plain immutable JS objects only (never Mongoose documents)
 *  • Forward ClientSession to every write/query for transactional safety
 *  • Enforce the append-only invariant — no update or delete operations
 *  • Enforce pagination boundaries on all list queries
 *
 * ─── Append-only contract ────────────────────────────────────────────────────
 *
 *  Audit logs are immutable by design.  This repository intentionally
 *  exposes NO update or delete methods.  Any attempt to modify or remove
 *  audit entries must be handled at the infrastructure level (e.g. TTL
 *  indexes, archival pipelines) — never through application code.
 *
 * ─── What this module intentionally does NOT do ──────────────────────────────
 *
 *  • No business logic
 *  • No transaction management  (caller supplies session via withMongoTransaction)
 *  • No authorization checks    (belongs in the policy/service layer)
 *  • No request-level validation (belongs in the validator layer)
 */

import { NotFoundError } from "../errors/NotFoundError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const ENTITY_NAME = "AuditLog";

/**
 * Default number of documents returned by list queries when no limit
 * is supplied by the caller.
 */
const DEFAULT_PAGE_LIMIT = 50;

/**
 * Hard ceiling on documents returned by any single list query.
 *
 * Prevents accidental full-collection scans.  Callers supplying a limit
 * above this value will have it clamped — this is intentional and
 * documented in each method's JSDoc.
 */
const MAX_PAGE_LIMIT = 200;

/**
 * Shared serialization options for all lean reads and toObject() calls.
 *
 * getters:    Applies schema getters to output.
 * virtuals:   Includes virtual fields in results.
 * versionKey: Excludes __v from repository responses.
 *
 * Applied consistently across every read path and create() so callers
 * always receive an identical field shape regardless of entry point.
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
 * Builds a consistent Mongoose options object.
 *
 * @param {import("mongoose").ClientSession | null | undefined} session
 * @returns {{ session?: import("mongoose").ClientSession }}
 */
function buildQueryOptions(session) {
  return session ? { session } : {};
}

/**
 * Throws a consistent NotFoundError when a query returns no document.
 *
 * @param {unknown} doc
 * @param {string}  identifier
 * @throws {NotFoundError}
 */
function assertFound(doc, identifier) {
  if (doc == null) {
    throw new NotFoundError(`${ENTITY_NAME} not found: ${identifier}`);
  }
}

/**
 * Validates that `value` is a plain object.
 *
 * Accepted prototypes:
 *  • Object.prototype — standard object literal `{}`
 *  • null             — Object.create(null), intentionally "more plain"
 *
 * Rejected: arrays, Date, Map, Set, class instances — typeof passes for
 * all of these but none are valid query param shapes.  Each failure mode
 * produces a distinct message so callers can diagnose the exact problem.
 *
 * @param {unknown} value
 * @param {string}  name   - Param name included in the error message.
 * @throws {TypeError}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== "object") {
    throw new TypeError(
      `AuditLogRepository: \`${name}\` must be a plain object, received ${
        value === null ? "null" : typeof value
      }.`,
    );
  }

  const proto = Object.getPrototypeOf(value);

  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      `AuditLogRepository: \`${name}\` must be a plain object — ` +
        `arrays, class instances, and built-in objects (Date, Map, etc.) are not accepted.`,
    );
  }
}

/**
 * Validates that pagination values are safe, in-range integers.
 *
 * `skip` must be a non-negative integer.
 * `limit`, when supplied, must be a positive integer within [1, MAX_PAGE_LIMIT].
 *
 * Note: callers may omit `limit` and receive the DEFAULT_PAGE_LIMIT —
 * but if they supply it, it must be a valid positive integer.  Clamping
 * handles values above MAX_PAGE_LIMIT silently; values below 1 are
 * rejected because they indicate a caller bug rather than an oversized request.
 *
 * @param {number}           skip
 * @param {number|undefined} limit
 * @throws {RangeError}
 */
function assertValidPagination(skip, limit) {
  if (!Number.isInteger(skip) || skip < 0) {
    throw new RangeError(
      "AuditLogRepository: `skip` must be a non-negative integer.",
    );
  }

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(
        "AuditLogRepository: `limit` must be a positive integer.",
      );
    }
  }
}

/**
 * Clamps `limit` to the inclusive range [1, MAX_PAGE_LIMIT].
 *
 * Called after `assertValidPagination` so by this point `limit` is either
 * undefined or a valid positive integer.  Values above MAX_PAGE_LIMIT are
 * silently clamped — oversized requests are bounded, not rejected.
 *
 * @param {number | undefined} limit
 * @returns {number}
 */
function resolveLimit(limit) {
  if (limit == null) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.min(limit, MAX_PAGE_LIMIT);
}

/**
 * Deep-clones and recursively freezes `value` into an immutable snapshot.
 *
 * Uses `structuredClone` for the clone step — it correctly handles nested
 * Date, RegExp, TypedArray, and Map/Set values that plain recursive cloning
 * misses.  Note: `structuredClone` does not support non-cloneable values
 * such as functions or class instances with custom prototypes; Mongoose
 * lean/toObject output should not contain these, but this is worth
 * noting for edge cases.
 *
 * Freezes after cloning so the original object (lean result or toObject
 * output) is never mutated in place — callers holding a pre-freeze
 * reference will not observe unexpected immutability.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreezeClone(value) {
  const cloned = structuredClone(value);

  function freezeRecursive(obj) {
    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
      return;
    }

    Object.freeze(obj);

    for (const nested of Object.values(obj)) {
      freezeRecursive(nested);
    }
  }

  freezeRecursive(cloned);

  return cloned;
}

/**
 * Executes a Mongoose query with standardized repository behaviour.
 *
 * Centralising execution guarantees:
 *  • lean reads with consistent LEAN_OPTIONS on every path
 *  • immutable, cloned return values via deepFreezeClone
 *  • no raw Mongoose documents ever reaching the service layer
 *
 * @template T
 * @param {import("mongoose").Query<T>} query
 * @returns {Promise<Readonly<T>>}
 */
async function executeLeanQuery(query) {
  const result = await query.lean(LEAN_OPTIONS).exec();

  return deepFreezeClone(result);
}

/* ─────────────────────────────────────────────
   REPOSITORY
───────────────────────────────────────────── */

export class AuditLogRepository {
  /** @type {import("mongoose").Model} */
  #model;

  /**
   * @param {import("mongoose").Model} AuditLogModel
   *   Injected rather than imported directly — keeps the repository
   *   testable without a live database connection and decoupled from
   *   the module graph.
   */
  constructor(AuditLogModel) {
    if (AuditLogModel == null || typeof AuditLogModel.findById !== "function") {
      throw new TypeError(
        "AuditLogRepository: constructor requires a valid Mongoose Model.",
      );
    }

    this.#model = AuditLogModel;

    // Repository instances are infrastructure singletons and must not
    // be mutated at runtime.  Freezing enforces this at the object level.
    Object.freeze(this);
  }

  /* ─── Reads ─────────────────────────────────────────────────────────────── */

  /**
   * Finds an audit log entry by its Mongoose `_id`.
   * Returns `null` when not found — does NOT throw.
   * Use `getById` when the caller requires the document to exist.
   *
   * @param {string} id
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object> | null>}
   */
  async findById(id, session) {
    return executeLeanQuery(this.#model.findById(id).session(session ?? null));
  }

  /**
   * Gets an audit log entry by its Mongoose `_id`.
   *
   * @param {string} id
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError} If no entry with this `_id` exists.
   */
  async getById(id, session) {
    const doc = await this.findById(id, session);
    assertFound(doc, id);
    return doc;
  }

  /**
   * Finds audit log entries for a specific entity (e.g. a Profile, Order).
   *
   * Results are sorted newest-first.  `limit` is clamped to MAX_PAGE_LIMIT
   * (200) — values above this are silently bounded.
   *
   * @param {Object} params
   * @param {string} params.entityId    - ID of the audited entity.
   * @param {string} params.entityType  - Collection/type name of the entity.
   * @param {number} [params.limit]     - Max results (default 50, max 200).
   * @param {number} [params.skip=0]    - Documents to skip for pagination.
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async findByEntity(params, session) {
    assertPlainObject(params, "params");

    const { entityId, entityType, limit, skip = 0 } = params;

    assertValidPagination(skip, limit);

    return executeLeanQuery(
      this.#model
        .find({ entityId, entityType })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(resolveLimit(limit))
        .session(session ?? null),
    );
  }

  /**
   * Finds audit log entries performed by a specific actor (user or system).
   *
   * Results are sorted newest-first.  `limit` is clamped to MAX_PAGE_LIMIT
   * (200) — values above this are silently bounded.
   *
   * @param {Object} params
   * @param {string} params.actorId    - ID of the actor who performed the action.
   * @param {number} [params.limit]    - Max results (default 50, max 200).
   * @param {number} [params.skip=0]   - Documents to skip for pagination.
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async findByActor(params, session) {
    assertPlainObject(params, "params");

    const { actorId, limit, skip = 0 } = params;

    assertValidPagination(skip, limit);

    return executeLeanQuery(
      this.#model
        .find({ actorId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(resolveLimit(limit))
        .session(session ?? null),
    );
  }

  /**
   * Finds audit log entries within a UTC date range.
   *
   * Both bounds are inclusive.  Results are sorted oldest-first —
   * chronological order is most natural for compliance reports and timelines.
   *
   * At least one of `from` or `to` MUST be provided.  Omitting both would
   * issue a full-collection scan — this is rejected as a caller error rather
   * than silently permitted.
   *
   * `limit` is clamped to MAX_PAGE_LIMIT (200) — values above this are
   * silently bounded.
   *
   * @param {Object} params
   * @param {Date}   [params.from]   - Range start, inclusive.
   * @param {Date}   [params.to]     - Range end, inclusive.
   * @param {number} [params.limit]  - Max results (default 50, max 200).
   * @param {number} [params.skip=0] - Documents to skip for pagination.
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   * @throws {RangeError} If neither `from` nor `to` is provided.
   */
  async findByDateRange(params, session) {
    assertPlainObject(params, "params");

    const { from, to, limit, skip = 0 } = params;

    // Require at least one bound.  An unbounded date range query on a
    // high-volume audit collection is a full-collection scan — this is
    // a caller bug, not a legitimate use case.
    if (from === undefined && to === undefined) {
      throw new RangeError(
        "AuditLogRepository: `findByDateRange` requires at least one of `from` or `to`.",
      );
    }

    assertValidPagination(skip, limit);

    const filter = { createdAt: {} };

    if (from !== undefined) filter.createdAt.$gte = from;
    if (to !== undefined) filter.createdAt.$lte = to;

    return executeLeanQuery(
      this.#model
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(resolveLimit(limit))
        .session(session ?? null),
    );
  }

  /**
   * Finds audit log entries matching an arbitrary filter object.
   *
   * Intended for multi-field queries from the service layer where
   * single-concern methods (findByActor, findByDateRange) are insufficient.
   * The filter object is passed directly to Mongoose — callers are
   * responsible for constructing valid query shapes.
   *
   * Results are sorted newest-first.
   *
   * @param {Object} params
   * @param {Object} params.filter   - Mongoose-compatible filter object.
   * @param {number} [params.skip=0]
   * @param {number} [params.limit]
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async findWithFilter({ filter = {}, skip = 0, limit, sort }, session) {
    assertPlainObject(filter, "filter");
    assertValidPagination(skip, limit);

    // Default to createdAt DESC if no sort is supplied.
    // Explicit sort from the service takes precedence.
    const sortStage = sort?.field
      ? { [sort.field]: sort.direction }
      : { createdAt: -1 };

    return executeLeanQuery(
      this.#model
        .find(filter)
        .sort(sortStage)
        .skip(skip)
        .limit(resolveLimit(limit))
        .session(session ?? null),
    );
  }

  /**
   * Counts audit log entries matching an arbitrary filter object.
   * Paired with findWithFilter for paginated list responses.
   *
   * @param {Object} filter  - Mongoose-compatible filter object.
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<number>}
   */
  async countWithFilter(filter = {}, session) {
    assertPlainObject(filter, "filter");

    return this.#model.countDocuments(filter).session(session ?? null);
  }

  /* ─── Writes ────────────────────────────────────────────────────────────── */

  /**
   * Creates a single audit log entry.
   *
   * This is the ONLY write operation on this repository.
   * Audit logs are append-only — there are intentionally no update or
   * delete methods.  See module-level append-only contract.
   *
   * Uses LEAN_OPTIONS via toObject() to guarantee the same field shape
   * as all read paths — callers always receive a consistent structure.
   *
   * Model.create with an array is used to support session forwarding —
   * the single-document overload does not accept a session option reliably
   * across all Mongoose versions.
   *
   * @param {Object} data
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object>>}
   */
  async create(data, session) {
    const [created] = await this.#model.create(
      [data],
      buildQueryOptions(session),
    );

    // toObject() with LEAN_OPTIONS matches the shape produced by all read
    // paths via executeLeanQuery — consistent field shape on every exit.
    return deepFreezeClone(created.toObject(LEAN_OPTIONS));
  }

  /**
   * Creates multiple audit log entries in a single operation.
   *
   * Used by bulk review workflows where N documents are reviewed in one
   * transaction and each needs its own audit entry. All entries are
   * inserted atomically within the supplied session.
   *
   * @param {Object[]} entries  - Array of audit log data objects.
   * @param {import("mongoose").ClientSession} [session]
   * @returns {Promise<Readonly<Object[]>>}
   */
  async createMany(entries, session) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new RangeError(
        "AuditLogRepository: `createMany` requires a non-empty array.",
      );
    }

    const created = await this.#model.create(
      entries,
      buildQueryOptions(session),
    );

    return deepFreezeClone(created.map((doc) => doc.toObject(LEAN_OPTIONS)));
  }
}

// Import the model so the repository has its data source
import AuditLog from "../models/AuditLog.js";

// Export a singleton instance as the default export
export const auditLogRepository = new AuditLogRepository(AuditLog);
export default auditLogRepository;
