/**
 * @file ConflictError.js
 * @module errors/ConflictError
 * @description Typed 409 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 409 status so call sites never
 *    repeat the status code or manually construct conflict responses
 *  • Expose named static factories for the two distinct conflict scenarios
 *    in this platform: document state conflicts and duplicate record conflicts
 *  • Enforce at construction time that only known codes, non-empty messages,
 *    and valid cause values are accepted — no arbitrary or malformed input
 *
 * This module intentionally does NOT:
 *  • Check document state or query for duplicates
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Carry an errors[] array — 409s describe a resource-level conflict,
 *    not a field-level validation failure; the top-level message and code
 *    are sufficient
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError        ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ ConflictError ({ message, code, cause? })
 *
 * Error code naming convention
 * ─────────────────────────────
 *  All codes across this platform use the *_CONFLICT suffix for resource-
 *  level state conflicts. This keeps analytics, logging, and client-side
 *  error handling consistent — a single suffix pattern means no guessing
 *  whether a code ends in _ERROR, _CONFLICT, or _VIOLATION.
 *
 *    DOCUMENT_STATE_CONFLICT  → document lifecycle state blocks the action
 *    DUPLICATE_CONFLICT       → unique constraint violation on a field
 *
 * When to use 409 vs other status codes
 * ──────────────────────────────────────
 *  409 Conflict → the request is valid but contradicts the current
 *    resource state. The client must resolve the conflict before retrying.
 *    Examples: approving an already-approved document, registering a
 *    duplicate email, acting on a document locked by another admin.
 *
 *  400 Bad Request → the request itself is malformed or invalid.
 *    Use: ValidationError
 *
 * Contract enforcement strategy
 * ──────────────────────────────
 *  All validation (message shape, cause type, code membership) is enforced
 *  in the constructor — the single authoritative boundary for this class.
 *  Factories delegate to the constructor and do NOT repeat validation.
 *  This follows the DRY principle: one enforcement point, one place to
 *  update if rules change.
 *
 *  Factory-specific input validation (e.g. docId, currentState, field)
 *  lives in the factory — these are factory-specific arguments that are
 *  normalised and interpolated into the message before reaching the
 *  constructor.
 *
 * Input normalisation
 * ────────────────────
 *  Factory string inputs are trimmed before validation and interpolation.
 *  This prevents leading/trailing whitespace from appearing in API response
 *  messages and log entries (e.g. `" 123 "` → `"123"`).
 *
 * Why no errors[] array
 * ──────────────────────
 *  Conflict errors are resource-level, not field-level. The client knows
 *  what they attempted — the response tells them why the current state
 *  blocks it. An errors[] array would be empty noise in every response.
 *
 * Usage
 * ─────
 *  throw ConflictError.documentState(docId, "approved");
 *  throw ConflictError.duplicate("email");
 */

import ApiError from "../utils/ApiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/** HTTP status code fixed for all instances of this class. */
const HTTP_STATUS_CONFLICT = 409;

/**
 * Machine-readable error codes for each distinct conflict scenario.
 *
 * Naming convention: all codes use the *_CONFLICT suffix for consistency
 * with the broader error code taxonomy across this platform. This ensures
 * analytics pipelines and client-side handlers never need to guess the
 * suffix pattern for a conflict-class error.
 *
 * This object is the single source of truth for valid codes.
 * The constructor enforces membership against this set — no arbitrary
 * strings are accepted.
 *
 * Extensibility note: additional codes (e.g. RESOURCE_LOCKED_CONFLICT,
 * VERSION_MISMATCH_CONFLICT) can be added here without changing the
 * constructor or any existing factory — the VALID_CODES set is derived
 * automatically.
 *
 * @enum {string}
 */
const CONFLICT_CODES = Object.freeze({
  DOCUMENT_STATE_CONFLICT: "DOCUMENT_STATE_CONFLICT",
  DUPLICATE_CONFLICT: "DUPLICATE_CONFLICT",
});

/**
 * Set of valid code values derived from CONFLICT_CODES.
 * Used by the constructor for O(1) membership checks.
 *
 * @type {Set<string>}
 */
const VALID_CODES = new Set(Object.values(CONFLICT_CODES));

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Validates and normalises a factory string argument.
 *
 * Trims whitespace before validation so leading/trailing spaces do not
 * produce misleading messages like `Document " 123 " ...`. Returns the
 * trimmed value for safe interpolation.
 *
 * @param   {unknown} value       - The raw input to validate.
 * @param   {string}  paramName   - Parameter name used in the TypeError message.
 * @param   {string}  factoryName - Factory name used in the TypeError message.
 * @returns {string}  The trimmed, validated string.
 * @throws  {TypeError}
 */
function validateAndTrim(value, paramName, factoryName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `ConflictError.${factoryName}: "${paramName}" must be a non-empty string, received ${JSON.stringify(value)}.`,
    );
  }
  return value.trim();
}

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class ConflictError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message - Human-readable description of the conflict.
   *   Must be a non-empty string — null, undefined, or empty string throws at
   *   construction time.
   * @param {string}      params.code    - Machine-readable error code. Must be a value
   *   from CONFLICT_CODES — any other string throws at construction time.
   * @param {Error|null}  [params.cause] - Optional originating error for the cause chain.
   *   Must be an Error instance or null — any other type throws at construction time.
   */
  constructor({ message, code, cause = null }) {
    // ── Contract enforcement ──────────────────────────────────────────────
    // All validation lives here. Factories delegate to the constructor and
    // do not repeat these checks — constructor is the single enforcement point.

    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError(
        `ConflictError: "message" must be a non-empty string, received ${JSON.stringify(message)}.`,
      );
    }

    if (cause !== null && !(cause instanceof Error)) {
      throw new TypeError(
        `ConflictError: "cause" must be an Error instance or null, received ${typeof cause}.`,
      );
    }

    if (!VALID_CODES.has(code)) {
      throw new TypeError(
        `ConflictError: "${code}" is not a recognised code. ` +
          `Valid codes: ${[...VALID_CODES].join(", ")}.`,
      );
    }

    // ── Construction ─────────────────────────────────────────────────────

    super({
      statusCode: HTTP_STATUS_CONFLICT,
      message,
      code,
      errors: [],
      cause,
      // 409s are always operational — a state conflict is an expected
      // application condition, never an infrastructure failure
      isOperational: true,
    });

    /**
     * Restore the prototype chain broken by extending built-in Error in
     * transpiled environments (TypeScript / Babel). Without this,
     * `instanceof ConflictError` returns false after transpilation.
     */
    Object.setPrototypeOf(this, ConflictError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * The requested action contradicts the document's current lifecycle state.
   *
   * Use in adminDocumentService or documentStatusPolicy when an admin
   * attempts to approve, reject, or otherwise act on a document that is
   * already in a terminal or incompatible state (e.g. approving an already-
   * approved document, rejecting an already-rejected document).
   *
   * Both `docId` and `currentState` are trimmed, validated, and interpolated
   * into the message so logs and API responses immediately identify which
   * document was affected and why the action was blocked — critical in bulk
   * operations where multiple documents are processed concurrently.
   *
   * @param   {string}     docId        - The ID of the document in conflict.
   *   Must be a non-empty string — undefined, null, empty, or whitespace-only throws.
   * @param   {string}     currentState - The document's current lifecycle state
   *   (e.g. "approved", "rejected", "pending").
   *   Must be a non-empty string — undefined, null, empty, or whitespace-only throws.
   * @param   {Error|null} [cause]
   * @returns {ConflictError}
   *
   * @example
   *   throw ConflictError.documentState(doc._id.toString(), doc.status);
   */
  static documentState(docId, currentState, cause = null) {
    const safeDocId = validateAndTrim(docId, "docId", "documentState");
    const safeState = validateAndTrim(
      currentState,
      "currentState",
      "documentState",
    );

    return new ConflictError({
      message: `Document "${safeDocId}" cannot be actioned because it is already "${safeState}".`,
      code: CONFLICT_CODES.DOCUMENT_STATE_CONFLICT,
      cause,
    });
  }

  /**
   * A record with the given field value already exists in the system.
   *
   * Use in authService or any service-layer operation that inserts a
   * new record into a collection with a unique constraint — for example,
   * registering an email that is already associated with an active account,
   * or creating a profile where one already exists for that user.
   *
   * `field` is trimmed, validated, and interpolated into the message so
   * the API response immediately identifies which field caused the conflict
   * without exposing internal query details or collection names.
   *
   * @param   {string}     field  - The field name whose value is duplicated
   *   (e.g. "email", "username"). Must be a non-empty string.
   * @param   {Error|null} [cause]
   * @returns {ConflictError}
   *
   * @example
   *   throw ConflictError.duplicate("email");
   */
  static duplicate(field, cause = null) {
    const safeField = validateAndTrim(field, "field", "duplicate");

    return new ConflictError({
      message: `A record with this "${safeField}" already exists.`,
      code: CONFLICT_CODES.DUPLICATE_CONFLICT,
      cause,
    });
  }
}
