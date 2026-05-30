import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { ValidationError, ServiceUnavailableError } from "../errors/index.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        ValidationError.dto(
          "file",
          "Only JPEG, PNG, and WebP images are allowed.",
          "INVALID_VALUE",
        ),
      );
    }
    cb(null, true);
  },
}).single("profilePicture");

export const profilePictureUpload = (req, res, next) => {
  multerUpload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          ValidationError.dto(
            "file",
            "Profile picture must be under 5MB.",
            "TOO_LARGE",
          ),
        );
      }
      return next(ValidationError.dto("file", err.message, "INVALID_VALUE"));
    }
    if (err) return next(err);
    if (!req.file)
      return next(
        new ValidationError.dto("file", "No image file provided.", "REQUIRED"),
      );

    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `tam/profile-pictures`,
            public_id: `user-${req.user.id}`,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: "fill", gravity: "face" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        Readable.from(req.file.buffer).pipe(uploadStream);
      });

      req.cloudinaryResult = result;
      next();
    } catch (uploadErr) {
      next(
        new ServiceUnavailableError("Image upload failed. Please try again."),
      );
    }
  });
};
