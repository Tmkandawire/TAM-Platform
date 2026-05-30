import express from "express";
import {
  getAdminNotifications,
  deleteAdminNotification,
  resendAdminNotification,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

router.use(protect, authorize("admin"));

router.get("/", getAdminNotifications);
router.delete("/:id", deleteAdminNotification);
router.post("/:id/resend", resendAdminNotification);

export default router;
