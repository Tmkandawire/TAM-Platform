/**
 * @file requestLogger.js
 * @module middleware/requestLogger
 * @description Structured HTTP request/response logger for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Log every completed or aborted HTTP request with full context:
 *    method, path, status code, response time, requestId, userId, and
 *    user agent
 *  • Emit log entries at the appropriate level based on HTTP status code
 *    so monitoring dashboards surface problems without extra filter config
 *  • Separate path from query string so log aggregators can group and
 *    alert by route pattern without query parameter noise
 *  • Guard against sensitive query parameter values reaching log storage
 *
 * This middleware intentionally does NOT:
 *  • Log request or response bodies — these may contain PII or secrets
 *  • Interfere with the response lifecycle — purely observational
 *  • Resolve route patterns (e.g. /users/:id) — a future analytics concern
 *  • Log response size — a future bandwidth monitoring concern
 *
 * Registration requirement
 * ─────────────────────────
 *  Must be registered in server.js AFTER requestContext so req.context
 *  is available and requestId can be included in every log entry.
 *
 *  Correct order in server.js:
 *    app.use(requestContext);     ← first — attaches req.context.requestId
 *    app.use(requestLogger);      ← second — reads req.context.requestId
 *    app.use(authMiddleware);
 *    app.use("/api", routes);
 *    app.use(errorMiddleware);    ← last
 *
 * Request lifecycle events — finish vs close
 * ───────────────────────────────────────────
 *  res.on("finish") fires when the response has been fully sent to the
 *  OS network buffer. This covers normal request completion.
 *
 *  res.on("close") fires when the underlying connection is closed before
 *  or after "finish". This covers:
 *    • Client disconnects mid-response
 *    • Request timeouts
 *    • Load balancer connection resets
 *
 *  Without handling "close", aborted requests are never logged — producing
 *  blind spots in traffic metrics and debugging. Both events are handled,
 *  but a guard ensures only one log entry is emitted per request regardless
 *  of which event fires first or whether both fire.
 *
 *  Aborted requests log at "warn" level with status 0 (no HTTP status was
 *  sent) so they are visible in monitoring without being treated as errors.
 *
 * IP trust model — infrastructure dependency
 * ───────────────────────────────────────────
 *  req.ip depends on Express's trust proxy configuration. Without it,
 *  req.ip returns the proxy IP (e.g. 127.0.0.1) rather than the real
 *  client IP. This affects rate limiting, audit logs, and security analysis.
 *
 *  To configure: app.set("trust proxy", 1) in server.js (for one proxy hop)
 *  or app.set("trust proxy", "loopback, linklocal, uniquelocal") for cloud
 *  environments (AWS ALB, Heroku, Railway, etc.).
 *
 *  This middleware logs req.ip as-is — trust proxy configuration is an
 *  infrastructure-level concern, not a logging concern.
 *
 * Query parameter sanitization
 * ─────────────────────────────
 *  Query strings are logged to aid debugging, but values for known sensitive
 *  parameter names are redacted before logging. This prevents tokens, secrets,
 *  and credential-adjacent values from reaching log storage or aggregator
 *  indexes where they may persist beyond their useful lifetime.
 *
 *  Redacted params: token, secret, password, key, apiKey, api_key, auth,
 *  authorization, access_token, refresh_token, signature, sig.
 *
 *  Redacted values are replaced with "[REDACTED]" so the presence of the
 *  parameter is still visible in logs without exposing its value.
 *
 *  Note: this is name-based redaction, not value-based. High-cardinality
 *  values on non-sensitive params (e.g. ?search=longstring) are not
 *  truncated — log storage costs at this platform's scale do not warrant
 *  the added complexity.
 *
 * Log level strategy
 * ───────────────────
 *  HTTP 5xx    → error  (server error — requires attention)
 *  HTTP 4xx    → warn   (client error — recoverable, worth tracking)
 *  Aborted     → warn   (status 0 — connection closed before response)
 *  Everything  → info   (nominal)
 *
 * Log entry shape
 * ────────────────
 *  {
 *    type:       "http_request",
 *    requestId:  string,
 *    method:     string,
 *    path:       string,
 *    query:      string | undefined,  // sanitized, omitted when absent
 *    status:     number,              // 0 for aborted requests
 *    duration:   number,              // milliseconds, integer
 *    aborted:    true | undefined,    // present only on aborted requests
 *    userId:     string | null,
 *    ip:         string,
 *    userAgent:  string | undefined
 *  }
 */

import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Query parameter names whose values are redacted before logging.
 * All entries are lowercased — matching is case-insensitive.
 *
 * @type {Set<string>}
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "secret",
  "password",
  "key",
  "apikey",
  "api_key",
  "auth",
  "authorization",
  "access_token",
  "refresh_token",
  "signature",
  "sig",
]);

const REDACTED = "[REDACTED]";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Determines the appropriate Winston log level for a given HTTP status code.
 *
 * @param   {number}  statusCode - 0 for aborted requests.
 * @returns {"error"|"warn"|"info"}
 */
function resolveLogLevel(statusCode) {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  if (statusCode === 0) return "warn"; // aborted — no HTTP status sent
  return "info";
}

/**
 * Splits req.originalUrl into path and sanitized query components.
 *
 * Redacts values for sensitive parameter names. Returns query as undefined
 * when no query string is present — omitting the field entirely keeps log
 * entries clean and avoids empty string noise in aggregator indexes.
 *
 * @param   {string} originalUrl
 * @returns {{ path: string, query: string | undefined }}
 */
function splitAndSanitizeUrl(originalUrl) {
  const separatorIndex = originalUrl.indexOf("?");

  if (separatorIndex === -1) {
    return { path: originalUrl, query: undefined };
  }

  const path = originalUrl.slice(0, separatorIndex);
  const rawQuery = originalUrl.slice(separatorIndex + 1);

  if (!rawQuery) {
    return { path, query: undefined };
  }

  // Rebuild the query string with sensitive values redacted.
  const sanitizedQuery = rawQuery
    .split("&")
    .map((pair) => {
      const eqIndex = pair.indexOf("=");
      if (eqIndex === -1) return pair;

      const key = pair.slice(0, eqIndex);
      const value = pair.slice(eqIndex + 1);

      return SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())
        ? `${key}=${REDACTED}`
        : `${key}=${value}`;
    })
    .join("&");

  return { path, query: sanitizedQuery || undefined };
}

/**
 * Emits a single structured log entry for a completed or aborted request.
 *
 * Extracted so both "finish" and "close" handlers can call it without
 * duplicating the log payload construction.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 * @param {number}                     start   - Date.now() at request start.
 * @param {boolean}                    aborted - Whether the request was aborted.
 */
function emitRequestLog(req, res, start, aborted) {
  const duration = Date.now() - start;
  const statusCode = aborted ? 0 : res.statusCode;
  const level = resolveLogLevel(statusCode);
  const { path, query } = splitAndSanitizeUrl(req.originalUrl);

  logger[level]({
    type: "http_request",
    requestId: req.context?.requestId,
    method: req.method,
    path,
    ...(query !== undefined && { query }),
    status: statusCode,
    duration,
    ...(aborted && { aborted: true }),
    userId: req.user?.id ?? null,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Logs completed and aborted HTTP requests with structured context.
 *
 * Handles both res "finish" (normal completion) and res "close" (aborted /
 * client disconnect) events. A logged flag ensures only one entry is emitted
 * per request regardless of event ordering.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Guard — ensures exactly one log entry per request even if both
  // "finish" and "close" fire (which can happen when the connection
  // closes immediately after the response completes).
  let logged = false;

  const onFinish = () => {
    if (logged) return;
    logged = true;
    cleanup();
    emitRequestLog(req, res, start, false);
  };

  const onClose = () => {
    if (logged) return;
    logged = true;
    cleanup();
    // res.writableEnded is true if the response was fully written before
    // the connection closed — treat as normal completion, not an abort.
    const aborted = !res.writableEnded;
    emitRequestLog(req, res, start, aborted);
  };

  // Cleanup — remove both listeners once one has fired to prevent
  // listener accumulation on long-lived connections.
  const cleanup = () => {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onClose);
  };

  res.on("finish", onFinish);
  res.on("close", onClose);

  next();
};

export default requestLogger;
