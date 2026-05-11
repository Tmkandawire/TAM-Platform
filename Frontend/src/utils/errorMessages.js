/**
 * Maps backend typed error codes to user-facing messages.
 * Every code your backend can throw is handled here — no raw codes
 * ever reach the UI.
 */
export const ERROR_MESSAGES = {
  // ── Auth ──────────────────────────────────────────────────────────────
  UNAUTHORIZED: "Please sign in to continue.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  ACCOUNT_LOCKED:
    "Your account has been temporarily locked. Please try again later.",
  ACCOUNT_SUSPENDED:
    "Your account has been suspended. Please contact TAM support.",
  ACCOUNT_PENDING:
    "Your account is pending approval. You will be notified once activated.",
  ACCOUNT_REJECTED:
    "Your application was not approved. Please contact TAM for more information.",
  TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
  TOKEN_INVALID: "Invalid session. Please sign in again.",

  // ── Validation ────────────────────────────────────────────────────────
  INVALID_ID: "Invalid ID format.",
  MISSING_VALUE: "This field is required.",
  INVALID_VALUE: "Please check this field and try again.",
  INVALID_EMAIL: "Please enter a valid email address.",

  // ── File Upload ───────────────────────────────────────────────────────
  INVALID_FILE_TYPE: "Only JPEG, PNG, and PDF files are accepted.",
  INVALID_EXTENSION: "Invalid file extension. Use .jpg, .jpeg, .png, or .pdf.",
  EXTENSION_MIME_MISMATCH:
    "The file type doesn't match its extension. Please check the file hasn't been renamed.",
  INVALID_FILE_CONTENT:
    "The file content doesn't match its declared type. It may be corrupted.",
  FILE_TOO_LARGE: "This file is too large. Maximum size is 25MB.",
  TOO_MANY_FILES: "Too many files. Please upload one file per document type.",
  INVALID_FIELD:
    "Unexpected document field. Please use the correct upload area.",
  MISSING_DOCS: "Please upload at least one document.",
  UPLOAD_ERROR: "Upload failed. Please try again.",

  // ── Documents ─────────────────────────────────────────────────────────
  DOCUMENT_NOT_FOUND: "Document not found.",
  INVALID_DOC_TYPE: "Invalid document type.",
  INVALID_DOCUMENT_STRUCTURE:
    "Document data is malformed. Please try uploading again.",
  INVALID_DATE: "Invalid date format.",
  MISSING_ISSUE_DATE: "Utility bills require an issue date.",
  UTILITY_EXPIRED: "Your utility bill must be less than 3 months old.",
  MISSING_EXPIRY_DATE: "National ID requires an expiry date.",
  NORMALIZATION_ERROR: "Document processing failed. Please try again.",

  // ── Bulk Actions ──────────────────────────────────────────────────────
  INVALID_BULK_PAYLOAD: "Invalid bulk action request.",
  INVALID_REVIEW: "This document cannot be reviewed in its current state.",
  BULK_TRANSACTION_FAILED: "Some documents could not be processed.",

  // ── Rate Limiting ─────────────────────────────────────────────────────
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",

  // ── Infrastructure ────────────────────────────────────────────────────
  REDIS_UNAVAILABLE:
    "Service temporarily unavailable. Please try again shortly.",
  SMTP_UNAVAILABLE: "Email service is temporarily unavailable.",
  CLOUDINARY_UNAVAILABLE: "File storage service is temporarily unavailable.",

  // ── Generic fallback ──────────────────────────────────────────────────
  INTERNAL_ERROR: "Something went wrong on our end. Please try again.",
};

/**
 * Resolves a backend error response to a display message.
 * Tries error.code first, then falls back to error.message,
 * then falls back to a generic message.
 *
 * @param {unknown} error - Axios error or plain error object
 * @returns {string}
 */
export function resolveErrorMessage(error) {
  // Axios error with a backend response
  const data = error?.response?.data;

  if (data?.code && ERROR_MESSAGES[data.code]) {
    return ERROR_MESSAGES[data.code];
  }

  // Backend sent a message directly
  if (data?.message && typeof data.message === "string") {
    return data.message;
  }

  // Network error (no response)
  if (error?.code === "ERR_NETWORK") {
    return "Unable to connect. Please check your internet connection.";
  }

  // Timeout
  if (error?.code === "ECONNABORTED") {
    return "Request timed out. Please try again.";
  }

  return ERROR_MESSAGES.INTERNAL_ERROR;
}
