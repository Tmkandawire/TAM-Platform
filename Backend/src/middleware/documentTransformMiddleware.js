/**
 * @file documentTransformMiddleware.js
 * @module middleware/documentTransform
 *
 * Transforms raw Multer file objects into the normalized document structure
 * expected by the service layer, and attaches the result to req.normalizedDocs.
 *
 * Position in the route chain
 * ─────────────────────────────────────────────
 *  router.post(
 *    "/documents",
 *    uploadRateLimiter,          // 1. per-user upload throttle
 *    cloudinaryUpload,           // 2. field / MIME / extension validation
 *    postUploadValidation,       // 3. magic byte check + virus hook
 *    transformDocuments,         // 4. ← this middleware
 *    documentController.upload,  // 5. service call + response
 *  );
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Guard that an authenticated user context exists (req.user.id)
 * - Sanitize string metadata from req.body (trim, string-only)
 * - Delegate transformation and compliance validation to normalizeDocuments
 * - Attach the result to req.normalizedDocs for the controller
 * - Log success and failure with full request context
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - File presence / field name validation → cloudinaryUploadMiddleware
 * - MIME / extension / magic byte checks  → cloudinaryUploadMiddleware
 * - Rate limiting                         → uploadRateLimiter
 * - Persistence                           → adminDocumentService
 * - Error response formatting             → errorMiddleware
 *
 * Error handling strategy
 * ─────────────────────────────────────────────
 * normalizeDocuments throws two distinct typed error classes:
 *
 *  ValidationError — client-correctable input failures (bad date, missing
 *    required field, expired document). Logged at warn level, forwarded
 *    to errorMiddleware unchanged.
 *
 *  InternalError (isOperational: false) — platform faults (Cloudinary
 *    returned an incomplete file record, normalization output violated
 *    its contract). Logged at error level, forwarded to errorMiddleware
 *    to produce a 500 response.
 *
 * Classification uses instanceof InternalError — an explicit type check
 * against the platform's error hierarchy rather than an implicit coupling
 * to err.statusCode. This is correct because:
 *  - It tests what the error IS, not what it happens to carry
 *  - It stays correct if statusCode defaults change in ApiError
 *  - It is immediately readable — no mental mapping from number to meaning
 *
 * All other unexpected errors are caught, logged at error level, and
 * forwarded to errorMiddleware — never swallowed.
 *
 * req.context dependency
 * ─────────────────────────────────────────────
 *  req.context.requestId is set by requestContext middleware, which must
 *  be registered before this middleware in server.js.
 */

import logger from "../utils/logger.js";
import { UnauthorizedError } from "../errors/index.js";
import { InternalError } from "../errors/InternalError.js";
import { normalizeDocuments } from "../utils/normalizeDocuments.js";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Extracts requestId from req.context for log correlation.
 * Consistent with the platform-wide fallback pattern.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function getRequestId(req) {
  return req.context?.requestId ?? "unavailable";
}

/**
 * Sanitizes req.body into a flat metadata object.
 *
 * Only string values are retained — non-string body fields (numbers,
 * objects, arrays) are silently dropped. This prevents unexpected types
 * from reaching date parsing in normalizeDocuments.
 *
 * Keys are not validated against a schema here — normalizeDocuments only
 * reads keys it knows about (${fieldName}_expiryDate etc.) and ignores
 * everything else, so unknown keys are harmless.
 *
 * @param {Record<string, unknown>} body — req.body after express.json()
 * @returns {Record<string, string>}
 */
function sanitizeMetadata(body) {
  const metadata = {};

  for (const [key, value] of Object.entries(body ?? {})) {
    if (typeof value === "string") {
      metadata[key] = value.trim();
    }
  }

  return metadata;
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────── */

/**
 * Express middleware that transforms Multer files into normalized documents
 * and attaches them to req.normalizedDocs.
 *
 * Does NOT use asyncHandler — the try/catch below is the error boundary.
 * Using both asyncHandler and try/catch is redundant: asyncHandler catches
 * unhandled promise rejections and forwards them to next(); the try/catch
 * here handles errors from normalizeDocuments and classifies them before
 * forwarding. Combining both produces double-handling on the error path.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 */
export const transformDocuments = async (req, res, next) => {
  const requestId = getRequestId(req);
  const userId = req.user?.id;

  // ── Auth guard ─────────────────────────────────────────────────────────
  // transformDocuments sits behind authMiddleware in the route chain.
  // req.user should always be populated here — this is a defence-in-depth
  // guard for misconfigured routes where authMiddleware was omitted.
  if (!userId) {
    return next(UnauthorizedError.missingToken());
  }

  // ── No files uploaded ──────────────────────────────────────────────────
  // Pass through with an empty array. File presence is the controller's
  // concern — this middleware only transforms what is there.
  if (!req.files || Object.keys(req.files).length === 0) {
    logger.info("[documentTransform] No files present — passing through.", {
      requestId,
      userId,
    });

    req.normalizedDocs = [];
    return next();
  }

  try {
    // ── Metadata sanitization ────────────────────────────────────────────
    // Trim string values from req.body. Non-string values are dropped.
    // normalizeDocuments only reads keys it knows about — unknown keys
    // in metadata are ignored rather than rejected.
    const metadata = sanitizeMetadata(req.body);

    // ── Transformation + compliance validation ───────────────────────────
    // normalizeDocuments throws ValidationError for client-correctable
    // failures and InternalError for platform faults.
    const normalized = normalizeDocuments(req.files, metadata);

    // ── Attach to request ────────────────────────────────────────────────
    req.normalizedDocs = normalized;

    logger.info("[documentTransform] Documents transformed successfully.", {
      requestId,
      userId,
      count: normalized.length,
      documentTypes: normalized.map((d) => d.documentType),
    });

    next();
  } catch (err) {
    // ── Error classification ─────────────────────────────────────────────
    // instanceof InternalError is an explicit type check against the
    // platform's error hierarchy — not an implicit coupling to a status
    // code number. It tests what the error IS, remains correct if ApiError
    // defaults change, and is immediately readable at the call site.
    //
    // InternalError — platform fault, requires investigation.
    //   Log at error: Cloudinary incomplete record, normalization contract
    //   violation, or any other infrastructure-level failure.
    //
    // Everything else (ValidationError, unexpected errors) — client input
    // failure or unknown condition.
    //   Log at warn: expected validation failures; unknown errors are
    //   uncommon but not escalation-worthy until investigated.
    //
    // Both paths forward err to errorMiddleware unchanged — classification
    // here is for logging fidelity only, not for altering the error.

    if (err instanceof InternalError) {
      logger.error(
        "[documentTransform] Platform fault during transformation.",
        {
          requestId,
          userId,
          errorCode: err.code ?? "UNKNOWN",
          errorMessage: err.message ?? "No message",
        },
      );
    } else {
      logger.warn("[documentTransform] Document transformation failed.", {
        requestId,
        userId,
        errorCode: err.code ?? "UNKNOWN",
        errorMessage: err.message ?? "No message",
      });
    }

    next(err);
  }
};
