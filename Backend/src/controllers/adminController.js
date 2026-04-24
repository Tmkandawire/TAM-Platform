import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import adminService from "../services/adminService.js";

export const getPendingMembers = asyncHandler(async (req, res) => {
  const data = await adminService.getPendingMembers(req.query);
  res.json(new ApiResponse(200, data));
});

export const approveMember = asyncHandler(async (req, res) => {
  const result = await adminService.approveMember(req.params.id, req.user.id, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.json(new ApiResponse(200, result));
});

export const rejectMember = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const result = await adminService.rejectMember(
    req.params.id,
    reason,
    req.user.id,
    {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
  );

  res.json(new ApiResponse(200, result));
});

export const suspendMember = asyncHandler(async (req, res) => {
  const result = await adminService.suspendMember(req.params.id, req.user.id, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.json(new ApiResponse(200, result));
});
