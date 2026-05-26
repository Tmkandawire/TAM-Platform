/**
 * @file EmailService.js
 * @module services
 *
 * Orchestration layer for email delivery.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Validate email payloads before dispatch
 *  • Delegate delivery to an injected EmailProvider
 *  • Provide consistent error handling and logging
 *  • Enforce bulk operation safety limits
 *  • Bridge notification records to email dispatch (sendForNotification)
 *
 * This service intentionally does NOT:
 *  • build email templates or payloads (emailFactory responsibility)
 *  • map notification domain objects to email inputs (notificationFactory / mapper responsibility)
 *  • perform business logic
 *  • access databases
 *  • mutate payloads
 */

import logger from "../utils/logger.js";
import smtpProvider from "../email/providers/SmtpProvider.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum number of emails dispatched in a single bulk operation.
 *
 * Prevents unbounded sequential loops from blocking the event loop.
 * Callers targeting larger audiences must chunk and call
 * sendBulkEmails() in batches.
 */
const MAX_BULK_SIZE = 500;

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Minimal structural guard — confirms the payload is a plain object
 * before it reaches the provider.
 *
 * Field-level validation (to, subject, body, etc.) is intentionally
 * NOT duplicated here. EmailProvider.validatePayload() is the single
 * source of truth for field rules. Duplicating those rules here would
 * create two validation sources that can silently diverge.
 *
 * @param {unknown} payload
 * @param {string}  [context]  - Prefix for error messages (e.g. "payloads[3]")
 * @throws {TypeError}
 */
function assertPayloadShape(payload, context = "payload") {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new TypeError(`EmailService: ${context} must be a plain object.`);
  }
}

/* ─────────────────────────────────────────────
   SERVICE
───────────────────────────────────────────── */

class EmailService {
  // True private field — enforces encapsulation beyond Object.freeze.
  // The previous _provider convention was readable from outside the class.
  #provider;

  /**
   * @param {Object} [provider]  - EmailProvider instance.
   *
   * Accepts an injected provider to support testing and future
   * provider swaps (SES, SendGrid, Mailgun, etc.) without modifying
   * this file. Defaults to smtpProvider for standard usage.
   */
  constructor(provider = smtpProvider) {
    this.#provider = provider;
  }

  /**
   * Core dispatch method — validates payload shape and delegates to provider.
   *
   * @param {import("../email/providers/EmailProvider.js").EmailPayload} payload
   * @returns {Promise<void>}
   */
  async sendEmail(payload) {
    assertPayloadShape(payload);
    return this.#provider.send(payload);
  }

  /**
   * Sends a single transactional email payload.
   * Alias for sendEmail — used by transactional flows (password reset, etc.)
   * to distinguish intent from bulk sends at the call site.
   *
   * @param {import("../email/providers/EmailProvider.js").EmailPayload} payload
   * @returns {Promise<void>}
   */
  async sendTransactional(payload) {
    return this.sendEmail(payload);
  }

  /**
   * Bridge method called by NotificationService after a notification
   * is persisted.
   *
   * Receives an already-built email payload — payload construction is
   * the responsibility of emailFactory / the mapping layer, not this
   * service. EmailService only validates the shape and dispatches.
   *
   * Unknown notification types (no payload produced) are logged as a
   * warning rather than silently ignored — this surfaces missing
   * wiring when new notification types are added.
   *
   * @param {Object} dto            - The notification DTO (used for logging context).
   * @param {Object} record         - The persisted notification record.
   * @param {Object|null} [emailPayload] - Pre-built email payload from the caller.
   *   Pass null to explicitly indicate this notification type has no email.
   * @returns {Promise<void>}
   * @throws {TypeError}  on invalid emailPayload shape
   * @throws {Error}      on provider dispatch failure
   */
  async sendForNotification(dto, record, emailPayload = null) {
    if (!dto || typeof dto !== "object") {
      throw new TypeError(
        "EmailService: sendForNotification requires a valid dto object.",
      );
    }

    if (emailPayload === null) {
      // Caller explicitly opted out — warn so missing wiring is visible.
      logger.warn(
        "EmailService: no email payload provided for notification — skipping dispatch.",
        {
          notificationId: record?.id,
          type: dto.type,
        },
      );
      return;
    }

    return this.sendEmail(emailPayload);
  }

  /**
   * Sends multiple emails sequentially.
   *
   * Validates all payloads structurally before any dispatch begins,
   * so structural errors are surfaced immediately rather than mid-loop.
   *
   * Send failures are collected across the full run. A single item
   * failing does not abort the remaining dispatches. All failures are
   * reported together via AggregateError.
   *
   * Sequential dispatch is intentional: it preserves ordering and
   * avoids overwhelming SMTP connections. Parallelization belongs
   * in a queue/worker layer, not here.
   *
   * @param {Array<import("../email/providers/EmailProvider.js").EmailPayload>} payloads
   * @returns {Promise<void>}
   * @throws {TypeError}       on invalid input or structural payload errors
   * @throws {AggregateError}  if one or more dispatches fail
   */
  async sendBulkEmails(payloads) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      throw new TypeError("EmailService: payloads must be a non-empty array.");
    }

    if (payloads.length > MAX_BULK_SIZE) {
      throw new TypeError(
        `EmailService: bulk size ${payloads.length} exceeds the limit of ${MAX_BULK_SIZE}. ` +
          `Chunk the input and call sendBulkEmails() in batches.`,
      );
    }

    // Validate all payloads structurally before touching the provider.
    // This surfaces malformed items immediately rather than failing
    // mid-loop after some emails have already been sent.
    for (let i = 0; i < payloads.length; i++) {
      assertPayloadShape(payloads[i], `payloads[${i}]`);
    }

    const failures = [];

    for (const payload of payloads) {
      try {
        await this.sendEmail(payload);
      } catch (error) {
        failures.push({
          to: payload.to,
          subject: payload.subject,
          error,
        });
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((f) => f.error),
        `EmailService: ${failures.length} of ${payloads.length} email(s) failed.`,
      );
    }
  }
}

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

/**
 * Named class export for testing and provider injection.
 * Default instance export for standard service-layer consumption.
 */
export { EmailService };
export default new EmailService();
