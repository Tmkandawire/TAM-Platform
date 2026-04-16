import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
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
      select: false, // Ensures password is hidden from queries by default
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
      default: "pending", // New members start as pending until TAM approval
      index: true,
    },

    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // 🔐 Security fields for brute-force protection
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if account is active (for authService)
userSchema.methods.isActive = function () {
  return this.status === "active";
};

// 🔐 Account lock check
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Hide sensitive data when converting to JSON (Global safety)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
