/**
 * @file documentNotificationListener.js
 * @module listeners
 *
 * Event-driven notification listener for document lifecycle events
 * on the TAM Platform.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Register handlers for document lifecycle events
 *  • Assert structural validity of raw event payloads
 *  • Translate validated payloads into notification DTOs via the factory
 *  • Delegate notification creation to NotificationService
 *  • Isolate notification side-effects from the emitting service
 *  • Handle and log errors without crashing the event emitter
 *
 * This listener intentionally does NOT:
 *  • emit events
 *  • mutate document state
 *  • perform business logic
 *  • know about admin workflows or document repositories
 *  • perform direct database access
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────
 *  AdminDocumentService
 *         │
 *         │  emits  DOCUMENT_EVENT.APPROVED / DOCUMENT_EVENT.REJECTED
 *         ▼
 *  documentNotificationListener   ← (this file)
 *         │  asserts payload shape
 *         │  builds DTO via notificationFactory
 *         ▼
 *  NotificationService.createNotification()
 *
 * Registration
 * ─────────────────────────────────────────────────────────────
 * Call register() once at application startup:
 *
 *   import documentNotificationListener from "./listeners/documentNotificationListener.js";
 *   import documentEventEmitter from "./events/documentEventEmitter.js";
 *
 *   documentNotificationListener.register(documentEventEmitter);
 */

import { DOCUMENT_EVENT } from "../constants/notificationTypes.js";
import notificationService from "../services/NotificationService.js";
import notificationFactory from "./document/notificationFactory.js";

/* ─────────────────────────────────────────────
   PAYLOAD SHAPE — REQUIRED FIELDS PER EVENT
───────────────────────────────────────────── */

/**
 * Declares the required fields for each document event payload.
 *
 * Used by assertPayloadShape() to produce specific, actionable error
 * messages when a field is absent — keeping factory errors meaningful
 * (a factory error always means "bad value", never "missing field").
 */
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

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Asserts that a raw event payload contains all required fields.
 *
 * This is the listener's responsibility — it is the translation layer
 * between untyped event payloads and typed factory DTOs. Checking for
 * field presence here, before the factory runs, ensures:
 *
 *  1. Error messages name the missing field and the event that caused it.
 *  2. Factory TypeErrors always mean "bad value", never "missing field".
 *  3. Absent optional fields (e.g. reason) are not confused with missing
 *     required fields.
 *
 * @param {string}   eventName
 * @param {unknown}  payload
 * @throws {TypeError}
 */
function assertPayloadShape(eventName, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(
      `[documentNotificationListener] Event "${eventName}" received a non-object payload.`,
    );
  }

  const requiredFields = REQUIRED_PAYLOAD_FIELDS[eventName] ?? [];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new TypeError(
        `[documentNotificationListener] Event "${eventName}" payload is missing required field "${field}".`,
      );
    }
  }
}

/**
 * Wraps an async event handler to catch unhandled rejections.
 *
 * Node's EventEmitter does not handle async listener rejections —
 * an unhandled rejection inside an async listener will crash the process
 * or produce an UnhandledPromiseRejection warning, depending on the
 * Node version.
 *
 * This wrapper ensures all rejections are caught and routed to the
 * provided error handler, keeping the emitter stable.
 *
 * @param {Function} handler   - Async event handler
 * @param {Function} onError   - Error handler (eventName, error, payload)
 * @param {string}   eventName
 * @returns {Function} Safe synchronous listener
 */
function createSafeListener(handler, onError, eventName) {
  return function (payload) {
    Promise.resolve(handler(payload)).catch((error) => {
      onError(eventName, error, payload);
    });
  };
}

/**
 * Default error handler for failed notification creation.
 *
 * Logs structured diagnostic context without re-throwing.
 * Re-throwing would crash or stall the emitter and block
 * unrelated event handlers on the same emitter.
 *
 * In production, replace or extend this with your observability
 * pipeline (Datadog, Sentry, CloudWatch, etc.) by passing a custom
 * onError function to register().
 *
 * @param {string} eventName
 * @param {Error}  error
 * @param {Object} payload
 */
function defaultErrorHandler(eventName, error, payload) {
  console.error(
    "[documentNotificationListener] Failed to create notification.",
    {
      event: eventName,
      error: error?.message ?? String(error),
      payload,
    },
  );
}

/* ─────────────────────────────────────────────
   HANDLERS
───────────────────────────────────────────── */

/**
 * Handles the DOCUMENT_EVENT.APPROVED event.
 *
 * Expected event payload:
 * ┌───────────────┬──────────────────────────────────────────────┐
 * │ userId        │ ObjectId string — document owner             │
 * │ documentId    │ ObjectId string — approved document          │
 * │ documentTitle │ Human-readable document title                │
 * │ approvedBy    │ ObjectId string — admin who approved         │
 * └───────────────┴──────────────────────────────────────────────┘
 *
 * @param {Object} payload
 * @returns {Promise<void>}
 */
async function handleDocumentApproved(payload) {
  assertPayloadShape(DOCUMENT_EVENT.APPROVED, payload);

  const dto = notificationFactory.documentApproved(payload);

  await notificationService.createNotification(dto);
}

/**
 * Handles the DOCUMENT_EVENT.REJECTED event.
 *
 * Expected event payload:
 * ┌───────────────┬──────────────────────────────────────────────┐
 * │ userId        │ ObjectId string — document owner             │
 * │ documentId    │ ObjectId string — rejected document          │
 * │ documentTitle │ Human-readable document title                │
 * │ rejectedBy    │ ObjectId string — admin who rejected         │
 * │ reason        │ Optional plain-text rejection reason         │
 * └───────────────┴──────────────────────────────────────────────┘
 *
 * @param {Object} payload
 * @returns {Promise<void>}
 */
async function handleDocumentRejected(payload) {
  assertPayloadShape(DOCUMENT_EVENT.REJECTED, payload);

  const dto = notificationFactory.documentRejected(payload);

  await notificationService.createNotification(dto);
}

/* ─────────────────────────────────────────────
   LISTENER STATE
───────────────────────────────────────────── */

/**
 * Tracks registered listener references per emitter instance.
 *
 * Using a WeakMap serves two purposes:
 *  1. Enables precise removal via emitter.off() — only the listeners this
 *     module registered are removed, never those of other modules.
 *  2. Prevents double-registration on the same emitter, which would cause
 *     each event to fire duplicate notifications.
 *
 * WeakMap keys are held weakly — when an emitter is garbage-collected,
 * its entry is automatically released with no memory leak.
 *
 * Shape: WeakMap<EventEmitter, { approvedListener: Function, rejectedListener: Function }>
 */
const registeredListeners = new WeakMap();

/* ─────────────────────────────────────────────
   LISTENER
───────────────────────────────────────────── */

/**
 * @typedef {Object} DocumentNotificationListener
 * @property {Function} register   - Attaches all handlers to an EventEmitter
 * @property {Function} unregister - Detaches all handlers from an EventEmitter
 */
const documentNotificationListener = {
  /**
   * Registers all document notification handlers on the provided emitter.
   *
   * Must be called once at application startup, after the emitter is
   * initialised and before any document events are emitted.
   *
   * Throws if called more than once on the same emitter — double-registration
   * would cause each event to fire duplicate notifications silently.
   *
   * Accepts an optional custom error handler to integrate with the
   * application's observability pipeline. Falls back to the default
   * console-based error handler if none is provided.
   *
   * @param {import('events').EventEmitter} emitter
   * @param {{ onError?: Function }} [options]
   * @throws {Error} if already registered on this emitter
   */
  register(emitter, { onError = defaultErrorHandler } = {}) {
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

    // Store the specific wrapped references so unregister() can remove
    // exactly what this module added — nothing more.
    registeredListeners.set(emitter, { approvedListener, rejectedListener });
  },

  /**
   * Removes only the handlers registered by this module from the emitter.
   *
   * Uses emitter.off() with the exact function references stored at
   * registration time. This is safe in multi-listener architectures —
   * other modules' listeners on the same event names are not affected.
   *
   * Intended for:
   *  • graceful shutdown sequences
   *  • test teardown (prevents listener leakage between test cases)
   *
   * Silently no-ops if this module was never registered on the emitter.
   *
   * @param {import('events').EventEmitter} emitter
   */
  unregister(emitter) {
    const listeners = registeredListeners.get(emitter);

    if (!listeners) return;

    emitter.off(DOCUMENT_EVENT.APPROVED, listeners.approvedListener);
    emitter.off(DOCUMENT_EVENT.REJECTED, listeners.rejectedListener);

    registeredListeners.delete(emitter);
  },
};

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

export default Object.freeze(documentNotificationListener);
