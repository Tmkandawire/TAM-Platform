import { cloudinary } from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

class FileService {
  /* -------------------------
     VALIDATION HELPERS
  ------------------------- */
  validatePublicId(publicId) {
    if (!publicId || typeof publicId !== "string") {
      throw new ApiError(400, "Invalid publicId", [], "INVALID_PUBLIC_ID");
    }
  }

  /* -------------------------
     DELETE SINGLE FILE
  ------------------------- */
  async deleteFile(publicId, context = {}) {
    try {
      this.validatePublicId(publicId);

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "auto",
      });

      logger.info("🧹 File deleted from Cloudinary", {
        publicId,
        result: result.result,
        ...context,
      });

      return {
        success: result.result === "ok",
        result: result.result,
      };
    } catch (err) {
      logger.warn("⚠️ File deletion failed", {
        publicId,
        error: err.message,
        ...context,
      });

      return { success: false, error: err.message };
    }
  }

  /* -------------------------
     SAFE DELETE (NON-BLOCKING)
  ------------------------- */
  async safeDelete(publicId, context = {}) {
    if (!publicId) return;

    try {
      await this.deleteFile(publicId, context);
    } catch (err) {
      // 🔒 Never throw — cleanup must NEVER break business flow
      logger.warn("⚠️ Safe delete failed silently", {
        publicId,
        error: err.message,
        ...context,
      });
    }
  }

  /* -------------------------
     DELETE MULTIPLE FILES (BATCH)
  ------------------------- */
  async deleteBatch(publicIds = [], context = {}) {
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    const results = await Promise.allSettled(
      publicIds.map((id) => this.deleteFile(id, context)),
    );

    const summary = {
      success: true,
      deleted: 0,
      failed: 0,
    };

    results.forEach((res) => {
      if (res.status === "fulfilled" && res.value.success) {
        summary.deleted++;
      } else {
        summary.failed++;
      }
    });

    logger.info("🧹 Batch deletion complete", {
      total: publicIds.length,
      deleted: summary.deleted,
      failed: summary.failed,
      ...context,
    });

    return summary;
  }

  /* -------------------------
     DELETE ALL USER FILES (FUTURE SAFE)
  ------------------------- */
  async deleteUserFolder(userId) {
    if (!userId) {
      throw new ApiError(400, "User ID required", [], "INVALID_USER_ID");
    }

    try {
      const folderPath = `tam_platform/users/${userId}`;

      const result =
        await cloudinary.api.delete_resources_by_prefix(folderPath);

      logger.info("🧹 User folder cleanup complete", {
        userId,
        folder: folderPath,
        deleted: Object.keys(result.deleted || {}).length,
      });

      return result;
    } catch (err) {
      logger.error("❌ Failed to delete user folder", {
        userId,
        error: err.message,
      });

      throw new ApiError(
        500,
        "Failed to clean user files",
        [],
        "FILE_CLEANUP_FAILED",
      );
    }
  }
}

export default new FileService();
