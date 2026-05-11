/**
 * @file dto/shared/objectId.js
 * @module dto/shared
 *
 * Shared Zod helper for MongoDB ObjectId validation.
 *
 * Why this file exists
 * ─────────────────────────────────────────────────────────────
 * objectId() was duplicated across notificationDto.js and the document
 * DTO. A single definition here ensures the regex, error messages, and
 * trim behaviour are identical across every DTO that validates an ObjectId
 * param — one place to update if the constraint ever changes.
 *
 * Usage
 * ─────────────────────────────────────────────────────────────
 *   import { objectId } from "../shared/objectId.js";
 *
 *   const schema = z.object({
 *     params: z.object({ id: objectId("id") }).strict(),
 *   });
 *
 * Design decisions
 * ─────────────────────────────────────────────────────────────
 *  • 24-char hex regex is the reliable ObjectId guard.
 *    mongoose.Types.ObjectId.isValid() returns true for any 12-byte
 *    string, not just canonical hex ObjectIds, so the regex is required.
 *  • fieldName parameter lets callers produce field-specific error
 *    messages ("userId must be a valid ObjectId") rather than the
 *    generic "id must be a valid ObjectId" in every context.
 *  • trim() normalises accidental whitespace before the regex runs.
 */

import { z } from "zod";

/**
 * Canonical MongoDB ObjectId regex — 24 hexadecimal characters exactly.
 *
 * Exported as a named constant so other modules (repositories, query
 * helpers, test suites) can import the same constraint rather than
 * redeclaring it as an inline literal that can silently drift.
 *
 * Why not mongoose.Types.ObjectId.isValid():
 *   isValid() returns true for any 12-byte string, not just canonical
 *   24-char hex ObjectIds. The regex is the only reliable guard.
 */
export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Zod schema for a MongoDB ObjectId string.
 *
 * Validates that the value is a non-empty string containing exactly
 * 24 hexadecimal characters — the canonical string representation of
 * a MongoDB ObjectId.
 *
 * @param {string} [fieldName="id"]
 *   Used in the required_error and regex error messages so validation
 *   failures identify the specific field that failed.
 * @returns {z.ZodString}
 *
 * @example
 *   objectId("userId")
 *   // → rejects "abc", accepts "507f1f77bcf86cd799439011"
 */
export const objectId = (fieldName = "id") =>
  z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .regex(OBJECT_ID_REGEX, `${fieldName} must be a valid ObjectId`);
