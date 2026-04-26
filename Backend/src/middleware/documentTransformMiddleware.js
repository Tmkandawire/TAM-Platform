import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { normalizeDocuments } from "../utils/normalizeDocuments.js";

/**
 * Transforms raw Multer files into a normalized array for the Service layer.
 * Enforces structure + compliance rules (e.g., utility bill age).
 */
export const transformDocuments = asyncHandler(async (req, res, next) => {
  const userId = req.user?.id;

  // 🔒 Defensive: ensure auth context exists
  if (!userId) {
    throw new ApiError(401, "Unauthorized", [], "UNAUTHORIZED");
  }

  // 📦 No files uploaded
  if (!req.files || Object.keys(req.files).length === 0) {
    req.normalizedDocs = [];
    return next();
  }

  try {
    // 🧹 Optional: sanitize metadata (basic trim)
    const metadata = {};
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        metadata[key] = req.body[key].trim();
      }
    }

    // 🔄 Normalize documents
    const normalized = normalizeDocuments(req.files, metadata);

    // 🚨 Strict validation of output
    if (!Array.isArray(normalized)) {
      throw new ApiError(
        500,
        "Document normalization failed",
        [],
        "NORMALIZATION_ERROR",
      );
    }

    if (normalized.length === 0) {
      throw new ApiError(
        400,
        "No valid documents after processing",
        [],
        "INVALID_DOCUMENTS",
      );
    }

    // 🔍 Validate required fields per document
    normalized.forEach((doc) => {
      if (!doc.documentType || !doc.url || !doc.publicId) {
        throw new ApiError(
          400,
          "Malformed document data",
          [],
          "INVALID_DOCUMENT_STRUCTURE",
        );
      }
    });

    // 📊 Attach to request
    req.normalizedDocs = normalized;

    // 📈 Logging (critical for audit/debug)
    logger.info("📄 Documents transformed", {
      userId,
      count: normalized.length,
      types: normalized.map((d) => d.documentType),
    });

    next();
  } catch (err) {
    logger.error("❌ Document transformation failed", {
      userId,
      error: err.message,
    });

    throw err;
  }
});
