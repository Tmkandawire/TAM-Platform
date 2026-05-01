/**
 * @file documentNotificationListener.js
 *
 * Listens for document lifecycle events and delegates to NotificationService.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Subscribe / unsubscribe handlers on an EventEmitter
 *  • Validate incoming event payloads (shape + required fields)
 *  • Isolate async handler failures so one bad event cannot crash the process
 *  • Sanitise payloads before logging to avoid PII leakage
 *
 * This module intentionally does NOT:
 *  • create notifications (NotificationService responsibility)
 *  • send emails (EmailService responsibility)
 *  • contain business logic
 */

import { DOCUMENT_EVENT } from "../constants/notificationTypes.js";
import notificationService from "../services/NotificationService.js";
import notificationFactory from "./document/notificationFactory.js";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   PAYLOAD SHAPE — REQUIRED FIELDS PER EVENT
───────────────────────────────────────────── */

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  [DOCUMENT_EVENT.APPROVED]: [
    "userId",
    "documentId",
    "documentTitle",
    "approvedBy",
  ],
  [DOCUMENT_EVENT.REJECTED]: [
    "userId",
    "documentId",
    "documentTitle",
    "rejectedBy",
  ],
});

/**
 * Fields that may contain PII or sensitive data.
 * These are masked before any log output.
 */
const SENSITIVE_FIELDS = new Set(["userId", "approvedBy", "rejectedBy"]);

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Returns a copy of the payload with sensitive fields masked.
 * Safe to pass directly to any logger.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
function sanitisePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? "[REDACTED]" : value,
    ]),
  );
}

/**
 * Validate that a payload is a plain object, belongs to a known event,
 * and contains all required fields with non-empty string values.
 *
 * @param {string}                  eventName
 * @param {Record<string, unknown>} payload
 * @throws {TypeError}
 */
function assertPayloadShape(eventName, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(
      `[documentNotificationListener] Event "${eventName}" received a non-object payload.`,
    );
  }

  if (!(eventName in REQUIRED_PAYLOAD_FIELDS)) {
    throw new TypeError(
      `[documentNotificationListener] Unrecognised event "${eventName}". ` +
        `Known events: ${Object.keys(REQUIRED_PAYLOAD_FIELDS).join(", ")}.`,
    );
  }

  const requiredFields = REQUIRED_PAYLOAD_FIELDS[eventName];

  for (const field of requiredFields) {
    const value = payload[field];

    if (value === undefined || value === null) {
      throw new TypeError(
        `[documentNotificationListener] Event "${eventName}" payload is missing required field "${field}".`,
      );
    }

    // Reject blank strings — an empty ID is as bad as a missing one
    if (typeof value === "string" && value.trim().length === 0) {
      throw new TypeError(
        `[documentNotificationListener] Event "${eventName}" field "${field}" must not be an empty string.`,
      );
    }
  }
}

/**
 * Wrap an async handler so any thrown error is routed to `onError`
 * instead of producing an unhandled promise rejection.
 *
 * @param {Function} handler
 * @param {Function} onError
 * @param {string}   eventName
 * @returns {Function}
 */
function createSafeListener(handler, onError, eventName) {
  return function (payload) {
    Promise.resolve(handler(payload)).catch((error) => {
      onError(eventName, error, payload);
    });
  };
}

/**
 * Default error handler — logs a sanitised payload to avoid PII in logs.
 *
 * @param {string} eventName
 * @param {Error}  error
 * @param {Record<string, unknown>} payload
 */
function defaultErrorHandler(eventName, error, payload) {
  logger.error(
    "[documentNotificationListener] Failed to process notification event.",
    {
      event: eventName,
      error,
      payload: sanitisePayload(payload),
    },
  );
}

/* ─────────────────────────────────────────────
   HANDLERS
───────────────────────────────────────────── */

async function handleDocumentApproved(payload) {
  assertPayloadShape(DOCUMENT_EVENT.APPROVED, payload);
  const dto = notificationFactory.documentApproved(payload);
  await notificationService.createNotification(dto);
}

async function handleDocumentRejected(payload) {
  assertPayloadShape(DOCUMENT_EVENT.REJECTED, payload);
  const dto = notificationFactory.documentRejected(payload);
  await notificationService.createNotification(dto);
}

/* ─────────────────────────────────────────────
   LISTENER STATE
   Module-level WeakMap — GC-friendly, one entry per emitter.
   Note: in test environments, call unregister() in afterEach to
   prevent state leaking between tests.
───────────────────────────────────────────── */

const registeredListeners = new WeakMap();

/* ─────────────────────────────────────────────
   LISTENER
───────────────────────────────────────────── */

const documentNotificationListener = {
  /**
   * Attach document event listeners to an EventEmitter.
   *
   * @param {import("events").EventEmitter} emitter
   * @param {{ onError?: Function }}        [options]
   * @throws {TypeError} If emitter is invalid.
   * @throws {Error}     If already registered on this emitter.
   */
  register(emitter, { onError = defaultErrorHandler } = {}) {
    if (
      !emitter ||
      typeof emitter.on !== "function" ||
      typeof emitter.off !== "function"
    ) {
      throw new TypeError(
        "[documentNotificationListener] Invalid EventEmitter provided.",
      );
    }

    if (registeredListeners.has(emitter)) {
      throw new Error(
        "[documentNotificationListener] Already registered on this emitter. " +
          "Call unregister() before registering again.",
      );
    }

    const approvedListener = createSafeListener(
      handleDocumentApproved,
      onError,
      DOCUMENT_EVENT.APPROVED,
    );

    const rejectedListener = createSafeListener(
      handleDocumentRejected,
      onError,
      DOCUMENT_EVENT.REJECTED,
    );

    emitter.on(DOCUMENT_EVENT.APPROVED, approvedListener);
    emitter.on(DOCUMENT_EVENT.REJECTED, rejectedListener);

    registeredListeners.set(emitter, { approvedListener, rejectedListener });

    logger.info("[documentNotificationListener] Registered on emitter.", {
      events: Object.keys(REQUIRED_PAYLOAD_FIELDS),
    });
  },

  /**
   * Detach document event listeners from an EventEmitter.
   *
   * @param {import("events").EventEmitter} emitter
   */
  unregister(emitter) {
    const listeners = registeredListeners.get(emitter);

    if (!listeners) {
      // Warn rather than silently no-op — unregistering something that was
      // never registered is almost always a logic error in the caller.
      logger.warn(
        "[documentNotificationListener] unregister() called on an emitter that has no registered listeners. No-op.",
      );
      return;
    }

    emitter.off(DOCUMENT_EVENT.APPROVED, listeners.approvedListener);
    emitter.off(DOCUMENT_EVENT.REJECTED, listeners.rejectedListener);

    registeredListeners.delete(emitter);

    logger.info("[documentNotificationListener] Unregistered from emitter.");
  },
};

export default Object.freeze(documentNotificationListener);
