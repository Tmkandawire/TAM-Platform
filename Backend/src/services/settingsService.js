/**
 * @file services/settingsService.js
 * @module services
 *
 * Orchestration layer for member account settings operations.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Verify current password before accepting a change
 *  • Persist new password (hashing delegated to User pre-save hook)
 *  • Read and merge notification preferences on the User document
 *  • Update account details (contactPerson, phoneNumber) on Profile
 *  • Audit security-sensitive operations
 *
 * This service intentionally does NOT:
 *  • issue or revoke tokens (authService responsibility)
 *  • clear auth cookies (controller responsibility)
 *  • validate DTO shape (validateMiddleware / settingsDto responsibility)
 *  • know about HTTP concerns
 *
 * Password hashing
 * ─────────────────────────────────────────────────────────────
 * The User model's pre-save hook hashes `password` whenever it is
 * modified. This service sets `user.password = newPassword` (plaintext)
 * and calls `user.save()` — the hook handles bcrypt automatically.
 * No manual bcrypt calls are made here; duplicating hashing logic
 * outside the model would create two diverging sources of truth.
 *
 * notificationPreferences storage
 * ─────────────────────────────────────────────────────────────
 * Preferences live on the User document (not Profile) because they are
 * auth-scoped — they control how the platform communicates with the
 * account, independent of business identity. The protect middleware
 * already loads the user on every request, so no extra DB query is
 * needed to read preferences.
 *
 * Security decisions
 * ─────────────────────────────────────────────────────────────
 *  • Current password is always verified before accepting a change —
 *    prevents an open session from silently replacing credentials.
 *  • New password must differ from current — silent no-op changes are
 *    rejected so the member receives clear confirmation of intent.
 *  • `password` field has select: false — fetched explicitly with
 *    .select("+password") so matchPassword() works correctly.
 */

import User from "../models/User.js";
import Profile from "../models/Profile.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import auditService from "./auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Default preferences applied when the field is absent on legacy accounts
 * (accounts created before notificationPreferences was added to the schema).
 *
 * Mirrors the schema defaults in User.js — defined here too so the service
 * can construct a consistent response without a DB write for legacy reads.
 */
const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  documentUpdates: true,
  accountAlerts: true,
  broadcasts: false,
});

/**
 * Fields on Profile that settingsController.updateAccountDetails may write.
 * Allowlist prevents callers from sneaking in fields outside this service's
 * jurisdiction (e.g. isApproved, status).
 */
const ACCOUNT_DETAIL_FIELDS = Object.freeze(["contactPerson", "phoneNumber"]);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Normalise notificationPreferences from a User document.
 *
 * Merges stored preferences over defaults so legacy accounts (created
 * before the field existed) always receive a complete three-key object
 * rather than undefined or a partial shape.
 *
 * @param {Object|undefined} stored - The notificationPreferences subdocument.
 * @returns {Object} Complete preference object.
 */
function normalizePreferences(stored) {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...stored };
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class SettingsService {
  /* ─────────────────────────────────────────
     CHANGE PASSWORD
  ───────────────────────────────────────── */

  /**
   * Change the authenticated user's password.
   *
   * Flow:
   *  1. Fetch user with password field (select: false requires explicit opt-in)
   *  2. Verify currentPassword against the stored hash
   *  3. Reject if new password matches current (no-op change)
   *  4. Assign new password and save (pre-save hook hashes it)
   *  5. Audit log success
   *
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @param {Object} [context={}]
   * @param {string} [context.ip]
   * @param {string} [context.userAgent]
   * @returns {Promise<void>}
   * @throws {ApiError} 404 — user not found
   * @throws {ApiError} 401 — current password incorrect
   * @throws {ApiError} 422 — new password identical to current
   */
  async changePassword(userId, currentPassword, newPassword, context = {}) {
    // ── 1. Fetch user with password ──────────────────────────────────────
    // password has select: false — must opt in explicitly.
    // Without .select("+password"), matchPassword() always resolves false,
    // producing a misleading 401 for every correct password attempt.
    const user = await User.findById(userId).select("+password");

    if (!user) {
      throw new ApiError(404, "User not found.", [], "USER_NOT_FOUND");
    }

    // ── 2. Verify current password ───────────────────────────────────────
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      // Audit before throwing — failed password changes are security-relevant
      // and often precede account takeover attempts.
      void auditService.log({
        action: AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
        actorId: userId,
        targetId: userId,
        targetType: "user",
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: "INCORRECT_CURRENT_PASSWORD" },
        status: "FAILURE",
      });

      throw new ApiError(
        401,
        "Current password is incorrect.",
        [],
        "INVALID_CURRENT_PASSWORD",
      );
    }

    // ── 3. Reject same-value change ──────────────────────────────────────
    // matchPassword compares plaintext newPassword against the stored hash.
    // If they match, the member submitted the same password — silent no-op.
    const isSamePassword = await user.matchPassword(newPassword);

    if (isSamePassword) {
      throw new ApiError(
        422,
        "New password must be different from your current password.",
        [],
        "PASSWORD_UNCHANGED",
      );
    }

    // ── 4. Persist ───────────────────────────────────────────────────────
    // Assign plaintext — the User pre-save hook detects isModified("password")
    // and hashes before writing. No bcrypt call needed here.
    user.password = newPassword;
    await user.save();

    // ── 5. Audit success ─────────────────────────────────────────────────
    logger.info("SettingsService: password changed.", {
      userId,
      ip: context.ip,
    });

    void auditService.log({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      actorId: userId,
      targetId: userId,
      targetType: "user",
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {},
      status: "SUCCESS",
    });
  }

  /* ─────────────────────────────────────────
     ACCOUNT DETAILS
  ───────────────────────────────────────── */

  /**
   * Update contactPerson and/or phoneNumber on the member's Profile.
   *
   * Blocked when profile.isApproved — mirrors the lock on
   * PATCH /members/profile. The DTO already requires at least one field,
   * so an empty payload never reaches this method.
   *
   * @param {string} userId
   * @param {{ contactPerson?: string, phoneNumber?: string }} data
   * @returns {Promise<{ contactPerson: string, phoneNumber: string }>}
   * @throws {ApiError} 404 — profile not found
   * @throws {ApiError} 403 — profile is approved and locked
   */
  async updateAccountDetails(userId, data) {
    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found.", [], "PROFILE_NOT_FOUND");
    }

    if (profile.isApproved) {
      throw new ApiError(
        403,
        "Approved profiles cannot be modified.",
        [],
        "PROFILE_LOCKED",
      );
    }

    // Apply only allowlisted fields — prevents callers from writing
    // outside the declared update surface via object spread.
    ACCOUNT_DETAIL_FIELDS.forEach((field) => {
      if (data[field] !== undefined) {
        profile[field] = data[field];
      }
    });

    await profile.save();

    logger.info("SettingsService: account details updated.", { userId });

    return {
      contactPerson: profile.contactPerson,
      phoneNumber: profile.phoneNumber,
    };
  }

  /* ─────────────────────────────────────────
     NOTIFICATION PREFERENCES — READ
  ───────────────────────────────────────── */

  /**
   * Return the current member's notification preferences.
   *
   * Merges stored preferences over defaults so legacy accounts always
   * receive a complete three-key object. No DB write occurs here — the
   * merge is in-memory only.
   *
   * @param {string} userId
   * @returns {Promise<{ documentUpdates: boolean, accountAlerts: boolean, broadcasts: boolean }>}
   * @throws {ApiError} 404 — user not found
   */
  async getNotificationPrefs(userId) {
    // Fetch only the preferences field — no need to load the full document.
    const user = await User.findById(userId).select("notificationPreferences");

    if (!user) {
      throw new ApiError(404, "User not found.", [], "USER_NOT_FOUND");
    }

    return normalizePreferences(user.notificationPreferences);
  }

  /* ─────────────────────────────────────────
     NOTIFICATION PREFERENCES — UPDATE
  ───────────────────────────────────────── */

  /**
   * Merge one or more notification preference toggles onto the User document.
   *
   * Partial updates are supported — only the fields present in `prefs`
   * are written. Unset fields retain their existing values. The DTO
   * already requires at least one field, so an empty payload never
   * reaches this method.
   *
   * Uses $set with dot-notation paths so only the specified subfields
   * are written — a standard MongoDB subdocument replace ($set on the
   * whole object) would overwrite unset fields with undefined, losing
   * existing values.
   *
   * @param {string} userId
   * @param {{ documentUpdates?: boolean, accountAlerts?: boolean, broadcasts?: boolean }} prefs
   * @returns {Promise<{ documentUpdates: boolean, accountAlerts: boolean, broadcasts: boolean }>}
   * @throws {ApiError} 404 — user not found
   */
  async updateNotificationPrefs(userId, prefs) {
    // Build a dot-notation $set payload so only the provided fields are
    // written. $set on the whole subdocument would silently drop unset fields.
    const dotSet = {};
    Object.entries(prefs).forEach(([key, value]) => {
      if (value !== undefined) {
        dotSet[`notificationPreferences.${key}`] = value;
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: dotSet },
      {
        new: true, // return updated document
        runValidators: true, // enforce schema-level boolean type check
        select: "notificationPreferences",
      },
    );

    if (!user) {
      throw new ApiError(404, "User not found.", [], "USER_NOT_FOUND");
    }

    logger.info("SettingsService: notification preferences updated.", {
      userId,
      updated: Object.keys(prefs),
    });

    return normalizePreferences(user.notificationPreferences);
  }
}

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

export default new SettingsService();
