/**
 * @file NotificationService.js
 * @module services
 *
 * Orchestration layer for notification persistence and delivery.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Validate incoming DTOs
 *  • Persist notifications via NotificationRepository
 *  • Build email payloads and trigger delivery via EmailService
 *  • Provide read / lifecycle operations on existing notifications
 *
 * This module intentionally does NOT:
 *  • build notification DTOs (notificationFactory responsibility)
 *  • own transport concerns (EmailService / provider responsibility)
 *  • define event names (notificationTypes constants responsibility)
 *
 * EmailService is injected via the constructor (not imported at the top).
 * This keeps the coupling loose and makes swapping to a queue-backed
 * delivery mechanism a one-line change at the composition root.
 */

import notificationRepository from "../repositories/NotificationRepository.js";
import notificationValidator from "../validators/notificationValidator.js";
import {
  buildDocumentApprovedEmail,
  buildDocumentRejectedEmail,
} from "../email/factories/emailFactory.js";
import { DOCUMENT_EVENT } from "../constants/notificationTypes.js";
import logger from "../utils/logger.js";
import emailService from "../email/EmailService.js";

/* ─────────────────────────────────────────────
   ERRORS
───────────────────────────────────────────── */

export class NotificationNotFoundError extends Error {
  constructor(notificationId) {
    super(`NotificationService: notification "${notificationId}" not found.`);
    this.name = "NotificationNotFoundError";
    this.code = "NOTIFICATION_NOT_FOUND";
  }
}

export class NotificationValidationError extends TypeError {
  /**
   * @param {string}   context  - Method name or operation label.
   * @param {string[]} errors   - Validation error messages.
   */
  constructor(context, errors) {
    super(
      `NotificationService [${context}]: invalid input → ${errors.join(", ")}`,
    );
    this.name = "NotificationValidationError";
    this.code = "NOTIFICATION_VALIDATION_ERROR";
    this.errors = errors;
  }
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Throw `NotificationValidationError` if `validation.valid` is false.
 *
 * @param {{ valid: boolean, errors: string[] }} validation
 * @param {string} context
 */
function assertValid(validation, context) {
  if (!validation.valid) {
    throw new NotificationValidationError(context, validation.errors);
  }
}

/**
 * Assert that a result from the repository is not null/undefined.
 * Throws `NotificationNotFoundError` if the record was not found.
 *
 * @param {unknown} result
 * @param {string}  notificationId
 * @returns {unknown}
 */
function assertFound(result, notificationId) {
  if (result === null || result === undefined) {
    throw new NotificationNotFoundError(notificationId);
  }
  return result;
}

/* ─────────────────────────────────────────────
   EMAIL PAYLOAD BUILDERS
   Maps a notification DTO to the correct emailFactory call.
   Returns null for types that have no transactional email.
   Adding a new type = adding one case here.
───────────────────────────────────────────── */

/**
 * Build an email payload from a notification DTO, or return null if
 * the notification type has no associated transactional email.
 *
 * @param {Object} dto - Notification DTO (validated, pre-persisted shape).
 * @returns {Object|null}
 */
function buildEmailPayload(dto) {
  switch (dto.type) {
    case DOCUMENT_EVENT.APPROVED:
      return buildDocumentApprovedEmail({
        userEmail: dto.userEmail,
        documentType: dto.documentTitle,
        links: { dashboardUrl: dto.links?.dashboardUrl ?? null },
      });

    case DOCUMENT_EVENT.REJECTED:
      return buildDocumentRejectedEmail({
        userEmail: dto.userEmail,
        documentType: dto.documentTitle,
        reason: dto.reason ?? null,
        links: { dashboardUrl: dto.links?.dashboardUrl ?? null },
      });

    default:
      // Returning null signals to EmailService that this type has no email.
      // EmailService will log a warning — intentional, surfaces missing wiring.
      return null;
  }
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class NotificationService {
  #repository;
  #emailService;

  /**
   * @param {import("../repositories/NotificationRepository.js").default} repository
   * @param {import("../services/EmailService.js").default | null} [emailService]
   *   Optional — pass null to disable email delivery (e.g. in tests or
   *   when transitioning to a queue-backed delivery mechanism).
   */
  constructor(repository, emailService = null) {
    this.#repository = repository;
    this.#emailService = emailService;
  }

  /* ─────────────────────────────────────────
     CREATION
  ───────────────────────────────────────── */

  /**
   * Persist a single notification and trigger email delivery if an
   * EmailService is configured.
   *
   * `session` is optional — pass a transaction session when this call
   * is part of a larger atomic operation.
   *
   * @param {Object}  dto
   * @param {unknown} [session]
   * @returns {Promise<Object>} The persisted notification record.
   */
  async createNotification(dto, session) {
    assertValid(
      notificationValidator.validateCreateDto(dto),
      "createNotification",
    );

    const record = await this.#repository.create(dto, session);

    logger.info("NotificationService: notification created.", {
      notificationId: record.id,
      type: dto.type,
      userId: dto.userId,
    });

    await this.#dispatchEmail(dto, record);

    return record;
  }

  /**
   * Persist multiple notifications in a single transaction.
   * A session is required — bulk writes without a transaction are unsafe.
   *
   * Email dispatch is intentionally skipped for bulk creates.
   * Bulk notifications are typically system/admin events that do not
   * require individual transactional emails. Add a bulk email flow here
   * if requirements change.
   *
   * @param {Object[]} dtos
   * @param {unknown}  session
   * @returns {Promise<Object[]>}
   */
  async bulkCreateNotifications(dtos, session) {
    if (!session) {
      throw new TypeError(
        "NotificationService: bulkCreateNotifications requires a transaction session.",
      );
    }

    assertValid(
      notificationValidator.validateBulkCreateDtos(dtos),
      "bulkCreateNotifications",
    );

    const records = await this.#repository.createMany(dtos, session);

    logger.info("NotificationService: bulk notifications created.", {
      count: records.length,
    });

    return records;
  }

  /* ─────────────────────────────────────────
     READS
  ───────────────────────────────────────── */

  /**
   * @param {string}  notificationId
   * @param {unknown} [session]
   * @returns {Promise<Object>}
   * @throws {NotificationNotFoundError}
   */
  async getNotificationById(notificationId, session) {
    assertValid(
      notificationValidator.validateNotificationId(notificationId),
      "getNotificationById",
    );

    const record = await this.#repository.findById(notificationId, session);
    return assertFound(record, notificationId);
  }

  /**
   * @param {string}  userId
   * @param {Object}  [options={}]
   * @param {unknown} [session]
   * @returns {Promise<Object[]>}
   */
  async getUserNotifications(userId, options = {}, session) {
    assertValid(
      notificationValidator.validateUserId(userId),
      "getUserNotifications[userId]",
    );
    assertValid(
      notificationValidator.validateQueryOptions(options),
      "getUserNotifications[options]",
    );

    return this.#repository.findByUser(userId, options, session);
  }

  /**
   * @param {string}  userId
   * @param {unknown} [session]
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId, session) {
    assertValid(notificationValidator.validateUserId(userId), "getUnreadCount");

    return this.#repository.countUnreadByUser(userId, session);
  }

  /* ─────────────────────────────────────────
     LIFECYCLE
  ───────────────────────────────────────── */

  /**
   * @param {string}  notificationId
   * @param {unknown} [session]
   */
  async markAsRead(notificationId, userId, session) {
    assertValid(
      notificationValidator.validateNotificationId(notificationId),
      "markAsRead",
    );
    assertValid(
      notificationValidator.validateUserId(userId),
      "markAsRead[userId]",
    );
    return this.#repository.markAsRead(notificationId, userId, session);
  }

  /**
   * @param {string}  userId
   * @param {unknown} [session]
   */
  async markAllAsRead(userId, session) {
    assertValid(notificationValidator.validateUserId(userId), "markAllAsRead");

    return this.#repository.markAllReadByUser(userId, session);
  }

  /**
   * @param {string}  notificationId
   * @param {unknown} [session]
   */
  async archiveNotification(notificationId, userId, session) {
    assertValid(
      notificationValidator.validateNotificationId(notificationId),
      "archiveNotification",
    );
    assertValid(
      notificationValidator.validateUserId(userId),
      "archiveNotification[userId]",
    );
    return this.#repository.archive(notificationId, userId, session);
  }

  /**
   * @param {string}  notificationId
   * @param {unknown} [session]
   */
  async deleteNotification(notificationId, userId, session) {
    assertValid(
      notificationValidator.validateNotificationId(notificationId),
      "deleteNotification",
    );
    assertValid(
      notificationValidator.validateUserId(userId),
      "deleteNotification[userId]",
    );

    return this.#repository.deleteById(notificationId, userId, session);
  }

  /**
   * @param {string}  userId
   * @param {unknown} [session]
   */
  async deleteAllUserNotifications(userId, session) {
    assertValid(
      notificationValidator.validateUserId(userId),
      "deleteAllUserNotifications",
    );

    return this.#repository.deleteAllByUser(userId, session);
  }

  /* ─────────────────────────────────────────
     PRIVATE — EMAIL DISPATCH
  ───────────────────────────────────────── */

  /**
   * Build an email payload for the notification type and dispatch it.
   *
   * Failures are logged but do NOT throw — email delivery is best-effort.
   * A failed email must never roll back a successfully persisted notification.
   *
   * @param {Object} dto    - The original notification DTO.
   * @param {Object} record - The persisted notification record.
   */
  async #dispatchEmail(dto, record) {
    if (!this.#emailService) return;

    const emailPayload = buildEmailPayload(dto);

    try {
      await this.#emailService.sendForNotification(dto, record, emailPayload);

      if (emailPayload) {
        logger.info("NotificationService: email dispatched for notification.", {
          notificationId: record.id,
          type: dto.type,
        });
      }
    } catch (error) {
      // Email failure is non-fatal — log and continue.
      logger.error(
        "NotificationService: email dispatch failed for notification.",
        {
          notificationId: record.id,
          type: dto.type,
          error,
        },
      );
    }
  }
}

/* ─────────────────────────────────────────────
   EXPORTS
   The default export is the singleton used across the application.
   EmailService is imported here at the composition root — the only
   place where the two services are allowed to know about each other.
───────────────────────────────────────────── */

export { NotificationService };

export default new NotificationService(notificationRepository, emailService);
