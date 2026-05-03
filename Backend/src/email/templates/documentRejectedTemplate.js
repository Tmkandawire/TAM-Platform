/**
 * @file documentRejectedTemplate.js
 * @module email/templates
 *
 * Pure template for "document rejected" emails.
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

const MAX_SUBJECT_LENGTH = 78;

/* ─────────────────────────────────────────────
   GUARDS
───────────────────────────────────────────── */

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TemplateError(
      `documentRejectedTemplate: "${name}" must be a non-empty string, got ${JSON.stringify(value)}.`,
      "INVALID_INPUT",
      name,
    );
  }
  return value;
}

function assertStringOrNull(value, name) {
  if (value === null || value === undefined) return null;
  return assertString(value, name);
}

/* ─────────────────────────────────────────────
   TEMPLATE
───────────────────────────────────────────── */

export default function documentRejectedTemplate({
  documentType,
  reason,
  dashboardUrl,
  brandName,
}) {
  const safeDocType = assertString(documentType, "documentType");
  const safeReason = assertStringOrNull(reason, "reason");
  const safeDashboard = assertStringOrNull(dashboardUrl, "dashboardUrl");
  const safeBrandName = assertString(brandName, "brandName");

  const subject = `Your ${safeDocType} was rejected`;

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new TemplateError(
      `documentRejectedTemplate: computed subject exceeds ${MAX_SUBJECT_LENGTH} characters.`,
      "SUBJECT_TOO_LONG",
      "documentType",
    );
  }

  const html = [
    `<p>Your <strong>${safeDocType}</strong> was rejected.</p>`,
    safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : null,
    safeDashboard
      ? `<p><a href="${safeDashboard}" target="_blank" rel="noopener noreferrer">Review and resubmit</a></p>`
      : null,
  ]
    .filter(Boolean)
    .join("\n    ");

  const text = [
    `Your ${safeDocType} was rejected.`,
    safeReason ? `Reason: ${safeReason}` : null,
    safeDashboard ? `Fix here: ${safeDashboard}` : null,
    "",
    safeBrandName,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
