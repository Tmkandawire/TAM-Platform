import { Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import logger from "../utils/logger.js";
import { EVENTS } from "../utils/eventBus.js";

/* -------------------------
   REDIS CONNECTION
------------------------- */
const connection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null,
  },
);

/* -------------------------
   QUEUE EVENTS (OBSERVABILITY)
------------------------- */
const queueEvents = new QueueEvents("event-bus", { connection });

queueEvents.on("completed", ({ jobId }) => {
  logger.info(`✅ Job completed`, { jobId });
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error(`❌ Job failed`, { jobId, failedReason });
});

/* -------------------------
   EVENT HANDLERS (DOMAIN LOGIC)
------------------------- */
const handlers = {
  [EVENTS.DOCUMENT_APPROVED]: async (job) => {
    const { userId, documentType } = job.data;

    logger.info("📄 Handling DOCUMENT_APPROVED", {
      userId,
      documentType,
    });

    // 🔜 Future:
    // - send email
    // - create notification
    // - update analytics

    return true;
  },

  [EVENTS.DOCUMENT_REJECTED]: async (job) => {
    const { userId, documentType, reason } = job.data;

    logger.info("📄 Handling DOCUMENT_REJECTED", {
      userId,
      documentType,
      reason,
    });

    // 🔜 Future:
    // - send rejection email
    // - notify user in-app
    // - trigger resubmission flow

    return true;
  },

  [EVENTS.RESUBMISSION_REQUESTED]: async (job) => {
    const { userId, documentsRequired, reason } = job.data;

    logger.info("📄 Handling RESUBMISSION_REQUESTED", {
      userId,
      documentsRequired,
      reason,
    });

    return true;
  },
};

/* -------------------------
   WORKER (CORE ENGINE)
------------------------- */
const worker = new Worker(
  "event-bus",
  async (job) => {
    const handler = handlers[job.name];

    if (!handler) {
      logger.warn(`⚠️ No handler for event`, { event: job.name });
      return;
    }

    try {
      await handler(job);
    } catch (error) {
      logger.error("❌ Handler execution failed", {
        event: job.name,
        jobId: job.id,
        error: error.message,
      });

      // Throw to trigger retry logic
      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // process multiple jobs in parallel
  },
);

/* -------------------------
   WORKER LIFECYCLE EVENTS
------------------------- */
worker.on("ready", () => {
  logger.info("🚀 Event Worker is running...");
});

worker.on("error", (err) => {
  logger.error("❌ Worker error", { error: err.message });
});

worker.on("failed", (job, err) => {
  logger.error("❌ Job permanently failed (DLQ)", {
    jobId: job.id,
    event: job.name,
    error: err.message,
  });
});

/* -------------------------
   GRACEFUL SHUTDOWN
------------------------- */
const shutdown = async () => {
  logger.info("🛑 Shutting down worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default worker;
