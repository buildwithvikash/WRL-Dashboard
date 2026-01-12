import express from "express";

/* ===== MULTER UPLOADS (FROM CONFIG) ===== */
import {
  uploadTrainingMaterial,
  uploadTrainingImages,
  uploadTrainingReportFile,
  handleMulterError,
} from "../middlewares/uploadMiddleware.js";

/* ===== CONTROLLERS ===== */
import {
  createTraining,
  getAllTrainings,
  getTrainingById,
  updateTraining,
  getInternalTrainers,
  getEmployeesForNomination,
  saveNominations,
  getNominationsByTraining,
  uploadMaterial,
  uploadTrainingImages as saveTrainingImages,
  uploadTrainingReport,
  getTrainingMaterials,
  deleteMaterial,
  saveTrainingAttendance,
  getTrainingAttendance,
} from "../controllers/training/training.controller.js";

const router = express.Router();

/* ================= TRAINING ================= */
router.post("/create-training", createTraining);
router.get("/get-training", getAllTrainings);
router.get("/training/:id", getTrainingById);
router.put("/training/:id", updateTraining);

/* ================= PEOPLE ================= */
router.get("/internal-trainers", getInternalTrainers);
router.get("/employees", getEmployeesForNomination);

/* ================= NOMINATIONS ================= */
router.post("/:id/nominations", saveNominations);
router.get("/:id/nominated", getNominationsByTraining);

/* ================= MATERIALS ================= */

// Training material (PPT / PDF / VIDEO / EXCEL)
router.post(
  "/:id/materials",
  uploadTrainingMaterial.single("file"),
  handleMulterError,
  uploadMaterial
);

// Training images (multiple)
router.post(
  "/:id/materials/images",
  uploadTrainingImages.array("files", 10),
  handleMulterError,
  saveTrainingImages
);

// Training report (single)
router.post(
  "/:id/materials/report",
  uploadTrainingReportFile.single("file"),
  handleMulterError,
  uploadTrainingReport
);

// Get materials
router.get("/:id/materials", getTrainingMaterials);

// Delete material
router.delete("/materials/:id", deleteMaterial);

// save attendence
router.post("/:id/attendance", saveTrainingAttendance);
router.get("/:id/attendance", getTrainingAttendance);

export default router;
