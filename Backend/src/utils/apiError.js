class ApiError extends Error {
  constructor(statusCode, message, errors = [], code = "INTERNAL_ERROR") {
    super(message);

    this.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

    this.message = message;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
