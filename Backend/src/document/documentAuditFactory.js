/**
 * @file documentAuditFactory.js
 * @module document/documentAuditFactory
 * @description Pure factory functions for constructing immutable AuditLog entry
 *              payloads for document review actions in the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Validate all parameters at the infrastructure boundary (fail fast)
 *  • Map document actions to canonical audit action strings via explicit map
 *  • Construct fully immutable AuditLog entry DTOs (deep-frozen)
 *  • Support optional correlation/trace metadata for future observability
 *
 * This module intentionally does NOT:
 *  • Import or reference the Mongoose AuditLog model
 *  • Perform any I/O or async operations
 *  • Contain business rules or state-transition logic
 *
 * Immutability contract
 * ─────────────────────
 *  All returned objects are deep-frozen. Any attempt to mutate an audit
 *  entry after construction will throw in strict mode and fail silently
 *  in non-strict mode — both are preferable to silent data corruption on
 *  compliance-sensitive audit payloads.
 */

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Canonical audit action strings persisted in the AuditLog collection.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DOCUMENT_AUDIT_ACTIONS = Object.freeze({
  approved: "DOCUMENT_APPROVED",
  rejected: "DOCUMENT_REJECTED",
  resubmission_required: "DOCUMENT_RESUBMISSION_REQUESTED",
});

const AUDIT_STATUS_SUCCESS = "SUCCESS";

/* ─────────────────────────────────────────────
   INTERNAL — DEEP FREEZE
───────────────────────────────────────────── */

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
    return obj;
  }

  const shouldRecurse = Array.isArray(obj) || isPlainObject(obj);

  if (!shouldRecurse) return Object.freeze(obj);

  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }

  return obj;
}

/* ─────────────────────────────────────────────
   INTERNAL — PARAMETER VALIDATION
───────────────────────────────────────────── */

/**
 * Required fields that must be non-empty strings.
 */
const REQUIRED_STRING_FIELDS = [
  "adminId",
  "userId",
  "docId",
  "documentType",
  "action",
  "previousStatus",
];

function assertValidAuditParams(params) {
  if (
    params === null ||
    typeof params !== "object" ||
    Array.isArray(params) ||
    !isPlainObject(params)
  ) {
    throw new TypeError("documentAuditFactory: params must be a plain object.");
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = params[field];

    if (typeof value !== "string") {
      throw new TypeError(
        `documentAuditFactory: "${field}" must be a string, received ${typeof value}.`,
      );
    }

    if (value.trim().length === 0) {
      throw new RangeError(
        `documentAuditFactory: "${field}" must not be empty.`,
      );
    }
  }

  if (!DOCUMENT_AUDIT_ACTIONS[params.action]) {
    throw new RangeError(
      `documentAuditFactory: action "${params.action}" is not allowed. ` +
        `Expected one of: ${Object.keys(DOCUMENT_AUDIT_ACTIONS).join(", ")}.`,
    );
  }

  for (const field of ["reason", "ip", "userAgent"]) {
    const value = params[field];

    if (value !== null && typeof value !== "string") {
      throw new TypeError(
        `documentAuditFactory: "${field}" must be a string or null, ` +
          `received ${typeof value}.`,
      );
    }
  }

  for (const field of ["requestId", "correlationId"]) {
    const value = params[field];

    if (value !== undefined && typeof value !== "string") {
      throw new TypeError(
        `documentAuditFactory: "${field}" must be a string if provided, ` +
          `received ${typeof value}.`,
      );
    }
  }
}

/* ─────────────────────────────────────────────
   INTERNAL — CONSTRUCTION
───────────────────────────────────────────── */

/**
 * Builds the metadata sub-object for flexible extra data.
 */
function buildMetadata(params) {
  const metadata = {};

  if (params.requestId !== undefined) metadata.requestId = params.requestId;
  if (params.correlationId !== undefined)
    metadata.correlationId = params.correlationId;

  if (
    Array.isArray(params.documentsRequired) &&
    params.documentsRequired.length > 0
  ) {
    metadata.documentsRequired = params.documentsRequired;
  }

  return metadata;
}

/**
 * Constructs the full audit entry mapped to the AuditLog schema fields:
 *
 *  factory param  →  schema field
 *  ─────────────────────────────
 *  adminId        →  actorId
 *  userId         →  targetId  (targetType: "user")
 *  docId          →  documentId
 *  documentType   →  documentType
 *  action         →  action (mapped via DOCUMENT_AUDIT_ACTIONS)
 *  previousStatus →  previousStatus
 *  newStatus      →  newStatus  (falls back to action value)
 *  reason         →  reason
 *  ip             →  ip
 *  userAgent      →  userAgent
 */
function buildAuditEntry(params) {
  return deepFreeze({
    action: DOCUMENT_AUDIT_ACTIONS[params.action],
    actorId: params.adminId,
    targetId: params.userId,
    targetType: "document",
    documentId: params.docId,
    documentType: params.documentType,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus ?? params.action,
    reason: params.reason,
    ip: params.ip,
    userAgent: params.userAgent,
    status: AUDIT_STATUS_SUCCESS,
    metadata: buildMetadata(params),
  });
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Builds an immutable AuditLog entry for a single-document review action.
 *
 * @param   {BaseAuditParams} params
 * @returns {Readonly<AuditEntry>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createDocumentAuditEntry(params) {
  assertValidAuditParams(params);
  return buildAuditEntry(params);
}

/**
 * Builds an immutable AuditLog entry for a document processed inside a
 * bulk action.
 *
 * @param   {BaseAuditParams} params
 * @returns {Readonly<AuditEntry>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createBulkDocumentAuditEntry(params) {
  assertValidAuditParams(params);
  return buildAuditEntry(params);
}
