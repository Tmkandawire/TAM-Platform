/**
 * @file normalizeDocuments.js
 * @module utils/normalizeDocuments
 *
 * Pure transformation utility — converts raw Multer file objects into the
 * normalized document structure consumed by the service layer.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Iterate the files map produced by cloudinaryUploadMiddleware
 * - Validate and parse optional date metadata per document type
 * - Enforce Malawi-specific compliance rules (utility bill age,
 *   national ID expiry requirement)
 * - Return a normalized Array<NormalizedDocument> for the service layer
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - File presence validation   → cloudinaryUploadMiddleware / controller
 * - Field name validation      → cloudinaryUploadMiddleware (Layer 1)
 * - MIME / extension checks    → cloudinaryUploadMiddleware (Layers 1.5–3)
 * - Request context / logging  → transformDocuments middleware
 * - Persistence                → adminDocumentService
 *
 * Error contract
 * ─────────────────────────────────────────────
 * This function throws typed errors only — never raw ApiError.
 *
 *  ValidationError (400) — bad input the client can correct (invalid date,
 *                          missing required field, expired document)
 *
 *  InternalError   (500) — platform fault the client cannot correct.
 *                          Two scenarios:
 *                          1. Cloudinary returned a file record without
 *                             path/filename (CLOUDINARY_UPLOAD_FAILURE)
 *                          2. The normalization loop produced a result
 *                             that violates the output contract
 *                             (NORMALIZATION_FAILURE)
 *                          Both set isOperational: false to signal to
 *                          errorMiddleware that investigation is required.
 *
 * Callers (transformDocuments middleware) distinguish between these by
 * instanceof InternalError — 400 errors log at warn, 500 errors log at
 * error before both are forwarded to errorMiddleware.
 *
 * Document field source of truth
 * ─────────────────────────────────────────────
 * DOCUMENT_FIELDS is imported from cloudinaryUploadMiddleware — it is the
 * single authoritative definition of accepted field names. This file does
 * NOT maintain its own copy. Any new document type added to
 * cloudinaryUploadMiddleware is automatically accepted here.
 *
 * Date parsing and timezone
 * ─────────────────────────────────────────────
 * Dates are parsed with new Date(rawValue). When rawValue is a date-only
 * string (e.g. "2024-01-15"), the Date constructor treats it as UTC
 * midnight, which may produce an off-by-one-day result when compared
 * against local-timezone Date objects (e.g. new Date() for the cutoff).
 *
 * For a Malawi compliance system where documents are issued locally:
 *  - Require clients to submit ISO 8601 date-time strings with timezone
 *    offset (e.g. "2024-01-15T00:00:00+02:00") to eliminate ambiguity.
 *  - OR normalise all comparisons to UTC explicitly.
 * Acceptable at current scale. Revisit before multi-timezone deployment
 * or if compliance audits require date precision guarantees.
 *
 * @typedef {Object} NormalizedDocument
 * @property {string}    documentType
 * @property {string}    url           — Cloudinary secure URL (file.path)
 * @property {string}    publicId      — Cloudinary public ID (file.filename)
 * @property {Date|null} expiryDate
 * @property {Date|null} issueDate
 */

import { ValidationError } from "../errors/index.js";
import { InternalError } from "../errors/InternalError.js";
import { DOCUMENT_FIELDS } from "../middleware/cloudinaryUploadMiddleware.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Metadata key suffixes used to extract per-document dates from req.body.
 * Full key is constructed as `${fieldName}_${METADATA_KEYS.expiry}` etc.
 */
const METADATA_KEYS = Object.freeze({
  expiry: "expiryDate",
  issue: "issueDate",
});

/**
 * Maximum age of a utility bill in months (Malawi compliance rule).
 * Centralised here so the business rule is never a magic number buried
 * in conditional logic.
 */
const UTILITY_BILL_MAX_AGE_MONTHS = 3;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Parses a raw date string into a Date object.
 *
 * Returns null when rawValue is absent or empty — optional date fields
 * are valid when omitted. Throws ValidationError when the value is
 * present but produces an invalid Date.
 *
 * See module header for timezone assumptions and remediation guidance.
 *
 * @param {string|undefined} rawValue   — Raw string from sanitized metadata.
 * @param {string}           fieldName  — Document field name for error context.
 * @param {string}           dateName   — "expiryDate" or "issueDate".
 * @returns {Date|null}
 * @throws {ValidationError}
 */
function parseDateField(rawValue, fieldName, dateName) {
  if (!rawValue || rawValue.trim().length === 0) return null;

  const parsed = new Date(rawValue);

  if (isNaN(parsed.getTime())) {
    throw ValidationError.dto(
      `${fieldName}_${dateName}`,
      `"${fieldName}" has an invalid ${dateName}. Provide a valid ISO 8601 date string.`,
      "INVALID_DATE",
    );
  }

  return parsed;
}

/**
 * Enforces Malawi-specific compliance rules for a single document.
 *
 * Rules:
 *  - utilityBill → issueDate required, must be within the last
 *                  UTILITY_BILL_MAX_AGE_MONTHS months
 *  - nationalId  → expiryDate required
 *
 * Additional compliance rules for future document types should be added
 * here as new cases — do not scatter business rules across callers.
 *
 * @param {string}    fieldName
 * @param {Date|null} expiryDate
 * @param {Date|null} issueDate
 * @throws {ValidationError}
 */
function enforceComplianceRules(fieldName, expiryDate, issueDate) {
  if (fieldName === "utilityBill") {
    if (!issueDate) {
      throw ValidationError.dto(
        `${fieldName}_issueDate`,
        "Utility bill requires an issueDate to verify it is within the accepted age limit.",
        "MISSING_ISSUE_DATE",
      );
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - UTILITY_BILL_MAX_AGE_MONTHS);

    if (issueDate < cutoff) {
      throw ValidationError.dto(
        `${fieldName}_issueDate`,
        `Utility bill must be less than ${UTILITY_BILL_MAX_AGE_MONTHS} months old. ` +
          "Please provide a more recent document.",
        "UTILITY_BILL_EXPIRED",
      );
    }
  }

  if (fieldName === "nationalId" && !expiryDate) {
    throw ValidationError.dto(
      `${fieldName}_expiryDate`,
      "National ID requires an expiryDate.",
      "MISSING_EXPIRY_DATE",
    );
  }
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */

/**
 * Transforms raw Multer files and sanitized metadata into a normalized
 * document array for the service layer.
 *
 * Assumes field name and MIME validation have already been enforced by
 * cloudinaryUploadMiddleware. Does NOT re-validate those constraints —
 * defence-in-depth applies at the boundary, not at every internal layer.
 *
 * @param {Object.<string, Express.Multer.File[]>} files
 *   The req.files object from multer — keys are field names, values are
 *   arrays of file objects (maxCount: 1 per field in this schema).
 *
 * @param {Object.<string, string>} [metadata={}]
 *   Sanitized key/value pairs from req.body (strings only, pre-trimmed).
 *   Date fields extracted by convention: `${fieldName}_expiryDate`,
 *   `${fieldName}_issueDate`.
 *
 * @returns {NormalizedDocument[]}
 *   One entry per uploaded file. Order follows Object.keys(files).
 *
 * @throws {ValidationError} Invalid date, missing required date,
 *   expired document (client-correctable, 400).
 * @throws {InternalError}   Cloudinary file record missing path/filename,
 *   or normalization output violates the output contract (500,
 *   isOperational: false).
 */
export const normalizeDocuments = (files, metadata = {}) => {
  const normalized = [];

  for (const fieldName of Object.keys(files)) {
    // ── Field name guard ─────────────────────────────────────────────────
    // cloudinaryUploadMiddleware enforces this at the HTTP boundary.
    // This is a defence-in-depth guard for callers that bypass the
    // middleware in tests or internal scripts — not the primary check.
    if (!DOCUMENT_FIELDS.has(fieldName)) {
      throw ValidationError.dto(
        fieldName,
        `"${fieldName}" is not a recognised document field.`,
        "INVALID_DOC_TYPE",
      );
    }

    // ── File array guard ─────────────────────────────────────────────────
    // multer populates files[fieldName] as an array (maxCount: 1).
    // This guard makes that implicit assumption explicit — if the array
    // is absent or empty, the upload did not complete as expected and
    // the fault lies with the platform, not the client.
    const fileArray = files[fieldName];

    if (!Array.isArray(fileArray) || fileArray.length === 0) {
      throw InternalError.normalizationFailure(
        `files["${fieldName}"] is expected to be a non-empty array ` +
          `but received ${JSON.stringify(fileArray)}.`,
      );
    }

    // ── File record integrity ────────────────────────────────────────────
    // file.path     → Cloudinary secure URL (set by multer-storage-cloudinary)
    // file.filename → Cloudinary public ID
    //
    // Both must be present. Absence means Cloudinary did not return the
    // expected upload result — platform fault, not a client error.
    // InternalError (isOperational: false) signals to errorMiddleware
    // that this requires investigation rather than a client-facing message.
    const file = fileArray[0];

    if (!file?.path || !file?.filename) {
      throw InternalError.cloudinaryFailure(fieldName);
    }

    // ── Date parsing ─────────────────────────────────────────────────────
    const expiryDate = parseDateField(
      metadata[`${fieldName}_${METADATA_KEYS.expiry}`],
      fieldName,
      METADATA_KEYS.expiry,
    );

    const issueDate = parseDateField(
      metadata[`${fieldName}_${METADATA_KEYS.issue}`],
      fieldName,
      METADATA_KEYS.issue,
    );

    // ── Compliance rules ─────────────────────────────────────────────────
    enforceComplianceRules(fieldName, expiryDate, issueDate);

    // ── Normalize ────────────────────────────────────────────────────────
    normalized.push({
      documentType: fieldName,
      url: file.path,
      publicId: file.filename,
      expiryDate,
      issueDate,
    });
  }

  // ── Output contract guard ────────────────────────────────────────────────
  // The loop must produce an array. This guard defends against unexpected
  // mutations or future refactors that change the output shape without
  // updating callers. If this fires, the fault is in this utility, not
  // in the client input — InternalError.normalizationFailure is correct.
  if (!Array.isArray(normalized)) {
    throw InternalError.normalizationFailure(
      `Expected normalized output to be an array, received ${typeof normalized}.`,
    );
  }

  return normalized;
};
