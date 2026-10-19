import sql from "mssql";
import { tryCatch } from "../../utils/try-catch.js";
import { AppError } from "../../utils/app-error.js";
import { convertToIST } from "../../utils/convert-to-ist.js";
import { generateAuditCode } from "../../utils/generate-code.js";
import {
  processAuditImages,
  cleanupRemovedImages,
} from "../../utils/audit-image-processor.js";
import { deleteMultipleImages } from "../../utils/storage/image-storage.js";
import { readTemplateFile } from "../../utils/storage/template-storage.js";
import { assembleContent } from "../../utils/storage/template-content.js";
import { actorOf } from "../../utils/request-actor.js";

// ==================== HELPERS ====================

/**
 * Calculates audit summary from sections.
 * Supports both new structure (section.stages[].checkPoints[])
 * and old flat structure (section.checkPoints[]).
 */
const calculateSummary = (sections) => {
  let pass = 0,
    fail = 0,
    warning = 0,
    pending = 0,
    na = 0;

  if (!sections || !Array.isArray(sections)) {
    return { pass: 0, fail: 0, warning: 0, pending: 0, na: 0, total: 0 };
  }

  sections.forEach((section) => {
    if (!section) return;

    if (section.stages && Array.isArray(section.stages)) {
      // New structure: section → stages[] → checkPoints[]
      section.stages.forEach((stage) => {
        if (stage?.checkPoints && Array.isArray(stage.checkPoints)) {
          stage.checkPoints.forEach((cp) => {
            if (!cp) return;
            const status = (cp.status || "pending").toLowerCase().trim();
            if (status === "pass") pass++;
            else if (status === "fail") fail++;
            else if (status === "warning") warning++;
            else if (status === "na") na++;
            else pending++;
          });
        }
      });
    } else if (section.checkPoints && Array.isArray(section.checkPoints)) {
      // Old flat structure: section → checkPoints[]
      section.checkPoints.forEach((cp) => {
        if (!cp) return;
        const status = (cp.status || "pending").toLowerCase().trim();
        if (status === "pass") pass++;
        else if (status === "fail") fail++;
        else if (status === "warning") warning++;
        else if (status === "na") na++;
        else pending++;
      });
    }
  });

  const total = pass + fail + warning + pending + na;
  return { pass, fail, warning, pending, na, total };
};

const safeJsonParse = (str, defaultVal) => {
  if (!str) return defaultVal;
  if (typeof str === "object") return str;
  try {
    return JSON.parse(str);
  } catch {
    return defaultVal;
  }
};

// Status/approval rules live here, not in the UI — the API is callable directly.
// Create/update may only save a draft or submit it; approved/rejected/rework
// are reachable solely through approve/reject, by an approver role, and the
// approver recorded is always the logged-in user (never a client-sent name).
const EDITABLE_STATUSES = ["draft", "submitted"];
const AUDIT_APPROVER_ROLES = ["super admin", "line quality engineer"];
const roleOf = (req) => String(req.user?.roleName || "").trim().toLowerCase();

const assertEditableStatus = (status) => {
  if (status !== undefined && !EDITABLE_STATUSES.includes(status)) {
    throw new AppError(`Status must be one of: ${EDITABLE_STATUSES.join(", ")}`, 400);
  }
};

// A photo that failed to save must not silently vanish from a submitted
// audit — drafts still save (and report imageErrors), submission is refused.
const assertNoFailedImagesOnSubmit = (status, failedImages) => {
  if (status !== "submitted" || !failedImages.length) return;
  const f = failedImages[0];
  throw new AppError(
    `Photo for "${f.checkPoint || f.field}" could not be saved (${f.error}). Please retake it and submit again.`,
    400,
  );
};

// Submission must be a finished audit: every checkpoint answered (in Image
// Capture sections "pending" means the photo is missing) and every info field
// the template marks required filled. Drafts are never checked.
export const assertCompleteForSubmit = (sections, infoFields, infoData) => {
  const pending = [];
  for (const section of sections || []) {
    for (const stage of section?.stages || [{ checkPoints: section?.checkPoints }]) {
      for (const cp of stage?.checkPoints || []) {
        if (cp && String(cp.status || "pending").trim().toLowerCase() === "pending") {
          pending.push(cp.checkPoint || "Unnamed checkpoint");
        }
      }
    }
  }
  const missingFields = (infoFields || [])
    .filter((f) => f?.required && !String(infoData?.[f.id] ?? "").trim())
    .map((f) => f.name || f.id);

  const problems = [];
  if (pending.length) {
    const sample = pending.slice(0, 3).map((t) => `"${t}"`).join(", ");
    problems.push(`${pending.length} checkpoint(s) still pending: ${sample}${pending.length > 3 ? ", …" : ""}`);
  }
  if (missingFields.length) problems.push(`required field(s) empty: ${missingFields.join(", ")}`);
  if (problems.length) {
    throw new AppError(`Audit is incomplete — ${problems.join("; ")}.`, 400);
  }
};

// CreatedBy holds whichever identifier was current when the audit was made —
// older rows a numeric usercode, newer ones the display name — so ownership
// matches any of the caller's identifiers, as the list/entry screens do.
const isAuditOwner = (req, createdBy) => {
  const owner = String(createdBy || "").trim().toLowerCase();
  if (!owner || owner === "system") return false;
  return [req.user?.name, req.user?.usercode, req.user?.id]
    .some((v) => v != null && String(v).trim().toLowerCase() === owner);
};

// Mirrors the entry screen: the creator, any Quality Auditor, or Super Admin
// may edit a draft/rework audit (other statuses are refused earlier).
export const assertCanEditAudit = (req, audit) => {
  const role = roleOf(req);
  if (role === "super admin" || role === "quality auditor" || isAuditOwner(req, audit.CreatedBy)) return;
  throw new AppError("You can only edit audits you created", 403);
};

// No screen deletes audits; via the API, only Super Admin, or the creator
// while it is still a draft/rework.
export const assertCanDeleteAudit = (req, audit) => {
  if (roleOf(req) === "super admin") return;
  if (isAuditOwner(req, audit.CreatedBy) && ["draft", "rework"].includes(audit.Status)) return;
  throw new AppError("Only the creator (while in draft) or a Super Admin can delete this audit", 403);
};

const assertAuditApprover = (req) => {
  if (!AUDIT_APPROVER_ROLES.includes(roleOf(req))) {
    throw new AppError("Only a Line Quality Engineer can approve or reject audits", 403);
  }
};

// The audit row and its AuditHistory row are written together or not at all.
const inTransaction = async (pool, fn) => {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
};

// ==================== GET ALL AUDITS ====================
export const getAllAudits = tryCatch(async (req, res) => {
  const {
    templateId,
    status,
    search,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = req.query;

  // lite=true drops the heavy JSON columns (sections, template layout) that
  // list views never render — the list needs status, infoData and summary.
  const lite = req.query.lite === "true";
  const maxLimit = lite ? 5000 : 200;
  const pageSize = Math.min(Math.max(parseInt(limit) || 50, 1), maxLimit);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * pageSize;

  const pool = global.pool3;
  const request = pool.request();

  const whereConditions = ["IsDeleted = 0"];

  // When status is explicitly requested
  if (status) {
    request.input("status", sql.NVarChar(50), status);
    whereConditions.push("Status = @status");
  }
  // Note: When no status specified, return all audits (frontend will filter)

  if (templateId) {
    request.input("templateId", sql.Int, templateId);
    whereConditions.push("TemplateId = @templateId");
  }
  if (search) {
    request.input("search", sql.NVarChar, `%${search}%`);
    whereConditions.push(
      "(ReportName LIKE @search OR TemplateName LIKE @search OR AuditCode LIKE @search)",
    );
  }
  if (startDate) {
    request.input("startDate", sql.DateTime, new Date(startDate));
    whereConditions.push("CreatedAt >= @startDate");
  }
  if (endDate) {
    request.input("endDate", sql.DateTime, new Date(endDate));
    whereConditions.push("CreatedAt <= @endDate");
  }

  request.input("offset", sql.Int, offset);
  request.input("limit", sql.Int, pageSize);

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const result = await request.query(`
    WITH AuditData AS (
      SELECT
        Id, AuditCode, TemplateId, TemplateName, ReportName,
        FormatNo, RevNo, RevDate, Notes, Status,
        InfoData, Summary,
        ${lite ? "" : "Sections, Signatures, Columns, InfoFields, HeaderConfig,"}
        StartedAt, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt,
        SubmittedBy, SubmittedAt, ApprovedBy, ApprovedAt, ApprovalComments,
        ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
      FROM Audits
      ${whereClause}
    )
    SELECT 
      (SELECT COUNT(*) FROM AuditData) AS TotalCount, *
    FROM AuditData
    WHERE RowNum > @offset AND RowNum <= (@offset + @limit);
  `);

  const audits = result.recordset.map((audit) => ({
    ...audit,
    InfoData: safeJsonParse(audit.InfoData, {}),
    Sections: safeJsonParse(audit.Sections, []),
    Summary: safeJsonParse(audit.Summary, {}),
    Signatures: safeJsonParse(audit.Signatures, {}),
    Columns: safeJsonParse(audit.Columns, []),
    InfoFields: safeJsonParse(audit.InfoFields, []),
    HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
  }));

  res.status(200).json({
    success: true,
    message: "Audits retrieved successfully",
    data: audits,
    totalCount:
      result.recordset.length > 0 ? result.recordset[0].TotalCount : 0,
    page: Math.max(parseInt(page) || 1, 1),
    limit: pageSize,
  });
});

// ==================== GET AUDIT BY ID ====================
export const getAuditById = tryCatch(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new AppError("Audit ID is required", 400);

  const pool = global.pool3;
  const result = await pool.request().input("id", sql.Int, id).query(`
    SELECT
      Id, AuditCode, TemplateId, TemplateName, ReportName,
      FormatNo, RevNo, RevDate, Notes, Status,
      InfoData, Sections, Columns, InfoFields, HeaderConfig,
      Signatures, Summary,
      StartedAt, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt,
      SubmittedBy, SubmittedAt, ApprovedBy, ApprovedAt, ApprovalComments
    FROM Audits
    WHERE Id = @id AND IsDeleted = 0
  `);

  if (result.recordset.length === 0)
    throw new AppError("Audit not found", 404);

  const audit = result.recordset[0];
  res.status(200).json({
    success: true,
    message: "Audit retrieved successfully",
    data: {
      ...audit,
      InfoData: safeJsonParse(audit.InfoData, {}),
      Sections: safeJsonParse(audit.Sections, []),
      Columns: safeJsonParse(audit.Columns, []),
      InfoFields: safeJsonParse(audit.InfoFields, []),
      HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
      Signatures: safeJsonParse(audit.Signatures, {}),
      Summary: safeJsonParse(audit.Summary, {}),
    },
  });
});

// ==================== CREATE AUDIT ====================
export const createAudit = tryCatch(async (req, res) => {
  const {
    templateId,
    templateName,
    reportName,
    formatNo,
    revNo,
    revDate,
    notes,
    infoData,
    sections,
    columns,
    infoFields,
    headerConfig,
    signatures,
    startedAt,
    status = "submitted",
  } = req.body;

  if (!templateId || !reportName) {
    throw new AppError("Template ID and Report Name are required", 400);
  }
  assertEditableStatus(status);

  const auditCode = await generateAuditCode("AUD");
  const createdBy = actorOf(req);

  // Process images: extract base64 objects → save to disk → replace with filenames
  const { sections: processedSections, savedImages, failedImages } = await processAuditImages(
    sections,
    auditCode,
  );

  const summary = calculateSummary(processedSections);

  const pool = global.pool3;
  try {
    assertNoFailedImagesOnSubmit(status, failedImages);

    // Load template defaults, and — always, regardless of what the client sent —
    // the current version/hash/file/size, so Audits.Template* is exclusively
    // server-derived and never trusts client input for that integrity metadata.
    let finalColumns = columns;
    let finalInfoFields = infoFields;
    let finalHeaderConfig = headerConfig;
    let finalTemplateName = templateName;
    let finalTemplateVersion = null;
    let finalTemplateFileName = null;
    let finalTemplateHash = null;
    let finalTemplateSize = null;

    // Columns/InfoFields/HeaderConfig live in the template's content (SQL-backed
    // AuditTemplateContent for migrated templates, or the legacy JSON config
    // file for not-yet-migrated rows) — not as AuditTemplates SQL columns
    // directly. Only Name/Version/TemplateFileName/TemplateHash/TemplateSize/
    // CurrentVersionContentId are real columns on AuditTemplates itself.
    const templateResult = await pool
      .request()
      .input("templateId", sql.Int, templateId)
      .query(
        "SELECT Name, Version, TemplateFileName, TemplateHash, TemplateSize, CurrentVersionContentId, ApprovalStatus FROM AuditTemplates WHERE Id = @templateId AND IsDeleted = 0",
      );

    if (!templateResult.recordset.length) throw new AppError("Template not found", 404);

    // Same rule the entry screen applies: audits run on approved templates,
    // Super Admin excepted.
    if (templateResult.recordset[0].ApprovalStatus !== "approved" && roleOf(req) !== "super admin") {
      throw new AppError("Template is not approved. Please use an approved template.", 400);
    }

    {
      const tmpl = templateResult.recordset[0];
      finalTemplateName = templateName || tmpl.Name;
      finalTemplateVersion = tmpl.Version;
      finalTemplateFileName = tmpl.TemplateFileName;
      finalTemplateHash = tmpl.TemplateHash;
      finalTemplateSize = tmpl.TemplateSize;

      if (!columns || !infoFields || !headerConfig) {
        let config = null;
        if (tmpl.CurrentVersionContentId) {
          const contentResult = await pool.request()
            .input("contentId", sql.Int, tmpl.CurrentVersionContentId)
            .query("SELECT * FROM AuditTemplateContent WHERE Id = @contentId");
          if (contentResult.recordset.length) config = assembleContent(contentResult.recordset[0]);
        } else if (tmpl.TemplateFileName) {
          config = await readTemplateFile(tmpl.TemplateFileName).catch(() => null);
        }
        finalColumns = columns || config?.columns || [];
        finalInfoFields = infoFields || config?.infoFields || [];
        finalHeaderConfig = headerConfig || config?.headerConfig || {};
      }
    }

    if (status === "submitted") assertCompleteForSubmit(processedSections, finalInfoFields, infoData);

    const audit = await inTransaction(pool, async (tx) => {
      const result = await tx
        .request()
        .input("auditCode", sql.NVarChar(50), auditCode)
        .input("templateId", sql.Int, templateId)
        .input("templateName", sql.NVarChar, finalTemplateName)
        .input("templateVersion", sql.NVarChar(20), finalTemplateVersion)
        .input("templateFileName", sql.NVarChar(500), finalTemplateFileName)
        .input("templateHash", sql.NVarChar(64), finalTemplateHash)
        .input("templateSize", sql.Int, finalTemplateSize)
        .input("reportName", sql.NVarChar, reportName)
        .input("formatNo", sql.NVarChar(50), formatNo || null)
        .input("revNo", sql.NVarChar(50), revNo || null)
        .input("revDate", sql.Date, revDate ? new Date(revDate) : null)
        .input("notes", sql.NVarChar(sql.MAX), notes || null)
        .input("status", sql.NVarChar(50), status)
        .input("infoData", sql.NVarChar(sql.MAX), JSON.stringify(infoData || {}))
        .input("sections", sql.NVarChar(sql.MAX), JSON.stringify(processedSections || []))
        .input("columns", sql.NVarChar(sql.MAX), JSON.stringify(finalColumns || []))
        .input("infoFields", sql.NVarChar(sql.MAX), JSON.stringify(finalInfoFields || []))
        .input(
          "headerConfig",
          sql.NVarChar(sql.MAX),
          JSON.stringify(finalHeaderConfig || {}),
        )
        .input("signatures", sql.NVarChar(sql.MAX), JSON.stringify(signatures || {}))
        .input("summary", sql.NVarChar(sql.MAX), JSON.stringify(summary))
        .input("startedAt", sql.DateTime, startedAt ? new Date(startedAt) : null)
        .input("submittedAt", sql.DateTime, status === "submitted" ? new Date() : null)
        .input("submittedBy", sql.NVarChar(200), status === "submitted" ? createdBy : null)
        .input("createdBy", sql.NVarChar(200), createdBy).query(`
          INSERT INTO Audits (
            AuditCode, TemplateId, TemplateName, TemplateVersion, TemplateFileName, TemplateHash, TemplateSize,
            ReportName, FormatNo, RevNo, RevDate,
            Notes, Status, InfoData, Sections, Columns, InfoFields, HeaderConfig,
            Signatures, Summary, StartedAt, SubmittedAt, SubmittedBy,
            CreatedBy, CreatedAt, UpdatedBy, UpdatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @auditCode, @templateId, @templateName, @templateVersion, @templateFileName, @templateHash, @templateSize,
            @reportName, @formatNo, @revNo, @revDate,
            @notes, @status, @infoData, @sections, @columns, @infoFields, @headerConfig,
            @signatures, @summary, @startedAt, @submittedAt, @submittedBy,
            @createdBy, GETDATE(), @createdBy, GETDATE()
          );
        `);

      const audit = result.recordset[0];

      await tx
        .request()
        .input("auditId", sql.Int, audit.Id)
        .input("action", sql.NVarChar(50), "created")
        .input("actionBy", sql.NVarChar(200), createdBy)
        .input("newData", sql.NVarChar, JSON.stringify(audit)).query(`
          INSERT INTO AuditHistory (AuditId, Action, ActionBy, ActionAt, NewData)
          VALUES (@auditId, @action, @actionBy, GETDATE(), @newData);
        `);
      return audit;
    });

    res.status(201).json({
      success: true,
      message: "Audit created successfully",
      imagesUploaded: savedImages.length,
      imageErrors: failedImages,
      data: {
        ...audit,
        InfoData: safeJsonParse(audit.InfoData, {}),
        Sections: safeJsonParse(audit.Sections, []),
        Columns: safeJsonParse(audit.Columns, []),
        InfoFields: safeJsonParse(audit.InfoFields, []),
        HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
        Signatures: safeJsonParse(audit.Signatures, {}),
        Summary: safeJsonParse(audit.Summary, {}),
      },
    });
  } catch (error) {
    // Rollback: delete any images saved before the DB insert failed
    if (savedImages.length > 0) {
      await deleteMultipleImages(savedImages.map((img) => img.fileName));
    }
    throw error;
  }
});

// ==================== UPDATE AUDIT ====================
export const updateAudit = tryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    reportName,
    formatNo,
    revNo,
    revDate,
    notes,
    infoData,
    sections,
    signatures,
    status,
  } = req.body;

  if (!id) throw new AppError("Audit ID is required", 400);
  assertEditableStatus(status);

  const updatedBy = actorOf(req);
  let savedImages = [];
  let failedImages = [];

  const pool = global.pool3;
  try {
    const currentResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Audits WHERE Id = @id AND IsDeleted = 0");

    if (currentResult.recordset.length === 0)
      throw new AppError("Audit not found", 404);

    const currentAudit = currentResult.recordset[0];

    if (currentAudit.Status === "approved") {
      throw new AppError("Cannot edit an approved audit", 400);
    }
    if (currentAudit.Status === "submitted") {
      throw new AppError("Cannot edit a submitted audit — it is pending approval by the Line Quality Engineer", 400);
    }
    // Rejected is final (the entry screen already shows it read-only).
    if (currentAudit.Status === "rejected") {
      throw new AppError("Cannot edit a rejected audit", 400);
    }
    assertCanEditAudit(req, currentAudit);

    // Autosave always sends "draft"; an audit sent back for rework must stay
    // "rework" while it's corrected, until it is explicitly resubmitted.
    const nextStatus =
      status === "draft" && currentAudit.Status === "rework" ? "rework" : status || currentAudit.Status;

    let processedSections = sections;

    if (sections) {
      const result = await processAuditImages(sections, currentAudit.AuditCode);
      processedSections = result.sections;
      savedImages = result.savedImages;
      failedImages = result.failedImages;
      assertNoFailedImagesOnSubmit(status, failedImages);
    }

    if (status === "submitted") {
      assertCompleteForSubmit(
        processedSections ?? safeJsonParse(currentAudit.Sections, []),
        safeJsonParse(currentAudit.InfoFields, []),
        infoData ?? safeJsonParse(currentAudit.InfoData, {}),
      );
    }

    const summary = processedSections
      ? calculateSummary(processedSections)
      : safeJsonParse(currentAudit.Summary, {});

    const audit = await inTransaction(pool, async (tx) => {
      const result = await tx
        .request()
        .input("id", sql.Int, id)
        .input("reportName", sql.NVarChar, reportName || currentAudit.ReportName)
        .input(
          "formatNo",
          sql.NVarChar(50),
          formatNo !== undefined ? formatNo : currentAudit.FormatNo,
        )
        .input(
          "revNo",
          sql.NVarChar(50),
          revNo !== undefined ? revNo : currentAudit.RevNo,
        )
        .input(
          "revDate",
          sql.Date,
          revDate ? new Date(revDate) : currentAudit.RevDate,
        )
        .input(
          "notes",
          sql.NVarChar(sql.MAX),
          notes !== undefined ? notes : currentAudit.Notes,
        )
        .input("status", sql.NVarChar(50), nextStatus)
        .input("submittedAt", sql.DateTime,
          status === "submitted" && currentAudit.Status !== "submitted"
            ? new Date() : currentAudit.SubmittedAt || null)
        .input("submittedBy", sql.NVarChar(200),
          status === "submitted" && currentAudit.Status !== "submitted"
            ? updatedBy : currentAudit.SubmittedBy || null)
        .input(
          "infoData",
          sql.NVarChar(sql.MAX),
          infoData ? JSON.stringify(infoData) : currentAudit.InfoData,
        )
        .input(
          "sections",
          sql.NVarChar(sql.MAX),
          processedSections
            ? JSON.stringify(processedSections)
            : currentAudit.Sections,
        )
        .input(
          "signatures",
          sql.NVarChar(sql.MAX),
          signatures ? JSON.stringify(signatures) : currentAudit.Signatures,
        )
        .input("summary", sql.NVarChar(sql.MAX), JSON.stringify(summary))
        .input("prevStatus", sql.NVarChar(50), currentAudit.Status)
        .input("updatedBy", sql.NVarChar(200), updatedBy).query(`
          UPDATE Audits
          SET
            ReportName = @reportName, FormatNo = @formatNo, RevNo = @revNo,
            RevDate = @revDate, Notes = @notes, Status = @status,
            InfoData = @infoData, Sections = @sections, Signatures = @signatures,
            Summary = @summary, SubmittedAt = @submittedAt, SubmittedBy = @submittedBy,
            UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE Id = @id AND IsDeleted = 0 AND Status = @prevStatus;
        `);

      // Status changed since it was read (e.g. submitted/approved meanwhile).
      const audit = result.recordset[0];
      if (!audit) {
        throw new AppError("This audit was changed by someone else (status updated). Please refresh.", 409);
      }

      // History records status changes only (e.g. draft → submitted, with the
      // snapshot of what was submitted). Draft autosaves run every few seconds
      // and used to log two full copies of the audit each time.
      if (audit.Status !== currentAudit.Status) {
        await tx
          .request()
          .input("auditId", sql.Int, id)
          .input("action", sql.NVarChar(50), audit.Status === "submitted" ? "submitted" : "status_changed")
          .input("actionBy", sql.NVarChar(200), updatedBy)
          .input("previousData", sql.NVarChar, JSON.stringify(currentAudit))
          .input("newData", sql.NVarChar, JSON.stringify(audit)).query(`
            INSERT INTO AuditHistory (AuditId, Action, ActionBy, ActionAt, PreviousData, NewData)
            VALUES (@auditId, @action, @actionBy, GETDATE(), @previousData, @newData);
          `);
      }
      return audit;
    });

    // Only once the new sections are committed is it safe to remove files the
    // update dropped — doing it first left the DB pointing at deleted files
    // whenever the save failed.
    if (sections) {
      await cleanupRemovedImages(safeJsonParse(currentAudit.Sections, []), processedSections);
    }

    res.status(200).json({
      success: true,
      message: "Audit updated successfully",
      imagesUploaded: savedImages.length,
      imageErrors: failedImages,
      data: {
        ...audit,
        InfoData: safeJsonParse(audit.InfoData, {}),
        Sections: safeJsonParse(audit.Sections, []),
        Columns: safeJsonParse(audit.Columns, []),
        InfoFields: safeJsonParse(audit.InfoFields, []),
        HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
        Signatures: safeJsonParse(audit.Signatures, {}),
        Summary: safeJsonParse(audit.Summary, {}),
      },
    });
  } catch (error) {
    if (savedImages.length > 0) {
      await deleteMultipleImages(savedImages.map((img) => img.fileName));
    }
    throw error;
  }
});

// ==================== DELETE AUDIT ====================
export const deleteAudit = tryCatch(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new AppError("Audit ID is required", 400);

  const updatedBy = actorOf(req);

  const pool = global.pool3;
  const checkResult = await pool
    .request()
    .input("id", sql.Int, id)
    .query(
      "SELECT Id, Status, CreatedBy FROM Audits WHERE Id = @id AND IsDeleted = 0",
    );

  if (checkResult.recordset.length === 0)
    throw new AppError("Audit not found", 404);

  const currentAudit = checkResult.recordset[0];

  if (currentAudit.Status === "approved") {
    throw new AppError("Cannot delete an approved audit", 400);
  }
  assertCanDeleteAudit(req, currentAudit);

  // Soft delete — images stay on disk so a restored audit keeps its evidence.
  await inTransaction(pool, async (tx) => {
    await tx
      .request()
      .input("id", sql.Int, id)
      .input("updatedBy", sql.NVarChar(200), updatedBy).query(`
        UPDATE Audits
        SET IsDeleted = 1, UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
        WHERE Id = @id;
      `);

    await tx
      .request()
      .input("auditId", sql.Int, id)
      .input("action", sql.NVarChar(50), "deleted")
      .input("actionBy", sql.NVarChar(200), updatedBy).query(`
        INSERT INTO AuditHistory (AuditId, Action, ActionBy, ActionAt)
        VALUES (@auditId, @action, @actionBy, GETDATE());
      `);
  });

  res.status(200).json({
    success: true,
    message: "Audit deleted successfully",
  });
});

// ==================== APPROVE AUDIT ====================
export const approveAudit = tryCatch(async (req, res) => {
  const { id } = req.params;
  const { comments } = req.body;

  if (!id) throw new AppError("Audit ID is required", 400);
  assertAuditApprover(req);

  const approverName = actorOf(req);
  const approvedBy = approverName;

  const pool = global.pool3;
  const checkResult = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT * FROM Audits WHERE Id = @id AND IsDeleted = 0");

  if (checkResult.recordset.length === 0)
    throw new AppError("Audit not found", 404);

  const currentAudit = checkResult.recordset[0];
  if (currentAudit.Status !== "submitted") {
    throw new AppError(
      `Cannot approve audit with status: ${currentAudit.Status}`,
      400,
    );
  }

  // Merge approver name + date into the Signatures JSON
  const today = new Date().toISOString().split("T")[0];
  const existingSignatures = safeJsonParse(currentAudit.Signatures, {});
  const updatedSignatures = {
    ...existingSignatures,
    approver: { name: approverName, date: today },
  };

  const audit = await inTransaction(pool, async (tx) => {
  const result = await tx
      .request()
      .input("id", sql.Int, id)
      .input("approvedBy", sql.NVarChar(200), approverName)
      .input("comments", sql.NVarChar, comments || null)
      .input("signatures", sql.NVarChar, JSON.stringify(updatedSignatures))
      .input("updatedBy", sql.NVarChar(200), approvedBy).query(`
        UPDATE Audits
        SET
          Status = 'approved', ApprovedBy = @approvedBy, ApprovedAt = GETDATE(),
          ApprovalComments = @comments, Signatures = @signatures,
          UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id AND IsDeleted = 0 AND Status = 'submitted';
      `);

    const audit = result.recordset[0];
    if (!audit) {
      throw new AppError("This audit was already approved, rejected or changed by someone else. Please refresh.", 409);
    }

    await tx
      .request()
      .input("auditId", sql.Int, id)
      .input("action", sql.NVarChar(50), "approved")
      .input("actionBy", sql.NVarChar(200), approverName)
      .input("comments", sql.NVarChar, comments || null).query(`
        INSERT INTO AuditHistory (AuditId, Action, ActionBy, ActionAt, Comments)
        VALUES (@auditId, @action, @actionBy, GETDATE(), @comments);
      `);
    return audit;
  });

  res.status(200).json({
    success: true,
    message: "Audit approved successfully",
    data: {
      ...audit,
      InfoData: safeJsonParse(audit.InfoData, {}),
      Sections: safeJsonParse(audit.Sections, []),
      Columns: safeJsonParse(audit.Columns, []),
      InfoFields: safeJsonParse(audit.InfoFields, []),
      HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
      Signatures: safeJsonParse(audit.Signatures, {}),
      Summary: safeJsonParse(audit.Summary, {}),
    },
  });
});

// ==================== REJECT AUDIT ====================
export const rejectAudit = tryCatch(async (req, res) => {
  const { id } = req.params;
  const { comments, isRework } = req.body;

  if (!id) throw new AppError("Audit ID is required", 400);
  if (!comments) throw new AppError("Rejection reason is required", 400);
  assertAuditApprover(req);

  const approverName = actorOf(req);
  const rejectedBy = approverName;
  const newStatus = isRework ? 'rework' : 'rejected';
  const actionType = isRework ? 'rework' : 'rejected';

  const pool = global.pool3;
  const checkResult = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT * FROM Audits WHERE Id = @id AND IsDeleted = 0");

  if (checkResult.recordset.length === 0)
    throw new AppError("Audit not found", 404);

  const currentAudit = checkResult.recordset[0];
  if (currentAudit.Status !== "submitted") {
    throw new AppError(
      `Cannot reject audit with status: ${currentAudit.Status}`,
      400,
    );
  }

  const audit = await inTransaction(pool, async (tx) => {
  const result = await tx
      .request()
      .input("id", sql.Int, id)
      .input("approvedBy", sql.NVarChar(200), approverName)
      .input("comments", sql.NVarChar(sql.MAX), comments || null)
      .input("updatedBy", sql.NVarChar(200), rejectedBy)
      .input("status", sql.NVarChar(50), newStatus).query(`
        UPDATE Audits
        SET
          Status = @status, ApprovedBy = @approvedBy, ApprovedAt = GETDATE(),
          ApprovalComments = @comments, UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id AND IsDeleted = 0 AND Status = 'submitted';
      `);

    const audit = result.recordset[0];
    if (!audit) {
      throw new AppError("This audit was already approved, rejected or changed by someone else. Please refresh.", 409);
    }

    await tx
      .request()
      .input("auditId", sql.Int, id)
      .input("action", sql.NVarChar(50), actionType)
      .input("actionBy", sql.NVarChar(200), approverName)
      .input("comments", sql.NVarChar(sql.MAX), comments || null).query(`
        INSERT INTO AuditHistory (AuditId, Action, ActionBy, ActionAt, Comments)
        VALUES (@auditId, @action, @actionBy, GETDATE(), @comments);
      `);
    return audit;
  });

  res.status(200).json({
    success: true,
    message: isRework ? "Audit sent for rework successfully" : "Audit rejected successfully",
    data: {
      ...audit,
      InfoData: safeJsonParse(audit.InfoData, {}),
      Sections: safeJsonParse(audit.Sections, []),
      Columns: safeJsonParse(audit.Columns, []),
      InfoFields: safeJsonParse(audit.InfoFields, []),
      HeaderConfig: safeJsonParse(audit.HeaderConfig, {}),
      Signatures: safeJsonParse(audit.Signatures, {}),
      Summary: safeJsonParse(audit.Summary, {}),
    },
  });
});

// ==================== GET AUDIT HISTORY ====================
export const getAuditHistory = tryCatch(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new AppError("Audit ID is required", 400);

  const pool = global.pool3;
  const result = await pool.request().input("auditId", sql.Int, id).query(`
    SELECT Id, AuditId, Action, ActionBy, ActionAt, Comments
    FROM AuditHistory
    WHERE AuditId = @auditId
    ORDER BY ActionAt DESC;
  `);

  res.status(200).json({
    success: true,
    message: "Audit history retrieved successfully",
    data: result.recordset,
  });
});

// ==================== GET AUDIT STATS ====================
export const getAuditStats = tryCatch(async (req, res) => {
  const { startDate, endDate, templateId } = req.query;

  const pool = global.pool3;
  const request = pool.request();

  const whereConditions = ["IsDeleted = 0"];

  if (startDate) {
    request.input("startDate", sql.DateTime, new Date(startDate));
    whereConditions.push("CreatedAt >= @startDate");
  }
  if (endDate) {
    request.input("endDate", sql.DateTime, new Date(endDate));
    whereConditions.push("CreatedAt <= @endDate");
  }
  if (templateId) {
    request.input("templateId", sql.Int, templateId);
    whereConditions.push("TemplateId = @templateId");
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const result = await request.query(`
    SELECT 
      COUNT(*) AS TotalAudits,
      SUM(CASE WHEN Status = 'submitted' THEN 1 ELSE 0 END) AS SubmittedCount,
      SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
      SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount
    FROM Audits
    ${whereClause};
  `);

  const templateStats = await request.query(`
    SELECT 
      TemplateName, TemplateId,
      COUNT(*) AS AuditCount,
      SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount
    FROM Audits
    ${whereClause}
    GROUP BY TemplateName, TemplateId
    ORDER BY AuditCount DESC;
  `);

  res.status(200).json({
    success: true,
    message: "Audit statistics retrieved successfully",
    data: {
      summary: result.recordset[0],
      templateStats: templateStats.recordset,
    },
  });
});

// ==================== GET AUDIT MODEL SUMMARY ====================
export const getAuditModelSummary = tryCatch(async (req, res) => {
  const { startDate, endDate } = req.query;

  const now = new Date();

  // Mirror LPT exactly: today 08:00 → tomorrow 20:00 (local), then IST-shifted
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
  const defaultEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0, 0);

  const start = convertToIST(startDate ? new Date(startDate) : defaultStart);
  const end   = convertToIST(endDate   ? new Date(endDate)   : defaultEnd);

  // ── Step 1: Production count + Audit Required per model (production DB) ──
  let prodRows = [];
  const prodPool = global.pool1;
  {
    const res1 = await prodPool.request()
      .input("StartDate", sql.DateTime, start)
      .input("EndDate",   sql.DateTime, end)
      .query(`
        WITH PROD AS (
          SELECT
            c.Name  AS ModelName,
            cnt.ModelCount,
            1       AS AuditRequired
          FROM (
            SELECT b.Material, COUNT(*) AS ModelCount
            FROM   ProcessActivity  a
            INNER JOIN MaterialBarcode b ON a.PSNo = b.DocNo
            WHERE  a.StationCode IN (1220010, 1230017)
              AND  a.ActivityType = 5
              AND  a.ActivityOn   BETWEEN @StartDate AND @EndDate
              AND  b.Type NOT IN (0, 200)
            GROUP BY b.Material
          ) AS cnt
          INNER JOIN Material c ON cnt.Material = c.MatCode
        )
        SELECT ModelName, ModelCount, AuditRequired
        FROM   PROD
        WHERE  ModelCount > 0
        ORDER BY ModelCount DESC;
      `);
    prodRows = res1.recordset;
  }

  // ── Step 2: Audit done count per model (audit DB) ──
  let auditRows = [];
  const auditPool = global.pool3;
  {
    const res2 = await auditPool.request()
      .input("StartDate", sql.DateTime, start)
      .input("EndDate",   sql.DateTime, end)
      .query(`
        SELECT
          JSON_VALUE(InfoData, '$.modelName') AS ModelName,
          COUNT(*)                            AS AuditDone
        FROM Audits
        WHERE  IsDeleted = 0
          AND  CreatedAt BETWEEN @StartDate AND @EndDate
          AND  JSON_VALUE(InfoData, '$.modelName') IS NOT NULL
        GROUP BY JSON_VALUE(InfoData, '$.modelName');
      `);
    auditRows = res2.recordset;
  }

  // ── Step 3: Merge ──
  const auditMap = {};
  auditRows.forEach((r) => { if (r.ModelName) auditMap[r.ModelName] = r.AuditDone; });

  const data = prodRows.map((r) => {
    const auditDone = auditMap[r.ModelName] || 0;
    const pending   = Math.max(0, r.AuditRequired - auditDone);
    const percentage = r.AuditRequired > 0
      ? parseFloat(((auditDone * 100) / r.AuditRequired).toFixed(2))
      : 0;
    return {
      modelName:     r.ModelName,
      production:    r.ModelCount,
      auditRequired: r.AuditRequired,
      auditDone,
      pending,
      percentage,
    };
  });

  res.status(200).json({
    success: true,
    data,
    startDate: start.toISOString(),
    endDate:   end.toISOString(),
  });
});
