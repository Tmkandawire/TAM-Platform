/**
 * @file InternalError.js
 * @module errors/InternalError
 * @description Typed 500 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 500 status so call sites never
 *    repeat the status code or construct raw ApiError instances for
 *    infrastructure failures
 *  • Expose named static factories for every distinct platform fault
 *    scenario so machine-readable codes are never typed by hand at
 *    call sites
 *  • Mark all instances isOperational: false — a 500 is never an
 *    expected application condition; it always signals a platform or
 *    infrastructure fault requiring investigation
 *
 * This module intentionally does NOT:
 *  • Perform any infrastructure interaction or recovery
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Carry an errors[] array — 500s are never field-level failures;
 *    the top-level message and code are sufficient, and clientMessage
 *    in ApiError ensures internals are never leaked to the client
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError        ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ InternalError ({ code, cause? })
 *
 * Client safety
 * ─────────────
 *  ApiError.clientMessage returns "Internal server error" for all
 *  statusCode >= 500 instances. The message passed to InternalError
 *  factories is therefore for internal logging and monitoring only —
 *  it is never exposed to the client. Write messages that are useful
 *  for engineers diagnosing the failure, not for end users.
 *
 * isOperational: false
 * ─────────────────────
 *  All other typed errors in this platform are isOperational: true —
 *  they represent expected application conditions (bad input, missing
 *  resource, auth failure). InternalError is the only typed class that
 *  sets isOperational: false, signalling to errorMiddleware and any
 *  process-level crash handlers that this is a genuine fault, not a
 *  handled application state.
 *
 * Usage
 * ─────
 *  throw InternalError.cloudinaryFailure("nationalId");
 *  throw InternalError.normalizationFailure("Expected array, got object");
 *  throw InternalError.unexpected(caughtErr);
 */

import ApiError from "../utils/apiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const HTTP_STATUS_INTERNAL = 500;

/**
 * Machine-readable error codes for each distinct platform fault.
 *
 * These codes appear in logs and monitoring pipelines — they are
 * never sent to clients (ApiError.clientMessage masks them).
 * Write codes that are specific enough to route an alert to the
 * correct on-call engineer or runbook.
 *
 * @enum {string}
 */
const INTERNAL_CODES = Object.freeze({
  CLOUDINARY_FAILURE: "CLOUDINARY_UPLOAD_FAILURE",
  NORMALIZATION_FAILURE: "NORMALIZATION_FAILURE",
  UNEXPECTED: "INTERNAL_ERROR",
});

/**
 * Set of valid code values derived from INTERNAL_CODES.
 * Used by the constructor for O(1) membership checks.
 *
 * @type {Set<string>}
 */
const VALID_CODES = new Set(Object.values(INTERNAL_CODES));

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class InternalError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message  — Internal diagnostic message.
   *   Never sent to clients — for logs and monitoring only.
   * @param {string}      params.code     — Must be a value from INTERNAL_CODES.
   * @param {Error|null}  [params.cause]  — Originating error for the cause chain.
   */
  constructor({ message, code, cause = null }) {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError(
        `InternalError: "message" must be a non-empty string, received ${JSON.stringify(message)}.`,
      );
    }

    if (cause !== null && !(cause instanceof Error)) {
      throw new TypeError(
        `InternalError: "cause" must be an Error instance or null, received ${typeof cause}.`,
      );
    }

    if (!VALID_CODES.has(code)) {
      throw new TypeError(
        `InternalError: "${code}" is not a recognised code. ` +
          `Valid codes: ${[...VALID_CODES].join(", ")}.`,
      );
    }

    super({
      statusCode: HTTP_STATUS_INTERNAL,
      message,
      code,
      errors: [],
      cause,
      // false — a 500 is never an expected application condition.
      // errorMiddleware and process-level crash handlers use this flag
      // to decide whether to attempt recovery or escalate.
      isOperational: false,
    });

    Object.setPrototypeOf(this, InternalError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * Cloudinary returned an incomplete or malformed file record.
   *
   * Use when file.path or file.filename is absent after a multer-
   * storage-cloudinary upload — this means Cloudinary did not return
   * the expected upload result and the file cannot be persisted safely.
   *
   * This should never occur if cloudinaryUploadMiddleware ran correctly.
   * When it does occur it signals a Cloudinary configuration fault,
   * network interruption during upload, or a breaking change in the
   * multer-storage-cloudinary adapter.
   *
   * @param   {string}     fieldName — Document field that produced the fault.
   * @param   {Error|null} [cause]
   * @returns {InternalError}
   *
   * @example
   *   if (!file?.path || !file?.filename) {
   *     throw InternalError.cloudinaryFailure(fieldName);
   *   }
   */
  static cloudinaryFailure(fieldName, cause = null) {
    if (typeof fieldName !== "string" || fieldName.trim().length === 0) {
      throw new TypeError(
        `InternalError.cloudinaryFailure: "fieldName" must be a non-empty string, ` +
          `received ${JSON.stringify(fieldName)}.`,
      );
    }

    return new InternalError({
      message:
        `Cloudinary upload incomplete for field "${fieldName}" — ` +
        "file record is missing path or filename. " +
        "Check Cloudinary configuration and multer-storage-cloudinary adapter.",
      code: INTERNAL_CODES.CLOUDINARY_FAILURE,
      cause,
    });
  }

  /**
   * A normalization utility returned an unexpected value that violates
   * the contract expected by the service layer.
   *
   * Use when normalizeDocuments or a similar utility produces output
   * that is structurally invalid — not because of bad client input, but
   * because the utility itself behaved unexpectedly.
   *
   * @param   {string}     detail — Diagnostic detail about what was wrong.
   *   Must be a non-empty string — enforced at construction time so
   *   programmatic callers cannot accidentally pass undefined or a
   *   non-string type and produce a silently unhelpful log entry.
   * @param   {Error|null} [cause]
   * @returns {InternalError}
   *
   * @example
   *   if (!Array.isArray(normalized)) {
   *     throw InternalError.normalizationFailure(
   *       `Expected array, received ${typeof normalized}`
   *     );
   *   }
   */
  static normalizationFailure(detail, cause = null) {
    if (typeof detail !== "string" || detail.trim().length === 0) {
      throw new TypeError(
        `InternalError.normalizationFailure: "detail" must be a non-empty string, ` +
          `received ${JSON.stringify(detail)}.`,
      );
    }

    return new InternalError({
      message: `Document normalization produced an unexpected result: ${detail}`,
      code: INTERNAL_CODES.NORMALIZATION_FAILURE,
      cause,
    });
  }

  /**
   * A genuinely unexpected error with no more specific factory.
   *
   * Use as a last-resort wrapper in catch blocks where the error does
   * not map to any known fault scenario. Preserves the original error
   * in the cause chain so stack traces are not lost.
   *
   * Prefer a specific factory over this one wherever the fault scenario
   * is known — specific codes produce more actionable alerts and logs.
   *
   * @param   {Error|null} [cause] — The original caught error.
   * @returns {InternalError}
   *
   * @example
   *   } catch (err) {
   *     throw InternalError.unexpected(err);
   *   }
   */
  static unexpected(cause = null) {
    return new InternalError({
      message:
        "An unexpected internal error occurred. " +
        "See the cause chain for the originating error.",
      code: INTERNAL_CODES.UNEXPECTED,
      cause,
    });
  }
}
