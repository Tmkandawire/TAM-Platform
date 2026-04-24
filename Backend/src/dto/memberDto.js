import { z } from "zod";

/* -------------------------
   HELPERS
------------------------- */

const normalizePhone = (val) => val.replace(/[\s\-().]/g, "");
const cleanString = (val) => val.trim();

/* -------------------------
   CONSTANTS
------------------------- */

const MW_PHONE_REGEX = /^(?:\+265|0)[89]\d{8}$/;

const CITIES = ["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"];
const VEHICLE_TYPES = ["Truck", "Tanker", "Van", "Minibus", "Other"];
const DOCUMENT_TYPES = [
  "BusinessLicense",
  "Bluebook",
  "IdentityProof",
  "Other",
];
const MEMBERSHIP_TYPES = ["Small Scale", "Medium Scale", "Corporate"];

/* -------------------------
   DOCUMENT SCHEMA
------------------------- */

const documentSchema = z
  .object({
    title: z
      .string({ error: "Document title is required" })
      .min(2, "Document title must be at least 2 characters")
      .max(100, "Document title must be at most 100 characters")
      .transform(cleanString),

    url: z
      .string({ error: "Document URL is required" })
      .url("Invalid URL format")
      .refine(
        (val) => {
          try {
            return new URL(val).hostname === "res.cloudinary.com";
          } catch {
            return false;
          }
        },
        { message: "Document URL must be a valid Cloudinary URL" },
      ),

    documentType: z.enum(DOCUMENT_TYPES, {
      error: "Invalid document type",
    }),
  })
  .strict();

/* -------------------------
   PHONE FIELD (reusable)
------------------------- */

const phoneNumberField = z
  .string({ error: "Phone number is required" })
  .transform(normalizePhone)
  .refine((val) => MW_PHONE_REGEX.test(val), {
    message:
      "Enter a valid Malawian phone number (e.g. +265991234567 or 0991234567)",
  });

/* -------------------------
   BASE PROFILE SCHEMA
------------------------- */

const baseProfileSchema = {
  businessName: z
    .string({ error: "Business name is required" })
    .min(3, "Business name must be at least 3 characters")
    .max(100, "Business name must be at most 100 characters")
    .transform(cleanString),

  registrationNumber: z
    .string({ error: "Registration number is required" })
    .min(5, "Registration number must be at least 5 characters")
    .max(50, "Registration number must be at most 50 characters")
    .transform(cleanString),

  taxId: z
    .string()
    .max(50, "Tax ID must be at most 50 characters")
    .transform(cleanString)
    .optional(),

  contactPerson: z
    .string({ error: "Contact person name is required" })
    .min(2, "Contact person name must be at least 2 characters")
    .max(100, "Contact person name must be at most 100 characters")
    .transform(cleanString),

  phoneNumber: phoneNumberField,

  physicalAddress: z
    .string({ error: "Physical address is required" })
    .min(5, "Physical address must be at least 5 characters")
    .max(255, "Physical address must be at most 255 characters")
    .transform(cleanString),

  city: z.enum(CITIES, {
    error: "Invalid city selected",
  }),

  fleetSize: z.coerce
    .number({ error: "Fleet size must be a number" })
    .int("Fleet size must be a whole number")
    .nonnegative("Fleet size cannot be negative")
    .default(0),

  vehicleTypes: z
    .array(
      z.enum(VEHICLE_TYPES, {
        error: "Invalid vehicle type",
      }),
    )
    .min(1, "Select at least one vehicle type"),

  documents: z
    .array(documentSchema)
    .max(10, "You can upload at most 10 documents")
    .optional(),

  membershipType: z
    .enum(MEMBERSHIP_TYPES, {
      error: "Invalid membership type",
    })
    .default("Small Scale"),
};

/* -------------------------
   CREATE PROFILE
------------------------- */

export const profileSchema = z.object(baseProfileSchema).strict();

/* -------------------------
   UPDATE PROFILE
------------------------- */

export const updateProfileSchema = z
  .object({
    businessName: baseProfileSchema.businessName.optional(),
    contactPerson: baseProfileSchema.contactPerson.optional(),
    phoneNumber: baseProfileSchema.phoneNumber.optional(),
    physicalAddress: baseProfileSchema.physicalAddress.optional(),
    city: baseProfileSchema.city.optional(),
    fleetSize: baseProfileSchema.fleetSize.optional(),
    vehicleTypes: baseProfileSchema.vehicleTypes.optional(),
  })
  .strict();
