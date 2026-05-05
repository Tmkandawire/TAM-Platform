/**
 * @file adminController.js
 * @module controllers/admin
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Validate and coerce HTTP boundary inputs (params, query, body)
 * - Delegate business logic entirely to adminService
 * - Return canonical ApiResponse envelopes
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * - Audit logging     → handled transactionally inside adminService
 * - Role enforcement  → handled by RBAC middleware upstream
 * - Idempotency       → handled by state guards inside adminService
 */

import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import adminService from "../services/adminService.js";
import { ValidationError } from "../errors/index.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

/**
 * Maximum page number accepted at the HTTP boundary.
 * Prevents absurdly large offsets from reaching the DB layer.
 * If a client needs results beyond this, cursor-based pagination
 * should be used instead.
 */
const MAX_PAGE = 1000;

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Validates that a route param is a well-formed MongoDB ObjectId.
 * Throws ValidationError immediately so errorMiddleware handles the 400 —
 * the service never receives a malformed ID.
 *
 * @param {string} id
 * @param {string} fieldName
 * @throws {ValidationError}
 */
function assertValidObjectId(id, fieldName = "id") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be a valid MongoDB ObjectId.`,
      "INVALID_ID",
    );
  }
}

/**
 * Validates the rejection reason string.
 * Rejection reasons are user-facing and audit-critical — cannot be
 * empty, undefined, or a whitespace-only string.
 *
 * @param {unknown} reason
 * @throws {ValidationError}
 */
function assertValidReason(reason) {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw ValidationError.dto(
      "reason",
      "Rejection reason is required.",
      "MISSING_VALUE",
    );
  }

  const trimmed = reason.trim();

  if (trimmed.length < REASON_MIN_LENGTH) {
    throw ValidationError.dto(
      "reason",
      `Rejection reason must be at least ${REASON_MIN_LENGTH} characters.`,
      "INVALID_VALUE",
    );
  }

  if (trimmed.length > REASON_MAX_LENGTH) {
    throw ValidationError.dto(
      "reason",
      `Rejection reason must not exceed ${REASON_MAX_LENGTH} characters.`,
      "INVALID_VALUE",
    );
  }
}

/**
 * Coerces and validates a pagination query param.
 * NaN, non-integer, and out-of-range values all fall back to safe defaults
 * or throw — the service always receives a clean integer.
 *
 * @param {unknown}  raw          - Raw value from req.query (always a string).
 * @param {number}   defaultValue
 * @param {number}   min
 * @param {number}   max
 * @param {string}   fieldName    - Used in ValidationError detail.
 * @returns {number}
 * @throws {ValidationError}
 */
function coercePaginationParam(raw, { defaultValue, min, max, fieldName }) {
  if (raw === undefined || raw === null) return defaultValue;

  const parsed = parseInt(raw, 10);

  // NaN — value was provided but is not a number at all.
  if (Number.isNaN(parsed)) {
    throw ValidationError.dto(
      fieldName,
      `"${fieldName}" must be a positive integer.`,
      "INVALID_VALUE",
    );
  }

  // Clamp to safe range — out-of-range values are corrected, not rejected.
  // This matches standard pagination API behaviour.
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Builds the standard reqInfo object propagated into every service call.
 * Centralised here so all handlers stay consistent.
 *
 * @param {import("express").Request} req
 * @returns {{ ip: string, userAgent: string, requestId: string }}
 */
function buildReqInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.context?.requestId,
  };
}

/* ─────────────────────────────────────────────
   HANDLERS
───────────────────────────────────────────── */

export const getPendingMembers = asyncHandler(async (req, res) => {
  // Both params throw ValidationError on non-numeric input and clamp
  // silently on out-of-range values — service always receives clean integers.
  const page = coercePaginationParam(req.query.page, {
    defaultValue: DEFAULT_PAGE,
    min: 1,
    max: MAX_PAGE,
    fieldName: "page",
  });

  const limit = coercePaginationParam(req.query.limit, {
    defaultValue: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
    fieldName: "limit",
  });

  const { data, pagination } = await adminService.getPendingMembers({
    page,
    limit,
  });

  // pagination.pages (service-computed) intentionally dropped —
  // ApiResponse owns all derived pagination fields.
  if (data.length === 0) {
    const response = ApiResponse.empty(
      { page: pagination.page, limit },
      "No pending members found.",
    );
    return res.status(response.statusCode).json(response);
  }

  const response = ApiResponse.paginated(
    data,
    { total: pagination.total, page: pagination.page, limit },
    "Pending members retrieved successfully.",
  );
  return res.status(response.statusCode).json(response);
});

export const approveMember = asyncHandler(async (req, res) => {
  assertValidObjectId(req.params.id, "id");

  await adminService.approveMember(
    req.params.id,
    req.user.id,
    buildReqInfo(req),
  );

  // Service return value { message: "..." } discarded — message surfaced
  // via ApiResponse.message, data: null because no resource is returned.
  const response = ApiResponse.ok(null, "Member approved successfully.");
  return res.status(response.statusCode).json(response);
});

export const rejectMember = asyncHandler(async (req, res) => {
  assertValidObjectId(req.params.id, "id");

  const { reason } = req.body;

  // Validated before reaching the service — rejection reasons are
  // user-facing and audit-critical; undefined/empty must never propagate.
  assertValidReason(reason);

  await adminService.rejectMember(
    req.params.id,
    reason.trim(),
    req.user.id,
    buildReqInfo(req),
  );

  const response = ApiResponse.ok(null, "Member rejected successfully.");
  return res.status(response.statusCode).json(response);
});

export const suspendMember = asyncHandler(async (req, res) => {
  assertValidObjectId(req.params.id, "id");

  await adminService.suspendMember(
    req.params.id,
    req.user.id,
    buildReqInfo(req),
  );

  const response = ApiResponse.ok(null, "Member suspended successfully.");
  return res.status(response.statusCode).json(response);
});
