/**
 * @file rateLimitMiddleware.js
 *
 * All rate limiters for the TAM API.
 *
 * Limiter inventory
 * ─────────────────────────────────────────────────────────────
 *  globalLimiter        — applied once in server.js before all routes
 *  authRateLimiter      — login / register endpoints
 *  refreshLimiter       — token refresh endpoint
 *  uploadRateLimiter    — Cloudinary document upload endpoints
 *  adminActionLimiter   — all admin routes (router.use in adminRoutes.js)
 *  bulkActionLimiter    — bulk admin operations (applied per-route when built)
 *  broadcastLimiter     — POST /api/v1/admin/broadcasts
 *
 * Store strategy
 * ─────────────────────────────────────────────────────────────
 *  globalLimiter / authRateLimiter / refreshLimiter / uploadRateLimiter
 *  → in-memory. IP-keyed, stateless — a reset on restart is tolerable
 *    for general traffic shaping.
 *
 *  adminActionLimiter
 *  → Redis-backed with in-memory fallback (fail-open).
 *    Degrades loudly — every request during Redis outage logs a
 *    high-severity warning so the degradation is visible in monitoring.
 *
 *  bulkActionLimiter / broadcastLimiter
 *  → Redis-backed, FAIL-CLOSED. No in-memory fallback.
 *    These limiters MUST survive restarts. A Redis outage returns 503
 *    rather than allowing unprotected fan-out operations that cannot
 *    be undone. Availability is sacrificed to protect data integrity.
 *
 * Health check skip
 * ─────────────────────────────────────────────────────────────
 *  All limiters skip requests where skipHealthCheck() returns true.
 *  Add any additional health/readiness paths to HEALTH_PATHS below.
 *
 * Key prefix contract
 * ─────────────────────────────────────────────────────────────
 *  Each Redis-backed limiter defines a single PREFIX constant that is
 *  passed to BOTH makeStore() and userOrIpKey(). This guarantees the
 *  store namespace and the key namespace are always identical — a
 *  mismatch would silently create two separate rate-limit buckets.
 */

import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createRateLimitStore } from "../config/redis.js";
import ApiResponse from "../utils/apiResponse.js";
import logger from "../utils/logger.js";

// ─── Environment ──────────────────────────────────────────────────────────────

const IS_TEST = process.env.NODE_ENV === "test";

// ─── Dynamic limit config ─────────────────────────────────────────────────────
// All thresholds are env-overridable so tuning is a deploy-free change.
// Defaults are safe for production; override in staging/test as needed.

const LIMITS = Object.freeze({
  global: {
    max: Number(process.env.RL_GLOBAL_MAX ?? 100),
    windowMs: Number(process.env.RL_GLOBAL_WINDOW_MS ?? 15 * 60 * 1000),
  },
  auth: {
    max: Number(process.env.RL_AUTH_MAX ?? 10),
    windowMs: Number(process.env.RL_AUTH_WINDOW_MS ?? 60 * 60 * 1000),
  },
  refresh: {
    max: Number(process.env.RL_REFRESH_MAX ?? 10),
    windowMs: Number(process.env.RL_REFRESH_WINDOW_MS ?? 15 * 60 * 1000),
  },
  upload: {
    max: Number(process.env.RL_UPLOAD_MAX ?? 20),
    windowMs: Number(process.env.RL_UPLOAD_WINDOW_MS ?? 15 * 60 * 1000),
  },
  admin: {
    max: Number(process.env.RL_ADMIN_MAX ?? 30),
    windowMs: Number(process.env.RL_ADMIN_WINDOW_MS ?? 15 * 60 * 1000),
  },
  bulk: {
    max: Number(process.env.RL_BULK_MAX ?? 5),
    windowMs: Number(process.env.RL_BULK_WINDOW_MS ?? 10 * 60 * 1000),
  },
  broadcast: {
    max: Number(process.env.RL_BROADCAST_MAX ?? 2),
    windowMs: Number(process.env.RL_BROADCAST_WINDOW_MS ?? 60 * 1000),
  },
});

// ─── Shared base config ───────────────────────────────────────────────────────
// Applied to every limiter so header behaviour is consistent regardless
// of express-rate-limit version defaults.

const BASE_CONFIG = Object.freeze({
  standardHeaders: true, // RateLimit-* headers (RFC 6585 draft)
  legacyHeaders: false, // X-RateLimit-* — disabled, use standard only
});

// ─── Health check skip ────────────────────────────────────────────────────────
// Centralised list of paths that should never consume rate-limit quota.
// Add /healthz, /readyz, /api/health etc. here as your infra requires.

const HEALTH_PATHS = new Set(["/health", "/healthz", "/readyz"]);

const skipHealthCheck = (req) => HEALTH_PATHS.has(req.path);

// ─── Key generator factory ────────────────────────────────────────────────────
// Centralises the prefix + user/IP fallback logic so every limiter uses
// the same prefix for BOTH the store and the key — eliminating the risk
// of a store/key prefix mismatch creating separate unlinked buckets.
//
// Falls back to IP when req.user is absent (unauthenticated requests).
// Logs a warning when a loopback IP is detected so misconfigured proxy
// trust surfaces at runtime rather than silently producing wrong buckets.

const userOrIpKey = (prefix, req) => {
  if (req.user?.id) return `${prefix}${req.user.id}`;

  const ip = ipKeyGenerator(req);

  if (ip === "::1" || ip === "127.0.0.1") {
    logger.warn(
      "Rate limiter: loopback IP detected — verify trust proxy config.",
      {
        prefix,
        path: req.originalUrl,
      },
    );
  }

  return `${prefix}${ip}`;
};

// ─── Redis store factories ────────────────────────────────────────────────────

/**
 * Fail-open store — used by adminActionLimiter.
 * Redis outage → falls back to in-memory + logs a high-severity warning
 * on store creation failure. The degradation is loud but non-blocking.
 */
const makeStoreFailOpen = (prefix) => {
  if (IS_TEST) return undefined;

  try {
    return createRateLimitStore(prefix);
  } catch (err) {
    logger.error(
      `Rate limiter: Redis store init FAILED for "${prefix}" — ` +
        `degrading to in-memory (fail-open). Restart persistence is LOST.`,
      { error: err.message },
    );
    return undefined;
  }
};

/**
 * Fail-closed store — used by bulkActionLimiter and broadcastLimiter.
 * Redis outage → throws, which causes the limiter constructor to fail.
 * The limiter's handler then returns 503 on every request until Redis
 * recovers. Availability is sacrificed to preserve data integrity.
 *
 * In test environments returns undefined (in-memory) like all other limiters
 * so CI does not require a Redis sidecar.
 */
const makeStoreFailClosed = (prefix) => {
  if (IS_TEST) return undefined;
  // Let createRateLimitStore throw — caller catches and sets a dead store flag.
  return createRateLimitStore(prefix);
};

// ─── Breach handler factory ───────────────────────────────────────────────────
// Produces a consistent 429 response matching the ApiResponse shape
// used across the rest of the API.
//
// Sets Retry-After (seconds) so clients know exactly when to retry.
// Logs userId + IP + path on every breach for monitoring and triage.
//
// TODO: emit a metrics counter here tagged by limiterID so breach rates
// are dashboardable without log-parsing. Example:
//   metrics.increment("rate_limit.breach", { limiter: limiterID });

const makeHandler = (message, limiterID) => (req, res, _next, options) => {
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
  res.setHeader("Retry-After", retryAfterSeconds);

  logger.warn("Rate limit exceeded", {
    limiter: limiterID,
    userId: req.user?.id ?? null,
    ip: ipKeyGenerator(req),
    path: req.originalUrl,
    method: req.method,
    retryAfterSeconds,
  });

  res.status(429).json(new ApiResponse(429, null, message));
};

// ─── Unavailable handler ──────────────────────────────────────────────────────
// Returned by fail-closed limiters when their Redis store is unavailable.
// 503 signals a transient infra issue — not a client error — so the client
// knows to retry later rather than treat the request as permanently rejected.

const makeUnavailableHandler = (limiterID) => (req, res) => {
  logger.error(
    `Rate limiter "${limiterID}": Redis unavailable — request blocked (fail-closed).`,
    {
      userId: req.user?.id ?? null,
      path: req.originalUrl,
      method: req.method,
    },
  );

  res
    .status(503)
    .json(
      new ApiResponse(
        503,
        null,
        "Service temporarily unavailable. Please try again shortly.",
      ),
    );
};

// ─── Fail-closed limiter factory ──────────────────────────────────────────────
// Attempts to create a Redis-backed limiter. If the store is unavailable,
// returns a middleware that immediately responds 503 — no in-memory fallback,
// no silent degradation.

const makeFailClosedLimiter = ({
  prefix,
  windowMs,
  max,
  limiterID,
  message,
}) => {
  try {
    const store = makeStoreFailClosed(prefix);
    return rateLimit({
      ...BASE_CONFIG,
      windowMs,
      limit: max,
      store,
      skip: skipHealthCheck,
      keyGenerator: (req) => userOrIpKey(prefix, req),
      handler: makeHandler(message, limiterID),
    });
  } catch (err) {
    logger.error(
      `Rate limiter "${limiterID}": Redis store unavailable at startup — ` +
        `all requests will be blocked (fail-closed) until Redis recovers.`,
      { error: err.message },
    );
    // Return a middleware that always 503s — no rate limiting, no pass-through.
    return makeUnavailableHandler(limiterID);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

/* ─── Global ──────────────────────────────────────────────────────────────────
   In-memory. IP-keyed general traffic shaping applied before all routes
   in server.js. Skips health paths so uptime monitors never consume quota.   */

export const globalLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.global.windowMs,
  limit: LIMITS.global.max,
  keyGenerator: (req) => userOrIpKey("global:", req),
  skip: skipHealthCheck,
  handler: makeHandler("Too many requests. Try again later.", "global"),
});

/* ─── Auth (login / register) ────────────────────────────────────────────────
   In-memory. Keyed by email + IP to slow credential-stuffing without a
   Redis dependency on the auth path. skipSuccessfulRequests means only
   failed attempts count — a user who logs in after a few typos is not
   penalised.

   NOTE: keyGenerator reads req.body?.email — express.json() must be
   registered in server.js before this limiter runs. If body parsing has
   not yet run, req.body is undefined and the key falls back to IP-only.
   This is intentional and safe; documented here to prevent it being
   mistaken for a bug during debugging.                                        */

export const authRateLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.auth.windowMs,
  limit: LIMITS.auth.max,
  skipSuccessfulRequests: true,
  skip: skipHealthCheck,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase?.();
    const ip = ipKeyGenerator(req);
    return email ? `auth:${email}-${ip}` : `auth:${ip}`;
  },
  handler: makeHandler(
    "Too many authentication attempts. Try again later.",
    "auth",
  ),
});

/* ─── Token refresh ───────────────────────────────────────────────────────────
   In-memory. Short window, low limit.                                         */

export const refreshLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.refresh.windowMs,
  limit: LIMITS.refresh.max,
  skip: skipHealthCheck,
  keyGenerator: (req) => userOrIpKey("refresh:", req),
  handler: makeHandler("Too many token refresh attempts.", "refresh"),
});

/* ─── Document upload ─────────────────────────────────────────────────────────
   In-memory. Cloudinary cost control. Keyed by user ID when authenticated,
   IP fallback for unauthenticated edge cases.                                 */

export const uploadRateLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.upload.windowMs,
  limit: LIMITS.upload.max,
  skip: skipHealthCheck,
  keyGenerator: (req) => userOrIpKey("upload:", req),
  handler: makeHandler(
    "Too many document uploads. Please slow down.",
    "upload",
  ),
});

/* ─── Admin action ────────────────────────────────────────────────────────────
   Redis-backed, FAIL-OPEN (in-memory fallback).
   Applied via router.use() in adminRoutes.js — baseline cap for all admin
   endpoints. Degrades loudly on Redis outage but does not block traffic.

   Keyed by user ID: admins share office IPs / VPNs so IP-keying produces
   false positives across unrelated admin accounts.

   PREFIX is defined once and passed to both makeStoreFailOpen() and
   userOrIpKey() — the two must always match.                                  */

const ADMIN_PREFIX = "rl:admin:";

export const adminActionLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.admin.windowMs,
  limit: LIMITS.admin.max,
  store: makeStoreFailOpen(ADMIN_PREFIX),
  skip: skipHealthCheck,
  keyGenerator: (req) => userOrIpKey(ADMIN_PREFIX, req),
  handler: makeHandler(
    "Admin action limit reached. Try again in 15 minutes.",
    "admin",
  ),
});

/* ─── Bulk action ─────────────────────────────────────────────────────────────
   Redis-backed, FAIL-CLOSED. No in-memory fallback.
   Applied per-route on bulk endpoints — not yet applied globally.

   Tighter than adminActionLimiter because bulk ops fan out to many records
   per request. Redis outage → 503 until Redis recovers.                       */

export const bulkActionLimiter = makeFailClosedLimiter({
  prefix: "rl:bulk:",
  windowMs: LIMITS.bulk.windowMs,
  max: LIMITS.bulk.max,
  limiterID: "bulk",
  message: "Bulk action limit reached. Wait 10 minutes before retrying.",
});

/* ─── Broadcast ───────────────────────────────────────────────────────────────
   Redis-backed, FAIL-CLOSED. No in-memory fallback.
   Applied in broadcastRoutes.js.

   Limit is 2 (not 1) to allow one legitimate retry within the window if
   the first attempt fails (timeout, bad payload, transient error) without
   meaningfully increasing fan-out risk.

   Broadcasts fan out to potentially thousands of users (notifications +
   emails) — this is the strictest limiter in the stack. Redis outage → 503
   until Redis recovers. Availability is sacrificed to protect users from
   duplicate fan-out that cannot be undone.                                    */

export const broadcastLimiter = makeFailClosedLimiter({
  prefix: "rl:broadcast:",
  windowMs: LIMITS.broadcast.windowMs,
  max: LIMITS.broadcast.max,
  limiterID: "broadcast",
  message: "Broadcast limit reached. You can send 2 broadcasts per minute.",
});
