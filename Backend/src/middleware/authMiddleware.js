import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/User.js";

export const protect = asyncHandler(async (req, res, next) => {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new ApiError(
      500,
      "JWT secret not configured",
      [],
      "SERVER_MISCONFIG",
    );
  }

  let token;

  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new ApiError(401, "Not authorized", [], "NO_TOKEN");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    throw new ApiError(401, "Invalid or expired token", [], "INVALID_TOKEN");
  }

  if (decoded.type !== "access") {
    throw new ApiError(401, "Invalid token type", [], "INVALID_TOKEN_TYPE");
  }

  if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
    throw new ApiError(401, "Invalid token payload", [], "INVALID_TOKEN");
  }

  let user;
  try {
    user = await User.findById(decoded.id)
      .select("email role status isDeleted tokenVersion")
      .lean();
  } catch (err) {
    if (err.name === "CastError") {
      throw new ApiError(401, "Invalid token payload", [], "INVALID_TOKEN");
    }
    throw err;
  }

  if (!user || user.isDeleted) {
    throw new ApiError(401, "User not found", [], "USER_NOT_FOUND");
  }
  if (
    decoded.tokenVersion !== undefined &&
    decoded.tokenVersion !== user.tokenVersion
  ) {
    throw new ApiError(
      401,
      "Session invalidated",
      [],
      "TOKEN_VERSION_MISMATCH",
    );
  }

  // Only hard-block suspended or rejected accounts.
  // "pending" members are allowed through — they need access to complete
  // their profile, upload documents, and submit for verification.
  // Individual routes/controllers enforce what pending members can and
  // cannot do beyond that.
  if (user.status === "suspended") {
    throw new ApiError(403, "Account suspended", [], "ACCOUNT_SUSPENDED");
  }

  if (user.status === "rejected") {
    throw new ApiError(403, "Account rejected", [], "ACCOUNT_REJECTED");
  }

  req.user = {
    id: String(user._id),
    role: user.role,
    status: user.status,
    email: user.email,
    tokenVersion: user.tokenVersion,
  };

  next();
});
