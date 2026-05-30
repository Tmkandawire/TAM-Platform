/**
 * @file dto/settingsDto.js
 * @description Zod validation schemas for the settings controller.
 *
 * Schemas consumed by validate() middleware at route boundaries.
 * No manual coercion inside controllers — all shape enforcement happens here.
 *
 * Exports:
 *   updateAccountDetailsSchema  — PATCH /settings/profile
 *   changePasswordSchema        — PATCH /settings/password
 *   updateNotificationPrefsSchema — PATCH /settings/notification-preferences
 */

import { z } from "zod";
import { requireAtLeastOneField } from "./shared/requireAtLeastOneField.js";

// ─── Shared primitives ────────────────────────────────────────────────────────

/**
 * E.164-style phone number — Malawi numbers are typically +265XXXXXXXXX.
 * Accepts an optional leading +, then 7–15 digits.
 * Loose enough to accept international members; tight enough to reject garbage.
 */
const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "Phone number must be 7–15 digits, optionally prefixed with +",
  );

/**
 * Password rules — applied to both currentPassword and newPassword fields
 * so the shape is consistent. Actual strength enforcement is on newPassword
 * only (see changePasswordSchema).
 */
const passwordField = z.string().min(1, "Password is required");

const strongPasswordField = z
  .string()
  .min(8, "New password must be at least 8 characters")
  .max(72, "New password cannot exceed 72 characters") // bcrypt max
  .regex(/[A-Z]/, "New password must contain at least one uppercase letter")
  .regex(/[a-z]/, "New password must contain at least one lowercase letter")
  .regex(/[0-9]/, "New password must contain at least one number");

// ─── 1. Update account details ────────────────────────────────────────────────

/**
 * Schema for PATCH /api/v1/settings/profile
 *
 * Updates contactPerson and/or phoneNumber on the Member profile.
 * At least one field must be present — sending an empty body is a no-op
 * and is rejected to prevent silent round-trips.
 *
 * Backend note: the controller must also enforce the approval lock:
 * if profile.accountStatus === "approved", return 403 before writing.
 * This mirrors the lock on PATCH /members/profile.
 */
export const updateAccountDetailsSchema = z
  .object({
    contactPerson: z
      .string()
      .trim()
      .min(2, "Contact person name must be at least 2 characters")
      .max(100, "Contact person name cannot exceed 100 characters")
      .optional(),

    phoneNumber: phoneNumberSchema.optional(),
  })
  .strict()
  .refine(
    ...requireAtLeastOneField("contactPerson", "phoneNumber", {
      message:
        "At least one field (contactPerson or phoneNumber) must be provided",
    }),
  );

// ─── 2. Change password ───────────────────────────────────────────────────────

/**
 * Schema for PATCH /api/v1/settings/password
 *
 * Requires the current password for identity confirmation before accepting
 * the new password — prevents an unlocked session from silently changing
 * credentials. The controller calls bcrypt.compare(currentPassword, user.password)
 * and returns 401 if it fails.
 *
 * confirmNewPassword is validated here (cross-field refinement) so the
 * controller never receives a mismatched pair.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: passwordField,

    newPassword: strongPasswordField,

    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must differ from your current password",
    path: ["newPassword"],
  });

// ─── 3. Update notification preferences ──────────────────────────────────────

/**
 * Schema for PATCH /api/v1/settings/notification-preferences
 *
 * All three preference fields are optional — members can update one at a
 * time without resetting the others. The controller merges the incoming
 * fields onto the existing notificationPreferences subdocument rather than
 * replacing it wholesale.
 *
 * At least one preference must be provided — same rationale as
 * updateAccountDetailsSchema.
 *
 * Mirrors the notificationPreferences shape added to models/User.js:
 *   notificationPreferences: {
 *     documentUpdates: { inApp: Boolean, default: true  },
 *     accountAlerts:   { inApp: Boolean, default: true  },
 *     broadcasts:      { inApp: Boolean, default: false },
 *   }
 */
export const updateNotificationPrefsSchema = z
  .object({
    documentUpdates: z.boolean().optional(),
    accountAlerts: z.boolean().optional(),
    broadcasts: z.boolean().optional(),
  })
  .strict()
  .refine(
    ...requireAtLeastOneField(
      "documentUpdates",
      "accountAlerts",
      "broadcasts",
      {
        message: "At least one notification preference must be provided",
      },
    ),
  );
