import sql from "mssql";
import { dbConfig1 } from "../../../config/db.config.js";
import { tryCatch } from "../../../utils/try-catch.js";
import { AppError } from "../../../utils/app-error.js";
import { convertToIST } from "../../../utils/convert-to-ist.js";

// ── Shared connection pool (cached as a promise, so no cold-start race) ───────
let _poolPromise = null;

const getPool = () => {
  if (!_poolPromise) {
    _poolPromise = new sql.ConnectionPool(dbConfig1)
      .connect()
      .then((pool) => {
        pool.on("error", () => {
          _poolPromise = null; // force reconnect on next request
        });
        return pool;
      })
      .catch((err) => {
        _poolPromise = null;
        throw err;
      });
  }
  return _poolPromise;
};

// ── Shared CTE: completed stops minus shift breaks ────────────────────────────
// EMG   -> completed stops for the chosen line / location (/ station)
// BREAKS-> shift breaks expanded for every day in the range
// CALC  -> NetSeconds = stop duration minus any overlap with breaks
function buildCTE(station) {
  const stationFilter = station ? "AND RTRIM(M.PLCLocation) = @station" : "";
  return `
    ;WITH
    EMG AS (
      SELECT
        T.RefID,
        RTRIM(M.PLCLocation) AS StationName,
        T.EmgOn,
        T.EmgOff,
        DATEDIFF(SECOND, T.EmgOn, T.EmgOff) AS TotalSeconds
      FROM  EMGTrans  T
      INNER JOIN EMGMaster M
        ON  T.PLCCode = M.PLCCode
        AND T.MEMBit  = M.MEMBit
        AND M.Active  = 1
      WHERE T.EmgOff   IS NOT NULL
        AND T.EmgOn    >= @fromDate
        AND T.EmgOn    <  @toDate
        AND M.Location  = @location
        AND RTRIM(M.LineName) = @lineName
        ${stationFilter}
    ),
    BREAKS AS (
      SELECT
        SB.Name,
        CAST(DATEADD(DAY, N.number, CAST(@fromDate AS DATE)) AS DATETIME)
          + CAST(SB.StartTime AS DATETIME) AS BreakStart,
        CAST(DATEADD(DAY, N.number, CAST(@fromDate AS DATE)) AS DATETIME)
          + CAST(SB.EndTime   AS DATETIME) AS BreakEnd
      FROM ShiftBreaks SB
      CROSS JOIN (
        SELECT number FROM master..spt_values
        WHERE type = 'P' AND number BETWEEN 0 AND DATEDIFF(DAY, @fromDate, @toDate)
      ) N
    ),
    CALC AS (
      SELECT
        E.RefID, E.StationName, E.EmgOn, E.EmgOff, E.TotalSeconds,
        CASE
          WHEN E.TotalSeconds - ISNULL(SUM(
            CASE
              WHEN B.BreakStart < E.EmgOff AND B.BreakEnd > E.EmgOn
              THEN DATEDIFF(SECOND,
                CASE WHEN E.EmgOn  > B.BreakStart THEN E.EmgOn  ELSE B.BreakStart END,
                CASE WHEN E.EmgOff < B.BreakEnd   THEN E.EmgOff ELSE B.BreakEnd   END)
              ELSE 0
            END), 0) > 0
          THEN E.TotalSeconds - ISNULL(SUM(
            CASE
              WHEN B.BreakStart < E.EmgOff AND B.BreakEnd > E.EmgOn
              THEN DATEDIFF(SECOND,
                CASE WHEN E.EmgOn  > B.BreakStart THEN E.EmgOn  ELSE B.BreakStart END,
                CASE WHEN E.EmgOff < B.BreakEnd   THEN E.EmgOff ELSE B.BreakEnd   END)
              ELSE 0
            END), 0)
          ELSE 0
        END AS NetSeconds
      FROM EMG E CROSS JOIN BREAKS B
      GROUP BY E.RefID, E.StationName, E.EmgOn, E.EmgOff, E.TotalSeconds
    )
  `;
}

// One row per station, worst first
const SUMMARY_SELECT = `
  SELECT
    StationName AS [Station_Name],
    CONVERT(VARCHAR, DATEADD(SECOND, SUM(NetSeconds), 0), 108) AS [Total_Stop_Time],
    SUM(NetSeconds) AS [Total_Seconds],
    COUNT(*)        AS [Total_Stop_Count]
  FROM CALC
  WHERE NetSeconds > 0
  GROUP BY StationName
  ORDER BY SUM(NetSeconds) DESC;
`;

// One row per stop, newest first
const DETAIL_SELECT = `
  SELECT
    StationName                                           AS [Station_Name],
    CONVERT(DATE,       EmgOn)                            AS [Date],
    CONVERT(VARCHAR(8), EmgOn,  108)                      AS [Stop_Time],
    CONVERT(VARCHAR(8), EmgOff, 108)                      AS [Start_Time],
    NetSeconds                                            AS [Duration_Seconds],
    CONVERT(VARCHAR, DATEADD(SECOND, NetSeconds, 0), 108) AS [Duration]
  FROM CALC
  WHERE NetSeconds > 0
  ORDER BY EmgOn DESC;
`;

// ── Run a report (shared by Summary and Detail) ───────────────────────────────
const runReport = async (req, selectSql) => {
  const { fromDate, toDate, location, lineName, station } = req.query;
  if (!fromDate || !toDate)
    throw new AppError("From Date and To Date are required", 400);
  if (!location) throw new AppError("Location is required", 400);
  if (!lineName) throw new AppError("Line Name is required", 400);

  const pool = await getPool();
  const request = pool
    .request()
    .input("fromDate", sql.DateTime, convertToIST(fromDate))
    .input("toDate", sql.DateTime, convertToIST(toDate))
    .input("location", sql.NVarChar, location)
    .input("lineName", sql.NVarChar, lineName);
  if (station) request.input("station", sql.NVarChar, station);

  const result = await request.query(`${buildCTE(station)}${selectSql}`);
  return result.recordset;
};

// ── Report endpoints ──────────────────────────────────────────────────────────
export const getStopLossSummary = tryCatch(async (req, res) => {
  const data = await runReport(req, SUMMARY_SELECT);
  res.status(200).json({
    success: true,
    message: "Stop & Loss Summary retrieved successfully",
    data,
  });
});

export const getStopLossDetail = tryCatch(async (req, res) => {
  const data = await runReport(req, DETAIL_SELECT);
  res.status(200).json({
    success: true,
    message: "Stop & Loss Detail retrieved successfully",
    data,
  });
});

// ── Dropdown endpoints ────────────────────────────────────────────────────────
export const getStopLossLines = tryCatch(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT RTRIM(LineName) AS LineName
    FROM EMGMaster
    WHERE Active = 1 AND LineName IS NOT NULL AND LineName <> ''
    ORDER BY LineName;
  `);
  res.status(200).json({
    success: true,
    message: "Lines retrieved successfully",
    data: result.recordset,
  });
});

export const getStopLossLocations = tryCatch(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT Location
    FROM EMGMaster
    WHERE Active = 1 AND Location IS NOT NULL AND Location <> ''
    ORDER BY Location;
  `);
  res.status(200).json({
    success: true,
    message: "Locations retrieved successfully",
    data: result.recordset,
  });
});

export const getStopLossStations = tryCatch(async (req, res) => {
  const { location, lineName } = req.query;
  if (!location) throw new AppError("Location is required", 400);
  if (!lineName) throw new AppError("Line Name is required", 400);

  const pool = await getPool();
  const result = await pool
    .request()
    .input("location", sql.NVarChar, location)
    .input("lineName", sql.NVarChar, lineName).query(`
      SELECT DISTINCT RTRIM(PLCLocation) AS StationName
      FROM EMGMaster
      WHERE Active = 1
        AND Location = @location
        AND RTRIM(LineName) = @lineName
        AND PLCLocation IS NOT NULL AND PLCLocation <> ''
      ORDER BY StationName;
    `);
  res.status(200).json({
    success: true,
    message: "Stations retrieved successfully",
    data: result.recordset,
  });
});
