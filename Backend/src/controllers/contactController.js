/**
 * @file contactController.js
 * @module controllers/contact
 */

import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import contactService from "../services/contactService.js";
import { ValidationError } from "../errors/index.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function coercePage(val) {
  const n = parseInt(val);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function coerceLimit(val) {
  const n = parseInt(val);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

/* ── Public ──────────────────────────────────────────────────────────────── */

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new ValidationError({
      errors: [
        {
          field: "body",
          message: "All fields are required.",
          code: "MISSING_VALUE",
        },
      ],
    });
  }

  await contactService.submitMessage({ name, email, subject, message });

  const response = ApiResponse.created(
    null,
    "Your message has been received. The TAM Secretariat will respond within 1 business day.",
  );
  return res.status(response.statusCode).json(response);
});

/* ── Admin ───────────────────────────────────────────────────────────────── */

export const getMessages = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const page = coercePage(req.query.page);
  const limit = coerceLimit(req.query.limit);

  const result = await contactService.getMessages({ status, page, limit });

  const response = ApiResponse.ok(result, "Messages retrieved.");
  return res.status(response.statusCode).json(response);
});

export const getMessage = asyncHandler(async (req, res) => {
  const message = await contactService.getMessageById(req.params.id);

  // Auto-mark as read when admin opens it
  if (message.status === "unread") {
    await contactService.markAsRead(req.params.id);
    message.status = "read";
  }

  const response = ApiResponse.ok(message, "Message retrieved.");
  return res.status(response.statusCode).json(response);
});

export const archiveMessage = asyncHandler(async (req, res) => {
  const message = await contactService.archiveMessage(req.params.id);
  const response = ApiResponse.ok(message, "Message archived.");
  return res.status(response.statusCode).json(response);
});

export const deleteMessage = asyncHandler(async (req, res) => {
  await contactService.deleteMessage(req.params.id);
  const response = ApiResponse.ok(null, "Message deleted.");
  return res.status(response.statusCode).json(response);
});

export const replyToMessage = asyncHandler(async (req, res) => {
  const { replyMessage } = req.body;

  if (!replyMessage || replyMessage.trim().length < 10) {
    throw new ValidationError({
      errors: [
        {
          field: "replyMessage",
          message: "Reply must be at least 10 characters.",
          code: "INVALID_VALUE",
        },
      ],
    });
  }

  const message = await contactService.replyToMessage(req.params.id, {
    replyMessage: replyMessage.trim(),
    adminId: req.user.id,
  });

  const response = ApiResponse.ok(message, "Reply sent successfully.");
  return res.status(response.statusCode).json(response);
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await contactService.getUnreadCount();
  const response = ApiResponse.ok(result, "Unread count retrieved.");
  return res.status(response.statusCode).json(response);
});
