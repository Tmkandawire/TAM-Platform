import { z } from "zod";

/**
 * Malawian Phone Number Regex
 * Supports: +265..., 01..., 08..., 09...
 */
const mwPhoneRegex = /^(?:\+265|0)[189]\d{7}$/;

// Document Schema (Validates structure of Cloudinary uploads)
const documentSchema = z.object({
  title: z.string().min(2, { message: "Document title is required" }),
  url: z.string().url({ message: "Invalid document URL" }),
  documentType: z.enum(
    ["BusinessLicense", "Bluebook", "IdentityProof", "Other"],
    {
      errorMap: () => ({ message: "Invalid document category" }),
    },
  ),
});

export const profileSchema = z.object({
  // Business Identity
  businessName: z
    .string()
    .min(3, { message: "Business name must be at least 3 characters" })
    .trim(),

  registrationNumber: z
    .string()
    .min(5, { message: "MRA or Registrar of Companies number is required" })
    .trim(),

  taxId: z.string().optional(),

  // Contact Information
  contactPerson: z
    .string()
    .min(2, { message: "Contact person name is required" })
    .trim(),

  phoneNumber: z
    .string()
    .regex(mwPhoneRegex, {
      message: "Please enter a valid Malawian phone number",
    }),

  physicalAddress: z
    .string()
    .min(5, { message: "Detailed physical address is required" })
    .trim(),

  city: z.enum(["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"], {
    errorMap: () => ({ message: "Please select a valid city" }),
  }),

  // Fleet & Operational Data
  fleetSize: z
    .number()
    .int()
    .nonnegative({ message: "Fleet size cannot be negative" })
    .default(0),

  vehicleTypes: z
    .array(z.enum(["Truck", "Tanker", "Van", "Minibus", "Other"]))
    .min(1, { message: "Select at least one vehicle type" }),

  // Documents Array
  documents: z.array(documentSchema).optional(),

  membershipType: z
    .enum(["Small Scale", "Medium Scale", "Corporate"])
    .default("Small Scale"),
});

// Partial schema for updates (Allows updating only specific fields)
export const updateProfileSchema = profileSchema.partial();
