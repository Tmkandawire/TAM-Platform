import { renderBaseLayout } from "../layout/emailLayout.js";
import documentApprovedTemplate from "../templates/documentApprovedTemplate.js";
import documentRejectedTemplate from "../templates/documentRejectedTemplate.js";
import broadcastTemplate from "../templates/broadcastTemplate.js";
/* everything above unchanged */

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
