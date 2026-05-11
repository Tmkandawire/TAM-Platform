/**
 * @file ValidationError.js
 * @module errors/ValidationError
 * @description Typed 400 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 400 status so call sites never
 *    repeat the status code or manually construct the errors array
 *  • Expose named static factories for the two validation entry points:
 *    Zod schema failures and manual DTO field failures
 *  • Defensively enforce the errors[] contract at the class boundary
 *    so downstream handlers always receive a well-shaped payload
 *
 * This module intentionally does NOT:
 *  • Run validation itself
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Transform or reformat normalizeZodErrors output — it receives the
 *    already-normalized Array<{ field, message, code }> and passes it
 *    directly into ApiError's errors array
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError           ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ ValidationError ({ errors, cause? })
 *
 * Error code hierarchy
 * ─────────────────────
 *  Top-level code  → always "VALIDATION_ERROR"  (machine-readable, consistent for clients)
 *  Field-level code → descriptive per-field code  (e.g. "FIELD_REQUIRED", "INVALID_FORMAT")
 *
 *  This two-level design means API clients can always key on the top-level
 *  code to identify a validation failure, then drill into errors[] for
 *  field-specific detail — without conflating the two levels.
 *
 * Why errors[] and not a single message
 * ──────────────────────────────────────
 *  Validation failures are always field-level. A single top-level message
 *  ("Validation failed") is not actionable for API clients. The errors array
 *  carries the per-field detail; the top-level message is intentionally generic
 *  so clients key on errors[], not on message string matching.
 *
 * Usage
 * ─────
 *  // Zod schema failure — pass the raw ZodError, normalisation happens here
 *  throw ValidationError.zod(zodError);
 *
 *  // Manual DTO / single-field failure with a specific field-level code
 *  throw ValidationError.dto("email", "Email is already registered.", "DUPLICATE_VALUE");
 */

import ApiError from "../utils/apiError.js";
import { normalizeZodErrors } from "../shared/normalizeZodErrors.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/** HTTP status code fixed for all instances of this class. */
const HTTP_STATUS_VALIDATION = 400;

/**
 * Top-level machine-readable code for all validation failures.
 * Deliberately SCREAMING_SNAKE_CASE and consistent across all factories.
 * Field-level codes live inside each entry in the errors array.
 *
 * API clients MUST be able to rely on this value never changing.
 *
 * @type {string}
 */
const VALIDATION_CODE = "VALIDATION_ERROR";

/** Human-readable top-level message. Intentionally generic — detail lives in errors[]. */
const VALIDATION_MESSAGE = "Validation failed.";

/**
 * Fallback field-level code used when a caller does not supply one.
 * Kept distinct from VALIDATION_CODE so the two levels are never conflated.
 *
 * @type {string}
 */
const DEFAULT_FIELD_CODE = "INVALID_VALUE";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Asserts that `value` is an Array whose every entry has the shape
 * `{ field: string, message: string, code: string }`.
 *
 * Throws a TypeError at construction time rather than producing a
 * silently malformed error payload that breaks downstream handlers.
 *
 * @param {unknown} value
 * @throws {TypeError}
 */
function assertValidErrorsArray(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `ValidationError: "errors" must be an array, received ${typeof value}.`,
    );
  }

  for (let i = 0; i < value.length; i++) {
    const entry = value[i];

    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.field !== "string" ||
      typeof entry.message !== "string" ||
      typeof entry.code !== "string"
    ) {
      throw new TypeError(
        `ValidationError: errors[${i}] must be { field: string, message: string, code: string }.` +
          ` Received: ${JSON.stringify(entry)}`,
      );
    }
  }
}

/**
 * Asserts that `value` is either null or an instance of Error.
 *
 * Prevents non-error objects from polluting the cause chain, which
 * makes stack traces and error monitors unreliable.
 *
 * @param {unknown} value
 * @throws {TypeError}
 */
function assertValidCause(value) {
  if (value !== null && !(value instanceof Error)) {
    throw new TypeError(
      `ValidationError: "cause" must be an Error instance or null, received ${typeof value}.`,
    );
  }
}

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class ValidationError extends ApiError {
  /**
   * @param {Object}                                              params
   * @param {Array<{field:string,message:string,code:string}>}   params.errors
   *   Normalized field-level errors. Use the static factories rather than
   *   constructing this directly — factories handle normalisation and
   *   enforce correct field-level codes.
   * @param {Error|null} [params.cause] - Optional originating error for the cause chain.
   *   Must be an Error instance or null; any other type throws at construction time.
   */
  constructor({ errors = [], cause = null } = {}) {
    assertValidErrorsArray(errors);
    assertValidCause(cause);

    super({
      statusCode: HTTP_STATUS_VALIDATION,
      message: VALIDATION_MESSAGE,
      code: VALIDATION_CODE,
      errors,
      cause,
      // 400s are always operational — bad input is an expected application
      // condition, never an infrastructure failure
      isOperational: true,
    });

    /**
     * Restore the prototype chain broken by extending built-in Error in
     * transpiled environments (TypeScript / Babel). Without this,
     * `instanceof ValidationError` returns false after transpilation.
     */
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * Creates a 400 from a raw ZodError.
   *
   * Normalisation is handled here — call sites pass the ZodError directly
   * without knowing about normalizeZodErrors. This keeps the import of
   * normalizeZodErrors centralised in one place rather than spread across
   * every validator and middleware file.
   *
   * Field-level codes in the resulting errors[] come from normalizeZodErrors
   * (e.g. "too_small", "invalid_type") and are preserved as-is — they are
   * already specific and descriptive.
   *
   * @param   {import("zod").ZodError} zodError - Raw ZodError from schema.safeParse or schema.parse
   * @param   {Error|null}             [cause]
   * @returns {ValidationError}
   *
   * @example
   *   const result = schema.safeParse(req.body);
   *   if (!result.success) throw ValidationError.zod(result.error);
   */
  static zod(zodError, cause = null) {
    assertValidCause(cause);
    const errors = normalizeZodErrors(zodError);
    return new ValidationError({ errors, cause });
  }

  /**
   * Creates a 400 for a single known field failure that does not go
   * through Zod — typically a DTO-level business rule (e.g. "email already
   * registered", "password cannot match previous password").
   *
   * The `fieldCode` parameter is the field-level code (e.g. "DUPLICATE_VALUE",
   * "FIELD_REQUIRED") and is deliberately separate from the top-level
   * VALIDATION_ERROR code. This keeps the two levels distinct and consistent
   * for API clients, logging, and analytics.
   *
   * @param   {string}     field              - The field name as it appears in the request body.
   * @param   {string}     message            - Human-readable description of the failure.
   * @param   {string}     [fieldCode]        - Machine-readable field-level code. Defaults to "INVALID_VALUE".
   * @param   {Error|null} [cause]
   * @returns {ValidationError}
   *
   * @example
   *   throw ValidationError.dto("email", "Email is already registered.", "DUPLICATE_VALUE");
   *   throw ValidationError.dto("password", "Password is required.", "FIELD_REQUIRED");
   */
  static dto(field, message, fieldCode = DEFAULT_FIELD_CODE, cause = null) {
    assertValidCause(cause);
    return new ValidationError({
      errors: [{ field, message, code: fieldCode }],
      cause,
    });
  }
}
