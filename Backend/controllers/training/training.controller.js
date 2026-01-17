import sql from "mssql";
import { dbConfig3 } from "../../config/db.js";
import { tryCatch } from "../../config/tryCatch.js";
import { AppError } from "../../utils/AppError.js";
import { sendTrainingAssignedEmail } from "../../config/emailConfig.js";
import path from "path";
import fs from "fs";

/* ======================== CREATE TRAINING POST /training ====================================================== */
export const createTraining = tryCatch(async (req, res) => {
  const d = req.body;

  /* ================= VALIDATION ================= */
  if (
    !d.TrainingTitle ||
    !d.TrainingType ||
    !d.TrainerType ||
    !d.Mode ||
    !d.StartDateTime ||
    !d.EndDateTime
  ) {
    throw new AppError("Missing required training fields.", 400);
  }

  if (d.TrainerType === "INTERNAL" && !d.TrainerEmployeeId) {
    throw new AppError("Internal trainer employee required.", 400);
  }

  if (d.TrainerType === "EXTERNAL" && !d.ExternalTrainerName) {
    throw new AppError("External trainer name required.", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    /* ================= DATE + STATUS ================= */
    const start = new Date(d.StartDateTime);
    const end = new Date(d.EndDateTime);
    const now = new Date();

    if (end <= start) {
      throw new AppError(
        "EndDateTime must be greater than StartDateTime.",
        400
      );
    }

    let status = "UPCOMING";
    if (now >= start && now <= end) status = "ONGOING";
    else if (now > end) status = "COMPLETED";

    /* ================= INSERT TRAINING ================= */
    const result = await pool
      .request()
      .input("TrainingTitle", d.TrainingTitle)
      .input("TrainingType", d.TrainingType)
      .input("TrainerType", d.TrainerType)
      .input("TrainerEmployeeId", d.TrainerEmployeeId || null)
      .input("ExternalTrainerName", d.ExternalTrainerName || null)
      .input("Mode", d.Mode)
      .input("LocationDetails", d.LocationDetails || null)
      .input("StartDateTime", start)
      .input("EndDateTime", end)
      .input("Mandatory", d.Mandatory ? 1 : 0)
      .input("Status", status).query(`
        INSERT INTO Trainings (
          TrainingTitle,
          TrainingType,
          TrainerType,
          TrainerEmployeeId,
          ExternalTrainerName,
          Mode,
          LocationDetails,
          StartDateTime,
          EndDateTime,
          Mandatory,
          Status
        )
        OUTPUT INSERTED.ID
        VALUES (
          @TrainingTitle,
          @TrainingType,
          @TrainerType,
          @TrainerEmployeeId,
          @ExternalTrainerName,
          @Mode,
          @LocationDetails,
          @StartDateTime,
          @EndDateTime,
          @Mandatory,
          @Status
        )
      `);

    const trainingId = result.recordset[0].ID;

    /* ================= API RESPONSE ================= */
    res.status(201).json({
      success: true,
      message: "Training created successfully",
      trainingId,
    });

    /* ================= SEND MAIL TO TRAINER ================= */
    try {
      // 🔹 INTERNAL TRAINER
      if (d.TrainerType === "INTERNAL" && d.TrainerEmployeeId) {
        const trainerRes = await pool
          .request()
          .input("empId", d.TrainerEmployeeId).query(`
            SELECT name, employee_email, manager_email
            FROM users
            WHERE employee_id = @empId
          `);

        if (trainerRes.recordset.length) {
          const trainer = trainerRes.recordset[0];

          await sendTrainingAssignedEmail({
            to: trainer.employee_email,
            trainerName: trainer.name,
            trainingTitle: d.TrainingTitle,
            trainingType: d.TrainingType,
            mode: d.Mode,
            startDateTime: start,
            endDateTime: end,
            location: d.LocationDetails || "Online",
          });
        }
      }

      // 🔹 EXTERNAL TRAINER (future ready – optional)
      /*
      if (d.TrainerType === "EXTERNAL" && d.ExternalTrainerEmail) {
        await sendTrainingAssignedEmail({
          to: d.ExternalTrainerEmail,
          trainerName: d.ExternalTrainerName,
          trainingTitle: d.TrainingTitle,
          trainingType: d.TrainingType,
          mode: d.Mode,
          startDateTime: start,
          endDateTime: end,
          location: d.LocationDetails || "Online",
        });
      }
      */
    } catch (mailErr) {
      console.error("Trainer email failed:", mailErr.message);
    }
  } finally {
    await pool.close();
  }
});

/* ====================================================== GET ALL TRAININGS GET /training ================================================== */
export const getAllTrainings = tryCatch(async (req, res) => {
  const pool = await sql.connect(dbConfig3);

  try {
    const data = await pool.request().query(`
      SELECT
        T.ID,
        T.TrainingTitle,
        T.TrainingType,
        T.Mode,
        T.LocationDetails,
        T.StartDateTime,
        T.EndDateTime,
        T.Mandatory,
        T.Status,
        T.CreatedAt,

        /* 🔑 Trainer Name Resolution */
        CASE
          WHEN T.TrainerType = 'INTERNAL' THEN U.name
          ELSE T.ExternalTrainerName
        END AS TrainerName,

        /* Optional: keep raw info if needed later */
        T.TrainerType,
        T.TrainerEmployeeId,
        T.ExternalTrainerName

      FROM Trainings T
      LEFT JOIN users U
        ON U.employee_id = T.TrainerEmployeeId
        AND T.TrainerType = 'INTERNAL'

      ORDER BY T.StartDateTime DESC
    `);

    res.status(200).json({
      success: true,
      message: "Trainings fetched successfully",
      data: data.recordset,
    });
  } catch (error) {
    throw new AppError(`Failed to fetch trainings data: ${error.message}`, 500);
  } finally {
    await pool.close();
  }
});

/* ====================================================== GET TRAINING BY ID GET /training/:id ===================================================== */
export const getTrainingById = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  if (!trainingId) {
    throw new AppError("Invalid training ID.", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    const result = await pool.request().input("ID", sql.Int, trainingId).query(`
        SELECT
          T.*,
          U.name AS TrainerName
        FROM Trainings T
        LEFT JOIN users U
          ON U.id = T.TrainerEmployeeId
        WHERE T.ID = @ID
      `);

    if (!result.recordset.length) {
      throw new AppError("Training not found.", 404);
    }

    res.status(200).json({
      success: true,
      data: result.recordset[0],
    });
  } catch (error) {
    throw new AppError(`Failed to fetch training: ${error.message}`, 500);
  } finally {
    await pool.close();
  }
});

/* ============================== UPDATE TRAINING PUT /training/:id ====================================================== */
export const updateTraining = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);
  const d = req.body;

  if (!trainingId) {
    throw new AppError("Invalid training ID.", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    /* ================= FETCH EXISTING ================= */
    const existing = await pool
      .request()
      .input("ID", trainingId)
      .query(`SELECT * FROM Trainings WHERE ID=@ID`);

    if (!existing.recordset.length) {
      throw new AppError("Training not found.", 404);
    }

    const prev = existing.recordset[0];

    /* ================= VALIDATION ================= */
    if (d.TrainerType === "INTERNAL" && !d.TrainerEmployeeId) {
      throw new AppError("Internal trainer employee required.", 400);
    }

    if (d.TrainerType === "EXTERNAL" && !d.ExternalTrainerName) {
      throw new AppError("External trainer name required.", 400);
    }

    /* ================= DATE + STATUS ================= */
    const start = d.StartDateTime
      ? new Date(d.StartDateTime)
      : new Date(prev.StartDateTime);

    const end = d.EndDateTime
      ? new Date(d.EndDateTime)
      : new Date(prev.EndDateTime);

    if (end <= start) {
      throw new AppError(
        "EndDateTime must be greater than StartDateTime.",
        400
      );
    }

    const now = new Date();
    let status = "UPCOMING";
    if (now >= start && now <= end) status = "ONGOING";
    else if (now > end) status = "COMPLETED";

    /* ================= UPDATE ================= */
    await pool
      .request()
      .input("ID", trainingId)
      .input("TrainingTitle", d.TrainingTitle ?? prev.TrainingTitle)
      .input("TrainingType", d.TrainingType ?? prev.TrainingType)
      .input("TrainerType", d.TrainerType ?? prev.TrainerType)
      .input(
        "TrainerEmployeeId",
        d.TrainerType === "INTERNAL" ? d.TrainerEmployeeId : null
      )
      .input(
        "ExternalTrainerName",
        d.TrainerType === "EXTERNAL" ? d.ExternalTrainerName : null
      )
      .input("Mode", d.Mode ?? prev.Mode)
      .input("LocationDetails", d.LocationDetails ?? prev.LocationDetails)
      .input("StartDateTime", start)
      .input("EndDateTime", end)
      .input(
        "Mandatory",
        typeof d.Mandatory === "boolean"
          ? d.Mandatory
            ? 1
            : 0
          : prev.Mandatory
      )
      .input("Status", status).query(`
        UPDATE Trainings SET
          TrainingTitle=@TrainingTitle,
          TrainingType=@TrainingType,
          TrainerType=@TrainerType,
          TrainerEmployeeId=@TrainerEmployeeId,
          ExternalTrainerName=@ExternalTrainerName,
          Mode=@Mode,
          LocationDetails=@LocationDetails,
          StartDateTime=@StartDateTime,
          EndDateTime=@EndDateTime,
          Mandatory=@Mandatory,
          Status=@Status
        WHERE ID=@ID
      `);

    res.status(200).json({
      success: true,
      message: "Training updated successfully",
    });
  } catch (error) {
    throw new AppError(`Failed to update training: ${error.message}`, 500);
  } finally {
    await pool.close();
  }
});

/* ========================== fetch employee for nomination ====================================================== */
export const getNominationsByTraining = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  const pool = await sql.connect(dbConfig3);

  try {
    const result = await pool.request().input("TrainingId", trainingId).query(`
      SELECT
        EmployeeId,
        EmployeeName,
        Department,
        IsManual
      FROM TrainingNominations
      WHERE TrainingId=@TrainingId
    `);

    res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } finally {
    await pool.close();
  }
});

/* ===================== GET INTERNAL TRAINERS ===================== */
export const getInternalTrainers = tryCatch(async (req, res) => {
  const pool = await sql.connect(dbConfig3);

  try {
    const data = await pool.request().query(`
      SELECT
        employee_id,
        name,
        department_id,
        employee_email
      FROM users
      ORDER BY name ASC
    `);

    res.status(200).json({
      success: true,
      message: "Internal trainers fetched successfully",
      data: data.recordset,
    });
  } catch (error) {
    throw new AppError(
      `Failed to fetch internal trainers: ${error.message}`,
      500
    );
  } finally {
    await pool.close();
  }
});

export const getEmployeesForNomination = tryCatch(async (req, res) => {
  const { department } = req.query;

  const pool = await sql.connect(dbConfig3);

  try {
    const request = pool.request();

    let query = `
      SELECT
        u.employee_id,
        u.name,
        u.department_id,
        dpt.department_name
      FROM users u
      INNER JOIN departments dpt
        ON dpt.deptCode = u.department_id
    `;

    if (department && department !== "ALL") {
      request.input("department", department);
      query += ` WHERE dpt.department_name = @department`;
    }

    query += ` ORDER BY dpt.department_name, u.name`;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } finally {
    await pool.close();
  }
});

/* ===================== Save Employee for Training ===================== */
export const saveNominations = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);
  const { nominations } = req.body;

  if (!trainingId || !Array.isArray(nominations)) {
    throw new AppError("Invalid nomination data", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    /* ========== DELETE REMOVED ========== */
    await pool
      .request()
      .input("TrainingId", trainingId)
      .input("json", JSON.stringify(nominations)).query(`
        DELETE FROM TrainingNominations
        WHERE TrainingId = @TrainingId
        AND EmployeeId NOT IN (
          SELECT EmployeeId
          FROM OPENJSON(@json)
          WITH (EmployeeId NVARCHAR(50) '$.EmployeeId')
        )
      `);

    /* ========== INSERT NEW ========== */
    for (const n of nominations) {
      await pool
        .request()
        .input("TrainingId", trainingId)
        .input("EmployeeId", n.EmployeeId)
        .input("EmployeeName", n.EmployeeName)
        .input("Department", n.Department)
        .input("IsManual", n.IsManual ? 1 : 0).query(`
          IF NOT EXISTS (
            SELECT 1 FROM TrainingNominations
            WHERE TrainingId=@TrainingId AND EmployeeId=@EmployeeId
          )
          INSERT INTO TrainingNominations
          (TrainingId, EmployeeId, EmployeeName, Department, IsManual, NominatedAt)
          VALUES
          (@TrainingId, @EmployeeId, @EmployeeName, @Department, @IsManual, GETDATE())
        `);
    }

    /* ========== TRAINING DETAILS ========== */
    const trainingRes = await pool.request().input("TrainingId", trainingId)
      .query(`
        SELECT TrainingTitle, TrainingType, Mode, StartDateTime, EndDateTime, LocationDetails
        FROM Trainings WHERE ID=@TrainingId
      `);

    const training = trainingRes.recordset[0];

    /* ========== FETCH MATERIALS ========== */
    const materialsRes = await pool.request().input("TrainingId", trainingId)
      .query(`
        SELECT FileName, FilePath, MaterialType
        FROM TrainingMaterials
        WHERE TrainingId=@TrainingId
      `);

    const attachments = materialsRes.recordset
      .filter(
        (m) =>
          m.MaterialType !== "IMAGE" &&
          m.FilePath &&
          fs.existsSync(path.join(process.cwd(), m.FilePath))
      )
      .map((m) => ({
        filename: m.FileName,
        path: path.join(process.cwd(), m.FilePath),
      }));

    /* ========== EMPLOYEE EMAILS ========== */
    const empRes = await pool
      .request()
      .input("json", JSON.stringify(nominations)).query(`
        SELECT e.EmployeeId, e.EmployeeName, e.Email, e.Department
        FROM Employees e
        JOIN OPENJSON(@json)
        WITH (EmployeeId NVARCHAR(50) '$.EmployeeId') j
        ON e.EmployeeId = j.EmployeeId
      `);

    for (const emp of empRes.recordset) {
      await sendTrainingNominationEmail({
        to: emp.Email,
        employeeName: emp.EmployeeName,
        trainingTitle: training.TrainingTitle,
        trainingType: training.TrainingType,
        mode: training.Mode,
        startDateTime: training.StartDateTime,
        endDateTime: training.EndDateTime,
        location: training.LocationDetails,
        attachments,
      });
    }

    /* ========== GROUP BY DEPT (HOD) ========== */
    // const deptMap = {};
    // empRes.recordset.forEach((e) => {
    //   if (!deptMap[e.Department]) deptMap[e.Department] = [];
    //   deptMap[e.Department].push(e);
    // });

    // for (const dept of Object.keys(deptMap)) {
    //   const hodRes = await pool.request().input("Department", dept).query(`
    //       SELECT u.name AS HODName, u.employee_email AS HODEmail
    //       FROM departments d
    //       JOIN users u ON d.department_head_id = u.employee_id
    //       WHERE d.deptCode=@Department
    //     `);

    //   if (hodRes.recordset.length) {
    //     await sendTrainingNominationHODEmail({
    //       to: hodRes.recordset[0].HODEmail,
    //       hodName: hodRes.recordset[0].HODName,
    //       departmentName: dept,
    //       trainingTitle: training.TrainingTitle,
    //       startDateTime: training.StartDateTime,
    //       endDateTime: training.EndDateTime,
    //       employees: deptMap[dept],
    //     });
    //   }
    // }

    res.json({
      success: true,
      message: "Nominations saved and emails sent with materials",
    });
  } finally {
    await pool.close();
  }
});

export const uploadMaterial = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);
  const { Category, MaterialType, ExternalLink } = req.body;

  if (!trainingId) {
    throw new AppError("Training ID missing", 400);
  }

  const filePath = req.file ? `/uploads/training/${req.file.filename}` : null;

  const pool = await sql.connect(dbConfig3);

  try {
    await pool
      .request()
      .input("TrainingId", trainingId)
      .input("MaterialType", MaterialType)
      .input("Category", Category)
      .input("FileName", req.file?.originalname || null)
      .input("FilePath", filePath)
      .input("ExternalLink", ExternalLink || null).query(`
        INSERT INTO TrainingMaterials (
          TrainingId,
          MaterialType,
          Category,
          FileName,
          FilePath,
          ExternalLink
        )
        VALUES (
          @TrainingId,
          @MaterialType,
          @Category,
          @FileName,
          @FilePath,
          @ExternalLink
        )
      `);

    res.status(201).json({ success: true });
  } finally {
    await pool.close();
  }
});

export const getTrainingMaterials = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  const pool = await sql.connect(dbConfig3);

  try {
    const result = await pool.request().input("TrainingId", trainingId).query(`
        SELECT * FROM TrainingMaterials
        WHERE TrainingId=@TrainingId
        ORDER BY UploadedAt DESC
      `);

    res.json({ success: true, data: result.recordset });
  } finally {
    await pool.close();
  }
});

export const deleteMaterial = tryCatch(async (req, res) => {
  const id = parseInt(req.params.id);

  const pool = await sql.connect(dbConfig3);

  try {
    await pool
      .request()
      .input("ID", id)
      .query("DELETE FROM TrainingMaterials WHERE ID=@ID");

    res.json({ success: true });
  } finally {
    await pool.close();
  }
});

export const uploadTrainingImages = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  if (!trainingId || !req.files?.length) {
    throw new AppError("Invalid image upload", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    for (const f of req.files) {
      await pool
        .request()
        .input("TrainingId", trainingId)
        .input("MaterialType", "IMAGE")
        .input("Category", "IMAGE")
        .input("FileName", f.originalname)
        .input("FilePath", `/uploads/training/images/${f.filename}`).query(`
          INSERT INTO TrainingMaterials (
            TrainingId,
            MaterialType,
            Category,
            FileName,
            FilePath
          )
          VALUES (
            @TrainingId,
            @MaterialType,
            @Category,
            @FileName,
            @FilePath
          )
        `);
    }

    res.status(201).json({ success: true });
  } finally {
    await pool.close();
  }
});

export const uploadTrainingReport = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  if (!trainingId || !req.file) {
    throw new AppError("Report file required", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    /* Remove old report (only ONE allowed) */
    await pool.request().input("TrainingId", trainingId).query(`
        DELETE FROM TrainingMaterials
        WHERE TrainingId=@TrainingId AND MaterialType='REPORT'
      `);

    await pool
      .request()
      .input("TrainingId", trainingId)
      .input("MaterialType", "REPORT")
      .input("Category", "REPORT")
      .input("FileName", req.file.originalname)
      .input("FilePath", `/uploads/training/report/${req.file.filename}`)
      .query(`
        INSERT INTO TrainingMaterials (
          TrainingId,
          MaterialType,
          Category,
          FileName,
          FilePath
        )
        VALUES (
          @TrainingId,
          @MaterialType,
          @Category,
          @FileName,
          @FilePath
        )
      `);

    res.status(201).json({ success: true });
  } finally {
    await pool.close();
  }
});

export const saveTrainingAttendance = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);
  const { attendance } = req.body;

  if (!trainingId || !Array.isArray(attendance)) {
    throw new AppError("Invalid attendance data", 400);
  }

  const pool = await sql.connect(dbConfig3);

  try {
    /* ===============================
       CLEAR OLD ATTENDANCE
       =============================== */
    await pool.request().input("TrainingId", trainingId).query(`
        DELETE FROM TrainingAttendance 
        WHERE TrainingId = @TrainingId
      `);

    /* ===============================
       INSERT NEW ATTENDANCE
       =============================== */
    for (const a of attendance) {
      await pool
        .request()
        .input("TrainingId", trainingId)
        .input("EmployeeId", a.EmployeeId)
        .input("EmployeeName", a.EmployeeName)
        .input("Department", a.Department)
        .input("Status", a.Status)
        .input("IsManual", a.IsManual ? 1 : 0).query(`
          INSERT INTO TrainingAttendance
          (TrainingId, EmployeeId, EmployeeName, Department, Status, IsManual)
          VALUES
          (@TrainingId, @EmployeeId, @EmployeeName, @Department, @Status, @IsManual)
        `);
    }

    /* ===============================
       ✅ AUTO CLOSE TRAINING
       =============================== */
    await pool.request().input("TrainingId", trainingId).query(`
        UPDATE Trainings
        SET Status = 'COMPLETED'
        WHERE ID = @TrainingId
      `);

    res.json({
      success: true,
      message: "Attendance saved and training completed",
    });
  } finally {
    await pool.close();
  }
});

export const getTrainingAttendance = tryCatch(async (req, res) => {
  const trainingId = parseInt(req.params.id);

  if (!trainingId) {
    throw new AppError("Training ID missing", 400);
  }

  const pool = await sql.connect(dbConfig3);

  const result = await pool.request().input("TrainingId", trainingId).query(`
      SELECT EmployeeId, EmployeeName, Department, Status, IsManual
      FROM TrainingAttendance
      WHERE TrainingId = @TrainingId
    `);

  res.json({
    success: true,
    data: result.recordset,
  });

  await pool.close();
});
