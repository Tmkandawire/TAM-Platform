import mongoose from "mongoose";

/* -------------------------
   CONSTANTS
------------------------- */
const ACTIONS = [
  "APPROVE_DOC",
  "REJECT_DOC",
  "REQUEST_RESUBMISSION",
  "UPLOAD_DOC",
  "DELETE_DOC",
];

/* -------------------------
   SCHEMA
------------------------- */
const auditLogSchema = new mongoose.Schema(
  {
    // 🔐 What happened
    action: {
      type: String,
      enum: ACTIONS,
      required: true,
      index: true,
    },

    // 👤 Who performed the action (Admin/User)
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 🎯 Who/what was affected
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // 📄 Document-level tracking (critical for KYC)
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
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
    },

    // 🔄 State tracking (very important)
    previousStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
    },

    newStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
    },

    // 📝 Human-readable explanation
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // 🌐 Request context (security + forensics)
    ip: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    // 📊 Outcome tracking
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      default: "SUCCESS",
      index: true,
    },

    // 🔍 Flexible but controlled extra data
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

/* -------------------------
   INDEXES (CRITICAL)
------------------------- */
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

/* -------------------------
   OPTIONAL: SOFT TTL STRATEGY
------------------------- */
// ⚠️ Do NOT auto-delete in strict compliance environments
// Instead: archive logs externally (S3, BigQuery, etc)

/*
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365 } // 1 year if needed
);
*/

export default mongoose.model("AuditLog", auditLogSchema);
