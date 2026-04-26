import multer from "multer";
import { storage } from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";

/* -------------------------
   CONSTANTS (SINGLE SOURCE OF TRUTH)
------------------------- */
const DOCUMENT_FIELDS = [
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILES = DOCUMENT_FIELDS.length;

/* -------------------------
   FILE FILTER (HARDENED)
------------------------- */
const fileFilter = (req, file, cb) => {
  // ✅ 1. Validate field name (prevents arbitrary uploads)
  if (!DOCUMENT_FIELDS.includes(file.fieldname)) {
    return cb(
      new ApiError(
        400,
        `Invalid document field: ${file.fieldname}`,
        [],
        "INVALID_FIELD",
      ),
      false,
    );
  }

  // ✅ 2. Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        "Invalid file type. Only JPG, PNG, and PDF are allowed.",
        [],
        "INVALID_FILE_TYPE",
      ),
      false,
    );
  }

  cb(null, true);
};

/* -------------------------
   MULTER INSTANCE
------------------------- */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES, // ✅ prevents abuse (DoS protection)
  },
});

/* -------------------------
   EXPORTED MIDDLEWARE
------------------------- */
export const cloudinaryUpload = upload.fields(
  DOCUMENT_FIELDS.map((field) => ({
    name: field,
    maxCount: 1,
  })),
);

/* -------------------------
   EXPORT CONSTANTS (REUSE)
------------------------- */
export { DOCUMENT_FIELDS };
