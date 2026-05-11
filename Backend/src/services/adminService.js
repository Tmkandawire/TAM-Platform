/**
 * @file adminService.js
 * @module services/admin
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Enforce business rules and state transition validity
 * - Execute transactional DB operations with retry on transient failures
 * - Handle audit logging transactionally
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - HTTP boundary validation  → adminController
 * - Role enforcement          → RBAC middleware
 * - ObjectId format checks    → adminController
 *
 * Transaction retry strategy
 * ─────────────────────────────────────────────
 * MongoDB can throw TransientTransactionError or WriteConflict under
 * concurrent load. These are recoverable — the operation should be
 * retried rather than failed immediately.
 *
 * MAX_TRANSACTION_ATTEMPTS = 5. On exhaustion the error is rethrown
 * and errorMiddleware returns 503 via ServiceUnavailableError, signalling
 * the client to retry.
 *
 * Non-transient errors (NotFoundError, ValidationError, ConflictError)
 * are rethrown immediately — retrying them would not change the outcome.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import logger from "../utils/logger.js";
import auditService from "./auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ServiceUnavailableError,
} from "../errors/index.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum number of attempts for a transactional operation before
 * giving up and throwing ServiceUnavailableError.
 */
const MAX_TRANSACTION_ATTEMPTS = 5;

/**
 * MongoDB error codes that indicate a transient failure safe to retry.
 * TransientTransactionError and WriteConflict resolve on retry under
 * normal conditions — they do not indicate a logic error.
 */
const TRANSIENT_ERROR_LABELS = new Set(["TransientTransactionError"]);
const WRITE_CONFLICT_CODE = 112;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Returns true if the error is a transient MongoDB transaction failure
 * that is safe to retry.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientError(err) {
  if (!(err instanceof Error)) return false;

  // MongoDB labels transient errors explicitly
  if (
    typeof err.hasErrorLabel === "function" &&
    TRANSIENT_ERROR_LABELS.has("TransientTransactionError") &&
    err.hasErrorLabel("TransientTransactionError")
  ) {
    return true;
  }

  // WriteConflict — two transactions modifying the same document
  if (err.code === WRITE_CONFLICT_CODE) return true;

  return false;
}

/**
 * Executes a transactional operation with retry logic for transient
 * MongoDB failures.
 *
 * Non-transient errors (application errors like NotFoundError,
 * ValidationError, ConflictError) are rethrown immediately — retrying
 * them would never produce a different outcome.
 *
 * @param {() => Promise<T>} operation  - Async function containing the
 *   full transaction (startSession → startTransaction → commit/abort).
 * @returns {Promise<T>}
 * @throws {ServiceUnavailableError} when all attempts are exhausted.
 */
async function withRetry(operation) {
  let attempt = 0;
  let lastError;

  while (attempt < MAX_TRANSACTION_ATTEMPTS) {
    attempt++;

    try {
      return await operation();
    } catch (err) {
      // Application errors are never retryable — rethrow immediately.
      if (!isTransientError(err)) throw err;

      lastError = err;

      try {
        logger.warn("Transaction transient failure — retrying", {
          attempt,
          maxAttempts: MAX_TRANSACTION_ATTEMPTS,
          code: err.code,
          message: err.message,
        });
      } catch (_logErr) {
        // Logger failure must never suppress the retry loop.
      }
    }
  }

  // All attempts exhausted — signal upstream to retry the request.
  try {
    logger.error("Transaction failed after max attempts", {
      maxAttempts: MAX_TRANSACTION_ATTEMPTS,
      message: lastError?.message,
    });
  } catch (_logErr) {
    // Swallowed — do not mask the ServiceUnavailableError below.
  }

  throw new ServiceUnavailableError(
    `Transaction failed after ${MAX_TRANSACTION_ATTEMPTS} attempts.`,
    lastError,
  );
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class AdminService {
  /**
   * Get all pending members with pagination.
   *
   * @param {{ page: number, limit: number }} params
   * @returns {{ data: object[], pagination: { total: number, page: number } }}
   */
  async getPendingMembers({ page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ status: "pending" })
        .populate("profile")
        .select("email status createdAt profile")
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ status: "pending" }),
    ]);

    // pagination.pages intentionally omitted — ApiResponse.paginated()
    // owns all derived pagination fields (totalPages, hasNextPage, hasPrevPage).
    return {
      data: users,
      pagination: {
        total,
        page,
      },
    };
  }

  /**
   * Approve a pending member.
   *
   * State guard: throws ConflictError if user is not in "pending" state.
   * Retries up to MAX_TRANSACTION_ATTEMPTS on transient MongoDB failures.
   *
   * @param {string} userId
   * @param {string} adminId
   * @param {{ ip: string, userAgent: string, requestId: string }} reqInfo
   */
  async approveMember(userId, adminId, reqInfo) {
    return withRetry(async () => {
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);

        if (!user) {
          throw NotFoundError.profile(userId);
        }

        if (user.status !== "pending") {
          throw ConflictError.documentState(userId, user.status);
        }

        const profile = await Profile.findOne({ user: userId }).session(
          session,
        );

        if (!profile) {
          throw ValidationError.dto(
            "profile",
            "User has no profile.",
            "MISSING_VALUE",
          );
        }

        if (!profile.isComplete) {
          throw ValidationError.dto(
            "profile",
            "Profile is incomplete — all required documents must be uploaded.",
            "INVALID_VALUE",
          );
        }

        if (profile.documents.length === 0) {
          throw ValidationError.dto(
            "documents",
            "No documents uploaded.",
            "MISSING_VALUE",
          );
        }

        // Single timestamp shared across all writes in this transaction —
        // ensures user and profile records are consistent in audit systems.
        const now = new Date();

        user.status = "active";
        user.approvedAt = now;
        user.approvedBy = adminId;
        await user.save({ session });

        profile.isApproved = true;
        profile.approvedAt = now;
        profile.approvedBy = adminId;
        profile.rejectionReason = null;
        await profile.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_APPROVED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus: "pending",
            newStatus: "active",
            metadata: {
              businessName: profile.businessName,
              email: user.email,
            },
          },
          session,
        );

        await session.commitTransaction();

        try {
          logger.info("ADMIN_ACTION", {
            action: AUDIT_ACTIONS.MEMBER_APPROVED,
            adminId,
            userId,
            requestId: reqInfo?.requestId,
          });
        } catch (_logErr) {
          // Logger failure must never break a completed business operation.
        }

        return { message: "Member approved successfully" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  /**
   * Reject a pending member.
   *
   * State guard: throws ConflictError if user is not in "pending" state.
   * Sets user.status to "rejected" — semantically distinct from "suspended"
   * (never approved vs previously active). Supports independent reporting,
   * reapplication flows, and notification routing.
   *
   * reason is validated at the controller boundary — the guard here is
   * defence-in-depth for callers outside the HTTP layer.
   *
   * @param {string} userId
   * @param {string} reason
   * @param {string} adminId
   * @param {{ ip: string, userAgent: string, requestId: string }} reqInfo
   */
  async rejectMember(userId, reason, adminId, reqInfo) {
    // Defence-in-depth — controller validates reason before this point.
    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw ValidationError.dto(
        "reason",
        "Rejection reason is required.",
        "MISSING_VALUE",
      );
    }

    return withRetry(async () => {
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);

        if (!user) {
          throw NotFoundError.profile(userId);
        }

        if (user.status !== "pending") {
          throw ConflictError.documentState(userId, user.status);
        }

        const profile = await Profile.findOne({ user: userId }).session(
          session,
        );

        const now = new Date();
        const trimmedReason = reason.trim();

        // "rejected" is semantically distinct from "suspended" —
        // rejected = never approved; suspended = previously active, access revoked.
        user.status = "rejected";
        user.rejectedAt = now;
        user.rejectedBy = adminId;
        await user.save({ session });

        if (profile) {
          profile.isApproved = false;
          profile.rejectionReason = trimmedReason;
          await profile.save({ session });
        }

        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_REJECTED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus: "pending",
            newStatus: "rejected",
            reason: trimmedReason,
            metadata: {
              businessName: profile?.businessName ?? null,
              email: user.email,
            },
          },
          session,
        );

        await session.commitTransaction();

        try {
          logger.warn("ADMIN_ACTION", {
            action: AUDIT_ACTIONS.MEMBER_REJECTED,
            adminId,
            userId,
            requestId: reqInfo?.requestId,
          });
        } catch (_logErr) {
          // Logger failure must never break a completed business operation.
        }

        return { message: "Member rejected" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  /**
   * Suspend an active member.
   *
   * State guard: throws ConflictError if user is already suspended.
   * Matches approveMember and rejectMember pattern — duplicate requests
   * are rejected explicitly rather than silently re-executing.
   *
   * @param {string} userId
   * @param {string} adminId
   * @param {{ ip: string, userAgent: string, requestId: string }} reqInfo
   */
  async suspendMember(userId, adminId, reqInfo) {
    return withRetry(async () => {
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);

        if (!user) {
          throw NotFoundError.profile(userId);
        }

        if (user.status === "suspended") {
          throw ConflictError.documentState(userId, user.status);
        }

        const previousStatus = user.status;

        user.status = "suspended";
        await user.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_SUSPENDED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus,
            newStatus: "suspended",
          },
          session,
        );

        await session.commitTransaction();

        try {
          logger.warn("ADMIN_ACTION", {
            action: AUDIT_ACTIONS.MEMBER_SUSPENDED,
            adminId,
            userId,
            requestId: reqInfo?.requestId,
          });
        } catch (_logErr) {
          // Logger failure must never break a completed business operation.
        }

        return { message: "Member suspended" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }
}

export default new AdminService();
