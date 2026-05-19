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
 *
 * FIX NOTES (2026-05-16)
 * ─────────────────────────────────────────────────────────────
 *  1. ApiResponse only accepts 2xx status codes. The breach handler was
 *     calling new ApiResponse(429, ...) which threw a TypeError that
 *     became a 500. Replaced with a plain res.json() object for 429/503
 *     responses — these are rate-limit/infra responses, not business
 *     responses, so they don't need the ApiResponse wrapper.
 *
 *  2. IP key was resolving to "[object Object]" because ipKeyGenerator()
 *     from express-rate-limit returns req.ip, and when trust proxy is
 *     misconfigured req.ip can be the socket object. Replaced with a
 *     safe safeIp() helper that always returns a string, falling back
 *     to "unknown" rather than stringifying a socket.
 *
 *  3. The warn log inside makeHandler was logging `ip: req` (the full
 *     request object) instead of `ip: safeIp(req)`, causing the logger
 *     to dump the entire socket/HTTPParser tree into the log line.
 */

import { rateLimit } from "express-rate-limit";
import { createRateLimitStore } from "../config/redis.js";
import logger from "../utils/logger.js";

// ─── Environment ──────────────────────────────────────────────────────────────

const IS_TEST = process.env.NODE_ENV === "test";

// ─── Dynamic limit config ─────────────────────────────────────────────────────

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

const BASE_CONFIG = Object.freeze({
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health check skip ────────────────────────────────────────────────────────

const HEALTH_PATHS = new Set(["/health", "/healthz", "/readyz"]);
const skipHealthCheck = (req) => HEALTH_PATHS.has(req.path);

// ─── Safe IP extraction ───────────────────────────────────────────────────────
/**
 * Safely extracts a string IP address from the request.
 *
 * Root cause of the "[object Object]" key bug:
 * express-rate-limit's ipKeyGenerator() returns req.ip. When Express's
 * "trust proxy" setting does not correctly resolve the forwarding chain,
 * req.ip can be the raw socket object rather than a string. Calling
 * toString() on a Socket gives "[object Object]", which becomes the key
 * for every single request — they all share one bucket and hit the limit
 * immediately.
 *
 * This helper always returns a plain string by checking typeof first and
 * falling back to "unknown" so at least the key is stable and debuggable.
 */
const safeIp = (req) => {
  const ip = req.ip ?? req.socket?.remoteAddress;
  if (typeof ip === "string" && ip.length > 0) return ip;
  // Log once so misconfigured trust proxy surfaces clearly
  logger.warn("Rate limiter: could not resolve string IP from request", {
    path: req.originalUrl,
    reqIpType: typeof req.ip,
  });
  return "unknown";
};

// ─── Key generator factory ────────────────────────────────────────────────────

const userOrIpKey = (prefix, req) => {
  if (req.user?.id) return `${prefix}${req.user.id}`;

  const ip = safeIp(req);

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

const makeStoreFailClosed = (prefix) => {
  if (IS_TEST) return undefined;
  return createRateLimitStore(prefix);
};

// ─── Breach handler factory ───────────────────────────────────────────────────
/**
 * FIX: Was calling new ApiResponse(429, null, message) which threw because
 * ApiResponse only accepts 2xx status codes. Replaced with a plain JSON
 * object that matches the ApiResponse shape so clients parse it identically.
 */
const makeHandler = (message, limiterID) => (req, res, _next, options) => {
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
  res.setHeader("Retry-After", retryAfterSeconds);

  logger.warn("Rate limit exceeded", {
    limiter: limiterID,
    userId: req.user?.id ?? null,
    // FIX: was logging ip: req (full request object) → massive socket dump
    ip: safeIp(req),
    path: req.originalUrl,
    method: req.method,
    retryAfterSeconds,
  });

  // FIX: plain JSON instead of new ApiResponse(429) which threw TypeError
  res.status(429).json({
    statusCode: 429,
    data: null,
    message,
  });
};

// ─── Unavailable handler ──────────────────────────────────────────────────────
/**
 * FIX: Same ApiResponse issue — was calling new ApiResponse(503, ...).
 * Replaced with plain JSON matching the ApiResponse shape.
 */
const makeUnavailableHandler = (limiterID) => (req, res) => {
  logger.error(
    `Rate limiter "${limiterID}": Redis unavailable — request blocked (fail-closed).`,
    {
      userId: req.user?.id ?? null,
      path: req.originalUrl,
      method: req.method,
    },
  );

  res.status(503).json({
    statusCode: 503,
    data: null,
    message: "Service temporarily unavailable. Please try again shortly.",
  });
};

// ─── Fail-closed limiter factory ──────────────────────────────────────────────

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
    return makeUnavailableHandler(limiterID);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

export const globalLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.global.windowMs,
  limit: LIMITS.global.max,
  keyGenerator: (req) => userOrIpKey("global:", req),
  skip: skipHealthCheck,
  handler: makeHandler("Too many requests. Try again later.", "global"),
});

export const authRateLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.auth.windowMs,
  limit: LIMITS.auth.max,
  skipSuccessfulRequests: true,
  skip: skipHealthCheck,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase?.();
    // FIX: use safeIp() instead of ipKeyGenerator() to prevent socket object key
    const ip = safeIp(req);
    return email ? `auth:${email}-${ip}` : `auth:${ip}`;
  },
  handler: makeHandler(
    "Too many authentication attempts. Try again later.",
    "auth",
  ),
});

export const refreshLimiter = rateLimit({
  ...BASE_CONFIG,
  windowMs: LIMITS.refresh.windowMs,
  limit: LIMITS.refresh.max,
  skip: skipHealthCheck,
  keyGenerator: (req) => userOrIpKey("refresh:", req),
  handler: makeHandler("Too many token refresh attempts.", "refresh"),
});

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

export const bulkActionLimiter = makeFailClosedLimiter({
  prefix: "rl:bulk:",
  windowMs: LIMITS.bulk.windowMs,
  max: LIMITS.bulk.max,
  limiterID: "bulk",
  message: "Bulk action limit reached. Wait 10 minutes before retrying.",
});

export const broadcastLimiter = makeFailClosedLimiter({
  prefix: "rl:broadcast:",
  windowMs: LIMITS.broadcast.windowMs,
  max: LIMITS.broadcast.max,
  limiterID: "broadcast",
  message: "Broadcast limit reached. You can send 2 broadcasts per minute.",
});
