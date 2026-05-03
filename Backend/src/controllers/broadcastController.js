import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import ApiError from "../utils/ApiError.js";
import broadcastService from "../services/BroadcastService.js";
import { validateBroadcastPayload } from "../validators/broadcastValidator.js";

/**
 * POST /api/v1/admin/broadcasts
 * Validates payload, injects createdByAdmin from req.user.id,
 * delegates to BroadcastService.
 */
export const sendBroadcast = asyncHandler(async (req, res) => {
  const rawPayload = {
    ...req.body,
    createdByAdmin: req.user.id,
  };

  const validation = validateBroadcastPayload(rawPayload);

  if (!validation.success) {
    throw new ApiError(
      422,
      "Validation failed",
      validation.errors,
      "VALIDATION_ERROR",
    );
  }

  const result = await broadcastService.sendBroadcast(validation.data);

  res
    .status(200)
    .json(new ApiResponse(200, result, "Broadcast sent successfully"));
});
