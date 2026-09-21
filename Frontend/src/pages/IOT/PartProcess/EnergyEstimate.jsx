/**
 * EnergyEstimate.jsx — Part Process > Energy.
 * No energy meter is connected to the Part Process machines, so this is
 * calculated server-side from the production events (running time,
 * stops, changeovers), each part's component conversion, the quality log's
 * rejects, and the machine's power profile (Master Config > Machine Config).
 * See Backend/controllers/partProcess/energy.controller.js for the model.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import {
  Zap, Boxes, Gauge, Loader2, RefreshCw, Info, Search, Percent, Trash2, Repeat, X,
} from "lucide-react";
import ExportButton from "../../../components/ui/ExportButton";
import DateTimePicker from "../../../components/ui/DateTimePicker";
import { PART_PROCESS_API } from "../../../utils/factoryOsClient";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, Tooltip, Legend);

const PART_ROWS_SHOWN = 25;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Same filter rule as the Production Report: an event counts when its date +
// start time falls inside [Start, End). The production day runs 08:00 -> 08:00.
const at8 = (d) => `${ymd(d)} 08:00`;
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const QUICK = [
  { label: "Yesterday", range: () => [at8(dayOffset(-1)), at8(dayOffset(0))] },
  { label: "Today", range: () => [at8(dayOffset(0)), at8(dayOffset(1))] },
  { label: "Last 7 days", range: () => [at8(dayOffset(-6)), at8(dayOffset(1))] },
  { label: "Last 30 days", range: () => [at8(dayOffset(-29)), at8(dayOffset(1))] },
  {
    label: "This month",
    range: () => {
      const n = new Date();
      return [at8(new Date(n.getFullYear(), n.getMonth(), 1)), at8(dayOffset(1))];
    },
  },
  {
    label: "Last month",
    range: () => {
      const n = new Date();
      return [at8(new Date(n.getFullYear(), n.getMonth() - 1, 1)), at8(new Date(n.getFullYear(), n.getMonth(), 1))];
    },
  },
];

const fmt = (v, d = 1) => (v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));

const Kpi = ({ icon, label, value, unit, sub, accent }) => {
  const Icon = icon;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3" style={{ borderTopWidth: 3, borderTopColor: accent }}>
      <div className="p-2 rounded-lg" style={{ background: `${accent}18`, color: accent }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 leading-tight">
          {value}
          {unit && <span className="text-xs font-semibold text-slate-400 ml-1">{unit}</span>}
        </p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

const Card = ({ title, right, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{title}</span>
      {right}
    </div>
    {children}
  </div>
);

const Th = ({ children }) => (
  <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-center bg-slate-100 sticky top-0 z-10">{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-3 py-2 border-b border-slate-100 text-center ${className}`}>{children}</td>
);

const SUM_KEYS = ["runHours", "standbyHours", "parts", "components", "rejects", "goodComponents", "runKwh", "standbyKwh", "totalKwh"];

export default function EnergyEstimate() {
  const [[startTime, endTime], setRange] = useState(QUICK[3].range);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [partSearch, setPartSearch] = useState("");
  const [showAllParts, setShowAllParts] = useState(false);

  const load = useCallback(async (s, e) => {
    if (!s || !e || e <= s) {
      toast.error("End time must be after start time.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${PART_PROCESS_API}/energy-estimate`, {
        params: { startDateTime: s, endDateTime: e },
        withCredentials: true,
      });
      setResult(res.data?.data ?? null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load the energy data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(startTime, endTime);
    // Load once on open; later loads are triggered by Apply / quick ranges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyQuick = (q) => {
    const r = q.range();
    setRange(r);
    load(r[0], r[1]);
  };

  // One row per date (sums across machines when more than one reports).
  const byDate = useMemo(() => {
    const map = new Map();
    (result?.daily ?? []).forEach((d) => {
      const r = map.get(d.date) ?? { date: d.date, ...Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) };
      SUM_KEYS.forEach((k) => {
        r[k] += d[k];
      });
      map.set(d.date, r);
    });
    return [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, kwhPerComponent: r.components > 0 ? r.totalKwh / r.components : null }));
  }, [result]);

  const parts = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const rows = (result?.byPart ?? []).filter((p) => !q || p.partName.toLowerCase().includes(q) || String(p.sapCode).includes(q));
    return rows;
  }, [result, partSearch]);
  const visibleParts = showAllParts || partSearch ? parts : parts.slice(0, PART_ROWS_SHOWN);

  const t = result?.totals;
  const chartData = {
    labels: byDate.map((r) => r.date.slice(5)),
    datasets: [
      { type: "bar", label: "Running (kWh)", data: byDate.map((r) => +r.runKwh.toFixed(2)), backgroundColor: "#6366f1", borderRadius: 3, yAxisID: "y", stack: "kwh" },
      { type: "bar", label: "Standby (kWh)", data: byDate.map((r) => +r.standbyKwh.toFixed(2)), backgroundColor: "#f59e0b", borderRadius: 3, yAxisID: "y", stack: "kwh" },
      {
        type: "line", label: "kWh per component", data: byDate.map((r) => (r.kwhPerComponent == null ? null : +r.kwhPerComponent.toFixed(4))),
        borderColor: "#10b981", backgroundColor: "#10b981", borderWidth: 2, pointRadius: 2.5, tension: 0.3, spanGaps: true, yAxisID: "y2",
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 60, autoSkip: true } },
      y: { stacked: true, position: "left", title: { display: true, text: "kWh", font: { size: 11 } }, grid: { color: "#f1f5f9" } },
      y2: { position: "right", title: { display: true, text: "kWh / component", font: { size: 11 } }, grid: { display: false }, beginAtZero: true },
    },
  };

  const dailyExport = byDate.slice().reverse().map((r) => ({
    Date: r.date,
    "Machine strokes": r.parts,
    Components: r.components,
    Rejects: r.rejects,
    "Running (h)": +r.runHours.toFixed(2),
    "Standby (h)": +r.standbyHours.toFixed(2),
    "Running (kWh)": +r.runKwh.toFixed(2),
    "Standby (kWh)": +r.standbyKwh.toFixed(2),
    "Total (kWh)": +r.totalKwh.toFixed(2),
    "kWh per component": r.kwhPerComponent == null ? "" : +r.kwhPerComponent.toFixed(4),
  }));
  const partExport = (result?.byPart ?? []).map((p) => ({
    "SAP code": p.sapCode,
    Part: p.partName,
    "Machine strokes": p.strokes,
    Components: p.components,
    Rejects: p.rejects,
    "Good components": p.goodComponents,
    "Running (h)": p.runHours,
    "Avg cycle (s)": p.avgCycleSecs ?? "",
    "Running (kWh)": p.runKwh,
    "Standby share (kWh)": p.standbyKwh,
    "Total (kWh)": p.totalKwh,
    "kWh per component": p.kwhPerComponent ?? "",
    "kWh per good component": p.kwhPerGoodComponent ?? "",
    "kWh spent on rejects": p.rejectKwh,
  }));

  const sb = t?.standbyBreakdown;
  const standbyRows = t && [
    { label: "Short stops (< 10 min)", kwh: sb.shortStopsKwh, hours: sb.shortStopsHours },
    { label: "Idle (10 min or longer)", kwh: sb.idleKwh, hours: sb.idleHours },
    { label: "Scheduled breaks", kwh: sb.breaksKwh, hours: sb.breaksHours },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight flex items-center gap-2">
            Energy Consumption
          </h1>
          <p className="text-[11px] text-slate-400">Calculated from production events, component counts and machine power ratings </p>
        </div>
        <div className="flex items-center gap-2">
          {partExport.length > 0 && <ExportButton data={partExport} filename="Part_Process_Energy_By_Part" />}
          {dailyExport.length > 0 && <ExportButton data={dailyExport} filename="Part_Process_Energy_Daily" />}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[185px]">
            <DateTimePicker label="Start Time" name="startTime" value={startTime} onChange={(e) => setRange([e.target.value, endTime])} />
          </div>
          <div className="min-w-[185px]">
            <DateTimePicker label="End Time" name="endTime" value={endTime} onChange={(e) => setRange([startTime, e.target.value])} />
          </div>
          <button type="button" onClick={() => load(startTime, endTime)} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Apply
          </button>
          <div className="flex flex-wrap gap-2 ml-auto">
            {QUICK.map((q) => (
              <button key={q.label} type="button" onClick={() => applyQuick(q)} disabled={loading}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 transition">
                {q.label}
              </button>
            ))}
          </div>
        </div>


        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 py-10 flex flex-col items-center justify-center gap-1 text-blue-600 text-sm">
            <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Calculating…</span>
            <span className="text-[11px] text-slate-400">Long ranges (several months) can take up to ~15 seconds.</span>
          </div>
        )}

        {result && byDate.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-400">No production events in this date range.</div>
        )}

        {result && byDate.length > 0 && !loading && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi icon={Zap} label="Total energy" value={fmt(t.totalKwh, 0)} unit="kWh"
                sub={`${t.days} day${t.days === 1 ? "" : "s"} · avg ${fmt(t.totalKwh / Math.max(t.days, 1), 1)} kWh/day`} accent="#6366f1" />
              <Kpi icon={Boxes} label="Components made" value={fmt(t.components, 0)}
                sub={`${fmt(t.parts, 0)} strokes · ${fmt(t.rejects, 0)} rejected`} accent="#10b981" />
              <Kpi icon={Gauge} label="Per component" value={t.kwhPerComponent == null ? "—" : fmt(t.kwhPerComponent, 3)} unit="kWh"
                sub={t.kwhPerGoodComponent == null ? "" : `${fmt(t.kwhPerGoodComponent, 3)} per good component`} accent="#0ea5e9" />
              <Kpi icon={Percent} label="Machine utilisation" value={t.utilisationPct == null ? "—" : fmt(t.utilisationPct, 1)} unit="%"
                sub={`${fmt(t.runHours, 0)} h running of ${fmt(t.runHours + t.standbyHours, 0)} h powered on`} accent="#8b5cf6" />
              <Kpi icon={Trash2} label="Energy in rejects" value={fmt(t.rejectKwh, 1)} unit="kWh"
                sub={t.totalKwh > 0 ? `${fmt((t.rejectKwh / t.totalKwh) * 100, 2)}% of total` : ""} accent="#ef4444" />
              <Kpi icon={Repeat} label="Changeovers" value={fmt(t.changeovers.count, 0)}
                sub={`${fmt(t.changeovers.minutes, 0)} min · ~${fmt(t.changeovers.kwh, 1)} kWh standby`} accent="#f59e0b" />
            </div>

            <Card title="Daily energy & efficiency">
              <div className="p-4">
                <div className="relative h-72">
                  <Chart type="bar" data={chartData} options={chartOptions} />
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card title="Where the energy goes">
                <div className="p-4 space-y-3 text-xs">
                  {[
                    { label: "Running (making parts)", kwh: t.runKwh, hours: t.runHours, color: "#6366f1" },
                    ...standbyRows.map((r, i) => ({ ...r, color: ["#f59e0b", "#fb923c", "#fbbf24"][i] })),
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold text-slate-700">{r.label}</span>
                        <span className="text-slate-500">
                          <b className="text-slate-800">{fmt(r.kwh, 1)} kWh</b> · {fmt(r.hours, 1)} h
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${t.totalKwh > 0 ? (r.kwh / t.totalKwh) * 100 : 0}%`, background: r.color }} />
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-slate-400">Time with no events (machine offline or power cut) is not counted.</p>
                </div>
              </Card>

              <Card title="By shift">
                <div className="overflow-auto">
                  <table className="min-w-full text-xs border-separate border-spacing-0">
                    <thead>
                      <tr>{["Shift", "Components", "Running (h)", "Standby (h)", "Total (kWh)", "kWh / comp."].map((h) => <Th key={h}>{h}</Th>)}</tr>
                    </thead>
                    <tbody>
                      {result.byShift.map((s) => (
                        <tr key={`${s.shift}|${s.asset}`} className="hover:bg-blue-50/60 even:bg-slate-50/40">
                          <Td className="font-semibold text-slate-700">{s.shift}</Td>
                          <Td>{fmt(s.components, 0)}</Td>
                          <Td>{fmt(s.runHours, 1)}</Td>
                          <Td>{fmt(s.standbyHours, 1)}</Td>
                          <Td className="font-bold text-slate-900">{fmt(s.totalKwh, 1)}</Td>
                          <Td>{s.kwhPerComponent == null ? "—" : fmt(s.kwhPerComponent, 4)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <Card
              title={`Energy by part (${parts.length})`}
              right={
                <div className="relative w-60">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part or SAP code…"
                    className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  {partSearch && (
                    <button type="button" onClick={() => setPartSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              }
            >
              <div className="overflow-auto max-h-[460px]">
                <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {["SAP", "Part", "Strokes", "Components", "Rejects", "Running (h)", "Avg cycle (s)", "Running kWh", "Standby kWh*", "Total kWh", "kWh / comp.", "kWh / good comp.", "Share"].map((h) => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleParts.map((p) => (
                      <tr key={`${p.asset}|${p.sapCode}`} className="hover:bg-blue-50/60 even:bg-slate-50/40">
                        <Td className="font-mono text-slate-500">{p.sapCode}</Td>
                        <Td className="text-left max-w-[260px] truncate font-semibold text-slate-700"><span title={p.partName}>{p.partName}</span></Td>
                        <Td>{fmt(p.strokes, 0)}</Td>
                        <Td className="text-indigo-600 font-semibold">{fmt(p.components, 0)}</Td>
                        <Td className={p.rejects > 0 ? "text-red-500 font-semibold" : "text-slate-300"}>{fmt(p.rejects, 0)}</Td>
                        <Td>{fmt(p.runHours, 1)}</Td>
                        <Td>{p.avgCycleSecs == null ? "—" : fmt(p.avgCycleSecs, 1)}</Td>
                        <Td>{fmt(p.runKwh, 1)}</Td>
                        <Td>{fmt(p.standbyKwh, 1)}</Td>
                        <Td className="font-bold text-slate-900">{fmt(p.totalKwh, 1)}</Td>
                        <Td>{p.kwhPerComponent == null ? "—" : fmt(p.kwhPerComponent, 4)}</Td>
                        <Td>{p.kwhPerGoodComponent == null ? "—" : fmt(p.kwhPerGoodComponent, 4)}</Td>
                        <Td className="text-slate-500">{t.totalKwh > 0 ? `${fmt((p.totalKwh / t.totalKwh) * 100, 1)}%` : "—"}</Td>
                      </tr>
                    ))}
                    {visibleParts.length === 0 && (
                      <tr><td colSpan={13} className="py-10 text-center text-slate-400">No parts match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>* Standby energy is shared overhead, allocated to each part by its share of running time.</span>
                {!partSearch && parts.length > PART_ROWS_SHOWN && (
                  <button type="button" onClick={() => setShowAllParts((v) => !v)} className="font-semibold text-blue-600 hover:text-blue-800">
                    {showAllParts ? "Show top 25" : `Show all ${parts.length}`}
                  </button>
                )}
              </div>
            </Card>

            <Card title="Daily breakdown">
              <div className="overflow-auto max-h-[420px]">
                <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {["Date", "Components", "Rejects", "Running (h)", "Standby (h)", "Running (kWh)", "Standby (kWh)", "Total (kWh)", "kWh / comp."].map((h) => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {byDate.slice().reverse().map((r) => (
                      <tr key={r.date} className="hover:bg-blue-50/60 even:bg-slate-50/40">
                        <Td className="font-mono font-semibold text-slate-700">{r.date}</Td>
                        <Td className="text-indigo-600 font-semibold">{fmt(r.components, 0)}</Td>
                        <Td className={r.rejects > 0 ? "text-red-500 font-semibold" : "text-slate-300"}>{fmt(r.rejects, 0)}</Td>
                        <Td>{fmt(r.runHours, 2)}</Td>
                        <Td>{fmt(r.standbyHours, 2)}</Td>
                        <Td>{fmt(r.runKwh, 2)}</Td>
                        <Td>{fmt(r.standbyKwh, 2)}</Td>
                        <Td className="font-bold text-slate-900">{fmt(r.totalKwh, 2)}</Td>
                        <Td>{r.kwhPerComponent == null ? "—" : fmt(r.kwhPerComponent, 4)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
