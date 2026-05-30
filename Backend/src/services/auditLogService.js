/**
 * @file auditLogService.js
 * @module services/auditLogService
 *
 * Query service for the audit log read layer.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Accept validated, coerced params from the controller layer
 *  • Build repository-compatible query params (skip, limit, filters)
 *  • Compose multi-field filters the repository doesn't support natively
 *  • Enforce query cost controls (date range windows, pagination caps)
 *  • Return paginated, serialisation-ready response shapes
 *
 * This service intentionally does NOT:
 *  • construct Mongoose queries directly
 *  • write to the audit log (auditService.js owns all writes)
 *  • perform authorization
 *  • validate raw HTTP input (belongs in the controller / DTO layer)
 *
 * Future evolution paths (not yet needed at current scale):
 *  • Cursor/seek pagination for very large datasets
 *  • DB-agnostic filter specification objects
 *  • Read DTOs / projection serializers
 *  • Query observability / latency metrics
 *  • Caching (append-only log is a good cache candidate)
 *  • Full-text search / SIEM integration
 */

import { auditLogRepository } from "../repositories/AuditLogRepository.js";
import { ValidationError } from "../errors/index.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Maximum date range window a caller may request in a single query.
 *
 * Prevents full-collection scans on high-volume audit collections.
 * An admin requesting 6+ months of logs should use an export pipeline,
 * not a paginated API endpoint.
 *
 * 90 days covers all realistic compliance review windows.
 */
const MAX_DATE_RANGE_DAYS = 90;
const MAX_DATE_RANGE_MS = MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Fields returned on list responses.
 *
 * List payloads intentionally omit large fields (metadata, userAgent)
 * that are only needed on the detail view. This keeps list responses
 * lightweight and avoids over-fetching on paginated admin tables.
 *
 * The detail endpoint (getAuditLogById) returns the full document.
 */
const LIST_PROJECTION = Object.freeze([
  "_id",
  "action",
  "actorId",
  "targetId",
  "targetType",
  "documentId",
  "documentType",
  "previousStatus",
  "newStatus",
  "status",
  "reason",
  "ip",
  "createdAt",
]);

/**
 * Allowed sort fields and their canonical Mongo sort values.
 *
 * Explicit allowlist prevents callers from sorting on unindexed fields
 * and makes the sort contract visible at the service boundary.
 * All allowed fields have corresponding indexes on the AuditLog model.
 */
const SORT_FIELDS = Object.freeze({
  createdAt: "createdAt",
  action: "action",
  actorId: "actorId",
  status: "status",
});

const SORT_DIRECTIONS = Object.freeze({
  asc: 1,
  desc: -1,
});

const DEFAULT_SORT_FIELD = SORT_FIELDS.createdAt;
const DEFAULT_SORT_DIRECTION = "desc";

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Resolves safe, in-range pagination values from caller-supplied input.
 * Coercion already happened in the DTO layer — this is a safety net only.
 *
 * @param {number} [page]
 * @param {number} [limit]
 * @returns {{ safePage: number, safeLimit: number, skip: number }}
 */
function resolvePagination(page, limit) {
  const safePage = Math.max(parseInt(page, 10) || DEFAULT_PAGE, 1);
  const safeLimit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (safePage - 1) * safeLimit;

  return { safePage, safeLimit, skip };
}

/**
 * Resolves a safe, explicit sort object from caller-supplied input.
 *
 * Falls back to createdAt DESC — the most useful default for audit
 * log consumers (newest activity first).
 *
 * @param {string} [sortBy]
 * @param {string} [sortDir]
 * @returns {{ field: string, direction: number }}
 */
function resolveSort(sortBy, sortDir) {
  const field = SORT_FIELDS[sortBy] ?? DEFAULT_SORT_FIELD;
  const direction =
    SORT_DIRECTIONS[sortDir?.toLowerCase()] ??
    SORT_DIRECTIONS[DEFAULT_SORT_DIRECTION];

  return { field, direction };
}

/**
 * Asserts that a requested date range does not exceed MAX_DATE_RANGE_DAYS.
 *
 * Only enforced when both bounds are present — a half-open range
 * (from only, or to only) is bounded by the repository's own
 * pagination ceiling and is not a full-collection scan risk.
 *
 * @param {Date|undefined} from
 * @param {Date|undefined} to
 * @throws {ValidationError} If the range exceeds the allowed window.
 */
function assertDateRangeWindow(from, to) {
  if (!from || !to) return;

  const rangeMs = to.getTime() - from.getTime();

  if (rangeMs < 0) {
    throw new ValidationError(
      "`from` must be earlier than or equal to `to`.",
      "INVALID_DATE_RANGE",
    );
  }

  if (rangeMs > MAX_DATE_RANGE_MS) {
    throw new ValidationError(
      `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days. Use an export pipeline for larger ranges.`,
      "DATE_RANGE_TOO_LARGE",
    );
  }
}

/**
 * Builds a plain pagination meta block for response envelopes.
 *
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {Object}
 */
function buildPaginationMeta(total, page, limit) {
  const pages = Math.ceil(total / limit) || 1;

  return {
    total,
    page,
    pages,
    limit,
    hasNextPage: page < pages,
  };
}

/**
 * Projects a full audit log entry down to the list payload shape.
 *
 * Keeps list responses lightweight — metadata and userAgent are omitted
 * and only available on the detail endpoint.
 *
 * @param {Object} entry
 * @returns {Object}
 */
function toListEntry(entry) {
  return LIST_PROJECTION.reduce((acc, field) => {
    if (entry[field] !== undefined) {
      acc[field] = entry[field];
    }
    return acc;
  }, {});
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class AuditLogService {
  /* ─────────────────────────────────────────
     LIST — filtered, paginated
  ───────────────────────────────────────── */

  /**
   * Returns a paginated list of audit log entries.
   *
   * Supported filters (all optional, combinable):
   *   actorId    — entries performed by a specific admin / user
   *   targetId   — entries affecting a specific user or resource
   *   action     — specific action string, e.g. "DOCUMENT_APPROVED"
   *   targetType — "user" | "broadcast" | "document"
   *   status     — "SUCCESS" | "FAILURE"
   *   from       — createdAt range start (inclusive, Date)
   *   to         — createdAt range end   (inclusive, Date)
   *   sortBy     — field to sort by (default: createdAt)
   *   sortDir    — "asc" | "desc" (default: "desc")
   *
   * Cost controls
   * ─────────────
   * • Pagination is capped at MAX_LIMIT (100) entries per page.
   * • When both `from` and `to` are supplied, the range window is
   *   capped at MAX_DATE_RANGE_DAYS (90). Half-open ranges are
   *   bounded by the repository pagination ceiling instead.
   *
   * List projection
   * ───────────────
   * List responses return LIST_PROJECTION fields only. Full entries
   * (including metadata and userAgent) are available via getAuditLogById.
   *
   * @param {Object}  params
   * @param {string}  [params.actorId]
   * @param {string}  [params.targetId]
   * @param {string}  [params.action]
   * @param {string}  [params.targetType]
   * @param {string}  [params.status]
   * @param {Date}    [params.from]
   * @param {Date}    [params.to]
   * @param {string}  [params.sortBy="createdAt"]
   * @param {string}  [params.sortDir="desc"]
   * @param {number}  [params.page=1]
   * @param {number}  [params.limit=20]
   *
   * @returns {Promise<{
   *   data: Object[],
   *   pagination: {
   *     total: number,
   *     page: number,
   *     pages: number,
   *     limit: number,
   *     hasNextPage: boolean
   *   },
   *   sort: { field: string, direction: number }
   * }>}
   */
  async getAuditLogs({
    actorId,
    targetId,
    action,
    targetType,
    status,
    from,
    to,
    sortBy,
    sortDir,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
  } = {}) {
    // ── Cost control ──────────────────────────────────────────────────────
    assertDateRangeWindow(from, to);

    const { safePage, safeLimit, skip } = resolvePagination(page, limit);
    const sort = resolveSort(sortBy, sortDir);

    // ── Build filter ──────────────────────────────────────────────────────
    const filter = {};

    if (actorId) filter.actorId = actorId;
    if (targetId) filter.targetId = targetId;
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;
    if (status) filter.status = status;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    // ── Delegate to repository ────────────────────────────────────────────
    const [entries, total] = await Promise.all([
      auditLogRepository.findWithFilter({
        filter,
        skip,
        limit: safeLimit,
        sort,
      }),

      auditLogRepository.countWithFilter(filter),
    ]);

    return {
      data: entries.map(toListEntry),
      pagination: buildPaginationMeta(total, safePage, safeLimit),
      sort,
    };
  }

  /* ─────────────────────────────────────────
     SINGLE ENTRY BY ID
  ───────────────────────────────────────── */

  /**
   * Returns a single audit log entry by its ID.
   * Returns the full document — including metadata and userAgent.
   * Throws NotFoundError if the entry does not exist.
   *
   * @param {string} id
   * @returns {Promise<Readonly<Object>>}
   * @throws {NotFoundError}
   */
  async getAuditLogById(id) {
    return auditLogRepository.getById(id);
  }
}

export default new AuditLogService();
