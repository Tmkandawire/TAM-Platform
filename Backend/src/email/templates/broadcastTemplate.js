/**
 * @file broadcastTemplate.js
 * @module email/templates
 *
 * Pure template for admin broadcast emails.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Assert that pre-sanitised inputs conform to expected shape
 *  • Format those inputs into subject, HTML fragment, and plain-text body
 *
 * This module intentionally does NOT:
 *  • sanitise or escape HTML (inputs must arrive pre-escaped)
 *  • validate email addresses or URLs
 *  • access config, environment, or external services
 *  • generate URLs
 *  • contain business logic
 *
 * HTML output
 * ─────────────────────────────────────────────
 * The `html` field is a FRAGMENT (no <html>/<body> wrapper).
 * Callers are responsible for embedding it in a full layout.
 * All string inputs are treated as already-escaped HTML-safe values.
 */

import { TemplateError } from "./templateError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const MAX_SUBJECT_LENGTH = 78; // RFC 5321 recommended limit

/* ─────────────────────────────────────────────
   GUARDS
───────────────────────────────────────────── */

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TemplateError(
      `broadcastTemplate: "${name}" must be a non-empty string, got ${JSON.stringify(value)}.`,
      "INVALID_INPUT",
      name,
    );
  }
  return value;
}

/* ─────────────────────────────────────────────
   TEMPLATE
───────────────────────────────────────────── */

/**
 * @param {Object} params
 * @param {string} params.title    - Broadcast title (pre-escaped HTML-safe value).
 * @param {string} params.message  - Broadcast message body (pre-escaped HTML-safe value).
 * @returns {{ subject: string, html: string, text: string }}
 */
export default function broadcastTemplate({ title, message }) {
  const safeTitle = assertString(title, "title");
  const safeMessage = assertString(message, "message");

  const subject = safeTitle;

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new TemplateError(
      `broadcastTemplate: computed subject exceeds ${MAX_SUBJECT_LENGTH} characters.`,
      "SUBJECT_TOO_LONG",
      "title",
    );
  }

  const html = `<p>${safeMessage}</p>`;

  const text = [safeMessage].join("\n");

  return { subject, html, text };
}
