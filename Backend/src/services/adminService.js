import mongoose from "mongoose";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import auditService from "./auditService.js";

class AdminService {
  /**
   * 📋 Get all pending members
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
   * ✅ Approve member
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

      // ✅ Update user
      user.status = "active";
      user.approvedAt = new Date();
      user.approvedBy = adminId;
      await user.save({ session });

      // ✅ Update profile
      profile.isApproved = true;
      profile.approvedAt = new Date();
      profile.approvedBy = adminId;
      profile.rejectionReason = null;
      await profile.save({ session });

      // 📝 Permanent Audit Log (Part of transaction)
      await auditService.log(
        {
          action: "MEMBER_APPROVAL",
          user: adminId,
          target: userId,
          ip: reqInfo?.ip,
          userAgent: reqInfo?.userAgent,
          metadata: { businessName: profile.businessName, email: user.email },
        },
        session,
      );

      await session.commitTransaction();

      logger.info("ADMIN_ACTION", {
        action: "APPROVE_MEMBER",
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
   * ❌ Reject member
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

      // Update user
      user.status = "suspended";
      await user.save({ session });

      if (profile) {
        profile.isApproved = false;
        profile.rejectionReason = reason;
        await profile.save({ session });
      }

      // 📝 Permanent Audit Log (Part of transaction)
      await auditService.log(
        {
          action: "MEMBER_REJECTION",
          user: adminId,
          target: userId,
          ip: reqInfo?.ip,
          userAgent: reqInfo?.userAgent,
          metadata: { reason },
        },
        session,
      );

      await session.commitTransaction();

      logger.warn("ADMIN_ACTION", {
        action: "REJECT_MEMBER",
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
   * ⛔ Suspend member
   */
  async suspendMember(userId, adminId, reqInfo) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    user.status = "suspended";
    await user.save();

    // 📝 Permanent Audit Log (Single save, no transaction needed)
    await auditService.log({
      action: "MEMBER_SUSPENSION",
      user: adminId,
      target: userId,
      ip: reqInfo?.ip,
      userAgent: reqInfo?.userAgent,
    });

    logger.warn("ADMIN_ACTION", {
      action: "SUSPEND_MEMBER",
      adminId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return { message: "Member suspended" };
  }
}

export default new AdminService();
