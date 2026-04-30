/**
 * @file Notification.js
 * @module models
 *
 * Enterprise-grade Notification persistence model.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Define notification persistence structure
 *  • Enforce schema-level validation
 *  • Define indexes for query performance
 *  • Define lifecycle-related persistence behaviour
 *  • Enforce readAt/status invariant via pre-save and pre-update hooks
 *  • Expose static query helpers to prevent scattered raw queries
 *
 * This model intentionally does NOT:
 *  • contain business logic
 *  • dispatch notifications
 *  • create notification payloads
 *  • send emails/SMS/push events
 *  • perform orchestration
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Notification delivery/read states.
 *
 * ARCHIVED is intentionally included now to avoid future enum migrations.
 */
export const NOTIFICATION_STATUS = Object.freeze({
  UNREAD: "UNREAD",
  READ: "READ",
  ARCHIVED: "ARCHIVED",
});

/**
 * Known machine-readable notification types.
 *
 * Enumerated here to prevent typo-driven silent failures. If notification
 * types become dynamic (e.g. plugin-driven), remove this enum and document
 * that callers are responsible for type correctness.
 */
export const NOTIFICATION_TYPE = Object.freeze({
  DOCUMENT_APPROVED: "DOCUMENT_APPROVED",
  DOCUMENT_REJECTED: "DOCUMENT_REJECTED",
  BROADCAST: "BROADCAST",
});

/**
 * Maximum lengths prevent:
 *  • accidental oversized payloads
 *  • log pollution
 *  • unbounded storage growth
 *  • UI rendering abuse
 */
const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 2000;

/* ─────────────────────────────────────────────
   SUBSCHEMAS
───────────────────────────────────────────── */

/**
 * Flexible metadata container.
 *
 * strict: false is intentional:
 * notification metadata varies significantly between event types.
 *
 * _id disabled because metadata objects are not standalone entities.
 */
const MetadataSchema = new Schema(
  {},
  {
    _id: false,
    strict: false,
  },
);

/* ─────────────────────────────────────────────
   MAIN SCHEMA
───────────────────────────────────────────── */

const NotificationSchema = new Schema(
  {
    /**
     * Notification recipient.
     *
     * Indexed because virtually all notification queries are user-scoped.
     */
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Machine-readable notification type.
     *
     * Enumerated via NOTIFICATION_TYPE to prevent typo-driven silent failures.
     * If types become dynamic in the future, replace enum with format-only
     * constraints (uppercase, minlength, maxlength) and document the decision.
     *
     * Indexed for analytics, filtering, and future worker pipelines.
     */
    type: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: Object.values(NOTIFICATION_TYPE),
      minlength: 3,
      maxlength: 100,
      index: true,
    },

    /**
     * Human-readable notification title.
     */
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: TITLE_MAX_LENGTH,
    },

    /**
     * Human-readable notification body.
     */
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: MESSAGE_MAX_LENGTH,
    },

    /**
     * Notification lifecycle state.
     */
    status: {
      type: String,
      enum: Object.values(NOTIFICATION_STATUS),
      default: NOTIFICATION_STATUS.UNREAD,
      required: true,
      index: true,
    },

    /**
     * Flexible contextual payload.
     *
     * Examples:
     *  • documentId
     *  • documentType
     *  • adminId
     *  • broadcastId
     *
     * Stored separately from human-readable content to preserve
     * machine-readable event context.
     */
    metadata: {
      type: MetadataSchema,
      default: () => ({}),
    },

    /**
     * Timestamp representing when the user read the notification.
     *
     * Null while unread.
     *
     * Kept consistent with `status` via pre-save and pre-update hooks —
     * callers should NOT set this field directly; transition via `status`.
     */
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,

    /**
     * Remove __v from serialized output.
     */
    versionKey: false,

    /**
     * Ensure virtuals are included consistently if added later.
     */
    toJSON: {
      virtuals: true,
    },

    toObject: {
      virtuals: true,
    },
  },
);

/* ─────────────────────────────────────────────
   INDEXES
───────────────────────────────────────────── */

/**
 * Optimizes:
 *  • user notification feeds
 *  • newest-first notification queries
 */
NotificationSchema.index({
  user: 1,
  createdAt: -1,
});

/**
 * Optimizes unread-count queries and unread feeds.
 */
NotificationSchema.index({
  user: 1,
  status: 1,
  createdAt: -1,
});

/**
 * Optimizes type-based analytics and operational queries.
 */
NotificationSchema.index({
  type: 1,
  createdAt: -1,
});

/**
 * Partial index on readAt — scoped to documents where readAt is non-null.
 *
 * A standard index would store null for the majority of documents (unread),
 * wasting space and slowing writes. This partial index only covers the
 * minority of read notifications, making "read in last N days" queries
 * fast and storage-efficient.
 */
NotificationSchema.index(
  { user: 1, readAt: -1 },
  { partialFilterExpression: { readAt: { $ne: null } } },
);

/* ─────────────────────────────────────────────
   LIFECYCLE HOOKS
───────────────────────────────────────────── */

/**
 * Enforces readAt/status consistency on document saves.
 *
 * Invariants:
 *  • READ   → readAt must be a Date (auto-set if missing)
 *  • UNREAD → readAt must be null  (auto-cleared if present)
 *  • ARCHIVED → readAt is preserved as-is (notification may have been
 *               read before archiving)
 *
 * Callers should transition status and let this hook maintain readAt.
 * Direct manipulation of readAt is strongly discouraged.
 */
NotificationSchema.pre("save", function (next) {
  if (this.status === NOTIFICATION_STATUS.READ && !this.readAt) {
    this.readAt = new Date();
  }

  if (this.status === NOTIFICATION_STATUS.UNREAD && this.readAt) {
    this.readAt = null;
  }

  next();
});

/**
 * Enforces readAt/status consistency for update operations.
 *
 * `pre("save")` only fires for document-level saves. Direct update calls
 * (findOneAndUpdate, updateMany, etc.) bypass it entirely. This hook
 * mirrors the same invariants for the update path.
 *
 * Applies to: findOneAndUpdate, updateOne, updateMany.
 */
NotificationSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  function (next) {
    const update = this.getUpdate();

    // Normalise: handle both $set and top-level update shapes
    const fields = update?.$set ?? update ?? {};
    const statusUpdate = fields.status;

    if (statusUpdate === NOTIFICATION_STATUS.READ && !fields.readAt) {
      const setter = update.$set ?? (update.$set = {});
      setter.readAt = new Date();
    }

    if (
      statusUpdate === NOTIFICATION_STATUS.UNREAD &&
      fields.readAt !== undefined
    ) {
      const setter = update.$set ?? (update.$set = {});
      setter.readAt = null;
    }

    next();
  },
);

/* ─────────────────────────────────────────────
   STATIC QUERY HELPERS
───────────────────────────────────────────── */

/**
 * Static helpers centralise common query patterns and prevent raw queries
 * from being scattered across service layers. This keeps query logic
 * maintainable, testable, and consistent.
 */

/**
 * Returns the most recent unread notifications for a user.
 *
 * @param {ObjectId|string} userId
 * @param {number} [limit=20]
 * @returns {Query}
 */
NotificationSchema.statics.findUnreadByUser = function (userId, limit = 20) {
  return this.find({ user: userId, status: NOTIFICATION_STATUS.UNREAD })
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Returns the count of unread notifications for a user.
 *
 * Prefer countDocuments over find().length for performance on large collections.
 *
 * @param {ObjectId|string} userId
 * @returns {Promise<number>}
 */
NotificationSchema.statics.countUnreadByUser = function (userId) {
  return this.countDocuments({
    user: userId,
    status: NOTIFICATION_STATUS.UNREAD,
  });
};

/**
 * Returns a paginated notification feed for a user, newest first.
 *
 * @param {ObjectId|string} userId
 * @param {{ page?: number, limit?: number }} [options]
 * @returns {Query}
 */
NotificationSchema.statics.findFeedByUser = function (
  userId,
  { page = 1, limit = 20 } = {},
) {
  // Defensive pagination normalization
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

  // Prevent abusive or accidental oversized queries
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 20, 1),
    100,
  );

  const skip = (safePage - 1) * safeLimit;

  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit);
};
/**
 * Marks all unread notifications for a user as READ in a single update.
 *
 * Uses updateMany for efficiency — avoids loading documents into memory.
 * The pre-update hook ensures readAt is set consistently.
 *
 * @param {ObjectId|string} userId
 * @returns {Promise<mongoose.UpdateWriteOpResult>}
 */
NotificationSchema.statics.markAllReadByUser = function (userId) {
  return this.updateMany(
    { user: userId, status: NOTIFICATION_STATUS.UNREAD },
    { $set: { status: NOTIFICATION_STATUS.READ } },
  );
};

/* ─────────────────────────────────────────────
   FUTURE TTL STRATEGY (INTENTIONALLY DISABLED)
───────────────────────────────────────────── */

/**
 * NOTE:
 *
 * Automatic TTL cleanup is intentionally NOT enabled yet.
 *
 * Reason:
 * Notifications are operational/audit-adjacent records and retention
 * requirements should be defined explicitly by business policy before
 * enabling automated deletion.
 *
 * Future example:
 *
 * NotificationSchema.index(
 *   { createdAt: 1 },
 *   { expireAfterSeconds: 60 * 60 * 24 * 90 }
 * );
 */

/* ─────────────────────────────────────────────
   MODEL
───────────────────────────────────────────── */

const Notification = model("Notification", NotificationSchema);

export default Notification;
