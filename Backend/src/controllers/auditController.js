/**
 * @file auditController.js
 * @module controllers/auditController
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Validate and coerce all HTTP boundary inputs (params, query)
 * - Delegate query logic entirely to auditLogService
 * - Return canonical ApiResponse envelopes
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - Filter composition / DB queries  → auditLogService
 * - Audit log writes                 → adminDocumentService / adminService
 * - Role enforcement                 → RBAC middleware upstream
 *
 * Pagination performance
 * ─────────────────────────────────────────────
 * MAX_OFFSET caps the computed skip value to prevent deep pagination
 * queries that degrade MongoDB performance. Requests exceeding this
 * ceiling receive a 400. Cursor-based pagination should be used for
 * result sets beyond this threshold.
 *
 * Date range enforcement
 * ─────────────────────────────────────────────
 * Date range validation (ordering, max window) is handled by
 * auditDto.js at the Zod layer — the controller receives clean,
 * coerced Date objects and does not re-validate them. The service
 * enforces the same window as a defence-in-depth guard for non-HTTP
 * callers (e.g. tests, internal scripts).
 *
 * DTO parsing strategy
 * ─────────────────────────────────────────────
 * auditLogQuerySchema validates and coerces the entire query object
 * in one pass via parseDto(). Individual manual coercion (as used in
 * adminDocumentController) is not used here because the audit query
 * has 10+ params — Zod parsing is cleaner and produces field-level
 * errors for every param in a single round trip.
 */

import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import auditLogService from "../services/auditLogService.js";
import { auditLogQuerySchema, auditLogByIdSchema } from "../dto/auditDto.js";
import { parseDto } from "../utils/parseDto.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum allowed skip value (page - 1) * limit.
 * Prevents deep pagination queries that degrade MongoDB performance.
 * At MAX_LIMIT=100 this allows up to page 50 at full limit (5000 docs skipped).
 * Mirrors the MAX_OFFSET ceiling used in adminDocumentController.
 */
const MAX_OFFSET = 5000;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Validates that the computed pagination offset does not exceed MAX_OFFSET.
 * Checked after Zod coercion — catches combinations like page=100, limit=100
 * that individually pass their own bounds but produce a damaging DB skip.
 *
 * @param {number} page
 * @param {number} limit
 * @throws {ValidationError}
 */
function assertOffsetWithinBounds(page, limit) {
  const offset = (page - 1) * limit;

  if (offset > MAX_OFFSET) {
    throw new Error(
      "Requested page exceeds the maximum allowed offset. Use cursor-based pagination for deeper result sets.",
    );
  }
}

/**
 * Builds the standard reqInfo object propagated into every service call.
 * Kept consistent with adminDocumentController and adminController.
 *
 * @param {import("express").Request} req
 * @returns {{ ip: string, userAgent: string, requestId: string }}
 */
function buildReqInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.context?.requestId,
  };
}

/* ─────────────────────────────────────────────
   HANDLERS
───────────────────────────────────────────── */

/**
 * GET /admin/audit-logs
 *
 * Returns a filtered, paginated list of audit log entries.
 *
 * All query params are optional and combinable. Absent params are treated
 * as "no filter applied" — the service returns the full log ordered by
 * createdAt DESC when no filters are supplied.
 *
 * Query params (all optional):
 *   page       {number}  - Page number. Default: 1. Max: capped by MAX_OFFSET.
 *   limit      {number}  - Entries per page. Default: 20. Max: 100.
 *   sortBy     {string}  - Field to sort by. Default: "createdAt".
 *   sortDir    {string}  - "asc" | "desc". Default: "desc".
 *   actorId    {string}  - ObjectId. Filter by admin who performed the action.
 *   targetId   {string}  - ObjectId. Filter by affected user or resource.
 *   action     {string}  - Audit action string, e.g. "DOCUMENT_APPROVED".
 *   targetType {string}  - "user" | "broadcast" | "document".
 *   status     {string}  - "SUCCESS" | "FAILURE".
 *   from       {string}  - ISO 8601 date. createdAt range start (inclusive).
 *   to         {string}  - ISO 8601 date. createdAt range end (inclusive).
 *
 * Date range constraint:
 *   When both `from` and `to` are provided, the range cannot exceed 90 days.
 *   Enforced at the DTO layer (Zod superRefine) and again in the service.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  // ── DTO validation ────────────────────────────────────────────────────
  // auditLogQuerySchema validates, coerces, and applies defaults in one pass.
  // Dates arrive as strings from the HTTP layer; the schema transforms them
  // to Date objects before the service is called.
  const {
    page,
    limit,
    sortBy,
    sortDir,
    actorId,
    targetId,
    action,
    targetType,
    status,
    from,
    to,
  } = parseDto(auditLogQuerySchema.safeParse(req.query), "query");

  // ── Offset guard ──────────────────────────────────────────────────────
  // Checked post-Zod so both page and limit are already clean integers.
  assertOffsetWithinBounds(page, limit);

  // ── Service delegation ────────────────────────────────────────────────
  const result = await auditLogService.getAuditLogs({
    actorId,
    targetId,
    action,
    targetType,
    status,
    from,
    to,
    sortBy,
    sortDir,
    page,
    limit,
  });

  // ── Response ──────────────────────────────────────────────────────────
  if (!result.data || result.data.length === 0) {
    const response = ApiResponse.empty(
      { page, limit },
      "No audit log entries found.",
    );
    return res.status(response.statusCode).json(response);
  }

  const response = ApiResponse.paginated(
    result.data,
    {
      total: result.pagination.total,
      page: result.pagination.page,
      limit,
    },
    "Audit logs retrieved successfully.",
  );

  return res.status(response.statusCode).json(response);
});

/**
 * GET /admin/audit-logs/:id
 *
 * Returns a single audit log entry by its ID.
 * Returns the full document including metadata and userAgent —
 * unlike the list endpoint which projects to lightweight fields only.
 *
 * Route params:
 *   id {string} — MongoDB ObjectId of the audit log entry.
 */
export const getAuditLogById = asyncHandler(async (req, res) => {
  // ── DTO validation ────────────────────────────────────────────────────
  // auditLogByIdSchema validates params.id as a well-formed ObjectId.
  // Manual assertValidObjectId is not used here — the schema is the
  // canonical validator for this endpoint and produces a consistent
  // field-level error without duplicating the ObjectId check.
  const { id } = parseDto(
    auditLogByIdSchema.safeParse({ params: req.params }),
    "params",
  ).params;

  // ── Service delegation ────────────────────────────────────────────────
  // auditLogService.getAuditLogById throws NotFoundError if the entry
  // does not exist — errorMiddleware maps it to a 404 response.
  const entry = await auditLogService.getAuditLogById(id);

  const response = ApiResponse.ok(
    entry,
    "Audit log entry retrieved successfully.",
  );
  return res.status(response.statusCode).json(response);
});
