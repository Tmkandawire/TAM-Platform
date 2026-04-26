import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import memberService from "../services/memberService.js";
import { profileSchema, updateProfileSchema } from "../dto/memberDto.js";
import { normalizeDocuments } from "../utils/normalizeDocuments.js";

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

  res
    .status(201)
    .json(new ApiResponse(201, profile, "Profile initialized successfully"));
});

/**
 * @desc Upload KYC Documents
 */
export const uploadDocs = asyncHandler(async (req, res) => {
  // 1. Let the utility handle the heavy lifting and validation
  const documents = normalizeDocuments(req.files, req.body);

  // 2. Pass the clean, normalized array to the service
  const profile = await memberService.handleDocumentUpload({
    userId: req.user.id,
    documents,
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, profile, "Documents uploaded and pending review"),
    );
});

/**
 * @desc    Get Current User's Profile
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await memberService.getProfileByUserId(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, profile, "Profile retrieved successfully"));
});

/**
 * @desc    Update Member Profile (JSON Only)
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const validatedData = updateProfileSchema.parse(req.body);

  const updatedProfile = await memberService.updateProfile({
    userId: req.user.id,
    data: validatedData,
  });

  res
    .status(200)
    .json(new ApiResponse(200, updatedProfile, "Profile updated successfully"));
});

/**
 * @desc    Public Directory of approved members
 * @route   GET /api/v1/members/directory
 * @access  Public
 */
export const getDirectory = asyncHandler(async (req, res) => {
  const { city, search, page, limit } = req.query;

  const directory = await memberService.getPublicDirectory({
    city,
    search,
    page,
    limit,
  });

  res
    .status(200)
    .json(new ApiResponse(200, directory, "Directory retrieved successfully"));
});

/**
 * @desc    Submit for Verification
 */
export const submitForVerification = asyncHandler(async (req, res) => {
  const profile = await memberService.submitForApproval(req.user.id);

  res
    .status(200)
    .json(
      new ApiResponse(200, profile, "Profile submitted for TAM verification"),
    );
});
