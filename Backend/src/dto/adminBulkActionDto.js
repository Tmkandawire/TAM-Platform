import { z } from "zod";

/* -------------------------
   CONSTANTS
------------------------- */
export const BULK_ACTIONS = ["approved", "rejected"];

/* -------------------------
   HELPERS
------------------------- */
const objectId = (field = "ID") =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .length(24, `Invalid ${field} length`)
    .regex(/^[0-9a-fA-F]{24}$/, `Invalid ${field} format`);

/* -------------------------
   DOCUMENT ITEM
------------------------- */
const documentItemSchema = z
  .object({
    userId: objectId("User ID"),
    docId: objectId("Document ID"),
  })
  .strict();

/* -------------------------
   BULK ACTION DTO
------------------------- */
export const adminBulkActionSchema = z
  .object({
    action: z.enum(BULK_ACTIONS),

    documents: z
      .array(documentItemSchema)
      .min(1, "At least one document is required")
      .max(50, "Batch limit exceeded (max 50)") // ⚠️ safer cap

      // 🚀 Deduplication guard
      .refine((docs) => {
        const seen = new Set();
        for (const d of docs) {
          const key = `${d.userId}-${d.docId}`;
          if (seen.has(key)) return false;
          seen.add(key);
        }
        return true;
      }, "Duplicate documents detected in request"),

    reason: z
      .string()
      .trim()
      .min(5, "Reason must be at least 5 characters")
      .max(500, "Reason cannot exceed 500 characters")
      .optional(),
  })
  .strict()

  // 🚨 Conditional validation
  .refine(
    (data) => {
      if (data.action === "rejected" && !data.reason) {
        return false;
      }
      return true;
    },
    {
      message: "Reason is required when rejecting documents",
      path: ["reason"],
    },
  );
