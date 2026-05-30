/**
 * @file contactService.js
 * @module services/contact
 */

import mongoose from "mongoose";
import ContactMessage from "../models/ContactMessage.js";
import { buildContactReplyEmail } from "../email/factories/contactEmailFactory.js";
import emailService from "../email/emailService.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import logger from "../utils/logger.js";

const VALID_STATUSES = ["unread", "read", "archived"];
const VALID_SUBJECTS = [
  "membership",
  "haulage",
  "consultancy",
  "training",
  "advocacy",
  "general",
];

class ContactService {
  /**
   * Submit a new contact message from the public form.
   */
  async submitMessage({ name, email, subject, message }) {
    if (!VALID_SUBJECTS.includes(subject)) {
      throw new ValidationError({
        errors: [
          {
            field: "subject",
            message: "Invalid subject.",
            code: "INVALID_VALUE",
          },
        ],
      });
    }

    const contact = await ContactMessage.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject,
      message: message.trim(),
    });

    logger.info("Contact message received", {
      contactId: contact._id,
      subject: contact.subject,
    });

    return contact;
  }

  /**
   * Get all messages with optional status filter and pagination.
   */
  async getMessages({ status, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (status && VALID_STATUSES.includes(status)) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);

    return {
      data: messages,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
        limit: Number(limit),
      },
    };
  }

  /**
   * Get a single message by ID.
   */
  async getMessageById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError({
        errors: [
          {
            field: "id",
            message: "Invalid message ID.",
            code: "INVALID_VALUE",
          },
        ],
      });
    }

    const message = await ContactMessage.findById(id).lean();
    if (!message) throw new NotFoundError("Contact message not found");
    return message;
  }

  /**
   * Mark a message as read.
   */
  async markAsRead(id) {
    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { status: "read" },
      { new: true },
    ).lean();

    if (!message) throw new NotFoundError("Contact message not found");
    return message;
  }

  /**
   * Archive a message.
   */
  async archiveMessage(id) {
    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { status: "archived" },
      { new: true },
    ).lean();

    if (!message) throw new NotFoundError("Contact message not found");
    return message;
  }

  /**
   * Delete a message permanently.
   */
  async deleteMessage(id) {
    const message = await ContactMessage.findByIdAndDelete(id).lean();
    if (!message) throw new NotFoundError("Contact message not found");
    return { deleted: true };
  }

  /**
   * Reply to a message — sends email and marks as read.
   */
  async replyToMessage(id, { replyMessage, adminId }) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError({
        errors: [
          {
            field: "id",
            message: "Invalid message ID.",
            code: "INVALID_VALUE",
          },
        ],
      });
    }

    const contact = await ContactMessage.findById(id);
    if (!contact) throw new NotFoundError("Contact message not found");

    const payload = buildContactReplyEmail({
      userEmail: contact.email,
      name: contact.name,
      replyMessage,
    });

    await emailService.sendTransactional(payload);

    contact.status = "read";
    contact.repliedAt = new Date();
    contact.repliedBy = adminId;
    await contact.save();

    logger.info("Contact reply sent", {
      contactId: id,
      adminId,
    });

    return contact.toObject();
  }

  /**
   * Get unread count for dashboard badge.
   */
  async getUnreadCount() {
    const count = await ContactMessage.countDocuments({ status: "unread" });
    return { count };
  }
}

export default new ContactService();
