/**


* @file eventDispatcher.js
* @module dispatchers
*
* Enterprise-grade event dispatch boundary.
  */

import logger from "../utils/logger.js";
import eventBus from "../utils/eventBus.js";

/* ─────────────────────────────────────────────
INTERNAL HELPERS
───────────────────────────────────────────── */

function assertValidEvent(event) {
  if (event === null || typeof event !== "object") {
    throw new TypeError(
      `eventDispatcher: event must be a plain object, received ${
        event === null ? "null" : typeof event
      }.`,
    );
  }

  const proto = Object.getPrototypeOf(event);

  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      "eventDispatcher: event must be a plain object — arrays, class instances, and built-in objects are not accepted.",
    );
  }

  // Validate type
  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    throw new TypeError(
      "eventDispatcher: event.type must be a non-empty string.",
    );
  }

  // Validate payload
  if (event.payload === null || typeof event.payload !== "object") {
    throw new TypeError(
      "eventDispatcher: event.payload must be a plain object.",
    );
  }

  const payloadProto = Object.getPrototypeOf(event.payload);

  if (payloadProto !== Object.prototype && payloadProto !== null) {
    throw new TypeError(
      "eventDispatcher: event.payload must be a plain object.",
    );
  }
}

function buildLogContext(event) {
  return {
    type: event.type,
    occurredAt: event.occurredAt instanceof Date ? event.occurredAt : null,

    // Safe minimal enrichment (optional observability)
    userId:
      typeof event.payload?.userId === "string"
        ? event.payload.userId
        : undefined,
  };
}

/* ─────────────────────────────────────────────
DISPATCHER
───────────────────────────────────────────── */

class EventDispatcher {
  constructor() {
    Object.freeze(this);
  }

  dispatch(event) {
    assertValidEvent(event);

    try {
      // Emit ONLY payload (correct contract)
      eventBus.emit(event.type, event.payload);

      logger.info("Domain event dispatched.", buildLogContext(event));
    } catch (error) {
      logger.error("Domain event dispatch failed.", {
        ...buildLogContext(event),
        error,
      });

      throw error;
    }
  }

  dispatchMany(events) {
    if (!Array.isArray(events)) {
      throw new TypeError("eventDispatcher: `events` must be an array.");
    }

    if (events.length === 0) {
      return;
    }

    const failures = [];

    for (const event of events) {
      try {
        this.dispatch(event);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `eventDispatcher: ${failures.length} of ${events.length} event(s) failed to dispatch.`,
      );
    }
  }
}

export default new EventDispatcher();
