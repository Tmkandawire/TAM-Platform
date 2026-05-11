/**
 * @file requestContext.js
 * @module middleware/requestContext
 * @description Per-request context initialization for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Generate a unique requestId for every incoming request
 *  • Attach a context object to req so all downstream middleware,
 *    controllers, and services can access trace data without prop-drilling
 *    or module-level singletons
 *  • Reflect the requestId back to the client via the X-Request-Id
 *    response header so clients can correlate their requests with
 *    server-side log entries
 *
 * This middleware intentionally does NOT:
 *  • Authenticate or authorize the request
 *  • Parse or validate the request body
 *  • Know about business logic or domain rules
 *  • Use async-local-storage or continuation-local-storage — req.context
 *    is sufficient for this platform's current observability needs
 *  • Propagate requestId to queues, event bus, or email service — that
 *    is a next-level observability concern addressed when those systems
 *    are instrumented
 *
 * Registration requirement
 * ─────────────────────────
 *  This middleware MUST be registered in server.js as the very first
 *  middleware — before requestLogger, authMiddleware, and all routes.
 *  Any middleware that runs before this one will not have access to
 *  req.context.requestId, which means log entries from those middleware
 *  will be missing the trace ID.
 *
 *  Correct order in server.js:
 *    app.use(requestContext);     ← first
 *    app.use(requestLogger);
 *    app.use(authMiddleware);
 *    app.use("/api", routes);
 *    app.use(errorMiddleware);    ← last
 *
 * requestId strategy
 * ───────────────────
 *  If the incoming request carries an X-Request-Id header, that value is
 *  used as the requestId. This supports:
 *
 *  1. API gateways and load balancers that inject a trace ID upstream
 *     (AWS ALB, Nginx, Kong) — using their ID links TAM logs to gateway logs
 *
 *  2. End-to-end tracing across services — a calling service can inject a
 *     correlation ID that flows through every hop
 *
 *  If no X-Request-Id header is present, or if the value fails validation,
 *  a new UUID v4 is generated. Invalid headers are logged as warnings so
 *  malformed clients and abuse patterns are detectable.
 *
 *  Note on ID collisions: two clients could theoretically send the same
 *  upstream ID. This is accepted behavior in distributed tracing systems —
 *  collision probability with UUID v4 is negligible for this platform's
 *  scale, and cross-client ID reuse is an acceptable tradeoff for the
 *  benefit of gateway log correlation.
 *
 * Header normalization
 * ─────────────────────
 *  The X-Request-Id header is read after explicit lowercasing of the header
 *  name rather than relying on Express's normalization behavior. While
 *  Express normalizes headers to lowercase in most environments, some
 *  proxies and non-standard HTTP clients may preserve original casing.
 *  Explicit normalization ensures consistent behavior regardless of the
 *  runtime environment.
 *
 * X-Request-Id header validation
 * ────────────────────────────────
 *  Incoming X-Request-Id values are validated before use:
 *  • Must be a non-empty string
 *  • Maximum 128 characters (prevents log injection via oversized headers)
 *  • Stripped of any characters outside [a-zA-Z0-9-_] (prevents log
 *    injection via special characters or newlines)
 *  If the header fails validation, a warning is logged and a fresh UUID
 *  is generated instead. The request is never blocked.
 *
 * req.context shape
 * ──────────────────
 *  req.context = {
 *    requestId: string   // UUID v4 or sanitized upstream trace ID
 *  }
 *
 * Usage in downstream middleware / controllers
 * ─────────────────────────────────────────────
 *  const { requestId } = req.context;
 *
 *  logger.info({ requestId, message: "Processing request" });
 *  res.json({ ..., requestId });
 */

import { randomUUID } from "crypto";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * The canonical header name this middleware reads, lowercased explicitly.
 * Not relying on Express normalization — see "Header normalization" above.
 *
 * @type {string}
 */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Maximum permitted length for an incoming X-Request-Id header value.
 * Values exceeding this are rejected and replaced with a fresh UUID.
 *
 * @type {number}
 */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Allowlist pattern for X-Request-Id characters.
 * Permits alphanumerics, hyphens, and underscores — the character set
 * used by all major API gateways and tracing systems (UUID v4, ULID,
 * AWS trace IDs, OpenTelemetry span IDs).
 *
 * Rejects newlines, spaces, and special characters that could cause
 * log injection or header splitting attacks.
 *
 * @type {RegExp}
 */
const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9\-_]+$/;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Extracts and explicitly lowercases the X-Request-Id header value.
 *
 * Reads directly from req.headers using an explicitly lowercased key
 * rather than relying on Express's header normalization. This is defensive
 * against proxies and non-standard HTTP clients that preserve original
 * header casing.
 *
 * @param   {import("express").Request} req
 * @returns {string|undefined}
 */
function extractRawRequestId(req) {
  // Normalize all header keys to lowercase, then read our target key.
  // This handles any casing variant: X-Request-Id, X-REQUEST-ID, x-request-id.
  for (const key of Object.keys(req.headers)) {
    if (key.toLowerCase() === REQUEST_ID_HEADER) {
      return req.headers[key];
    }
  }
  return undefined;
}

/**
 * Validates and returns an upstream requestId from the request header,
 * or generates a fresh UUID v4 if the header is absent or invalid.
 *
 * Invalid headers are logged at warn level so malformed clients and
 * potential abuse patterns are visible in log aggregators without
 * blocking or erroring the request.
 *
 * @param   {import("express").Request} req
 * @returns {string} A valid, safe requestId.
 */
function resolveRequestId(req) {
  const incoming = extractRawRequestId(req);

  // No header present — generate silently, nothing to warn about.
  if (incoming === undefined) {
    return randomUUID();
  }

  // Header present but failed validation — log and generate a replacement.
  if (
    typeof incoming !== "string" ||
    incoming.length === 0 ||
    incoming.length > MAX_REQUEST_ID_LENGTH ||
    !SAFE_REQUEST_ID_PATTERN.test(incoming)
  ) {
    logger.warn({
      message:
        "Invalid X-Request-Id header received — generating a replacement UUID.",
      receivedLength: typeof incoming === "string" ? incoming.length : null,
      // Do not log the raw value — it may contain injection payloads.
      // Logging its length and type is sufficient for diagnosis.
      receivedType: typeof incoming,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    return randomUUID();
  }

  return incoming;
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Initializes req.context with a requestId for the current request.
 *
 * Must be registered as the first middleware in server.js.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 */
const requestContext = (req, res, next) => {
  const requestId = resolveRequestId(req);

  /**
   * Attach context to req.
   *
   * Using an object rather than setting requestId directly on req
   * (req.requestId) keeps the shape extensible — future context fields
   * (e.g. tenantId, traceFlags, correlationId) can be added here without
   * touching any downstream middleware that already destructures req.context.
   */
  req.context = { requestId };

  /**
   * Reflect the requestId back in the response header.
   *
   * This allows clients to:
   *  1. Correlate their request with server-side log entries
   *  2. Pass the ID to support teams when reporting issues
   *  3. Chain the ID into subsequent requests for end-to-end tracing
   */
  res.setHeader("X-Request-Id", requestId);

  next();
};

export default requestContext;
