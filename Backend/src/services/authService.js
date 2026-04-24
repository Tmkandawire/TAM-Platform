import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import ms from "ms";

import User from "../models/User.js";
import Session from "../models/Session.js";
import ApiError from "../utils/ApiError.js";

const MAX_SESSIONS = 5;

// Pre-generated hash to prevent timing attacks
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeOZ7Z9j/3GQ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z";

class AuthService {
  /* -------------------------
     HELPERS
  ------------------------- */

  generateJti() {
    return crypto.randomUUID();
  }

  getExpiryDate(expiry) {
    return new Date(Date.now() + ms(expiry || "7d"));
  }

  generateAccessToken(user, jti) {
    return jwt.sign(
      {
        id: user._id,
        role: user.role,
        jti,
        tokenVersion: user.tokenVersion || 0,
        type: "access",
      },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
      },
    );
  }

  generateRefreshToken(user, jti) {
    return jwt.sign(
      {
        id: user._id,
        jti,
        tokenVersion: user.tokenVersion || 0,
        type: "refresh",
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d",
      },
    );
  }

  async enforceSessionLimit(userId) {
    const count = await Session.countDocuments({ user: userId });

    if (count >= MAX_SESSIONS) {
      await Session.findOneAndDelete({ user: userId }).sort({ createdAt: 1 });
    }
  }

  /* -------------------------
     REGISTER
  ------------------------- */

  async register(userData) {
    const { email, password, role } = userData;

    const existingUser = await User.findOne({
      email,
      isDeleted: false,
    });

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

  /* -------------------------
     LOGIN
  ------------------------- */

  async login(email, password, meta) {
    const user = await User.findOne({
      email,
      isDeleted: false,
    }).select("+password");

    // 🔐 Prevent timing attacks
    const isMatch = user
      ? await user.matchPassword(password)
      : await bcrypt.compare(password, DUMMY_HASH);

    if (!user || !isMatch) {
      if (user) {
        user.loginAttempts += 1;

        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        await user.save();
      }

      throw new ApiError(401, "Invalid credentials", [], "INVALID_CREDENTIALS");
    }

    // 🔒 Lock check
    if (user.isLocked()) {
      throw new ApiError(423, "Account locked", [], "ACCOUNT_LOCKED");
    }

    // Reset attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    if (!user.isActive()) {
      throw new ApiError(403, "Account not active", [], "ACCOUNT_INACTIVE");
    }

    // Session control
    await this.enforceSessionLimit(user._id);

    const jti = this.generateJti();

    const accessToken = this.generateAccessToken(user, jti);
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

  /* -------------------------
     REFRESH (ROTATION + REUSE DETECTION)
  ------------------------- */

  async refresh(oldToken, meta) {
    let decoded;

    try {
      decoded = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new ApiError(401, "Invalid refresh token", [], "INVALID_REFRESH");
    }

    if (decoded.type !== "refresh") {
      throw new ApiError(401, "Invalid token type", [], "INVALID_TOKEN_TYPE");
    }

    // 🔥 Atomic delete to prevent race condition
    const session = await Session.findOneAndDelete({ jti: decoded.jti });

    if (!session || session.isRevoked) {
      throw new ApiError(401, "Session invalid", [], "SESSION_INVALID");
    }

    const isMatch = await bcrypt.compare(oldToken, session.refreshTokenHash);

    // 🚨 Reuse detection
    if (!isMatch) {
      await Session.updateMany({ user: decoded.id }, { isRevoked: true });

      throw new ApiError(401, "Token reuse detected", [], "TOKEN_REUSE");
    }

    const user = await User.findById(decoded.id);

    if (!user || user.isDeleted || !user.isActive()) {
      throw new ApiError(
        403,
        "User inactive or deleted",
        [],
        "ACCOUNT_INACTIVE",
      );
    }

    // Optional: device/IP validation
    if (meta?.ip && session.ipAddress && meta.ip !== session.ipAddress) {
      throw new ApiError(401, "Suspicious session", [], "SESSION_MISMATCH");
    }

    const newJti = this.generateJti();

    const accessToken = this.generateAccessToken(user, newJti);
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

  /* -------------------------
     LOGOUT (SINGLE SESSION)
  ------------------------- */

  async logout(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      await Session.findOneAndUpdate(
        { jti: decoded.jti },
        { isRevoked: true },
        { returnDocument: "after" },
      );
    } catch {
      // silent
    }
  }

  /* -------------------------
     LOGOUT ALL DEVICES
  ------------------------- */

  async logoutAll(userId) {
    await Session.updateMany({ user: userId }, { isRevoked: true });

    // 🔥 Invalidate all tokens instantly
    await User.findByIdAndUpdate(userId, {
      $inc: { tokenVersion: 1 },
    });
  }
}

export default new AuthService();
