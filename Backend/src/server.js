/**
 * @file server.js
 *
 * Application entry point.
 *
 * All API routes are registered via rootRouter (src/routes/index.js).
 * server.js is responsible for middleware order, HTTP server config,
 * and graceful shutdown only — no routes are registered here directly.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";

import connectDB from "./config/db.js";
import redisClient, { checkRedisHealth } from "./config/redis.js";
import logger from "./utils/logger.js";
import requestLogger from "./middleware/requestLogger.js";
import { globalLimiter } from "./middleware/rateLimitMiddleware.js";
import rootRouter from "./routes/index.js";
import errorMiddleware from "./middleware/errorMiddleware.js";
import requestContext from "./middleware/requestContext.js";

// ─── 1. Environment validation ────────────────────────────────────────────────

const REQUIRED_ENV = [
  "MONGO_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "FRONTEND_URL",
  "REDIS_URL",
  "ALLOWED_ORIGINS",
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(
    `[server] Missing required environment variables: ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

const FRONTEND_URL = process.env.FRONTEND_URL;

// ─── 2. App ───────────────────────────────────────────────────────────────────

const app = express();

app.set("trust proxy", 1);

// Shared by both Helmet CSP and CORS
const ALLOWED_ORIGINS_LIST = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

// ─── 3. Startup sequence ──────────────────────────────────────────────────────

(async () => {
  await connectDB();

  const redisOk = await checkRedisHealth();
  if (!redisOk) {
    logger.warn(
      "Server: Redis unavailable at startup — Redis-backed rate limiting will degrade to in-memory.",
    );
  }

  // ─── Middleware ───────────────────────────────────────────────────────────

  // Request context MUST be first — all middleware below depends on requestId
  app.use(requestContext);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
          connectSrc: ["'self'", ...ALLOWED_ORIGINS_LIST],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  app.use(xss());
  app.use(mongoSanitize());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS_LIST.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );

  app.use(compression());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.use(cookieParser());

  app.use(requestLogger);

  // Health check — before globalLimiter so probes never consume quota
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(globalLimiter);

  // ── All API routes via rootRouter ─────────────────────────────────────────
  // routes/index.js is the single source of truth for all route mounting.
  // No routes are registered in server.js directly.
  app.use("/api/v1", rootRouter);

  app.get("/", (_req, res) => res.status(200).json({ status: "ok" }));

  // Error handler — must be last
  app.use(errorMiddleware);

  // ─── HTTP server ──────────────────────────────────────────────────────────

  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    logger.info(
      `🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`,
    );
  });

  server.setTimeout(120_000);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 126_000;

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal) => {
    logger.warn(`Server: ${signal} received — draining connections`);

    server.close(async () => {
      logger.info("Server: HTTP server closed — all connections drained");

      try {
        await redisClient.quit();
      } catch {
        // Already closed
      }

      logger.info("Server: shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Server: shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
})();

// ─── Process-level safety nets ────────────────────────────────────────────────

process.on("unhandledRejection", (err) => {
  logger.error({
    message: "UNHANDLED REJECTION",
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error({
    message: "UNCAUGHT EXCEPTION",
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

export default app;
