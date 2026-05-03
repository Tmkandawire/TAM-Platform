/**
 * @file EmailProvider.js
 * @module email/providers
 *
 * Enterprise-grade email provider contract for the TAM Platform.
 *
 * Purpose
 * ─────────────────────────────────────────────────────────────
 * Defines the transport boundary for sending emails.
 *
 * This abstraction ensures:
 *  • Services do NOT depend on specific vendors (SMTP, SendGrid, SES)
 *  • Transport layer can be swapped without touching business logic
 *  • Email sending is consistent, validated, and predictable
 *  • Payload validation is defined once, at the layer that owns the contract
 *
 * Contract Rules
 * ─────────────────────────────────────────────────────────────
 *  • Implementations MUST extend this class and override send()
 *  • Implementations MUST call this.validatePayload(payload) before sending
 *  • Implementations MUST NOT mutate input
 *  • Implementations MUST throw on failure (no silent failures)
 *  • Implementations MUST NOT contain business logic
 *
 * This module intentionally does NOT:
 *  • implement sending logic
 *  • depend on external SDKs
 *  • perform orchestration
 *  • build templates
 */

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Character length limits derived from email RFCs.
 * Named here so validation errors can reference the standard by name,
 * not by an unexplained magic number.
 */
const MAX_LENGTH = Object.freeze({
  SUBJECT: 998, // RFC 5322 hard limit for subject line length
  TO_ADDRESS: 254, // RFC 5321 maximum email address length
});

/* ─────────────────────────────────────────────
   TYPES (JSDoc Contract)
───────────────────────────────────────────── */

/**
 * @typedef {Object} EmailPayload
 *
 * @property {string | string[]} to
 * Recipient email address or list of addresses.
 * Each must be a valid RFC 5321 bare address (e.g. "user@example.com").
 * Display name format is NOT accepted for recipients.
 *
 * @property {string} subject
 * Email subject line. Must be a non-empty string within RFC 5322 limits
 * (998 characters maximum).
 *
 * @property {string} [html]
 * HTML version of the email body.
 * At least one of `html` or `text` MUST be provided and non-empty.
 *
 * @property {string} [text]
 * Plain-text fallback version of the email body.
 * At least one of `html` or `text` MUST be provided and non-empty.
 *
 * @property {string} [from]
 * Optional sender override. Accepts both bare address format
 * ("noreply@tam.com") and display name format
 * ("TAM Platform <noreply@tam.com>").
 * If omitted, the provider's configured default sender is used.
 *
 * @property {Object} [metadata]
 * Optional structured metadata (trace IDs, correlation IDs, etc.).
 * Must be a plain object. Used for logging and observability only —
 * NOT for rendering or transport logic.
 */

/* ─────────────────────────────────────────────
   MODULE-LEVEL VALIDATION HELPERS
───────────────────────────────────────────── */

/**
 * Returns true if the given value is a plain object (not null, not an array,
 * not a class instance).
 *
 * Uses prototype chain inspection rather than typeof, which cannot
 * distinguish a class instance from a plain object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validates a bare RFC 5321 recipient email address.
 *
 * Enforces:
 *  • non-empty string
 *  • length within RFC 5321 limits
 *  • presence of '@' as a minimal sanity check
 *
 * This is intentionally NOT a full RFC 5322 parser — that level of
 * validation belongs in a dedicated library. The '@' check catches
 * the most common class of mistake (missing domain, plain username)
 * without the complexity and fragility of a complete email regex.
 *
 * @param {unknown} address
 * @param {number|null} [index] - Array index, included in the error when validating `to[]`
 * @throws {TypeError}
 */
function validateAddress(address, index = null) {
  const field = index !== null ? `to[${index}]` : "to";

  if (typeof address !== "string" || address.trim().length === 0) {
    throw new TypeError(
      `EmailProvider: "${field}" must be a non-empty string.`,
    );
  }

  const trimmed = address.trim();

  if (trimmed.length > MAX_LENGTH.TO_ADDRESS) {
    throw new TypeError(
      `EmailProvider: "${field}" exceeds the RFC 5321 maximum of ${MAX_LENGTH.TO_ADDRESS} characters.`,
    );
  }

  if (!trimmed.includes("@")) {
    throw new TypeError(
      `EmailProvider: "${field}" is not a valid email address.`,
    );
  }
}

/**
 * Validates a sender address for the `from` field.
 *
 * Unlike recipient addresses, senders are commonly expressed in
 * display name format: "TAM Platform <noreply@tam.com>".
 * This format contains '@' and passes the bare-address check, but
 * applying validateAddress() to it would be semantically incorrect —
 * the whole string is not a bare address, only the part inside '<>'.
 *
 * This function applies a looser check: the value must be a non-empty
 * string containing '@', which covers both bare and display name formats.
 * It deliberately avoids attempting to parse display name format, as that
 * parsing belongs in the transport library (nodemailer, SendGrid SDK, etc.).
 *
 * @param {unknown} from
 * @throws {TypeError}
 */
function validateSender(from) {
  if (typeof from !== "string" || from.trim().length === 0) {
    throw new TypeError(
      'EmailProvider: "from", when provided, must be a non-empty string.',
    );
  }

  if (!from.includes("@")) {
    throw new TypeError(
      'EmailProvider: "from" must be a valid address or display name format ' +
        '(e.g. "noreply@tam.com" or "TAM Platform <noreply@tam.com>").',
    );
  }
}

/* ─────────────────────────────────────────────
   BASE CLASS (ABSTRACT CONTRACT)
───────────────────────────────────────────── */

export default class EmailProvider {
  constructor() {
    if (new.target === EmailProvider) {
      throw new TypeError(
        "EmailProvider is an abstract class and cannot be instantiated directly.",
      );
    }
  }

  /**
   * Validates an EmailPayload against the full contract defined by this class.
   *
   * Provided on the base class so that payload validation is defined once —
   * at the layer that owns the contract — rather than re-implemented
   * independently by each concrete provider, where it would inevitably drift.
   *
   * Concrete providers MUST call this.validatePayload(payload) as their
   * first step inside send().
   *
   * @param {EmailPayload} payload
   * @throws {TypeError} on any constraint violation
   */
  validatePayload(payload) {
    if (!isPlainObject(payload)) {
      throw new TypeError(
        "EmailProvider: payload must be a non-null plain object.",
      );
    }

    const { to, subject, html, text, from, metadata } = payload;

    // --- to ---
    if (Array.isArray(to)) {
      if (to.length === 0) {
        throw new TypeError('EmailProvider: "to" must not be an empty array.');
      }
      to.forEach((addr, i) => validateAddress(addr, i));
    } else {
      validateAddress(to);
    }

    // --- subject ---
    if (typeof subject !== "string" || subject.trim().length === 0) {
      throw new TypeError(
        'EmailProvider: "subject" must be a non-empty string.',
      );
    }
    if (subject.length > MAX_LENGTH.SUBJECT) {
      throw new TypeError(
        `EmailProvider: "subject" exceeds the RFC 5322 maximum of ${MAX_LENGTH.SUBJECT} characters.`,
      );
    }

    // --- body: at least one of html or text is required ---
    const hasHtml = typeof html === "string" && html.trim().length > 0;
    const hasText = typeof text === "string" && text.trim().length > 0;

    if (!hasHtml && !hasText) {
      throw new TypeError(
        'EmailProvider: at least one of "html" or "text" must be a non-empty string.',
      );
    }

    // --- from (optional) ---
    if (from !== undefined) {
      validateSender(from);
    }

    // --- metadata (optional) ---
    if (metadata !== undefined && !isPlainObject(metadata)) {
      throw new TypeError(
        'EmailProvider: "metadata", when provided, must be a plain object.',
      );
    }
  }

  /**
   * Sends an email.
   *
   * MUST be overridden by every concrete provider.
   *
   * The base implementation throws synchronously and unconditionally —
   * it is not async, so a missing override cannot be silently swallowed
   * by a forgotten await. Concrete providers declare their own async send().
   *
   * Concrete implementations must:
   *  1. Call this.validatePayload(payload) first
   *  2. Send the email via their underlying transport
   *  3. Throw on delivery failure — do NOT swallow errors
   *
   * @param {EmailPayload} _payload
   * @returns {Promise<void>}
   * @throws {Error} Always — concrete provider has not implemented this method
   */
  send(_payload) {
    throw new Error(
      "EmailProvider.send() must be implemented by a concrete provider.",
    );
  }
}
