import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary"; // Added for cleanup logic
import Profile from "../models/Profile.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import fileService from "./fileService.js";

class MemberService {
  /* -------------------------
      CREATE PROFILE (ATOMIC)
  ------------------------- */
  async createProfile({ userId, data }) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_ID");
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Prevent duplicate profile
      const existing = await Profile.findOne({ user: userId }).session(session);
      if (existing) {
        throw new ApiError(400, "Profile already exists", [], "PROFILE_EXISTS");
      }

      // Create profile
      const [profile] = await Profile.create([{ ...data, user: userId }], {
        session,
      });

      // Link to user
      await User.findByIdAndUpdate(
        userId,
        { profile: profile._id },
        { session },
      );

      await session.commitTransaction();
      logger.info(`✅ Profile initialized for user ${userId}`);

      return profile.toObject();
    } catch (err) {
      await session.abortTransaction();
      if (err.code === 11000) {
        throw new ApiError(400, "Duplicate profile data", [], "DUPLICATE_KEY");
      }
      logger.error(`❌ CreateProfile failed: ${err.message}`);
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* -------------------------
      HANDLE DOCUMENT UPLOAD (ENTERPRISE-GRADE)
  ------------------------- */
  async handleDocumentUpload({ userId, documents }) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_ID");
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const profile = await Profile.findOne({ user: userId }).session(session);

      if (!profile) {
        throw new ApiError(
          404,
          "Profile not found. Create profile first.",
          [],
          "PROFILE_NOT_FOUND",
        );
      }

      const updatedDocs = [];

      for (const doc of documents) {
        const existingDoc = profile.documents.find(
          (d) => d.documentType === doc.documentType,
        );

        // 🧹 CLEANER & SAFER: Cleanup old Cloudinary file via FileService
        if (existingDoc?.publicId) {
          await fileService.safeDelete(existingDoc.publicId, {
            userId,
            documentType: existingDoc.documentType,
            reason: "document_overwrite",
          });
        }

        const newDoc = {
          ...doc,
          status: "pending",
          uploadedAt: new Date(),
        };

        profile.upsertDocument(newDoc);
        updatedDocs.push(doc.documentType);
      }

      await profile.save({ session });
      await session.commitTransaction();

      logger.info("📄 Documents processed successfully", {
        userId,
        documents: updatedDocs,
      });

      return profile.toObject();
    } catch (err) {
      await session.abortTransaction();
      logger.error("❌ Document upload transaction failed", {
        userId,
        error: err.message,
      });
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* -------------------------
      GET PROFILE
  ------------------------- */
  async getProfileByUserId(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_ID");
    }

    const profile = await Profile.findOne({ user: userId })
      .populate("user", "email role status")
      .lean();

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

  /* -------------------------
      UPDATE PROFILE (CONTROLLED)
  ------------------------- */
  async updateProfile({ userId, data }) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_ID");
    }

    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found", [], "PROFILE_NOT_FOUND");
    }

    if (profile.isApproved) {
      throw new ApiError(
        403,
        "Approved profiles cannot be modified",
        [],
        "PROFILE_LOCKED",
      );
    }

    const allowedFields = [
      "businessName",
      "contactPerson",
      "phoneNumber",
      "physicalAddress",
      "city",
      "fleetSize",
      "vehicleTypes",
    ];

    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key)) {
        profile[key] = data[key];
      }
    });

    await profile.save();
    logger.info(`✅ Profile JSON updated for user ${userId}`);

    return profile.toObject();
  }

  /* -------------------------
      SUBMIT FOR APPROVAL
  ------------------------- */
  async submitForApproval(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID", [], "INVALID_ID");
    }

    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found", [], "PROFILE_NOT_FOUND");
    }

    if (!profile.isComplete) {
      throw new ApiError(
        400,
        "Profile must be complete before submission",
        [],
        "PROFILE_INCOMPLETE",
      );
    }

    if (profile.isApproved) {
      throw new ApiError(
        400,
        "Profile already approved",
        [],
        "ALREADY_APPROVED",
      );
    }

    if (!profile.documents || profile.documents.length === 0) {
      throw new ApiError(
        400,
        "Documents required before submission",
        [],
        "DOCUMENTS_REQUIRED",
      );
    }

    await User.findByIdAndUpdate(userId, { status: "pending" });
    logger.info(`🚀 Profile ${profile._id} submitted for TAM review`);

    return profile.toObject();
  }

  /* -------------------------
      PUBLIC DIRECTORY
  ------------------------- */
  async getPublicDirectory(filters = {}) {
    const query = { isApproved: true };
    if (filters.city) query.city = filters.city;

    let sortOption = { businessName: 1 };

    if (filters.search) {
      query.$text = { $search: filters.search };
      sortOption = { score: { $meta: "textScore" } };
    }

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
