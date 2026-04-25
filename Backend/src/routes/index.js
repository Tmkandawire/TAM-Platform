import "dotenv/config";
import express from "express";
import authRoutes from "./authRoutes.js";
import adminRoutes from "./adminRoutes.js";

const router = express.Router();

// Mount auth routes
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);

export default router;
