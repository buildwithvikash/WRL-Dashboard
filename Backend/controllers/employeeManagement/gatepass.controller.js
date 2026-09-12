import sql from "mssql";
import { dbConfig3, dbConfig4 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";

const getPool = async () => {
  if (global.pool3) return global.pool3;
  return await new sql.ConnectionPool(dbConfig3).connect();
};

// Employee directory (badge/HR system) lives on a separate DB (pool4/CLMS) —
// same one Attendance reads from.
const getEmployeePool = async () => {
  if (global.pool4) return global.pool4;
  return await new sql.ConnectionPool(dbConfig4).connect();
};

const TYPES = ["Official", "Personal"];
const COMING_BACK_VALUES = ["Yes", "No"];
const STAGES = { depthead: { fromStatus: "Pending Dept Head", nameCol: "DeptHeadName", atCol: "DeptHeadAt", nextStatus: "Pending HR" },
                 hr:       { fromStatus: "Pending HR",         nameCol: "HRName",       atCol: "HRAt",       nextStatus: "Approved" } };
const DIRECTIONS = { out: { fromStatus: "Approved", nameCol: "SecurityOutName", atCol: "GateOutAt", nextStatus: "Out" },
                      in:  { fromStatus: "Out",       nameCol: "SecurityInName",  atCol: "GateInAt",  nextStatus: "Completed" } };

// "YYYY-MM-DD HH:mm:ss" (as sent by the DateTimePicker) is a plain wall-clock
// value with no timezone of its own — it should round-trip through the DB
// byte-for-byte. Parsed via `new Date(...)` it would pick up the server
// process's local timezone (mssql's default useUTC:true then re-shifts it
// again on write), silently corrupting the time. Building the Date from the
// literal digits with Date.UTC keeps its UTC getters equal to those digits,
// which is exactly what the mssql driver writes to the DATETIME column.
const toDate = (str) => {
  const m = str?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
};

// Same camelCase shape the frontend hook (Usegatepasses.js) reads everywhere.
// `prefix` lets the same column list serve a plain SELECT and an INSERT's
// OUTPUT clause (which needs every column qualified as INSERTED.<Col>).
const listColumns = (prefix = "") => `
  ${prefix}Id AS id,
  ${prefix}EmpCode AS empCode,
  ${prefix}EmpName AS empName,
  ${prefix}DeptName AS deptName,
  ${prefix}ContactNo AS contactNo,
  ${prefix}PlaceOfVisit AS placeOfVisit,
  ${prefix}Reason AS reason,
  ${prefix}Type AS type,
  ${prefix}ComingBack AS comingBack,
  CONVERT(VARCHAR, ${prefix}OutDateTime, 120) AS outDateTime,
  CONVERT(VARCHAR, ${prefix}ExpectedInDateTime, 120) AS expectedInDateTime,
  ${prefix}Status AS status,
  ${prefix}CreatedAt AS createdAt
`;
const LIST_COLUMNS = listColumns();

// GET /gatepass/search-employee?q=WRLZ
// Prefix search on the employee directory (badge system) — lets the request
// form auto-fill name/contact once the employee is picked by code, instead
// of typing them in by hand.
export const searchEmployee = tryCatch(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) {
    return res.json({ success: true, data: [] });
  }

  const pool = await getEmployeePool();
  const result = await pool.request()
    .input("q", sql.NVarChar(50), `${q}%`)
    .query(`
      SELECT TOP 10
        Name AS empName,
        IDCardNo AS empCode,
        Phone1 AS contactNo
      FROM Name
      WHERE IDCardNo LIKE @q
      ORDER BY IDCardNo
    `);

  res.json({ success: true, data: result.recordset });
});

// GET /gatepass/list
export const listGatePasses = tryCatch(async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT ${LIST_COLUMNS}
    FROM GatePasses
    ORDER BY CreatedAt DESC
  `);
  res.json({ success: true, data: result.recordset });
});

// POST /gatepass/create
export const createGatePass = tryCatch(async (req, res) => {
  const {
    empCode, empName, deptName, contactNo, placeOfVisit, reason,
    type, comingBack, outDateTime, expectedInDateTime,
  } = req.body;

  if (!empCode?.trim() || !empName?.trim() || !deptName?.trim() || !placeOfVisit?.trim() || !reason?.trim()) {
    throw new AppError("empCode, empName, deptName, placeOfVisit and reason are required", 400);
  }
  const outDate = toDate(outDateTime);
  if (!outDate) throw new AppError("A valid outDateTime is required", 400);
  const expectedInDate = toDate(expectedInDateTime);

  const passType = TYPES.includes(type) ? type : "Official";
  const comingBackValue = COMING_BACK_VALUES.includes(comingBack) ? comingBack : "Yes";

  const pool = await getPool();
  const result = await pool.request()
    .input("empCode", sql.NVarChar(50), empCode.trim())
    .input("empName", sql.NVarChar(200), empName.trim())
    .input("deptName", sql.NVarChar(200), deptName.trim())
    .input("contactNo", sql.NVarChar(50), contactNo?.trim() || null)
    .input("placeOfVisit", sql.NVarChar(200), placeOfVisit.trim())
    .input("reason", sql.NVarChar(sql.MAX), reason.trim())
    .input("type", sql.NVarChar(20), passType)
    .input("comingBack", sql.NVarChar(5), comingBackValue)
    .input("outDateTime", sql.DateTime, outDate)
    .input("expectedInDateTime", sql.DateTime, expectedInDate)
    .query(`
      INSERT INTO GatePasses
        (EmpCode, EmpName, DeptName, ContactNo, PlaceOfVisit, Reason, Type, ComingBack, OutDateTime, ExpectedInDateTime)
      OUTPUT ${listColumns("INSERTED.")}
      VALUES
        (@empCode, @empName, @deptName, @contactNo, @placeOfVisit, @reason, @type, @comingBack, @outDateTime, @expectedInDateTime)
    `);

  res.status(201).json({ success: true, data: result.recordset[0] });
});

// PUT /gatepass/:id/:stage  (stage = "depthead" | "hr")
export const decideGatePass = tryCatch(async (req, res) => {
  const { id, stage } = req.params;
  const { name, decision } = req.body;

  const stageConfig = STAGES[stage];
  if (!stageConfig) throw new AppError(`stage must be one of: ${Object.keys(STAGES).join(", ")}`, 400);
  if (!["Approved", "Rejected"].includes(decision)) throw new AppError("decision must be 'Approved' or 'Rejected'", 400);
  if (!name?.trim()) throw new AppError("name is required", 400);

  const newStatus = decision === "Approved" ? stageConfig.nextStatus : "Rejected";

  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, parseInt(id, 10))
    .input("fromStatus", sql.NVarChar(30), stageConfig.fromStatus)
    .input("name", sql.NVarChar(200), name.trim())
    .input("newStatus", sql.NVarChar(30), newStatus)
    .query(`
      UPDATE GatePasses
      SET Status = @newStatus, ${stageConfig.nameCol} = @name, ${stageConfig.atCol} = GETDATE(), UpdatedAt = GETDATE()
      OUTPUT INSERTED.Id
      WHERE Id = @id AND Status = @fromStatus
    `);

  if (!result.recordset.length) {
    throw new AppError("Gate pass not found or is not awaiting this stage", 404);
  }

  res.json({ success: true, message: `${decision} at ${stage} stage.` });
});

// PUT /gatepass/:id/security/:direction  (direction = "out" | "in")
export const gateSecurityAction = tryCatch(async (req, res) => {
  const { id, direction } = req.params;
  const { name } = req.body;

  const directionConfig = DIRECTIONS[direction];
  if (!directionConfig) throw new AppError(`direction must be one of: ${Object.keys(DIRECTIONS).join(", ")}`, 400);
  if (!name?.trim()) throw new AppError("name is required", 400);

  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, parseInt(id, 10))
    .input("fromStatus", sql.NVarChar(30), directionConfig.fromStatus)
    .input("name", sql.NVarChar(200), name.trim())
    .input("newStatus", sql.NVarChar(30), directionConfig.nextStatus)
    .query(`
      UPDATE GatePasses
      SET Status = @newStatus, ${directionConfig.nameCol} = @name, ${directionConfig.atCol} = GETDATE(), UpdatedAt = GETDATE()
      OUTPUT INSERTED.Id
      WHERE Id = @id AND Status = @fromStatus
    `);

  if (!result.recordset.length) {
    throw new AppError(`Gate pass not found or is not ready for gate ${direction}`, 404);
  }

  res.json({ success: true, message: `Gate ${direction} logged.` });
});

// GET /gatepass/export?status=&search=
export const exportGatePasses = tryCatch(async (req, res) => {
  const { status, search } = req.query;

  const pool = await getPool();
  const request = pool.request();
  const conditions = [];

  if (status) {
    request.input("status", sql.NVarChar(30), status);
    conditions.push("Status = @status");
  }
  if (search) {
    request.input("search", sql.NVarChar(200), `%${search}%`);
    conditions.push("(EmpName LIKE @search OR EmpCode LIKE @search OR DeptName LIKE @search)");
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      EmpCode AS 'Employee Code',
      EmpName AS 'Employee Name',
      DeptName AS 'Department',
      ContactNo AS 'Contact No',
      PlaceOfVisit AS 'Place of Visit',
      Reason AS 'Reason',
      Type AS 'Type',
      ComingBack AS 'Coming Back',
      CONVERT(VARCHAR, OutDateTime, 120) AS 'Out Date Time',
      CONVERT(VARCHAR, ExpectedInDateTime, 120) AS 'Expected In',
      Status AS 'Status',
      DeptHeadName AS 'Dept Head',
      CONVERT(VARCHAR, DeptHeadAt, 120) AS 'Dept Head At',
      HRName AS 'HR',
      CONVERT(VARCHAR, HRAt, 120) AS 'HR At',
      SecurityOutName AS 'Gate Out By',
      CONVERT(VARCHAR, GateOutAt, 120) AS 'Gate Out At',
      SecurityInName AS 'Gate In By',
      CONVERT(VARCHAR, GateInAt, 120) AS 'Gate In At',
      CONVERT(VARCHAR, CreatedAt, 120) AS 'Created At'
    FROM GatePasses
    ${where}
    ORDER BY CreatedAt DESC
  `);

  res.json({ success: true, data: result.recordset });
});
