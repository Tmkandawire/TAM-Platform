import Redis from "ioredis";
import logger from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redisOptions = {
  maxRetriesPerRequest: 3,
  commandTimeout: 5000,
  keepAlive: 10000,
  lazyConnect: process.env.NODE_ENV === "test",

  retryStrategy(times) {
    if (times > 5) {
      logger.error("Redis: Max retries reached. Giving up.");
      return null;
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis: Retrying connection in ${delay}ms (attempt ${times})`);
    return delay;
  },

  // ✅ Only reconnect on READONLY (primary failover) — not ECONNRESET
  reconnectOnError(err) {
    return err.message.includes("READONLY");
  },
};

const redisClient = new Redis(REDIS_URL, redisOptions);

redisClient.on("connect", () => logger.info("✅ Redis Connected"));
redisClient.on("ready", () =>
  logger.info("✅ Redis Ready — accepting commands"),
);
redisClient.on("error", (err) =>
  logger.error(`❌ Redis Error: ${err.message}`),
);
redisClient.on("close", () => logger.warn("⚠️ Redis connection closed"));
redisClient.on("reconnecting", (delay) =>
  logger.warn(`🔄 Redis reconnecting in ${delay}ms`),
);
redisClient.on("end", () =>
  logger.warn("⚠️ Redis connection ended — no more reconnects"),
);

const shutdown = async (signal) => {
  logger.warn(`${signal} received — closing Redis connection`);
  await redisClient.quit();
  logger.info("Redis connection closed gracefully");
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export const checkRedisHealth = async () => {
  try {
    return (await redisClient.ping()) === "PONG";
  } catch {
    return false;
  }
};

export default redisClient;
