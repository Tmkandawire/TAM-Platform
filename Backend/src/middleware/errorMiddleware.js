import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

const errorMiddleware = (err, req, res, next) => {
  let error = err;

  /* -------------------------
     NORMALIZE ERROR
  ------------------------- */
  if (!(error instanceof ApiError)) {
    error = new ApiError(
      err.statusCode || 500,
      err.message || "Internal Server Error",
      [],
      err.code || "INTERNAL_ERROR",
    );
  }

  /* -------------------------
     MONGOOSE ERRORS
  ------------------------- */

  if (err.name === "CastError") {
    error = new ApiError(400, "Invalid resource ID", [], "INVALID_ID");
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue?.[field];

    error = new ApiError(
      400,
      `${field} "${value}" already exists`,
      [],
      "DUPLICATE_FIELD",
    );
  }

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));

    error = new ApiError(400, "Validation failed", errors, "VALIDATION_ERROR");
  }

  /* -------------------------
     JWT ERRORS
  ------------------------- */

  if (err.name === "JsonWebTokenError") {
    error = new ApiError(401, "Invalid token", [], "INVALID_TOKEN");
  }

  if (err.name === "TokenExpiredError") {
    error = new ApiError(401, "Token expired", [], "TOKEN_EXPIRED");
  }

  /* -------------------------
     ZOD ERRORS
  ------------------------- */

  if (err.name === "ZodError") {
    const errors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    error = new ApiError(400, "Validation failed", errors, "VALIDATION_ERROR");
  }

  /* -------------------------
     LOGGING (PRODUCTION-GRADE)
  ------------------------- */

  logger.error({
    message: error.message,
    code: error.code,
    status: error.statusCode,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    user: req.user?.id || null,
    stack: err.stack,
  });

  /* -------------------------
     RESPONSE
  ------------------------- */

  const isProd = process.env.NODE_ENV === "production";

  res.status(error.statusCode || 500).json({
    success: false,
    message: isProd
      ? error.message || "Something went wrong"
      : err.message || error.message,

    code: error.code || "INTERNAL_ERROR",
    errors: error.errors || [],

    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

export default errorMiddleware;
