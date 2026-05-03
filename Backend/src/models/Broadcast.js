/**
 * @file Broadcast.js
 * @module models
 *
 * Broadcast persistence model for admin-originated, large-scale communication.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Define broadcast persistence structure
 *  • Enforce schema-level validation for payload/audience/settings
 *  • Provide lifecycle-safe counters and transition history storage
 *  • Expose indexes for operational query performance
 *
 * This model intentionally does NOT:
 *  • resolve audiences
 *  • dispatch notifications/emails
 *  • orchestrate retries or delivery workflows
 *
 * Content/format cross-validation (e.g. HTML format with plain content)
 * is intentionally left to the service layer — schema-level regex
 * validation on free-form content is unreliable and fragile.
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

export const BROADCAST_AUDIENCE_TYPE = Object.freeze({
  ALL: "ALL",
  FILTERED: "FILTERED",
});

export const BROADCAST_MESSAGE_FORMAT = Object.freeze({
  PLAIN_TEXT: "PLAIN_TEXT",
  MARKDOWN: "MARKDOWN",
  HTML: "HTML",
});

export const BROADCAST_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  QUEUED: "QUEUED",
  SENDING: "SENDING",
  SENT: "SENT",
  PARTIALLY_FAILED: "PARTIALLY_FAILED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
});

// Exported so validators and other consumers can reference the same
// limits without duplicating magic numbers.
export const TITLE_MAX_LENGTH = 160;
export const SUBJECT_MAX_LENGTH = 78; // RFC 5321 hard limit for email subjects
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const CONTENT_MAX_LENGTH = 50_000;
const MAX_STATE_TRANSITIONS = 50; // prevents unbounded growth on retry loops

/* ─────────────────────────────────────────────
   SUBSCHEMAS
───────────────────────────────────────────── */

const AudienceSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(BROADCAST_AUDIENCE_TYPE),
      index: true,
    },

    /**
     * Serialized filtering criteria for FILTERED audiences.
     *
     * Stored as free-form JSON to preserve query intent snapshots
     * used at send-time and for post-hoc auditability.
     */
    filterCriteria: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

const ChannelSettingsSchema = new Schema(
  {
    notificationEnabled: {
      type: Boolean,
      default: true,
      required: true,
    },
    emailEnabled: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { _id: false },
);

const ChannelCountSchema = new Schema(
  {
    sent: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    failed: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
  },
  { _id: false },
);

const ExecutionTrackingSchema = new Schema(
  {
    totalRecipientsResolved: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    /**
     * Top-level failure rollup across all channels.
     * Avoids summing notification.failed + email.failed at query time.
     */
    totalRecipientsFailed: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    notification: {
      type: ChannelCountSchema,
      default: () => ({}),
      required: true,
    },
    email: {
      type: ChannelCountSchema,
      default: () => ({}),
      required: true,
    },
  },
  { _id: false },
);

const StateTransitionSchema = new Schema(
  {
    /**
     * `from` is nullable (null = initial DRAFT transition with no prior state).
     * `null` is intentionally excluded from the enum — Mongoose enum validation
     * does not handle null reliably. Nullability is expressed via `default: null`
     * and absence of `required`, not via enum membership.
     */
    from: {
      type: String,
      enum: Object.values(BROADCAST_STATUS),
      default: null,
    },
    to: {
      type: String,
      enum: Object.values(BROADCAST_STATUS),
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    changedByAdmin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { _id: false },
);

/* ─────────────────────────────────────────────
   MAIN SCHEMA
───────────────────────────────────────────── */

const BroadcastSchema = new Schema(
  {
    /* ── Identity + ownership ── */
    createdByAdmin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Audit field only — no index. Never queried in isolation.
    updatedByAdmin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* ── Message payload ── */
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: TITLE_MAX_LENGTH,
    },
    /**
     * Email subject line.
     * Capped at 78 chars (RFC 5321) — distinct from title which allows 160.
     */
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: SUBJECT_MAX_LENGTH,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: CONTENT_MAX_LENGTH,
    },
    format: {
      type: String,
      required: true,
      enum: Object.values(BROADCAST_MESSAGE_FORMAT),
      default: BROADCAST_MESSAGE_FORMAT.PLAIN_TEXT,
    },

    /* ── Scheduling ── */
    /**
     * Deferred delivery timestamp.
     * Null = eligible for immediate send once QUEUED.
     * Non-null = dispatcher must wait until this time before sending.
     * Must be a future date when set — enforced by path validator below.
     */
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* ── Audience definition ── */
    audience: {
      type: AudienceSchema,
      required: true,
    },

    /* ── Channel settings ── */
    channels: {
      type: ChannelSettingsSchema,
      required: true,
      default: () => ({}),
    },

    /* ── Execution tracking ── */
    execution: {
      type: ExecutionTrackingSchema,
      required: true,
      default: () => ({}),
    },

    /* ── State machine ── */
    status: {
      type: String,
      enum: Object.values(BROADCAST_STATUS),
      default: BROADCAST_STATUS.DRAFT,
      required: true,
      index: true,
    },
    /**
     * Full audit trail of status transitions.
     * Capped at MAX_STATE_TRANSITIONS to prevent unbounded growth on retry loops.
     * The orchestration layer is responsible for honouring this limit.
     */
    stateTransitions: {
      type: [StateTransitionSchema],
      default: () => [],
      validate: {
        validator(transitions) {
          return (
            Array.isArray(transitions) &&
            transitions.length <= MAX_STATE_TRANSITIONS
          );
        },
        message: `stateTransitions cannot exceed ${MAX_STATE_TRANSITIONS} entries.`,
      },
    },

    /* ── Idempotency ── */
    /**
     * Unique key to prevent duplicate sends.
     * `unique: true` implicitly creates an index — explicit `index: true` is omitted.
     */
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: IDEMPOTENCY_KEY_MAX_LENGTH,
      unique: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/* ─────────────────────────────────────────────
   VALIDATION RULES
───────────────────────────────────────────── */

BroadcastSchema.path("audience").validate(function validateAudience(audience) {
  if (!audience?.type) return false;

  if (audience.type === BROADCAST_AUDIENCE_TYPE.ALL) {
    return audience.filterCriteria == null;
  }

  if (audience.type === BROADCAST_AUDIENCE_TYPE.FILTERED) {
    return audience.filterCriteria != null;
  }

  return false;
}, "Audience configuration is invalid for the selected type.");

BroadcastSchema.path("channels").validate(function validateChannels(channels) {
  return Boolean(channels?.notificationEnabled || channels?.emailEnabled);
}, "At least one delivery channel must be enabled.");

BroadcastSchema.path("scheduledAt").validate(function validateScheduledAt(
  scheduledAt,
) {
  // null = immediate send — always valid
  if (scheduledAt == null) return true;
  return scheduledAt > new Date();
}, "scheduledAt must be a future date.");

/* ─────────────────────────────────────────────
   INDEXES
───────────────────────────────────────────── */

BroadcastSchema.index({ createdAt: -1 });
BroadcastSchema.index({ status: 1, createdAt: -1 });
BroadcastSchema.index({ "audience.type": 1, createdAt: -1 });
BroadcastSchema.index({ status: 1, scheduledAt: 1 }); // dispatcher polling: QUEUED + due time

/* ─────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────── */

export default model("Broadcast", BroadcastSchema);
