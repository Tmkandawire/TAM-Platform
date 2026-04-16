import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import memberService from "../services/memberService.js";
import { profileSchema, updateProfileSchema } from "../dtos/memberDto.js";

/**
 * @desc    Create or Update Member Profile
 * @route   POST /api/v1/members/profile
 * @access  Private
 */
export const upsertProfile = asyncHandler(async (req, res) => {
  // 1. Validate incoming data against DTO
  const validatedData = profileSchema.parse(req.body);

  // 2. Call service to handle logic
  const profile = await memberService.createProfile(validatedData, req.user.id);

  // 3. Return standardized response
  res
    .status(201)
    .json(new ApiResponse(201, profile, "Profile created successfully"));
});

/**
 * @desc    Get Current User's Profile
 * @route   GET /api/v1/members/me
 * @access  Private
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await memberService.getProfileByUserId(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, profile, "Profile retrieved successfully"));
});

/**
 * @desc    Update Member Profile
 * @route   PATCH /api/v1/members/profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req, res) => {
  // 1. Validate partial data
  const validatedData = updateProfileSchema.parse(req.body);

  // 2. Call service for update logic
  const updatedProfile = await memberService.updateProfile(
    req.user.id,
    validatedData,
  );

  res
    .status(200)
    .json(new ApiResponse(200, updatedProfile, "Profile updated successfully"));
});

/**
 * @desc    Get Approved Member Directory (Public)
 * @route   GET /api/v1/members/directory
 * @access  Public
 */
export const getDirectory = asyncHandler(async (req, res) => {
  const { city, search } = req.query;

  const directory = await memberService.getPublicDirectory({ city, search });

  res
    .status(200)
    .json(new ApiResponse(200, directory, "Directory retrieved successfully"));
});

/**
 * @desc    Submit Profile for Admin Verification
 * @route   POST /api/v1/members/submit
 * @access  Private
 */
export const submitForVerification = asyncHandler(async (req, res) => {
  const profile = await memberService.submitForApproval(req.user.id);

  res
    .status(200)
    .json(
      new ApiResponse(200, profile, "Profile submitted for TAM verification"),
    );
});
