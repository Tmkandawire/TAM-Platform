import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import authService from "../services/authService.js";
import crypto from "crypto";
import ms from "ms";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};

// REGISTER
export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);

  res
    .status(201)
    .json(new ApiResponse(201, user, "User registered successfully"));
});

// LOGIN
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { user, accessToken, refreshToken } = await authService.login(
    email,
    password,
    {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  );

  // 🔐 Generate CSRF token
  const csrfToken = crypto.randomBytes(32).toString("hex");

  res
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: ms(process.env.JWT_ACCESS_EXPIRY || "15m"),
    })
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: ms(process.env.JWT_REFRESH_EXPIRY || "7d"),
    })
    // 🔓 CSRF cookie (NOT httpOnly so frontend can read it)
    .cookie("csrfToken", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    })
    .status(200)
    .json(new ApiResponse(200, user, "Login successful"));
});

// REFRESH
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.headers["x-refresh-token"];

  if (!token) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Refresh token missing"));
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await authService.refresh(token);

  // 🔐 Rotate CSRF token
  const newCsrfToken = crypto.randomBytes(32).toString("hex");

  res
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: ms(process.env.JWT_ACCESS_EXPIRY || "15m"),
    })
    .cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: ms(process.env.JWT_REFRESH_EXPIRY || "7d"),
    })
    .cookie("csrfToken", newCsrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    })
    .status(200)
    .json(new ApiResponse(200, null, "Token refreshed"));
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.headers["x-refresh-token"];

  if (token) {
    await authService.logout(token);
  }

  res
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .clearCookie("csrfToken", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    })
    .status(200)
    .json(new ApiResponse(200, null, "Logged out successfully"));
});
