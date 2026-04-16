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
    // Business Identity
    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: [true, "MRA or Registrar of Companies number is required"],
      unique: true,
      trim: true,
    },
    taxId: {
      type: String,
      trim: true,
    },

    // Contact Information
    contactPerson: {
      type: String,
      required: [true, "Contact person name is required"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    physicalAddress: {
      type: String,
      required: [true, "Physical address is required"],
    },
    city: {
      type: String,
      enum: ["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"],
      required: [true, "Operating city is required"],
      index: true,
    },

    // Fleet & Operational Data
    fleetSize: {
      type: Number,
      default: 0,
      min: [0, "Fleet size cannot be negative"],
    },
    vehicleTypes: [
      {
        type: String,
        enum: ["Truck", "Tanker", "Van", "Minibus", "Other"],
      },
    ],

    // Documentation (Cloudinary URLs for Bluebooks/IDs)
    documents: [
      {
        title: { type: String, required: true },
        url: { type: String, required: true },
        documentType: {
          type: String,
          enum: ["BusinessLicense", "Bluebook", "IdentityProof", "Other"],
        },
        uploadedAt: { type: Date, default: Date.now },
        isVerified: { type: Boolean, default: false },
      },
    ],

    // Verification Status
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },

    // Association Specifics
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

// Virtual for checking if the profile is fully complete
profileSchema.virtual("isComplete").get(function () {
  return !!(
    this.businessName &&
    this.registrationNumber &&
    this.phoneNumber &&
    this.documents.length > 0
  );
});

// Index for geo-based or city-based searches for the Member Directory
profileSchema.index({ city: 1, businessName: 1 });

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
