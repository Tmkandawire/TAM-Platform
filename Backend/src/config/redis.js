import Redis from "ioredis";
import logger from "../utils/logger.js";

/* -------------------------
   CONNECTION OPTIONS
------------------------- */
const redisOptions = {
  maxRetriesPerRequest: 3,

  // Retry with exponential backoff — waits longer between each retry
  retryStrategy(times) {
    if (times > 5) {
      logger.error("Redis: Max retries reached. Giving up.");
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000); // Max 2s between retries
    logger.warn(`Redis: Retrying connection in ${delay}ms (attempt ${times})`);
    return delay;
  },

  // How long to wait for a command before timing out
  commandTimeout: 5000,

  // Keep connection alive
  keepAlive: 10000,

  // Reconnect on error only for specific cases
  reconnectOnError(err) {
    const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
    return targetErrors.some((e) => err.message.includes(e));
  },

  // Disable in test environment
  lazyConnect: process.env.NODE_ENV === "test",
};

/* -------------------------
   CREATE CLIENT
------------------------- */
const redisClient = new Redis(process.env.REDIS_URL, redisOptions);

/* -------------------------
   EVENT HANDLERS
------------------------- */
redisClient.on("connect", () => {
  logger.info("✅ Redis Connected");
});

redisClient.on("ready", () => {
  logger.info("✅ Redis Ready — accepting commands");
});

redisClient.on("error", (err) => {
  logger.error(`❌ Redis Error: ${err.message}`);
});

redisClient.on("close", () => {
  logger.warn("⚠️ Redis connection closed");
});

redisClient.on("reconnecting", (delay) => {
  logger.warn(`🔄 Redis reconnecting in ${delay}ms`);
});

redisClient.on("end", () => {
  logger.warn("⚠️ Redis connection ended — no more reconnects");
});

/* -------------------------
   GRACEFUL SHUTDOWN
------------------------- */
const shutdown = async (signal) => {
  logger.warn(`${signal} received — closing Redis connection`);
  await redisClient.quit();
  logger.info("Redis connection closed gracefully");
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/* -------------------------
   HEALTH CHECK HELPER
   Call this to verify Redis
   is alive before using it
------------------------- */
export const checkRedisHealth = async () => {
  try {
    const result = await redisClient.ping();
    return result === "PONG";
  } catch {
    return false;
  }
};

export default redisClient;
