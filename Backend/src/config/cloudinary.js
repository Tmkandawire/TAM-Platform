import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import logger from "../utils/logger.js";

/* -------------------------
   VALIDATE ENV VARIABLES
------------------------- */
const requiredEnv = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    logger.error(`❌ Missing required env variable: ${key}`);
    throw new Error(`Cloudinary configuration failed: ${key} is missing`);
  }
});

/* -------------------------
   CONFIGURE CLOUDINARY
------------------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/* -------------------------
   ENV-AWARE BASE FOLDER
------------------------- */
export const CLOUDINARY_BASE_FOLDER =
  process.env.NODE_ENV === "production" ? "tam-platform" : "tam-platform-dev";

/* -------------------------
   STORAGE ENGINE SETUP (THE MISSING PIECE)
------------------------- */
export const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Falls back to 'anonymous' if no user is found
    const userId = req.user?.id || "anonymous";

    return {
      folder: `${CLOUDINARY_BASE_FOLDER}/users/${userId}`,
      resource_type: "auto", // Automatically handles PDFs and Images
      allowed_formats: ["jpg", "jpeg", "png", "pdf"],
      public_id: `${file.fieldname}_${Date.now()}`,
    };
  },
});

/* -------------------------
   OPTIONAL HEALTH CHECK
------------------------- */
const verifyCloudinary = async () => {
  try {
    await cloudinary.api.ping();
    logger.info("✅ Cloudinary connected successfully");
  } catch (err) {
    logger.error("❌ Cloudinary connection failed", { message: err.message });
  }
};

if (process.env.NODE_ENV !== "test") {
  verifyCloudinary();
}

// Named export for storage and default export for cloudinary SDK
export { cloudinary };
export default cloudinary;
