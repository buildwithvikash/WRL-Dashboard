import sql from "mssql";
import { dbConfig3 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";
import { COMPANIONS_APPLY } from "./reports.controller.js";

// Get All Visitors (Paginated, searchable) — one row per visitor, keyed to
// their most recent visit. search/from/to are applied server-side so
// filtering actually covers the whole directory, not just whatever page
// happens to be loaded.
export const getAllVisitors = tryCatch(async (req, res, next) => {
  const limit = Number(req.query.limit) || 100;
  const offset = Number(req.query.offset) || 0;
  const { search, from, to, status } = req.query;

  if (limit <= 0 || offset < 0) {
    throw new AppError("Invalid pagination parameters", 400);
  }

  const pool = await new sql.ConnectionPool(dbConfig3).connect();

  // A mssql Request carries per-execution state, so concurrent queries each
  // need their own Request instance (built fresh with the same bindings)
  // rather than reusing one across the parallel calls below.
  const conditions = [];
  const bindInputs = (req) => {
    req.input("limit", sql.Int, limit).input("offset", sql.Int, offset);
    if (search) req.input("search", sql.NVarChar(200), `%${search}%`);
    if (from) req.input("fromDate", sql.DateTime, new Date(`${from}T00:00:00`));
    if (to) req.input("toDate", sql.DateTime, new Date(`${to}T23:59:59`));
    return req;
  };
  if (search)
    conditions.push(`(v.name LIKE @search OR v.company LIKE @search OR EXISTS (
      SELECT 1 FROM VisitorPassCompanions c2
      JOIN visitor_passes vp2 ON vp2.pass_id = c2.PassId
      WHERE vp2.visitor_id = v.visitor_id AND c2.Name LIKE @search))`);
  if (from) conditions.push("vl.check_in_time >= @fromDate");
  if (to) conditions.push("vl.check_in_time <= @toDate");
  if (status === "onsite") conditions.push("vl.check_out_time IS NULL");
  else if (status === "checkedout") conditions.push("vl.check_out_time IS NOT NULL");
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Shared base — one row per visitor, keyed to their most recent visit,
  // with the same search/date filters applied. Repeated in both queries
  // below since a CTE doesn't persist across separate .query() calls.
  const filteredCte = `
    WITH LatestVisit AS (
      SELECT
        vp.visitor_id,
        MAX(vl.check_in_time) AS latest_checkin
      FROM visitor_passes vp
      LEFT JOIN visit_logs vl ON vl.unique_pass_id = vp.pass_id
      GROUP BY vp.visitor_id
    ),
    PassCount AS (
      SELECT
        visitor_id,
        COUNT(*) AS total_passes
      FROM visitor_passes
      GROUP BY visitor_id
    ),
    Filtered AS (
      SELECT
        v.visitor_id AS id,
        v.name AS visitor_name,
        v.contact_no,
        v.email,
        v.identity_type,
        v.identity_no,
        v.company,
        v.address,
        v.city,
        v.state,
        v.vehicle_details,
        d.department_name,
        u.name AS employee_name,
        vp.purpose_of_visit,
        vl.check_in_time,
        vl.check_out_time,
        vp.pass_id,
        v.photo_url,
        pc.total_passes,
        vp.no_of_people,
        comp.companion_count,
        comp.companions
      FROM visitors v
      INNER JOIN LatestVisit lv ON lv.visitor_id = v.visitor_id
      INNER JOIN visitor_passes vp ON vp.visitor_id = v.visitor_id
      INNER JOIN visit_logs vl
        ON vl.unique_pass_id = vp.pass_id
        AND vl.check_in_time = lv.latest_checkin
      INNER JOIN users u ON u.employee_id = vp.employee_to_visit
      INNER JOIN departments d ON d.deptCode = vp.department_to_visit
      LEFT JOIN PassCount pc ON pc.visitor_id = v.visitor_id
      ${COMPANIONS_APPLY}
      ${whereClause}
    )
  `;

  const [pageResult, statsResult] = await Promise.all([
    bindInputs(pool.request()).query(`
      ${filteredCte}
      SELECT *, COUNT(*) OVER () AS total_count
      FROM Filtered
      ORDER BY check_in_time DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `),
    // Companies / currently-on-site: full filtered set, not just this page —
    // COUNT(DISTINCT ...) isn't valid as a window function, so this runs as
    // its own aggregate query over the same Filtered CTE.
    bindInputs(pool.request()).query(`
      ${filteredCte}
      SELECT
        COUNT(DISTINCT company) AS companies,
        SUM(CASE WHEN check_out_time IS NULL THEN 1 ELSE 0 END) AS currently_on_site
      FROM Filtered;
    `),
  ]);

  await pool.close();

  const totalCount = pageResult.recordset[0]?.total_count ?? 0;
  const data = pageResult.recordset.map(({ total_count, ...row }) => row);
  const stats = statsResult.recordset[0] || {};

  res.status(200).json({
    success: true,
    message: "Visitor history fetched successfully",
    count: data.length,
    totalCount,
    companies: stats.companies ?? 0,
    currentlyOnSite: stats.currently_on_site ?? 0,
    data,
  });
});

// Get Visitor Details
export const getVisitorDetails = tryCatch(async (req, res, next) => {
  const { visitorId } = req.params;

  if (!visitorId) {
    throw new AppError("Visitor ID is required", 400);
  }

  const pool = await new sql.ConnectionPool(dbConfig3).connect();

  /* ---------- Visitor Info ---------- */
  const visitorInfo = await pool
    .request()
    .input("VisitorId", sql.VarChar(50), visitorId).query(`
      SELECT
        v.visitor_id,
        v.name AS visitor_name,
        v.contact_no,
        v.email,
        v.company,
        v.address,
        v.city,
        v.state,
        v.identity_type,
        v.identity_no,
        v.vehicle_details,
        v.photo_url AS visitor_photo
      FROM visitors v
      WHERE v.visitor_id = @VisitorId
    `);

  if (!visitorInfo.recordset.length) {
    await pool.close();
    throw new AppError("Visitor not found", 404);
  }

  /* ---------- Visit Logs ---------- */
  const visitLogs = await pool
    .request()
    .input("VisitorId", sql.VarChar(50), visitorId).query(`
      SELECT
        vp.pass_id,
        vp.token,
        d.department_name,
        u.name AS employee_name,
        vp.purpose_of_visit,
        vl.check_in_time,
        vl.check_out_time,
        vp.no_of_people
      FROM visitor_passes vp
      INNER JOIN visit_logs vl ON vl.unique_pass_id = vp.pass_id
      INNER JOIN departments d ON d.deptCode = vp.department_to_visit
      INNER JOIN users u ON u.employee_id = vp.employee_to_visit
      WHERE vp.visitor_id = @VisitorId
      ORDER BY vl.check_in_time DESC
    `);

  /* ---------- Companions (with photos) per pass ---------- */
  const companions = await pool
    .request()
    .input("VisitorId", sql.VarChar(50), visitorId).query(`
      SELECT c.PassId, c.Name AS name, c.Phone AS phone, c.Photo AS photo
      FROM VisitorPassCompanions c
      JOIN visitor_passes vp ON vp.pass_id = c.PassId
      WHERE vp.visitor_id = @VisitorId
      ORDER BY c.Id
    `);

  await pool.close();

  const byPass = {};
  for (const { PassId, ...c } of companions.recordset) (byPass[PassId] ||= []).push(c);

  res.status(200).json({
    success: true,
    message: "Visitor full history fetched successfully",
    visitor: visitorInfo.recordset[0],
    visit_logs: visitLogs.recordset.map((log) => ({ ...log, companions: byPass[log.pass_id] || [] })),
  });
});
