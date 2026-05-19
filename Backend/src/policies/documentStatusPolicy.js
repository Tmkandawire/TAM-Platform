/**
 * @file documentStatusPolicy.js
 * @module policies/document
 *
 * Centralized domain policy for document review workflows.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 * • Define legal workflow transitions
 * • Validate document state transitions
 * • Enforce workflow invariants
 * • Enforce approval/rejection business rules
 * • Return deterministic policy decisions
 *
 * IMPORTANT
 * ─────────────────────────────────────────────────────────────
 * This policy layer:
 * • DOES NOT perform DB access
 * • DOES NOT mutate documents
 * • DOES NOT throw
 * • DOES NOT know about HTTP/Express
 * • DOES NOT emit events
 *
 * It is a PURE domain-policy module.
 */

/* ─────────────────────────────────────────────
   WORKFLOW CONFIGURATION
───────────────────────────────────────────── */

/**
 * Canonical workflow state machine.
 *
 * Keys:
 *   current status
 *
 * Values:
 *   allowed next statuses
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["approved", "rejected", "resubmission_required"]),
  rejected: Object.freeze(["approved", "resubmission_required"]),
  resubmission_required: Object.freeze(["approved", "rejected"]),
  approved: Object.freeze([]),
});

/* ─────────────────────────────────────────────
   POLICY ERROR CODES
───────────────────────────────────────────── */

export const DOCUMENT_POLICY_ERRORS = Object.freeze({
  DOC_NOT_FOUND: "DOC_NOT_FOUND",
  NO_OP: "NO_OP",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  DOC_EXPIRED: "DOC_EXPIRED",
  REASON_REQUIRED: "REASON_REQUIRED",
  DOCUMENTS_REQUIRED: "DOCUMENTS_REQUIRED",
});

/* ─────────────────────────────────────────────
   TYPES (JSDoc)
───────────────────────────────────────────── */

/**
 * @typedef {Object} PolicyFailure
 * @property {false} allowed
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} PolicySuccess
 * @property {true} allowed
 */

/**
 * @typedef {PolicySuccess | PolicyFailure} PolicyResult
 */

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Determines whether a document is expired.
 *
 * @param   {Date|string|null|undefined} expiryDate
 * @returns {boolean}
 */
function isExpired(expiryDate) {
  if (!expiryDate) {
    return false;
  }

  return new Date(expiryDate) < new Date();
}

/**
 * Creates a standardized policy failure result.
 *
 * @param   {string} code
 * @param   {string} message
 * @returns {PolicyFailure}
 */
function deny(code, message) {
  return {
    allowed: false,
    code,
    message,
  };
}

/**
 * Creates a standardized policy success result.
 *
 * @returns {PolicySuccess}
 */
function allow() {
  return {
    allowed: true,
  };
}

/* ─────────────────────────────────────────────
   PUBLIC POLICY API
───────────────────────────────────────────── */

/**
 * Validates whether a resubmission request is legal for a given document.
 *
 * Separate from validateTransition intentionally — resubmission has its own
 * business rules (reason + documentsRequired both mandatory) that would
 * pollute the general transition validator with resubmission-specific branches.
 *
 * PURE FUNCTION:
 * • deterministic
 * • side-effect free
 * • testable in isolation
 *
 * @param {Object}        params
 * @param {Object|null}   params.document           - The document subdocument.
 * @param {string|null}   params.reason             - Why resubmission is needed.
 * @param {string[]}      params.documentsRequired  - Document types to resubmit.
 *
 * @returns {PolicyResult}
 */
function validateResubmission({
  document,
  reason = null,
  documentsRequired = [],
}) {
  /* ─────────────────────────────────────────
     DOCUMENT EXISTENCE
  ───────────────────────────────────────── */

  if (!document) {
    return deny(DOCUMENT_POLICY_ERRORS.DOC_NOT_FOUND, "Document not found.");
  }

  const currentStatus = document.status;

  /* ─────────────────────────────────────────
     IDEMPOTENCY / NO-OP GUARD
  ───────────────────────────────────────── */

  if (currentStatus === "resubmission_required") {
    return deny(
      DOCUMENT_POLICY_ERRORS.NO_OP,
      `Document is already in "resubmission_required" status.`,
    );
  }

  /* ─────────────────────────────────────────
     STATE MACHINE VALIDATION
  ───────────────────────────────────────── */

  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes("resubmission_required")) {
    return deny(
      DOCUMENT_POLICY_ERRORS.INVALID_TRANSITION,
      `Cannot request resubmission from "${currentStatus}" status.`,
    );
  }

  /* ─────────────────────────────────────────
     REASON REQUIRED
  ───────────────────────────────────────── */

  if (!reason || !reason.trim()) {
    return deny(
      DOCUMENT_POLICY_ERRORS.REASON_REQUIRED,
      "Reason is required when requesting resubmission.",
    );
  }

  /* ─────────────────────────────────────────
     DOCUMENTS REQUIRED
  ───────────────────────────────────────── */

  if (!Array.isArray(documentsRequired) || documentsRequired.length === 0) {
    return deny(
      DOCUMENT_POLICY_ERRORS.DOCUMENTS_REQUIRED,
      "At least one document type must be specified for resubmission.",
    );
  }

  /* ─────────────────────────────────────────
     SUCCESS
  ───────────────────────────────────────── */

  return allow();
}

/* ─────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────── */

function assertReviewAllowed({ document, nextStatus }) {
  if (!document) {
    throw new Error("Document not found.");
  }

  const currentStatus = document.status;

  if (currentStatus === nextStatus) {
    const err = new Error(`Document is already "${nextStatus}".`);
    err.code = "NO_OP";
    throw err;
  }

  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  if (!allowedTransitions.includes(nextStatus)) {
    const err = new Error(
      `Cannot transition document from "${currentStatus}" to "${nextStatus}".`,
    );
    err.code = "INVALID_TRANSITION";
    throw err;
  }

  if (nextStatus === "approved" && isExpired(document.expiryDate)) {
    const err = new Error("Cannot approve an expired document.");
    err.code = "DOC_EXPIRED";
    throw err;
  }
}

const documentStatusPolicy = Object.freeze({
  assertReviewAllowed,
  validateResubmission,
  ALLOWED_TRANSITIONS,
});

export default documentStatusPolicy;
