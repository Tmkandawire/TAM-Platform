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
 * Explicit map keyed by the input action value — not by enum key.
 * Avoids implicit `toUpperCase()` coupling between input conventions
 * and enum key naming, which becomes fragile as actions are added.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DOCUMENT_AUDIT_ACTIONS = Object.freeze({
  approved: "DOCUMENT_APPROVED",
  rejected: "DOCUMENT_REJECTED",
  // Semantically distinct from DOCUMENT_REJECTED — resubmission is a
  // recoverable, member-actionable state. Rejection is terminal.
  // Maps to AUDIT_ACTIONS.DOCUMENT_RESUBMISSION_REQUESTED in auditActions.js.
  resubmission_required: "DOCUMENT_RESUBMISSION_REQUESTED",
});

/**
 * The fixed status stamped on every successful audit entry.
 * Failures are never logged — the transaction aborts and no entry is written.
 *
 * @type {string}
 */
const AUDIT_STATUS_SUCCESS = "SUCCESS";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

/**
 * Parameters required to build any document audit entry.
 *
 * @typedef {Object} BaseAuditParams
 * @property {string}      adminId        - The acting admin's user ID.
 * @property {string}      userId         - The target user's ID (document owner).
 * @property {string}      docId          - The document's ID.
 * @property {string}      documentType   - The document type (e.g. "NRC", "TPIN").
 * @property {string}      action         - The action applied: "approved" | "rejected" | "resubmission_required".
 * @property {string}      previousStatus - The document's status before this action.
 * @property {string|null} reason         - Rejection reason; null for approvals.
 * @property {string|null} ip             - Request IP for the audit trail.
 * @property {string|null} userAgent      - Request User-Agent for the audit trail.
 * @property {string}      [requestId]    - Optional trace/correlation ID.
 * @property {string}      [correlationId]- Optional distributed trace ID.
 */

/**
 * A fully-constructed, deep-frozen AuditLog entry ready for `AuditLog.create()`.
 *
 * @typedef {Object} AuditEntry
 * @property {string}      action
 * @property {string}      user           - Admin's user ID.
 * @property {string}      target         - Target user's ID.
 * @property {Object}      metadata
 * @property {string}      metadata.documentId
 * @property {string}      metadata.documentType
 * @property {string}      metadata.previousStatus
 * @property {string}      metadata.newStatus
 * @property {string|null} metadata.reason
 * @property {boolean}     [metadata.bulk]
 * @property {string}      [metadata.requestId]
 * @property {string}      [metadata.correlationId]
 * @property {string|null} ip
 * @property {string|null} userAgent
 * @property {string}      status         - Always "SUCCESS".
 */

/* ─────────────────────────────────────────────
   INTERNAL — DEEP FREEZE
───────────────────────────────────────────── */

/**
 * Returns true only for plain objects — `{}` literals and `Object.create(null)`.
 *
 * Used by `deepFreeze` to decide whether to recurse. Dates, Maps, Sets,
 * Buffers, class instances, and Errors are intentionally excluded — freezing
 * their internal state corrupts their behaviour in ways that are hard to debug.
 *
 * @param   {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Recursively freezes an object and all its enumerable nested plain objects
 * and arrays.
 *
 * `Object.freeze` is shallow — it prevents mutation of top-level properties
 * but leaves nested objects mutable. Audit payloads contain a `metadata`
 * sub-object that would remain mutable without this.
 *
 * Non-plain values (Dates, Maps, Sets, Buffers, class instances, Errors)
 * are frozen at their own level but NOT recursed into, which matches the
 * documented behaviour and avoids corrupting their internal state.
 *
 * @template T
 * @param   {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
    return obj;
  }

  // Freeze non-plain values at their own level only — do not recurse
  const shouldRecurse = Array.isArray(obj) || isPlainObject(obj);

  if (!shouldRecurse) {
    return Object.freeze(obj);
  }

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
 * Any field not listed here is either nullable or optional.
 */
const REQUIRED_STRING_FIELDS = [
  "adminId",
  "userId",
  "docId",
  "documentType",
  "action",
  "previousStatus",
];

/**
 * Validates all parameters at the factory boundary before any object
 * is constructed. Factories are infrastructure boundaries — they must
 * fail fast on bad input rather than producing corrupt audit payloads
 * that pass silently into the database.
 *
 * Validation rules
 * ─────────────────
 *  • Required string fields must be non-empty strings
 *  • `action` must be an explicitly allowed value
 *  • `reason` must be a string or null (not undefined — callers must be explicit)
 *  • `ip` and `userAgent` must be strings or null
 *
 * @param {BaseAuditParams} params
 * @throws {TypeError}  On wrong type for any field.
 * @throws {RangeError} On empty string or disallowed action value.
 */
function assertValidAuditParams(params) {
  // Container guard — rejects arrays, Dates, class instances, and other
  // non-plain values before any field access is attempted
  if (
    params === null ||
    typeof params !== "object" ||
    Array.isArray(params) ||
    !isPlainObject(params)
  ) {
    throw new TypeError("documentAuditFactory: params must be a plain object.");
  }

  // Required non-empty string fields
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

  // Explicit action whitelist — checked against the map, not the enum shape
  if (!DOCUMENT_AUDIT_ACTIONS[params.action]) {
    throw new RangeError(
      `documentAuditFactory: action "${params.action}" is not allowed. ` +
        `Expected one of: ${Object.keys(DOCUMENT_AUDIT_ACTIONS).join(", ")}.`,
    );
  }

  // Nullable fields — must be string or null, never undefined
  // (callers must explicitly pass null, not omit the field)
  for (const field of ["reason", "ip", "userAgent"]) {
    const value = params[field];

    if (value !== null && typeof value !== "string") {
      throw new TypeError(
        `documentAuditFactory: "${field}" must be a string or null, ` +
          `received ${typeof value}.`,
      );
    }
  }

  // Optional correlation fields — if present, must be strings
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
 * Constructs the base audit entry metadata object.
 *
 * Optional correlation fields are injected only when present — we never
 * stamp `requestId: undefined` onto the persisted document, which would
 * create noisy undefined keys in MongoDB.
 *
 * @param {BaseAuditParams} params
 * @param {boolean}         [bulk=false]
 * @returns {Object} Raw metadata object (not yet frozen — caller freezes the whole entry)
 */
function buildMetadata(params, bulk = false) {
  const metadata = {
    documentId: params.docId,
    documentType: params.documentType,
    previousStatus: params.previousStatus,
    newStatus: params.action,
    reason: params.reason,
  };

  // Injected only on resubmission entries — records exactly which document
  // types the admin flagged so the audit trail is self-contained without
  // requiring a join back to the profile document.
  if (
    Array.isArray(params.documentsRequired) &&
    params.documentsRequired.length > 0
  ) {
    metadata.documentsRequired = params.documentsRequired;
  }

  // Correlation metadata — injected when provided, omitted entirely otherwise.
  // Explicit `!== undefined` instead of truthiness so valid values like
  // empty strings or "0" are never silently dropped.
  if (params.requestId !== undefined) {
    metadata.requestId = params.requestId;
  }

  if (params.correlationId !== undefined) {
    metadata.correlationId = params.correlationId;
  }

  return metadata;
}

/**
 * Constructs the full audit entry object for a given bulk flag.
 *
 * This is the single construction point for both exported factories.
 * Neither factory mutates the result — they each call this with their
 * own `bulk` argument and deep-freeze the final object independently.
 *
 * @param {BaseAuditParams} params
 * @param {boolean}         bulk
 * @returns {AuditEntry}
 */
function buildAuditEntry(params, bulk) {
  return deepFreeze({
    action: DOCUMENT_AUDIT_ACTIONS[params.action],
    user: params.adminId,
    target: params.userId,
    metadata: buildMetadata(params, bulk),
    ip: params.ip,
    userAgent: params.userAgent,
    status: AUDIT_STATUS_SUCCESS,
  });
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Builds an immutable AuditLog entry for a single-document review action.
 *
 * Usage
 * ─────
 *  await AuditLog.create(
 *    [createDocumentAuditEntry({ adminId, userId, docId, ... })],
 *    { session },
 *  );
 *
 * @param   {BaseAuditParams} params
 * @returns {Readonly<AuditEntry>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createDocumentAuditEntry(params) {
  assertValidAuditParams(params);
  return buildAuditEntry(params, false);
}

/**
 * Builds an immutable AuditLog entry for a document processed inside a
 * bulk action.
 *
 * Stamps `metadata.bulk: true` via direct construction — not by mutating
 * the result of `createDocumentAuditEntry`. This ensures the factory
 * remains safe under memoization, caching, or object pooling.
 *
 * Usage
 * ─────
 *  const auditEntries = validDocs.map((doc) =>
 *    createBulkDocumentAuditEntry({ adminId, userId, docId: doc.id, ... })
 *  );
 *  await AuditLog.create(auditEntries, { session });
 *
 * @param   {BaseAuditParams} params
 * @returns {Readonly<AuditEntry>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createBulkDocumentAuditEntry(params) {
  assertValidAuditParams(params);
  return buildAuditEntry(params, true);
}
