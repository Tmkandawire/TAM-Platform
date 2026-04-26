import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { cloudinaryUpload } from "../middleware/cloudinaryUploadMiddleware.js";
import { transformDocuments } from "../middleware/documentTransformMiddleware.js";
import { uploadKYCDocuments } from "../controllers/documentController.js";
import { uploadRateLimiter } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

/* -------------------------
   ROUTE: KYC DOCUMENT UPLOAD
------------------------- */
/**
 * @route   POST /api/v1/documents/upload
 * @desc    Upload or replace KYC documents
 * @access  Private (Authenticated users only)
 *
 * PIPELINE:
 * 1. protect → ensures authenticated user
 * 2. authRateLimiter → prevents abuse / Cloudinary cost spikes
 * 3. cloudinaryUpload → handles file upload (Multer + Cloudinary)
 * 4. transformDocuments → normalizes + validates metadata
 * 5. uploadKYCDocuments → persists to DB (service layer)
 */
router.post(
  "/upload",
  protect,
  uploadRateLimiter,
  authRateLimiter,
  cloudinaryUpload,
  transformDocuments,
  uploadKYCDocuments,
);

/* -------------------------
   HEALTH / DEBUG HOOK (OPTIONAL BUT PRODUCTION USEFUL)
------------------------- */
// Helps test auth + pipeline without files
router.get("/ping", protect, (req, res) => {
  res.status(200).json({ success: true, message: "Document route active" });
});

export default router;
