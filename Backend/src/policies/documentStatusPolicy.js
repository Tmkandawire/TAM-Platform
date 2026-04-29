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
  pending: Object.freeze(["approved", "rejected"]),
  rejected: Object.freeze(["approved"]),
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
 * Validates whether a document can transition
 * from its current state into the requested state.
 *
 * PURE FUNCTION:
 * • deterministic
 * • side-effect free
 * • testable in isolation
 *
 * @param {Object} params
 * @param {Object|null} params.document
 * @param {"approved"|"rejected"} params.targetStatus
 * @param {string|null} [params.reason]
 *
 * @returns {PolicyResult}
 */
function validateTransition({ document, targetStatus, reason = null }) {
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

  if (currentStatus === targetStatus) {
    return deny(
      DOCUMENT_POLICY_ERRORS.NO_OP,
      `Document is already in "${targetStatus}" status.`,
    );
  }

  /* ─────────────────────────────────────────
     STATE MACHINE VALIDATION
  ───────────────────────────────────────── */

  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(targetStatus)) {
    return deny(
      DOCUMENT_POLICY_ERRORS.INVALID_TRANSITION,
      `Cannot transition from "${currentStatus}" to "${targetStatus}".`,
    );
  }

  /* ─────────────────────────────────────────
     EXPIRY VALIDATION
  ───────────────────────────────────────── */

  if (targetStatus === "approved" && isExpired(document.expiryDate)) {
    return deny(
      DOCUMENT_POLICY_ERRORS.DOC_EXPIRED,
      "Cannot approve an expired document.",
    );
  }

  /* ─────────────────────────────────────────
     REJECTION RULES
  ───────────────────────────────────────── */

  if (targetStatus === "rejected" && (!reason || !reason.trim())) {
    return deny(
      DOCUMENT_POLICY_ERRORS.REASON_REQUIRED,
      "Reason is required when rejecting documents.",
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

const documentStatusPolicy = Object.freeze({
  validateTransition,
  ALLOWED_TRANSITIONS,
});

export default documentStatusPolicy;
