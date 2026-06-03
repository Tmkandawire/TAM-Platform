/**
 * @file broadcastController.js
 * @module controllers/broadcast
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Validate and coerce all HTTP boundary inputs
 * - Map service-layer domain errors to typed platform error classes
 * - Delegate business logic entirely to broadcastService
 * - Return canonical ApiResponse envelopes
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - Audience resolution       → broadcastService
 * - Notification fan-out      → broadcastService
 * - Email dispatch            → broadcastService
 * - Audit logging             → broadcastService
 * - Idempotency enforcement   → broadcastService (E11000 + pre-check)
 *
 * Error mapping
 * ─────────────────────────────────────────────
 * broadcastService throws domain-specific error classes
 * (BroadcastValidationError, BroadcastDuplicateError) that are unknown
 * to errorMiddleware. The controller maps these to typed platform errors
 * before they propagate — errorMiddleware then handles them correctly.
 *
 *   BroadcastValidationError → ValidationError  (400)
 *   BroadcastDuplicateError  → ConflictError    (409)
 *
 * All other errors propagate to errorMiddleware unchanged.
 *
 * createdByAdmin injection
 * ─────────────────────────────────────────────
 * createdByAdmin is a server-only field — it must always come from the
 * authenticated session, never from the client. req.body is destructured
 * to explicitly exclude createdByAdmin before the server value is injected,
 * making it structurally impossible for the client to supply this field
 * regardless of schema permissiveness.
 *
 * requestId availability
 * ─────────────────────────────────────────────
 * req.context?.requestId is set by requestContext middleware. When the
 * middleware is mounted correctly it is always present. The optional chain
 * is a defensive fallback only — "unavailable" is substituted in log
 * entries so missing trace correlation is visible rather than silent.
 */

import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import logger from "../utils/logger.js";
import broadcastService, {
  BroadcastValidationError,
  BroadcastDuplicateError,
} from "../services/broadcastService.js";
import { validateBroadcastPayload } from "../validators/broadcastValidator.js";
import { ValidationError, ConflictError } from "../errors/index.js";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Validates a value as a well-formed MongoDB ObjectId.
 * Used for req.user.id — makes the upstream auth middleware trust
 * boundary explicit rather than implicit.
 *
 * @param {string} id
 * @param {string} fieldName
 * @throws {ValidationError}
 */
function assertValidObjectId(id, fieldName = "id") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be a valid MongoDB ObjectId.`,
      "INVALID_ID",
    );
  }
}

/**
 * Builds the standard reqInfo object propagated into every service call.
 *
 * requestId falls back to "unavailable" rather than undefined — ensures
 * missing trace correlation is visible in logs rather than silently absent.
 * The fallback only fires when requestContext middleware is not mounted,
 * which should not occur in production but may in isolated test environments.
 *
 * @param {import("express").Request} req
 * @returns {{ ip: string, userAgent: string, requestId: string }}
 */
function buildReqInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.context?.requestId ?? "unavailable",
  };
}

/**
 * Maps broadcastService domain errors to typed platform error classes.
 *
 * broadcastService throws BroadcastValidationError and BroadcastDuplicateError
 * which errorMiddleware does not recognise — they would fall through as unknown
 * 500 errors. This function intercepts them and rethrows as platform types
 * so errorMiddleware produces the correct HTTP response.
 *
 * All other errors are rethrown unchanged.
 *
 * Note: this controller is intentionally aware of service-layer error types.
 * The alternative — having the service throw platform error classes directly —
 * would couple the service to the HTTP layer. The current boundary is the
 * correct tradeoff for this architecture.
 *
 * @param {unknown} err
 * @returns {never} — this function always throws, execution never continues.
 * @throws {ValidationError|ConflictError}
 */
function mapServiceError(err) {
  if (err instanceof BroadcastValidationError) {
    throw ValidationError.dto(
      err.field ?? "broadcast",
      err.message,
      "INVALID_VALUE",
    );
  }

  if (err instanceof BroadcastDuplicateError) {
    throw ConflictError.duplicate("idempotencyKey");
  }

  throw err;
}

/**
 * Safely logs broadcast outcome at the controller boundary.
 *
 * Accepts an optional result object — logs available fields defensively
 * rather than assuming a fixed service response shape. If the service
 * contract changes, log entries degrade gracefully rather than throwing.
 *
 * Wrapped in try/catch — logger failure must never affect the response.
 *
 * @param {"info"|"warn"|"error"} level
 * @param {string}                eventLabel
 * @param {string}                requestId
 * @param {object}                [result]
 */
function logBoundaryOutcome(level, eventLabel, requestId, result = {}) {
  try {
    logger[level](eventLabel, {
      broadcastId: result.broadcastId ?? "unavailable",
      recipientCount: result.recipientCount ?? "unavailable",
      status: result.status ?? "unavailable",
      requestId,
    });
  } catch (_logErr) {
    // Logger failure must never break a completed business operation.
  }
}

/* ─────────────────────────────────────────────
   HANDLERS
───────────────────────────────────────────── */

/**
 * POST /api/v1/admin/broadcasts
 *
 * Validates the request payload via broadcastValidator, injects
 * createdByAdmin from the authenticated session, and delegates to
 * broadcastService.sendBroadcast().
 *
 * Response is 201 Created — a Broadcast document is persisted as part
 * of every send, even when recipient count is zero.
 */
export const sendBroadcast = asyncHandler(async (req, res) => {
  // Validate req.user.id at the boundary — the service also validates
  // createdByAdmin internally as defence-in-depth, but catching a
  // malformed token ID here produces a cleaner error at the right layer.
  assertValidObjectId(req.user.id, "adminId");

  // Destructure to explicitly exclude any createdByAdmin the client may
  // have supplied — structurally prevents client override regardless of
  // schema permissiveness. Server value is injected below.
  const { createdByAdmin: _ignored, ...clientBody } = req.body;

  const rawPayload = {
    ...clientBody,
    // Server-side injection — always sourced from the authenticated session.
    createdByAdmin: req.user.id,
  };

  const validation = validateBroadcastPayload(rawPayload);

  if (!validation.valid) {
    throw new ValidationError({ errors: validation.error.details });
  }

  const reqInfo = buildReqInfo(req);

  let result;

  try {
    result = await broadcastService.sendBroadcast({
      ...validation.data,
      // reqInfo propagated for audit trail and distributed tracing —
      // consistent with adminService and adminDocumentService pattern.
      ...reqInfo,
    });
  } catch (err) {
    // Log at the controller boundary before mapping — provides a failure
    // trace at the HTTP layer even when the error originates deep in the
    // service. result is undefined here so logBoundaryOutcome degrades
    // gracefully with "unavailable" placeholders.
    logBoundaryOutcome("error", "Broadcast send failed.", reqInfo.requestId);

    // mapServiceError always throws — execution never continues past this call.
    mapServiceError(err);
  }

  // Success — log at the controller boundary for HTTP-layer trace correlation.
  // logBoundaryOutcome reads result fields defensively so shape changes in
  // the service degrade log quality rather than throwing.
  logBoundaryOutcome("info", "Broadcast sent.", reqInfo.requestId, result);

  // 201 Created — a Broadcast document is persisted on every send.
  // Result is an action summary (broadcastId, recipientCount, emailSent,
  // emailFailed, emailSkipped, status) — not the full document.
  const response = ApiResponse.created(result, "Broadcast sent successfully.");
  return res.status(response.statusCode).json(response);
});
