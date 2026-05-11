/**
 * @file services/member.service.js
 * @module services
 *
 * Member API service — all calls to /api/v1/members/* endpoints.
 *
 * Returns data payloads directly — the Axios interceptor in api.js
 * unwraps response.data, so call sites receive the ApiResponse envelope.
 * Individual hooks unwrap the `.data` field from the envelope.
 *
 * Endpoints covered:
 *  GET    /members/me             → current member's profile
 *  POST   /members/profile        → create profile (JSON only)
 *  PATCH  /members/profile        → update profile (JSON only)
 *  POST   /members/submit         → submit for TAM verification
 *  GET    /members/directory      → public member directory
 *
 * Query keys:
 *  All React Query keys for member data are defined here so every hook
 *  and page that touches member cache imports from one source of truth.
 *  This prevents silent cache misses from key drift across files.
 */

import api from "./api.js";

// ─── Query keys ───────────────────────────────────────────────────────────────

/**
 * React Query cache keys for all member data.
 *
 * Usage:
 *   useQuery({ queryKey: MEMBER_QUERY_KEYS.profile })
 *   queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile })
 *   queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.all })
 */
export const MEMBER_QUERY_KEYS = {
  /** Invalidates all member-related cache entries */
  all: ["member"],

  /** Current member's full profile including documents */
  profile: ["member", "profile"],

  /** Public member directory (accepts filter params as third element) */
  directory: (params = {}) => ["member", "directory", params],
};

// ─── Service ──────────────────────────────────────────────────────────────────

const memberService = {
  /**
   * Fetch the current authenticated member's full profile.
   * Includes documents array, fleet details, and user reference.
   *
   * @returns {Promise<ApiResponse<Profile>>}
   */
  getProfile: () => api.get("/members/me"),

  /**
   * Create a new member profile (first-time setup).
   * Fails with 400 if a profile already exists for this user.
   *
   * @param {Object} data - Validated profile fields (profileSchema)
   * @returns {Promise<ApiResponse<Profile>>}
   */
  createProfile: (data) => api.post("/members/profile", data),

  /**
   * Update allowed profile fields.
   * Blocked with 403 once the profile has been approved (backend enforces).
   *
   * Allowed fields: businessName, contactPerson, phoneNumber,
   * physicalAddress, city, fleetSize, vehicleTypes
   *
   * @param {Object} data - Partial profile update (updateProfileSchema)
   * @returns {Promise<ApiResponse<Profile>>}
   */
  updateProfile: (data) => api.patch("/members/profile", data),

  /**
   * Submit the completed profile for TAM secretariat review.
   * Requires isComplete === true and at least one document uploaded.
   * Blocked with 400 if already approved.
   *
   * @returns {Promise<ApiResponse<Profile>>}
   */
  submitForVerification: () => api.post("/members/submit"),

  /**
   * Fetch the public directory of approved TAM members.
   *
   * @param {{ page?: number, limit?: number, city?: string, search?: string }} params
   * @returns {Promise<ApiResponse<Profile[]>>}
   */
  getDirectory: (params = {}) => api.get("/members/directory", { params }),
};

export default memberService;
