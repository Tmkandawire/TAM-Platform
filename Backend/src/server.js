/**
 * @file server.js
 *
 * Application entry point.
 *
 * Boot sequence
 * ─────────────────────────────────────────────────────────────
 *  1. Validate required environment variables — fail loudly at startup,
 *     not silently at the point of first use.
 *  2. Connect to MongoDB — server does not start if DB is unreachable.
 *  3. Check Redis health — server starts but logs a warning if Redis is
 *     down (rate limiting degrades to in-memory, not a hard failure).
 *  4. Register middleware in order:
 *       security → CORS → compression → body parsing → cookies →
 *       request logging → health check → global rate limiter → routes
 *  5. Register error handler last.
 *  6. Start HTTP server with tuned keep-alive / headers timeouts.
 *  7. Register graceful shutdown handlers.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import crypto from "crypto";

import connectDB from "./config/db.js";
import redisClient, { checkRedisHealth } from "./config/redis.js";
import logger from "./utils/logger.js";
import requestLogger from "./middleware/requestLogger.js";
import { globalLimiter } from "./middleware/rateLimitMiddleware.js";
import rootRouter from "./routes/index.js";
import memberRoutes from "./routes/memberRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import adminDocumentRoutes from "./routes/adminDocumentRoutes.js";
import errorMiddleware from "./middleware/errorMiddleware.js";

// ─── 1. Environment validation ────────────────────────────────────────────────
// Validate before anything else runs. A missing secret that surfaces only
// when a user tries to log in is far harder to debug than a boot-time crash.

const REQUIRED_ENV = [
  "CLIENT_URL",
  "MONGO_URI",
  "JWT_ACCESS_SECRET",
  "REDIS_URL",
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  // Use console.error — logger may not be initialised if env is broken
  console.error(
    `[server] Missing required environment variables: ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

// Fail loudly if CLIENT_URL is absent — origin: undefined silently opens
// CORS to all origins, which is equivalent to disabling CORS entirely.
const CLIENT_URL = process.env.CLIENT_URL;

// ─── 2. App ───────────────────────────────────────────────────────────────────

const app = express();

// Must be set before any middleware that reads req.ip (rate limiters, loggers).
app.set("trust proxy", 1);

// ─── 3. Startup sequence ──────────────────────────────────────────────────────
// Wrapped in an async IIFE so we can await DB connection before binding the
// HTTP server. Any thrown error propagates to the uncaughtException handler.

(async () => {
  // ── MongoDB ──────────────────────────────────────────────────────────────
  // connectDB must resolve (or throw) before we start accepting requests.
  // If it throws, the process exits via uncaughtException below.
  await connectDB();

  // ── Redis health ─────────────────────────────────────────────────────────
  // Redis is not a hard boot dependency — rate limiting degrades to
  // in-memory if Redis is unavailable. Log a warning so the degradation
  // is visible in monitoring rather than silently going unnoticed.
  const redisOk = await checkRedisHealth();
  if (!redisOk) {
    logger.warn(
      "Server: Redis unavailable at startup — Redis-backed rate limiting will degrade to in-memory.",
    );
  }

  // ─── Middleware ───────────────────────────────────────────────────────────

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());
  app.use(xss());
  app.use(mongoSanitize());

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: CLIENT_URL,
      credentials: true,
    }),
  );

  // ── Compression ───────────────────────────────────────────────────────────
  // Gzip/Brotli on responses. Registered before body parsing so compressed
  // responses are handled at the transport layer without double-processing.
  app.use(compression());

  // ── Body parsing ──────────────────────────────────────────────────────────
  // Both parsers share the same size cap to prevent asymmetric payload attacks
  // via form-encoded bodies that bypass the JSON limit.
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  // ── Cookies ───────────────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── Request ID ───────────────────────────────────────────────────────────
  // Attach a unique correlation ID to every request before requestLogger
  // runs so every log line for a single request shares the same ID.
  // Invaluable for tracing errors across log lines in production.
  app.use((req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  });

  // ── Request logging ───────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health check ─────────────────────────────────────────────────────────
  // Registered BEFORE globalLimiter so uptime monitors and load balancer
  // probes never consume rate-limit quota.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // ── Global rate limiter ───────────────────────────────────────────────────
  // Applied after health check, before all API routes.
  app.use(globalLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use("/api/v1", rootRouter);
  app.use("/api/v1/members", memberRoutes);
  app.use("/api/v1/documents", documentRoutes);
  app.use("/api/v1/admin/documents", adminDocumentRoutes);

  // ── API root ──────────────────────────────────────────────────────────────
  // Returns structured JSON — no plain-text responses on a JSON API.
  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "TAM API",
      version: "1.0.0",
      status: "ok",
    });
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  // Must be last — Express identifies error middleware by its 4-arg signature.
  app.use(errorMiddleware);

  // ─── HTTP server ──────────────────────────────────────────────────────────

  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    logger.info(
      `🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`,
    );
  });

  // Tune keep-alive and headers timeouts to prevent 502s behind a load
  // balancer. keepAliveTimeout must be slightly above the LB's idle timeout
  // (typically 60s on Railway / AWS ALB) so the LB never reuses a connection
  // the Node server has already closed.
  server.keepAliveTimeout = 65_000; // ms — above typical LB 60s idle timeout
  server.headersTimeout = 66_000; // ms — must be > keepAliveTimeout

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  // SIGTERM is sent by Docker / Kubernetes / Railway before a pod is killed.
  // Without a handler, in-flight requests are dropped immediately.
  // server.close() stops accepting new connections and waits for in-flight
  // requests to finish. A 10s force-exit guards against stuck requests.

  const shutdown = async (signal) => {
    logger.warn(`Server: ${signal} received — draining connections`);

    server.close(async () => {
      logger.info("Server: HTTP server closed — all connections drained");

      // Redis client has its own SIGTERM handler in config/redis.js,
      // but we explicitly disconnect here as a belt-and-suspenders measure
      // in case the Redis handler hasn't fired yet at this point in the
      // shutdown sequence.
      try {
        await redisClient.quit();
      } catch {
        // Already closed — not an error
      }

      logger.info("Server: shutdown complete");
      process.exit(0);
    });

    // Force-exit if draining takes longer than 10 seconds.
    // .unref() prevents this timer from keeping the event loop alive.
    setTimeout(() => {
      logger.error("Server: shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  };

  // Use process.once so re-imports or test runners don't stack listeners.
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
})();

// ─── Process-level safety nets ────────────────────────────────────────────────
// Registered outside the IIFE so they catch errors during the async boot
// sequence itself (e.g. connectDB throwing before server.listen is called).

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
