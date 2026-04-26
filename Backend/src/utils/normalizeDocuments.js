import ApiError from "../utils/ApiError.js";

const ALLOWED_DOCUMENT_TYPES = [
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

export const normalizeDocuments = (files, metadata = {}) => {
  if (!files || Object.keys(files).length === 0) {
    throw new ApiError(400, "No documents uploaded", [], "EMPTY_UPLOAD");
  }

  const normalized = [];

  for (const fieldName of Object.keys(files)) {
    if (!ALLOWED_DOCUMENT_TYPES.includes(fieldName)) {
      throw new ApiError(
        400,
        `Invalid document type: ${fieldName}`,
        [],
        "INVALID_DOC_TYPE",
      );
    }

    const file = files[fieldName][0];

    if (!file?.path || !file?.filename) {
      throw new ApiError(
        500,
        "File upload failed (Cloudinary)",
        [],
        "UPLOAD_FAILURE",
      );
    }

    const expiryRaw = metadata[`${fieldName}_expiryDate`];
    const issueRaw = metadata[`${fieldName}_issueDate`];

    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
    const issueDate = issueRaw ? new Date(issueRaw) : null;

    // Validate dates
    if (expiryRaw && isNaN(expiryDate)) {
      throw new ApiError(
        400,
        `${fieldName} has invalid expiryDate`,
        [],
        "INVALID_DATE",
      );
    }
    if (issueRaw && isNaN(issueDate)) {
      throw new ApiError(
        400,
        `${fieldName} has invalid issueDate`,
        [],
        "INVALID_DATE",
      );
    }

    // Business Rules (Malawi Compliance)
    if (fieldName === "utilityBill") {
      if (!issueDate)
        throw new ApiError(
          400,
          "Utility bill requires issueDate",
          [],
          "MISSING_ISSUE_DATE",
        );

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      if (issueDate < threeMonthsAgo) {
        throw new ApiError(
          400,
          "Utility bill must be less than 3 months old",
          [],
          "UTILITY_EXPIRED",
        );
      }
    }

    if (fieldName === "nationalId" && !expiryDate) {
      throw new ApiError(
        400,
        "National ID requires expiryDate",
        [],
        "MISSING_EXPIRY_DATE",
      );
    }

    normalized.push({
      documentType: fieldName,
      url: file.path,
      publicId: file.filename,
      expiryDate,
      issueDate,
    });
  }

  return normalized;
};
