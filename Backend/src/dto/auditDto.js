/**
 * @file auditDto.js
 * @module dto/audit
 *
 * Zod validation schemas for audit log query endpoints.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Validate and coerce raw HTTP query/param input
 *  • Enforce field-level constraints before the service layer
 *  • Export constants consumed by both the DTO and the service
 *
 * This module intentionally does NOT:
 *  • contain business logic
 *  • perform authorization checks
 *  • access the database
 */

import { z } from "zod";
import { objectId } from "./shared/objectId.js";
import { ALL_AUDIT_ACTIONS } from "../constants/auditActions.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

export const AUDIT_TARGET_TYPES = ["user", "broadcast", "document"];

export const AUDIT_STATUSES = ["SUCCESS", "FAILURE"];

/**
 * Mirrors SORT_FIELDS in auditLogService.js.
 * Kept in sync manually — both must reference only indexed fields.
 */
export const AUDIT_SORT_FIELDS = ["createdAt", "action", "actorId", "status"];

export const AUDIT_SORT_DIRECTIONS = ["asc", "desc"];

/**
 * Maximum date range window enforced at the DTO layer.
 *
 * Mirrors MAX_DATE_RANGE_DAYS in auditLogService.js so the error
 * is caught at the boundary before the service is invoked.
 * Both values must be kept in sync.
 */
const MAX_DATE_RANGE_DAYS = 90;
const MAX_DATE_RANGE_MS = MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;

/* ─────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────── */

/**
 * Coerces a query string value to a UTC Date.
 *
 * Accepts ISO 8601 strings and anything Date constructor handles.
 * Rejects values that produce an invalid Date (NaN timestamp).
 *
 * Used for `from` and `to` query params — both arrive as strings
 * from the HTTP layer and must be Date objects by the time the
 * service builds the Mongo filter.
 */
const isoDate = (fieldName) =>
  z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: `${fieldName} must be a valid ISO 8601 date string`,
    })
    .transform((val) => new Date(val));

/* ─────────────────────────────────────────────
   AUDIT LOG LIST QUERY
───────────────────────────────────────────── */

export const auditLogQuerySchema = z
  .object({
    // ── Pagination ──────────────────────────────────────────────────────
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(20),

    // ── Sorting ─────────────────────────────────────────────────────────
    sortBy: z.enum(AUDIT_SORT_FIELDS).default("createdAt"),

    sortDir: z.enum(AUDIT_SORT_DIRECTIONS).default("desc"),

    // ── Filters ─────────────────────────────────────────────────────────

    // ObjectId filters — validated via shared objectId schema so the
    // service always receives a clean string, never a malformed id.
    actorId: objectId("Actor ID").optional(),
    targetId: objectId("Target ID").optional(),

    // Enum filters — transform normalizes casing before enum check
    // so "document" and "DOCUMENT" both pass.
    targetType: z
      .string()
      .trim()
      .toLowerCase()
      .refine((val) => AUDIT_TARGET_TYPES.includes(val), {
        message: `targetType must be one of: ${AUDIT_TARGET_TYPES.join(", ")}`,
      })
      .optional(),

    status: z
      .string()
      .trim()
      .toUpperCase()
      .refine((val) => AUDIT_STATUSES.includes(val), {
        message: `status must be one of: ${AUDIT_STATUSES.join(", ")}`,
      })
      .optional(),

    // Action filter — validated against the live ALL_AUDIT_ACTIONS array
    // so it stays in sync with auditActions.js automatically.
    action: z
      .string()
      .trim()
      .toUpperCase()
      .refine((val) => ALL_AUDIT_ACTIONS.includes(val), {
        message: "Invalid audit action",
      })
      .optional(),

    // Date range — both optional individually, but when both are present
    // the superRefine below enforces the max window constraint.
    from: isoDate("from").optional(),
    to: isoDate("to").optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // ── Date ordering ────────────────────────────────────────────────────
    // `from` must not be later than `to`.
    // Checked here rather than in the service so the HTTP consumer
    // receives a field-level validation error, not a service-level throw.
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "`from` must be earlier than or equal to `to`",
      });
    }

    // ── Date range window ────────────────────────────────────────────────
    // Mirrors assertDateRangeWindow in auditLogService.js.
    // Enforced at both layers — DTO catches it at the HTTP boundary,
    // service catches it if the service is called directly (e.g. tests).
    if (data.from && data.to) {
      const rangeMs = data.to.getTime() - data.from.getTime();

      if (rangeMs > MAX_DATE_RANGE_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`,
        });
      }
    }
  });

/* ─────────────────────────────────────────────
   AUDIT LOG BY ID
───────────────────────────────────────────── */

export const auditLogByIdSchema = z
  .object({
    params: z
      .object({
        id: objectId("Audit log ID"),
      })
      .strict(),
  })
  .strict();
