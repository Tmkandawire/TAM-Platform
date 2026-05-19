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
   STORAGE ENGINE
------------------------- */
export const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = req.user?.id || "anonymous";

    // Determine resource_type explicitly based on MIME type.
    // "auto" causes Cloudinary to classify PDFs as "raw", which generates
    // authenticated-only URLs. Setting "image" for images and "raw" for
    // PDFs with upload type "upload" ensures all files get public URLs.
    const isPdf = file.mimetype === "application/pdf";

    return {
      folder: `${CLOUDINARY_BASE_FOLDER}/users/${userId}`,
      resource_type: "image",
      type: "upload",
      allowed_formats: isPdf ? ["pdf"] : ["jpg", "jpeg", "png"],
      public_id: `${file.fieldname}_${Date.now()}`,
      format: isPdf ? "pdf" : undefined,
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

export { cloudinary };
export default cloudinary;
