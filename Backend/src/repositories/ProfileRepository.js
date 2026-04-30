/**
 * @file ProfileRepository.js
 * @module repositories
 *
 * Enterprise-grade workflow-oriented repository for Profile persistence.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Own ALL MongoDB/Mongoose query construction
 *  • Return immutable plain JS snapshots only
 *  • Centralize serialization behaviour
 *  • Provide workflow-oriented persistence methods
 *  • Encapsulate nested document persistence semantics
 *  • Forward transactional sessions consistently
 *
 * This module intentionally does NOT:
 *  • contain business rules/policies
 *  • manage transactions
 *  • emit events
 *  • perform authorization
 *  • orchestrate workflows
 */

import { NotFoundError } from "../errors/NotFoundError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const ENTITY_NAME = "Profile";

const LEAN_OPTIONS = Object.freeze({
  getters: true,
  virtuals: true,
  versionKey: false,
});

const DEFAULT_QUEUE_LIMIT = 10;
const MAX_QUEUE_LIMIT = 50;

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

function buildQueryOptions(session) {
  return session ? { session } : {};
}

function assertFound(doc, identifier) {
  if (doc == null) {
    throw new NotFoundError(`${ENTITY_NAME} not found: ${identifier}`);
  }
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `ProfileRepository: \`${fieldName}\` must be a non-negative integer.`,
    );
  }
}

function resolveQueueLimit(limit) {
  if (limit == null) {
    return DEFAULT_QUEUE_LIMIT;
  }

  return Math.min(limit, MAX_QUEUE_LIMIT);
}

function assertPlainObject(value, name) {
  if (value === null || typeof value !== "object") {
    throw new TypeError(
      `ProfileRepository: \`${name}\` must be a plain object.`,
    );
  }

  const proto = Object.getPrototypeOf(value);

  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      `ProfileRepository: \`${name}\` must be a plain object ` +
        `(arrays, class instances, and built-in objects are not accepted).`,
    );
  }
}

function deepFreezeClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return Object.freeze(obj.map((item) => deepFreezeClone(item)));
  }

  const cloned = {};

  for (const key of Object.keys(obj)) {
    cloned[key] = deepFreezeClone(obj[key]);
  }

  return Object.freeze(cloned);
}

async function executeLeanQuery(query) {
  const result = await query.lean(LEAN_OPTIONS).exec();

  return deepFreezeClone(result);
}

/* ─────────────────────────────────────────────
   REPOSITORY
───────────────────────────────────────────── */

export class ProfileRepository {
  /** @type {import("mongoose").Model} */
  #model;

  constructor(ProfileModel) {
    if (ProfileModel == null || typeof ProfileModel.findById !== "function") {
      throw new TypeError(
        "ProfileRepository: constructor requires a valid Mongoose model.",
      );
    }

    this.#model = ProfileModel;

    Object.freeze(this);
  }

  /* ─────────────────────────────────────────
     STANDARD READS
  ───────────────────────────────────────── */

  async findById(id, session) {
    return executeLeanQuery(this.#model.findById(id).session(session ?? null));
  }

  async findByUserId(userId, session) {
    return executeLeanQuery(
      this.#model.findOne({ userId }).session(session ?? null),
    );
  }

  async getById(id, session) {
    const doc = await this.findById(id, session);

    assertFound(doc, id);

    return doc;
  }

  async getByUserId(userId, session) {
    const doc = await this.findByUserId(userId, session);

    assertFound(doc, userId);

    return doc;
  }

  /* ─────────────────────────────────────────
     REVIEW QUEUE
  ───────────────────────────────────────── */

  buildReviewQueueCriteria(status, documentType) {
    const matchStage = {
      "documents.status": status,
    };

    if (documentType) {
      matchStage["documents.documentType"] = documentType;
    }

    const filterConditions = [
      {
        $eq: ["$$doc.status", status],
      },
    ];

    if (documentType) {
      filterConditions.push({
        $eq: ["$$doc.documentType", documentType],
      });
    }

    return Object.freeze({
      matchStage,
      filterConditions,
    });
  }

  async getPendingReviewQueue(
    { matchStage, filterConditions, skip = 0, limit = DEFAULT_QUEUE_LIMIT },
    session,
  ) {
    assertPlainObject(matchStage, "matchStage");

    if (!Array.isArray(filterConditions)) {
      throw new TypeError(
        "ProfileRepository: `filterConditions` must be an array.",
      );
    }

    assertPositiveInteger(skip, "skip");

    const safeLimit = resolveQueueLimit(limit);

    const pipeline = [
      {
        $match: matchStage,
      },

      {
        $project: {
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          tinNumber: 1,

          documents: {
            $filter: {
              input: "$documents",
              as: "doc",
              cond: {
                $and: filterConditions,
              },
            },
          },
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",

          pipeline: [
            {
              $project: {
                email: 1,
                role: 1,
                status: 1,
              },
            },
          ],
        },
      },

      {
        $unwind: "$user",
      },

      {
        $skip: skip,
      },

      {
        $limit: safeLimit,
      },
    ];

    const results = await this.#model
      .aggregate(pipeline)
      .session(session ?? null);

    return deepFreezeClone(results);
  }

  async countPendingReviews(matchStage, session) {
    assertPlainObject(matchStage, "matchStage");

    return this.#model.countDocuments(matchStage).session(session ?? null);
  }

  /* ─────────────────────────────────────────
     REVIEW FETCH OPERATIONS
  ───────────────────────────────────────── */

  async findDocumentForReview({ userId, documentId }, session) {
    const profile = await executeLeanQuery(
      this.#model
        .findOne({
          userId,
          "documents._id": documentId,
        })
        .session(session ?? null),
    );

    if (!profile) {
      return null;
    }

    const document = profile.documents.find(
      (doc) => String(doc._id) === String(documentId),
    );

    return deepFreezeClone({
      profile,
      document: document ?? null,
    });
  }

  async getDocumentForReview(params, session) {
    const result = await this.findDocumentForReview(params, session);

    assertFound(result, params.documentId);

    return result;
  }

  /* ─────────────────────────────────────────
     REVIEW PERSISTENCE
  ───────────────────────────────────────── */

  async applyDocumentReviewDecision(
    { userId, documentId, status, adminId, reason = null },
    session,
  ) {
    const update = {
      $set: {
        "documents.$.status": status,
        "documents.$.verifiedBy": adminId,
        "documents.$.verifiedAt": new Date(),
        "documents.$.rejectionReason": status === "rejected" ? reason : null,
      },
    };

    const updated = await executeLeanQuery(
      this.#model.findOneAndUpdate(
        {
          userId,
          "documents._id": documentId,
        },
        update,
        {
          new: true,
          runValidators: true,
          ...buildQueryOptions(session),
        },
      ),
    );

    return updated;
  }

  async applyBulkDocumentReviewDecision(
    { userId, documentIds, status, adminId, reason = null },
    session,
  ) {
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      throw new RangeError(
        "ProfileRepository: `documentIds` must be a non-empty array.",
      );
    }

    const update = {
      $set: {
        "documents.$[doc].status": status,
        "documents.$[doc].verifiedBy": adminId,
        "documents.$[doc].verifiedAt": new Date(),
        "documents.$[doc].rejectionReason":
          status === "rejected" ? reason : null,
      },
    };

    const updated = await executeLeanQuery(
      this.#model.findOneAndUpdate(
        {
          userId,
        },
        update,
        {
          new: true,
          runValidators: true,

          arrayFilters: [
            {
              "doc._id": {
                $in: documentIds,
              },
            },
          ],

          ...buildQueryOptions(session),
        },
      ),
    );

    return updated;
  }

  /* ─────────────────────────────────────────
     STANDARD WRITES
  ───────────────────────────────────────── */

  async create(data, session) {
    const [created] = await this.#model.create(
      [data],
      buildQueryOptions(session),
    );

    return deepFreezeClone(created.toObject(LEAN_OPTIONS));
  }

  async deleteById(id, session) {
    return executeLeanQuery(
      this.#model.findByIdAndDelete(id, buildQueryOptions(session)),
    );
  }
}

/* ─────────────────────────────────────────────
    EXPORT INSTANCE
───────────────────────────────────────────── */

import Profile from "../models/Profile.js";

const profileRepository = new ProfileRepository(Profile);

export default profileRepository;
