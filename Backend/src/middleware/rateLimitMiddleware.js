import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import ApiResponse from "../utils/apiResponse.js";
import logger from "../utils/logger.js";

/* -------------------------
   COMMON HANDLER
------------------------- */
const rateLimitHandler = (message) => (req, res) => {
  logger.warn("Rate limit exceeded", {
    ip: ipKeyGenerator(req),
    path: req.originalUrl,
    method: req.method,
  });

  res.status(429).json(new ApiResponse(429, null, message));
};

/* -------------------------
   GLOBAL API LIMITER
------------------------- */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),

  skip: (req) => req.path === "/health",

  handler: rateLimitHandler("Too many requests. Try again later."),
});

/* -------------------------
   AUTH LIMITER (LOGIN/REGISTER)
------------------------- */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase();
    const ip = ipKeyGenerator(req);
    return email ? `${email}-${ip}` : ip;
  },

  handler: rateLimitHandler(
    "Too many authentication attempts. Try again later.",
  ),
});

/* -------------------------
   TOKEN REFRESH LIMITER
------------------------- */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  handler: rateLimitHandler("Too many token refresh attempts."),
});

/* -------------------------
   DOCUMENT UPLOAD LIMITER (NEW)
   🔥 Critical for Cloudinary cost control
------------------------- */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),

  handler: rateLimitHandler("Too many document uploads. Please slow down."),
});

/* -------------------------
   ADMIN RATE LIMITER (NEW)
------------------------- */
export const adminRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 100,

  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),

  handler: rateLimitHandler("Too many admin actions. Please slow down."),
});
