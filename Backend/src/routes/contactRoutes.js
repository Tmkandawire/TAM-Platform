/**
 * @file contactRoutes.js
 *
 * Public:
 *   POST /api/v1/contact — submit contact form
 *
 * Admin (protected):
 *   GET    /api/v1/admin/contact          — list all messages
 *   GET    /api/v1/admin/contact/unread-count
 *   GET    /api/v1/admin/contact/:id      — get single message
 *   PATCH  /api/v1/admin/contact/:id/archive
 *   POST   /api/v1/admin/contact/:id/reply
 *   DELETE /api/v1/admin/contact/:id
 */

import express from "express";
import {
  submitContact,
  getMessages,
  getMessage,
  archiveMessage,
  deleteMessage,
  replyToMessage,
  getUnreadCount,
} from "../controllers/contactController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import rateLimit from "express-rate-limit";
import csrfProtection from "../middleware/csrfMiddleware.js";
import mongoose from "mongoose";
import { ValidationError } from "../errors/index.js";

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,

  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many messages sent. Please try again later.",
  },

  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Public router ───────────────────────────────────────────────────────── */

export const publicContactRouter = express.Router();

publicContactRouter.post("/", contactLimiter, submitContact);

/* ── Admin router ────────────────────────────────────────────────────────── */

export const adminContactRouter = express.Router();

adminContactRouter.use(
  protect,
  authorize("admin"),
  csrfProtection,
  authRateLimiter,
);

adminContactRouter.param("id", (req, _res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      ValidationError.dto("id", "Invalid message ID format.", "INVALID_VALUE"),
    );
  }
  next();
});

adminContactRouter.get("/", getMessages);
adminContactRouter.get("/unread-count", getUnreadCount);
adminContactRouter.get("/:id", getMessage);
adminContactRouter.patch("/:id/archive", archiveMessage);
adminContactRouter.post("/:id/reply", replyToMessage);
adminContactRouter.delete("/:id", deleteMessage);
