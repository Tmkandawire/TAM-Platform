import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import adminDocumentService from "../services/adminDocumentService.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * @desc    Get all profiles that have documents awaiting review
 */
export const getPendingDocuments = asyncHandler(async (req, res) => {
  const adminId = req.user?.id;

  if (!adminId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  const pendingProfiles = await adminDocumentService.getPendingReviews();

  logger.info("📋 Admin fetched pending document reviews", {
    adminId,
    count: pendingProfiles?.length || 0,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        pendingProfiles,
        "Pending reviews fetched successfully",
      ),
    );
});

/**
 * @desc    Approve a specific document
 */
export const approveDocument = asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { userId, docId } = req.params;

  if (!adminId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  // NOTE: You can remove manual ID checks here if your DTO/Middleware is already doing it

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId,
    targetUserId: userId,
    documentId: docId,
    status: "approved",
    // 👇 ADD THIS FOR AUDIT LOGGING
    requestMeta: {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });

  logger.info("✅ Document approved", {
    adminId,
    targetUserId: userId,
    documentId: docId,
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedProfile, "Document approved successfully"),
    );
});

/**
 * @desc    Reject a specific document with a reason
 */
export const rejectDocument = asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { userId, docId } = req.params;
  const { reason } = req.body;

  if (!adminId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  // NOTE: Validation for 'reason' is now handled by your rejectDocumentSchema DTO
  // You can keep this as a secondary check or lean entirely on the DTO.

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId,
    targetUserId: userId,
    documentId: docId,
    status: "rejected",
    reason: reason.trim(),
    // 👇 ADD THIS FOR AUDIT LOGGING
    requestMeta: {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });

  logger.info("❌ Document rejected", {
    adminId,
    targetUserId: userId,
    reason: reason.trim(),
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedProfile, "Document rejected successfully"),
    );
});
