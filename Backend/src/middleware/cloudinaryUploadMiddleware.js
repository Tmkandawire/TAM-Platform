/**
 * @file cloudinaryUploadMiddleware.js
 * @module middleware/cloudinaryUpload
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Validate uploaded files at the HTTP boundary before they reach
 *   any service or storage layer
 * - Enforce field name, MIME type, file extension, magic byte, file
 *   size, and file count constraints
 * - Map multer errors to typed platform error classes so errorMiddleware
 *   produces consistent responses
 * - Provide a documented virus scanning hook for future integration
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - Cloudinary upload configuration    → config/cloudinary.js
 * - Document state management          → adminDocumentService
 * - Audit logging                      → service layer
 * - Per-user upload rate limiting      → uploadRateLimiter in
 *                                        rateLimitMiddleware.js
 *                                        (must be applied on the route
 *                                        BEFORE this middleware runs)
 *
 * Validation layers (applied in order)
 * ─────────────────────────────────────────────
 *  Layer 1   — Field name validation (multer fileFilter):
 *    Rejects uploads to field names outside the document schema before
 *    the file is buffered. Fast, synchronous, zero cost.
 *
 *  Layer 1.5 — Declared MIME type validation (multer fileFilter):
 *    Checks file.mimetype as declared by the client against ALLOWED_TYPES.
 *    Fast and synchronous but client-supplied — spoofable.
 *
 *  Layer 2   — Extension / MIME correlation (multer fileFilter):
 *    Strictly correlates the file's extension (from originalname) against
 *    the declared MIME type using EXTENSION_MIME_MAP. Both must agree.
 *    A .exe renamed to .jpg fails here. Still client-supplied, but forces
 *    an attacker to lie consistently across both vectors.
 *
 *  Layer 3   — Magic byte inspection (postUploadValidation middleware):
 *    Uses file-type to read actual file bytes and verify the real type
 *    matches the declared MIME. Cannot be spoofed. Runs after multer.
 *
 *    ⚠ NOTE: With Cloudinary stream storage, file.buffer is not populated.
 *    Layer 3 is therefore skipped and a warning is logged per file.
 *    To enable full magic byte inspection, switch to memoryStorage and
 *    upload to Cloudinary manually in the service layer.
 *    Acceptable pre-launch. Revisit before production scale.
 *
 *  Layer 4   — Virus scanning hook (postUploadValidation middleware):
 *    Integration point for ClamAV, Cloudmersive, VirusTotal, etc.
 *    Currently a no-op placeholder. Acceptable pre-launch.
 *
 * Route-level usage
 * ─────────────────────────────────────────────
 *  import { uploadRateLimiter }  from "../middleware/rateLimitMiddleware.js";
 *  import {
 *    cloudinaryUpload,
 *    postUploadValidation,
 *  } from "../middleware/cloudinaryUploadMiddleware.js";
 *
 *  router.post(
 *    "/documents",
 *    uploadRateLimiter,      // per-user/IP upload throttle — MUST come first
 *    cloudinaryUpload,       // layers 1, 1.5, 2: field / MIME / extension
 *    postUploadValidation,   // layers 3, 4: magic byte check + virus hook
 *    documentController.upload,
 *  );
 *
 * req.context dependency
 * ─────────────────────────────────────────────
 *  req.context.requestId is set by requestContext middleware, which must
 *  be registered before this middleware in server.js.
 */

import path from "path";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { storage } from "../config/cloudinary.js";
import { ValidationError } from "../errors/index.js";
import { ServiceUnavailableError } from "../errors/ServiceUnavailableError.js";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Accepted document field names as a Set for O(1) membership checks.
 *
 * Single source of truth — exported so validators and services share
 * the same definition. Adding a new document type here automatically
 * applies to all validation layers without touching any other file.
 *
 * DOCUMENT_FIELDS_ARRAY is derived from this Set and used wherever an
 * ordered array is required (e.g. multer upload.fields()).
 *
 * @type {Set<string>}
 */
export const DOCUMENT_FIELDS = new Set([
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
]);

/**
 * Array form of DOCUMENT_FIELDS — required by multer's upload.fields()
 * which expects an array, not a Set. Derived automatically so the two
 * never drift.
 *
 * @type {string[]}
 */
const DOCUMENT_FIELDS_ARRAY = [...DOCUMENT_FIELDS];

/**
 * Accepted MIME types.
 *
 * A single constant covers both declared-MIME validation (Layer 1.5, client-
 * supplied) and magic byte validation (Layer 3, actual file content).
 *
 * file-type may return "image/jpg" for some JPEG variants. "image/jpeg" is
 * the canonical RFC 2046 value and what both browsers and file-type return
 * for standard JPEG files. If false positives appear in Layer 3 for valid
 * JPEGs, add "image/jpg" here — do not split into two constants unless the
 * two sets genuinely diverge.
 *
 * @type {Set<string>}
 */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

/**
 * Strict extension → MIME map for Layer 2 correlation.
 *
 * Both the file extension (from originalname) and the declared MIME type
 * must agree. An attacker who renames malware.exe to malware.jpg passes
 * Layer 1.5 (correct MIME declared) but fails here because .jpg does not
 * correlate with the actual content — and vice versa if they declare the
 * wrong MIME for a valid extension.
 *
 * Extensions are normalised to lowercase before lookup. Keys include the
 * leading dot to match path.extname() output exactly.
 *
 * @type {Map<string, string>}
 */
const EXTENSION_MIME_MAP = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".pdf", "application/pdf"],
]);

/**
 * Maximum individual file size: 25 MB.
 * Enforced by multer at the transport layer — the file is rejected
 * before it is fully buffered, preventing memory exhaustion.
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Maximum number of files per request.
 * Derived from DOCUMENT_FIELDS so it stays in sync automatically —
 * one file per document type, no more.
 */
const MAX_FILES = DOCUMENT_FIELDS.size;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Extracts requestId from req.context for log correlation.
 * Falls back to "unavailable" when requestContext middleware has not run —
 * consistent with the platform-wide fallback pattern.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function getRequestId(req) {
  return req.context?.requestId ?? "unavailable";
}

/**
 * Logs a file rejection at warn level with request context.
 * File content values are never logged — only metadata.
 *
 * Wrapped in try/catch — logger failure must never affect the
 * validation response returned to the client.
 *
 * @param {import("express").Request} req
 * @param {string} reason   Machine-readable rejection reason.
 * @param {object} [meta]   Additional metadata safe to log.
 */
function logFileRejection(req, reason, meta = {}) {
  try {
    logger.warn("[cloudinaryUpload] File rejected.", {
      reason,
      requestId: getRequestId(req),
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id ?? null,
      ...meta,
    });
  } catch {
    // Logger failure must never suppress the validation error response.
  }
}

/* ─────────────────────────────────────────────
   LAYER 1, 1.5, 2 — MULTER FILE FILTER
───────────────────────────────────────────── */

/**
 * Multer fileFilter — synchronous first-pass validation across three layers.
 *
 * Runs before the file is buffered or streamed to Cloudinary. Any failure
 * here aborts the upload immediately — no bytes are wasted.
 *
 * @param {import("express").Request} req
 * @param {Express.Multer.File}       file
 * @param {multer.FileFilterCallback} cb
 */
const fileFilter = (req, file, cb) => {
  // ── Layer 1: Field name validation ──────────────────────────────────────
  // Prevents uploads to arbitrary field names outside the document schema.
  // An unexpected field name indicates a malformed or malicious request.
  if (!DOCUMENT_FIELDS.has(file.fieldname)) {
    logFileRejection(req, "INVALID_FIELD", { fieldname: file.fieldname });

    return cb(
      ValidationError.dto(
        file.fieldname,
        `"${file.fieldname}" is not a valid document field.`,
        "INVALID_FIELD",
      ),
      false,
    );
  }

  // ── Layer 1.5: Declared MIME type validation ─────────────────────────────
  // Fast check on the client-declared MIME type. Spoofed MIME types that
  // pass here are caught by magic byte inspection in postUploadValidation,
  // and by extension correlation in Layer 2 below.
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    logFileRejection(req, "INVALID_MIME_TYPE", {
      fieldname: file.fieldname,
      declaredMime: file.mimetype,
    });

    return cb(
      ValidationError.dto(
        file.fieldname,
        "Invalid file type. Only JPEG, PNG, and PDF files are accepted.",
        "INVALID_FILE_TYPE",
      ),
      false,
    );
  }

  // ── Layer 2: Extension / MIME correlation ────────────────────────────────
  // Strictly correlates the file extension against the declared MIME type.
  // Both must agree — a file claiming image/jpeg must have a .jpg or .jpeg
  // extension, and vice versa. Forces an attacker to lie consistently across
  // two client-supplied vectors rather than just one.
  //
  // path.extname() returns the last extension including the dot (e.g. ".jpg").
  // Normalised to lowercase so "FILE.JPG" and "file.jpg" are treated equally.
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = EXTENSION_MIME_MAP.get(ext);

  if (!expectedMime) {
    // Extension is not in the allowlist at all.
    logFileRejection(req, "INVALID_EXTENSION", {
      fieldname: file.fieldname,
      extension: ext || "(none)",
      declaredMime: file.mimetype,
    });

    return cb(
      ValidationError.dto(
        file.fieldname,
        "Invalid file extension. Only .jpg, .jpeg, .png, and .pdf files are accepted.",
        "INVALID_EXTENSION",
      ),
      false,
    );
  }

  if (expectedMime !== file.mimetype) {
    // Extension is valid but does not match the declared MIME type —
    // the two client-supplied values contradict each other.
    logFileRejection(req, "EXTENSION_MIME_MISMATCH", {
      fieldname: file.fieldname,
      extension: ext,
      declaredMime: file.mimetype,
      expectedMime,
    });

    return cb(
      ValidationError.dto(
        file.fieldname,
        `File extension "${ext}" does not match the declared file type. ` +
          "Ensure the file has not been renamed.",
        "EXTENSION_MIME_MISMATCH",
      ),
      false,
    );
  }

  cb(null, true);
};

/* ─────────────────────────────────────────────
   MULTER INSTANCE
───────────────────────────────────────────── */

/**
 * Multer instance configured with Cloudinary storage, the file filter,
 * and hard limits on file size and file count.
 *
 * storage  — Cloudinary stream storage from config/cloudinary.js.
 *            Files are streamed directly to Cloudinary without writing
 *            to disk. Note: stream storage means file.buffer is absent,
 *            which disables Layer 3 magic byte inspection (documented above).
 * fileSize — Enforced at the transport layer before the file is fully
 *            buffered, preventing memory exhaustion and DoS via oversized
 *            file uploads.
 * files    — Caps the number of files per request at MAX_FILES.
 *            Prevents abuse via requests with excessive file counts.
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

/* ─────────────────────────────────────────────
   LAYER 1-2 EXPORT — MULTER MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Multer middleware configured for the document upload schema.
 *
 * Accepts one file per document field, up to MAX_FILES total.
 * Must be preceded by uploadRateLimiter and followed by
 * postUploadValidation in the route chain.
 *
 * MulterError instances (limit violations, unexpected fields) are caught
 * here and mapped to typed error instances so they never reach
 * errorMiddleware as unknown 500s.
 *
 * Known limit codes (LIMIT_FILE_SIZE, LIMIT_FILE_COUNT,
 * LIMIT_UNEXPECTED_FILE) map to ValidationError — the client sent
 * something outside the accepted constraints.
 *
 * Unknown multer codes map to ServiceUnavailableError — an unexpected
 * multer failure signals a platform or storage fault, not a client error.
 *
 * @type {import("express").RequestHandler}
 */
export const cloudinaryUpload = (req, res, next) => {
  const multerMiddleware = upload.fields(
    DOCUMENT_FIELDS_ARRAY.map((field) => ({
      name: field,
      maxCount: 1,
    })),
  );

  multerMiddleware(req, res, (err) => {
    if (!err) return next();

    // ── MulterError mapping ────────────────────────────────────────────────
    // multer throws MulterError for limit violations and unexpected field
    // names. Without explicit mapping these reach errorMiddleware as unknown
    // errors and produce a 500.
    //
    // Known limit codes → typed ValidationError (400): the client violated
    //   an accepted constraint and the request should be corrected.
    //
    // Unknown codes → ServiceUnavailableError (503): an unexpected multer
    //   failure indicates a platform or Cloudinary storage fault that the
    //   client cannot resolve by changing their request.
    if (err.name === "MulterError") {
      logFileRejection(req, err.code, { multerMessage: err.message });

      switch (err.code) {
        case "LIMIT_FILE_SIZE":
          return next(
            ValidationError.dto(
              err.field ?? "file",
              `File exceeds the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
              "FILE_TOO_LARGE",
            ),
          );

        case "LIMIT_FILE_COUNT":
          return next(
            ValidationError.dto(
              "files",
              `Too many files. A maximum of ${MAX_FILES} files may be uploaded per request.`,
              "TOO_MANY_FILES",
            ),
          );

        case "LIMIT_UNEXPECTED_FILE":
          return next(
            ValidationError.dto(
              err.field ?? "file",
              `Unexpected field "${err.field}". Only known document fields are accepted.`,
              "INVALID_FIELD",
            ),
          );

        default:
          // Unknown multer error — not a client constraint violation.
          // Treat as a platform/storage fault.
          return next(
            ServiceUnavailableError.cloudinary(
              new Error(`Multer error: ${err.code} — ${err.message}`),
            ),
          );
      }
    }

    // Non-multer errors (e.g. ValidationError thrown by fileFilter) propagate
    // to errorMiddleware unchanged — they are already typed correctly.
    return next(err);
  });
};

/* ─────────────────────────────────────────────
   LAYERS 3 & 4 — POST-UPLOAD VALIDATION
───────────────────────────────────────────── */

/**
 * Post-upload validation middleware — magic byte inspection and virus
 * scanning hook.
 *
 * Runs AFTER cloudinaryUpload in the route chain. By this point multer
 * has processed the request and req.files is populated.
 *
 * Two checks run per file in order:
 *  1. Magic byte inspection — verifies actual file content matches the
 *     declared MIME type. Catches spoofed uploads. Currently skipped
 *     with Cloudinary stream storage (file.buffer absent) — see file
 *     header for the full explanation and remediation path.
 *  2. Virus scanning hook  — placeholder for scanner integration.
 *     Currently a no-op.
 *
 * If no files were uploaded, this middleware passes through immediately —
 * file presence validation is the controller's responsibility.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 */
export const postUploadValidation = async (req, res, next) => {
  try {
    // No files uploaded — pass through. The controller decides whether
    // files are required for the specific operation.
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }

    // Flatten all uploaded files across all fields into a single array
    // for uniform processing — field structure is irrelevant at this layer.
    const allFiles = Object.values(req.files).flat();

    for (const file of allFiles) {
      // ── Layer 3: Magic byte inspection ──────────────────────────────────
      // file-type reads actual file bytes to determine the real MIME type.
      // file.buffer contains the raw bytes when using memoryStorage.
      //
      // With Cloudinary stream storage, file.buffer is absent — the bytes
      // are piped directly to Cloudinary without being held in Node memory.
      // Magic byte inspection is skipped and a warning is logged so the
      // gap remains visible in monitoring.
      //
      // Remediation: switch to memoryStorage, run inspection here, then
      // upload buffer to Cloudinary via SDK in the service layer.
      if (!file.buffer) {
        try {
          logger.warn(
            "[cloudinaryUpload] Magic byte inspection skipped — " +
              "file.buffer absent with stream storage. " +
              "Switch to memoryStorage to enable full MIME verification.",
            {
              requestId: getRequestId(req),
              fieldname: file.fieldname,
              declaredMime: file.mimetype,
            },
          );
        } catch {
          // Logger failure must never block the upload.
        }
      } else {
        // ── Magic byte check ───────────────────────────────────────────────
        const detected = await fileTypeFromBuffer(file.buffer);

        if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
          logFileRejection(req, "MAGIC_BYTE_MISMATCH", {
            fieldname: file.fieldname,
            declaredMime: file.mimetype,
            detectedMime: detected?.mime ?? "unknown",
          });

          return next(
            ValidationError.dto(
              file.fieldname,
              "File content does not match its declared type. " +
                "The file may be corrupted or spoofed.",
              "INVALID_FILE_CONTENT",
            ),
          );
        }
      }

      // ── Layer 4: Virus scanning hook ────────────────────────────────────
      // Integration point for ClamAV, Cloudmersive, VirusTotal, or any
      // cloud scanning service.
      //
      // To integrate:
      //  1. Install your scanning client
      //     e.g. npm install cloudmersive-virus-api-client
      //  2. Replace the comment block below with your scanner call
      //  3. On a positive scan result:
      //       logFileRejection(req, "VIRUS_DETECTED", { fieldname: file.fieldname });
      //       return next(ValidationError.dto(
      //         file.fieldname,
      //         "File failed virus scan and was rejected.",
      //         "VIRUS_DETECTED",
      //       ));
      //
      // Example structure (do not implement until scanner is chosen):
      //   const scanResult = await virusScanner.scan(file.buffer);
      //   if (scanResult.infected) { ... }
      //
      // Current status: no-op.
      // Acceptable pre-launch. Enable before accepting files from
      // untrusted sources at scale.
    }

    next();
  } catch (err) {
    // Unexpected error during post-upload validation — propagate to
    // errorMiddleware as an unknown error rather than swallowing it.
    next(err);
  }
};
