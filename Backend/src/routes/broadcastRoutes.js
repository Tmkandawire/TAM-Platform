/**
 * @file broadcastRoutes.js
 *
 * Mounted at /api/v1/admin/broadcasts via routes/index.js.
 *
 * Middleware order for POST /
 * ─────────────────────────────────────────────────────────────
 *  1. requireAdmin      — JWT verification + hierarchy check. Any role
 *                         at or above ROLES.ADMIN is permitted. Rejects
 *                         unauthenticated or under-privileged callers
 *                         before any other middleware runs.
 *
 *  2. broadcastLimiter  — Redis-backed 1/min cap, keyed by req.user.id
 *                         (not IP). User-keyed so admins behind a shared
 *                         office IP or VPN never block each other.
 *                         Positioned before audit + validation so
 *                         over-quota requests are rejected at the
 *                         cheapest possible point.
 *
 *  3. auditAttempt      — Writes an attempt-level AuditLog entry before
 *                         the controller runs. Captures every attempt
 *                         (including those that fail validation) so the
 *                         audit trail is complete regardless of outcome.
 *                         broadcastService writes the outcome entry with
 *                         the real targetId after the broadcast is saved.
 *                         targetType is passed explicitly here — the
 *                         middleware is generic and makes no assumptions.
 *
 *  4. validate          — Runs broadcastPayloadSchema.safeParse against
 *                         req.body. Rejects malformed payloads with a
 *                         structured 400 before any service logic runs.
 *                         Replaces req.body with sanitized + coerced
 *                         output so the controller receives clean data.
 *
 *  5. sendBroadcast     — Controller. By the time this runs the caller
 *                         is authenticated, under quota, audited, and
 *                         the payload is validated and sanitized.
 *
 * Audience scope enforcement — handled in broadcastService, not here
 * ─────────────────────────────────────────────────────────────
 *  The route permits both admin and super_admin via requireAdmin.
 *  Audience scope is a business rule enforced by the service layer:
 *
 *    admin       → audienceType "FILTERED" only.
 *                  Attempting audienceType "ALL" is rejected by the service.
 *    super_admin → audienceType "ALL" or "FILTERED".
 *
 *  The service reads req.user.role directly via the controller — no
 *  middleware flag is set here. Scope enforcement belongs with business
 *  logic, not transport logic, so it can never be silently bypassed by
 *  middleware running out of order.
 *
 * Idempotency
 * ─────────────────────────────────────────────────────────────
 *  The payload validator requires idempotencyKey on every request.
 *  Duplicate detection (Redis key TTL check) is enforced in
 *  broadcastService before any fan-out begins. This prevents a
 *  network retry or admin double-submit from sending the same
 *  broadcast twice.
 *
 * Store strategy
 * ─────────────────────────────────────────────────────────────
 *  broadcastLimiter is Redis-backed so the 1/min window survives
 *  server restarts. Without persistence an admin could exhaust their
 *  window, trigger a restart, and immediately bypass the limit.
 */

import express from "express";
import { sendBroadcast } from "../controllers/broadcastController.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { broadcastLimiter } from "../middleware/rateLimitMiddleware.js";
import { auditAttempt } from "../middleware/auditMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { broadcastSchema } from "../validators/broadcastValidator.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";

const router = express.Router();

/* ─────────────────────────────────────────────────────────────
   GUARD — all broadcast routes require admin-level access.
   requireAdmin is a frozen [protect, requireAdminLevel] array.
   Spread with ...requireAdmin on individual routes if needed.
───────────────────────────────────────────────────────────── */
router.use(requireAdmin);

/* ─────────────────────────────────────────────────────────────
   POST /api/v1/admin/broadcasts
   Send a broadcast to all or a filtered subset of users.

   Scope rules (enforced in broadcastService):
     admin       → FILTERED audience only
     super_admin → ALL or FILTERED
───────────────────────────────────────────────────────────── */
router.post(
  "/",
  broadcastLimiter,
  auditAttempt(AUDIT_ACTIONS.BROADCAST_SENT, "broadcast"),
  validate(broadcastSchema),
  sendBroadcast,
);

export default router;
