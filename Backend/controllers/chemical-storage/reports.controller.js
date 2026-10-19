/** Chemical tank reports & data (pool1 / ChemTankReadings) — read-only. */
import sql from "mssql";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_POINTS = 20000;
const MAX_DAILY_RANGE_DAYS = 400;

const badRequest = (res, message) => res.status(400).json({ success: false, message });

const parseRange = (req, res) => {
  const { startDate, endDate } = req.query;
  if (!DATE_RE.test(startDate || "") || !DATE_RE.test(endDate || "")) {
    badRequest(res, "startDate and endDate are required (YYYY-MM-DD).");
    return null;
  }
  if (startDate > endDate) {
    badRequest(res, "startDate must not be after endDate.");
    return null;
  }
  return { startDate, endDate };
};

const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const groupOf = (code) => (String(code).toUpperCase().startsWith("ISO") ? "ISO" : "POLY");

/** Latest reading per tank. */
export const getCurrentLevels = async (req, res) => {
  try {
    const result = await global.pool1.request().query(`
      WITH R AS (
        SELECT TankCode,
               ROUND(TRY_CAST(WeightValue AS FLOAT), 2) AS weight,
               ROUND(TRY_CAST(LevelValue  AS FLOAT), 2) AS level,
               ROUND(TRY_CAST(TempValue   AS FLOAT), 2) AS temp,
               CONVERT(VARCHAR(19), CapDate, 120)       AS readingTime,
               DATEDIFF(SECOND, CapDate, GETDATE())     AS ageSeconds,
               ROW_NUMBER() OVER (PARTITION BY TankCode ORDER BY CapDate DESC) AS rn
        FROM ChemTankReadings
        WHERE CapDate >= DATEADD(DAY, -7, GETDATE())
      )
      SELECT TankCode AS tankCode, weight, level, temp, readingTime, ageSeconds
      FROM R WHERE rn = 1 ORDER BY TankCode`);
    const data = result.recordset.map((r) => ({ ...r, group: groupOf(r.tankCode) }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** 9 AM reading per tank per day + consumption vs the previous day's 9 AM reading. */
export const getDailyReport = async (req, res) => {
  const range = parseRange(req, res);
  if (!range) return;
  const { startDate, endDate } = range;
  if (dayDiff(startDate, endDate) > MAX_DAILY_RANGE_DAYS) {
    return badRequest(res, `Date range too large (max ${MAX_DAILY_RANGE_DAYS} days).`);
  }
  try {
    const result = await global.pool1.request()
      .input("start", sql.VarChar(10), startDate)
      .input("end", sql.VarChar(10), endDate)
      .query(`
        WITH R AS (
          SELECT TankCode,
                 CAST(CapDate AS DATE) AS d,
                 ROUND(TRY_CAST(WeightValue AS FLOAT), 2) AS weight,
                 ROUND(TRY_CAST(LevelValue  AS FLOAT), 2) AS level,
                 ROUND(TRY_CAST(TempValue   AS FLOAT), 2) AS temp,
                 CONVERT(VARCHAR(19), CapDate, 120)       AS readingTime,
                 ROW_NUMBER() OVER (
                   PARTITION BY TankCode, CAST(CapDate AS DATE)
                   ORDER BY ABS(DATEDIFF(SECOND, CapDate,
                            DATEADD(HOUR, 9, CAST(CAST(CapDate AS DATE) AS DATETIME))))
                 ) AS rn
          FROM ChemTankReadings
          WHERE CapDate >= DATEADD(DAY, -1, CAST(@start AS DATE))
            AND CapDate <  DATEADD(DAY,  1, CAST(@end   AS DATE))
            AND CAST(CapDate AS TIME) BETWEEN '06:00:00' AND '12:00:00'
        )
        SELECT TankCode AS tankCode, CONVERT(VARCHAR(10), d, 120) AS date,
               weight, level, temp, readingTime
        FROM R WHERE rn = 1 ORDER BY d, TankCode`);

    const byKey = new Map(result.recordset.map((r) => [`${r.tankCode}|${r.date}`, r]));
    const rows = [];
    for (const r of result.recordset) {
      if (r.date < startDate || r.date > endDate) continue;
      const prevDate = new Date(new Date(`${r.date}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      const prev = byKey.get(`${r.tankCode}|${prevDate}`);
      const delta = prev && prev.weight != null && r.weight != null ? round2(prev.weight - r.weight) : null;
      rows.push({
        ...r,
        group: groupOf(r.tankCode),
        consumption: delta != null && delta >= 0 ? delta : null,
        refilled: delta != null && delta < 0,
        change: delta != null ? -delta : null,
      });
    }

    const summary = {};
    for (const g of ["ISO", "POLY"]) {
      const gr = rows.filter((x) => x.group === g);
      const cons = gr.filter((x) => x.consumption != null);
      const total = cons.reduce((s, x) => s + x.consumption, 0);
      const days = new Set(cons.map((x) => x.date)).size;
      summary[g] = {
        totalConsumption: round2(total),
        avgDaily: days ? round2(total / days) : null,
        refillDays: new Set(gr.filter((x) => x.refilled).map((x) => x.date)).size,
      };
    }
    res.json({ success: true, data: { rows, summary } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Time-bucketed raw readings (avg per bucket) for the trend chart / data table. */
export const getReadings = async (req, res) => {
  const range = parseRange(req, res);
  if (!range) return;
  const { startDate, endDate } = range;
  const tank = String(req.query.tank || "").trim();
  const group = String(req.query.group || "").toUpperCase();

  const days = dayDiff(startDate, endDate) + 1;
  const tankCount = tank ? 1 : 4;
  const requested = Math.max(1, parseInt(req.query.intervalMinutes, 10) || 60);
  // Auto-coarsen so a wide range never returns more than MAX_POINTS rows.
  const needed = Math.ceil((days * 1440 * tankCount) / MAX_POINTS);
  const interval = Math.max(requested, needed);

  try {
    const request = global.pool1.request()
      .input("start", sql.VarChar(10), startDate)
      .input("end", sql.VarChar(10), endDate)
      .input("interval", sql.Int, interval);
    let tankFilter = "";
    if (tank) {
      request.input("tank", sql.NVarChar(50), tank);
      tankFilter = "AND TankCode = @tank";
    } else if (group === "ISO" || group === "POLY") {
      tankFilter = `AND TankCode LIKE '${group}%'`;
    }
    const result = await request.query(`
      SELECT TankCode AS tankCode,
             CONVERT(VARCHAR(19), DATEADD(MINUTE, (DATEDIFF(MINUTE, 0, CapDate) / @interval) * @interval, 0), 120) AS readingTime,
             ROUND(AVG(TRY_CAST(WeightValue AS FLOAT)), 2) AS weight,
             ROUND(AVG(TRY_CAST(LevelValue  AS FLOAT)), 2) AS level,
             ROUND(AVG(TRY_CAST(TempValue   AS FLOAT)), 2) AS temp,
             COUNT(*) AS samples
      FROM ChemTankReadings
      WHERE CapDate >= CAST(@start AS DATE)
        AND CapDate <  DATEADD(DAY, 1, CAST(@end AS DATE))
        ${tankFilter}
      GROUP BY TankCode, DATEDIFF(MINUTE, 0, CapDate) / @interval
      ORDER BY readingTime DESC, TankCode`);
    const data = result.recordset.map((r) => ({ ...r, group: groupOf(r.tankCode) }));
    res.json({ success: true, data, meta: { intervalMinutes: interval, requestedIntervalMinutes: requested } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
