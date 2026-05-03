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
      enum: ["pending", "active", "suspended"],
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

    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // Security
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    // Audit
    lastLoginAt: Date,

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false, // removes __v from all documents
  },
);

/* -------------------------
   INDEXES
------------------------- */

// Unique email constraint
userSchema.index({ email: 1 }, { unique: true });

// Compound index for soft-delete queries — makes the single email index redundant, so we omit it
userSchema.index({ email: 1, isDeleted: 1 });

/* -------------------------
   MIDDLEWARE
------------------------- */

// Global soft-delete filter — intentionally applies to all find* operations
// including findById, findOne, findByIdAndUpdate, etc.
userSchema.pre(/^find/, function () {
  this.where({ isDeleted: false });
});

// Hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/* -------------------------
   METHODS
------------------------- */

// Compare entered password against stored hash
userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Check if account is active
userSchema.methods.isActive = function () {
  return this.status === "active";
};

// Check if account is temporarily locked
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Strip sensitive fields from serialized output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
