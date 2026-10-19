import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { getRecords, getRecordsRange, getSyncLog } from "../controllers/iot/part-process/records.controller.js";
import { getEnergyEstimate } from "../controllers/iot/part-process/energy.controller.js";
import { createDowntimeLog, getDowntimeLogs, deleteDowntimeLog } from "../controllers/iot/part-process/downtime-log.controller.js";
import { createQualityLog, getQualityLogs, deleteQualityLog } from "../controllers/iot/part-process/quality-log.controller.js";

const router = Router();

router.get("/records",       authenticate, getRecords);
router.get("/records-range", authenticate, getRecordsRange);
router.get("/sync-log",      authenticate, getSyncLog);
router.get("/energy-estimate", authenticate, getEnergyEstimate);

router.post("/downtime-log",       authenticate, createDowntimeLog);
router.get("/downtime-log",        authenticate, getDowntimeLogs);
router.delete("/downtime-log/:id", authenticate, deleteDowntimeLog);

router.post("/quality-log",        authenticate, createQualityLog);
router.get("/quality-log",         authenticate, getQualityLogs);
router.delete("/quality-log/:id",  authenticate, deleteQualityLog);

export default router;
