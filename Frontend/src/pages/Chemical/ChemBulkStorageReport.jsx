import { useMemo, useState } from "react";
import { FiSearch, FiDroplet } from "react-icons/fi";
import { TbFilterOff } from "react-icons/tb";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import ExportButton from "../../components/ui/ExportButton";
import InputField from "../../components/ui/InputField";
import {
  useGetChemCurrentLevelsQuery,
  useGetChemDailyReportQuery,
} from "../../redux/api/chemicalApi";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const defaults = () => ({ startDate: daysAgo(6), endDate: ymd(new Date()) });
const fmt = (v, dp = 1) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: dp }));

const Spinner = ({ size = 16 }) => (
  <AiOutlineLoading3Quarters size={size} className="animate-spin inline-block" />
);

const StatCard = ({ label, value, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-500 [&_span]:text-blue-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-500 [&_span]:text-indigo-700",
    amber: "bg-amber-50 border-amber-200 text-amber-500 [&_span]:text-amber-700",
  };
  return (
    <div className={`flex flex-col gap-0.5 px-5 py-3 rounded-xl border ${colors[color]}`}>
      <p className="text-[10px] uppercase tracking-widest font-semibold">{label}</p>
      <span className="text-2xl font-black tabular-nums">{value ?? "—"}</span>
    </div>
  );
};

const GROUPS = [
  { key: "ISO", title: "Isocyanate Chemical Data" },
  { key: "POLY", title: "Raw Polyol Chemical Data" },
];
const HEADERS = ["Date", "Tank", "Reading Time", "Weight (kg)", "Level (mm)", "Temp (°C)", "Consumption (kg)"];

const ChemBulkStorageReport = () => {
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const current = useGetChemCurrentLevelsQuery(undefined, { pollingInterval: 30000 });
  const daily = useGetChemDailyReportQuery(applied);

  const rows = useMemo(() => daily.data?.rows ?? [], [daily.data]);
  const summary = daily.data?.summary ?? {};
  const loading = daily.isFetching;

  const handleChange = (e) => setDraft((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleQuery = () => { setApplied(draft); daily.refetch(); };
  const handleClear = () => { const d = defaults(); setDraft(d); setApplied(d); };

  const exportData = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.date.localeCompare(a.date) || a.tankCode.localeCompare(b.tankCode))
        .map((r) => ({
          Date: r.date,
          Tank: r.tankCode,
          "Reading Time": r.readingTime,
          "Weight @ 9 AM (kg)": r.weight,
          "Level @ 9 AM (mm)": r.level,
          "Temp @ 9 AM (°C)": r.temp,
          "Consumption (kg)": r.consumption ?? "",
          Note: r.refilled ? "Refilled" : "",
        })),
    [rows],
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3 shadow-sm shrink-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600">
          <FiDroplet size={20} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-800 leading-none">
            Bulk Storage Report
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Daily 9 AM tank readings and chemical consumption
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatCard label="Isocyanate Used (kg)" value={fmt(summary.ISO?.totalConsumption, 0)} color="amber" />
          <StatCard label="Polyol Used (kg)" value={fmt(summary.POLY?.totalConsumption, 0)} color="blue" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 flex flex-col gap-4">
        {/* ── Filter Bar ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <InputField label="From Date" type="date" name="startDate" value={draft.startDate} onChange={handleChange} />
            </div>
            <div className="min-w-[180px]">
              <InputField label="To Date" type="date" name="endDate" value={draft.endDate} onChange={handleChange} />
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
            {exportData.length > 0 && <ExportButton data={exportData} filename="Chemical_Bulk_Storage_Report" />}
          </div>
        </div>

        {/* ── Live tank levels ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          {(current.data ?? []).map((t) => (
            <div key={t.tankCode} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">{t.tankCode}</p>
              <p className="text-2xl font-black tabular-nums text-slate-800">
                {fmt(t.weight, 0)} <span className="text-xs font-semibold text-slate-400">kg</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">Level {fmt(t.level, 0)} mm · {fmt(t.temp)} °C</p>
              <p className={`text-[10px] font-mono mt-1 ${t.ageSeconds > 300 ? "text-red-500" : "text-slate-400"}`}>
                {t.readingTime}{t.ageSeconds > 300 ? " (stale)" : ""}
              </p>
            </div>
          ))}
        </div>

        {daily.isError && (
          <div className="text-sm text-red-500">{daily.error?.data?.message || "Failed to load report."}</div>
        )}

        {/* ── Result tables ── */}
        {GROUPS.map((g) => {
          const gr = rows
            .filter((r) => r.group === g.key)
            .sort((a, b) => b.date.localeCompare(a.date) || a.tankCode.localeCompare(b.tankCode));
          return (
            <div key={g.key} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
                <FiDroplet size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{g.title}</span>
                <span className="ml-auto text-[11px] text-slate-400">
                  Avg / day: <b className="text-slate-600">{fmt(summary[g.key]?.avgDaily, 0)} kg</b>
                  <span className="mx-2">·</span>
                  Refill days: <b className="text-slate-600">{summary[g.key]?.refillDays ?? 0}</b>
                </span>
              </div>
              <div className="overflow-auto max-h-[420px]">
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
                    {gr.map((r) => (
                      <tr key={`${r.tankCode}${r.date}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.tankCode}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{r.readingTime}</td>
                        <td className="px-3 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmt(r.weight, 2)}</td>
                        <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmt(r.level, 2)}</td>
                        <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmt(r.temp, 2)}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {r.refilled ? (
                            <span className="text-emerald-600 font-semibold">Refilled (+{fmt(r.change, 0)})</span>
                          ) : (
                            <span className="font-semibold text-slate-700">{fmt(r.consumption, 2)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!loading && gr.length === 0 && (
                      <tr>
                        <td colSpan={HEADERS.length} className="py-12 text-center">
                          <FiDroplet size={32} className="mx-auto mb-2 text-slate-200" />
                          <p className="text-sm font-semibold text-slate-300">No records found</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {loading && (
                  <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-sm">
                    <Spinner /> Loading records…
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400 shrink-0">
          Consumption = previous day's 9 AM weight − this day's 9 AM weight. Days where the weight rose are shown as refills and excluded from totals.
        </p>
      </div>
    </div>
  );
};

export default ChemBulkStorageReport;
