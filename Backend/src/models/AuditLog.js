import mongoose from "mongoose";
import { ALL_AUDIT_ACTIONS } from "../constants/auditActions.js";

const auditLogSchema = new mongoose.Schema(
  {
    // What happened
    action: {
      type: String,
      enum: [...ALL_AUDIT_ACTIONS],
      required: true,
      index: true,
    },

    // Who performed the action
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Who or what was affected (user or broadcast)
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    // Target type — tells consumers what targetId refers to
    targetType: {
      type: String,
      enum: ["user", "broadcast", "document"],
      default: null,
    },

    // Document-level tracking (KYC)
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    documentType: {
      type: String,
      enum: [
        "nationalId",
        "passport",
        "utilityBill",
        "businessCert",
        "tinCertificate",
      ],
      default: null,
    },

    // State transition tracking
    previousStatus: {
      type: String,
      enum: [
        "pending",
        "active",
        "suspended",
        "approved",
        "rejected",
        "expired",
        "resubmission_required",
      ],
      default: null,
    },

    newStatus: {
      type: String,
      enum: [
        "pending",
        "active",
        "suspended",
        "approved",
        "rejected",
        "expired",
        "resubmission_required",
      ],
      default: null,
    },

    // Human-readable explanation
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // Request context (security + forensics)
    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    // Outcome
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      default: "SUCCESS",
      index: true,
    },

    // Flexible extra data — plain object, not Map, so nested values are preserved
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
