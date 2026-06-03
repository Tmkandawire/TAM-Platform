/**
 * @file ServiceUnavailableError.js
 * @module errors/ServiceUnavailableError
 * @description Typed 503 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 503 status so call sites never
 *    repeat the status code or manually construct infrastructure failure responses
 *  • Expose named static factories for every distinct external service
 *    failure scenario: Redis, SMTP, and Cloudinary
 *  • Carry a `retryable` flag so queue and retry infrastructure can
 *    make informed decisions without inspecting error codes or messages
 *  • Enforce at construction time that only known codes, non-empty messages,
 *    valid retryable values, and valid cause values are accepted
 *
 * This module intentionally does NOT:
 *  • Attempt reconnection or retry logic
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Carry an errors[] array — 503s signal infrastructure failures,
 *    not field-level or resource-level issues; the top-level message
 *    and code are sufficient
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError                  ({ statusCode, message, code, errors, isOperational, cause })
 *         └─ ServiceUnavailableError ({ message, code, retryable, cause? })
 *
 * isOperational = false — why this class is different
 * ────────────────────────────────────────────────────
 *  Every other error class in this platform sets isOperational: true
 *  because they represent expected application conditions — bad input,
 *  missing resources, access denial, state conflicts.
 *
 *  ServiceUnavailableError sets isOperational: false because it signals
 *  an INFRASTRUCTURE failure — something outside the application's control
 *  has gone wrong. This distinction matters in two places:
 *
 *  1. errorMiddleware — can alert on-call engineers for non-operational
 *     errors while silently logging operational ones
 *
 *  2. Process monitors — can decide whether to restart the process
 *     based on whether the error was operational or not
 *
 * retryable flag — design rationale
 * ───────────────────────────────────
 *  Not all 503s are equal. Infrastructure failures fall into two categories:
 *
 *  Retryable   → transient failures where the operation may succeed if
 *    attempted again after a delay (Redis connection blip, SMTP timeout).
 *    Queue consumers and retry middleware should attempt backoff and retry.
 *
 *  Non-retryable → permanent or quota-based failures where retrying
 *    immediately or even after a delay will not help (Cloudinary storage
 *    quota exhausted, invalid API credentials). Retrying wastes resources
 *    and may worsen the situation (e.g. hammering a rate-limited endpoint).
 *
 *  By encoding retryability on the error itself — rather than in scattered
 *  if/else branches across queue consumers — the decision is made once,
 *  at the throw site, by the code closest to the failure.
 *
 *  Default retryability per factory:
 *    redis()      → retryable: true   (transient connection failures)
 *    smtp()       → retryable: true   (transient send failures / timeouts)
 *    cloudinary() → retryable: false  (quota / credential failures)
 *
 *  All factories accept an override so call sites can adjust based on the
 *  specific error returned by the provider SDK.
 *
 * Contract enforcement strategy
 * ──────────────────────────────
 *  All validation (message shape, cause type, code membership, retryable
 *  type) is enforced in the constructor — the single authoritative boundary
 *  for this class. Factories delegate to the constructor and do NOT repeat
 *  validation.
 *
 * Client messaging strategy
 * ──────────────────────────
 *  Because ApiError sets clientMessage to "Internal server error" for all
 *  5xx responses, the detailed internal messages defined in each factory
 *  are never exposed to API clients. They appear only in structured logs —
 *  where they are essential for rapid incident diagnosis.
 *
 * Usage
 * ─────
 *  throw ServiceUnavailableError.redis(originalError);
 *  throw ServiceUnavailableError.smtp(originalError);
 *  throw ServiceUnavailableError.cloudinary(originalError);
 *
 *  // Override retryability based on provider SDK error detail
 *  throw ServiceUnavailableError.cloudinary(err, { retryable: true });
 */

import ApiError from "../utils/ApiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/** HTTP status code fixed for all instances of this class. */
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

/**
 * Machine-readable error codes for each distinct infrastructure failure.
 *
 * Internal codes name the provider (REDIS, SMTP, CLOUDINARY) while
 * external messages name the service ("Redis service", "Email service",
 * "File storage service"). This separation means internal monitoring
 * dashboards key on provider names while API clients and logs surface
 * service-level language — neither bleeds into the other's domain.
 *
 * Extensibility note: additional codes (e.g. DATABASE_UNAVAILABLE,
 * QUEUE_UNAVAILABLE) can be added here without changing the constructor
 * or any existing factory — the VALID_CODES set is derived automatically.
 *
 * @enum {string}
 */
const SERVICE_UNAVAILABLE_CODES = Object.freeze({
  REDIS_UNAVAILABLE: "REDIS_UNAVAILABLE",
  SMTP_UNAVAILABLE: "SMTP_UNAVAILABLE",
  CLOUDINARY_UNAVAILABLE: "CLOUDINARY_UNAVAILABLE",
});

/**
 * Default retryability per provider.
 *
 * Defined centrally so the rationale is documented once and factories
 * reference it by name rather than hardcoding boolean literals.
 *
 * @type {Record<string, boolean>}
 */
const DEFAULT_RETRYABLE = Object.freeze({
  REDIS_UNAVAILABLE: true, // transient connection failures
  SMTP_UNAVAILABLE: true, // transient send failures / timeouts
  CLOUDINARY_UNAVAILABLE: false, // quota / credential failures
});

/**
 * Set of valid code values derived from SERVICE_UNAVAILABLE_CODES.
 * Used by the constructor for O(1) membership checks.
 *
 * @type {Set<string>}
 */
const VALID_CODES = new Set(Object.values(SERVICE_UNAVAILABLE_CODES));

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class ServiceUnavailableError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message   - Human-readable description of the infrastructure
   *   failure. Appears in structured logs only — never exposed to API clients.
   *   Must be a non-empty string — null, undefined, or empty string throws.
   * @param {string}      params.code      - Machine-readable error code. Must be a value
   *   from SERVICE_UNAVAILABLE_CODES — any other string throws.
   * @param {boolean}     params.retryable - Whether the operation that triggered this
   *   error is safe to retry. Must be a boolean — any other type throws.
   * @param {Error|null}  [params.cause]   - The originating infrastructure error.
   *   Should always be provided when available — the original stack trace is
   *   essential for rapid incident diagnosis.
   *   Must be an Error instance or null — any other type throws.
   */
  constructor({ message, code, retryable, cause = null }) {
    // ── Contract enforcement ──────────────────────────────────────────────
    // All validation lives here. Factories delegate to the constructor and
    // do not repeat these checks — constructor is the single enforcement point.

    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError(
        `ServiceUnavailableError: "message" must be a non-empty string, received ${JSON.stringify(message)}.`,
      );
    }

    if (cause !== null && !(cause instanceof Error)) {
      throw new TypeError(
        `ServiceUnavailableError: "cause" must be an Error instance or null, received ${typeof cause}.`,
      );
    }

    if (!VALID_CODES.has(code)) {
      throw new TypeError(
        `ServiceUnavailableError: "${code}" is not a recognised code. ` +
          `Valid codes: ${[...VALID_CODES].join(", ")}.`,
      );
    }

    if (typeof retryable !== "boolean") {
      throw new TypeError(
        `ServiceUnavailableError: "retryable" must be a boolean, received ${typeof retryable}.`,
      );
    }

    // ── Construction ─────────────────────────────────────────────────────

    super({
      statusCode: HTTP_STATUS_SERVICE_UNAVAILABLE,
      message,
      code,
      errors: [],
      cause,
      // false — infrastructure failures are NOT operational errors.
      // This signals to errorMiddleware and process monitors that something
      // outside the application's control has failed and may require
      // human intervention or an automated alert.
      isOperational: false,
    });

    /**
     * Whether the failed operation is safe to retry.
     *
     * Queue consumers and retry middleware should check this flag before
     * scheduling a retry attempt. Do not infer retryability from the
     * status code or error code — this flag is the authoritative signal.
     *
     * @type {boolean}
     */
    this.retryable = retryable;

    /**
     * Restore the prototype chain broken by extending built-in Error in
     * transpiled environments (TypeScript / Babel). Without this,
     * `instanceof ServiceUnavailableError` returns false after transpilation.
     */
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * Redis is unreachable or failed to process a command.
   *
   * Default: retryable = true — Redis connection failures are typically
   * transient (network blip, restart). Queue consumers should backoff
   * and retry.
   *
   * Override retryable to false if the provider SDK signals a permanent
   * failure (e.g. authentication rejected, cluster permanently unreachable).
   *
   * @param   {Error|null} [cause]              - The original error from the Redis client.
   * @param   {Object}     [options]
   * @param   {boolean}    [options.retryable]  - Override default retryability.
   * @returns {ServiceUnavailableError}
   *
   * @example
   *   } catch (err) {
   *     throw ServiceUnavailableError.redis(err);
   *   }
   */
  static redis(
    cause = null,
    { retryable = DEFAULT_RETRYABLE.REDIS_UNAVAILABLE } = {},
  ) {
    return new ServiceUnavailableError({
      message: "Redis service is unavailable.",
      code: SERVICE_UNAVAILABLE_CODES.REDIS_UNAVAILABLE,
      retryable,
      cause,
    });
  }

  /**
   * The SMTP provider failed to send an email or is unreachable.
   *
   * Default: retryable = true — SMTP failures are often transient
   * (provider timeout, temporary rate limit). Queue consumers should
   * backoff and retry.
   *
   * Override retryable to false if the SDK signals a permanent rejection
   * (e.g. account suspended, invalid credentials).
   *
   * @param   {Error|null} [cause]              - The original error from the SMTP provider.
   * @param   {Object}     [options]
   * @param   {boolean}    [options.retryable]  - Override default retryability.
   * @returns {ServiceUnavailableError}
   *
   * @example
   *   } catch (err) {
   *     throw ServiceUnavailableError.smtp(err);
   *   }
   */
  static smtp(
    cause = null,
    { retryable = DEFAULT_RETRYABLE.SMTP_UNAVAILABLE } = {},
  ) {
    return new ServiceUnavailableError({
      message: "Email service is unavailable.",
      code: SERVICE_UNAVAILABLE_CODES.SMTP_UNAVAILABLE,
      retryable,
      cause,
    });
  }

  /**
   * Cloudinary rejected the connection or failed to process an upload.
   *
   * Default: retryable = false — Cloudinary failures are most commonly
   * quota exhaustion or credential issues, which retrying will not resolve
   * and may worsen (hammering a rate-limited endpoint). Infrastructure
   * intervention is typically required.
   *
   * Override retryable to true if the SDK signals a transient failure
   * (e.g. temporary network error, 503 from Cloudinary's own infrastructure).
   *
   * @param   {Error|null} [cause]              - The original error from the Cloudinary SDK.
   * @param   {Object}     [options]
   * @param   {boolean}    [options.retryable]  - Override default retryability.
   * @returns {ServiceUnavailableError}
   *
   * @example
   *   } catch (err) {
   *     throw ServiceUnavailableError.cloudinary(err);
   *   }
   *
   *   // Transient Cloudinary network error — safe to retry
   *   throw ServiceUnavailableError.cloudinary(err, { retryable: true });
   */
  static cloudinary(
    cause = null,
    { retryable = DEFAULT_RETRYABLE.CLOUDINARY_UNAVAILABLE } = {},
  ) {
    return new ServiceUnavailableError({
      message: "File storage service is unavailable.",
      code: SERVICE_UNAVAILABLE_CODES.CLOUDINARY_UNAVAILABLE,
      retryable,
      cause,
    });
  }
}
