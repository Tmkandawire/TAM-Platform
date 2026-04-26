import mongoose from "mongoose";

/* -------------------------
   CONSTANTS
------------------------- */
const REQUIRED_DOCS = [
  "nationalId",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

const ID_DOCS = ["nationalId", "passport"];

/* -------------------------
   DOCUMENT SUB-SCHEMA
------------------------- */
const documentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: [
        "nationalId",
        "passport",
        "utilityBill",
        "businessCert",
        "tinCertificate",
      ],
      required: true,
      index: true,
    },

    url: {
      type: String,
      required: true,
      match: [/^https?:\/\/.+/, "Invalid document URL"],
    },

    publicId: {
      type: String,
      required: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },

    /* -------------------------
       COMPLIANCE FIELDS
    ------------------------- */

    issueDate: {
      type: Date,
      required: function () {
        return this.documentType === "utilityBill";
      },
      validate: {
        validator: function (value) {
          if (this.documentType !== "utilityBill") return true;

          // Must be within last 3 months
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          return value >= threeMonthsAgo;
        },
        message: "Utility bill must be issued within the last 3 months.",
      },
    },

    expiryDate: {
      type: Date,
      validate: {
        validator: function (value) {
          if (!ID_DOCS.includes(this.documentType)) return true;

          // Must exist
          if (!value) return false;

          // Must be in the future
          return value > new Date();
        },
        message: "Valid future expiry date is required for ID documents.",
      },
    },

    /* -------------------------
       WORKFLOW
    ------------------------- */

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    verifiedAt: Date,
  },
  { _id: true },
);

/* -------------------------
   MAIN PROFILE SCHEMA
------------------------- */
const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    tinNumber: {
      type: String,
      trim: true,
    },

    documents: {
      type: [documentSchema],
      default: [],
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/* -------------------------
   VIRTUALS
------------------------- */

// ✅ Check required KYC completeness
profileSchema.virtual("isComplete").get(function () {
  const uploadedTypes = this.documents
    .filter((doc) => doc.status !== "rejected")
    .map((doc) => doc.documentType);

  return REQUIRED_DOCS.every((type) => uploadedTypes.includes(type));
});

// ✅ Check if any doc expired
profileSchema.virtual("hasExpiredDocs").get(function () {
  return this.documents.some(
    (doc) => doc.expiryDate && doc.expiryDate < new Date(),
  );
});

// ✅ Check if ALL required documents are officially APPROVED
profileSchema.virtual("isVerified").get(function () {
  const approvedTypes = this.documents
    .filter((doc) => doc.status === "approved")
    .map((doc) => doc.documentType);

  return REQUIRED_DOCS.every((type) => approvedTypes.includes(type));
});

/* -------------------------
   INSTANCE METHOD (CRITICAL)
------------------------- */
profileSchema.methods.upsertDocument = function (newDoc) {
  const index = this.documents.findIndex(
    (doc) => doc.documentType === newDoc.documentType,
  );

  if (index > -1) {
    const existingDoc = this.documents[index].toObject();

    this.documents.set(index, {
      ...existingDoc,
      ...newDoc,
      status: "pending",
      rejectionReason: null,
      verifiedAt: null,
      verifiedBy: null,
      uploadedAt: new Date(),
    });
  } else {
    this.documents.push(newDoc);
  }
};

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
