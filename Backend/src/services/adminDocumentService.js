import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import AuditLog from "../models/AuditLog.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import priorityService from "./priorityService.js";
import eventBus, { EVENTS } from "../utils/eventBus.js";

const ALLOWED_TRANSITIONS = {
  pending: ["approved", "rejected"],
  rejected: ["approved"],
};

class AdminDocumentService {
  /* -------------------------
     SMART REVIEW QUEUE
  ------------------------- */
  async getPendingReviews({
    page = 1,
    limit = 10,
    status = "pending",
    priority,
    documentType,
    sortBy = "priority",
  }) {
    const safePage = Math.max(parseInt(page) || 1, 1);
    const safeLimit = Math.min(parseInt(limit) || 10, 50);
    const skip = (safePage - 1) * safeLimit;

    // Build match
    const matchStage = { "documents.status": status };
    if (documentType) {
      matchStage["documents.documentType"] = documentType;
    }

    // Build filter conditions (IMPORTANT FIX)
    const filterConditions = [{ $eq: ["$$doc.status", status] }];
    if (documentType) {
      filterConditions.push({
        $eq: ["$$doc.documentType", documentType],
      });
    }

    const pipeline = [
      { $match: matchStage },

      {
        $project: {
          user: 1,
          updatedAt: 1,
          createdAt: 1,
          tinNumber: 1,
          documents: {
            $filter: {
              input: "$documents",
              as: "doc",
              cond: { $and: filterConditions },
            },
          },
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { email: 1, role: 1, status: 1 } }],
        },
      },
      { $unwind: "$user" },

      // buffer for priority sort
      { $skip: skip },
      { $limit: safeLimit * 3 },
    ];

    const profiles = await Profile.aggregate(pipeline);

    // NOTE: DB-level count (documented limitation)
    const totalProfiles = await Profile.countDocuments(matchStage);

    let enriched = priorityService.injectPriority(profiles);

    // Priority filtering
    if (priority) {
      const threshold = this._priorityThreshold(priority);
      enriched = enriched.filter((p) => p.overallPriorityScore >= threshold);
    }

    // Sorting
    enriched.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.updatedAt) - new Date(b.updatedAt);
        case "newest":
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        case "priority":
        default:
          if (b.overallPriorityScore !== a.overallPriorityScore) {
            return b.overallPriorityScore - a.overallPriorityScore;
          }
          return new Date(a.updatedAt) - new Date(b.updatedAt);
      }
    });

    const paginated = enriched.slice(0, safeLimit);

    return {
      data: paginated,
      pagination: {
        totalProfiles, // explicit naming
        page: safePage,
        pages: Math.ceil(totalProfiles / safeLimit),
        limit: safeLimit,
        hasNextPage: safePage < Math.ceil(totalProfiles / safeLimit),
      },
    };
  }

  /* -------------------------
     UPDATE DOCUMENT STATUS
  ------------------------- */
  async updateDocumentStatus({
    adminId,
    targetUserId,
    documentId,
    status,
    reason = null,
    ip = null,
    userAgent = null,
  }) {
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_USER_ID");
    }

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new ApiError(400, "Invalid document ID", [], "INVALID_DOC_ID");
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const profile = await Profile.findOne({ user: targetUserId }).session(
        session,
      );
      if (!profile) {
        throw new ApiError(404, "Profile not found", [], "PROFILE_NOT_FOUND");
      }

      const doc = profile.documents.id(documentId);
      if (!doc) {
        throw new ApiError(404, "Document not found", [], "DOC_NOT_FOUND");
      }

      const previousStatus = doc.status;

      // Idempotency guard
      if (previousStatus === status) {
        throw new ApiError(400, "No status change", [], "NO_OP");
      }

      // State machine
      const allowed = ALLOWED_TRANSITIONS[previousStatus] || [];
      if (!allowed.includes(status)) {
        throw new ApiError(
          400,
          `Invalid transition: ${previousStatus} → ${status}`,
          [],
          "INVALID_TRANSITION",
        );
      }

      // Expiry guard
      if (
        status === "approved" &&
        doc.expiryDate &&
        new Date(doc.expiryDate) < new Date()
      ) {
        throw new ApiError(
          400,
          "Cannot approve expired document",
          [],
          "DOC_EXPIRED",
        );
      }

      // Apply update
      doc.status = status;
      doc.verifiedBy = adminId;
      doc.verifiedAt = new Date();
      doc.rejectionReason = status === "rejected" ? reason : null;

      await profile.save({ session });

      // Audit log
      await AuditLog.create(
        [
          {
            action:
              status === "approved" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
            user: adminId,
            target: targetUserId,
            metadata: {
              documentId,
              documentType: doc.documentType,
              previousStatus,
              newStatus: status,
              reason,
            },
            ip,
            userAgent,
            status: "SUCCESS",
          },
        ],
        { session },
      );

      await session.commitTransaction();

      // Event (safe)
      try {
        const eventType =
          status === "approved"
            ? EVENTS.DOCUMENT_APPROVED
            : EVENTS.DOCUMENT_REJECTED;

        eventBus.emit(eventType, {
          userId: targetUserId,
          adminId,
          docId: documentId,
          documentType: doc.documentType,
          reason,
        });
      } catch (err) {
        logger.warn("⚠️ Event emission failed", { error: err.message });
      }

      logger.info("🛡️ Document reviewed", {
        adminId,
        targetUserId,
        documentId,
        previousStatus,
        newStatus: status,
      });

      return profile.toObject();
    } catch (err) {
      await session.abortTransaction();

      logger.error("❌ Document update failed", {
        adminId,
        targetUserId,
        documentId,
        error: err.message,
      });

      throw err;
    } finally {
      session.endSession();
    }
  }

  _priorityThreshold(level) {
    if (level === "HIGH") return 100;
    if (level === "MEDIUM") return 40;
    return 0;
  }
}

export default new AdminDocumentService();
