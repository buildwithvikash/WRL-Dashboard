import sql from "mssql";
import jwt from "jsonwebtoken";
import { dbConfig3, dbConfig4 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";
import { sendGatePassApprovalMail } from "../../emailTemplates/GatePass_System/gatePassApproval.template.js";

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

const EMAIL_ACTION_PURPOSE = "gatepass-email-action";
const EMAIL_ACTION_EXPIRY = "5d";
const backendUrl = () => process.env.BACKEND_URL || "http://localhost:3000";

const buildActionToken = (passId, stage, approverName) =>
  jwt.sign({ passId, stage, approverName, purpose: EMAIL_ACTION_PURPOSE }, process.env.JWT_SECRET, { expiresIn: EMAIL_ACTION_EXPIRY });

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
  ${prefix}CreatedAt AS createdAt,
  ${prefix}DeptHeadName AS deptHeadName,
  CONVERT(VARCHAR, ${prefix}DeptHeadAt, 120) AS deptHeadAt,
  ${prefix}HRName AS hrName,
  CONVERT(VARCHAR, ${prefix}HRAt, 120) AS hrAt,
  ${prefix}SecurityOutName AS securityOutName,
  CONVERT(VARCHAR, ${prefix}GateOutAt, 120) AS gateOutAt,
  ${prefix}SecurityInName AS securityInName,
  CONVERT(VARCHAR, ${prefix}GateInAt, 120) AS gateInAt
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

// GET /gatepass/employee-details?empCode=WRLZ0242
// Full detail lookup for one employee, once picked from the search-employee
// dropdown — pulls in their current Business Unit (department) and Division
// via their latest BadgeDetail record, which the lightweight prefix search
// above doesn't have (Name alone has no department info).
export const getEmployeeDetails = tryCatch(async (req, res) => {
  const empCode = (req.query.empCode || "").trim();
  if (!empCode) throw new AppError("empCode is required", 400);

  const pool = await getEmployeePool();
  const result = await pool.request()
    .input("empCode", sql.NVarChar(50), empCode)
    .query(`
      SELECT TOP 1
          n.Name AS employeeName,
          n.IDCardNo AS empCode,
          n.Phone1 AS employeePhone,

          bu.Code AS businessUnitCode,
          bu.Name AS businessUnitName,
          bu.BusinessUnitHead AS businessUnitHead,
          bu.Phone AS businessUnitHeadPhone,
          bu.Email AS businessUnitEmail,
          bu.ManagerEmail AS businessUnitManagerEmail,
          bu.OtherEmail AS businessUnitOtherEmail,

          d.Code AS divisionCode,
          d.Name AS divisionName,
          d.ManagerEmail AS divisionManagerEmail,
          d.OtherEmail AS divisionOtherEmail

      FROM name AS n
      INNER JOIN BadgeDetail AS bd ON bd.NameCode = n.Code
      LEFT JOIN BusinessUnit AS bu ON bu.Code = bd.BusinessUnit
      LEFT JOIN Division AS d ON d.Code = bd.Division
      WHERE n.IDCardNo = @empCode
      ORDER BY bd.ValidFromDate DESC
    `);

  if (!result.recordset.length) {
    return res.status(404).json({ success: false, message: "Employee not found." });
  }

  res.json({ success: true, data: result.recordset[0] });
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

  const created = result.recordset[0];
  notifyNextApprover(created); // fire-and-forget — Dept Head email

  res.status(201).json({ success: true, data: created });
});

// Shared by the authenticated PUT route below and the public email-action
// route — applies a Dept Head/HR decision and returns the updated pass (full
// camelCase shape), or null if the pass wasn't actually waiting at that
// stage (already actioned, wrong stage, or doesn't exist). Never throws for
// that case — callers decide how to report it (404 vs. a friendly "already
// handled" page).
const applyDecision = async (id, stage, decision, name) => {
  const stageConfig = STAGES[stage];
  const newStatus = decision === "Approved" ? stageConfig.nextStatus : "Rejected";

  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("fromStatus", sql.NVarChar(30), stageConfig.fromStatus)
    .input("name", sql.NVarChar(200), name)
    .input("newStatus", sql.NVarChar(30), newStatus)
    .query(`
      UPDATE GatePasses
      SET Status = @newStatus, ${stageConfig.nameCol} = @name, ${stageConfig.atCol} = GETDATE(), UpdatedAt = GETDATE()
      OUTPUT ${listColumns("INSERTED.")}
      WHERE Id = @id AND Status = @fromStatus
    `);

  return result.recordset[0] || null;
};

// While GATEPASS_TRIAL_EMAIL is set, EVERY approval email (Dept Head or HR,
// for any department) is redirected there instead of the real contact — and
// CC is dropped entirely, so no real person is ever included by accident
// during a trial run. Remove the env var to go back to real recipients;
// GatePassDeptConfig/GatePassHRConfig data itself is never touched by this.
const sendApprovalEmail = (opts) => {
  const trialEmail = process.env.GATEPASS_TRIAL_EMAIL;
  if (!trialEmail) return sendGatePassApprovalMail(opts);
  return sendGatePassApprovalMail({ ...opts, to: trialEmail, cc: undefined, trialRecipient: opts.to });
};

// Looks up the configured contact for the stage a pass just MOVED INTO and,
// if one exists, emails them an approve/reject link. Silently does nothing
// if that stage has no configured email — the in-app queues keep working
// either way, this is purely an added convenience.
const notifyNextApprover = async (pass) => {
  try {
    const pool = await getPool();

    if (pass.status === "Pending Dept Head") {
      const cfgRes = await pool.request()
        .input("deptName", sql.NVarChar(200), pass.deptName)
        .query(`SELECT TOP 1 * FROM GatePassDeptConfig WHERE (DeptName = @deptName OR BusinessUnitName = @deptName) AND IsActive = 1`);
      const cfg = cfgRes.recordset[0];
      if (!cfg?.DeptHeadEmail) return;

      const approverName = cfg.DeptHeadName || "Dept Head";
      const token = buildActionToken(pass.id, "depthead", approverName);
      await sendApprovalEmail({
        to: cfg.DeptHeadEmail,
        cc: [cfg.DeptManagerEmail, cfg.DeptSubManagerEmail].filter(Boolean),
        approverName,
        stageLabel: "Department Head",
        pass,
        approveUrl: `${backendUrl()}/api/v1/gatepass/email-action/${token}/approve`,
        rejectUrl: `${backendUrl()}/api/v1/gatepass/email-action/${token}/reject`,
      });
    } else if (pass.status === "Pending HR") {
      const cfgRes = await pool.request().query(`SELECT TOP 1 * FROM GatePassHRConfig ORDER BY Id`);
      const cfg = cfgRes.recordset[0];
      if (!cfg?.HREmail) return;

      const approverName = cfg.HRName || "HR";
      const token = buildActionToken(pass.id, "hr", approverName);
      await sendApprovalEmail({
        to: cfg.HREmail,
        approverName,
        stageLabel: "HR",
        pass,
        approveUrl: `${backendUrl()}/api/v1/gatepass/email-action/${token}/approve`,
        rejectUrl: `${backendUrl()}/api/v1/gatepass/email-action/${token}/reject`,
      });
    }
  } catch (err) {
    console.error("[GatePass] Failed to send approver notification email:", err.message);
  }
};

// PUT /gatepass/:id/:stage  (stage = "depthead" | "hr")
export const decideGatePass = tryCatch(async (req, res) => {
  const { id, stage } = req.params;
  const { name, decision } = req.body;

  if (!STAGES[stage]) throw new AppError(`stage must be one of: ${Object.keys(STAGES).join(", ")}`, 400);
  if (!["Approved", "Rejected"].includes(decision)) throw new AppError("decision must be 'Approved' or 'Rejected'", 400);
  if (!name?.trim()) throw new AppError("name is required", 400);

  const updated = await applyDecision(parseInt(id, 10), stage, decision, name.trim());
  if (!updated) throw new AppError("Gate pass not found or is not awaiting this stage", 404);

  // Fire-and-forget — a slow/broken mail server should never delay or fail
  // the actual approval, which already succeeded above.
  if (decision === "Approved") notifyNextApprover(updated);

  res.json({ success: true, message: `${decision} at ${stage} stage.` });
});

// GET /gatepass/email-action/:token/:action  (action = "approve" | "reject")
// Public — deliberately not behind `authenticate`, since it's opened
// straight from an email client with no logged-in session. Safety comes
// from the token itself: JWT-signed, short-lived (5 days), and scoped to
// exactly one pass + stage via its `purpose` claim, unlike the old deleted
// Manpower module's bare requestCode+role in the URL.
export const emailAction = tryCatch(async (req, res) => {
  const { token, action } = req.params;

  const resultPage = ({ ok, title, message }) => res.send(`
    <html>
    <body style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
      <div style="background:#fff;padding:40px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;max-width:440px;">
        <h2 style="color:${ok ? "#16a34a" : "#dc2626"};margin-top:0;">${title}</h2>
        <p style="color:#475569;font-size:14px;">${message}</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:20px;">You may now close this window.</p>
      </div>
    </body>
    </html>
  `);

  if (!["approve", "reject"].includes(action)) {
    return resultPage({ ok: false, title: "Invalid Link", message: "This action link is not valid." });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return resultPage({ ok: false, title: "Link Expired", message: "This approval link is invalid or has expired. Please use the Gate Pass app instead." });
  }
  if (payload.purpose !== EMAIL_ACTION_PURPOSE || !STAGES[payload.stage]) {
    return resultPage({ ok: false, title: "Invalid Link", message: "This action link is not valid." });
  }

  const decision = action === "approve" ? "Approved" : "Rejected";
  const name = `${payload.approverName || "Approver"} (via email)`;
  const updated = await applyDecision(payload.passId, payload.stage, decision, name);

  if (!updated) {
    return resultPage({
      ok: true,
      title: "Already Processed",
      message: "This request has already been actioned — no further action is needed.",
    });
  }

  if (decision === "Approved") notifyNextApprover(updated);

  return resultPage({
    ok: true,
    title: decision === "Approved" ? "Approved" : "Rejected",
    message: `${updated.empName}'s gate pass request has been ${decision.toLowerCase()}.`,
  });
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

/* ═══════════════════════════════════════════════════════════════════════
   DEPARTMENT APPROVAL CONFIG — who gets the Dept Head email per department,
   sourced from (and refreshable against) the external CLMS directory, but
   editable/overridable locally.
═══════════════════════════════════════════════════════════════════════ */

// `prefix` lets the same column list serve a plain SELECT and an INSERT/
// UPDATE's OUTPUT clause (which needs every column qualified as INSERTED.<Col>).
const deptConfigColumns = (prefix = "") => `
  ${prefix}Id AS id, ${prefix}DeptCode AS deptCode, ${prefix}DeptName AS deptName, ${prefix}BusinessUnitName AS businessUnitName, ${prefix}Location AS location,
  ${prefix}DeptHeadName AS deptHeadName, ${prefix}DeptHeadEmail AS deptHeadEmail, ${prefix}DeptHeadMobNo AS deptHeadMobNo,
  ${prefix}DeptManagerEmail AS deptManagerEmail, ${prefix}DeptSubManagerEmail AS deptSubManagerEmail,
  ${prefix}DivisionManagerEmail AS divisionManagerEmail, ${prefix}DivisionOtherEmail AS divisionOtherEmail,
  ${prefix}IsActive AS isActive, ${prefix}UpdatedAt AS updatedAt
`;
const DEPT_CONFIG_COLUMNS = deptConfigColumns();

// GET /gatepass/dept-config
export const listDeptConfig = tryCatch(async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT ${DEPT_CONFIG_COLUMNS} FROM GatePassDeptConfig ORDER BY DeptName
  `);
  res.json({ success: true, data: result.recordset });
});

const bindDeptConfigInputs = (request, body) => request
  .input("deptCode", sql.NVarChar(50), body.deptCode?.trim() || null)
  .input("deptName", sql.NVarChar(200), body.deptName?.trim())
  .input("businessUnitName", sql.NVarChar(200), body.businessUnitName?.trim() || null)
  .input("location", sql.NVarChar(200), body.location?.trim() || null)
  .input("deptHeadName", sql.NVarChar(200), body.deptHeadName?.trim() || null)
  .input("deptHeadEmail", sql.NVarChar(200), body.deptHeadEmail?.trim() || null)
  .input("deptHeadMobNo", sql.NVarChar(50), body.deptHeadMobNo?.trim() || null)
  .input("deptManagerEmail", sql.NVarChar(200), body.deptManagerEmail?.trim() || null)
  .input("deptSubManagerEmail", sql.NVarChar(200), body.deptSubManagerEmail?.trim() || null)
  .input("divisionManagerEmail", sql.NVarChar(200), body.divisionManagerEmail?.trim() || null)
  .input("divisionOtherEmail", sql.NVarChar(200), body.divisionOtherEmail?.trim() || null)
  .input("isActive", sql.Bit, body.isActive === false ? 0 : 1);

// POST /gatepass/dept-config
export const createDeptConfig = tryCatch(async (req, res) => {
  if (!req.body.deptName?.trim()) throw new AppError("deptName is required", 400);

  const pool = await getPool();
  try {
    const result = await bindDeptConfigInputs(pool.request(), req.body).query(`
      INSERT INTO GatePassDeptConfig
        (DeptCode, DeptName, BusinessUnitName, Location, DeptHeadName, DeptHeadEmail, DeptHeadMobNo,
         DeptManagerEmail, DeptSubManagerEmail, DivisionManagerEmail, DivisionOtherEmail, IsActive)
      OUTPUT ${deptConfigColumns("INSERTED.")}
      VALUES
        (@deptCode, @deptName, @businessUnitName, @location, @deptHeadName, @deptHeadEmail, @deptHeadMobNo,
         @deptManagerEmail, @deptSubManagerEmail, @divisionManagerEmail, @divisionOtherEmail, @isActive)
    `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      throw new AppError("A config for this department already exists.", 409);
    }
    throw error;
  }
});

// PUT /gatepass/dept-config/:id
export const updateDeptConfig = tryCatch(async (req, res) => {
  const { id } = req.params;
  if (!req.body.deptName?.trim()) throw new AppError("deptName is required", 400);

  const pool = await getPool();
  const result = await bindDeptConfigInputs(pool.request(), req.body)
    .input("id", sql.Int, parseInt(id, 10))
    .query(`
      UPDATE GatePassDeptConfig SET
        DeptCode = @deptCode, DeptName = @deptName, BusinessUnitName = @businessUnitName, Location = @location,
        DeptHeadName = @deptHeadName, DeptHeadEmail = @deptHeadEmail, DeptHeadMobNo = @deptHeadMobNo,
        DeptManagerEmail = @deptManagerEmail, DeptSubManagerEmail = @deptSubManagerEmail,
        DivisionManagerEmail = @divisionManagerEmail, DivisionOtherEmail = @divisionOtherEmail,
        IsActive = @isActive, UpdatedAt = GETDATE()
      OUTPUT ${deptConfigColumns("INSERTED.")}
      WHERE Id = @id
    `);

  if (!result.recordset.length) throw new AppError("Config not found.", 404);
  res.json({ success: true, data: result.recordset[0] });
});

// DELETE /gatepass/dept-config/:id
export const deleteDeptConfig = tryCatch(async (req, res) => {
  const { id } = req.params;
  const pool = await getPool();
  const result = await pool.request().input("id", sql.Int, parseInt(id, 10))
    .query(`DELETE FROM GatePassDeptConfig WHERE Id = @id`);

  if (!result.rowsAffected[0]) throw new AppError("Config not found.", 404);
  res.json({ success: true, message: "Deleted." });
});

// GET /gatepass/dept-directory
// Live read from the external CLMS directory (BusinessUnit/Division) — the
// source the config page's "Sync from Directory" picker offers, never
// written to.
export const getDeptDirectory = tryCatch(async (_req, res) => {
  const pool = await getEmployeePool();
  const result = await pool.request().query(`
    SELECT

        d.Code AS DeptCode,
        d.Name AS DeptName,
        bu.Name AS BusinessUnitName,
        bu.BusinessUnitHead as DeptHeadName,
        bu.Phone AS DeptHeadMobNo,
        bu.Email AS DeptHeadEmail,
        bu.ManagerEmail AS DeptManagerEmail,
        bu.OtherEmail AS DeptSubManagerEmail,
        d.ManagerEmail AS DivisionManagerEmail,
        d.OtherEmail AS DivisionOtherEmail

    FROM BusinessUnit AS bu

    LEFT JOIN Division AS d
        ON d.Code = bu.DivisionCode

    ORDER BY
        bu.Code
  `);

  const data = result.recordset.map((r) => ({
    deptCode: r.DeptCode,
    deptName: r.DeptName,
    businessUnitName: r.BusinessUnitName,
    deptHeadName: r.DeptHeadName,
    deptHeadMobNo: r.DeptHeadMobNo,
    deptHeadEmail: r.DeptHeadEmail,
    deptManagerEmail: r.DeptManagerEmail,
    deptSubManagerEmail: r.DeptSubManagerEmail,
    divisionManagerEmail: r.DivisionManagerEmail,
    divisionOtherEmail: r.DivisionOtherEmail,
  })).filter((r) => r.deptName);

  res.json({ success: true, data });
});

// POST /gatepass/dept-config/sync
// Bulk-upserts GatePassDeptConfig from the CLMS directory above, matched by
// DeptName. Only overwrites directory-sourced columns — Location and
// IsActive are never touched here, so a manual edit to those survives a
// re-sync. Body: { deptNames: [...] } — which directory rows to pull in;
// omit to sync everything.
export const syncDeptConfig = tryCatch(async (req, res) => {
  const wanted = Array.isArray(req.body?.deptNames) && req.body.deptNames.length
    ? new Set(req.body.deptNames)
    : null;

  const directoryPool = await getEmployeePool();
  const directoryResult = await directoryPool.request().query(`
    SELECT
        d.Code AS DeptCode, d.Name AS DeptName, bu.Name AS BusinessUnitName,
        bu.BusinessUnitHead as DeptHeadName, bu.Phone AS DeptHeadMobNo, bu.Email AS DeptHeadEmail,
        bu.ManagerEmail AS DeptManagerEmail, bu.OtherEmail AS DeptSubManagerEmail,
        d.ManagerEmail AS DivisionManagerEmail, d.OtherEmail AS DivisionOtherEmail
    FROM BusinessUnit AS bu
    LEFT JOIN Division AS d ON d.Code = bu.DivisionCode
    ORDER BY bu.Code
  `);

  const rows = directoryResult.recordset.filter((r) => r.DeptName && (!wanted || wanted.has(r.DeptName)));
  const pool = await getPool();
  let created = 0, updated = 0;

  for (const r of rows) {
    const result = await pool.request()
      .input("deptCode", sql.NVarChar(50), r.DeptCode?.toString() || null)
      .input("deptName", sql.NVarChar(200), r.DeptName)
      .input("businessUnitName", sql.NVarChar(200), r.BusinessUnitName || null)
      .input("deptHeadName", sql.NVarChar(200), r.DeptHeadName || null)
      .input("deptHeadEmail", sql.NVarChar(200), r.DeptHeadEmail || null)
      .input("deptHeadMobNo", sql.NVarChar(50), r.DeptHeadMobNo || null)
      .input("deptManagerEmail", sql.NVarChar(200), r.DeptManagerEmail || null)
      .input("deptSubManagerEmail", sql.NVarChar(200), r.DeptSubManagerEmail || null)
      .input("divisionManagerEmail", sql.NVarChar(200), r.DivisionManagerEmail || null)
      .input("divisionOtherEmail", sql.NVarChar(200), r.DivisionOtherEmail || null)
      .query(`
        MERGE GatePassDeptConfig AS target
        USING (SELECT @deptName AS DeptName) AS src
          ON target.DeptName = src.DeptName
        WHEN MATCHED THEN UPDATE SET
          DeptCode = @deptCode, BusinessUnitName = @businessUnitName, DeptHeadName = @deptHeadName, DeptHeadEmail = @deptHeadEmail,
          DeptHeadMobNo = @deptHeadMobNo, DeptManagerEmail = @deptManagerEmail,
          DeptSubManagerEmail = @deptSubManagerEmail, DivisionManagerEmail = @divisionManagerEmail,
          DivisionOtherEmail = @divisionOtherEmail, UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (DeptCode, DeptName, BusinessUnitName, DeptHeadName, DeptHeadEmail, DeptHeadMobNo,
           DeptManagerEmail, DeptSubManagerEmail, DivisionManagerEmail, DivisionOtherEmail)
          VALUES (@deptCode, @deptName, @businessUnitName, @deptHeadName, @deptHeadEmail, @deptHeadMobNo,
                  @deptManagerEmail, @deptSubManagerEmail, @divisionManagerEmail, @divisionOtherEmail)
        OUTPUT $action AS action;
      `);
    if (result.recordset[0]?.action === "INSERT") created++;
    else updated++;
  }

  res.json({ success: true, created, updated, total: rows.length });
});

/* ═══════════════════════════════════════════════════════════════════════
   HR APPROVAL CONFIG — single-row: who gets the "Pending HR" email.
═══════════════════════════════════════════════════════════════════════ */

// GET /gatepass/hr-config
export const getHRConfig = tryCatch(async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`SELECT TOP 1 Id AS id, HRName AS hrName, HREmail AS hrEmail, UpdatedAt AS updatedAt FROM GatePassHRConfig ORDER BY Id`);
  res.json({ success: true, data: result.recordset[0] || null });
});

// PUT /gatepass/hr-config
export const updateHRConfig = tryCatch(async (req, res) => {
  const { hrName, hrEmail } = req.body;
  const pool = await getPool();

  const existing = await pool.request().query(`SELECT TOP 1 Id FROM GatePassHRConfig ORDER BY Id`);
  if (!existing.recordset.length) {
    await pool.request()
      .input("hrName", sql.NVarChar(200), hrName?.trim() || null)
      .input("hrEmail", sql.NVarChar(200), hrEmail?.trim() || null)
      .query(`INSERT INTO GatePassHRConfig (HRName, HREmail) VALUES (@hrName, @hrEmail)`);
  } else {
    await pool.request()
      .input("id", sql.Int, existing.recordset[0].Id)
      .input("hrName", sql.NVarChar(200), hrName?.trim() || null)
      .input("hrEmail", sql.NVarChar(200), hrEmail?.trim() || null)
      .query(`UPDATE GatePassHRConfig SET HRName = @hrName, HREmail = @hrEmail, UpdatedAt = GETDATE() WHERE Id = @id`);
  }

  res.json({ success: true, message: "HR approver updated." });
});
