import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Role-based access control middleware
 * @param  {...string} allowedRoles
 */
export const authorize = (...allowedRoles) => {
  // ✅ Defensive: ensure roles are provided
  if (!allowedRoles || allowedRoles.length === 0) {
    throw new Error("authorize middleware requires at least one role");
  }

  // Normalize roles (avoid case bugs)
  const normalizedRoles = allowedRoles.map((r) => r.toLowerCase());

  return (req, res, next) => {
    // ❗ Do NOT assume protect() ran
    if (!req.user) {
      logger.warn("Unauthorized access attempt: no user in request", {
        path: req.originalUrl,
        method: req.method,
      });

      throw new ApiError(401, "Authentication required", [], "UNAUTHORIZED");
    }

    const userRole = req.user.role?.toLowerCase();

    // ❗ Role missing or invalid
    if (!userRole) {
      logger.warn("User has no role assigned", {
        userId: req.user.id,
      });

      throw new ApiError(403, "User role not defined", [], "ROLE_MISSING");
    }

    // ❌ Forbidden
    if (!normalizedRoles.includes(userRole)) {
      logger.warn("Forbidden access attempt", {
        userId: req.user.id,
        role: userRole,
        allowedRoles: normalizedRoles,
        path: req.originalUrl,
      });

      throw new ApiError(
        403,
        `Role (${userRole}) is not authorized to access this resource`,
        [],
        "FORBIDDEN_ACCESS",
      );
    }

    // ✅ Authorized
    next();
  };
};
