/**
 * @file csrfMiddleware.js
 * @module middleware/csrf
 *
 * Implements multi-layer CSRF protection using the double-submit cookie
 * pattern with origin validation and timing-safe token comparison.
 *
 * Protection layers (applied in order)
 * ──────────────────────────────────────
 *  1. Method filter      — safe methods (GET, HEAD, OPTIONS) bypass all checks.
 *                          CSRF attacks require state-mutating requests.
 *  2. Origin validation  — Origin or Referer header must be present and match
 *                          an entry in ALLOWED_ORIGINS. First line of defence
 *                          against cross-origin requests before token inspection.
 *  3. Token presence     — Both the X-CSRF-Token header and csrfToken cookie
 *                          must be present and non-empty.
 *  4. Token format       — Both tokens must match the expected format
 *                          (64 hex characters — 32 bytes of entropy).
 *  5. Timing-safe compare — crypto.timingSafeEqual() prevents timing attacks
 *                          that could leak token values via response time.
 *
 * Configuration (environment variables)
 * ──────────────────────────────────────
 *  ALLOWED_ORIGINS — comma-separated list of permitted origins.
 *                    Example: "http://localhost:3000,https://yourapp.com"
 *
 *                    Production behaviour (NODE_ENV === "production"):
 *                    If absent or empty, the process exits immediately at
 *                    startup with a non-zero exit code. The server will
 *                    never accept a request in a misconfigured state.
 *
 *                    Development behaviour (NODE_ENV !== "production"):
 *                    If absent or empty, origin validation is skipped and
 *                    a warning is logged. This allows local development
 *                    without requiring the variable to be set.
 *
 * Cookie assumptions
 * ──────────────────
 *  This middleware reads req.cookies.csrfToken. The cookie is expected
 *  to be set with the following attributes by the auth layer:
 *    - httpOnly: false  — must be readable by client JS to inject into
 *                         the X-CSRF-Token header (intentional)
 *    - secure:   true   — HTTPS only in production
 *    - sameSite: "strict" or "lax" — additional browser-level protection
 *
 *  This middleware does not set or validate cookie attributes — that is
 *  the responsibility of the layer that issues the CSRF cookie.
 *
 * Route-level opt-out
 * ────────────────────
 *  Endpoints that must bypass CSRF (webhooks, OAuth callbacks, public APIs)
 *  should set req.skipCsrf = true in a preceding middleware rather than
 *  removing this middleware from the route chain. This keeps CSRF protection
 *  visible in the route definition while allowing controlled exceptions.
 *
 * Observability
 * ─────────────
 *  Every CSRF failure is logged at warn level with:
 *    - requestId  for distributed trace correlation
 *    - ip         for forensic analysis
 *    - method     and path for request identification
 *    - reason     machine-readable failure cause
 *  Token values are deliberately excluded — logging secrets is never
 *  acceptable regardless of log storage security guarantees.
 */

import crypto from "crypto";
import logger from "../utils/logger.js";
import { ForbiddenError } from "../errors/index.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * HTTP methods that are inherently safe — they must not mutate state
 * and are therefore not vulnerable to CSRF. All other methods require
 * full CSRF validation.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Expected token format: 64 lowercase hex characters (32 bytes of entropy).
 * Industry standard for CSRF tokens — sufficient entropy to make
 * brute-force and collision attacks computationally infeasible.
 *
 * Tokens not matching this pattern are rejected before comparison —
 * a malformed token cannot be a valid token regardless of its value.
 */
const CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Parsed allowlist of permitted origins, built once at module load.
 *
 * In production, absence of ALLOWED_ORIGINS is a fatal misconfiguration
 * and the process exits immediately — the server must never start in a
 * state where origin validation is silently disabled.
 *
 * In development, absence triggers a startup warning and origin
 * validation is skipped to allow local development without configuration.
 *
 * @type {Set<string>}
 */
const ALLOWED_ORIGINS = buildAllowedOrigins();

/* ─────────────────────────────────────────────
   STARTUP INITIALISATION
───────────────────────────────────────────── */

/**
 * Parses ALLOWED_ORIGINS from the environment and enforces its presence
 * in production.
 *
 * Called once at module load — not per request. The cost of parsing and
 * validation is paid at startup, never on the hot path.
 *
 * Production fail-fast strategy
 * ──────────────────────────────
 * process.exit(1) is intentional and correct here. This is not an
 * operational error that errorMiddleware can handle — it is a
 * misconfiguration that must prevent the server from ever starting.
 * Throwing an unhandled exception would also crash the process, but
 * process.exit(1) is explicit, immediate, and produces a clear log
 * message before exiting rather than an unformatted stack trace.
 *
 * @returns {Set<string>}
 */
function buildAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  const isProduction = process.env.NODE_ENV === "production";

  const isEmpty = !raw || raw.trim().length === 0;

  if (isEmpty) {
    if (isProduction) {
      // Fatal misconfiguration — the server must not start without an
      // origin allowlist in production. Origin validation silently disabled
      // in production is a security hole, not a recoverable condition.
      try {
        logger.error(
          "[csrfMiddleware] FATAL: ALLOWED_ORIGINS is not set in production. " +
            "The server cannot start without an origin allowlist. " +
            "Set ALLOWED_ORIGINS in your environment and restart.",
        );
      } catch {
        // Logger may not be initialised this early — write directly to
        // stderr so the misconfiguration is always visible in process logs.
        process.stderr.write(
          "[csrfMiddleware] FATAL: ALLOWED_ORIGINS is not set in production.\n",
        );
      }

      process.exit(1);
    }

    // Development — warn and continue without origin validation.
    try {
      logger.warn(
        "[csrfMiddleware] ALLOWED_ORIGINS is not set. " +
          "Origin validation will be skipped. " +
          "This must not occur in production.",
      );
    } catch {
      // Logger unavailable during early startup — silently continue.
    }

    return new Set();
  }

  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  return new Set(origins);
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Extracts the request origin from the Origin header, falling back to
 * the scheme + host portion of the Referer header when Origin is absent.
 *
 * Origin is preferred — it is set by all modern browsers on cross-origin
 * and same-origin state-mutating requests.
 * Referer is the fallback for older clients that omit Origin.
 *
 * Returns null when neither header is present — the caller treats this
 * as an origin validation failure.
 *
 * @param {import("express").Request} req
 * @returns {string | null}
 */
function extractOrigin(req) {
  const origin = req.headers["origin"];

  if (origin && origin.trim().length > 0) {
    return origin.trim();
  }

  const referer = req.headers["referer"];

  if (referer && referer.trim().length > 0) {
    try {
      const url = new URL(referer);
      // Return only scheme + host — path and query are irrelevant for
      // origin matching and must not appear in the allowlist comparison.
      return `${url.protocol}//${url.host}`;
    } catch {
      // Malformed Referer — treat as absent.
      return null;
    }
  }

  return null;
}

/**
 * Performs a timing-safe equality check between two strings.
 *
 * crypto.timingSafeEqual() operates on equal-length Buffers. When lengths
 * differ the strings cannot be equal — we return false immediately, but
 * only after a dummy self-comparison on bufA so the function takes a
 * consistent code path and does not leak length information through
 * early-return timing differences.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    // Dummy comparison — ensures consistent timing regardless of length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Logs a CSRF failure at warn level with full request context.
 *
 * Token values are deliberately excluded — logging secrets is never
 * acceptable regardless of log storage security guarantees.
 *
 * Wrapped in try/catch — logger failure must never affect the error
 * response returned to the client.
 *
 * @param {import("express").Request} req
 * @param {string} reason  Machine-readable failure reason for alerting.
 */
function logCsrfFailure(req, reason) {
  try {
    logger.warn("[csrfMiddleware] CSRF validation failed.", {
      reason,
      requestId: req.context?.requestId ?? "unavailable",
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
    });
  } catch {
    // Logger failure must never suppress the CSRF error response.
  }
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Express middleware that enforces CSRF protection on all state-mutating
 * requests (POST, PUT, PATCH, DELETE).
 *
 * Applies five protection layers in order — see file header for detail.
 * Any failure calls next(ForbiddenError) and logs the failure with context.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 */
const csrfProtection = (req, res, next) => {
  // ── Layer 0: Route-level opt-out ───────────────────────────────────────
  // Webhooks, OAuth callbacks, and public APIs set req.skipCsrf = true
  // in a preceding middleware. This keeps the exception visible in the
  // route definition rather than hidden in route registration.
  if (req.skipCsrf === true) {
    return next();
  }

  // ── Layer 1: Method filter ─────────────────────────────────────────────
  // Safe methods cannot mutate state and are not CSRF targets.
  // GET, HEAD, and OPTIONS bypass all subsequent checks at zero cost.
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // ── Layer 2: Origin validation ─────────────────────────────────────────
  // Only enforced when ALLOWED_ORIGINS is configured — skipped in
  // development environments where the env var is intentionally absent.
  // In production, ALLOWED_ORIGINS is guaranteed non-empty by the
  // fail-fast check in buildAllowedOrigins().
  if (ALLOWED_ORIGINS.size > 0) {
    const requestOrigin = extractOrigin(req);

    if (!requestOrigin || !ALLOWED_ORIGINS.has(requestOrigin)) {
      logCsrfFailure(req, "ORIGIN_NOT_ALLOWED");
      return next(ForbiddenError.csrf("origin"));
    }
  }

  // ── Layer 3: Token presence ────────────────────────────────────────────
  // Both the header token and the cookie token must be present and
  // non-empty. A missing token on either side is an immediate failure —
  // there is nothing to compare against.
  const csrfFromHeader = req.headers["x-csrf-token"]?.trim();
  const csrfFromCookie = req.cookies?.csrfToken?.trim();

  if (!csrfFromHeader || !csrfFromCookie) {
    logCsrfFailure(req, "TOKEN_MISSING");
    return next(ForbiddenError.csrf("missing"));
  }

  // ── Layer 4: Token format validation ──────────────────────────────────
  // Both tokens must match the expected 64-character hex format before
  // comparison. A malformed token cannot be a valid token — rejecting
  // it here avoids wasting a timing-safe comparison on garbage input
  // and prevents format-based probing attacks.
  if (
    !CSRF_TOKEN_PATTERN.test(csrfFromHeader) ||
    !CSRF_TOKEN_PATTERN.test(csrfFromCookie)
  ) {
    logCsrfFailure(req, "TOKEN_FORMAT_INVALID");
    return next(ForbiddenError.csrf("invalid"));
  }

  // ── Layer 5: Timing-safe comparison ───────────────────────────────────
  // crypto.timingSafeEqual() ensures the comparison takes constant time
  // regardless of where the strings first differ — prevents timing attacks
  // that could leak token values by measuring response latency.
  if (!timingSafeEqual(csrfFromHeader, csrfFromCookie)) {
    logCsrfFailure(req, "TOKEN_MISMATCH");
    return next(ForbiddenError.csrf("invalid"));
  }

  // All layers passed — request is permitted.
  next();
};

export default csrfProtection;
