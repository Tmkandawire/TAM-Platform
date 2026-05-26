import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ALL_ROLES, ROLES } from "../constants/roles.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Please add an email"],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        "Please use a valid email address",
      ],
    },

    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    role: {
      type: String,
      enum: [...ALL_ROLES],
      default: ROLES.MEMBER,
      index: true,
    },

    status: {
      type: String,
      // "pending"   — newly registered, awaiting admin review.
      // "active"    — approved, full access granted.
      // "rejected"  — application reviewed and denied at onboarding.
      //               Distinct from "suspended" (previously active, access revoked).
      //               Kept separate to support reporting, reapplication flows,
      //               and notification routing without ambiguity.
      // "suspended" — previously active, access revoked by admin.
      enum: ["pending", "active", "suspended", "rejected", "deleted"],
      default: "pending",
      index: true,
    },

    // Approval metadata (admin workflow)
    approvedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Rejection metadata (admin workflow)
    // Populated when status transitions to "rejected".
    // Null for all other statuses.
    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // Security
    loginAttempts: {
      type: Number,
      default: 0,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    // Audit
    lastLoginAt: Date,

    // Communication preferences
    // documentUpdates + accountAlerts default true — members must receive
    // KYC decisions and account status changes by default.
    // broadcasts defaults false — TAM announcements are opt-in.
    notificationPreferences: {
      documentUpdates: { type: Boolean, default: true },
      accountAlerts: { type: Boolean, default: true },
      broadcasts: { type: Boolean, default: true },
    },

    // Password reset
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* -------------------------
   INDEXES
------------------------- */

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ email: 1, isDeleted: 1 });

/* -------------------------
   MIDDLEWARE
------------------------- */

userSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/* -------------------------
   METHODS
------------------------- */

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.isActive = function () {
  return this.status === "active";
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();

  // Sensitive auth/security fields
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.tokenVersion;

  // Internal security state
  delete obj.loginAttempts;
  delete obj.lockUntil;

  // Optional admin workflow metadata
  delete obj.approvedBy;
  delete obj.rejectedBy;

  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
