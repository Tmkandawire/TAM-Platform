import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import { ValidationError } from "../errors/index.js";
import memberService from "../services/memberService.js";
import auditService from "../services/auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import logger from "../utils/logger.js";

/**
 * @desc    Upload & Process KYC Documents
 * @route   POST /api/v1/documents/upload
 * @access  Private
 */
export const uploadKYCDocuments = asyncHandler(async (req, res) => {
  // transformDocuments middleware guarantees req.normalizedDocs is a
  // validated non-empty array — unless no files were uploaded, in which
  // case the middleware sets it to []. The ?? [] fallback handles the
  // edge case where the middleware was misconfigured and never ran.
  const documents = req.normalizedDocs ?? [];

  if (documents.length === 0) {
    throw ValidationError.dto(
      "files",
      "At least one document is required.",
      "MISSING_DOCS",
    );
  }

  const userId = req.user.id;

  // Compute once — reused in logger and audit below.
  const documentTypes = documents.map((d) => d.documentType);

  let profile;

  try {
    profile = await memberService.handleDocumentUpload({ userId, documents });
  } catch (err) {
    // Audit the failure before rethrowing — failed upload attempts are
    // compliance-relevant and often more important than successes.
    void auditService.log({
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
      actorId: userId,
      targetId: null,
      targetType: "profile",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { documentCount: documents.length, documentTypes },
      status: "FAILURE",
    });

    throw err;
  }

  // Logger is observability infrastructure — it must never break the
  // business flow. Wrapped so a transport failure doesn't fail the request.
  try {
    logger.info("KYC documents uploaded", {
      userId,
      documentTypes,
      count: documents.length,
      requestId: req.context?.requestId,
    });
  } catch (_logErr) {
    // Intentionally swallowed — logging failure is not a request failure.
  }

  // Fire-and-forget — audit persistence must not block the response or
  // fail the request if the audit store is temporarily unavailable.
  // auditService.log() already swallows DB errors internally, but wrapping
  // the await in void makes the non-blocking intent explicit at the call site.
  void auditService.log({
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    actorId: userId,
    targetId: profile._id,
    targetType: "profile",
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { documentCount: documents.length, documentTypes },
    status: "SUCCESS",
  });

  const response = ApiResponse.ok(
    profile,
    "Documents uploaded and pending review.",
  );
  return res.status(response.statusCode).json(response);
});
