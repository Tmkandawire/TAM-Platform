import express from "express";
import {
  getPendingMembers,
  approveMember,
  rejectMember,
  suspendMember,
} from "../controllers/adminController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorize("admin"));

router.get("/pending", getPendingMembers);

router.patch("/approve/:id", approveMember);
router.patch("/reject/:id", rejectMember);
router.patch("/suspend/:id", suspendMember);

export default router;
