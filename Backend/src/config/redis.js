import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import logger from "../utils/logger.js";
import { ServiceUnavailableError } from "../errors/ServiceUnavailableError.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const IS_TEST = process.env.NODE_ENV === "test";
const USE_TLS = process.env.REDIS_TLS === "true";

const RETRY_MAX = 5;
const RETRY_BASE_MS = 200;
const RETRY_CAP_MS = 2_000;
const RETRY_JITTER_MS = 100;
const QUIT_TIMEOUT_MS = 5_000;

// Redact credentials from the URL before it can appear in any log line.
const sanitizedUrl = REDIS_URL.replace(/:\/\/[^@]+@/, "://**:**@");

// ─── Client options ───────────────────────────────────────────────────────────

const redisOptions = {
  // Queue commands while reconnecting so callers don't have to handle
  // transient "stream not writable" errors themselves.
  enableOfflineQueue: true,

  // Per-command retry cap. Paired with enableOfflineQueue: true this means
  // each command will be retried at most once after the connection comes back.
  maxRetriesPerRequest: 1,

  // Hard timeout for establishing the initial TCP connection (ms).
  connectTimeout: 10_000,

  // Keep idle TCP connections alive.
  keepAlive: 10_000,

  // Skip the connection attempt until the first command in test environments.
  lazyConnect: IS_TEST,

  // TLS for production providers (Upstash, Redis Cloud, Railway).
  // Set REDIS_TLS=true in your production environment variables.
  ...(USE_TLS && { tls: {} }),

  // Exponential backoff + jitter to avoid thundering herd on restart.
  retryStrategy(times) {
    if (times > RETRY_MAX) {
      logger.error(
        `Redis: Max reconnect attempts (${RETRY_MAX}) reached — giving up. url=${sanitizedUrl}`,
      );

      // Emit a typed infrastructure error so callers and monitoring
      // receive a structured signal rather than a silent null return.
      // The error event fires on the client — process.nextTick defers
      // it past the current retryStrategy call stack so ioredis can
      // finish its own cleanup before the error propagates.
      process.nextTick(() => {
        redisClient.emit(
          "error",
          ServiceUnavailableError.redis(
            new Error(
              `Redis: Max reconnect attempts (${RETRY_MAX}) exhausted. url=${sanitizedUrl}`,
            ),
            { retryable: false }, // permanent exhaustion — retrying will not help
          ),
        );
      });

      return null; // stops reconnecting
    }
    const delay = Math.min(
      times * RETRY_BASE_MS + Math.random() * RETRY_JITTER_MS,
      RETRY_CAP_MS,
    );
    logger.warn(
      `Redis: Reconnecting in ${Math.round(delay)}ms (attempt ${times}/${RETRY_MAX}) url=${sanitizedUrl}`,
    );
    return delay;
  },

  // Only reconnect automatically on primary failover in replica setups.
  reconnectOnError(err) {
    return err.message.includes("READONLY");
  },
};

// ─── Client factory ───────────────────────────────────────────────────────────
// Supports standalone (default), Sentinel, and Cluster topologies via
// the REDIS_MODE environment variable.
//
//   REDIS_MODE=standalone  →  new Redis(url, opts)          (default)
//   REDIS_MODE=sentinel    →  new Redis({ sentinels, ... })
//   REDIS_MODE=cluster     →  new Redis.Cluster([...nodes])

const createClient = () => {
  const mode = (process.env.REDIS_MODE || "standalone").toLowerCase();

  if (mode === "sentinel") {
    const sentinels = JSON.parse(process.env.REDIS_SENTINELS || "[]");
    const name = process.env.REDIS_SENTINEL_NAME || "mymaster";
    logger.info(`Redis: Using Sentinel mode — master="${name}"`);
    return new Redis({ sentinels, name, ...redisOptions });
  }

  if (mode === "cluster") {
    const nodes = JSON.parse(process.env.REDIS_CLUSTER_NODES || "[]");
    logger.info(`Redis: Using Cluster mode — ${nodes.length} seed nodes`);
    return new Redis.Cluster(nodes, { redisOptions });
  }

  logger.info(`Redis: Using Standalone mode — url=${sanitizedUrl}`);
  return new Redis(REDIS_URL, redisOptions);
};

const redisClient = createClient();

// ─── Lifecycle events ─────────────────────────────────────────────────────────

redisClient.on("connect", () =>
  logger.info(`Redis: TCP connection established url=${sanitizedUrl}`),
);
redisClient.on("ready", () => logger.info(`Redis: Ready — accepting commands`));
redisClient.on("error", (err) => logger.error(`Redis: ${err.message}`));
redisClient.on("close", () => logger.warn(`Redis: Connection closed`));
redisClient.on("reconnecting", () => logger.warn(`Redis: Reconnecting…`));
redisClient.on("end", () =>
  logger.warn(`Redis: Connection ended — no more reconnects`),
);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Registered once via a dedicated function to prevent duplicate listeners
// when this module is re-imported in tests or hot-reload environments.

let _shutdownRegistered = false;

const registerShutdownHandlers = () => {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  const shutdown = async (signal) => {
    logger.warn(`Redis: ${signal} received — closing connection gracefully`);
    try {
      // Race quit() against a hard timeout so a hung Redis server can't
      // block the process from exiting.
      await Promise.race([
        redisClient.quit(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`quit() did not resolve within ${QUIT_TIMEOUT_MS}ms`),
              ),
            QUIT_TIMEOUT_MS,
          ),
        ),
      ]);
      logger.info("Redis: Connection closed gracefully");
    } catch (err) {
      logger.error(`Redis: Error during shutdown — ${err.message}`);
      redisClient.disconnect(); // force-close if quit() fails or times out
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
};

registerShutdownHandlers();

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Returns `true` when Redis responds to PING, `false` otherwise.
 * Failures are logged with the underlying reason to aid incident response.
 */
export const checkRedisHealth = async () => {
  try {
    return (await redisClient.ping()) === "PONG";
  } catch (err) {
    logger.warn(`Redis: Health check failed — ${err.message}`);
    return false;
  }
};

// ─── Rate limit store factory ─────────────────────────────────────────────────
// Creates an isolated Redis store for each rate limiter.
// The prefix namespaces keys so limiters never collide with each other
// or with any other Redis data in your app.
//
// Usage:
//   store: createRateLimitStore("rl:broadcast:")
//
// Results in Redis keys like:  rl:broadcast:<userId>

export const createRateLimitStore = (prefix) => {
  if (!prefix || typeof prefix !== "string") {
    throw new Error(
      "createRateLimitStore: a non-empty string prefix is required",
    );
  }

  return new RedisStore({
    // ioredis standalone uses .call() — NOT .sendCommand()
    sendCommand: (...args) => redisClient.call(...args),
    prefix,
  });
};

// ─── Default export ───────────────────────────────────────────────────────────

export default redisClient;
