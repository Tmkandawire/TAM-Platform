import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import ms from "ms";

import User from "../models/User.js";
import Session from "../models/Session.js";
import ApiError from "../utils/ApiError.js";

class AuthService {
  // 🔐 Generate unique session ID
  generateJti() {
    return crypto.randomUUID();
  }

  // ⏱ Convert expiry string safely
  getExpiryDate(expiry) {
    return new Date(Date.now() + ms(expiry || "7d"));
  }

  // 🔐 Access Token
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user._id,
        role: user.role,
        type: "access",
      },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
      },
    );
  }

  // 🔐 Refresh Token
  generateRefreshToken(user, jti) {
    return jwt.sign(
      {
        id: user._id,
        jti,
        type: "refresh",
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d",
      },
    );
  }

  // 🧾 Register
  async register(userData) {
    const { email, password, role } = userData;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ApiError(400, "User already exists", [], "USER_EXISTS");
    }

    const user = await User.create({
      email,
      password,
      role: role || "member",
    });

    return user;
  }

  // 🔐 Login
  async login(email, password, meta) {
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      throw new ApiError(401, "Invalid credentials", [], "INVALID_CREDENTIALS");
    }

    // 🔒 Account lock check
    if (user.isLocked()) {
      throw new ApiError(423, "Account locked", [], "ACCOUNT_LOCKED");
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      user.loginAttempts += 1;

      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      }

      await user.save();

      throw new ApiError(401, "Invalid credentials", [], "INVALID_CREDENTIALS");
    }

    // Reset login attempts on success
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    if (user.status !== "active") {
      throw new ApiError(403, "Account not active", [], "ACCOUNT_INACTIVE");
    }

    const jti = this.generateJti();

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, jti);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);

    await Session.create({
      user: user._id,
      jti,
      refreshTokenHash,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ip,
      expiresAt: this.getExpiryDate(process.env.JWT_REFRESH_EXPIRY),
    });

    return { user, accessToken, refreshToken };
  }

  // 🔄 Refresh Token (Rotation + Reuse Detection)
  async refresh(oldToken) {
    let decoded;

    try {
      decoded = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new ApiError(401, "Invalid refresh token", [], "INVALID_REFRESH");
    }

    if (decoded.type !== "refresh") {
      throw new ApiError(401, "Invalid token type", [], "INVALID_TOKEN_TYPE");
    }

    const session = await Session.findOne({ jti: decoded.jti });

    if (!session || session.isRevoked) {
      throw new ApiError(401, "Session invalid", [], "SESSION_INVALID");
    }

    const isMatch = await bcrypt.compare(oldToken, session.refreshTokenHash);

    // 🚨 Token reuse detection
    if (!isMatch) {
      await Session.updateMany({ user: decoded.id }, { isRevoked: true });

      throw new ApiError(401, "Token reuse detected", [], "TOKEN_REUSE");
    }

    const user = await User.findById(decoded.id);

    if (!user || user.status !== "active") {
      await Session.deleteOne({ jti: decoded.jti });
      throw new ApiError(
        403,
        "User inactive or deleted",
        [],
        "ACCOUNT_INACTIVE",
      );
    }

    // Update activity
    session.lastUsedAt = new Date();
    await session.save();

    // 🔄 Rotate session
    await session.deleteOne();

    const newJti = this.generateJti();

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, newJti);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);

    await Session.create({
      user: user._id,
      jti: newJti,
      refreshTokenHash,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: this.getExpiryDate(process.env.JWT_REFRESH_EXPIRY),
    });

    return { accessToken, refreshToken };
  }

  // 🚪 Logout (single session)
  async logout(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      await Session.findOneAndDelete({ jti: decoded.jti });
    } catch (err) {
      console.warn("Logout failed:", err.message);
    }
  }

  // 🚪 Logout all sessions
  async logoutAll(userId) {
    await Session.updateMany({ user: userId }, { isRevoked: true });
  }
}

export default new AuthService();
