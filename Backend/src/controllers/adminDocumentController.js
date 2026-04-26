import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import adminDocumentService from "../services/adminDocumentService.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * @desc    Get all profiles that have documents awaiting review
 * @route   GET /api/v1/admin/documents/pending
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
 * @route   PATCH /api/v1/admin/documents/:userId/:docId/approve
 */
export const approveDocument = asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { userId, docId } = req.params;

  if (!adminId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  if (!userId || !docId) {
    throw new ApiError(400, "Invalid request parameters", [], "INVALID_PARAMS");
  }

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId,
    targetUserId: userId,
    documentId: docId,
    status: "approved",
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
 * @route   PATCH /api/v1/admin/documents/:userId/:docId/reject
 */
export const rejectDocument = asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { userId, docId } = req.params;
  const { reason } = req.body;

  if (!adminId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  if (!userId || !docId) {
    throw new ApiError(400, "Invalid request parameters", [], "INVALID_PARAMS");
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    throw new ApiError(
      400,
      "A valid rejection reason is required",
      [],
      "MISSING_REASON",
    );
  }

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId,
    targetUserId: userId,
    documentId: docId,
    status: "rejected",
    reason: reason.trim(),
  });

  logger.info("❌ Document rejected", {
    adminId,
    targetUserId: userId,
    documentId: docId,
    reason: reason.trim(),
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedProfile, "Document rejected successfully"),
    );
});
