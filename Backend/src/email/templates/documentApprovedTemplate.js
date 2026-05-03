/**
 * @file documentApprovedTemplate.js
 * @module email/templates
 *
 * Pure template for "document approved" emails.
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
      `documentApprovedTemplate: "${name}" must be a non-empty string, got ${JSON.stringify(value)}.`,
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

export default function documentApprovedTemplate({
  documentType,
  dashboardUrl,
  brandName,
}) {
  const safeDocType = assertString(documentType, "documentType");
  const safeDashboard = assertStringOrNull(dashboardUrl, "dashboardUrl");
  const safeBrandName = assertString(brandName, "brandName");

  const subject = `Your ${safeDocType} has been approved`;

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new TemplateError(
      `documentApprovedTemplate: computed subject exceeds ${MAX_SUBJECT_LENGTH} characters.`,
      "SUBJECT_TOO_LONG",
      "documentType",
    );
  }

  const html = [
    `<p>Your <strong>${safeDocType}</strong> has been approved.</p>`,
    safeDashboard
      ? `<p><a href="${safeDashboard}" target="_blank" rel="noopener noreferrer">Go to your dashboard</a></p>`
      : null,
  ]
    .filter(Boolean)
    .join("\n    ");

  const text = [
    `Your ${safeDocType} has been approved.`,
    safeDashboard ? `Dashboard: ${safeDashboard}` : null,
    "",
    safeBrandName,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
