import "dotenv/config";
import express from "express";
import authRoutes from "./authRoutes.js";
import adminRoutes from "./adminRoutes.js";
import adminDocumentRoutes from "./adminDocumentRoutes.js";
import broadcastRoutes from "./broadcastRoutes.js";
import memberRoutes from "./memberRoutes.js";
import documentRoutes from "./documentRoutes.js";
import auditRoutes from "./auditRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import settingsRoutes from "./settingsRoutes.js";
import adminNotificationRoutes from "./adminNotificationRoutes.js";
import { publicContactRouter, adminContactRouter } from "./contactRoutes.js";

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
router.use("/auth", authRoutes);

// ── Public section ───────────────────────────────────────────────────────────
router.use("/contact", publicContactRouter);

// ── Member portal ─────────────────────────────────────────────────────────────
router.use("/members", memberRoutes);
router.use("/documents", documentRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", settingsRoutes);

// ── Admin portal ──────────────────────────────────────────────────────────────
// Each admin resource is mounted separately so route paths match the frontend:
//   /api/v1/admin/members/*    → adminRoutes
//   /api/v1/admin/documents/*  → adminDocumentRoutes
//   /api/v1/admin/broadcasts   → broadcastRoutes
//   /api/v1/admin/audit-logs   → auditRoutes
//  /api/v1/admin/notifications → adminNotificationRoutes
// /api/v1/admin/contact       → adminContactRouter
router.use("/admin/members", adminRoutes);
router.use("/admin/documents", adminDocumentRoutes);
router.use("/admin/broadcasts", broadcastRoutes);
router.use("/admin/audit-logs", auditRoutes);
router.use("/admin/notifications", adminNotificationRoutes);
router.use("/admin/contact", adminContactRouter);

export default router;
