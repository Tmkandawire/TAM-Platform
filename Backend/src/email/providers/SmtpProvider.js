/**
 * @file SmtpProvider.js
 * @module email/providers
 *
 * SMTP email provider implementation using Nodemailer.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Implement the EmailProvider contract
 *  • Send emails via SMTP transport
 *  • Read and validate configuration from environment variables
 *  • Verify SMTP connectivity at startup via SmtpProvider.create()
 *  • Wrap transport errors cleanly before rethrowing
 *
 * Startup
 * ─────────────────────────────────────────────────────────────
 * Use the static factory instead of the default export when you need
 * a guaranteed-live connection before the app accepts traffic:
 *
 *   import SmtpProvider from './SmtpProvider.js';
 *   await SmtpProvider.create();   // verifies SMTP, throws on failure
 *
 * The default export is the singleton instance. It is safe for
 * direct import in code paths where startup verification is handled
 * separately (e.g. the app bootstrap already called create()).
 *
 * This module intentionally does NOT:
 *  • contain business logic
 *  • build email templates
 *  • retry failed sends (handled by queue layer)
 */

import nodemailer from "nodemailer";
import EmailProvider from "./EmailProvider.js";
import logger from "../../utils/logger.js";
import { ServiceUnavailableError } from "../../errors/ServiceUnavailableError.js";

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Asserts that an environment variable is a non-empty string.
 *
 * Called inside the constructor — not at module load time — so that
 * misconfiguration produces a clear error at instantiation rather than
 * an unformatted crash during the import chain.
 *
 * @param {unknown} value
 * @param {string}  name  - Environment variable name, used in the error message
 * @returns {string}
 * @throws {Error}
 */
function assertEnv(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(
      `SmtpProvider: Missing required environment variable "${name}".`,
    );
  }
  return value;
}

/**
 * Parses and validates the SMTP port from an environment variable string.
 *
 * Accepts the raw string value and an optional fallback. Validates that
 * the result is a finite integer within the valid TCP port range (1–65535).
 *
 * @param {string | undefined} raw      - Raw environment variable value
 * @param {number}             fallback - Default port when the variable is absent
 * @returns {number}
 * @throws {Error} if the value is set but not a valid port number
 */
function parsePort(raw, fallback) {
  if (raw === undefined || raw === "") return fallback;

  const port = parseInt(raw, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `SmtpProvider: "SMTP_PORT" must be an integer between 1 and 65535 (received "${raw}").`,
    );
  }

  return port;
}

/* ─────────────────────────────────────────────
   PROVIDER
───────────────────────────────────────────── */

class SmtpProvider extends EmailProvider {
  /** @type {import('nodemailer').Transporter} */
  #transporter;

  /** @type {string} */
  #defaultFrom;

  constructor() {
    super();

    // Env validation runs here — at instantiation time — not at module
    // load time. This ensures misconfiguration is reported as a clear
    // constructor error and allows tests to import the module without
    // requiring a real SMTP environment.
    const host = assertEnv(process.env.SMTP_HOST, "SMTP_HOST");
    const port = parsePort(process.env.SMTP_PORT, 587);
    const user = assertEnv(process.env.SMTP_USER, "SMTP_USER");
    const pass = assertEnv(process.env.SMTP_PASS, "SMTP_PASS");

    this.#defaultFrom = assertEnv(process.env.SMTP_FROM, "SMTP_FROM");

    this.#transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // TLS on 465, STARTTLS on 587/25
      auth: { user, pass },
    });
  }

  /**
   * Verifies the SMTP connection by opening a test socket.
   *
   * This is intentionally NOT called inside the constructor. Constructors
   * are synchronous — a Promise returned from verify() inside a constructor
   * floats unattended, meaning any throw inside .catch() is silently
   * swallowed and the fail-fast guarantee evaporates entirely.
   *
   * The correct pattern is to await this method explicitly at app startup,
   * before the server begins accepting traffic. Use SmtpProvider.create()
   * as the startup-safe entry point, which calls this and surfaces errors
   * into the awaited call chain.
   *
   * @returns {Promise<void>}
   * @throws {ServiceUnavailableError} if the SMTP server is unreachable or rejects credentials
   */
  async verify() {
    try {
      await this.#transporter.verify();
      logger.info("SmtpProvider: SMTP connection verified.");
    } catch (error) {
      logger.error("SmtpProvider: SMTP connection failed.", {
        error: error.message,
      });
      throw ServiceUnavailableError.smtp(error);
    }
  }

  /**
   * Sends an email via SMTP.
   *
   * Validates the payload against the EmailProvider contract, builds
   * a clean Nodemailer message object without mutating the input, and
   * wraps any transport error before rethrowing so that SMTP internals
   * are not leaked to callers.
   *
   * @param {import('./EmailProvider.js').EmailPayload} payload
   * @returns {Promise<void>}
   * @throws {TypeError}                if payload is invalid
   * @throws {ServiceUnavailableError}  if email delivery fails
   */
  async send(payload) {
    // 1. Validate against the base class contract before any I/O.
    this.validatePayload(payload);

    const { to, subject, html, text, from } = payload;

    // 2. Build the Nodemailer message. The payload is not mutated —
    //    all field selections produce a new object.
    const message = {
      from: from ?? this.#defaultFrom,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    };

    try {
      const info = await this.#transporter.sendMail(message);

      logger.info("Email sent successfully.", {
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
      });
    } catch (error) {
      // Log the raw transport error here — this is the only layer with
      // full SMTP context. The error is then wrapped before rethrowing
      // so that callers receive a clean signal without SMTP internals.
      logger.error("Email send failed.", {
        to: message.to,
        subject: message.subject,
        error: error.message,
      });

      throw ServiceUnavailableError.smtp(error);
    }
  }

  /**
   * Static factory method — the correct startup entry point.
   *
   * Creates the singleton instance, verifies the SMTP connection, and
   * returns the verified provider. Because this is async, the verification
   * result is properly awaited and any failure throws into the caller's
   * await chain — exactly where a startup failure should land.
   *
   * Usage in app bootstrap:
   *
   *   import SmtpProvider from './SmtpProvider.js';
   *   const emailProvider = await SmtpProvider.create();
   *
   * @returns {Promise<SmtpProvider>}
   * @throws {Error}                    if env config is invalid
   * @throws {ServiceUnavailableError}  if SMTP connection fails
   */
  static async create() {
    const instance = new SmtpProvider();
    await instance.verify();
    return instance;
  }
}

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

/**
 * Singleton instance for direct import in standard send paths.
 *
 * For startup verification, prefer:
 *   const provider = await SmtpProvider.create();
 */
export default new SmtpProvider();
