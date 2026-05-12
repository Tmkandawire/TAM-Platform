import { z } from "zod";
import { objectId } from "./shared/objectId.js";

/* -------------------------
   CONSTANTS (DRY + SAFE)
------------------------- */
export const DOCUMENT_TYPES = [
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

export const PRIORITY_LEVELS = ["HIGH", "MEDIUM", "LOW"];
export const REVIEW_STATUSES = [
  "pending",
  "rejected",
  "approved",
  "resubmission_required",
];
export const SORT_OPTIONS = ["priority", "oldest", "newest"];

/* -------------------------
   SHARED HELPERS
------------------------- */

const documentParams = z
  .object({
    userId: objectId("User ID"),
    docId: objectId("Document ID"),
  })
  .strict();

/* -------------------------
   QUERY (ENTERPRISE GRADE)
------------------------- */
export const pendingQuerySchema = z
  .object({
    // ✅ Proper coercion + defaults
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(50).default(10),

    // ✅ Optional — do NOT force default
    status: z
      .string()
      .transform((val) => val?.toLowerCase())
      .refine((val) => !val || REVIEW_STATUSES.includes(val), {
        message: "Invalid status",
      })
      .optional(),

    documentType: z
      .string()
      .transform((val) => val?.trim())
      .refine((val) => !val || DOCUMENT_TYPES.includes(val), {
        message: "Invalid document type",
      })
      .optional(),

    priority: z
      .string()
      .transform((val) => val?.toUpperCase())
      .refine((val) => !val || PRIORITY_LEVELS.includes(val), {
        message: "Invalid priority",
      })
      .optional(),

    // ✅ Sorting with default
    sortBy: z.enum(SORT_OPTIONS).default("priority"),
  })
  .strict();

/* -------------------------
   APPROVE DOCUMENT
------------------------- */
export const approveDocumentSchema = z
  .object({
    params: documentParams,
  })
  .strict();

/* -------------------------
   REJECT DOCUMENT
------------------------- */
export const rejectDocumentSchema = z
  .object({
    params: documentParams,
    body: z
      .object({
        reason: z
          .string({ required_error: "Rejection reason is required" })
          .trim()
          .min(5, "Reason must be at least 5 characters")
          .max(500, "Reason cannot exceed 500 characters"),
      })
      .strict(),
  })
  .strict();

/* -------------------------
   REQUEST RESUBMISSION
------------------------- */
export const requestResubmissionSchema = z
  .object({
    params: documentParams,
    body: z
      .object({
        reason: z
          .string({ required_error: "Resubmission reason is required" })
          .trim()
          .min(10, "Please provide a more detailed reason")
          .max(500, "Reason cannot exceed 500 characters"),

        documentsRequired: z
          .array(z.enum(DOCUMENT_TYPES))
          .min(1, "Specify at least one document to resubmit"),
      })
      .strict(),
  })
  .strict();
