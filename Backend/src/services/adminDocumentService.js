/**
 * @file AdminDocumentService.js
 * @module services
 *
 * Enterprise-grade orchestration layer for document review workflows.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Coordinate workflow execution across repositories/policies
 *  • Orchestrate transactional boundaries
 *  • Coordinate audit creation
 *  • Coordinate event creation
 *  • Coordinate post-commit event dispatch
 *  • Handle bulk workflow orchestration
 *
 * This service intentionally does NOT:
 *  • contain Mongo query construction
 *  • directly mutate persistence models
 *  • perform raw database operations
 *  • contain persistence implementation details
 */

import ApiError from "../utils/apiError.js";
import logger from "../utils/logger.js";

import { withMongoTransaction } from "../transactions/withMongoTransaction.js";

import documentStatusPolicy from "../policies/documentStatusPolicy.js";

import profileRepository from "../repositories/ProfileRepository.js";
import { auditLogRepository } from "../repositories/AuditLogRepository.js";

import priorityService from "./priorityService.js";

import {
  createDocumentAuditEntry,
  createBulkDocumentAuditEntry,
} from "../document/documentAuditFactory.js";

import {
  createDocumentEvent,
  createBulkDocumentEvent,
} from "../document/documentEventFactory.js";

class AdminDocumentService {
  /* ─────────────────────────────────────────
     SMART REVIEW QUEUE
  ───────────────────────────────────────── */

  async getPendingReviews({
    page = 1,
    limit = 10,
    status = "pending",
    documentType,
    priority,
    sortBy = "priority",
  }) {
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const skip = (safePage - 1) * safeLimit;

    const { matchStage, filterConditions } =
      profileRepository.buildReviewQueueCriteria(status, documentType);

    const [profiles, totalProfiles] = await Promise.all([
      profileRepository.getPendingReviewQueue({
        matchStage,
        filterConditions,
        skip,
        limit: safeLimit * 3,
      }),

      profileRepository.countPendingReviews(matchStage),
    ]);

    let enrichedProfiles = priorityService.injectPriority(profiles);

    // Optional priority filtering
    if (priority) {
      const threshold = this.#resolvePriorityThreshold(priority);

      enrichedProfiles = enrichedProfiles.filter(
        (profile) => profile.overallPriorityScore >= threshold,
      );
    }

    // Consistent sorting orchestration
    enrichedProfiles.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.updatedAt) - new Date(b.updatedAt);

        case "newest":
          return new Date(b.updatedAt) - new Date(a.updatedAt);

        case "priority":
        default:
          if (b.overallPriorityScore !== a.overallPriorityScore) {
            return b.overallPriorityScore - a.overallPriorityScore;
          }

          return new Date(a.updatedAt) - new Date(b.updatedAt);
      }
    });

    const paginatedResults = enrichedProfiles.slice(0, safeLimit);

    const pages = Math.ceil(totalProfiles / safeLimit);

    return {
      data: paginatedResults,

      pagination: {
        totalProfiles,
        page: safePage,
        pages,
        limit: safeLimit,

        hasNextPage: safePage < pages,
      },
    };
  }

  /* ─────────────────────────────────────────
     SINGLE DOCUMENT REVIEW
  ───────────────────────────────────────── */

  async reviewDocument({
    adminId,
    targetUserId,
    documentId,
    status,
    reason = null,
    ip = null,
    userAgent = null,
  }) {
    let pendingEvent = null;

    const result = await withMongoTransaction(async (session) => {
      /*
       * STEP 1
       * Fetch review context
       */
      const reviewContext = await profileRepository.getDocumentForReview(
        {
          userId: targetUserId,
          documentId,
        },
        session,
      );

      const { profile, document } = reviewContext;

      /*
       * STEP 2
       * Policy validation
       */
      documentStatusPolicy.assertReviewAllowed({
        document,
        nextStatus: status,
      });

      /*
       * STEP 3
       * Persist workflow decision
       */
      const updatedProfile =
        await profileRepository.applyDocumentReviewDecision(
          {
            userId: targetUserId,
            documentId,
            status,
            adminId,
            reason,
          },
          session,
        );

      /*
       * STEP 4
       * Persist audit trail
       */
      await auditLogRepository.create(
        createDocumentAuditEntry({
          adminId,
          userId: targetUserId,
          documentId,
          documentType: document.documentType,

          previousStatus: document.status,
          newStatus: status,

          reason,
          ip,
          userAgent,
        }),
        session,
      );

      /*
       * STEP 5
       * Prepare post-commit event
       */
      pendingEvent = createDocumentEvent({
        adminId,
        userId: targetUserId,
        documentId,
        documentType: document.documentType,
        status,
        reason,
      });

      logger.info("Document review completed.", {
        adminId,
        targetUserId,
        documentId,

        previousStatus: document.status,
        newStatus: status,
      });

      return updatedProfile;
    });

    /*
     * STEP 6
     * Dispatch AFTER commit succeeds
     */
    this.#dispatchSafely(pendingEvent);

    return result;
  }

  /* ─────────────────────────────────────────
     BULK DOCUMENT REVIEW
  ───────────────────────────────────────── */

  async bulkReviewDocuments({
    adminId,
    action,
    documents,
    reason = null,
    ip = null,
    userAgent = null,
  }) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new ApiError(
        400,
        "Documents payload must be a non-empty array.",
        [],
        "INVALID_BULK_PAYLOAD",
      );
    }

    const groupedDocuments = this.#groupDocumentsByUser(documents);

    const results = [];
    const errors = [];

    for (const [userId, documentIds] of groupedDocuments) {
      const pendingEvents = [];

      try {
        await withMongoTransaction(async (session) => {
          const reviewContext = await Promise.all(
            documentIds.map((documentId) =>
              profileRepository.findDocumentForReview(
                {
                  userId,
                  documentId,
                },
                session,
              ),
            ),
          );

          const validDocuments = [];

          for (const context of reviewContext) {
            if (!context || !context.document) {
              errors.push({
                userId,
                code: "DOCUMENT_NOT_FOUND",
              });

              continue;
            }

            const { document } = context;

            try {
              documentStatusPolicy.assertReviewAllowed({
                document,
                nextStatus: action,
              });

              validDocuments.push(document);
            } catch (err) {
              errors.push({
                userId,
                documentId: String(document._id),
                code: err.code || "INVALID_REVIEW",
                message: err.message,
              });
            }
          }

          if (validDocuments.length === 0) {
            return;
          }

          /*
           * Bulk persistence
           */
          await profileRepository.applyBulkDocumentReviewDecision(
            {
              userId,

              documentIds: validDocuments.map((doc) => doc._id),

              status: action,
              adminId,
              reason,
            },
            session,
          );

          /*
           * Bulk audit persistence
           */
          const auditEntries = validDocuments.map((document) =>
            createBulkDocumentAuditEntry({
              adminId,
              userId,

              documentId: document._id,
              documentType: document.documentType,

              previousStatus: document.status,
              newStatus: action,

              reason,
              ip,
              userAgent,
            }),
          );

          await auditLogRepository.createMany(auditEntries, session);

          /*
           * Prepare events
           */
          for (const document of validDocuments) {
            pendingEvents.push(
              createBulkDocumentEvent({
                adminId,
                userId,

                documentId: document._id,
                documentType: document.documentType,

                status: action,
                reason,
              }),
            );

            results.push({
              userId,
              documentId: String(document._id),

              previousStatus: document.status,
              newStatus: action,
            });
          }
        });

        /*
         * Dispatch after commit
         */
        this.#dispatchManySafely(pendingEvents);
      } catch (err) {
        logger.error("Bulk review transaction failed.", {
          userId,
          error: err.message,
        });

        errors.push({
          userId,
          code: "BULK_TRANSACTION_FAILED",
          message: err.message,
        });
      }
    }

    return {
      total: documents.length,

      succeeded: results.length,
      failed: errors.length,

      results,
      errors,
    };
  }

  /* ─────────────────────────────────────────
     PRIVATE HELPERS
  ───────────────────────────────────────── */

  #groupDocumentsByUser(documents) {
    const grouped = new Map();

    for (const { userId, documentId } of documents) {
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }

      grouped.get(userId).push(documentId);
    }

    return grouped;
  }

  #resolvePriorityThreshold(priority) {
    switch (priority) {
      case "HIGH":
        return 100;

      case "MEDIUM":
        return 40;

      default:
        return 0;
    }
  }

  #dispatchSafely(event) {
    if (!event) {
      return;
    }

    try {
      eventDispatcher.dispatch(event);
    } catch (err) {
      logger.warn("Post-commit event dispatch failed.", {
        error: err.message,
      });
    }
  }

  #dispatchManySafely(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    for (const event of events) {
      this.#dispatchSafely(event);
    }
  }
}

export default new AdminDocumentService();
