import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import adminDocumentService from "../services/adminDocumentService.js";

/**
 * @desc    Get review queue (filtered + prioritized)
 */
export const getPendingDocuments = asyncHandler(async (req, res) => {
  // ✅ Always use validated & sanitized input
  const query = req.query;

  const result = await adminDocumentService.getPendingReviews({
    page: query.page,
    limit: query.limit,
    status: query.status,
    documentType: query.documentType,
    priority: query.priority,
    sortBy: query.sortBy,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Review queue fetched successfully"));
});

/**
 * @desc    Approve document
 */
export const approveDocument = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId: req.user.id,
    targetUserId: userId,
    documentId: docId,
    status: "approved",
    ip: extractClientIp(req),
    userAgent: req.get("user-agent") || "unknown",
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedProfile, "Document approved successfully"),
    );
});

/**
 * @desc    Reject document
 */
export const rejectDocument = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  const updatedProfile = await adminDocumentService.updateDocumentStatus({
    adminId: req.user.id,
    targetUserId: userId,
    documentId: docId,
    status: "rejected",
    reason: req.body.reason,
    ip: extractClientIp(req),
    userAgent: req.get("user-agent") || "unknown",
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedProfile, "Document rejected successfully"),
    );
});

/* -------------------------
   HELPER (Enterprise Safe)
------------------------- */
const extractClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
};
