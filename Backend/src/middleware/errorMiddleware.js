/**
 * @file errorMiddleware.js
 * @module middleware/errorMiddleware
 * @description Centralised error handler for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Intercept every error thrown or passed to next(err) across all routes
 *  • Normalize framework and library errors (Mongoose, JWT, Zod, MongoDB
 *    driver) into typed platform error classes before responding
 *  • Emit a structured log entry for every error with full request context,
 *    including the cause chain for root-cause diagnosis
 *  • Distinguish operational errors (expected application conditions) from
 *    non-operational errors (infrastructure failures) and log accordingly
 *  • Return a consistent canonical response envelope so API clients never
 *    receive an inconsistently shaped error payload
 *  • Be the final, defensive authority on HTTP status codes — never trust
 *    a status code from an unknown or third-party error object
 *
 * This middleware intentionally does NOT:
 *  • Throw or re-throw errors
 *  • Know about business logic or domain rules
 *  • Sanitize or validate request input — that is the validator's job
 *  • Log request body, params, or query — these may contain PII or secrets
 *
 * Normalize order — why specific checks run BEFORE the instanceof guard
 * ───────────────────────────────────────────────────────────────────────
 *  Framework errors (Mongoose CastError, JWT errors, Zod errors) arrive as
 *  plain Error instances, not ApiError subclasses. If the instanceof guard
 *  ran first, it would wrap them in a generic ApiError and discard the
 *  `.name` and `.code` properties that the specific checks key on.
 *  Running specific checks first ensures each framework error is converted
 *  to the correct typed class before the fallback guard runs.
 *
 * statusCode sanitization — why we never trust unknown error statusCodes
 * ────────────────────────────────────────────────────────────────────────
 *  This middleware is the final authority on HTTP status codes. A third-party
 *  library or a programming mistake could produce an error with a nonsensical
 *  statusCode (e.g. 200, 0, NaN). Trusting it would result in an HTTP 200
 *  with an error payload — a category of bug that is invisible in monitoring
 *  dashboards and deeply confusing for API clients.
 *  Unknown errors are always normalised to 500 regardless of their statusCode.
 *
 * Canonical response envelope
 * ────────────────────────────
 *  All error responses conform to:
 *  {
 *    success:   false,
 *    error: {
 *      code:      string,            // machine-readable error code
 *      message:   string,            // human-readable (clientMessage in prod)
 *      details:   Array,             // field-level errors (empty for non-validation)
 *      retryable: boolean|undefined  // present only on ServiceUnavailableError
 *    },
 *    requestId: string               // trace ID from requestContext middleware
 *  }
 *
 * isOperational flag
 * ───────────────────
 *  true  → expected application condition. Logged at `error` level.
 *  false → infrastructure failure. Logged with `alert: true` so log
 *    aggregators can route to on-call pipelines without extra filter config.
 */

import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "../errors/index.js";
import ApiError from "../utils/apiError.js";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * The set of HTTP status codes this middleware considers valid error codes.
 * Any status code outside this range from an unknown error is replaced with 500.
 *
 * @type {(code: number) => boolean}
 */
const isValidErrorStatusCode = (code) =>
  Number.isInteger(code) && code >= 400 && code <= 599;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Extracts the requestId attached by requestContext middleware.
 * Returns "unavailable" if the middleware has not run (e.g. in tests
 * that call errorMiddleware directly without a full request pipeline).
 *
 * @param   {import("express").Request} req
 * @returns {string}
 */
function getRequestId(req) {
  return req.context?.requestId ?? "unavailable";
}

/**
 * Safely serializes an error's cause chain for structured logging.
 *
 * Walks the cause chain (err.cause → err.cause.cause → ...) up to a
 * maximum depth to prevent runaway serialization on pathological inputs.
 * Returns undefined if the error has no cause so the log entry stays
 * clean — no `cause: null` or `cause: undefined` noise.
 *
 * @param   {unknown} err   - The error whose cause chain to serialize.
 * @param   {number}  [depth=3] - Maximum chain depth to walk.
 * @returns {object|undefined}
 */
function serializeCause(err, depth = 3) {
  if (!err?.cause || depth === 0) return undefined;

  return {
    message: err.cause?.message,
    name: err.cause?.name,
    code: err.cause?.code,
    ...(depth > 1 && { cause: serializeCause(err.cause, depth - 1) }),
  };
}

/**
 * Converts framework and library errors into typed platform error classes.
 *
 * Each check inspects the ORIGINAL `err` object (before any wrapping) so
 * that `.name`, `.code`, and library-specific properties are still accessible.
 * Returns null if the error does not match any known framework error shape,
 * signalling that the fallback ApiError normalisation should run instead.
 *
 * @param   {unknown} err - The raw error from Express's error pipeline.
 * @returns {ApiError|null}
 */
function normalizeFrameworkError(err) {
  // ── Mongoose: invalid ObjectId ──────────────────────────────────────────
  if (err.name === "CastError") {
    return new ApiError({
      statusCode: 400,
      message: `Invalid value for field "${err.path}": "${err.value}".`,
      code: "INVALID_ID",
      errors: [],
      isOperational: true,
      cause: err,
    });
  }

  // ── MongoDB driver: unique constraint violation ──────────────────────────
  // Map to 409 Conflict — the request is well-formed, it contradicts
  // existing data. Never 400.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? "field";
    return ConflictError.duplicate(field, err);
  }

  // ── Mongoose: schema-level validation failure ────────────────────────────
  if (err.name === "ValidationError" && err.errors) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
      code: "INVALID_VALUE",
    }));
    return new ValidationError({ errors, cause: err });
  }

  // ── JWT: invalid token signature or structure ────────────────────────────
  if (err.name === "JsonWebTokenError") {
    return UnauthorizedError.invalidToken(err);
  }

  // ── JWT: token lifetime exceeded ─────────────────────────────────────────
  if (err.name === "TokenExpiredError") {
    return UnauthorizedError.expiredToken(err);
  }

  // ── Zod: schema parse failure ─────────────────────────────────────────────
  // Catches any ZodError that escapes without being converted — e.g. from a
  // library that calls schema.parse() internally.
  if (err.name === "ZodError") {
    return ValidationError.zod(err);
  }

  return null;
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Express error-handling middleware. Must be registered LAST in server.js,
 * after all routes and other middleware.
 *
 * @param {unknown}                         err
 * @param {import("express").Request}       req
 * @param {import("express").Response}      res
 * @param {import("express").NextFunction}  next
 */
const errorMiddleware = (err, req, res, next) => {
  const requestId = getRequestId(req);

  /* ── Step 1: Normalize to a typed ApiError subclass ─────────────────────
     Run specific framework checks first (they inspect raw err properties).
     Fall back to instanceof guard only if no specific check matched.
     Final fallback wraps anything unknown in a generic 500 — statusCode is
     never trusted from an unknown error; only ApiError subclasses carry a
     pre-validated statusCode.
  ──────────────────────────────────────────────────────────────────────── */

  let error = normalizeFrameworkError(err);

  if (!error) {
    if (err instanceof ApiError) {
      error = err;
    } else {
      // Unknown error — always 500, never trust err.statusCode.
      // If a library or bug sets err.statusCode = 200, we must not echo it.
      error = new ApiError({
        statusCode: 500,
        message: err?.message || "Something went wrong.",
        code: "INTERNAL_ERROR",
        errors: [],
        isOperational: false,
        cause: err instanceof Error ? err : null,
      });
    }
  }

  /* ── Step 2: Structured logging ──────────────────────────────────────────
     Serialize the cause chain so root-cause context is never lost in logs.
     Operational errors: log at error level with request context.
     Non-operational errors: log with alert: true for on-call routing.
  ──────────────────────────────────────────────────────────────────────── */

  const causeChain = serializeCause(error);

  const logPayload = {
    requestId,
    code: error.code,
    status: error.statusCode,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id ?? null,
    message: error.message,
    // Cause chain — only present when the error has a cause, keeps logs clean
    ...(causeChain !== undefined && { cause: causeChain }),
    // Stack in non-production only — production stacks leak implementation detail
    ...(process.env.NODE_ENV !== "production" && { stack: err?.stack }),
  };

  if (!error.isOperational) {
    logger.error({
      ...logPayload,
      alert: true,
      ...(typeof error.retryable === "boolean" && {
        retryable: error.retryable,
      }),
    });
  } else {
    logger.error(logPayload);
  }

  /* ── Step 3: Canonical response ──────────────────────────────────────────
     Always use clientMessage in production — ApiError guarantees it is
     safe for clients (5xx messages become "Internal server error").
     In development, use the raw message for easier debugging.
     Expose retryable in the response so clients and frontend retry logic
     can make informed decisions without hardcoding error code checks.
  ──────────────────────────────────────────────────────────────────────── */

  const isProd = process.env.NODE_ENV === "production";
  const clientMessage = isProd ? error.clientMessage : error.message;

  // Validate the final statusCode one last time — ApiError constructor
  // already sanitizes its own statusCode, but this is the last line of
  // defence before the HTTP response is written.
  const statusCode = isValidErrorStatusCode(error.statusCode)
    ? error.statusCode
    : 500;

  return res.status(statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: clientMessage,
      details: error.errors ?? [],
      // retryable — present only on ServiceUnavailableError instances.
      // Gives clients and frontend retry logic a reliable signal without
      // requiring them to inspect or hardcode error codes.
      ...(typeof error.retryable === "boolean" && {
        retryable: error.retryable,
      }),
    },
    requestId,
    ...(isProd === false && { stack: err?.stack }),
  });
};

export default errorMiddleware;
