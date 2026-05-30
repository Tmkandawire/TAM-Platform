/**
 * @file contactEmailFactory.js
 * Email factory for contact form reply emails.
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
