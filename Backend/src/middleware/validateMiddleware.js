import ApiError from "../utils/ApiError.js";

export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const data = req[source];

    const result = schema.safeParse(data);

    if (!result.success) {
      const formattedErrors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return next(
        new ApiError(
          400,
          "Validation failed",
          formattedErrors,
          "VALIDATION_ERROR",
        ),
      );
    }

    // ✅ Replace request data with sanitized version
    req[source] = result.data;

    next();
  };
