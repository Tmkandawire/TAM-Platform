import ApiResponse from "../utils/apiResponse.js";

export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    // Extract the first error message for a cleaner UI experience
    const errorMessage = error.errors?.[0]?.message || "Validation failed";

    return res.status(400).json(new ApiResponse(400, null, errorMessage));
  }
};
