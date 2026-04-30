/**
 * @file documentEventFactory.js
 * @module document/documentEventFactory
 * @description Pure factory functions for constructing immutable domain event
 *              descriptors for document review actions in the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Validate all parameters at the infrastructure boundary (fail fast)
 *  • Resolve event types via a module-level explicit map (not per-call)
 *  • Construct fully immutable event descriptors (deep-frozen)
 *  • Support optional correlation/trace metadata for distributed observability
 *  • Stamp a `version` field on every payload for consumer contract evolution
 *
 * This module intentionally does NOT:
 *  • Import `eventBus` or call `.emit()` — emission stays in the service layer
 *  • Contain business rules or state-transition logic
 *  • Perform any I/O or async operations
 *
 * Immutability contract
 * ─────────────────────
 *  All returned descriptors are deep-frozen. Events are immutable system facts —
 *  once constructed they describe something that happened and must not be altered.
 *  Mutation after construction is a programming error that will throw in strict
 *  mode, which is preferable to silent corruption of the event stream.
 *
 * Event versioning
 * ─────────────────
 *  Every payload carries `version: 1`. When the payload shape changes in a
 *  breaking way, bump this version. Consumers can branch on `payload.version`
 *  to handle migrations without a hard cutover.
 *
 * Correlation metadata
 * ─────────────────────
 *  Optional fields (`requestId`, `correlationId`, `traceId`, `causationId`)
 *  are injected into the payload when provided and omitted entirely otherwise.
 *  This keeps MongoDB documents and event logs clean while making the factory
 *  ready for distributed tracing without any service-layer changes.
 *
 * Architectural note — Outbox Pattern alignment
 * ──────────────────────────────────────────────
 *  The service layer collects descriptors during a transaction and emits them
 *  only after commit. This factory's job is to build those descriptors cheaply
 *  and correctly. The separation of construction from emission is what makes
 *  safe post-commit delivery possible.
 */

import { EVENTS } from "../utils/eventBus.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Current payload schema version.
 *
 * Bump when the payload shape changes in a breaking way. Consumers
 * branch on `payload.version` to handle migrations.
 *
 * @type {number}
 */
const EVENT_PAYLOAD_VERSION = 1;

/**
 * Explicit map from input action value to event bus constant.
 *
 * Defined at module level — not inside a function — so it is allocated
 * once and reused across every factory call. Keyed by the actual input
 * values so no casing transformation or enum-key convention is required.
 *
 * @type {Readonly<Record<string, string>>}
 */
const EVENT_MAP = Object.freeze({
  approved: EVENTS.DOCUMENT_APPROVED,
  rejected: EVENTS.DOCUMENT_REJECTED,
});

/**
 * Required fields that must be non-empty strings.
 * Drives validation loop — add new required fields here only.
 *
 * @type {readonly string[]}
 */
const REQUIRED_STRING_FIELDS = Object.freeze([
  "adminId",
  "userId",
  "docId",
  "documentType",
  "action",
]);

/**
 * Nullable fields — must be `string | null`, never `undefined`.
 * Callers must be explicit; implicit omission is rejected.
 *
 * @type {readonly string[]}
 */
const NULLABLE_STRING_FIELDS = Object.freeze(["reason"]);

/**
 * Optional correlation fields — must be strings if present, may be absent.
 *
 * @type {readonly string[]}
 */
const OPTIONAL_CORRELATION_FIELDS = Object.freeze([
  "requestId",
  "correlationId",
  "traceId",
  "causationId",
]);

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

/**
 * Parameters required to build any document event descriptor.
 *
 * @typedef {Object} DocumentEventParams
 * @property {string}      adminId        - The acting admin's user ID.
 * @property {string}      userId         - The target user's ID (document owner).
 * @property {string}      docId          - The document's ID.
 * @property {string}      documentType   - The document type (e.g. "NRC", "TPIN").
 * @property {string}      action         - The action applied: "approved" | "rejected".
 * @property {string|null} reason         - Rejection reason; null for approvals.
 * @property {string}      [requestId]    - Optional HTTP request ID.
 * @property {string}      [correlationId]- Optional distributed correlation ID.
 * @property {string}      [traceId]      - Optional distributed trace ID.
 * @property {string}      [causationId]  - Optional causation ID (what caused this event).
 */

/**
 * The payload delivered to every subscriber of a document event.
 *
 * @typedef {Object} DocumentEventPayload
 * @property {number}      version      - Payload schema version. Always EVENT_PAYLOAD_VERSION.
 * @property {string}      userId       - Document owner's user ID.
 * @property {string}      adminId      - Admin who performed the action.
 * @property {string}      docId        - The document's ID.
 * @property {string}      documentType - The document type.
 * @property {string}      action       - "approved" | "rejected".
 * @property {string|null} reason       - Rejection reason; null for approvals.
 * @property {boolean}     [bulk]       - Present and `true` on bulk events only.
 * @property {string}      [requestId]
 * @property {string}      [correlationId]
 * @property {string}      [traceId]
 * @property {string}      [causationId]
 */

/**
 * A fully-resolved, deep-frozen event descriptor ready for
 * `eventBus.emit(descriptor.type, descriptor.payload)`.
 *
 * @typedef {Object} DocumentEventDescriptor
 * @property {string}                       type    - EVENTS constant for this action.
 * @property {Readonly<DocumentEventPayload>} payload - Immutable event data.
 */

/* ─────────────────────────────────────────────
   INTERNAL — DEEP FREEZE
───────────────────────────────────────────── */

/**
 * Returns true only for plain objects — `{}` literals and `Object.create(null)`.
 *
 * Used by `deepFreeze` to decide whether to recurse. Dates, Maps, Sets,
 * Buffers, class instances, and Errors are all intentionally excluded:
 * freezing their internal state can corrupt their behaviour in ways that
 * are difficult to debug.
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
 * Shallow `Object.freeze` leaves nested objects mutable. Event payloads
 * are immutable system facts — the entire descriptor graph must be frozen.
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

  // Freeze non-plain values (Dates, class instances, etc.) at their own
  // level only — do not recurse into their internal structure.
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
 * Validates all parameters at the factory boundary before any object
 * is constructed. Fails fast on bad input rather than producing corrupt
 * or incomplete event descriptors that propagate silently through the
 * event bus to downstream subscribers.
 *
 * @param {DocumentEventParams} params
 * @throws {TypeError}  On wrong type for any field.
 * @throws {RangeError} On empty string or disallowed action value.
 */
function assertValidDocumentEventParams(params) {
  // Container guard — rejects arrays, Dates, class instances, and other
  // non-plain values before any field access is attempted
  if (
    params === null ||
    typeof params !== "object" ||
    Array.isArray(params) ||
    !isPlainObject(params)
  ) {
    throw new TypeError("documentEventFactory: params must be a plain object.");
  }

  // Required non-empty string fields
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = params[field];

    if (typeof value !== "string") {
      throw new TypeError(
        `documentEventFactory: "${field}" must be a string, received ${typeof value}.`,
      );
    }

    if (value.trim().length === 0) {
      throw new RangeError(
        `documentEventFactory: "${field}" must not be empty.`,
      );
    }
  }

  // Explicit action whitelist — checked against the event map
  if (!EVENT_MAP[params.action]) {
    throw new RangeError(
      `documentEventFactory: action "${params.action}" is not allowed. ` +
        `Expected one of: ${Object.keys(EVENT_MAP).join(", ")}.`,
    );
  }

  // Nullable fields — must be string or null, never undefined
  for (const field of NULLABLE_STRING_FIELDS) {
    const value = params[field];

    if (value !== null && typeof value !== "string") {
      throw new TypeError(
        `documentEventFactory: "${field}" must be a string or null, ` +
          `received ${typeof value}.`,
      );
    }
  }

  // Optional correlation fields — must be strings if provided
  for (const field of OPTIONAL_CORRELATION_FIELDS) {
    const value = params[field];

    if (value !== undefined && typeof value !== "string") {
      throw new TypeError(
        `documentEventFactory: "${field}" must be a string if provided, ` +
          `received ${typeof value}.`,
      );
    }
  }
}

/* ─────────────────────────────────────────────
   INTERNAL — CONSTRUCTION
───────────────────────────────────────────── */

/**
 * Constructs the event payload object.
 *
 * Correlation fields are injected only when present — we never stamp
 * `traceId: undefined` onto the payload, which keeps the event schema
 * clean and avoids noisy undefined keys in logs and databases.
 *
 * @param {DocumentEventParams} params
 * @param {boolean}             bulk
 * @returns {DocumentEventPayload} Raw payload (frozen by caller via buildDocumentEvent)
 */
function buildPayload(params, bulk) {
  const payload = {
    version: EVENT_PAYLOAD_VERSION,
    userId: params.userId,
    adminId: params.adminId,
    docId: params.docId,
    documentType: params.documentType,
    action: params.action,
    reason: params.reason,
  };

  // Bulk flag — present only on bulk events, absent on single-document events
  if (bulk) {
    payload.bulk = true;
  }

  // Correlation metadata — injected when provided, omitted entirely otherwise.
  // Explicit `!== undefined` instead of truthiness so valid values like
  // empty strings or "0" are never silently dropped.
  for (const field of OPTIONAL_CORRELATION_FIELDS) {
    if (params[field] !== undefined) {
      payload[field] = params[field];
    }
  }

  return payload;
}

/**
 * Single construction point for both exported factories.
 *
 * Resolves the event type, builds the payload, and deep-freezes the
 * entire descriptor. Neither exported factory mutates the result or
 * calls the other — both delegate here with their own `bulk` argument.
 *
 * @param {DocumentEventParams} params
 * @param {boolean}             bulk
 * @returns {Readonly<DocumentEventDescriptor>}
 */
function buildDocumentEvent(params, bulk) {
  return deepFreeze({
    type: EVENT_MAP[params.action],
    payload: buildPayload(params, bulk),
  });
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Builds an immutable event descriptor for a single-document review action.
 *
 * Usage (service layer — after transaction commits)
 * ─────
 *  const { type, payload } = createDocumentEvent({ adminId, userId, ... });
 *  eventBus.emit(type, payload);
 *
 * @param   {DocumentEventParams} params
 * @returns {Readonly<DocumentEventDescriptor>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createDocumentEvent(params) {
  assertValidDocumentEventParams(params);
  return buildDocumentEvent(params, false);
}

/**
 * Builds an immutable event descriptor for a document processed inside a
 * bulk action. Stamps `payload.bulk: true` via direct construction —
 * not by mutating the result of `createDocumentEvent`.
 *
 * Usage (service layer — collected during transaction, emitted after commit)
 * ─────
 *  const pendingEvents = validDocs.map((doc) =>
 *    createBulkDocumentEvent({ adminId, userId, docId: doc.id, ... })
 *  );
 *
 *  // After session.commitTransaction():
 *  for (const { type, payload } of pendingEvents) {
 *    eventBus.emit(type, payload);
 *  }
 *
 * @param   {DocumentEventParams} params
 * @returns {Readonly<DocumentEventDescriptor>}
 * @throws  {TypeError | RangeError} On invalid parameters.
 */
export function createBulkDocumentEvent(params) {
  assertValidDocumentEventParams(params);
  return buildDocumentEvent(params, true);
}
