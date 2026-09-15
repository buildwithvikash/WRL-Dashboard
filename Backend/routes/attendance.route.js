import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { getAttendanceReport } from "../controllers/production/attendance.controller.js";
import {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  approveLeave,
  rejectLeave,
  cancelLeave,
  generateAutoCO,
} from "../controllers/production/leave.controller.js";

// Mounted at /manpower — kept as the original base path since the restored
// Attendance/Leave frontend pages (Frontend/src/pages/Forms/) already call
// these exact routes verbatim. The Manpower Request feature that used to
// share this base path was removed separately and is not part of this file.
const router = express.Router();

router.get("/attendance", authenticate, getAttendanceReport);

router.post("/leave/apply", authenticate, applyLeave);
router.get("/leave/my", authenticate, getMyLeaves);
router.get("/leave/all", authenticate, getAllLeaves);
router.put("/leave/:id/approve", authenticate, approveLeave);
router.put("/leave/:id/reject", authenticate, rejectLeave);
router.put("/leave/:id/cancel", authenticate, cancelLeave);
router.post("/leave/auto-co", authenticate, generateAutoCO);

export default router;
