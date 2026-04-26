import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import memberService from "../services/memberService.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * @desc    Upload & Process KYC Documents
 * @route   POST /api/v1/documents/upload
 * @access  Private
 */
export const uploadKYCDocuments = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  // 🔒 Defensive check (should never fail, but production-safe)
  if (!userId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  // 🔍 Validate normalized docs (from transform middleware)
  const documents = req.normalizedDocs;

  if (!Array.isArray(documents) || documents.length === 0) {
    throw new ApiError(
      400,
      "No valid documents were processed",
      [],
      "MISSING_DOCS",
    );
  }

  // 🚀 Delegate to service layer
  const profile = await memberService.handleDocumentUpload({
    userId,
    documents,
  });

  // 📊 Structured logging (important for audits later)
  logger.info("📄 KYC upload processed", {
    userId,
    documentTypes: documents.map((d) => d.documentType),
    count: documents.length,
  });

  // ✅ Standard response
  res
    .status(200)
    .json(
      new ApiResponse(200, profile, "Documents uploaded and pending review"),
    );
});
