class ApiError extends Error {
  constructor({
    statusCode = 500,
    message = "Something went wrong",
    code = "INTERNAL_ERROR",
    errors = [],
    isOperational = true,
    cause = null,
  } = {}) {
    super(message, { cause });

    this.name = this.constructor.name;

    this.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

    this.code = code;
    this.errors = errors;
    this.isOperational = isOperational;

    // Safe message for clients (prevents leaking internals)
    this.clientMessage =
      this.statusCode >= 500 ? "Internal server error" : message;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * What gets sent to the client
   */
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
