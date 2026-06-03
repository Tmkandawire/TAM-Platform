// A custom error class for API errors, extending the built-in Error class.
class ApiError extends Error {
  constructor(statusCodeOrOptions = {}, message, errors = [], code) {
    const opts =
      typeof statusCodeOrOptions === "object"
        ? statusCodeOrOptions
        : {
            statusCode: statusCodeOrOptions,
            message,
            errors,
            code,
          };

    const {
      statusCode = 500,
      message: msg = "Something went wrong",
      code: errorCode = "INTERNAL_ERROR",
      errors: errorList = [],
      isOperational = true,
      cause = null,
    } = opts;

    super(msg, { cause });

    this.name = this.constructor.name;
    this.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    this.code = errorCode;
    this.errors = errorList;
    this.isOperational = isOperational;
    this.clientMessage = this.statusCode >= 500 ? "Internal server error" : msg;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      message: this.clientMessage,
      code: this.code,
      errors: this.errors,
    };
  }
}

export default ApiError;
