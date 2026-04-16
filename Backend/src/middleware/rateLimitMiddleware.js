import rateLimit from "express-rate-limit";
import ApiResponse from "../utils/apiResponse.js";

// General protector for all API routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          "Too many requests from this IP, please try again after 15 minutes",
        ),
      );
  },
});

// Stricter limiter specifically for Auth (Login/Register)
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Limit each IP to 10 failed attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          "Too many login attempts. Please try again in an hour.",
        ),
      );
  },
});
