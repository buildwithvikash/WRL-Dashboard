import express from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  listGatePasses,
  createGatePass,
  decideGatePass,
  gateSecurityAction,
  exportGatePasses,
  searchEmployee,
  getEmployeeDetails,
  emailAction,
  listDeptConfig,
  createDeptConfig,
  updateDeptConfig,
  deleteDeptConfig,
  getDeptDirectory,
  syncDeptConfig,
  getHRConfig,
  updateHRConfig,
} from "../controllers/employeeManagement/gatepass.controller.js";

const router = express.Router();

// Public — opened directly from an email client, no session exists. Must be
// registered with its own literal "email-action" segment so it can never be
// shadowed by (or shadow) the generic :id/:stage route below.
router.get("/email-action/:token/:action", emailAction);

router.get("/search-employee", authenticate, searchEmployee);
router.get("/employee-details", authenticate, getEmployeeDetails);

// Department approval config — registered before the generic "/:id/:stage"
// route below so "dept-config" is never captured as an :id.
router.get("/dept-directory", authenticate, getDeptDirectory);
router.post("/dept-config/sync", authenticate, syncDeptConfig);
router.get("/dept-config", authenticate, listDeptConfig);
router.post("/dept-config", authenticate, createDeptConfig);
router.put("/dept-config/:id", authenticate, updateDeptConfig);
router.delete("/dept-config/:id", authenticate, deleteDeptConfig);

router.get("/hr-config", authenticate, getHRConfig);
router.put("/hr-config", authenticate, updateHRConfig);

router.get("/list", authenticate, listGatePasses);
router.post("/create", authenticate, createGatePass);
router.put("/:id/security/:direction", authenticate, gateSecurityAction);
router.put("/:id/:stage", authenticate, decideGatePass);
router.get("/export", authenticate, exportGatePasses);

export default router;
