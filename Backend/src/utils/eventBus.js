import { Queue } from "bullmq";
import IORedis from "ioredis";
import logger from "./logger.js";

/* -------------------------
   REDIS CONNECTION
------------------------- */
const connection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
);

/* -------------------------
   QUEUE INSTANCE
------------------------- */
const eventQueue = new Queue("event-bus", {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false, // keep failed jobs (DLQ behavior)
  },
});

/* -------------------------
   EVENT CONSTANTS
------------------------- */
export const EVENTS = {
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  RESUBMISSION_REQUESTED: "document.resubmission_requested",
};

/* -------------------------
   EVENT BUS (PRODUCER)
------------------------- */
class EventBus {
  /**
   * Persist event into queue
   */
  async emitSafe(event, payload = {}) {
    try {
      logger.info(`📢 [EventBus] Queueing event: ${event}`, {
        userId: payload?.userId,
        documentType: payload?.documentType,
      });

      await eventQueue.add(event, payload);
    } catch (err) {
      logger.error("❌ Failed to enqueue event", {
        event,
        error: err.message,
      });
    }
  }
}

const eventBus = new EventBus();

export default eventBus;
