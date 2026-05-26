/**
 * @file logger.js
 * @module utils/logger
 * @description Structured logger for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Provide a single, pre-configured Winston logger instance consumed
 *    across the entire platform
 *  • Enforce a consistent log entry shape in both development and
 *    production so structured fields (requestId, code, userId, etc.)
 *    are never silently dropped
 *  • Emit JSON in production for ingestion by log aggregators
 *    (Datadog, CloudWatch, Logtail, etc.)
 *  • Emit human-readable, colourised output in development without
 *    sacrificing structured field visibility
 *  • Guarantee that every log entry carries a minimum set of required
 *    fields so log aggregator queries are always reliable
 *  • Support runtime log level override via LOG_LEVEL environment variable
 *    so verbosity can be increased during incidents without redeployment
 *
 * This module intentionally does NOT:
 *  • Know about HTTP frameworks, request context, or business logic
 *  • Perform log sampling, redaction, or PII scrubbing — those are
 *    transport-level or aggregator-level concerns
 *  • Create child loggers per request — requestId is passed explicitly
 *    as a structured field on each log call
 *  • Handle transport backpressure — a high-scale concern addressed when
 *    log volume warrants it
 *
 * Log level resolution (in priority order)
 * ──────────────────────────────────────────
 *  1. LOG_LEVEL environment variable — explicit override, highest priority.
 *     Accepts: error | warn | info | debug
 *     Example: LOG_LEVEL=debug (enables debug output in production during
 *     an incident without redeployment)
 *  2. NODE_ENV=production → "info"
 *  3. All other environments → "debug"
 *
 *  Setting LOG_LEVEL=warn in production reduces log volume during high-
 *  traffic periods. Setting LOG_LEVEL=debug in production enables verbose
 *  output for incident diagnosis. Neither requires a redeploy.
 *
 * Log entry shape (production JSON)
 * ───────────────────────────────────
 *  Every entry carries at minimum:
 *  {
 *    timestamp:  string,   // ISO 8601
 *    level:      string,   // error | warn | info | debug
 *    service:    string,   // "tam-backend" — identifies source in aggregators
 *    message:    string,
 *    requestId:  string,   // "unavailable" when not in a request context
 *    // ...any additional structured fields passed by the caller
 *  }
 *
 *  Note on error.cause: cause chain context is serialized by errorMiddleware
 *  via serializeCause() before being passed to logger.error as a structured
 *  field. The logger itself does not need to walk cause chains — the
 *  structured `cause` field arrives pre-formatted.
 *
 * Development output format
 * ──────────────────────────
 *  [TIMESTAMP] [LEVEL] message
 *    service=<name>  requestId=<id>
 *    key1=<val>  key2=<val>  ...
 *    <stack trace if present>
 *
 *  Structured fields are printed on a second line so the primary message
 *  remains scannable while no field is ever silently dropped.
 *
 * Log levels (Winston default hierarchy)
 * ───────────────────────────────────────
 *  error   → operational errors, infrastructure failures, unhandled exceptions
 *  warn    → recoverable issues, invalid inputs, deprecation notices
 *  info    → request lifecycle, significant state changes (production minimum)
 *  debug   → detailed diagnostic output (development only by default)
 *
 * File transports (production only)
 * ───────────────────────────────────
 *  logs/error.log    → error level only
 *  logs/combined.log → all levels at or above the resolved log level
 *
 *  Set LOG_TO_FILE=false in containerized environments that forward stdout
 *  to a log collector (Datadog agent, Fluent Bit, etc.) to avoid redundant
 *  disk writes.
 */

import winston from "winston";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Valid Winston log level identifiers.
 * Used to validate LOG_LEVEL before trusting it.
 *
 * @type {Set<string>}
 */
const VALID_LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

/**
 * Resolved log level — in priority order:
 *  1. LOG_LEVEL env var (if present and valid)
 *  2. "info"  in production
 *  3. "debug" everywhere else
 *
 * Invalid LOG_LEVEL values are silently ignored and the environment-based
 * default is used instead, preventing a misconfigured env var from breaking
 * the logging system entirely.
 *
 * @type {string}
 */
const resolvedLogLevel = (() => {
  const override = process.env.LOG_LEVEL?.toLowerCase();
  if (override && VALID_LOG_LEVELS.has(override)) {
    return override;
  }
  return IS_PRODUCTION ? "info" : "debug";
})();

/**
 * Service name embedded in every log entry.
 * Allows log aggregators to filter by service when multiple services
 * write to the same log stream or index.
 *
 * @type {string}
 */
const SERVICE_NAME = process.env.SERVICE_NAME || "tam-backend";

/**
 * Controls whether file transports are active in production.
 * Set LOG_TO_FILE=false in containerized environments that forward
 * stdout to a log collector (Datadog agent, Fluent Bit, etc.).
 *
 * @type {boolean}
 */
const LOG_TO_FILE = process.env.LOG_TO_FILE !== "false";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Safely serializes any value to a JSON string, handling circular references
 * that arise when Node.js internals (Socket, HTTPParser, IncomingMessage, etc.)
 * are inadvertently attached to error objects and passed to the logger.
 *
 * Without this guard, JSON.stringify throws:
 *   "TypeError: Converting circular structure to JSON"
 * which crashes the Winston printf formatter and turns every request that
 * hits this code path into a 500, masking the original error entirely.
 *
 * Strategy:
 *  - Use a WeakSet to track every object reference visited during serialization.
 *  - Replace any back-reference with the sentinel string "[Circular]".
 *  - If JSON.stringify still throws for any other reason (e.g. a custom
 *    toJSON() that throws), fall back to String(value) so logging never
 *    crashes the request lifecycle.
 *
 * @param {unknown} value - The value to serialize.
 * @returns {string} A JSON string, or a "[Circular]" / String(value) fallback.
 */
const safeStringify = (value) => {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
  } catch {
    // Last-resort fallback — ensures the logger never throws.
    return String(value);
  }
};

/* ─────────────────────────────────────────────
   FORMATS
───────────────────────────────────────────── */

/**
 * Injects default values for required fields so every log entry has
 * a consistent, queryable shape regardless of what the caller passed.
 *
 * Required fields and their defaults:
 *  - service:   SERVICE_NAME constant (identifies source in aggregators)
 *  - requestId: "unavailable" (when logging outside a request context)
 *
 * Existing values from the caller are preserved — this only fills gaps.
 */
const defaultFields = winston.format((info) => {
  info.service = info.service || SERVICE_NAME;
  info.requestId = info.requestId || "unavailable";
  return info;
});

/**
 * Production-only PII redaction.
 *
 * Replaces email addresses anywhere in the structured
 * log payload before JSON serialization.
 *
 * This helps reduce accidental exposure of personal
 * data in log aggregators and external processors.
 */
const redactPii = winston.format((info) => {
  try {
    const serialized = JSON.stringify(info);

    const redacted = serialized.replace(
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]",
    );

    return JSON.parse(redacted);
  } catch {
    return info;
  }
});

/**
 * Production format — structured JSON for log aggregator ingestion.
 *
 * Format order matters:
 *  1. errors()      — must run first to attach stack to the info object
 *                     before any other format reads or serializes it
 *  2. defaultFields() — inject service and requestId defaults
 *  3. timestamp()   — add ISO 8601 timestamp
 *  4. json()        — serialize the final info object to JSON
 *
 * Note: Winston's built-in json() format uses its own safe serializer
 * internally, so circular references in production JSON output are already
 * handled. The safeStringify helper is only needed in the devFormat printf.
 */
const prodFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  defaultFields(),
  winston.format.timestamp(),
  redactPii(),
  winston.format.json(),
);

/**
 * Development format — human-readable, colourised, structured.
 *
 * Prints the primary message on the first line for scannability.
 * Prints all additional structured fields on a second line so no
 * caller-supplied field (requestId, code, userId, status, etc.)
 * is silently dropped.
 * Appends the stack trace on a third line when present.
 *
 * Format order matters:
 *  1. errors()      — attach stack before printf reads it
 *  2. defaultFields() — inject service and requestId defaults
 *  3. colorize()    — apply level colours
 *  4. timestamp()   — add human-readable timestamp
 *  5. printf()      — render the final string
 *
 * safeStringify is used instead of JSON.stringify in the printf template
 * to prevent circular-reference crashes when Node.js internals (Socket,
 * HTTPParser, etc.) are attached to logged error objects.
 */
const devFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  defaultFields(),
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, service, requestId, ...rest } =
      info;

    // Primary line — always present
    const primary = `${timestamp} [${level}]: ${message}`;

    // Context line — service and requestId always shown for traceability
    const context = `\n  service=${service}  requestId=${requestId}`;

    // Structured fields line — only rendered when extra fields exist.
    // safeStringify replaces JSON.stringify to handle circular references
    // in Node.js internal objects (Socket → HTTPParser → Socket, etc.)
    // that can appear inside error cause chains logged by errorMiddleware.
    const structuredEntries = Object.entries(rest).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    const structured =
      structuredEntries.length > 0
        ? `\n  ${structuredEntries.map(([k, v]) => `${k}=${safeStringify(v)}`).join("  ")}`
        : "";

    // Stack trace line — only when an Error was logged
    const stackTrace = stack ? `\n${stack}` : "";

    return `${primary}${context}${structured}${stackTrace}`;
  }),
);

/* ─────────────────────────────────────────────
   TRANSPORTS
───────────────────────────────────────────── */

/**
 * File transports — production only, and only when LOG_TO_FILE is enabled.
 * Containerized environments forwarding stdout to a collector should set
 * LOG_TO_FILE=false to avoid redundant disk writes.
 */
const fileTransports =
  IS_PRODUCTION && LOG_TO_FILE
    ? [
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
        }),
        new winston.transports.File({
          filename: "logs/combined.log",
        }),
      ]
    : [];

/* ─────────────────────────────────────────────
   LOGGER
───────────────────────────────────────────── */

const logger = winston.createLogger({
  level: resolvedLogLevel,
  format: IS_PRODUCTION ? prodFormat : devFormat,

  transports: [new winston.transports.Console(), ...fileTransports],

  // Do not exit on handled exceptions — let errorMiddleware manage
  // the response lifecycle. Unhandled exceptions are caught separately
  // in server.js via uncaughtException and unhandledRejection handlers.
  exitOnError: false,
});

export default logger;
