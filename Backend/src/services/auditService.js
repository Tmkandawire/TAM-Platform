import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

class AuditService {
  /**
   * Persist a structured audit event.
   *
   * @param {Object}  params
   * @param {string}  params.action       - Must be a value from AUDIT_ACTIONS
   * @param {*}       params.actorId      - ID of the user performing the action
   * @param {*}       params.targetId     - ID of the affected resource
   * @param {string}  params.targetType   - "user" | "broadcast" | "document"
   * @param {string}  [params.ip]
   * @param {string}  [params.userAgent]
   * @param {string}  [params.reason]
   * @param {string}  [params.previousStatus]
   * @param {string}  [params.newStatus]
   * @param {Object}  [params.metadata]
   * @param {string}  [params.status]     - "SUCCESS" | "FAILURE"
   * @param {Object}  [session]           - Mongoose session for transactional logging
   */
  async log(
    {
      action,
      actorId,
      targetId = null,
      targetType = null,
      ip = null,
      userAgent = null,
      reason = null,
      previousStatus = null,
      newStatus = null,
      metadata = {},
      status = "SUCCESS",
    },
    session = null,
  ) {
    try {
      const logData = {
        action,
        actorId,
        targetId,
        targetType,
        ip,
        userAgent,
        reason,
        previousStatus,
        newStatus,
        metadata,
        status,
      };

      const options = session ? { session } : {};
      await AuditLog.create([logData], options);

      logger.info(
        `Audit [${status}]: ${action} | Actor: ${actorId ?? "System"} | Target: ${targetId ?? "N/A"} (${targetType ?? "unknown"})`,
      );
    } catch (err) {
      // Audit failure must never crash the caller
      logger.error({
        message: "Audit log failed to save to database",
        error: err.message,
        action,
        actorId,
        targetId,
      });
    }
  }
}

export default new AuditService();
