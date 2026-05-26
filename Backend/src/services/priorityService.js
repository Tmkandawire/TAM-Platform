/**
 * @file priorityService.js
 * @description Enterprise scoring engine for document review urgency
 */

import logger from "../utils/logger.js";

/* -------------------------
   CONFIG (CENTRALIZED)
------------------------- */
const DOC_WEIGHTS = Object.freeze({
  businessCert: 60,
  tinCertificate: 30,
  nationalId: 60,
  passport: 60,
  utilityBill: 10,
});

const STATUS_MULTIPLIER = Object.freeze({
  expired: 2, // 🔥 Critical boost
  pending: 1,
  rejected: 0, // Ignore
  approved: 0, // Ignore
});

const PRIORITY_LEVELS = Object.freeze({
  HIGH: { label: "HIGH", threshold: 55 },
  MEDIUM: { label: "MEDIUM", threshold: 25 },
  LOW: { label: "LOW", threshold: 0 },
});

/* -------------------------
   SERVICE
------------------------- */
class PriorityService {
  calculateDocumentPriority(doc) {
    try {
      if (!doc || !doc.documentType) {
        return { priorityLevel: "LOW", priorityScore: 0 };
      }

      // ❌ Skip non-actionable docs
      if (["approved", "rejected"].includes(doc.status)) {
        return { priorityLevel: "LOW", priorityScore: 0 };
      }

      let baseScore = DOC_WEIGHTS[doc.documentType] || 0;

      /* -------------------------
         EXPIRY LOGIC
      ------------------------- */
      let status = doc.status;

      if (doc.expiryDate && new Date(doc.expiryDate) < new Date()) {
        status = "expired";
      }

      const multiplier = STATUS_MULTIPLIER[status] || 1;

      let score = baseScore * multiplier;

      /* -------------------------
         AGE (FIFO PRIORITY)
      ------------------------- */
      const uploadedAt = doc.uploadedAt || doc.createdAt;
      if (uploadedAt) {
        const hours = (Date.now() - new Date(uploadedAt)) / (1000 * 60 * 60);
        score += Math.min(hours * 0.2, 20); // stronger but capped
      }

      /* -------------------------
         FINAL LEVEL
      ------------------------- */
      const priorityLevel = this._mapScoreToLevel(score);

      return {
        priorityLevel,
        priorityScore: Number(score.toFixed(2)),
      };
    } catch (error) {
      logger.error("❌ Priority calculation failed", { error: error.message });
      return { priorityLevel: "LOW", priorityScore: 0 };
    }
  }

  _mapScoreToLevel(score) {
    if (score >= PRIORITY_LEVELS.HIGH.threshold) return "HIGH";
    if (score >= PRIORITY_LEVELS.MEDIUM.threshold) return "MEDIUM";
    return "LOW";
  }

  /* -------------------------
     PROFILE PRIORITY INJECTION
  ------------------------- */
  injectPriority(profiles = []) {
    return profiles.map((profile) => {
      const scoredDocuments = (profile.documents || [])
        .map((doc) => {
          const normalized = doc.toObject ? doc.toObject() : doc;

          return {
            ...normalized,
            ...this.calculateDocumentPriority(normalized),
          };
        })
        .filter((d) => d.priorityScore > 0); // remove irrelevant docs

      const overallPriorityScore = scoredDocuments.reduce(
        (max, d) => Math.max(max, d.priorityScore),
        0,
      );

      return {
        ...profile,
        documents: scoredDocuments,
        overallPriorityScore,
      };
    });
  }
}

export default new PriorityService();
