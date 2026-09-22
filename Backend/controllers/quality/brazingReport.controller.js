import sql from "mssql";
import { dbConfig1 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";
import { convertToIST } from "../../utils/convertToIST.js";

// Header-process -> brazing-station-process pairs, one set per physical
// brazing line. Kept separate (rather than unioned into one #Map) because
// joining all three together in a single pass blows up the intermediate
// #Brazing join (93k #Insp rows -> 240s+ timeout); run per-line in parallel
// instead — each line alone completes in a few seconds.
const LINE_MAP_SQL = {
  freezer: `SELECT h.p, s.p FROM (VALUES (12206),(12401),(12402)) h(p) CROSS JOIN (VALUES (12204),(12205),(12302)) s(p)`,
  sus:     `SELECT h.p, s.p FROM (VALUES (12603),(12610),(12611)) h(p) CROSS JOIN (VALUES (12606),(12608)) s(p)`,
  visi:    `SELECT h.p, s.p FROM (VALUES (12612),(12613),(12617)) h(p) CROSS JOIN (VALUES (12614),(12615),(12616)) s(p)`,
};

const LINE_LABELS = {
  freezer: "Freezer Brazing",
  sus: "SUS Brazing",
  visi: "VISI Brazing",
};

const buildQuery = (mapSql) => `
  SET NOCOUNT ON;
  DROP TABLE IF EXISTS #Map, #Insp, #Brazing, #StationTime, #Login;

  /* Header process -> allowed brazing station process for this line */
  CREATE TABLE #Map (HeaderProcess INT NOT NULL, StationProcess INT NOT NULL,
                     PRIMARY KEY (HeaderProcess, StationProcess));

  INSERT INTO #Map (HeaderProcess, StationProcess)
  ${mapSql};

  /* Only the inspections in the date window for this line (small set) */
  SELECT
      it.ID,
      it.InspectionLotNo,
      it.InspectedOn,
      ih.DocNo,
      ih.Process,
      iud.Status,
      iud.LineCode
  INTO #Insp
  FROM InspectionTrans it
  INNER JOIN InspectionHeader ih
      ON ih.InspectionLotNo = it.InspectionLotNo
  INNER JOIN InspectionUD iud
      ON iud.ID = it.ID
  WHERE it.InspectedOn >= @startDate
    AND it.InspectedOn <= @endDate
    AND ih.Process IN (SELECT DISTINCT HeaderProcess FROM #Map);

  CREATE CLUSTERED INDEX IX_Insp ON #Insp (DocNo, Process);

  /* Resolve joint + brazing station */
  SELECT DISTINCT
      pp.Name            AS Station,
      pt.Name            AS Joint_Name,
      pt.Description     AS Joint_Description,
      ri.SeqNo,
      i.DocNo,
      pt.LineCode,
      pr.RouteCode,
      i.Status,
      pr.ProcessCode,
      rt.ProcessCode     AS StationProcessCode,
      wp.StationCode,
      i.InspectionLotNo,
      i.ID,
      i.InspectedOn
  INTO #Brazing
  FROM #Insp i
  INNER JOIN ProcessRouting pr
      ON pr.PSNo = i.DocNo
     AND pr.ProcessCode = i.Process
  INNER JOIN ParameterTran pt
      ON pt.ParameterCode = pr.ParameterCode
     AND pt.LineCode = i.LineCode
  INNER JOIN RouteInstruction ri
      ON ri.RouteCode = pr.RouteCode
     AND ri.Instruction = pt.Name
  INNER JOIN RoutingTrans rt
      ON rt.SeqNo = ri.SeqNo
     AND rt.RouteCode = ri.RouteCode
  INNER JOIN #Map m
      ON m.HeaderProcess = i.Process
     AND m.StationProcess = rt.ProcessCode
  INNER JOIN ProductionProcess pp
      ON pp.ProcessCode = rt.ProcessCode
  INNER JOIN WorkCenterProcesses wp
      ON wp.ProcessCode = rt.ProcessCode;

  /* Brazer login lookup ONCE per (station, timestamp) */
  SELECT DISTINCT StationCode, InspectedOn
  INTO #StationTime
  FROM #Brazing;

  SELECT
      st.StationCode,
      st.InspectedOn,
      pl.UserCode
  INTO #Login
  FROM #StationTime st
  OUTER APPLY
  (
      SELECT TOP (1) pul.UserCode
      FROM ProcessUserLogin pul
      WHERE pul.Station = st.StationCode
        AND pul.Login  <= st.InspectedOn
        AND (pul.Logout IS NULL OR pul.Logout >= st.InspectedOn)
      ORDER BY pul.Login DESC, pul.RowID DESC
  ) pl;

  CREATE CLUSTERED INDEX IX_Login ON #Login (StationCode, InspectedOn);

  /* Final report */
  ;WITH Final AS
  (
      SELECT
          us.UserName                    AS Brazer_Name,
          b.Joint_Name,
          b.Joint_Description,
          b.Station,
          CAST(b.InspectedOn AS DATE)    AS InspDate,
          b.Status,
          b.DocNo
      FROM #Brazing b
      INNER JOIN #Login l
          ON l.StationCode = b.StationCode
         AND l.InspectedOn = b.InspectedOn
      LEFT JOIN Users us
          ON us.UserCode = l.UserCode
  )
  SELECT
      ISNULL(Brazer_Name, 'Not Logged In')            AS Brazer_Name,
      Joint_Name,
      Joint_Description,
      Station,
      CONVERT(VARCHAR(11), InspDate, 106)             AS [Date],
      DATENAME(MONTH, InspDate)                       AS [Month],
      SUM(CASE WHEN Status = 0 THEN 1 ELSE 0 END)     AS Leakage_Count,
      COUNT(DISTINCT DocNo)                           AS Total_Joint_Brazed
  FROM Final
  GROUP BY
      Brazer_Name,
      Joint_Name,
      Joint_Description,
      Station,
      InspDate
  ORDER BY
      InspDate,
      Station,
      Brazer_Name;

  DROP TABLE IF EXISTS #Map, #Insp, #Brazing, #StationTime, #Login;
`;

const runLine = async (pool, line, istStart, istEnd) => {
  const result = await pool
    .request()
    .input("startDate", sql.DateTime, istStart)
    .input("endDate", sql.DateTime, istEnd)
    .query(buildQuery(LINE_MAP_SQL[line]));
  return result.recordset.map((r) => ({ ...r, Line: LINE_LABELS[line] }));
};

export const getBrazingReport = tryCatch(async (req, res) => {
  const { startDate, endDate, line = "all" } = req.query;

  if (!startDate || !endDate) {
    throw new AppError(
      "Missing required query parameters: startDate or endDate.",
      400,
    );
  }
  if (line !== "all" && !LINE_MAP_SQL[line]) {
    throw new AppError(
      `Invalid line. Expected one of: all, ${Object.keys(LINE_MAP_SQL).join(", ")}.`,
      400,
    );
  }

  const istStart = convertToIST(startDate);
  const istEnd = convertToIST(endDate);

  const pool = await new sql.ConnectionPool(dbConfig1).connect();

  try {
    const lines = line === "all" ? Object.keys(LINE_MAP_SQL) : [line];
    // Each line resolves quickly on its own; unioning all three station-
    // process maps into one query blows up the join instead (see note above).
    const results = await Promise.all(
      lines.map((l) => runLine(pool, l, istStart, istEnd)),
    );

    const data = results.flat().sort((a, b) => {
      const byDate = new Date(a.Date) - new Date(b.Date);
      if (byDate) return byDate;
      if (a.Station !== b.Station) return a.Station < b.Station ? -1 : 1;
      return a.Brazer_Name < b.Brazer_Name ? -1 : a.Brazer_Name > b.Brazer_Name ? 1 : 0;
    });

    res.status(200).json({
      success: true,
      message: "Brazing Report data retrieved successfully.",
      line,
      data,
    });
  } catch (error) {
    throw new AppError(`Failed to fetch Brazing Report: ${error.message}`, 500);
  } finally {
    await pool.close();
  }
});
