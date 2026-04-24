import { rateLimit } from "express-rate-limit";
import ApiResponse from "../utils/apiResponse.js";

/* -------------------------
   GLOBAL API LIMITER
------------------------- */
export const globalLimiter = rateLimit({
  // Removed 'store: redisStore' to stop the crashes
  windowMs: 15 * 60 * 1000,
  limit: 100, // v7 uses 'limit' instead of 'max'
  standardHeaders: true,
  legacyHeaders: false,
  // validate: { trustProxy: false } fixes the IPv6/keyGenerator warning
  validate: { trustProxy: false },
  handler: (req, res) => {
    res
      .status(429)
      .json(new ApiResponse(429, null, "Too many requests. Try again later."));
  },
});

/* -------------------------
   AUTH LIMITER
------------------------- */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  validate: { trustProxy: false },
  // Custom keys are allowed, but we remove the manual req.ip logic
  // to let the library handle the IPv6 safety checks.
  keyGenerator: (req) => {
    const email = req.body?.email || "anonymous";
    return email;
  },
  handler: (req, res) => {
    res
      .status(429)
      .json(
        new ApiResponse(429, null, "Too many login attempts. Try again later."),
      );
  },
});

/* -------------------------
   REFRESH LIMITER
------------------------- */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  validate: { trustProxy: false },
  handler: (req, res) => {
    res
      .status(429)
      .json(new ApiResponse(429, null, "Too many refresh attempts."));
  },
});
