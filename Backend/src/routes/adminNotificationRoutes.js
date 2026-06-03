import express from "express";
import {
  getAdminNotifications,
  deleteAdminNotification,
  resendAdminNotification,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize, atLeastRole } from "../middleware/authorize.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(protect, atLeastRole(ROLES.ADMIN));

router.get("/", getAdminNotifications);
router.delete("/:id", deleteAdminNotification);
router.post("/:id/resend", resendAdminNotification);

export default router;
