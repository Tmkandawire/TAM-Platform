import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import {
  ROLES,
  ROLE_HIERARCHY,
  ALL_ROLES,
  normalizeRole,
} from "../constants/roles.js";

/* ─────────────────────────────────────────────
   1. CORE: Role-based authorization
   Usage: protect, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN)
   ───────────────────────────────────────────── */

/**
 * Restrict route access to specific roles.
 * Always chain AFTER protect() / authMiddleware.
 *
 * @param  {...string} allowedRoles  - roles permitted to proceed
 */
export const authorize = (...allowedRoles) => {
  if (!allowedRoles || allowedRoles.length === 0) {
    throw new Error("[authorize] At least one role must be specified");
  }

  const normalizedAllowed = allowedRoles.map(normalizeRole);

  // Startup-time validation — catch typos before any request is served
  for (const role of normalizedAllowed) {
    if (!ALL_ROLES.includes(role)) {
      throw new Error(`[authorize] Unknown role configured: '${role}'`);
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      logger.warn("[authorize] No user on request", {
        path: req.originalUrl,
        method: req.method,
      });
      return next(
        new ApiError(401, "Authentication required", [], "UNAUTHORIZED"),
      );
    }

    const userRole = normalizeRole(req.user.role);

    if (!userRole) {
      logger.warn("[authorize] User has no role assigned", {
        userId: req.user.id,
      });
      return next(
        new ApiError(403, "User role not defined", [], "ROLE_MISSING"),
      );
    }

    if (!normalizedAllowed.includes(userRole)) {
      logger.warn("[authorize] Forbidden access attempt", {
        userId: req.user.id,
        role: userRole,
        allowedRoles: normalizedAllowed,
        path: req.originalUrl,
      });
      return next(
        new ApiError(
          403,
          `Role '${userRole}' is not authorized to access this resource`,
          [],
          "FORBIDDEN_ACCESS",
        ),
      );
    }

    next();
  };
};

/* ─────────────────────────────────────────────
   2. EXPLICIT DENY: Block specific roles
   Usage: protect, denyRoles(ROLES.REVIEWER)
   ───────────────────────────────────────────── */

/**
 * Explicitly block specific roles — even if other guards pass.
 * Useful for audit clarity on sensitive routes.
 *
 * @param  {...string} blockedRoles  - roles that must be rejected
 */
export const denyRoles = (...blockedRoles) => {
  if (!blockedRoles || blockedRoles.length === 0) {
    throw new Error("[denyRoles] At least one role must be specified");
  }

  const normalizedBlocked = blockedRoles.map(normalizeRole);

  // Startup-time validation — catch typos before any request is served
  for (const role of normalizedBlocked) {
    if (!ALL_ROLES.includes(role)) {
      throw new Error(`[denyRoles] Unknown role configured: '${role}'`);
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      logger.warn("[denyRoles] No user on request", {
        path: req.originalUrl,
        method: req.method,
      });
      return next(
        new ApiError(401, "Authentication required", [], "UNAUTHORIZED"),
      );
    }

    const userRole = normalizeRole(req.user.role);

    if (!userRole) {
      logger.warn("[denyRoles] User has no role assigned", {
        userId: req.user.id,
      });
      return next(
        new ApiError(403, "User role not defined", [], "ROLE_MISSING"),
      );
    }

    if (normalizedBlocked.includes(userRole)) {
      logger.warn("[denyRoles] Explicitly blocked role attempted access", {
        userId: req.user.id,
        role: userRole,
        blockedRoles: normalizedBlocked,
        path: req.originalUrl,
      });
      return next(
        new ApiError(
          403,
          `Role '${userRole}' is explicitly not permitted to perform this action`,
          [],
          "ROLE_DENIED",
        ),
      );
    }

    next();
  };
};

/* ─────────────────────────────────────────────
   3. SCOPE GUARD: Limit access to own resources
   Usage: protect, authorize(...), scopeGuard
   ───────────────────────────────────────────── */

/**
 * Enforces data scope based on role:
 * - super_admin → unrestricted (passes through, scopedUserId = null)
 * - admin       → scoped to their own userId
 * - reviewer / member → should not reach scope-guarded routes;
 *                       blocked and logged as a routing misconfiguration
 *
 * Injects req.scopedUserId for use in controllers and services.
 */
export const scopeGuard = (req, res, next) => {
  if (!req.user) {
    return next(
      new ApiError(401, "Authentication required", [], "UNAUTHORIZED"),
    );
  }

  const { role, id: userId } = req.user;
  const normalizedRole = normalizeRole(role);

  switch (normalizedRole) {
    case ROLES.SUPER_ADMIN:
      req.scopedUserId = null; // null = unrestricted in services
      logger.info("[scopeGuard] super_admin — unrestricted scope", { userId });
      break;

    case ROLES.ADMIN:
      // Guard: id must exist on req.user before scoping
      if (!userId) {
        logger.error("[scopeGuard] admin has no id assigned", {
          role: normalizedRole,
        });
        return next(
          new ApiError(403, "Admin scope missing", [], "SCOPE_MISSING"),
        );
      }
      req.scopedUserId = userId;
      logger.info("[scopeGuard] admin — scoped to own user", { userId });
      break;

    case ROLES.REVIEWER:
    case ROLES.MEMBER:
      // Routing misconfiguration — these roles should never reach this guard
      logger.error("[scopeGuard] Unexpected role reached scope guard", {
        userId,
        role: normalizedRole,
        path: req.originalUrl,
      });
      return next(new ApiError(403, "Forbidden", [], "FORBIDDEN_ACCESS"));

    default:
      logger.error("[scopeGuard] Unknown role", {
        userId,
        role: normalizedRole,
      });
      return next(new ApiError(403, "Unknown role", [], "UNKNOWN_ROLE"));
  }

  next();
};

/* ─────────────────────────────────────────────
   4. HIERARCHY CHECK: "at least this role"
   Usage: protect, atLeastRole(ROLES.REVIEWER)
   ───────────────────────────────────────────── */

/**
 * Allow any role at or above the minimum in the hierarchy.
 * e.g. atLeastRole(ROLES.REVIEWER) → reviewer, admin, super_admin all pass
 *
 * @param {string} minimumRole
 */
export const atLeastRole = (minimumRole) => {
  const normalizedMinimum = normalizeRole(minimumRole);
  const minLevel = ROLE_HIERARCHY[normalizedMinimum];

  if (!minLevel) {
    throw new Error(`[atLeastRole] Unknown role: ${minimumRole}`);
  }

  return (req, res, next) => {
    if (!req.user) {
      return next(
        new ApiError(401, "Authentication required", [], "UNAUTHORIZED"),
      );
    }

    const userRole = normalizeRole(req.user.role);
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;

    if (userLevel < minLevel) {
      logger.warn("[atLeastRole] Insufficient role level", {
        userId: req.user.id,
        role: userRole,
        required: normalizedMinimum,
        path: req.originalUrl,
      });
      return next(
        new ApiError(
          403,
          `Minimum required role is '${normalizedMinimum}'`,
          [],
          "INSUFFICIENT_ROLE",
        ),
      );
    }

    next();
  };
};
