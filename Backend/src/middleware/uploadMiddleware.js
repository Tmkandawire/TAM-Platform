import multer from "multer";
import { storage } from "../config/cloudinary.js"; // ✅ Consume the centralized engine
import ApiError from "../utils/ApiError.js";

/* -------------------------
   DOCUMENT TYPES
------------------------- */
const DOCUMENT_FIELDS = [
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

/* -------------------------
   MIME VALIDATION
------------------------- */
const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];

const fileFilter = (req, file, cb) => {
  if (!DOCUMENT_FIELDS.includes(file.fieldname)) {
    return cb(new ApiError(400, "Invalid document field", [], "INVALID_FIELD"));
  }

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        "Only JPG, PNG, and PDF files are allowed",
        [],
        "INVALID_FILE_TYPE",
      ),
    );
  }

  cb(null, true);
};

/* -------------------------
   MULTER INSTANCE
------------------------- */
const upload = multer({
  storage, // ✅ Clean: One source of truth for Cloudinary logic
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 5,
  },
});

/* -------------------------
   DOCUMENT UPLOAD HANDLER
------------------------- */
export const uploadDocuments = upload.fields(
  DOCUMENT_FIELDS.map((field) => ({
    name: field,
    maxCount: 1,
  })),
);

export default upload;
