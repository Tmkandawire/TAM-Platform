import ApiError from "../utils/ApiError.js";

const csrfProtection = (req, res, next) => {
  const csrfFromHeader = req.headers["x-csrf-token"];
  const csrfFromCookie = req.cookies.csrfToken;

  if (!csrfFromHeader || !csrfFromCookie) {
    return next(new ApiError(403, "CSRF token missing", [], "CSRF_MISSING"));
  }

  if (csrfFromHeader !== csrfFromCookie) {
    return next(new ApiError(403, "Invalid CSRF token", [], "CSRF_INVALID"));
  }

  next();
};

export default csrfProtection;
