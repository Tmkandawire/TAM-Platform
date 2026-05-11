import { z } from "zod";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

export const BULK_ACTIONS = ["approved", "rejected"];

/**
 * Minimum reason length — kept in sync with REASON_MIN_LENGTH in
 * adminDocumentController.js. 10 characters forces a minimally
 * descriptive string; single-word reasons ("spam", "bad") give
 * reviewers no actionable context.
 */
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

/**
 * Maximum documents per bulk request.
 * Caps the transaction scope to prevent lock contention and memory
 * pressure on large batches.
 */
export const BULK_MAX_DOCUMENTS = 50;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Reusable MongoDB ObjectId validator.
 * Validates length and hex format — consistent with assertValidObjectId()
 * in adminDocumentController.js.
 *
 * @param {string} field - Field label used in error messages.
 * @returns {z.ZodString}
 */
const objectId = (field = "ID") =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .length(24, `Invalid ${field} length`)
    .regex(/^[0-9a-fA-F]{24}$/, `Invalid ${field} format`);

/* ─────────────────────────────────────────────
   DOCUMENT ITEM SCHEMA
───────────────────────────────────────────── */

/**
 * Schema for a single document item in a bulk action request.
 * Strict — no extra keys accepted.
 */
const documentItemSchema = z
  .object({
    userId: objectId("User ID"),
    docId: objectId("Document ID"),
  })
  .strict();

/* ─────────────────────────────────────────────
   BULK ACTION DTO
───────────────────────────────────────────── */

export const adminBulkActionSchema = z
  .object({
    action: z.enum(BULK_ACTIONS, {
      errorMap: () => ({
        message: `"action" must be one of: ${BULK_ACTIONS.join(", ")}.`,
      }),
    }),

    documents: z
      .array(documentItemSchema)
      .min(1, "At least one document is required.")
      .max(
        BULK_MAX_DOCUMENTS,
        `Batch limit exceeded. Maximum ${BULK_MAX_DOCUMENTS} documents per request.`,
      )
      // Collect per-item validation errors rather than rejecting the
      // entire array on the first failure. superRefine receives the
      // full array and can attach errors to specific indices so the
      // client knows exactly which items are invalid.
      .superRefine((docs, ctx) => {
        const seen = new Set();

        for (let i = 0; i < docs.length; i++) {
          const key = `${docs[i].userId}-${docs[i].docId}`;

          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate document at index ${i}: userId "${docs[i].userId}", docId "${docs[i].docId}".`,
              path: [i],
            });
          } else {
            seen.add(key);
          }
        }
      }),

    reason: z
      .string()
      .trim()
      .min(
        REASON_MIN_LENGTH,
        `Reason must be at least ${REASON_MIN_LENGTH} characters.`,
      )
      .max(
        REASON_MAX_LENGTH,
        `Reason cannot exceed ${REASON_MAX_LENGTH} characters.`,
      )
      .optional(),
  })
  .strict()

  // Conditional validation — reason is required when rejecting.
  // Checked after field-level validation so the error is only surfaced
  // when action and reason are otherwise individually valid.
  .refine((data) => !(data.action === "rejected" && !data.reason), {
    message: "Reason is required when rejecting documents.",
    path: ["reason"],
  });
