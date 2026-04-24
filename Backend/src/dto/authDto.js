import { z } from "zod";

/* -------------------------
   SHARED SCHEMAS
------------------------- */

// 🔐 Reusable password schema
const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters long" })
  .max(128, { message: "Password too long" })
  .regex(/[A-Z]/, {
    message: "Must contain at least one uppercase letter",
  })
  .regex(/[a-z]/, {
    message: "Must contain at least one lowercase letter",
  })
  .regex(/[0-9]/, {
    message: "Must contain at least one number",
  })
  .regex(/[^A-Za-z0-9]/, {
    message: "Must contain at least one special character",
  })
  .describe("User password with complexity requirements");

/* -------------------------
   REGISTER DTO
------------------------- */

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Invalid email address" })
      .describe("User email address"),

    password: passwordSchema,
  })
  .strict();

/* -------------------------
   LOGIN DTO
------------------------- */

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Invalid email format" }),

    // 🔐 Do NOT enforce complexity at login
    password: z.string().min(1, { message: "Password is required" }).max(128),
  })
  .strict();
