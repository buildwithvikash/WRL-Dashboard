/**
 * Part Process — estimated energy, tied to actual production
 * (pool3 / PartProcessEvents + Machines + MaterialConfigs + PartProcessQualityLog + ShiftConfigs).
 *
 * There is no energy meter on these machines (PartProcessEvents.Energy is 0 on
 * every row — FactoryOS doesn't send it), so energy is ESTIMATED from the
 * production events with a power-by-state model:
 *
 *   Production events            -> running  x PowerRunKw
 *   Downtime / Shift Break       -> standby  x PowerStandbyKw
 *
 * Every recorded stop counts as standby: the machine only reports events while
 * it is connected and powered on. If it is offline or has a power cut there
 * are no events at all, so nothing is billed for that time.
 *
 * Defaults are the manufacturer's AMADA AE-NT figures (average 4.5 kW while
 * working, below 1 kW on standby, 5 kW at maximum); editable per machine in
 * Master Config > Machine Config. Never written into PartProcessEvents.Energy
 * — the FactoryOS sync overwrites that column.
 *
 * The production side reuses the same building blocks as the Production Report
 * (utils/productionLogic.js): program name -> SAP code -> MaterialConfigs
 * sheet/component conversion for the component count, detectChangeovers for
 * changeovers, and the Downtime/Idle split. Rejects come from the quality log.
 * Running energy is attributed to the part that was running; standby energy is
 * shared overhead, allocated to parts by their share of running time.
 */
import { queryWithRetry } from "./records.controller.js";
import {
  mapDbRecord,
  getMaterialByModel,
  componentQtyFromMachine,
  detectChangeovers,
  IDLE_THRESHOLD_MINS,
} from "../../utils/productionLogic.js";

export const DEFAULT_POWER = { runKw: 4.5, standbyKw: 0.8 };

const RECORD_SEP = "";
const UNIT_SEP = "";

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const dateKey = (d) => new Date(d).toISOString().slice(0, 10);
const toMins = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const MATERIAL_SELECT = `
  SELECT SapCode AS sapCode, PartName AS partName,
         NoOfSheet AS noOfSheet, ActualComponentsPerSheet AS actualComponentsPerSheet,
         PncLoadingUnloading AS pncLoadingUnloading, DefinedComponentCycleTime AS definedComponentCycleTime
  FROM MaterialConfigs WHERE Status = 1`;

const powerFor = (asset, machines) => {
  const a = String(asset || "").toLowerCase();
  const m = a ? machines.find((x) => x.MachineName?.toLowerCase().includes(a)) : null;
  const pick = (v, fallback) => (v === null || v === undefined ? fallback : Number(v));
  return {
    machineName: m?.MachineName ?? null,
    runKw: pick(m?.PowerRunKw, DEFAULT_POWER.runKw),
    standbyKw: pick(m?.PowerStandbyKw, DEFAULT_POWER.standbyKw),
    fromConfig: m?.PowerRunKw != null || m?.PowerStandbyKw != null,
  };
};

const newBucket = () => ({
  runSecs: 0, standbySecs: 0,
  shortStopSecs: 0, idleSecs: 0, breakSecs: 0,
  strokes: 0, components: 0, rejects: 0,
  runKwh: 0, standbyKwh: 0,
});

// "YYYY-MM-DD HH:mm" (or with a T) -> ISO "YYYY-MM-DDTHH:mm:00", or null if malformed.
const normDateTime = (v) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(String(v || "").trim());
  return m ? `${m[1]}T${m[2]}:${m[3]}:00` : null;
};

// ── GET /api/v1/part-process/energy-estimate ─────────────────────────────────
// Either an exact window  ?startDateTime=YYYY-MM-DD HH:mm&endDateTime=...  (same
// rule as the Production Report: an event counts when EventDate + StartTime
// falls in [start, end), so the two pages agree for the same filter), or plain
// whole calendar days  ?startDate=&endDate=.  Optional &shift=.
export const getEnergyEstimate = async (req, res) => {
  try {
    const { shift } = req.query;
    const startDT = normDateTime(req.query.startDateTime);
    const endDT = normDateTime(req.query.endDateTime);
    let { startDate, endDate } = req.query;

    if (startDT && endDT) {
      if (endDT <= startDT) {
        return res.status(400).json({ success: false, message: "End time must be after start time." });
      }
      // The calendar days that window touches (the last instant is end - 1 s).
      startDate = startDT.slice(0, 10);
      endDate = new Date(new Date(`${endDT}Z`).getTime() - 1000).toISOString().slice(0, 10);
    } else if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "startDateTime and endDateTime (or startDate and endDate) are required" });
    }
    const exact = Boolean(startDT && endDT);

    const inputs = (rq) => {
      rq.input("startDate", startDate).input("endDate", endDate).input("shift", shift || null);
      if (exact) rq.input("startDT", startDT).input("endDT", endDT);
      return rq;
    };
    const whereDate = `EventDate BETWEEN @startDate AND @endDate AND (@shift IS NULL OR ShiftName = @shift)`;
    const absStart = `DATEADD(SECOND, DATEDIFF(SECOND, 0, TRY_CAST(StartTime AS TIME)), CAST(EventDate AS DATETIME))`;
    const where = exact
      ? `${whereDate} AND ${absStart} >= CONVERT(DATETIME, @startDT, 126) AND ${absStart} < CONVERT(DATETIME, @endDT, 126)`
      : whereDate;
    // Unparseable Duration values (e.g. a negative "-1:09:52" from a clock
    // glitch) count as 0 seconds rather than failing the whole report.
    const secs = `ISNULL(DATEDIFF(SECOND, 0, TRY_CAST(Duration AS TIME)), 0)`;

    // Row-by-row transfer from the DB is slow (~0.5 ms/row: 79k raw events took
    // ~45 s), so the database sends compact aggregates instead:
    //   runR   - Production per (date, shift, asset, program), summed in SQL
    //   stopsR - Downtime / Shift Break events (a few thousand rows, kept
    //            per-event so each stop can be classed short / idle / break)
    //   coR    - one packed string per (date, shift, asset) holding that
    //            shift's completed Production events; only used to detect changeovers
    const [machinesR, materialsR, shiftsR, runR, stopsR, coR, qualityR] = await Promise.all([
      queryWithRetry(() => global.pool3.request().query(
        `SELECT MachineName, PowerRunKw, PowerStandbyKw FROM Machines WHERE Status = 1`,
      )),
      queryWithRetry(() => global.pool3.request().query(MATERIAL_SELECT)),
      queryWithRetry(() => global.pool3.request().query(
        `SELECT ShiftName, StartTime, BreakStart, BreakEnd FROM ShiftConfigs WHERE Status = 1`,
      )),
      queryWithRetry(() => inputs(global.pool3.request()).query(`
        SELECT EventDate, ShiftName, ISNULL(AssetName, '') AS AssetName, Barcode,
               SUM(${secs}) AS RunSecs,
               SUM(ISNULL(PartsQty, 0)) AS Strokes,
               SUM(CASE WHEN ${secs} > 0 AND PartsQty > 0 THEN 1 ELSE 0 END) AS Cycles,
               SUM(CASE WHEN ${secs} > 0 AND PartsQty > 0 THEN ${secs} ELSE 0 END) AS CycleSecs
        FROM PartProcessEvents
        WHERE Status = 1 AND EventType = 'Production' AND ${where}
        GROUP BY EventDate, ShiftName, AssetName, Barcode
      `)),
      queryWithRetry(() => inputs(global.pool3.request()).query(`
        SELECT EventDate, ShiftName, EventType, ISNULL(AssetName, '') AS AssetName, ${secs} AS Secs
        FROM PartProcessEvents
        WHERE Status = 1 AND EventType IN ('Downtime', 'Shift Break') AND ${where}
      `)),
      queryWithRetry(() => inputs(global.pool3.request()).query(`
        SELECT EventDate, ShiftName, ISNULL(AssetName, '') AS AssetName,
               CAST(STRING_AGG(CAST(CONCAT(StartTime, CHAR(31), ISNULL(EndTime, ''), CHAR(31), Barcode) AS NVARCHAR(MAX)), CHAR(30))
                 WITHIN GROUP (ORDER BY StartTime, EventId) AS NVARCHAR(MAX)) AS Packed
        FROM PartProcessEvents
        WHERE Status = 1 AND EventType = 'Production' AND PartsQty > 0 AND ${where}
        GROUP BY EventDate, ShiftName, AssetName
      `)),
      queryWithRetry(() => inputs(global.pool3.request()).query(`
        SELECT EventDate, SapCode, PartName, InspectedQty, RejectedQty
        FROM PartProcessQualityLog WHERE ${whereDate}
      `)),
    ]);

    const machines = machinesR.recordset;
    const materials = materialsR.recordset;
    const shiftCfg = new Map(shiftsR.recordset.map((s) => [
      s.ShiftName,
      {
        startMins: s.StartTime ? toMins(s.StartTime) : null,
        breakMins: s.BreakStart && s.BreakEnd ? { start: toMins(s.BreakStart), end: toMins(s.BreakEnd) } : null,
      },
    ]));

    const assumptions = new Map();
    const profile = (asset) => {
      if (!assumptions.has(asset)) assumptions.set(asset, powerFor(asset, machines));
      return assumptions.get(asset);
    };

    // Program name -> part (memoised: a few hundred distinct programs).
    const partCache = new Map();
    const resolvePart = (barcode) => {
      if (partCache.has(barcode)) return partCache.get(barcode);
      const mapped = mapDbRecord({ Barcode: barcode });
      const mat = getMaterialByModel(materials, mapped.model);
      const part = {
        sapCode: mat?.sapCode || mapped.sapCode || "UNMAPPED",
        partName: mat?.partName || mapped.model || "Unmapped program",
        mat,
      };
      partCache.set(barcode, part);
      return part;
    };

    const days = new Map(); // date|asset
    const shifts = new Map(); // shift label|asset
    const parts = new Map(); // asset|sap
    const asAsset = new Map(); // asset -> aggregate (allocation + totals)
    const dayBucket = (date, asset) => {
      const k = `${dateKey(date)}|${asset}`;
      if (!days.has(k)) days.set(k, { date: dateKey(date), asset, ...newBucket() });
      return days.get(k);
    };
    const shiftBucket = (label, asset) => {
      const k = `${label}|${asset}`;
      if (!shifts.has(k)) shifts.set(k, { shift: label, asset, ...newBucket() });
      return shifts.get(k);
    };
    const assetBucket = (asset) => {
      if (!asAsset.has(asset)) asAsset.set(asset, { asset, ...newBucket(), coMins: 0, coCount: 0, coOverrunMins: 0 });
      return asAsset.get(asset);
    };
    const partBucket = (asset, part) => {
      const k = `${asset}|${part.sapCode}`;
      if (!parts.has(k)) {
        parts.set(k, {
          asset, sapCode: part.sapCode, partName: part.partName,
          runSecs: 0, strokes: 0, components: 0, cycles: 0, cycleSecs: 0, rejects: 0,
        });
      }
      return parts.get(k);
    };

    // Production: already summed per (date, shift, asset, program) in SQL.
    for (const r of runR.recordset) {
      const asset = r.AssetName;
      profile(asset);
      const part = resolvePart(r.Barcode);
      const strokes = r.Strokes || 0;
      const comps = componentQtyFromMachine(strokes, part.mat);
      const dB = dayBucket(r.EventDate, asset);
      const sB = shiftBucket(r.ShiftName || "—", asset);
      const aB = assetBucket(asset);
      const pB = partBucket(asset, part);
      for (const b of [dB, aB, sB]) {
        b.runSecs += r.RunSecs || 0;
        b.strokes += strokes;
        b.components += comps;
      }
      pB.runSecs += r.RunSecs || 0;
      pB.strokes += strokes;
      pB.components += comps;
      pB.cycles += r.Cycles || 0;
      pB.cycleSecs += r.CycleSecs || 0;
    }

    // Stops: every recorded stop is standby (the machine is connected and on).
    for (const r of stopsR.recordset) {
      const asset = r.AssetName;
      profile(asset);
      const isBreak = r.EventType === "Shift Break";
      const dB = dayBucket(r.EventDate, asset);
      const aB = assetBucket(asset);
      const sB = shiftBucket(isBreak ? "Breaks" : r.ShiftName || "—", asset);
      for (const b of [dB, aB, sB]) {
        b.standbySecs += r.Secs;
        if (isBreak) b.breakSecs += r.Secs;
        else if (r.Secs / 60 >= IDLE_THRESHOLD_MINS) b.idleSecs += r.Secs;
        else b.shortStopSecs += r.Secs;
      }
    }

    // Changeovers: model switches within a shift (gaps under a minute ignored).
    for (const g of coR.recordset) {
      const records = String(g.Packed || "")
        .split(RECORD_SEP)
        .filter(Boolean)
        .map((item) => {
          const [startTime, endTime, barcode] = item.split(UNIT_SEP);
          return mapDbRecord({
            Barcode: barcode, StartTime: startTime, EndTime: endTime,
            ShiftName: g.ShiftName, EventType: "Production", PartsQty: 1,
          });
        });
      if (!records.length) continue;
      const cfg = shiftCfg.get(g.ShiftName);
      profile(g.AssetName);
      const cos = detectChangeovers(records, undefined, cfg?.startMins ?? null, cfg?.breakMins ?? null);
      const a = assetBucket(g.AssetName);
      for (const c of cos) {
        if (c.durationMins < 1) continue;
        a.coCount += 1;
        a.coMins += c.durationMins;
        a.coOverrunMins += c.overrunMins;
      }
    }

    // ── Energy per bucket ─────────────────────────────────────────────────
    const applyEnergy = (b, p) => {
      b.runKwh = (b.runSecs / 3600) * p.runKw;
      b.standbyKwh = (b.standbySecs / 3600) * p.standbyKw;
    };
    for (const b of days.values()) applyEnergy(b, profile(b.asset));
    for (const b of shifts.values()) applyEnergy(b, profile(b.asset));
    for (const b of asAsset.values()) applyEnergy(b, profile(b.asset));

    // ── Rejects (quality log, component units — same convention as the
    // Production Report): matched to produced parts by SAP code; capped at the
    // components actually produced.
    const partsBySap = new Map();
    for (const pb of parts.values()) {
      if (!partsBySap.has(pb.sapCode)) partsBySap.set(pb.sapCode, pb);
    }
    let unmatchedRejects = 0;
    for (const q of qualityR.recordset) {
      const target = partsBySap.get(String(q.SapCode || "").trim());
      const rej = q.RejectedQty || 0;
      if (!target) {
        unmatchedRejects += rej;
        continue;
      }
      const room = Math.max(0, target.components - target.rejects);
      const applied = Math.min(rej, room);
      target.rejects += applied;
      const d = days.get(`${dateKey(q.EventDate)}|${target.asset}`);
      if (d) d.rejects += applied;
    }
    for (const pb of parts.values()) assetBucket(pb.asset).rejects += pb.rejects;

    // ── Per-part energy: own running energy + share of the asset's standby.
    const byPart = [...parts.values()].map((pb) => {
      const p = profile(pb.asset);
      const a = assetBucket(pb.asset);
      const runKwh = (pb.runSecs / 3600) * p.runKw;
      const standbyShare = a.runSecs > 0 ? pb.runSecs / a.runSecs : 0;
      const standbyKwh = a.standbyKwh * standbyShare;
      const totalKwh = runKwh + standbyKwh;
      const good = Math.max(0, pb.components - pb.rejects);
      const kwhPerComponent = pb.components > 0 ? totalKwh / pb.components : null;
      return {
        asset: pb.asset,
        sapCode: pb.sapCode,
        partName: pb.partName,
        strokes: pb.strokes,
        components: pb.components,
        rejects: pb.rejects,
        goodComponents: good,
        runHours: round(pb.runSecs / 3600),
        avgCycleSecs: pb.cycles > 0 ? round(pb.cycleSecs / pb.cycles, 1) : null,
        runKwh: round(runKwh),
        standbyKwh: round(standbyKwh),
        totalKwh: round(totalKwh),
        kwhPerComponent: kwhPerComponent == null ? null : round(kwhPerComponent, 4),
        kwhPerGoodComponent: good > 0 ? round(totalKwh / good, 4) : null,
        rejectKwh: kwhPerComponent == null ? 0 : round(kwhPerComponent * pb.rejects),
      };
    }).sort((a, b) => b.totalKwh - a.totalKwh);

    // ── Rollups ─────────────────────────────────────────────────────────────
    const finish = (b) => {
      const total = b.runKwh + b.standbyKwh;
      const good = Math.max(0, b.components - b.rejects);
      const powered = b.runSecs + b.standbySecs;
      return {
        runHours: round(b.runSecs / 3600),
        standbyHours: round(b.standbySecs / 3600),
        parts: b.strokes,
        components: b.components,
        rejects: b.rejects,
        goodComponents: good,
        runKwh: round(b.runKwh),
        standbyKwh: round(b.standbyKwh),
        totalKwh: round(total),
        kwhPerComponent: b.components > 0 ? round(total / b.components, 4) : null,
        kwhPerGoodComponent: good > 0 ? round(total / good, 4) : null,
        utilisationPct: powered > 0 ? round((b.runSecs / powered) * 100, 1) : null,
      };
    };

    const daily = [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.asset.localeCompare(b.asset))
      .map((b) => ({ date: b.date, asset: b.asset, ...finish(b) }));
    const byShift = [...shifts.values()]
      .sort((a, b) => a.shift.localeCompare(b.shift))
      .map((b) => ({ shift: b.shift, asset: b.asset, ...finish(b) }));

    const all = { ...newBucket(), coMins: 0, coCount: 0, coOverrunMins: 0 };
    for (const a of asAsset.values()) {
      for (const k of Object.keys(newBucket())) all[k] += a[k];
      all.coMins += a.coMins;
      all.coCount += a.coCount;
      all.coOverrunMins += a.coOverrunMins;
    }
    const coKwh = [...asAsset.values()].reduce((s, a) => s + (a.coMins / 60) * profile(a.asset).standbyKw, 0);
    const wasteKwh = byPart.reduce((s, p) => s + p.rejectKwh, 0);
    const standbyKwhOf = (key) =>
      [...asAsset.values()].reduce((s, a) => s + (a[key] / 3600) * profile(a.asset).standbyKw, 0);

    res.json({
      success: true,
      data: {
        estimated: true,
        window: exact ? { startDateTime: startDT, endDateTime: endDT } : { startDate, endDate },
        assumptions: [...assumptions.entries()].map(([asset, p]) => ({ asset: asset || "Unknown", ...p })),
        totals: {
          ...finish(all),
          days: new Set(daily.map((d) => d.date)).size,
          changeovers: {
            count: all.coCount,
            minutes: round(all.coMins, 1),
            overrunMinutes: round(all.coOverrunMins, 1),
            kwh: round(coKwh),
          },
          standbyBreakdown: {
            shortStopsKwh: round(standbyKwhOf("shortStopSecs")),
            idleKwh: round(standbyKwhOf("idleSecs")),
            breaksKwh: round(standbyKwhOf("breakSecs")),
            shortStopsHours: round(all.shortStopSecs / 3600),
            idleHours: round(all.idleSecs / 3600),
            breaksHours: round(all.breakSecs / 3600),
          },
          rejectKwh: round(wasteKwh),
          unmatchedRejects,
        },
        daily,
        byShift,
        byPart,
      },
    });
  } catch (err) {
    console.error("[PartProcess] getEnergyEstimate:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
