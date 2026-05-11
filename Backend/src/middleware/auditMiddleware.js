/**
 * @file auditMiddleware.js
 * @module middleware
 *
 * Attempt-level audit middleware — fires before the controller runs.
 *
 * Why middleware and not just the service layer?
 * ─────────────────────────────────────────────────────────────
 * auditService.log() inside a service only fires when execution
 * reaches that code path. If the request is rejected earlier —
 * validation failure, an unhandled throw in the controller, a
 * missing field — that attempt leaves no trace in the audit log.
 *
 * This middleware fires on every request that passes auth so the
 * audit trail is complete regardless of outcome. The service layer
 * continues to write its own SUCCESS / FAILURE entries with full
 * resource context (targetId, status transitions, etc.) — this
 * middleware is the "attempt received" record, not a replacement.
 *
 * Non-blocking contract
 * ─────────────────────────────────────────────────────────────
 * A failed audit write is logged as a warning and the request
 * continues. Audit infrastructure must never degrade the API.
 * This layer wraps auditService.log() in its own try/catch and
 * does NOT rely on the service's internal error handling — the
 * middleware is resilient to any future changes in the service.
 *
 * Reusability
 * ─────────────────────────────────────────────────────────────
 * auditAttempt(action, targetType) accepts targetType as a
 * parameter so the same middleware works across broadcast,
 * document, and bulk-action routes without producing misleading
 * audit records.
 *
 * Usage
 * ─────────────────────────────────────────────────────────────
 *   import { auditAttempt } from "../middleware/auditMiddleware.js";
 *
 *   // Broadcast route
 *   router.post(
 *     "/",
 *     broadcastLimiter,
 *     auditAttempt("BROADCAST_SENT", "broadcast"),
 *     validate(schema),
 *     sendBroadcast,
 *   );
 *
 *   // Document route
 *   router.post(
 *     "/approve/:id",
 *     auditAttempt("DOCUMENT_APPROVED", "document"),
 *     validate(schema),
 *     approveDocument,
 *   );
 *
 * The action string must be a value from AUDIT_ACTIONS in
 * src/constants/auditActions.js. An unrecognised string logs a
 * warning at route-registration time but does not throw — the
 * middleware is non-blocking by design.
 */

import auditService from "../services/auditService.js";
import { ALL_AUDIT_ACTIONS } from "../constants/auditActions.js";
import logger from "../utils/logger.js";

// ─── O(1) action lookup ───────────────────────────────────────────────────────
// Built once at module load time. Avoids O(n) Array.includes() on every
// request as the AUDIT_ACTIONS enum grows over time.
const VALID_ACTIONS = new Set(ALL_AUDIT_ACTIONS);

// ─── Valid targetType values ──────────────────────────────────────────────────
// Must stay in sync with the targetType enum in AuditLog.js.
const VALID_TARGET_TYPES = new Set(["user", "broadcast", "document"]);

/**
 * Returns a middleware that writes an attempt-level audit log entry
 * before the controller runs, using the same auditService.log()
 * signature used everywhere else in the app.
 *
 * @param {string} action     - A value from AUDIT_ACTIONS.
 * @param {string} targetType - "broadcast" | "document" | "user"
 * @returns {import("express").RequestHandler}
 */
export const auditAttempt = (action, targetType) => {
  // ── Validate action at route-registration time (startup) ──────────────────
  // Misconfigured route files surface immediately rather than silently
  // writing records that fail the AuditLog schema enum check at runtime.
  if (!VALID_ACTIONS.has(action)) {
    logger.warn(
      `[auditAttempt] Unknown audit action "${action}" — entry will still ` +
        `be written but may fail AuditLog schema validation at runtime.`,
    );
  }

  // ── Validate targetType at route-registration time ────────────────────────
  // A hardcoded or mistyped targetType produces misleading audit records
  // that corrupt compliance queries (e.g. all document events tagged as
  // "broadcast"). Catch this at startup, not in production traffic.
  if (!VALID_TARGET_TYPES.has(targetType)) {
    logger.warn(
      `[auditAttempt] Unknown targetType "${targetType}" — expected one of: ` +
        `${[...VALID_TARGET_TYPES].join(", ")}.`,
    );
  }

  return async (req, _res, next) => {
    // req.user is guaranteed by requireAdmin running before this middleware.
    // If somehow absent (misconfigured route), skip rather than crash —
    // protect() will have already rejected the request at the auth layer.
    if (!req.user?.id) {
      return next();
    }

    // ── Defensive isolation ───────────────────────────────────────────────────
    // This try/catch is intentional even though auditService.log() has its
    // own internal error handling. We do NOT rely on that guarantee — if the
    // service implementation changes, throws before its own try/catch, or is
    // replaced entirely, this middleware remains resilient and the request is
    // never degraded by audit infrastructure failing.
    try {
      await auditService.log({
        action,
        actorId: req.user.id,
        targetId: null, // resource doesn't exist yet — service writes outcome entry with real targetId
        targetType, // passed as parameter — no hardcoding
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        status: "SUCCESS", // "attempt received" — outcome tracked by service layer
        metadata: {
          note: "Attempt-level entry — outcome written by service layer",
          // Captured from raw req.body before validate() runs so even
          // malformed payloads leave a trace in the audit log.
          idempotencyKey: req.body?.idempotencyKey ?? null,
          audienceType: req.body?.audienceType ?? null,
        },
      });
    } catch (err) {
      // Audit failures must never block or crash the request.
      logger.warn("[auditAttempt] Failed to write audit log entry", {
        action,
        targetType,
        actorId: req.user.id,
        error: err.message,
        path: req.originalUrl,
      });
    }

    next();
  };
};
