import jwt from "jsonwebtoken";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/User.js";

/**
 * 🔐 Protect routes using Access Token
 * - Stateless verification
 * - Minimal DB lookup
 * - High performance
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Extract token (cookie OR header)
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new ApiError(401, "Not authorized", [], "NO_TOKEN");
  }

  let decoded;

  // 2. Verify JWT
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired token", [], "INVALID_TOKEN");
  }

  // 3. Validate token type
  if (decoded.type !== "access") {
    throw new ApiError(401, "Invalid token type", [], "INVALID_TOKEN_TYPE");
  }

  // 4. Fetch user (lean for performance)
  const user = await User.findById(decoded.id)
    .select("role status isDeleted")
    .lean();

  if (!user || user.isDeleted) {
    throw new ApiError(401, "User not found", [], "USER_NOT_FOUND");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "Account inactive", [], "ACCOUNT_INACTIVE");
  }

  // 5. Attach minimal user context
  req.user = {
    id: user._id,
    role: user.role,
  };

  next();
});

/**
 * 🔐 Role-based authorization (RBAC)
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated", [], "NO_AUTH"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden", [], "FORBIDDEN"));
    }

    next();
  };
};
