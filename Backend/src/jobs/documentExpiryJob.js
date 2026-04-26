import cron from "node-cron";
import Profile from "../models/Profile.js";
import logger from "../utils/logger.js";

/**
 * Start document expiry background job
 */
export const startDocumentExpiryJob = () => {
  // 🚫 Disable in test
  if (process.env.NODE_ENV === "test") return;

  // Optional: control via env
  if (process.env.ENABLE_CRON !== "true") {
    logger.warn("⚠️ Document expiry job is disabled");
    return;
  }

  // ⏰ Run daily at midnight (server TZ or configured TZ)
  cron.schedule(
    "5 0 * * *",
    async () => {
      const now = new Date();

      logger.info("🕒 Running document expiry job...");

      try {
        const result = await Profile.updateMany(
          {
            isDeleted: false, // ✅ critical
            documents: {
              $elemMatch: {
                expiryDate: { $lt: now },
                status: { $ne: "expired" },
              },
            },
          },
          {
            $set: {
              "documents.$[elem].status": "expired",
            },
          },
          {
            arrayFilters: [
              {
                "elem.expiryDate": { $lt: now },
                "elem.status": { $ne: "expired" },
              },
            ],
          },
        );

        logger.info("✅ Expiry job completed", {
          modifiedCount: result.modifiedCount,
          timestamp: now.toISOString(),
        });

        // 🔔 Future: trigger notifications
        // await NotificationService.handleExpiredDocuments();
      } catch (err) {
        logger.error("❌ Expiry job failed", {
          message: err.message,
          stack: err.stack,
          timestamp: now.toISOString(),
        });
      }
    },
    {
      timezone: process.env.APP_TIMEZONE || "Africa/Blantyre", // ✅ important
    },
  );
};
