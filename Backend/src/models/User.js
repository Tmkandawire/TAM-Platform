import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
      enum: ["admin", "member"],
      default: "member",
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
      index: true,
    },

    // ✅ Approval metadata (ADMIN WORKFLOW)
    approvedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin who approved
      default: null,
    },

    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // 🔐 Security
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    // 📊 Audit
    lastLoginAt: Date,

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

/* -------------------------
   INDEXES
------------------------- */

// Unique email (case-insensitive recommended later via collation)
userSchema.index({ email: 1 }, { unique: true });

// Compound index for soft-delete queries
userSchema.index({ email: 1, isDeleted: 1 });

/* -------------------------
   MIDDLEWARE
------------------------- */

// ✅ FIXED: No next() usage
userSchema.pre(/^find/, function () {
  this.where({ isDeleted: false });
});

// Hash password
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/* -------------------------
   METHODS
------------------------- */

// Compare password
userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Account status
userSchema.methods.isActive = function () {
  return this.status === "active";
};

// Lock check
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Hide sensitive data
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
