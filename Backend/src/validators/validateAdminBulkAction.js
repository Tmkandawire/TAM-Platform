id = "enterprise_validateAdminBulkAction";
/**
 * @file validateAdminBulkAction.js
 * @module validators/admin
 *
 * Enterprise-grade validator for admin bulk document actions.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - validate transport payload structure via Zod
 * - return immutable validated DTOs
 * - normalize validation failures into platform contract
 * - remain pure + transport-agnostic
 *
 * Non-responsibilities
 * ─────────────────────────────────────────────
 * This validator intentionally does NOT:
 * - enforce workflow/business rules
 * - check permissions
 * - check DB existence
 * - enforce document state transitions
 *
 * Those belong in:
 * - policy layer
 * - authorization layer
 * - service layer
 */

import { adminBulkActionSchema } from "../dto/adminBulkActionDto.js";

import { normalizeZodErrors } from "../shared/normalizeZodErrors.js";

import { buildValidationFailure } from "../shared/buildValidationError.js";

import { buildValidationSuccess } from "../shared/buildValidationSuccess.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const ROOT_PAYLOAD_ERROR = Object.freeze([
  Object.freeze({
    field: "root",
    message: "Request body must be a non-null JSON object.",
    code: "invalid_type",
  }),
]);

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Validates admin bulk-action request payloads.
 *
 * PURE FUNCTION
 * ─────────────
 * - no I/O
 * - no DB access
 * - no side effects
 * - deterministic output
 *
 * @param {unknown} rawBody
 *
 * @returns {{
 *   valid: true,
 *   data: Readonly<unknown>,
 *   error: null
 * } | {
 *   valid: false,
 *   data: null,
 *   error: {
 *     code: string,
 *     details: Array<{
 *       field: string,
 *       message: string,
 *       code: string
 *     }>
 *   }
 * }}
 */
export function validateAdminBulkAction(rawBody) {
  /* ─────────────────────────────────────────
     ROOT PAYLOAD GUARD
  ───────────────────────────────────────── */

  const invalidRootPayload =
    rawBody === null ||
    rawBody === undefined ||
    typeof rawBody !== "object" ||
    Array.isArray(rawBody);

  if (invalidRootPayload) {
    return buildValidationFailure(ROOT_PAYLOAD_ERROR);
  }

  /* ─────────────────────────────────────────
     SCHEMA VALIDATION
  ───────────────────────────────────────── */

  const parsed = adminBulkActionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return buildValidationFailure(normalizeZodErrors(parsed.error));
  }

  /* ─────────────────────────────────────────
     SUCCESS
  ───────────────────────────────────────── */

  return buildValidationSuccess(parsed.data);
}
