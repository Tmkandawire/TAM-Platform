import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
    },

    userAgent: String,
    ipAddress: String,

    isRevoked: {
      type: Boolean,
      default: false,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true },
);

// Optimized queries
sessionSchema.index({ user: 1, isRevoked: 1 });
sessionSchema.index({ expiresAt: 1, isRevoked: 1 });

export default mongoose.model("Session", sessionSchema);
