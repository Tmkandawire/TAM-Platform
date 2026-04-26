import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import AuditLog from "../models/AuditLog.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

class AdminDocumentService {
  /**
   * Approve / Reject Document (Atomic + Audited)
   */
  async updateDocumentStatus({
    adminId,
    targetUserId,
    documentId,
    status,
    reason = null,
  }) {
    // 🔒 Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(adminId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId) ||
      !mongoose.Types.ObjectId.isValid(documentId)
    ) {
      throw new ApiError(400, "Invalid ID format", [], "INVALID_ID");
    }

    // 🔒 Validate status
    if (!["approved", "rejected"].includes(status)) {
      throw new ApiError(400, "Invalid status", [], "INVALID_STATUS");
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // 1. Fetch profile inside transaction
      const profile = await Profile.findOne({ user: targetUserId }).session(
        session,
      );

      if (!profile) {
        throw new ApiError(
          404,
          "Member profile not found",
          [],
          "PROFILE_NOT_FOUND",
        );
      }

      // 2. Locate document
      const doc = profile.documents.id(documentId);

      if (!doc) {
        throw new ApiError(404, "Document not found", [], "DOCUMENT_NOT_FOUND");
      }

      const previousStatus = doc.status;

      // 🚫 Enforce valid state transitions
      if (previousStatus === status) {
        throw new ApiError(
          400,
          `Document already ${status}`,
          [],
          "INVALID_STATE",
        );
      }

      if (previousStatus === "approved" && status === "approved") {
        throw new ApiError(
          400,
          "Document already approved",
          [],
          "INVALID_STATE",
        );
      }

      // 3. Apply update
      doc.status = status;
      doc.verifiedBy = adminId;
      doc.verifiedAt = new Date();
      doc.rejectionReason = status === "rejected" ? reason : null;

      await profile.save({ session });

      // 4. Audit log (inside transaction)
      await AuditLog.create(
        [
          {
            adminId,
            action: status === "approved" ? "APPROVE_DOC" : "REJECT_DOC",
            targetUserId,
            details: {
              documentType: doc.documentType,
              documentId,
              previousStatus,
              newStatus: status,
              reason,
            },
            createdAt: new Date(),
          },
        ],
        { session },
      );

      await session.commitTransaction();

      logger.info("🛡️ Document review action", {
        adminId,
        targetUserId,
        documentId,
        previousStatus,
        newStatus: status,
      });

      return profile.toObject();
    } catch (err) {
      await session.abortTransaction();

      logger.error("❌ Admin document update failed", {
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

  /**
   * Fetch pending reviews (Admin dashboard)
   */
  async getPendingReviews() {
    const profiles = await Profile.find({
      "documents.status": "pending",
    })
      .populate("user", "email role status")
      .select("documents user tinNumber")
      .sort({ updatedAt: 1 }) // FIFO
      .lean();

    return profiles;
  }
}

export default new AdminDocumentService();
