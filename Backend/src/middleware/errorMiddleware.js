import ApiError from "../utils/ApiError.js";

const errorMiddleware = (err, req, res, next) => {
  let error = err;

  // Convert unknown errors → ApiError
  if (!(error instanceof ApiError)) {
    error = new ApiError(
      500,
      err.message || "Internal Server Error",
      [],
      "INTERNAL_ERROR",
    );
  }

  // Mongoose: Invalid ObjectId
  if (err.name === "CastError") {
    error = new ApiError(400, "Invalid resource ID", [], "INVALID_ID");
  }

  // Mongoose: Duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];

    error = new ApiError(
      400,
      `${field} "${value}" already exists`,
      [],
      "DUPLICATE_FIELD",
    );
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error = new ApiError(401, "Invalid token", [], "INVALID_TOKEN");
  }

  if (err.name === "TokenExpiredError") {
    error = new ApiError(401, "Token expired", [], "TOKEN_EXPIRED");
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    code: error.code || "INTERNAL_ERROR",
    errors: error.errors || [],
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

export default errorMiddleware;
