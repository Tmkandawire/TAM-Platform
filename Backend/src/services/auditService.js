import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

class AuditService {
  /**
   * 📝 Log a system action
   * @param {Object} logParams - The log details
   * @param {Object} [session=null] - Optional MongoDB session for transactional logging
   */
  async log(
    {
      action,
      user = null,
      target = null,
      metadata = {},
      ip,
      userAgent,
      status = "SUCCESS",
    },
    session = null,
  ) {
    try {
      const logData = {
        action,
        user,
        target,
        metadata,
        ip,
        userAgent,
        status,
      };

      // When using a session, .create() must take an array as the first argument
      await AuditLog.create([logData], { session });

      // Log to Winston for real-time monitoring
      logger.info(
        `Audit Log [${status}]: ${action} | Actor: ${user || "System"} | Target: ${target || "N/A"}`,
      );
    } catch (err) {
      logger.error({
        message: "Audit log failed to save to database",
        error: err.message,
        action,
      });
    }
  }
}

export default new AuditService();
