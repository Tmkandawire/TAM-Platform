import { z } from "zod";

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

/* -------------------------
   SHARED HELPERS
------------------------- */
const objectId = (fieldName = "ID") =>
  z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, `Invalid ${fieldName} format`);

const documentParams = z
  .object({
    userId: objectId("User ID"),
    docId: objectId("Document ID"),
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

        // ❗ MUST specify which docs
        documentsRequired: z
          .array(z.enum(DOCUMENT_TYPES))
          .min(1, "Specify at least one document to resubmit"),
      })
      .strict(),
  })
  .strict();
