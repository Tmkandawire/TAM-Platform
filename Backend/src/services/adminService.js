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
import notificationService from "./NotificationService.js";
import { NOTIFICATION_TYPE } from "../constants/notificationTypes.js";
import Notification from "../models/Notification.js";
import cloudinary from "../config/cloudinary.js";

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

        try {
          await notificationService.createNotification({
            user: userId,
            userEmail: user.email,
            type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
            title: "Membership Approved",
            message:
              "Congratulations! Your TAM membership application has been approved. Your account is now active.",
            metadata: { adminId, action: "MEMBER_APPROVED" },
          });
        } catch (_notifErr) {
          logger.error("Failed to send approval notification", {
            userId,
            error: _notifErr.message,
          });
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

        try {
          await notificationService.createNotification({
            user: userId,
            userEmail: user.email,
            type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
            title: "Membership Application Rejected",
            message: `Your TAM membership application has been rejected. Reason: ${trimmedReason}`,
            metadata: {
              adminId,
              action: "MEMBER_REJECTED",
              reason: trimmedReason,
            },
          });
        } catch (_notifErr) {
          logger.error("Failed to send rejection notification", {
            userId,
            error: _notifErr.message,
          });
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

        const SUSPENDABLE_STATUSES = ["active"];

        if (!SUSPENDABLE_STATUSES.includes(user.status)) {
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

        try {
          await notificationService.createNotification({
            user: userId,
            userEmail: user.email,
            type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
            title: "Account Suspended",
            message:
              "Your TAM account has been suspended. Please contact support for further information.",
            metadata: { adminId, action: "MEMBER_SUSPENDED" },
          });
        } catch (_notifErr) {
          logger.error("Failed to send suspension notification", {
            userId,
            error: _notifErr.message,
          });
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

  async getMembers({ status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;

    const filter = {};

    if (status === "deleted") {
      filter.isDeleted = true;
    } else if (status && status !== "all") {
      filter.status = status;
    }

    const queryOptions = status === "deleted" ? { includeDeleted: true } : {};

    const [users, total] = await Promise.all([
      User.find(filter, null, queryOptions)
        .populate("profile", "businessName contactPerson isComplete isApproved")
        .select(
          "email status createdAt approvedAt rejectedAt suspendedAt deletedAt deletedBy isDeleted profile",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter, queryOptions),
    ]);

    return { data: users, pagination: { total, page } };
  }

  /**
   * Reinstate a suspended member back to active.
   */
  async reinstateMember(userId, adminId, reqInfo) {
    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);
        if (!user) throw NotFoundError.profile(userId);
        if (user.status !== "suspended") {
          throw ConflictError.documentState(userId, user.status);
        }

        const previousStatus = user.status;
        user.status = "active";
        user.suspendedAt = null;
        user.suspendedBy = null;
        await user.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_REINSTATED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus,
            newStatus: "active",
          },
          session,
        );

        await session.commitTransaction();

        try {
          await notificationService.createNotification({
            user: userId,
            userEmail: user.email,
            type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
            title: "Account Reinstated",
            message:
              "Your TAM account has been reinstated. You now have full access to the member portal.",
            metadata: { adminId, action: "MEMBER_REINSTATED" },
          });
        } catch (_notifErr) {
          logger.error("Failed to send reinstatement notification", {
            userId,
            error: _notifErr.message,
          });
        }

        return { message: "Member reinstated" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  /**
   * Soft-delete a member — sets isDeleted=true, preserves all data.
   * 90-day grace period before hard delete is permitted.
   */
  async softDeleteMember(userId, reason, adminId, reqInfo) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError("Reason must be at least 10 characters");
    }

    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);
        if (!user) throw NotFoundError.profile(userId);
        if (user.isDeleted) {
          throw new ConflictError("Member is already deleted");
        }

        const previousStatus = user.status;
        const now = new Date();

        user.isDeleted = true;
        user.deletedAt = now;
        user.deletedBy = adminId;
        user.status = "deleted";
        await user.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_SOFT_DELETED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus,
            newStatus: "deleted",
            reason: reason.trim(),
          },
          session,
        );

        await session.commitTransaction();
        return { message: "Member soft-deleted" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  /**
   * Hard-delete a member — permanently wipes user + profile from DB.
   * Only permitted if soft-deleted more than 90 days ago.
   */
  async hardDeleteMember(userId, adminId, reqInfo) {
    const GRACE_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);
        if (!user) throw NotFoundError.profile(userId);

        if (!user.isDeleted) {
          throw new ValidationError(
            "Member must be soft-deleted before hard delete",
          );
        }

        const deletedAt = user.deletedAt ? new Date(user.deletedAt) : null;
        const graceExpired =
          deletedAt && Date.now() - deletedAt.getTime() >= GRACE_PERIOD_MS;

        if (!graceExpired) {
          const daysRemaining = deletedAt
            ? Math.ceil(
                (GRACE_PERIOD_MS - (Date.now() - deletedAt.getTime())) /
                  86400000,
              )
            : 90;
          throw new ValidationError(
            `Hard delete is not permitted until the 90-day grace period expires. ${daysRemaining} day(s) remaining.`,
          );
        }

        // Log before delete so the audit entry references the user ID
        await auditService.log(
          {
            action: AUDIT_ACTIONS.MEMBER_HARD_DELETED,
            actorId: adminId,
            targetId: userId,
            targetType: "user",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            previousStatus: "deleted",
            newStatus: null,
            metadata: { email: user.email, deletedAt: user.deletedAt },
          },
          session,
        );

        // Fetch profile before deletion so Cloudinary assets can be cleaned up
        const profile = await Profile.findOne({
          user: userId,
        }).session(session);

        if (profile) {
          const publicIds = profile.documents
            .map((doc) => doc.publicId)
            .filter(Boolean);

          if (profile.profilePicturePublicId) {
            publicIds.push(profile.profilePicturePublicId);
          }

          // Cloudinary is external and non-transactional.
          // Cleanup failure should never abort the DB delete.
          if (publicIds.length > 0) {
            try {
              await cloudinary.api.delete_resources(publicIds);
            } catch (err) {
              logger.error("hardDeleteMember: Cloudinary cleanup failed", {
                userId,
                error: err.message,
              });
            }
          }
        }

        await Profile.deleteOne({ user: userId }, { session });

        await User.deleteOne({ _id: userId }, { session });

        await session.commitTransaction();
        return { message: "Member permanently deleted" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  async getMemberStats() {
    const [active, total] = await Promise.all([
      User.countDocuments({ status: "active", isDeleted: { $ne: true } }),
      User.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return { active, total };
  }

  async approveDocument(userId, documentId, adminId, reqInfo) {
    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const profile = await Profile.findOne({ user: userId }).session(
          session,
        );
        if (!profile) throw new NotFoundError("Profile not found");

        const doc = profile.documents.id(documentId);
        if (!doc) throw new NotFoundError("Document not found");

        if (doc.status === "approved") {
          throw new ConflictError("Document already approved");
        }

        doc.status = "approved";
        doc.verifiedBy = adminId;
        doc.verifiedAt = new Date();
        doc.rejectionReason = null;
        doc.resubmissionReason = null;

        await profile.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.DOCUMENT_APPROVED,
            actorId: adminId,
            targetId: documentId,
            targetType: "document",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            metadata: { userId, documentType: doc.documentType },
          },
          session,
        );

        await session.commitTransaction();
        return { message: "Document approved" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  async rejectDocument(userId, documentId, reason, adminId, reqInfo) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError(
        "Rejection reason must be at least 10 characters",
      );
    }

    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const profile = await Profile.findOne({ user: userId }).session(
          session,
        );
        if (!profile) throw new NotFoundError("Profile not found");

        const doc = profile.documents.id(documentId);
        if (!doc) throw new NotFoundError("Document not found");

        doc.status = "rejected";
        doc.verifiedBy = adminId;
        doc.verifiedAt = new Date();
        doc.rejectionReason = reason.trim();
        doc.resubmissionReason = null;

        await profile.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.DOCUMENT_REJECTED,
            actorId: adminId,
            targetId: documentId,
            targetType: "document",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            reason: reason.trim(),
            metadata: { userId, documentType: doc.documentType },
          },
          session,
        );

        await session.commitTransaction();
        return { message: "Document rejected" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  async requestDocumentResubmission(
    userId,
    documentId,
    reason,
    documentsRequired,
    adminId,
    reqInfo,
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError("Reason must be at least 10 characters");
    }
    if (!Array.isArray(documentsRequired) || documentsRequired.length === 0) {
      throw new ValidationError("At least one document type must be specified");
    }

    return withRetry(async () => {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const profile = await Profile.findOne({ user: userId }).session(
          session,
        );
        if (!profile) throw new NotFoundError("Profile not found");

        const doc = profile.documents.id(documentId);
        if (!doc) throw new NotFoundError("Document not found");

        doc.status = "resubmission_required";
        doc.verifiedBy = adminId;
        doc.verifiedAt = new Date();
        doc.resubmissionReason = reason.trim();
        doc.documentsRequired = documentsRequired;
        doc.rejectionReason = null;

        await profile.save({ session });

        await auditService.log(
          {
            action: AUDIT_ACTIONS.DOCUMENT_RESUBMISSION_REQUESTED,
            actorId: adminId,
            targetId: documentId,
            targetType: "document",
            ip: reqInfo?.ip,
            userAgent: reqInfo?.userAgent,
            requestId: reqInfo?.requestId,
            reason: reason.trim(),
            metadata: {
              userId,
              documentType: doc.documentType,
              documentsRequired,
            },
          },
          session,
        );

        await session.commitTransaction();
        return { message: "Resubmission requested" };
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    });
  }

  async getNotifications({ page = 1, limit = 20, type, status, member } = {}) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(member
        ? [{ $match: { "user.email": { $regex: member, $options: "i" } } }]
        : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: Number(limit) }],
          total: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Notification.aggregate(pipeline);
    const notifications = result.data;
    const total = result.total[0]?.count ?? 0;

    return {
      notifications,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    };
  }

  async deleteNotification(id) {
    const n = await Notification.findByIdAndDelete(id);
    if (!n) throw new NotFoundError("Notification not found");
    return { deleted: true };
  }

  async resendAdminNotification(id, adminId) {
    const original = await Notification.findById(id).lean();
    if (!original) throw new NotFoundError("Notification not found");

    await notificationService.createNotification({
      user: String(original.user),
      type: original.type,
      title: original.title,
      message: original.message,
      metadata: { ...original.metadata, resentBy: adminId, originalId: id },
    });

    return { resent: true };
  }
}

export default new AdminService();
