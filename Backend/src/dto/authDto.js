import { z } from "zod";

// Registration Validation
export const registerSchema = z.object({
  email: z
    .email({ message: "Invalid email address" })
    .transform((val) => val.trim().toLowerCase()),

  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" }),

  role: z.enum(["admin", "member"]).optional().default("member"),
});

// Login Validation
export const loginSchema = z.object({
  email: z
    .email({ message: "Invalid email format" })
    .transform((val) => val.trim().toLowerCase()),

  password: z.string().min(1, { message: "Password is required" }),
});
