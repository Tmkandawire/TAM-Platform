/**
 * @file BroadcastService.js
 */
import mongoose from "mongoose";
import User from "../models/User.js";
import Broadcast, {
  BROADCAST_STATUS,
  BROADCAST_AUDIENCE_TYPE,
} from "../models/Broadcast.js";
import { NOTIFICATION_TYPE } from "../constants/notificationTypes.js";
import notificationService from "./NotificationService.js";
import emailService from "../email/EmailService.js";
import broadcastFactory from "../document/broadcastFactory.js";
import logger from "../utils/logger.js";
import auditService from "./auditService.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";

const MAX_BROADCAST_BATCH_SIZE = 500;
const MONGO_DUPLICATE_KEY_CODE = 11000;
const STATUS_UPDATE_MAX_RETRIES = 3;

export class BroadcastValidationError extends TypeError {
  constructor(message, field = null) {
    super(`BroadcastService: ${message}`);
    this.name = "BroadcastValidationError";
    this.code = "BROADCAST_VALIDATION_ERROR";
    this.field = field;
  }
}

export class BroadcastDuplicateError extends Error {
  constructor(idempotencyKey) {
    super(
      `BroadcastService: broadcast with idempotencyKey "${idempotencyKey}" already exists.`,
    );
    this.name = "BroadcastDuplicateError";
    this.code = "BROADCAST_DUPLICATE";
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BroadcastValidationError(
      `"${name}" must be a non-empty string.`,
      name,
    );
  }
  return value.trim();
}

function sanitiseMetadata(metadata) {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new BroadcastValidationError(
      '"metadata" must be a plain object.',
      "metadata",
    );
  }
  try {
    return Object.freeze(JSON.parse(JSON.stringify(metadata)));
  } catch {
    throw new BroadcastValidationError(
      '"metadata" must be JSON-serializable (no circular refs).',
      "metadata",
    );
  }
}

function buildAudienceQuery(filters = {}) {
  const query = {};
  let filterCount = 0;

  const allowedKeys = ["roles", "statuses", "userIds"];
  const unknownKeys = Object.keys(filters).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new BroadcastValidationError(
      `Unsupported audience filter keys: ${unknownKeys.join(", ")}.`,
      "audienceFilters",
    );
  }

  if (filters.roles !== undefined) {
    if (!Array.isArray(filters.roles) || filters.roles.length === 0) {
      throw new BroadcastValidationError(
        "roles must be a non-empty array.",
        "roles",
      );
    }
    query.role = { $in: [...new Set(filters.roles)] };
    filterCount++;
  }

  if (filters.statuses !== undefined) {
    if (!Array.isArray(filters.statuses) || filters.statuses.length === 0) {
      throw new BroadcastValidationError(
        "statuses must be a non-empty array.",
        "statuses",
      );
    }
    query.status = { $in: [...new Set(filters.statuses)] };
    filterCount++;
  }

  if (filters.userIds !== undefined) {
    if (!Array.isArray(filters.userIds) || filters.userIds.length === 0) {
      throw new BroadcastValidationError(
        "userIds must be a non-empty array.",
        "userIds",
      );
    }
    const uniqueValidIds = [...new Set(filters.userIds)].filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (uniqueValidIds.length === 0) {
      throw new BroadcastValidationError(
        "userIds contains no valid Mongo ObjectId values.",
        "userIds",
      );
    }
    query._id = { $in: uniqueValidIds };
    filterCount++;
  }

  return { query, filterCount };
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function safeAbort(session, originalError) {
  try {
    await session.abortTransaction();
  } catch (abortError) {
    logger.error("BroadcastService: failed to abort transaction after error.", {
      abortError,
      originalError,
    });
  }
}

/**
 * Retry an async operation up to `maxAttempts` times with exponential backoff.
 * Logs a warning on each failed attempt and an error if all attempts are exhausted.
 *
 * @param {() => Promise<void>} fn
 * @param {number}              maxAttempts
 * @param {string}              context  - Label used in log output.
 */
async function withRetry(fn, maxAttempts, context) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(`${context}: attempt ${attempt}/${maxAttempts} failed.`, {
        error,
      });
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * 2 ** (attempt - 1)),
        );
      }
    }
  }
  // All attempts exhausted — log before rethrowing so the failure
  // is always visible in logs even if the caller does not log the caught error.
  logger.error(`${context}: all ${maxAttempts} attempts exhausted.`, {
    error: lastError,
  });
  throw lastError;
}

/**
 * Dispatch broadcast emails in batches and collect failure counts.
 *
 * sendBulkEmails() collects all per-batch failures into an AggregateError
 * before throwing — a single failed recipient does not abort the batch.
 * We sum .errors.length across all batches to get the total failed count,
 * then continue to the next batch regardless.
 *
 * Email dispatch is intentionally outside the notification transaction:
 * notifications are already committed and visible to users. Email is a
 * best-effort delivery channel — failures here set PARTIALLY_FAILED on the
 * broadcast record but do NOT roll back persisted notifications.
 *
 * @param {ReadonlyArray<Object>} payloads    - Email payloads from broadcastFactory.forAllEmailRecipients.
 * @param {number}                batchSize
 * @param {string}                broadcastId - Used only for logging context.
 * @returns {Promise<number>} Total number of failed email dispatches across all batches.
 */
async function dispatchBroadcastEmails(payloads, batchSize, broadcastId) {
  let totalFailed = 0;

  for (const batch of chunk(payloads, batchSize)) {
    try {
      await emailService.sendBulkEmails(batch);
    } catch (error) {
      // sendBulkEmails throws AggregateError when one or more dispatches fail.
      // .errors is the array of per-item errors collected across the full batch.
      const batchFailCount =
        error instanceof AggregateError ? error.errors.length : batch.length;

      totalFailed += batchFailCount;

      logger.error("BroadcastService: email batch partially failed.", {
        broadcastId,
        batchSize: batch.length,
        failed: batchFailCount,
        error,
      });
      // Continue — remaining batches must still be attempted.
    }
  }

  return totalFailed;
}

class BroadcastService {
  async sendBroadcast({
    title,
    subject,
    message,
    idempotencyKey,
    audienceType,
    sendToAllUsers = false,
    audienceFilters = {},
    notificationType = NOTIFICATION_TYPE.SYSTEM,
    metadata = {},
    createdByAdmin,
  }) {
    // ── Input validation ──────────────────────────────────────────
    const safeTitle = assertNonEmptyString(title, "title");
    const safeSubject = assertNonEmptyString(subject, "subject");
    const safeMessage = assertNonEmptyString(message, "message");
    const safeIdempotencyKey = assertNonEmptyString(
      idempotencyKey,
      "idempotencyKey",
    );
    const safeCreatedBy = assertNonEmptyString(
      createdByAdmin,
      "createdByAdmin",
    );
    const safeMetadata = sanitiseMetadata(metadata);

    if (!mongoose.Types.ObjectId.isValid(safeCreatedBy)) {
      throw new BroadcastValidationError(
        '"createdByAdmin" must be a valid Mongo ObjectId.',
        "createdByAdmin",
      );
    }

    if (!Object.values(BROADCAST_AUDIENCE_TYPE).includes(audienceType)) {
      throw new BroadcastValidationError(
        `"audienceType" must be one of: ${Object.values(BROADCAST_AUDIENCE_TYPE).join(", ")}.`,
        "audienceType",
      );
    }

    if (!Object.values(NOTIFICATION_TYPE).includes(notificationType)) {
      throw new BroadcastValidationError(
        `"notificationType" must be one of: ${Object.values(NOTIFICATION_TYPE).join(", ")}.`,
        "notificationType",
      );
    }

    // ── Idempotency pre-check ─────────────────────────────────────
    // Lightweight exists() check gives duplicate requests a cheap early exit
    // before audience resolution (which may be expensive for large user sets).
    // Not a race-condition risk — E11000 at create() remains the atomic
    // enforcement. This is purely a performance optimisation for the common
    // duplicate case.
    const alreadyExists = await Broadcast.exists({
      idempotencyKey: safeIdempotencyKey,
    });
    if (alreadyExists) {
      throw new BroadcastDuplicateError(safeIdempotencyKey);
    }

    // ── Audience resolution (before create — prevents orphaned records) ──
    const recipients = await this.#resolveAudience(
      audienceType,
      audienceFilters,
      sendToAllUsers,
    );

    logger.info("BroadcastService: audience resolved.", {
      audienceType,
      recipientCount: recipients.length,
      idempotencyKey: safeIdempotencyKey,
    });

    // ── Create Broadcast audit record ─────────────────────────────
    // E11000 is the true idempotency enforcement — catches the race window
    // between the exists() check above and this create().
    let broadcast;
    try {
      broadcast = await Broadcast.create({
        createdByAdmin: safeCreatedBy,
        title: safeTitle,
        subject: safeSubject,
        content: safeMessage,
        idempotencyKey: safeIdempotencyKey,
        audience: {
          type: audienceType,
          filterCriteria:
            audienceType === BROADCAST_AUDIENCE_TYPE.FILTERED
              ? audienceFilters
              : null,
        },
        // emailEnabled: true — broadcast always attempts both channels.
        // notificationEnabled drives the in-app feed; emailEnabled drives
        // the bulk email fan-out that runs after the notification transaction.
        channels: { notificationEnabled: true, emailEnabled: true },
        status: BROADCAST_STATUS.QUEUED,
        stateTransitions: [
          {
            from: null,
            to: BROADCAST_STATUS.QUEUED,
            changedAt: new Date(),
            changedByAdmin: safeCreatedBy,
            note: "Broadcast submitted for immediate send.",
          },
        ],
      });
    } catch (error) {
      if (error?.code === MONGO_DUPLICATE_KEY_CODE) {
        throw new BroadcastDuplicateError(safeIdempotencyKey);
      }
      throw error;
    }

    const broadcastId = String(broadcast._id);

    // ── Zero-recipient short-circuit ──────────────────────────────
    if (recipients.length === 0) {
      await this.#transitionStatus(
        broadcastId,
        BROADCAST_STATUS.QUEUED,
        BROADCAST_STATUS.SENT,
        {
          changedByAdmin: safeCreatedBy,
          note: "No recipients resolved — broadcast marked sent with zero deliveries.",
        },
      );
      return {
        broadcastId,
        recipientCount: 0,
        emailSent: 0,
        emailFailed: 0,
        emailSkipped: 0,
        status: BROADCAST_STATUS.SENT,
      };
    }

    // ── Notification fan-out (transactional) ──────────────────────
    const session = await mongoose.startSession();
    let fanoutError;

    try {
      session.startTransaction();

      // broadcastFactory.forAllRecipients builds and deep-freezes all DTOs
      // in one pass, keeping DTO construction out of BroadcastService and
      // ensuring the shape passed to NotificationService is always factory-
      // validated (ObjectId format, required fields, metadata serializability).
      const notificationPayloads = broadcastFactory.forAllRecipients(
        {
          title: safeTitle,
          message: safeMessage,
          notificationType,
          metadata: safeMetadata,
        },
        recipients,
      );

      for (const batch of chunk(
        notificationPayloads,
        MAX_BROADCAST_BATCH_SIZE,
      )) {
        await notificationService.bulkCreateNotifications(batch, session);
      }

      await session.commitTransaction();
    } catch (error) {
      fanoutError = error;
      await safeAbort(session, error);

      // Retry FAILED transition independently — must not replace fanoutError.
      try {
        await withRetry(
          () =>
            this.#transitionStatus(
              broadcastId,
              BROADCAST_STATUS.QUEUED,
              BROADCAST_STATUS.FAILED,
              {
                changedByAdmin: safeCreatedBy,
                note: `Fan-out failed: ${error.message}`,
              },
            ),
          STATUS_UPDATE_MAX_RETRIES,
          "BroadcastService: FAILED status update",
        );
      } catch (statusUpdateError) {
        logger.error(
          "BroadcastService: failed to persist FAILED status transition.",
          { broadcastId, fanoutError, statusUpdateError },
        );
      }

      throw fanoutError;
    } finally {
      session.endSession();
    }

    // ── Email fan-out (post-commit, best-effort) ──────────────────
    // Runs after the notification transaction commits — email failures
    // never roll back persisted notifications. Recipients without a
    // resolvable email are skipped and counted separately.
    //
    // Failures are collected across all batches and reflected in
    // execution.email.failed and execution.totalRecipientsFailed.
    // A non-zero failure count transitions the broadcast to PARTIALLY_FAILED
    // so admins have actionable visibility into delivery coverage.
    const { payloads: emailPayloads, skipped: emailSkipped } =
      broadcastFactory.forAllEmailRecipients(
        { title: safeTitle, subject: safeSubject, message: safeMessage },
        recipients,
      );

    let emailFailed = 0;

    if (emailPayloads.length > 0) {
      emailFailed = await dispatchBroadcastEmails(
        emailPayloads,
        MAX_BROADCAST_BATCH_SIZE,
        broadcastId,
      );
    }

    if (emailSkipped > 0) {
      logger.warn(
        "BroadcastService: some recipients skipped for email — no email address resolved.",
        { broadcastId, skipped: emailSkipped },
      );
    }

    const emailSent = emailPayloads.length - emailFailed;
    const hasEmailFailures = emailFailed > 0;

    // ── Post-commit: update counters + final status ───────────────
    // PARTIALLY_FAILED when any email dispatch failed — notifications
    // are already committed and visible. SENT only when all emails
    // dispatched without error (skipped recipients are not failures).
    const finalStatus = hasEmailFailures
      ? BROADCAST_STATUS.PARTIALLY_FAILED
      : BROADCAST_STATUS.SENT;

    await withRetry(
      async () => {
        const updated = await Broadcast.findByIdAndUpdate(broadcastId, {
          $set: {
            status: finalStatus,
            "execution.totalRecipientsResolved": recipients.length,
            "execution.totalRecipientsFailed": emailFailed,
            "execution.notification.sent": recipients.length,
            "execution.email.sent": emailSent,
            "execution.email.failed": emailFailed,
          },
          $push: {
            stateTransitions: {
              from: BROADCAST_STATUS.QUEUED,
              to: finalStatus,
              changedAt: new Date(),
              changedByAdmin: safeCreatedBy,
              note: hasEmailFailures
                ? `Notifications sent to ${recipients.length} recipients. Email delivery partially failed: ${emailFailed} failed, ${emailSent} sent, ${emailSkipped} skipped (no address).`
                : `Sent to ${recipients.length} recipients. Email delivered to ${emailSent} (${emailSkipped} skipped — no address).`,
            },
          },
        });

        if (!updated) {
          throw new Error(
            `Broadcast ${broadcastId} not found during ${finalStatus} update.`,
          );
        }
      },
      STATUS_UPDATE_MAX_RETRIES,
      `BroadcastService: ${finalStatus} status update`,
    );

    // Audit — action reflects actual delivery outcome
    const auditAction = hasEmailFailures
      ? AUDIT_ACTIONS.BROADCAST_PARTIALLY_FAILED
      : AUDIT_ACTIONS.BROADCAST_SENT;

    await auditService.log({
      action: auditAction,
      actorId: safeCreatedBy,
      targetId: broadcast._id,
      targetType: "broadcast",
      metadata: {
        idempotencyKey: safeIdempotencyKey,
        recipientCount: recipients.length,
        emailSent,
        emailFailed,
        emailSkipped,
        status: finalStatus,
      },
    });

    logger.info("BroadcastService: broadcast completed.", {
      broadcastId,
      idempotencyKey: safeIdempotencyKey,
      recipientCount: recipients.length,
      emailSent,
      emailFailed,
      emailSkipped,
      status: finalStatus,
    });

    return {
      broadcastId,
      recipientCount: recipients.length,
      emailSent,
      emailFailed,
      emailSkipped,
      status: finalStatus,
    };
  }

  async #resolveAudience(audienceType, filters, sendToAllUsers) {
    if (audienceType === BROADCAST_AUDIENCE_TYPE.ALL) {
      if (sendToAllUsers !== true) {
        throw new BroadcastValidationError(
          'audienceType "ALL" requires sendToAllUsers: true to confirm intent.',
          "sendToAllUsers",
        );
      }
      logger.warn(
        "BroadcastService: resolving ALL users as broadcast audience.",
      );
      return User.find({}).select("_id email").lean();
    }

    const { query, filterCount } = buildAudienceQuery(filters);
    if (filterCount === 0) {
      throw new BroadcastValidationError(
        "FILTERED audience requires at least one filter.",
        "audienceFilters",
      );
    }

    return User.find(query).select("_id email role status").lean();
  }

  async #transitionStatus(
    broadcastId,
    fromStatus,
    toStatus,
    { note = "", changedByAdmin = null } = {},
  ) {
    const updated = await Broadcast.findByIdAndUpdate(broadcastId, {
      $set: { status: toStatus },
      $push: {
        stateTransitions: {
          from: fromStatus,
          to: toStatus,
          changedAt: new Date(),
          changedByAdmin,
          note,
        },
      },
    });

    if (!updated) {
      throw new Error(
        `Broadcast ${broadcastId} not found during status transition.`,
      );
    }
  }
}

export { BroadcastService };
export default new BroadcastService();
