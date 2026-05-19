import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * @file middleware/validateMiddleware.js
 *
 * Zod validation middleware.
 *
 * Passes req.body directly to the schema so flat schemas (profileSchema,
 * updateProfileSchema, etc.) receive the fields they expect without needing
 * to wrap under a `body` key.
 *
 * If your schema intentionally validates params or query alongside body,
 * pass a schema that accepts { body, params, query } and this middleware
 * will still work — just ensure the schema does not use .strict() at the
 * top level or it will reject the extra keys.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse(req.body);

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

    // Replace req.body with the sanitized + transformed values from Zod
    req.body = result.data;

    next();
  } catch (err) {
    logger.error("Validation middleware error", {
      error: err.message,
      path: req.originalUrl,
    });

    next(err);
  }
};
