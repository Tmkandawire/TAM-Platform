/**
 * @file ForbiddenError.js
 * @module errors/ForbiddenError
 * @description Typed 403 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 403 status so call sites never
 *    repeat the status code or manually construct access-denial responses
 *  • Expose named static factories for every distinct authorisation
 *    failure scenario so machine-readable codes are never typed by hand
 *    at call sites
 *  • Enforce at construction time that only known codes, non-empty messages,
 *    and valid cause values are accepted — no arbitrary or malformed input
 *
 * This module intentionally does NOT:
 *  • Perform role resolution or policy evaluation
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Carry an errors[] array — 403s are never field-level failures;
 *    the top-level message and code are sufficient for access-denial
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError          ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ ForbiddenError ({ message, code, cause? })
 *
 * 401 vs 403 — the distinction this codebase enforces
 * ─────────────────────────────────────────────────────
 *  401 Unauthorized → identity is unknown or unverified
 *    "We don't know who you are — authenticate first."
 *    Use: UnauthorizedError
 *
 *  403 Forbidden     → identity is known but access is denied
 *    "We know who you are — you're not allowed to do this."
 *    Use: ForbiddenError  ← this class
 *
 *  A 403 always implies the user IS authenticated. If they are not,
 *  throw UnauthorizedError instead.
 *
 *  CSRF violations are an exception to the "authenticated" rule —
 *  a CSRF failure means the request origin cannot be trusted regardless
 *  of authentication state. 403 is still correct: the server knows what
 *  is being attempted and is explicitly denying it.
 *
 * Contract enforcement strategy
 * ──────────────────────────────
 *  All validation (message shape, cause type, code membership) is enforced
 *  in the constructor — the single authoritative boundary for this class.
 *  Factories delegate to the constructor and do NOT repeat validation.
 *
 * Usage
 * ─────
 *  throw ForbiddenError.insufficientRole("ADMIN", "MEMBER");
 *  throw ForbiddenError.policy("Document is locked pending senior review.");
 *  throw ForbiddenError.csrf("missing");
 *  throw ForbiddenError.csrf("invalid");
 *  throw ForbiddenError.csrf("origin");
 */

import ApiError from "../utils/apiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const HTTP_STATUS_FORBIDDEN = 403;

/**
 * Machine-readable error codes for each distinct authorisation failure.
 *
 * CSRF codes follow the same pattern as role and policy codes —
 * machine-readable, uppercase, never constructed by hand at call sites.
 *
 * CSRF_MISSING  — one or both CSRF tokens absent from the request
 * CSRF_INVALID  — tokens present but do not match (timing-safe comparison)
 * CSRF_ORIGIN   — Origin/Referer header absent or not in the allowlist
 *
 * @enum {string}
 */
const FORBIDDEN_CODES = Object.freeze({
  INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",
  POLICY_VIOLATION: "POLICY_VIOLATION",
  CSRF_MISSING: "CSRF_MISSING",
  CSRF_INVALID: "CSRF_INVALID",
  CSRF_ORIGIN: "CSRF_ORIGIN",
});

/**
 * Set of valid code values derived from FORBIDDEN_CODES.
 * Used by the constructor for O(1) membership checks.
 *
 * @type {Set<string>}
 */
const VALID_CODES = new Set(Object.values(FORBIDDEN_CODES));

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class ForbiddenError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message
   * @param {string}      params.code
   * @param {Error|null}  [params.cause]
   */
  constructor({ message, code, cause = null }) {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError(
        `ForbiddenError: "message" must be a non-empty string, received ${JSON.stringify(message)}.`,
      );
    }

    if (cause !== null && !(cause instanceof Error)) {
      throw new TypeError(
        `ForbiddenError: "cause" must be an Error instance or null, received ${typeof cause}.`,
      );
    }

    if (!VALID_CODES.has(code)) {
      throw new TypeError(
        `ForbiddenError: "${code}" is not a recognised code. ` +
          `Valid codes: ${[...VALID_CODES].join(", ")}.`,
      );
    }

    super({
      statusCode: HTTP_STATUS_FORBIDDEN,
      message,
      code,
      errors: [],
      cause,
      isOperational: true,
    });

    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * The authenticated user's role does not meet the minimum required.
   *
   * @param   {string}     requiredRole
   * @param   {string}     actualRole
   * @param   {Error|null} [cause]
   * @returns {ForbiddenError}
   */
  static insufficientRole(requiredRole, actualRole, cause = null) {
    if (typeof requiredRole !== "string" || requiredRole.trim().length === 0) {
      throw new TypeError(
        `ForbiddenError.insufficientRole: "requiredRole" must be a non-empty string, received ${JSON.stringify(requiredRole)}.`,
      );
    }

    if (typeof actualRole !== "string" || actualRole.trim().length === 0) {
      throw new TypeError(
        `ForbiddenError.insufficientRole: "actualRole" must be a non-empty string, received ${JSON.stringify(actualRole)}.`,
      );
    }

    return new ForbiddenError({
      message: `Access denied. Requires role "${requiredRole}", current role is "${actualRole}".`,
      code: FORBIDDEN_CODES.INSUFFICIENT_ROLE,
      cause,
    });
  }

  /**
   * A domain-level policy blocks the action beyond simple role checks.
   *
   * @param   {string}     reason
   * @param   {Error|null} [cause]
   * @returns {ForbiddenError}
   */
  static policy(reason, cause = null) {
    return new ForbiddenError({
      message: reason,
      code: FORBIDDEN_CODES.POLICY_VIOLATION,
      cause,
    });
  }

  /**
   * A CSRF protection check failed.
   *
   * Three distinct failure reasons are expressed through a single factory
   * rather than three separate factories — CSRF failures share the same
   * response shape and the reason param makes the distinction explicit
   * both in the message and in the code without polluting the call site
   * with three factory names to remember.
   *
   * @param   {"missing"|"invalid"|"origin"} reason
   *   "missing" — one or both CSRF tokens absent from the request
   *   "invalid" — tokens present but timing-safe comparison failed
   *   "origin"  — Origin/Referer header absent or not in the allowlist
   * @param   {Error|null} [cause]
   * @returns {ForbiddenError}
   *
   * @example
   *   throw ForbiddenError.csrf("missing");
   *   throw ForbiddenError.csrf("invalid");
   *   throw ForbiddenError.csrf("origin");
   */
  static csrf(reason, cause = null) {
    const configs = {
      missing: {
        message:
          "CSRF token missing. Ensure the request includes both the CSRF cookie and the X-CSRF-Token header.",
        code: FORBIDDEN_CODES.CSRF_MISSING,
      },
      invalid: {
        message:
          "CSRF token invalid. The token in the header does not match the token in the cookie.",
        code: FORBIDDEN_CODES.CSRF_INVALID,
      },
      origin: {
        message:
          "Request origin not permitted. Ensure the request originates from an allowed domain.",
        code: FORBIDDEN_CODES.CSRF_ORIGIN,
      },
    };

    const config = configs[reason];

    if (!config) {
      throw new TypeError(
        `ForbiddenError.csrf: "${reason}" is not a valid reason. Valid reasons: missing, invalid, origin.`,
      );
    }

    return new ForbiddenError({
      message: config.message,
      code: config.code,
      cause,
    });
  }
}
