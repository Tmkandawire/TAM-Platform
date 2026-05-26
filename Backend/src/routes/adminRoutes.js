import express from "express";
import mongoose from "mongoose";

import { ValidationError } from "../errors/index.js";

import {
  getPendingMembers,
  getMembers,
  approveMember,
  rejectMember,
  suspendMember,
  reinstateMember,
  softDeleteMember,
  hardDeleteMember,
  getMemberStats,
} from "../controllers/adminController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";
import { authRateLimiter } from "../middleware/rateLimitMiddleware.js";
import csrfProtection from "../middleware/csrfMiddleware.js";

const router = express.Router();

router.use(protect, authorize("admin"), csrfProtection, authRateLimiter);
router.param("id", (req, _res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      ValidationError.dto("id", "Invalid member ID format.", "INVALID_VALUE"),
    );
  }
  next();
});

router.get("/stats", getMemberStats);
router.get("/", getMembers);
router.get("/pending", getPendingMembers);

router.patch("/approve/:id", approveMember);
router.patch("/reject/:id", rejectMember);
router.patch("/suspend/:id", suspendMember);
router.patch("/reinstate/:id", reinstateMember);
router.patch("/soft-delete/:id", softDeleteMember);
router.delete("/hard-delete/:id", hardDeleteMember);

export default router;
