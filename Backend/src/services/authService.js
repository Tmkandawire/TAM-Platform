import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import ms from "ms";

import User from "../models/User.js";
import Session from "../models/Session.js";
import ApiError from "../utils/ApiError.js";
import notificationService from "./NotificationService.js";
import { NOTIFICATION_TYPE } from "../constants/notificationTypes.js";

const MAX_SESSIONS = 5;

let _dummyHash = null;

async function getDummyHash() {
  if (!_dummyHash) {
    _dummyHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  }

  return _dummyHash;
}

class AuthService {
  constructor() {
    if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
      process.stderr.write(
        "[AuthService] FATAL: JWT_ACCESS_SECRET or JWT_REFRESH_SECRET is not set.\n",
      );

      process.exit(1);
    }

    // Optional hardening:
    if (
      process.env.JWT_ACCESS_SECRET.length < 32 ||
      process.env.JWT_REFRESH_SECRET.length < 32
    ) {
      process.stderr.write(
        "[AuthService] FATAL: JWT secrets must be at least 32 characters long.\n",
      );

      process.exit(1);
    }
  }

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

  /**
   * createSession — shared session-creation logic used by both login and
   * register. Extracted so register can issue tokens without going through
   * the isActive() check that login enforces (a freshly registered user has
   * status "pending" and would fail that check).
   *
   * @param {Document} user  - Mongoose User document
   * @param {object}   meta  - { ip, userAgent }
   * @returns {{ accessToken: string, refreshToken: string }}
   */
  async createSession(user, meta) {
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

    return { accessToken, refreshToken };
  }

  /* -------------------------
     REGISTER
  ------------------------- */

  /**
   * Creates a new user account and immediately opens a session so the
   * frontend can redirect straight to /onboarding without a separate login.
   *
   * The isActive() check is intentionally skipped here — a newly registered
   * user has status "pending" by default and must reach onboarding before
   * an admin can approve them. Blocking session creation here would create
   * the exact gap we are eliminating (register → login gap).
   *
   * @param {object} userData - { email, password, role? }
   * @param {object} meta     - { ip, userAgent }
   * @returns {{ user, accessToken, refreshToken }}
   */
  async register(userData, meta) {
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

    // Auto-login: create a session immediately so the controller can set
    // auth cookies and the frontend lands on /onboarding already authenticated.
    const { accessToken, refreshToken } = await this.createSession(user, meta);

    return { user, accessToken, refreshToken };
  }

  /* -------------------------
     LOGIN
  ------------------------- */

  async login(email, password, meta) {
    const user = await User.findOne({
      email,
      isDeleted: false,
    }).select("+password");

    // 🔐
    const hashToUse = user ? null : await getDummyHash();

    const isMatch = user
      ? await user.matchPassword(password)
      : await bcrypt.compare(password, hashToUse);

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
    const isFirstLogin = !user.lastLoginAt;
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // isActive() check remains here — existing users logging in must be
    // active. Pending users who haven't completed onboarding will hit this
    // and receive ACCOUNT_INACTIVE, which the frontend routes to /onboarding.
    if (!user.isActive()) {
      throw new ApiError(403, "Account not active", [], "ACCOUNT_INACTIVE");
    }

    const { accessToken, refreshToken } = await this.createSession(user, meta);

    if (isFirstLogin) {
      try {
        await notificationService.createNotification({
          user: user._id.toString(),
          type: NOTIFICATION_TYPE.ACCOUNT_ACTION,
          title: "Welcome to TAM",
          message:
            "Your membership is now active. Welcome to the TAM member portal. You can manage your profile, upload documents, and stay updated via this notifications feed.",
          metadata: { action: "FIRST_LOGIN" },
        });
      } catch (_notifErr) {
        // Welcome notification failure must never block login.
      }
    }

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
