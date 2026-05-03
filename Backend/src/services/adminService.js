import mongoose from "mongoose";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import auditService from "./auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";

class AdminService {
  /**
   * Get all pending members with pagination.
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

    return {
      data: users,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Approve a pending member.
   */
  async approveMember(userId, adminId, reqInfo) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new ApiError(404, "User not found", [], "USER_NOT_FOUND");
      }

      if (user.status !== "pending") {
        throw new ApiError(
          400,
          "User is not pending approval",
          [],
          "INVALID_STATE",
        );
      }

      const profile = await Profile.findOne({ user: userId }).session(session);

      if (!profile) {
        throw new ApiError(400, "User has no profile", [], "PROFILE_REQUIRED");
      }

      if (!profile.isComplete) {
        throw new ApiError(400, "Profile incomplete", [], "PROFILE_INCOMPLETE");
      }

      if (profile.documents.length === 0) {
        throw new ApiError(
          400,
          "No documents uploaded",
          [],
          "DOCUMENTS_REQUIRED",
        );
      }

      user.status = "active";
      user.approvedAt = new Date();
      user.approvedBy = adminId;
      await user.save({ session });

      profile.isApproved = true;
      profile.approvedAt = new Date();
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

      logger.info("ADMIN_ACTION", {
        action: AUDIT_ACTIONS.MEMBER_APPROVED,
        adminId,
        userId,
        timestamp: new Date().toISOString(),
      });

      return { message: "Member approved successfully" };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Reject a pending member.
   */
  async rejectMember(userId, reason, adminId, reqInfo) {
    if (!reason) {
      throw new ApiError(
        400,
        "Rejection reason required",
        [],
        "REASON_REQUIRED",
      );
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const user = await User.findById(userId).session(session);

      if (!user) {
        throw new ApiError(404, "User not found", [], "USER_NOT_FOUND");
      }

      if (user.status !== "pending") {
        throw new ApiError(400, "User is not pending", [], "INVALID_STATE");
      }

      const profile = await Profile.findOne({ user: userId }).session(session);

      user.status = "suspended";
      await user.save({ session });

      if (profile) {
        profile.isApproved = false;
        profile.rejectionReason = reason;
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
          previousStatus: "pending",
          newStatus: "suspended",
          reason,
          metadata: {
            email: user.email,
          },
        },
        session,
      );

      await session.commitTransaction();

      logger.warn("ADMIN_ACTION", {
        action: AUDIT_ACTIONS.MEMBER_REJECTED,
        adminId,
        userId,
        reason,
        timestamp: new Date().toISOString(),
      });

      return { message: "Member rejected" };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Suspend an active member.
   */
  async suspendMember(userId, adminId, reqInfo) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found", [], "USER_NOT_FOUND");
    }

    const previousStatus = user.status;

    user.status = "suspended";
    await user.save();

    await auditService.log({
      action: AUDIT_ACTIONS.MEMBER_SUSPENDED,
      actorId: adminId,
      targetId: userId,
      targetType: "user",
      ip: reqInfo?.ip,
      userAgent: reqInfo?.userAgent,
      previousStatus,
      newStatus: "suspended",
    });

    logger.warn("ADMIN_ACTION", {
      action: AUDIT_ACTIONS.MEMBER_SUSPENDED,
      adminId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return { message: "Member suspended" };
  }
}

export default new AdminService();
