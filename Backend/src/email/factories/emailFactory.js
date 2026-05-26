import { renderBaseLayout } from "../layout/emailLayout.js";
import documentApprovedTemplate from "../templates/documentApprovedTemplate.js";
import documentRejectedTemplate from "../templates/documentRejectedTemplate.js";
import broadcastTemplate from "../templates/broadcastTemplate.js";
import accountApprovedTemplate from "../templates/accountApprovedTemplate.js";
import accountSuspendedTemplate from "../templates/accountSuspendedTemplate.js";
import accountReinstatedTemplate from "../templates/accountReinstatedTemplate.js";
import passwordResetTemplate from "../templates/passwordResetTemplate.js";

/* ─────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────── */

const DEFAULTS = Object.freeze({
  brandName: "TAM",
  maxSubjectLength: 998,
  maxDocTypeLength: 200,
  maxReasonLength: 500,
  maxMessageLength: 10_000,
});

function normalizeTo(email) {
  if (typeof email !== "string" || email.trim().length === 0) {
    throw new TypeError(
      `emailFactory: "userEmail" must be a non-empty string.`,
    );
  }
  return email.trim().toLowerCase();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`emailFactory: "${field}" must be a non-empty string.`);
  }
  return value.trim();
}

function assertMaxLength(value, field, max) {
  if (value.length > max) {
    throw new TypeError(
      `emailFactory: "${field}" exceeds max length of ${max}.`,
    );
  }
  return value;
}

function assertValidEmail(value, field) {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new TypeError(
      `emailFactory: "${field}" must be a valid email address.`,
    );
  }
  return value.trim().toLowerCase();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function resolveLink(links, key) {
  if (links && typeof links[key] === "string" && links[key].trim().length > 0) {
    return links[key].trim();
  }
  return null;
}

/* ─────────────────────────────────────────────
   FACTORIES
───────────────────────────────────────────── */

export function buildDocumentApprovedEmail({
  userEmail,
  documentType,
  links = {},
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const to = normalizeTo(userEmail);

  const rawDocType = assertMaxLength(
    assertNonEmptyString(documentType, "documentType"),
    "documentType",
    cfg.maxDocTypeLength,
  );
  const safeDocType = escapeHtml(rawDocType);
  const dashboardUrl = resolveLink(links, "dashboardUrl");

  const {
    subject,
    html: htmlBody,
    text,
  } = documentApprovedTemplate({
    documentType: safeDocType,
    dashboardUrl,
    brandName: cfg.brandName,
  });

  // Guard the subject returned by the template — HTML-escaping rawDocType can
  // expand characters (& → &amp;) and silently push the subject past the RFC limit.
  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    // preheader is plain-text context — use rawDocType, not HTML-escaped safeDocType
    preheader: `Your ${rawDocType} has been approved`,
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

export function buildDocumentRejectedEmail({
  userEmail,
  documentType,
  reason = null,
  links = {},
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const to = normalizeTo(userEmail);

  const rawDocType = assertMaxLength(
    assertNonEmptyString(documentType, "documentType"),
    "documentType",
    cfg.maxDocTypeLength,
  );
  const safeDocType = escapeHtml(rawDocType);

  const rawReason =
    reason && String(reason).trim().length > 0
      ? assertMaxLength(String(reason).trim(), "reason", cfg.maxReasonLength)
      : null;
  const safeReason = rawReason ? escapeHtml(rawReason) : null;

  const dashboardUrl = resolveLink(links, "dashboardUrl");

  const {
    subject,
    html: htmlBody,
    text,
  } = documentRejectedTemplate({
    documentType: safeDocType,
    reason: safeReason,
    dashboardUrl,
    brandName: escapeHtml(cfg.brandName),
  });

  // Guard the subject returned by the template — HTML-escaping rawDocType can
  // expand characters (& → &amp;) and silently push the subject past the RFC limit.
  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    // preheader is plain-text context — use rawDocType, not HTML-escaped safeDocType
    preheader: `Your ${rawDocType} was rejected`,
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

/**
 * Build a transactional email payload for an admin broadcast.
 *
 * Follows the same structure as buildDocumentApprovedEmail and
 * buildDocumentRejectedEmail — same helpers, same layout, same
 * payload shape — so EmailService.sendBulkEmails() receives a
 * consistent object regardless of email type.
 *
 * `subject` in the broadcast payload is the email subject line
 * (distinct from `title` which drives the in-app notification title).
 * When `subject` is provided it takes precedence; otherwise `title`
 * is used as the subject, matching broadcastTemplate behaviour.
 *
 * @param {Object}      params
 * @param {string}      params.userEmail  - Recipient email address.
 * @param {string}      params.title      - Broadcast title (used as subject fallback).
 * @param {string}      params.subject    - Explicit email subject line (optional).
 * @param {string}      params.message    - Broadcast message body.
 * @param {string|null} [params.replyTo]  - Optional reply-to address.
 * @param {Object}      [params.config]   - Optional config overrides (merged with DEFAULTS).
 * @returns {{ to: string, subject: string, html: string, text: string, replyTo?: string }}
 */
export function buildBroadcastEmail({
  userEmail,
  title,
  subject: explicitSubject = null,
  message,
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const to = normalizeTo(userEmail);

  // title drives the in-app notification heading and the subject fallback.
  const rawTitle = assertMaxLength(
    assertNonEmptyString(title, "title"),
    "title",
    cfg.maxSubjectLength,
  );
  const safeTitle = escapeHtml(rawTitle);

  const rawMessage = assertMaxLength(
    assertNonEmptyString(message, "message"),
    "message",
    cfg.maxMessageLength,
  );
  const safeMessage = escapeHtml(rawMessage);

  // Use explicit subject when provided, otherwise fall through to title.
  // Both paths go through assertMaxLength so the RFC limit is always enforced.
  const rawSubject = explicitSubject
    ? assertMaxLength(
        assertNonEmptyString(explicitSubject, "subject"),
        "subject",
        cfg.maxSubjectLength,
      )
    : rawTitle;

  const {
    subject,
    html: htmlBody,
    text,
  } = broadcastTemplate({
    title: safeTitle,
    message: safeMessage,
  });

  // Guard the subject returned by the template against RFC limit.
  // Use rawSubject (not subject from template) when an explicit subject was provided.
  const finalSubject = explicitSubject ? escapeHtml(rawSubject) : subject;
  assertMaxLength(finalSubject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: finalSubject,
    bodyHtml: htmlBody,
    // preheader is plain-text context — use rawTitle, not HTML-escaped safeTitle
    preheader: rawTitle,
  });

  const payload = { to, subject: finalSubject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

// Note: account status emails (approved/suspended/reinstated) are separate from document status emails because they have different templates and slightly different data needs — e.g. document emails require a documentType, while account emails do not. Keeping them separate also allows for more flexibility in the future if we want to add more account-related email types (e.g. account deletion, password reset) without overloading the document email factory with additional conditionals and parameters.

export function buildAccountApprovedEmail({
  userEmail,
  links = {},
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };
  const to = normalizeTo(userEmail);
  const dashboardUrl = resolveLink(links, "dashboardUrl");

  const {
    subject,
    html: htmlBody,
    text,
  } = accountApprovedTemplate({
    dashboardUrl,
    brandName: cfg.brandName,
  });

  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    preheader: "Your TAM membership has been approved",
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

export function buildAccountSuspendedEmail({
  userEmail,
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };
  const to = normalizeTo(userEmail);

  const {
    subject,
    html: htmlBody,
    text,
  } = accountSuspendedTemplate({
    brandName: cfg.brandName,
  });

  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    preheader: "Your TAM account has been suspended",
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

export function buildAccountReinstatedEmail({
  userEmail,
  links = {},
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };
  const to = normalizeTo(userEmail);
  const dashboardUrl = resolveLink(links, "dashboardUrl");

  const {
    subject,
    html: htmlBody,
    text,
  } = accountReinstatedTemplate({
    dashboardUrl,
    brandName: cfg.brandName,
  });

  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    preheader: "Your TAM account has been reinstated",
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}

// Password reset emails are separate from account status emails because they have a different template and data needs (e.g. resetUrl), and because password resets are not necessarily tied to account approval/suspension/reinstatement events — e.g. a user could request a password reset while their account is still pending approval, or even after it's been suspended. Keeping password reset emails in their own factory allows for more flexibility and clearer separation of concerns.

export function buildPasswordResetEmail({
  userEmail,
  resetUrl,
  replyTo = null,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };
  const to = normalizeTo(userEmail);

  if (typeof resetUrl !== "string" || resetUrl.trim().length === 0) {
    throw new TypeError('emailFactory: "resetUrl" must be a non-empty string.');
  }

  const {
    subject,
    html: htmlBody,
    text,
  } = passwordResetTemplate({
    resetUrl: resetUrl.trim(),
    brandName: cfg.brandName,
  });

  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    preheader: "Reset your TAM account password",
  });

  const payload = { to, subject, html, text };
  if (replyTo) payload.replyTo = assertValidEmail(replyTo, "replyTo");
  return payload;
}
