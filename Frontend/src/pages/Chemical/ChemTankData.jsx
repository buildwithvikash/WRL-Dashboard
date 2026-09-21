import { useMemo, useState } from "react";
import { FiSearch, FiDatabase } from "react-icons/fi";
import { TbFilterOff } from "react-icons/tb";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, LineController, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import ExportButton from "../../components/ui/ExportButton";
import InputField from "../../components/ui/InputField";
import SelectField from "../../components/ui/SelectField";
import { useGetChemReadingsQuery } from "../../redux/api/chemicalApi";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, LineController, Tooltip, Legend);

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const defaults = () => ({ startDate: daysAgo(2), endDate: ymd(new Date()), tank: "", intervalMinutes: "60" });
const fmt = (v, dp = 2) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: dp }));

const Spinner = ({ size = 16 }) => (
  <AiOutlineLoading3Quarters size={size} className="animate-spin inline-block" />
);

const StatCard = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 px-5 py-3 rounded-xl border bg-indigo-50 border-indigo-200 text-indigo-500 [&_span]:text-indigo-700">
    <p className="text-[10px] uppercase tracking-widest font-semibold">{label}</p>
    <span className="text-2xl font-black tabular-nums">{value ?? "—"}</span>
  </div>
);

const TANKS = ["ISO Tank - 1", "ISO Tank - 2", "Poly Tank - 1", "Poly Tank - 2"];
const COLORS = ["#d97706", "#b45309", "#0284c7", "#0369a1"];
const TANK_OPTIONS = [{ label: "All tanks", value: "" }, ...TANKS.map((t) => ({ label: t, value: t }))];
const INTERVAL_OPTIONS = [
  { label: "10 min", value: "10" }, { label: "30 min", value: "30" }, { label: "1 hour", value: "60" },
  { label: "6 hours", value: "360" }, { label: "1 day", value: "1440" },
];
const METRICS = [
  { key: "weight", label: "Weight (kg)" },
  { key: "level", label: "Level (mm)" },
  { key: "temp", label: "Temperature (°C)" },
];
const HEADERS = ["Time", "Tank", "Weight (kg)", "Level (mm)", "Temp (°C)", "Samples"];
const PAGE = 200;

const ChemTankData = () => {
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [metric, setMetric] = useState("weight");
  const [shown, setShown] = useState(PAGE);

  const { data, isFetching: loading, isError, error, refetch } = useGetChemReadingsQuery({
    ...applied,
    tank: applied.tank || undefined,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const meta = data?.meta ?? {};

  const handleChange = (e) => setDraft((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleQuery = () => { setShown(PAGE); setApplied(draft); refetch(); };
  const handleClear = () => { const d = defaults(); setShown(PAGE); setDraft(d); setApplied(d); };

  const chart = useMemo(() => {
    const times = [...new Set(rows.map((r) => r.readingTime))].sort();
    const tanks = applied.tank ? [applied.tank] : TANKS;
    const lookup = new Map(rows.map((r) => [`${r.tankCode}|${r.readingTime}`, r[metric]]));
    return {
      labels: times.map((t) => t.slice(5, 16)),
      datasets: tanks.map((t) => ({
        label: t,
        data: times.map((x) => lookup.get(`${t}|${x}`) ?? null),
        borderColor: COLORS[TANKS.indexOf(t)],
        backgroundColor: COLORS[TANKS.indexOf(t)],
        borderWidth: 1.5,
        pointRadius: times.length > 300 ? 0 : 2,
        spanGaps: true,
      })),
    };
  }, [rows, metric, applied.tank]);

  const exportData = useMemo(
    () => rows.map((r) => ({
      Time: r.readingTime, Tank: r.tankCode, "Weight (kg)": r.weight, "Level (mm)": r.level, "Temp (°C)": r.temp, Samples: r.samples,
    })),
    [rows],
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3 shadow-sm shrink-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600">
          <FiDatabase size={20} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-800 leading-none">Tank Data</h1>
          <p className="text-xs text-slate-400 mt-0.5">Weight, level and temperature readings per tank</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {rows.length > 0 && <StatCard label="Records" value={rows.length.toLocaleString()} />}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 flex flex-col gap-4">
        {/* ── Filter Bar ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[170px]">
              <InputField label="From Date" type="date" name="startDate" value={draft.startDate} onChange={handleChange} />
            </div>
            <div className="min-w-[170px]">
              <InputField label="To Date" type="date" name="endDate" value={draft.endDate} onChange={handleChange} />
            </div>
            <div className="min-w-[170px]">
              <SelectField label="Tank" name="tank" options={TANK_OPTIONS} value={draft.tank} onChange={handleChange} placeholder="All tanks" />
            </div>
            <div className="min-w-[150px]">
              <SelectField label="Interval" name="intervalMinutes" options={INTERVAL_OPTIONS} value={draft.intervalMinutes} onChange={handleChange} />
            </div>
            <button
              onClick={handleQuery}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-sm font-bold transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? <Spinner size={14} /> : <FiSearch size={14} />}
              Query
            </button>
            <button
              onClick={handleClear}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TbFilterOff size={14} /> Clear Filter
            </button>
            {exportData.length > 0 && <ExportButton data={exportData} filename="Chemical_Tank_Data" />}
          </div>
          {isError && <p className="text-xs text-red-500 mt-3">{error?.data?.message || "Failed to load readings."}</p>}
          {meta.intervalMinutes > meta.requestedIntervalMinutes && (
            <p className="text-xs text-amber-600 mt-3">
              Range is large — readings are averaged every {meta.intervalMinutes} min. Narrow the dates for finer detail.
            </p>
          )}
        </div>

        {/* ── Trend chart ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <FiDatabase size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Trend</span>
            <div className="ml-auto flex gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                    metric === m.key
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[300px] p-4">
            <Line
              data={chart}
              options={{
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { position: "bottom" } },
                scales: { x: { ticks: { maxTicksLimit: 12 } } },
              }}
            />
          </div>
        </div>

        {/* ── Results Table ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
            <FiDatabase size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Tank Readings</span>
            <span className="ml-auto text-[11px] text-slate-400">
              Averaged per {meta.intervalMinutes ?? applied.intervalMinutes} min
            </span>
          </div>
          <div className="overflow-auto max-h-[480px]">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white border-b border-slate-100">
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r) => (
                  <tr key={`${r.tankCode}${r.readingTime}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{r.readingTime}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{r.tankCode}</td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmt(r.weight)}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmt(r.level)}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmt(r.temp)}</td>
                    <td className="px-3 py-2 text-slate-400 tabular-nums whitespace-nowrap">{r.samples}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={HEADERS.length} className="py-16 text-center">
                      <FiDatabase size={36} className="mx-auto mb-3 text-slate-200" />
                      <p className="text-sm font-semibold text-slate-300">No records found</p>
                      <p className="text-xs text-slate-300 mt-1">Pick a date range and click Query</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                <Spinner /> Loading records…
              </div>
            )}
          </div>
          {rows.length > shown && (
            <div className="p-3 text-center border-t border-slate-100">
              <button onClick={() => setShown((s) => s + PAGE)} className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer">
                Show more ({(rows.length - shown).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChemTankData;
