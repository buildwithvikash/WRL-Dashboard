import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  getRecipients, createRecipient, updateRecipient, deleteRecipient, testRecipient, sendReportNow,
} from "../controllers/chemical/chemBulkStorageRecipients.controller.js";

import { getCurrentLevels, getDailyReport, getReadings } from "../controllers/chemical/chemReports.controller.js";

const router = Router();

// Reports & data
router.get("/tanks/current",          authenticate, getCurrentLevels);
router.get("/reports/daily",          authenticate, getDailyReport);
router.get("/readings",               authenticate, getReadings);

// Bulk Storage Mail Recipients
router.get("/recipients",             authenticate, getRecipients);
router.post("/recipients",            authenticate, createRecipient);
router.put("/recipients/:id",         authenticate, updateRecipient);
router.delete("/recipients/:id",      authenticate, deleteRecipient);
router.post("/recipients/:id/test",   authenticate, testRecipient);
router.post("/send-now",              authenticate, sendReportNow);

export default router;
