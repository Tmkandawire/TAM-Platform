import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Enterprise-grade validation middleware
 * Supports body, params, query simultaneously
 */
export const validate = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const formattedErrors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      logger.warn("Validation failed", {
        path: req.originalUrl,
        method: req.method,
        errors: formattedErrors,
      });

      return next(
        new ApiError(
          400,
          "Validation failed",
          formattedErrors,
          "VALIDATION_ERROR",
        ),
      );
    }

    // ✅ Replace request data with sanitized values
    if (result.data.body) req.body = result.data.body;
    if (result.data.params) req.params = result.data.params;
    if (result.data.query) req.query = result.data.query;

    next();
  } catch (err) {
    logger.error("Validation middleware error", {
      error: err.message,
      path: req.originalUrl,
    });

    next(err);
  }
};
