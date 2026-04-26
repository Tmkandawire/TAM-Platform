import logger from "../utils/logger.js";

/**
 * Enterprise-grade async wrapper
 */
const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      // Prevent duplicate response issues
      if (res.headersSent) {
        return next(err);
      }

      // Structured logging
      logger.error("Unhandled async error", {
        message: err.message,
        stack: err.stack,
        method: req.method,
        path: req.originalUrl,
        userId: req.user?.id || null,
      });

      next(err);
    }
  };
};

export default asyncHandler;
