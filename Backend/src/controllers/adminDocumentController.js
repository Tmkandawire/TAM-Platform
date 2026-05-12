/**
 * @file adminDocumentController.js
 * @module controllers/adminDocument
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Validate and coerce all HTTP boundary inputs (params, query, body)
 * - Delegate business logic entirely to adminDocumentService
 * - Return canonical ApiResponse envelopes
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - Document state transitions  → adminDocumentService
 * - Audit logging               → handled inside adminDocumentService
 * - Role enforcement            → RBAC middleware upstream
 *
 * IP extraction
 * ─────────────────────────────────────────────
 * req.ip is used directly. Express resolves the real client IP when
 * app.set("trust proxy", 1) is configured at the infrastructure level.
 * Manual x-forwarded-for parsing is intentionally avoided — it is a
 * leaky abstraction that duplicates infrastructure responsibility and
 * will drift from the platform standard.
 *
 * Pagination performance
 * ─────────────────────────────────────────────
 * Deep pagination (high page × limit) causes MongoDB to skip large
 * numbers of documents, degrading query performance. MAX_OFFSET caps
 * the computed skip value. Requests exceeding this ceiling receive a
 * 400 rather than a slow or unpredictable query. Cursor-based pagination
 * should be used for result sets beyond this threshold.
 *
 * Priority normalisation
 * ─────────────────────────────────────────────
 * The HTTP boundary accepts lowercase priority values ("high", "medium")
 * for API consistency. The service layer uses uppercase ("HIGH", "MEDIUM")
 * internally. Normalisation happens at the controller boundary via
 * normalizePriority() — the service always receives the casing it expects.
 *
 * Sort direction
 * ─────────────────────────────────────────────
 * sortOrder is not forwarded to the service — adminDocumentService
 * owns sort direction internally per sortBy case. Exposing sortOrder
 * as a client param is deferred until the service supports it.
 *
 * Bulk operations
 * ─────────────────────────────────────────────
 * bulkReviewDocuments validates the request body via adminBulkActionSchema
 * before delegating to the service. The service processes each document
 * independently and returns a partial success shape — some items may
 * succeed while others fail within the same request. The response uses
 * HTTP 207 Multi-Status via ApiResponse.partial() to signal mixed outcomes.
 */

import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import adminDocumentService from "../services/adminDocumentService.js";
import { ValidationError } from "../errors/index.js";
import { adminBulkActionSchema } from "../dto/adminBulkActionDto.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;
const MAX_PAGE = 1000;

/**
 * Maximum allowed skip value (page - 1) * limit.
 * Prevents deep pagination queries that degrade MongoDB performance.
 * At MAX_LIMIT=50 this allows up to page 100 at full limit (5000 docs skipped).
 */
const MAX_OFFSET = 5000;

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "expired",
  "resubmission_required",
]);

const VALID_DOCUMENT_TYPES = new Set([
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
]);

/**
 * Valid priority values at the HTTP boundary — lowercase for API consistency.
 * Normalised to uppercase before reaching the service via normalizePriority().
 *
 * "low" and "urgent" map to the service's default threshold (0) —
 * included for client-facing expressiveness even though the service
 * treats them identically to an absent priority filter.
 */
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

/**
 * Priority normalisation map.
 * Controller accepts lowercase; service expects uppercase.
 * Defined explicitly rather than .toUpperCase() to make the
 * controller→service contract visible and catch mismatches at review time.
 */
const PRIORITY_NORMALISATION_MAP = Object.freeze({
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
});

/**
 * Valid sortBy values — aligned with the service's sort switch cases.
 * "oldest", "newest", "priority" are the only values the service handles.
 * Sending any other value falls through to the default (priority sort).
 */
const VALID_SORT_FIELDS = new Set(["oldest", "newest", "priority"]);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Validates a route param or auth token field as a well-formed MongoDB ObjectId.
 * Used for route params (userId, docId) and req.user.id — making the
 * upstream auth middleware trust boundary explicit rather than implicit.
 *
 * @param {string} id
 * @param {string} fieldName
 * @throws {ValidationError}
 */
function assertValidObjectId(id, fieldName = "id") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be a valid MongoDB ObjectId.`,
      "INVALID_ID",
    );
  }
}

/**
 * Validates a rejection reason string and returns the trimmed value.
 * Combining validation and trimming here means call sites receive a
 * clean string directly — no second .trim() call needed.
 *
 * @param {unknown} reason
 * @returns {string} Trimmed, validated reason string.
 * @throws {ValidationError}
 */
function assertValidReason(reason) {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw ValidationError.dto(
      "reason",
      "Rejection reason is required.",
      "MISSING_VALUE",
    );
  }

  const trimmed = reason.trim();

  if (trimmed.length < REASON_MIN_LENGTH) {
    throw ValidationError.dto(
      "reason",
      `Rejection reason must be at least ${REASON_MIN_LENGTH} characters.`,
      "INVALID_VALUE",
    );
  }

  if (trimmed.length > REASON_MAX_LENGTH) {
    throw ValidationError.dto(
      "reason",
      `Rejection reason must not exceed ${REASON_MAX_LENGTH} characters.`,
      "INVALID_VALUE",
    );
  }

  return trimmed;
}

/**
 * Validates an optional enum query param against a Set of allowed values.
 * Returns undefined when absent — the service treats absent optional
 * filters as "no filter applied".
 *
 * @param {unknown}     value
 * @param {Set<string>} validValues
 * @param {string}      fieldName
 * @returns {string | undefined}
 * @throws {ValidationError}
 */
function assertValidEnumParam(value, validValues, fieldName) {
  if (value === undefined || value === null || value === "") return undefined;

  if (typeof value !== "string" || !validValues.has(value)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be one of: ${[...validValues].join(", ")}.`,
      "INVALID_VALUE",
    );
  }

  return value;
}

/**
 * Coerces and validates a pagination query param.
 * NaN throws — non-numeric input is a malformed request, not a default.
 * Out-of-range values are clamped silently.
 *
 * @param {unknown} raw
 * @param {{ defaultValue: number, min: number, max: number, fieldName: string }} opts
 * @returns {number}
 * @throws {ValidationError}
 */
function coercePaginationParam(raw, { defaultValue, min, max, fieldName }) {
  if (raw === undefined || raw === null) return defaultValue;

  const parsed = parseInt(raw, 10);

  if (Number.isNaN(parsed)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be a positive integer.`,
      "INVALID_VALUE",
    );
  }

  return Math.min(Math.max(parsed, min), max);
}

/**
 * Validates that the computed pagination offset does not exceed MAX_OFFSET.
 * Checked after both params are resolved — catches combinations like
 * page=200, limit=50 that individually pass their own bounds but produce
 * a damaging DB skip together.
 *
 * @param {number} page
 * @param {number} limit
 * @throws {ValidationError}
 */
function assertOffsetWithinBounds(page, limit) {
  const offset = (page - 1) * limit;

  if (offset > MAX_OFFSET) {
    throw ValidationError.dto(
      "page",
      "Requested page exceeds the maximum allowed offset. Use cursor-based pagination for deeper result sets.",
      "INVALID_VALUE",
    );
  }
}

/**
 * Normalises a validated lowercase priority value to the uppercase
 * string the service expects.
 *
 * Returns undefined when priority is absent — the service treats
 * an absent priority as "no priority filter applied".
 *
 * @param {string | undefined} priority
 * @returns {string | undefined}
 */
function normalizePriority(priority) {
  if (priority === undefined) return undefined;
  return PRIORITY_NORMALISATION_MAP[priority];
}

/**
 * Builds the standard reqInfo object propagated into every service call.
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
 * GET /admin/documents
 *
 * Returns the filtered, prioritised review queue.
 * All filter params are optional — absent params are passed as undefined
 * and the service treats them as "no filter applied".
 */
export const getPendingDocuments = asyncHandler(async (req, res) => {
  const page = coercePaginationParam(req.query.page, {
    defaultValue: DEFAULT_PAGE,
    min: 1,
    max: MAX_PAGE,
    fieldName: "page",
  });

  const limit = coercePaginationParam(req.query.limit, {
    defaultValue: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
    fieldName: "limit",
  });

  assertOffsetWithinBounds(page, limit);

  const status = assertValidEnumParam(
    req.query.status,
    VALID_STATUSES,
    "status",
  );

  const documentType = assertValidEnumParam(
    req.query.documentType,
    VALID_DOCUMENT_TYPES,
    "documentType",
  );

  // Validated as lowercase, normalised to uppercase before the service call —
  // the service's #resolvePriorityThreshold() expects "HIGH" / "MEDIUM".
  const priority = normalizePriority(
    assertValidEnumParam(req.query.priority, VALID_PRIORITIES, "priority"),
  );

  const sortBy = assertValidEnumParam(
    req.query.sortBy,
    VALID_SORT_FIELDS,
    "sortBy",
  );

  // sortOrder is intentionally not forwarded to the service —
  // adminDocumentService owns sort direction internally per sortBy case.
  // Exposing sortOrder as a client param is deferred until the service
  // supports it to avoid silently ignoring the param.

  const result = await adminDocumentService.getPendingReviews({
    page,
    limit,
    status,
    documentType,
    priority,
    sortBy,
  });

  // Service returns pagination.totalProfiles — not pagination.total.
  // Field name preserved from service contract rather than aliased
  // to avoid masking future service shape changes.
  if (!result.data || result.data.length === 0) {
    const response = ApiResponse.empty(
      { page, limit },
      "No documents found in review queue.",
    );
    return res.status(response.statusCode).json(response);
  }

  const response = ApiResponse.paginated(
    result.data,
    {
      total: result.pagination.totalProfiles,
      page: result.pagination.page,
      limit,
    },
    "Review queue fetched successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * PATCH /admin/documents/:userId/:docId/approve
 *
 * Approves a single document. Both route params and req.user.id
 * validated as ObjectIds before the service is called.
 */
export const approveDocument = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  assertValidObjectId(req.user.id, "adminId");
  assertValidObjectId(userId, "userId");
  assertValidObjectId(docId, "docId");

  // Service method is reviewDocument() — not updateDocumentStatus().
  const updatedProfile = await adminDocumentService.reviewDocument({
    adminId: req.user.id,
    targetUserId: userId,
    documentId: docId,
    status: "approved",
    ...buildReqInfo(req),
  });

  const response = ApiResponse.ok(
    updatedProfile,
    "Document approved successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * PATCH /admin/documents/:userId/:docId/reject
 *
 * Rejects a single document. reason is validated and trimmed before
 * reaching the service — assertValidReason returns the trimmed string
 * directly so no second .trim() call is needed at the call site.
 */
export const rejectDocument = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  assertValidObjectId(req.user.id, "adminId");
  assertValidObjectId(userId, "userId");
  assertValidObjectId(docId, "docId");

  const trimmedReason = assertValidReason(req.body.reason);

  // Service method is reviewDocument() — not updateDocumentStatus().
  const updatedProfile = await adminDocumentService.reviewDocument({
    adminId: req.user.id,
    targetUserId: userId,
    documentId: docId,
    status: "rejected",
    reason: trimmedReason,
    ...buildReqInfo(req),
  });

  const response = ApiResponse.ok(
    updatedProfile,
    "Document rejected successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * POST /admin/documents/bulk-review
 *
 * Processes a batch of document review decisions in a single request.
 * Each document is processed independently — some may succeed while
 * others fail. The response always uses HTTP 207 Multi-Status so clients
 * know to inspect per-item outcomes rather than treating the status code
 * as a binary pass/fail signal.
 *
 * Validation via adminBulkActionSchema runs before the service is called.
 * Zod parse errors are mapped to ValidationError and forwarded to
 * errorMiddleware — the service is never reached with invalid input.
 */
export const bulkReviewDocuments = asyncHandler(async (req, res) => {
  assertValidObjectId(req.user.id, "adminId");

  // ── DTO validation ────────────────────────────────────────────────────
  // adminBulkActionSchema validates action, documents array (including
  // per-item ObjectId format and deduplication), and the conditional
  // reason requirement for rejections.
  const parsed = adminBulkActionSchema.safeParse(req.body);

  if (!parsed.success) {
    // Map Zod issues to the platform's typed ValidationError.
    // The first issue is used as the primary message; all issues are
    // forwarded in the errors array so clients can surface every problem
    // in a single round trip.
    const issues = parsed.error.issues;

    throw ValidationError.dto(
      issues[0]?.path?.join(".") ?? "body",
      issues[0]?.message ?? "Invalid request body.",
      "INVALID_BULK_PAYLOAD",
      issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const { action, documents, reason } = parsed.data;

  // ── Service delegation ────────────────────────────────────────────────
  // The service processes each document independently inside per-user
  // transactions and returns a partial success shape regardless of
  // individual outcomes — it never throws for item-level failures.
  const result = await adminDocumentService.bulkReviewDocuments({
    adminId: req.user.id,
    action,
    documents,
    reason: reason ?? null,
    ...buildReqInfo(req),
  });

  // ── Response ──────────────────────────────────────────────────────────
  // HTTP 207 — clients must inspect data.results and data.errors
  // to determine per-item outcomes. meta carries summary counts for
  // quick checks without iterating the full arrays.
  const response = ApiResponse.partial(
    {
      results: result.results,
      errors: result.errors,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
    },
    "Bulk review processed.",
  );

  return res.status(response.statusCode).json(response);
});

/**
 * PATCH /admin/documents/:userId/:docId/request-resubmission
 *
 * Requests resubmission of a specific document.
 *
 * Distinct from rejection — this is a soft, recoverable decision.
 * The document moves to "resubmission_required" status and the member
 * is told exactly which documents to re-upload and why, without losing
 * their application entirely.
 *
 * Body:
 *   reason            {string}   — Why resubmission is needed. Min 10 chars.
 *   documentsRequired {string[]} — Document types the member must re-upload.
 *                                  At least one required. Values must be valid
 *                                  DOCUMENT_TYPES from adminDocumentDto.js.
 *
 * Both fields are validated and sanitised before the service is called —
 * the service never receives empty reason strings or empty arrays.
 */
export const requestResubmission = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  assertValidObjectId(req.user.id, "adminId");
  assertValidObjectId(userId, "userId");
  assertValidObjectId(docId, "docId");

  // ── reason validation ─────────────────────────────────────────────────
  // Resubmission reason uses the same validator as rejection reason.
  // Both are admin-authored, member-facing strings — same length rules apply.
  const trimmedReason = assertValidReason(req.body.reason);

  // ── documentsRequired validation ──────────────────────────────────────
  // Must be a non-empty array of known document type strings.
  // Validated at the controller boundary — the service never receives
  // an empty array or unknown type strings.
  const { documentsRequired } = req.body;

  if (!Array.isArray(documentsRequired) || documentsRequired.length === 0) {
    throw ValidationError.dto(
      "documentsRequired",
      "At least one document type must be specified for resubmission.",
      "MISSING_VALUE",
    );
  }

  const invalidTypes = documentsRequired.filter(
    (type) => !VALID_DOCUMENT_TYPES.has(type),
  );

  if (invalidTypes.length > 0) {
    throw ValidationError.dto(
      "documentsRequired",
      `Invalid document type(s): ${invalidTypes.join(", ")}. Must be one of: ${[...VALID_DOCUMENT_TYPES].join(", ")}.`,
      "INVALID_VALUE",
    );
  }

  // Deduplicate — a client sending ["nationalId", "nationalId"] is a
  // client bug, not a reason to fail the request. Deduplicate silently
  // before the service call so the service always receives a clean array.
  const uniqueDocumentsRequired = [...new Set(documentsRequired)];

  const updatedProfile = await adminDocumentService.requestResubmission({
    adminId: req.user.id,
    targetUserId: userId,
    documentId: docId,
    reason: trimmedReason,
    documentsRequired: uniqueDocumentsRequired,
    ...buildReqInfo(req),
  });

  const response = ApiResponse.ok(
    updatedProfile,
    "Resubmission requested successfully.",
  );
  return res.status(response.statusCode).json(response);
});
