import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import memberService from "../services/memberService.js";
import auditService from "../services/auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { profileSchema, updateProfileSchema } from "../dto/memberDto.js";
import { normalizeDocuments } from "../utils/normalizeDocuments.js";
import { ValidationError } from "../errors/index.js";
import logger from "../utils/logger.js";
import Profile from "../models/Profile.js";
import { v2 as cloudinary } from "cloudinary";
import { NotFoundError } from "../errors/index.js";

/**
 * @desc    Create Member Profile (JSON Only)
 * @route   POST /api/v1/members/profile
 */
export const upsertProfile = asyncHandler(async (req, res) => {
  const validatedData = profileSchema.parse(req.body);

  const profile = await memberService.createProfile({
    userId: req.user.id,
    data: validatedData,
  });

  logger.info("Member profile created", {
    userId: req.user.id,
    profileId: profile._id,
    requestId: req.context?.requestId,
  });

  await auditService.log({
    action: AUDIT_ACTIONS.PROFILE_CREATED,
    actorId: req.user.id,
    targetId: profile._id,
    targetType: "profile",
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    status: "SUCCESS",
  });

  const response = ApiResponse.created(
    profile,
    "Profile initialized successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Upload KYC Documents
 * @route   POST /api/v1/members/documents
 */
export const uploadDocs = asyncHandler(async (req, res) => {
  // Guard against missing or empty files before passing to normalizeDocuments.
  // Multer handles type/size — this guard ensures the controller boundary is
  // explicit about what it expects rather than letting the utility throw
  // an opaque error on undefined input.
  if (!req.files || Object.keys(req.files).length === 0) {
    throw ValidationError.dto(
      "files",
      "At least one file is required.",
      "MISSING_FILES",
    );
  }

  const documents = normalizeDocuments(req.files, req.body);

  const profile = await memberService.handleDocumentUpload({
    userId: req.user.id,
    documents,
  });

  logger.info("KYC documents uploaded", {
    userId: req.user.id,
    documentCount: documents.length,
    requestId: req.context?.requestId,
  });

  await auditService.log({
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    actorId: req.user.id,
    targetId: profile._id,
    targetType: "document",
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { documentCount: documents.length },
    status: "SUCCESS",
  });

  const response = ApiResponse.ok(
    profile,
    "Documents uploaded and pending review.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Get Current User's Profile
 * @route   GET /api/v1/members/profile
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await memberService.getProfileByUserId(req.user.id);

  const response = ApiResponse.ok(profile, "Profile retrieved successfully.");
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Update Member Profile (JSON Only)
 * @route   PATCH /api/v1/members/profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const validatedData = updateProfileSchema.parse(req.body);

  const updatedProfile = await memberService.updateProfile({
    userId: req.user.id,
    data: validatedData,
  });

  logger.info("Member profile updated", {
    userId: req.user.id,
    profileId: updatedProfile._id,
    requestId: req.context?.requestId,
  });

  await auditService.log({
    action: AUDIT_ACTIONS.PROFILE_UPDATED,
    actorId: req.user.id,
    targetId: updatedProfile._id,
    targetType: "profile",
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    status: "SUCCESS",
  });

  const response = ApiResponse.ok(
    updatedProfile,
    "Profile updated successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Upload or replace profile picture
 * @route   POST /api/v1/members/profile/picture
 */
export const updateProfilePicture = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { secure_url, public_id } = req.cloudinaryResult;

  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    throw NotFoundError.profile(userId);
  }

  // Delete previous image if it exists
  if (profile.profilePicturePublicId) {
    try {
      await cloudinary.uploader.destroy(profile.profilePicturePublicId);
    } catch (err) {
      logger.warn("Failed to delete old profile picture from Cloudinary", {
        publicId: profile.profilePicturePublicId,
        error: err.message,
      });
    }
  }

  profile.profilePicture = secure_url;
  profile.profilePicturePublicId = public_id;

  await profile.save();

  const response = ApiResponse.ok(
    { profilePicture: secure_url },
    "Profile picture updated.",
  );

  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Remove profile picture
 * @route   DELETE /api/v1/members/profile/picture
 */
export const removeProfilePicture = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    throw NotFoundError.profile(userId);
  }

  if (profile.profilePicturePublicId) {
    try {
      await cloudinary.uploader.destroy(profile.profilePicturePublicId);
    } catch (err) {
      logger.warn("Failed to delete profile picture from Cloudinary", {
        publicId: profile.profilePicturePublicId,
        error: err.message,
      });
    }
  }

  profile.profilePicture = null;
  profile.profilePicturePublicId = null;

  await profile.save();

  const response = ApiResponse.ok(null, "Profile picture removed.");

  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Public Directory of approved members
 * @route   GET /api/v1/members/directory
 * @access  Public
 */
export const getDirectory = asyncHandler(async (req, res) => {
  // Coerce query strings to integers before passing to service.
  // req.query values are always strings — the service guards against
  // bad values but expects the controller to own the HTTP boundary.
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const { city, search } = req.query;

  const { data, pagination } = await memberService.getPublicDirectory({
    city,
    search,
    page,
    limit,
  });

  // pagination.pages (service-computed) is intentionally dropped here.
  // ApiResponse.paginated() / ApiResponse.empty() own all derived pagination
  // fields (totalPages, hasNextPage, hasPrevPage).
  if (data.length === 0) {
    const response = ApiResponse.empty(
      { page: pagination.page, limit: pagination.limit },
      "No members found.",
    );
    return res.status(response.statusCode).json(response);
  }

  const response = ApiResponse.paginated(
    data,
    { total: pagination.total, page: pagination.page, limit: pagination.limit },
    "Directory retrieved successfully.",
  );
  return res.status(response.statusCode).json(response);
});

/**
 * @desc    Submit for Verification
 * @route   POST /api/v1/members/submit
 */
export const submitForVerification = asyncHandler(async (req, res) => {
  const profile = await memberService.submitForApproval(req.user.id);

  logger.info("Profile submitted for verification", {
    userId: req.user.id,
    profileId: profile._id,
    requestId: req.context?.requestId,
  });

  await auditService.log({
    action: AUDIT_ACTIONS.PROFILE_SUBMITTED,
    actorId: req.user.id,
    targetId: profile._id,
    targetType: "profile",
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    status: "SUCCESS",
  });

  const response = ApiResponse.ok(
    profile,
    "Profile submitted for TAM verification.",
  );
  return res.status(response.statusCode).json(response);
});
