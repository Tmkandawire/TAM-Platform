/**
 * @file UnauthorizedError.js
 * @module errors/UnauthorizedError
 * @description Typed 401 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 401 status so call sites never
 *    repeat the status code or manually construct auth failure responses
 *  • Expose named static factories for every distinct authentication
 *    failure scenario so machine-readable codes are never typed by hand
 *    at call sites
 *  • Enforce at construction time that only known codes from
 *    UNAUTHORIZED_CODES are accepted — no arbitrary strings permitted
 *
 * This module intentionally does NOT:
 *  • Perform authentication or token verification
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Carry an errors[] array — 401s are never field-level failures;
 *    the top-level message and code are sufficient for auth failures
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError            ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ UnauthorizedError ({ message, code, cause? })
 *
 * 401 vs 403 — the distinction this codebase enforces
 * ─────────────────────────────────────────────────────
 *  401 Unauthorized → identity is unknown or unverified
 *    "We don't know who you are — authenticate first."
 *    Examples: missing token, expired token, invalid credentials
 *
 *  403 Forbidden     → identity is known but access is denied
 *    "We know who you are — you're not allowed to do this."
 *    Examples: insufficient role, policy violation
 *
 *  Mixing these is a common API design mistake. Keeping them as separate
 *  typed error classes with distinct factories makes it impossible to
 *  accidentally return a 401 where a 403 is correct, or vice versa.
 *
 * Contract enforcement strategy
 * ──────────────────────────────
 *  All validation (cause type, code membership) is enforced in the
 *  constructor — the single authoritative boundary for this class.
 *  Factories delegate to the constructor and do NOT repeat validation.
 *  This follows the DRY principle: one enforcement point, one place to
 *  update if rules change.
 *
 * Why no errors[] array
 * ──────────────────────
 *  Authentication failures are never field-level. There is no actionable
 *  per-field detail to surface — the client either needs to log in, refresh
 *  their token, or provide valid credentials. An errors[] array would be
 *  empty noise in every response.
 *
 * Usage
 * ─────
 *  throw UnauthorizedError.missingToken();
 *  throw UnauthorizedError.expiredToken();
 *  throw UnauthorizedError.invalidToken(originalJwtError);
 *  throw UnauthorizedError.invalidCredentials();
 */

import ApiError from "../utils/ApiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/** HTTP status code fixed for all instances of this class. */
const HTTP_STATUS_UNAUTHORIZED = 401;

/**
 * Machine-readable error codes for each distinct authentication failure.
 *
 * This object is the single source of truth for valid codes.
 * The constructor enforces membership against this set — no arbitrary
 * strings are accepted. API clients, logging pipelines, and analytics
 * systems can rely on these values never appearing in an unexpected casing
 * or spelling.
 *
 * @enum {string}
 */
const UNAUTHORIZED_CODES = Object.freeze({
  MISSING_TOKEN: "MISSING_TOKEN",
  EXPIRED_TOKEN: "EXPIRED_TOKEN",
  INVALID_TOKEN: "INVALID_TOKEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
});

/**
 * Set of valid code values derived from UNAUTHORIZED_CODES.
 * Used by the constructor for O(1) membership checks.
 *
 * @type {Set<string>}
 */
const VALID_CODES = new Set(Object.values(UNAUTHORIZED_CODES));

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class UnauthorizedError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message - Human-readable description of the auth failure.
   * @param {string}      params.code    - Machine-readable error code. Must be a value
   *   from UNAUTHORIZED_CODES — any other string throws at construction time.
   * @param {Error|null}  [params.cause] - Optional originating error for the cause chain.
   *   Must be an Error instance or null — any other type throws at construction time.
   */
  constructor({ message, code, cause = null }) {
    // ── Contract enforcement ──────────────────────────────────────────────
    // All validation lives here. Factories delegate to the constructor and
    // do not repeat these checks — constructor is the single enforcement point.

    if (cause !== null && !(cause instanceof Error)) {
      throw new TypeError(
        `UnauthorizedError: "cause" must be an Error instance or null, received ${typeof cause}.`,
      );
    }

    if (!VALID_CODES.has(code)) {
      throw new TypeError(
        `UnauthorizedError: "${code}" is not a recognised code. ` +
          `Valid codes: ${[...VALID_CODES].join(", ")}.`,
      );
    }

    // ── Construction ─────────────────────────────────────────────────────

    super({
      statusCode: HTTP_STATUS_UNAUTHORIZED,
      message,
      code,
      errors: [],
      cause,
      // 401s are always operational — an unauthenticated request is an
      // expected application condition, never an infrastructure failure
      isOperational: true,
    });

    /**
     * Restore the prototype chain broken by extending built-in Error in
     * transpiled environments (TypeScript / Babel). Without this,
     * `instanceof UnauthorizedError` returns false after transpilation.
     */
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * No Authorization header or cookie token was present on the request.
   *
   * Use in authMiddleware when the token is absent entirely — before
   * any attempt to verify or decode it.
   *
   * @param   {Error|null} [cause]
   * @returns {UnauthorizedError}
   *
   * @example
   *   if (!token) throw UnauthorizedError.missingToken();
   */
  static missingToken(cause = null) {
    return new UnauthorizedError({
      message: "Authentication token is missing.",
      code: UNAUTHORIZED_CODES.MISSING_TOKEN,
      cause,
    });
  }

  /**
   * A token was present but its expiry timestamp has passed.
   *
   * Use after JWT verification throws a TokenExpiredError so the client
   * receives a specific, actionable code ("refresh your token") rather
   * than a generic auth failure.
   *
   * @param   {Error|null} [cause] - The original TokenExpiredError from the JWT library.
   * @returns {UnauthorizedError}
   *
   * @example
   *   } catch (err) {
   *     if (err.name === "TokenExpiredError") throw UnauthorizedError.expiredToken(err);
   *   }
   */
  static expiredToken(cause = null) {
    return new UnauthorizedError({
      message: "Authentication token has expired.",
      code: UNAUTHORIZED_CODES.EXPIRED_TOKEN,
      cause,
    });
  }

  /**
   * A token was present and not expired but failed signature verification
   * or was otherwise malformed.
   *
   * Distinct from expiredToken so clients can distinguish between
   * "refresh your token" and "your token is corrupt or tampered".
   *
   * @param   {Error|null} [cause] - The original JsonWebTokenError from the JWT library.
   * @returns {UnauthorizedError}
   *
   * @example
   *   } catch (err) {
   *     if (err.name === "JsonWebTokenError") throw UnauthorizedError.invalidToken(err);
   *   }
   */
  static invalidToken(cause = null) {
    return new UnauthorizedError({
      message: "Authentication token is invalid.",
      code: UNAUTHORIZED_CODES.INVALID_TOKEN,
      cause,
    });
  }

  /**
   * Email/password combination did not match any active user record.
   *
   * The message is deliberately non-specific ("Invalid email or password")
   * rather than "email not found" or "wrong password" — this prevents
   * user enumeration attacks where an attacker probes which emails exist
   * in the system.
   *
   * @param   {Error|null} [cause]
   * @returns {UnauthorizedError}
   *
   * @example
   *   if (!user || !passwordMatch) throw UnauthorizedError.invalidCredentials();
   */
  static invalidCredentials(cause = null) {
    return new UnauthorizedError({
      message: "Invalid email or password.",
      code: UNAUTHORIZED_CODES.INVALID_CREDENTIALS,
      cause,
    });
  }
}
