/**
 * @file errorMiddleware.js
 * @module middleware/errorMiddleware
 * @description Centralised error handler for the TAM Platform.
 *
 * FIX NOTES (2026-05-16)
 * ─────────────────────────────────────────────────────────────
 *  UnauthorizedError (and potentially other ApiError subclasses) were
 *  being caught by the final `else` branch and wrapped as generic 500
 *  INTERNAL_ERROR responses, even though they carry isOperational: true
 *  and a correct statusCode (401).
 *
 *  Root cause: ES module circular imports can break the `instanceof`
 *  chain. When `errors/index.js` re-exports UnauthorizedError and
 *  `utils/ApiError.js` is imported separately, the class identity of
 *  ApiError at import time in errorMiddleware may differ from the one
 *  used as the base class in UnauthorizedError — making
 *  `err instanceof ApiError` return false even for legitimate subclasses.
 *
 *  Fix: added a duck-type check `isApiError()` that inspects the shape
 *  of the error object (statusCode, code, isOperational, errors) rather
 *  than relying solely on instanceof. This is more robust across module
 *  boundaries and ESM re-export patterns.
 *
 *  The instanceof check is kept as the primary path (it works in most
 *  cases); the duck-type check is the fallback so no ApiError subclass
 *  is ever silently promoted to a 500.
 */

import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "../errors/index.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const isValidErrorStatusCode = (code) =>
  Number.isInteger(code) && code >= 400 && code <= 599;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function getRequestId(req) {
  return req.context?.requestId ?? "unavailable";
}

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
 * Duck-type check for ApiError shape.
 *
 * Used as a fallback when `instanceof ApiError` fails due to ES module
 * circular import issues breaking the prototype chain. An object that
 * looks like an ApiError (has statusCode, code, isOperational, errors)
 * is treated as one — this is safe because no third-party error library
 * uses this exact combination of fields.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isApiError(err) {
  return (
    err != null &&
    typeof err === "object" &&
    typeof err.statusCode === "number" &&
    typeof err.code === "string" &&
    typeof err.isOperational === "boolean" &&
    Array.isArray(err.errors)
  );
}

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
  if (err.name === "ZodError") {
    return ValidationError.zod(err);
  }

  return null;
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

const errorMiddleware = (err, req, res, next) => {
  const requestId = getRequestId(req);

  /* ── Step 1: Normalize to a typed ApiError subclass ─────────────────────
     Order:
       1. Framework-specific checks (inspect raw err properties)
       2. instanceof ApiError (works when module identity is intact)
       3. Duck-type isApiError() (fallback for broken instanceof chains)
       4. Unknown error → generic 500
  ──────────────────────────────────────────────────────────────────────── */

  let error = normalizeFrameworkError(err);

  if (!error) {
    if (err instanceof ApiError) {
      // Primary path — works in most cases
      error = err;
    } else if (isApiError(err)) {
      // Fallback — handles ApiError subclasses whose instanceof chain is
      // broken by ES module circular imports. Cast to ApiError so the rest
      // of this middleware can use it uniformly.
      error = err;
    } else {
      // Unknown error — always 500, never trust err.statusCode
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
     Non-operational errors logged with alert: true for on-call routing.
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
    ...(causeChain !== undefined && { cause: causeChain }),
    ...(process.env.NODE_ENV !== "production" && { stack: err?.stack }),
  };

  if (!error.isOperational) {
    logger.error(error.message, {
      ...logPayload,
      alert: true,
      ...(typeof error.retryable === "boolean" && {
        retryable: error.retryable,
      }),
    });
  } else {
    logger.error(error.message, logPayload);
  }

  /* ── Step 3: Canonical response ──────────────────────────────────────────
     Always sanitize the status code — never trust an unknown error's value.
  ──────────────────────────────────────────────────────────────────────── */

  const isProd = process.env.NODE_ENV === "production";
  const clientMessage = isProd
    ? (error.clientMessage ?? error.message)
    : error.message;

  const statusCode = isValidErrorStatusCode(error.statusCode)
    ? error.statusCode
    : 500;

  return res.status(statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: clientMessage,
      details: error.errors ?? [],
      ...(typeof error.retryable === "boolean" && {
        retryable: error.retryable,
      }),
    },
    requestId,
    ...(isProd === false && { stack: err?.stack }),
  });
};

export default errorMiddleware;
