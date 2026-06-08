/**
 * @file contactEmailFactory.js
 * Email factory for contact form emails.
 */

import { renderBaseLayout } from "../layout/emailLayout.js";
import contactReplyTemplate from "../templates/contactReplyTemplate.js";

const DEFAULTS = Object.freeze({
  brandName: "TAM",
  maxSubjectLength: 998,
  maxReplyLength: 5000,
});

function normalizeTo(email) {
  if (typeof email !== "string" || email.trim().length === 0) {
    throw new TypeError(
      'contactEmailFactory: "userEmail" must be a non-empty string.',
    );
  }
  return email.trim().toLowerCase();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `contactEmailFactory: "${field}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

function assertMaxLength(value, field, max) {
  if (value.length > max) {
    throw new TypeError(
      `contactEmailFactory: "${field}" exceeds max length of ${max}.`,
    );
  }
  return value;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/* ── 1. Admin reply to a contact message ─────────────────────────────────── */

export function buildContactReplyEmail({
  userEmail,
  name,
  replyMessage,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const to = normalizeTo(userEmail);

  const rawName = assertMaxLength(
    assertNonEmptyString(name, "name"),
    "name",
    100,
  );
  const safeName = escapeHtml(rawName);

  const rawReply = assertMaxLength(
    assertNonEmptyString(replyMessage, "replyMessage"),
    "replyMessage",
    cfg.maxReplyLength,
  );
  const safeReply = escapeHtml(rawReply);

  const {
    subject,
    html: htmlBody,
    text,
  } = contactReplyTemplate({
    name: safeName,
    replyMessage: safeReply,
    brandName: cfg.brandName,
  });

  assertMaxLength(subject, "subject", cfg.maxSubjectLength);

  const html = renderBaseLayout({
    title: subject,
    bodyHtml: htmlBody,
    preheader: `A response to your TAM enquiry`,
  });

  return {
    to,
    subject,
    html,
    text,
    replyTo: "info@transportersmw.com",
  };
}

/* ── 2. Admin notification on new contact submission ─────────────────────── */

export function buildContactNotificationEmail({
  name,
  email,
  subject,
  message,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const adminEmail = process.env.CONTACT_NOTIFY_EMAIL || process.env.SMTP_FROM;

  const rawName = assertMaxLength(
    assertNonEmptyString(name, "name"),
    "name",
    100,
  );
  const rawEmail = assertMaxLength(
    assertNonEmptyString(email, "email"),
    "email",
    254,
  );
  const rawSubject = assertMaxLength(
    assertNonEmptyString(subject, "subject"),
    "subject",
    100,
  );
  const rawMessage = assertMaxLength(
    assertNonEmptyString(message, "message"),
    "message",
    cfg.maxReplyLength,
  );

  const safeName = escapeHtml(rawName);
  const safeEmail = escapeHtml(rawEmail);
  const safeSubject = escapeHtml(rawSubject);
  const safeMessage = escapeHtml(rawMessage).replace(/\n/g, "<br>");

  const emailSubject = `[TAM Contact] New message: ${safeSubject}`;

  const htmlBody = `
    <p>A new contact form submission has been received.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:6px 12px;font-weight:600;width:100px">Name</td>
          <td style="padding:6px 12px">${safeName}</td></tr>
      <tr style="background:#f9f9f9">
          <td style="padding:6px 12px;font-weight:600">Email</td>
          <td style="padding:6px 12px">${safeEmail}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:600">Subject</td>
          <td style="padding:6px 12px">${safeSubject}</td></tr>
      <tr style="background:#f9f9f9">
          <td style="padding:6px 12px;font-weight:600;vertical-align:top">Message</td>
          <td style="padding:6px 12px">${safeMessage}</td></tr>
    </table>
    <p style="margin-top:16px">Log in to the TAM admin portal to reply.</p>
  `;

  const text = `New TAM contact form submission\n\nName: ${rawName}\nEmail: ${rawEmail}\nSubject: ${rawSubject}\n\nMessage:\n${rawMessage}\n\nLog in to the admin portal to reply.`;

  const html = renderBaseLayout({
    title: emailSubject,
    bodyHtml: htmlBody,
    preheader: `New message from ${safeName}`,
  });

  return {
    to: adminEmail,
    subject: emailSubject,
    html,
    text,
    replyTo: rawEmail,
  };
}

/* ── 3. Auto-reply to the person who submitted the form ──────────────────── */

export function buildContactAutoReplyEmail({
  userEmail,
  name,
  subject,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  const to = normalizeTo(userEmail);
  const rawName = assertMaxLength(
    assertNonEmptyString(name, "name"),
    "name",
    100,
  );
  const rawSubj = assertMaxLength(
    assertNonEmptyString(subject, "subject"),
    "subject",
    100,
  );

  const safeName = escapeHtml(rawName);
  const safeSubj = escapeHtml(rawSubj);

  const emailSubject = `We received your message — ${cfg.brandName}`;

  const htmlBody = `
    <p>Dear ${safeName},</p>
    <p>Thank you for contacting the Truckers and Transporters Association of Malawi (TAM).</p>
    <p>We have received your message regarding <strong>${safeSubj}</strong> and a member
    of the TAM Secretariat will respond within 1 business day.</p>
    <p>If your matter is urgent, please call our office directly.</p>
    <p>Kind regards,<br><strong>TAM Secretariat</strong></p>
  `;

  const text = `Dear ${rawName},\n\nThank you for contacting TAM. We have received your message regarding "${rawSubj}" and will respond within 1 business day.\n\nKind regards,\nTAM Secretariat`;

  const html = renderBaseLayout({
    title: emailSubject,
    bodyHtml: htmlBody,
    preheader: `We received your message`,
  });

  return {
    to,
    subject: emailSubject,
    html,
    text,
    replyTo: "info@transportersmw.com",
  };
}
