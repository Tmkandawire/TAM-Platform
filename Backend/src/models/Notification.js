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
 *  • Enforce legal status transitions via ALLOWED_TRANSITIONS guard
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
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
} from "../constants/notificationTypes.js";

const { Schema, model } = mongoose;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum lengths prevent:
 *  • accidental oversized payloads
 *  • log pollution
 *  • unbounded storage growth
 *  • UI rendering abuse
 */
const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 2000;

/**
 * Permitted status transitions — enforces the documented state machine:
 *
 *   UNREAD ──► READ ──► ARCHIVED
 *     │                    ▲
 *     └────────────────────┘
 *
 * Keyed by the CURRENT status; values are the Set of states it may
 * transition INTO. Any transition not listed here is illegal.
 *
 * Why a map rather than inline conditions:
 *  • Adding a new status (e.g. SNOOZED) requires one map entry, not
 *    scattered if-branches across the hook.
 *  • The allowed transitions are self-documenting and diffable in code
 *    review without reading hook logic.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [NOTIFICATION_STATUS.UNREAD]: new Set([
    NOTIFICATION_STATUS.READ,
    NOTIFICATION_STATUS.ARCHIVED,
  ]),
  [NOTIFICATION_STATUS.READ]: new Set([NOTIFICATION_STATUS.ARCHIVED]),
  [NOTIFICATION_STATUS.ARCHIVED]: new Set(), // terminal — no further transitions
});

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
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
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
NotificationSchema.index({ user: 1, createdAt: -1 });

/**
 * Optimizes unread-count queries and unread feeds.
 */
NotificationSchema.index({ user: 1, status: 1, createdAt: -1 });

/**
 * Optimizes type-based analytics and operational queries.
 */
NotificationSchema.index({ type: 1, createdAt: -1 });

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
 * Enforces legal status transitions and readAt/status consistency
 * on document saves.
 *
 * Two responsibilities in one hook (rather than two separate pre-save hooks)
 * because both operate on the same `status` field modification and the
 * transition guard must run before the readAt assignment. Splitting them
 * would require ordering guarantees that Mongoose does not provide between
 * same-event hooks.
 *
 * Transition guard:
 *  • Runs only when status is being modified.
 *  • Reads the previous status from Mongoose's internal document state
 *    via $__getValue — this.status at hook time is already the NEW value.
 *  • Blocks any transition not listed in ALLOWED_TRANSITIONS.
 *  • ARCHIVED is terminal — no code path can reopen an archived notification.
 *
 * readAt invariants (applied after transition guard passes):
 *  • READ     → readAt is auto-set if missing (first READ transition only).
 *  • UNREAD   → readAt is auto-cleared if somehow present.
 *  • ARCHIVED → readAt is preserved as-is (notification may have been
 *               read before archiving — the full audit trail is retained).
 *
 * Callers should transition status and let this hook maintain readAt.
 * Direct manipulation of readAt is strongly discouraged.
 */
NotificationSchema.pre("save", function (next) {
  if (!this.isModified("status")) return next();

  // $__getValue reads the committed (pre-modification) value from Mongoose's
  // internal document state. this.status at this point is already the NEW
  // value, so we cannot use it to determine the previous state.
  const previousStatus =
    this.$__getValue("status") ?? NOTIFICATION_STATUS.UNREAD;
  const nextStatus = this.status;

  // Skip when status hasn't actually changed — isModified can fire
  // spuriously when a document is re-saved with identical field values.
  if (previousStatus === nextStatus) return next();

  // ── Transition guard ───────────────────────────────────────────────────
  const allowed = ALLOWED_TRANSITIONS[previousStatus];

  if (!allowed) {
    // Defensive: previousStatus is not a recognised NOTIFICATION_STATUS value.
    // Most likely a bad migration or a manually inserted document.
    return next(
      new Error(
        `Notification: unrecognised current status "${previousStatus}". ` +
          `Cannot validate transition to "${nextStatus}".`,
      ),
    );
  }

  if (!allowed.has(nextStatus)) {
    return next(
      new Error(
        `Notification: illegal status transition "${previousStatus}" → "${nextStatus}". ` +
          `Allowed from "${previousStatus}": ${[...allowed].join(", ") || "none (terminal state)"}.`,
      ),
    );
  }

  // ── readAt invariants (transition is valid) ────────────────────────────
  if (nextStatus === NOTIFICATION_STATUS.READ && !this.readAt) {
    this.readAt = new Date();
  }

  if (nextStatus === NOTIFICATION_STATUS.UNREAD && this.readAt) {
    this.readAt = null;
  }

  // ARCHIVED: readAt preserved intentionally — no action needed.

  next();
});

/**
 * Enforces readAt/status consistency for update operations.
 *
 * `pre("save")` only fires for document-level saves. Direct update calls
 * (findOneAndUpdate, updateMany, etc.) bypass it entirely. This hook
 * mirrors the same readAt invariants for the update path.
 *
 * Transition guard is intentionally NOT duplicated here — update operations
 * in the repository already scope their queries to the correct current status
 * (e.g. `{ status: UNREAD }` filter on markAsRead), which prevents illegal
 * transitions at the query level. Adding a full guard here would require
 * reading the current document status in every update hook, adding a
 * DB round-trip per write that the repository-level scoping already prevents.
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
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
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

/**
 * Re-exported so existing imports from this file (e.g. notificationFactory.js
 * which does `import { NOTIFICATION_TYPE } from "../../models/Notification.js"`)
 * continue to resolve without modification.
 *
 * Canonical definitions live in constants/notificationTypes.js.
 */
export { NOTIFICATION_TYPE, NOTIFICATION_STATUS };
