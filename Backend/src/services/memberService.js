import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

class MemberService {
  /**
   * @desc Create profile (atomic + safe)
   */
  async createProfile(profileData, userId) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // 🚫 Prevent duplicate profile (double protection)
      const existing = await Profile.findOne({ user: userId }).session(session);
      if (existing) {
        throw new ApiError(400, "Profile already exists", [], "PROFILE_EXISTS");
      }

      // ✅ Create profile
      const [profile] = await Profile.create(
        [{ ...profileData, user: userId }],
        { session },
      );

      // ✅ Link to user
      await User.findByIdAndUpdate(
        userId,
        { profile: profile._id },
        { session, new: false },
      );

      await session.commitTransaction();

      return profile.toObject();
    } catch (err) {
      await session.abortTransaction();

      if (err.code === 11000) {
        throw new ApiError(400, "Duplicate profile data", [], "DUPLICATE_KEY");
      }

      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * @desc Get profile by user ID (optimized)
   */
  async getProfileByUserId(userId) {
    const profile = await Profile.findOne({ user: userId })
      .populate("user", "email role status")
      .lean(); // 🚀 performance boost

    if (!profile) {
      throw new ApiError(
        404,
        "Member profile not found",
        [],
        "PROFILE_NOT_FOUND",
      );
    }

    return profile;
  }

  /**
   * @desc Update profile (safe + controlled)
   */
  async updateProfile(userId, updateData) {
    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found", [], "PROFILE_NOT_FOUND");
    }

    // 🔐 Immutable after approval
    if (profile.isApproved) {
      throw new ApiError(
        403,
        "Approved profiles cannot be modified",
        [],
        "PROFILE_LOCKED",
      );
    }

    // 🛡 Prevent overwriting protected fields
    const forbiddenFields = ["user", "isApproved", "rejectionReason"];
    forbiddenFields.forEach((field) => delete updateData[field]);

    Object.assign(profile, updateData);

    await profile.save();

    return profile.toObject();
  }

  /**
   * @desc Submit profile for approval
   */
  async submitForApproval(userId) {
    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found", [], "PROFILE_NOT_FOUND");
    }

    // ✅ Use virtual completeness
    if (!profile.isComplete) {
      throw new ApiError(
        400,
        "Profile must be complete before submission",
        [],
        "PROFILE_INCOMPLETE",
      );
    }

    // 🔒 Prevent resubmission spam
    if (profile.isApproved) {
      throw new ApiError(
        400,
        "Profile already approved",
        [],
        "ALREADY_APPROVED",
      );
    }

    // Update user status
    await User.findByIdAndUpdate(userId, { status: "pending" });

    return profile.toObject();
  }

  /**
   * @desc Public directory (scalable + paginated)
   */
  async getPublicDirectory(filters = {}) {
    const query = {
      isApproved: true,
    };

    // 🎯 Filters
    if (filters.city) query.city = filters.city;

    // 🔍 Text search (requires text index)
    let sortOption = { businessName: 1 };

    if (filters.search) {
      query.$text = { $search: filters.search };
      sortOption = { score: { $meta: "textScore" } };
    }

    // 📄 Pagination
    const page = Math.max(parseInt(filters.page) || 1, 1);
    const limit = Math.min(parseInt(filters.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [profiles, total] = await Promise.all([
      Profile.find(query)
        .select("businessName city vehicleTypes fleetSize")
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),

      Profile.countDocuments(query),
    ]);

    return {
      data: profiles,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }
}

export default new MemberService();
