/**
 * @file AdminDocumentService.js
 * @module services
 *
 * Enterprise-grade orchestration layer for document review workflows.
 */
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { ValidationError } from "../errors/index.js";

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

// FIX: eventDispatcher was referenced in #dispatchSafely but never imported,
// causing a ReferenceError on every document action and review queue fetch.
import eventDispatcher from "../dispatchers/eventDispatcher.js";

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

    const result = await withMongoTransaction(
      mongoose.connection,
      async (session) => {
        const reviewContext = await profileRepository.getDocumentForReview(
          {
            userId: targetUserId,
            documentId,
          },
          session,
        );

        const { profile, document } = reviewContext;

        documentStatusPolicy.assertReviewAllowed({
          document,
          nextStatus: status,
        });

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

        // FIX: added "action: status" — factory requires "action", not "newStatus" alone
        await auditLogRepository.create(
          createDocumentAuditEntry({
            adminId,
            userId: targetUserId,
            docId: documentId,
            documentType: document.documentType,
            action: status,
            previousStatus: document.status,
            newStatus: status,
            reason,
            ip,
            userAgent,
          }),
          session,
        );

        // FIX: renamed "status" to "action" — event factory requires "action" field
        pendingEvent = createDocumentEvent({
          adminId,
          userId: targetUserId,
          docId: documentId,
          documentType: document.documentType,
          action: status,
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
      },
    );

    this.#dispatchSafely(pendingEvent);

    return result;
  }

  /* ─────────────────────────────────────────
     REQUEST RESUBMISSION
  ───────────────────────────────────────── */

  async requestResubmission({
    adminId,
    targetUserId,
    documentId,
    reason,
    documentsRequired,
    ip = null,
    userAgent = null,
  }) {
    const result = await withMongoTransaction(
      mongoose.connection,
      async (session) => {
        const reviewContext = await profileRepository.getDocumentForReview(
          {
            userId: targetUserId,
            documentId,
          },
          session,
        );

        const { document } = reviewContext;

        const policy = documentStatusPolicy.validateResubmission({
          document,
          reason,
          documentsRequired,
        });

        if (!policy.allowed) {
          throw new ValidationError(policy.reason, policy.code);
        }

        const updatedProfile =
          await profileRepository.applyDocumentResubmissionRequest(
            {
              userId: targetUserId,
              docId: documentId,
              adminId,
              reason,
              documentsRequired,
            },
            session,
          );

        // audit entry is correct — action: "resubmission_required" is valid
        await auditLogRepository.create(
          createDocumentAuditEntry({
            adminId,
            userId: targetUserId,
            docId: documentId,
            documentType: document.documentType,
            action: "resubmission_required",
            previousStatus: document.status,
            newStatus: "resubmission_required",
            reason,
            documentsRequired,
            ip,
            userAgent,
          }),
          session,
        );

        // FIX: "resubmission_required" is not in the event factory's EVENT_MAP
        // (only "approved" and "rejected" are supported). No event is dispatched
        // for resubmission — pendingEvent stays null and #dispatchSafely is a no-op.

        logger.info("Document resubmission requested.", {
          adminId,
          targetUserId,
          documentId,
          previousStatus: document.status,
          newStatus: "resubmission_required",
          documentsRequired,
        });

        return updatedProfile;
      },
    );

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
      throw ValidationError.dto(
        "documents",
        "Documents payload must be a non-empty array.",
        "INVALID_BULK_PAYLOAD",
      );
    }

    const groupedDocuments = this.#groupDocumentsByUser(documents);

    const results = [];
    const errors = [];

    for (const [userId, documentIds] of groupedDocuments) {
      const pendingEvents = [];

      try {
        await withMongoTransaction(mongoose.connection, async (session) => {
          const reviewContext = await Promise.all(
            documentIds.map((docId) =>
              profileRepository.findDocumentForReview(
                { userId, documentId: docId },
                session,
              ),
            ),
          );

          const validDocuments = [];

          for (let i = 0; i < reviewContext.length; i++) {
            const context = reviewContext[i];

            if (!context || !context.document) {
              errors.push({
                userId,
                docId: String(documentIds[i]),
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
                docId: String(document._id),
                code: err.code || "INVALID_REVIEW",
                message: err.message,
              });
            }
          }

          if (validDocuments.length === 0) {
            return;
          }

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

          // FIX: added "action" field — factory requires it, was missing before
          const auditEntries = validDocuments.map((document) =>
            createBulkDocumentAuditEntry({
              adminId,
              userId,
              docId: String(document._id),
              documentType: document.documentType,
              action,
              previousStatus: document.status,
              newStatus: action,
              reason,
              ip,
              userAgent,
            }),
          );

          await auditLogRepository.createMany(auditEntries, session);

          // FIX: renamed "status" to "action" — event factory requires "action" field
          for (const document of validDocuments) {
            pendingEvents.push(
              createBulkDocumentEvent({
                adminId,
                userId,
                docId: String(document._id),
                documentType: document.documentType,
                action,
                reason,
              }),
            );

            results.push({
              userId,
              docId: String(document._id),
              previousStatus: document.status,
              newStatus: action,
            });
          }
        });

        this.#dispatchManySafely(pendingEvents);
      } catch (err) {
        logger.error("Bulk review transaction failed.", {
          userId,
          error: err.message,
        });

        for (const documentId of documentIds) {
          errors.push({
            userId,
            docId: String(documentId),
            code: "BULK_TRANSACTION_FAILED",
            message: err.message,
          });
        }
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

    for (const { userId, docId } of documents) {
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }

      grouped.get(userId).push(docId);
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
    if (!event) return;

    try {
      eventDispatcher.dispatch(event);
    } catch (err) {
      logger.warn("Post-commit event dispatch failed.", {
        error: err.message,
      });
    }
  }

  #dispatchManySafely(events) {
    if (!Array.isArray(events) || events.length === 0) return;

    for (const event of events) {
      this.#dispatchSafely(event);
    }
  }
}

export default new AdminDocumentService();
