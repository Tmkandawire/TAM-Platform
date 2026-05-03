import "dotenv/config";
import express from "express";
import authRoutes from "./authRoutes.js";
import adminRoutes from "./adminRoutes.js";
import broadcastRoutes from "./broadcastRoutes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/admin/broadcast", broadcastRoutes);

export default router;
