import express from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  listGatePasses,
  createGatePass,
  decideGatePass,
  gateSecurityAction,
  exportGatePasses,
  searchEmployee,
} from "../controllers/employeeManagement/gatepass.controller.js";

const router = express.Router();

router.get("/search-employee", authenticate, searchEmployee);
router.get("/list", authenticate, listGatePasses);
router.post("/create", authenticate, createGatePass);
router.put("/:id/security/:direction", authenticate, gateSecurityAction);
router.put("/:id/:stage", authenticate, decideGatePass);
router.get("/export", authenticate, exportGatePasses);

export default router;
