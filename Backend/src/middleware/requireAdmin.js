/**
 * @file requireAdmin.js
 * @module middleware
 *
 * Permission-level middleware for admin-grade routes.
 *
 * Permission vs exact role match
 * ─────────────────────────────────────────────────────────────
 * This middleware does NOT check for the exact "admin" role string.
 * It enforces a minimum permission level — any role at or above
 * ROLES.ADMIN in the hierarchy is granted access:
 *
 *   super_admin (4) ✔  — outranks admin
 *   admin       (3) ✔  — meets minimum
 *   reviewer    (2) ✗  — below minimum
 *   member      (1) ✗  — below minimum
 *
 * This means requireAdmin never needs to be updated when new
 * privileged roles are added — the hierarchy map in roles.js
 * is the single source of truth for what "admin-level" means.
 *
 * Why hasMinimumRole instead of authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN)?
 * ─────────────────────────────────────────────────────────────
 * An allowlist like authorize("admin", "super_admin") must be manually
 * updated every time the role model changes. A hierarchy check is
 * self-updating — promote a role in ROLE_HIERARCHY and it automatically
 * gains access without touching any route file.
 *
 * Usage
 * ─────────────────────────────────────────────────────────────
 *   import { requireAdmin } from "../middleware/requireAdmin.js";
 *
 *   router.use(requireAdmin);                                      // all routes
 *   router.post("/", broadcastLimiter, ...requireAdmin, handler);  // one route
 */

import { protect } from "./authMiddleware.js";
import { ROLES, hasMinimumRole, normalizeRole } from "../constants/roles.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

// ─── Permission check middleware ──────────────────────────────────────────────

/**
 * Grants access to any role that meets or exceeds ROLES.ADMIN
 * in the ROLE_HIERARCHY map. Rejects with 403 otherwise.
 *
 * Relies on protect() having already run and populated req.user.
 */
const requireAdminLevel = (req, _res, next) => {
  const role = normalizeRole(req.user?.role);

  if (hasMinimumRole(role, ROLES.ADMIN)) {
    return next();
  }

  logger.warn("requireAdmin: insufficient role", {
    userId: req.user?.id ?? null,
    actualRole: role || null,
    requiredRole: ROLES.ADMIN,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip ?? null,
  });

  return next(
    new ApiError(
      403,
      "You do not have permission to perform this action.",
      [],
      "FORBIDDEN",
    ),
  );
};

// ─── Exported middleware array ────────────────────────────────────────────────

/**
 * [protect, requireAdminLevel]
 *
 * protect           — verifies JWT, attaches req.user = { id, role, ... }
 * requireAdminLevel — confirms req.user.role meets the ADMIN hierarchy threshold
 *
 * Frozen so no route file can mutate the shared reference
 * (e.g. an accidental .push() on the imported binding).
 */
export const requireAdmin = Object.freeze([protect, requireAdminLevel]);
