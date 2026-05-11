import { Queue } from "bullmq";
import IORedis from "ioredis";
import logger from "./logger.js";

/* ─────────────────────────────────────────────
   REDIS CONNECTION
───────────────────────────────────────────── */

const connection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
);

/* ─────────────────────────────────────────────
   QUEUE INSTANCE
───────────────────────────────────────────── */

const eventQueue = new Queue("event-bus", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    // Keep failed jobs — acts as a dead-letter queue for inspection
    removeOnFail: false,
  },
});

/* ─────────────────────────────────────────────
   EVENT CONSTANTS
───────────────────────────────────────────── */

export const EVENTS = Object.freeze({
  // Document lifecycle events
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  RESUBMISSION_REQUESTED: "document.resubmission_requested",

  // Member lifecycle events
  // Emitted after transaction commit — consumed by notification,
  // analytics, and integration workers. Keeping side effects out
  // of the service layer means adminService stays pure transactional logic.
  MEMBER_APPROVED: "member.approved",
  MEMBER_REJECTED: "member.rejected",
  MEMBER_SUSPENDED: "member.suspended",
});

/* ─────────────────────────────────────────────
   EVENT BUS (PRODUCER)
───────────────────────────────────────────── */

class EventBus {
  /**
   * Enqueues an event into the BullMQ queue.
   *
   * Fire-and-forget — emitSafe() never throws. A failure to enqueue
   * is logged at error level but does not affect the caller's flow.
   * The transaction has already committed at this point; the business
   * operation must not be rolled back because a queue write failed.
   *
   * @param {string} event    - Event name from EVENTS constants.
   * @param {object} [payload]
   */
  async emitSafe(event, payload = {}) {
    try {
      await eventQueue.add(event, payload);

      try {
        logger.info("[EventBus] Event queued", {
          event,
          userId: payload?.userId,
          requestId: payload?.requestId,
        });
      } catch (_logErr) {
        // Logger failure must never suppress successful queue writes.
      }
    } catch (err) {
      try {
        logger.error("[EventBus] Failed to enqueue event", {
          event,
          requestId: payload?.requestId,
          error: err.message,
        });
      } catch (_logErr) {
        // Swallowed — do not mask the original enqueue failure path.
      }
    }
  }
}

const eventBus = new EventBus();
export default eventBus;
