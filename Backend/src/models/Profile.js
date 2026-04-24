import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    businessName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },

    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    taxId: {
      type: String,
      trim: true,
    },

    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      enum: ["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"],
      required: true,
      index: true,
    },

    fleetSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    vehicleTypes: [
      {
        type: String,
        enum: ["Truck", "Tanker", "Van", "Minibus", "Other"],
      },
    ],

    documents: [
      {
        title: { type: String, required: true },
        url: {
          type: String,
          required: true,
          match: [/^https?:\/\/.+/, "Invalid URL"],
        },
        documentType: {
          type: String,
          enum: ["BusinessLicense", "Bluebook", "IdentityProof", "Other"],
        },
        uploadedAt: { type: Date, default: Date.now },
        isVerified: { type: Boolean, default: false },
      },
    ],

    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: Date,

    rejectionReason: {
      type: String,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    membershipType: {
      type: String,
      enum: ["Small Scale", "Medium Scale", "Corporate"],
      default: "Small Scale",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Text search
profileSchema.index({
  businessName: "text",
  contactPerson: "text",
});

// Directory queries
profileSchema.index({ city: 1, isApproved: 1, isDeleted: 1 });

// Virtual
profileSchema.virtual("isComplete").get(function () {
  return !!(
    this.businessName &&
    this.registrationNumber &&
    this.phoneNumber &&
    this.documents &&
    this.documents.length > 0
  );
});

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
