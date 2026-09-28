import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ExportButton from "../../components/ui/ExportButton";
import DateTimePicker from "../../components/ui/DateTimePicker";
import { baseURL } from "../../assets/assets";
import {
  Gauge,
  Search,
  RotateCcw,
  Calendar,
  Filter,
  ChevronDown,
  X,
  AlertTriangle,
  PackageOpen,
  Loader2,
  CalendarRange,
  FileText,
  Activity,
} from "lucide-react";
import {
  getTodayRange,
  getYesterdayRange,
  getMTDRange,
  formatDateTimeLocal,
} from "../../utils/dateUtils";

const FILTER_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  thisMonth: "This Month",
  custom: "Custom Range",
};

const RESULT_OPTIONS = ["All", "PASS", "FAIL", "ERROR"];

const toAPIDateTime = (datetimeLocalValue) => {
  if (!datetimeLocalValue) return "";
  const dt = new Date(datetimeLocalValue);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

const Spinner = ({ cls = "w-4 h-4" }) => (
  <Loader2 className={`animate-spin ${cls}`} />
);

const EmptyState = ({ colSpan, onTodayClick }) => (
  <tr>
    <td colSpan={colSpan} className="py-16 text-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <PackageOpen className="w-10 h-10 opacity-20" strokeWidth={1.2} />
        <p className="text-xs font-semibold text-slate-500">No data available</p>
        <p className="text-xs">Use quick filters or set a custom date & time range</p>
        {onTodayClick && (
          <button
            onClick={onTodayClick}
            className="mt-1 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm shadow-blue-200 flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            Today's Data
          </button>
        )}
      </div>
    </td>
  </tr>
);

const ResultBadge = ({ result }) => {
  const styles = {
    PASS: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAIL: "bg-rose-50 text-rose-700 border-rose-200",
    ERROR: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-semibold text-xs border ${styles[result] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {result}
    </span>
  );
};

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : "—");

const VacuumReport = () => {
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [lineName, setLineName] = useState("");
  const [result, setResult] = useState("All");
  const [reportData, setReportData] = useState([]);
  const [activeFilter, setActiveFilter] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const getQuickFilterDates = (filterType) => {
    switch (filterType) {
      case "today": {
        const { startDate, endDate } = getTodayRange();
        return { start: formatDateTimeLocal(startDate), end: formatDateTimeLocal(endDate) };
      }
      case "yesterday": {
        const { startDate, endDate } = getYesterdayRange();
        return { start: formatDateTimeLocal(startDate), end: formatDateTimeLocal(endDate) };
      }
      case "thisMonth": {
        const { startDate, endDate } = getMTDRange();
        return { start: formatDateTimeLocal(startDate), end: formatDateTimeLocal(endDate) };
      }
      default:
        return null;
    }
  };

  const fetchDataWithDates = async (start, end, ln = lineName, res = result) => {
    if (!start || !end) {
      toast.error("Please select a date & time range.");
      return;
    }
    setLoading(true);
    try {
      const params = { startDate: toAPIDateTime(start), endDate: toAPIDateTime(end) };
      if (ln) params.lineName = ln;
      if (res && res !== "All") params.result = res;
      const res2 = await axios.get(`${baseURL}quality/vacuum-report`, { params });
      if (res2?.data?.success) setReportData(res2.data.data ?? []);
    } catch (error) {
      console.error("Failed to fetch Vacuum Report:", error);
      toast.error("Failed to fetch Vacuum Report.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFilter = (filterType) => {
    const dates = getQuickFilterDates(filterType);
    if (!dates) return;
    setStartTime(dates.start);
    setEndTime(dates.end);
    setActiveFilter(filterType);
    fetchDataWithDates(dates.start, dates.end);
  };

  useEffect(() => {
    handleQuickFilter("today");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuery = () => {
    if (!startTime || !endTime) {
      toast.error("Please select both start and end date/time.");
      return;
    }
    setActiveFilter("custom");
    fetchDataWithDates(startTime, endTime);
  };

  const handleClear = () => {
    setStartTime("");
    setEndTime("");
    setLineName("");
    setResult("All");
    setSearchTerm("");
    setReportData([]);
    setActiveFilter("");
    setSelectedTest(null);
    setTrendData([]);
  };

  const openTrend = async (row) => {
    setSelectedTest(row);
    setTrendLoading(true);
    setTrendData([]);
    try {
      const res = await axios.get(`${baseURL}quality/vacuum-report/${row.TestId}/trend`);
      if (res?.data?.success) {
        const startMs = new Date(row.StartTime).getTime();
        const pad = (n) => String(n).padStart(2, "0");
        setTrendData(
          (res.data.data ?? []).map((r) => {
            const elapsedSec = Math.max(0, Math.round((new Date(r.LogTime).getTime() - startMs) / 1000));
            const h = Math.floor(elapsedSec / 3600);
            const m = Math.floor((elapsedSec % 3600) / 60);
            const s = elapsedSec % 60;
            return {
              ...r,
              time: h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
            };
          }),
        );
      }
    } catch (error) {
      console.error("Failed to fetch vacuum trend:", error);
      toast.error("Failed to fetch vacuum trend.");
    } finally {
      setTrendLoading(false);
    }
  };

  const hasData = reportData.length > 0;

  const totals = useMemo(() => {
    const pass = reportData.filter((r) => r.FinalResult === "PASS").length;
    const fail = reportData.filter((r) => r.FinalResult === "FAIL").length;
    const error = reportData.filter((r) => r.FinalResult === "ERROR").length;
    return { pass, fail, error, total: reportData.length };
  }, [reportData]);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return reportData;
    return reportData.filter((r) =>
      [r.ModelName, r.SerialNo, r.LineName, r.FinalResult]
        .some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [reportData, searchTerm]);

  const exportData = useMemo(
    () =>
      filteredData.map((r) => ({
        "Start Time": fmtDate(r.StartTime),
        "End Time": fmtDate(r.EndTime),
        Line: r.LineName,
        Model: r.ModelName,
        "Serial No": r.SerialNo,
        "Gauge Id": r.GaugeId,
        "Duration (min)": r.DurationMinutes != null ? Number(r.DurationMinutes).toFixed(1) : "",
        "Upper Limit (mbar)": r.UpperLimit,
        Result: r.FinalResult,
      })),
    [filteredData],
  );

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* ── PAGE HEADER — sticky ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            Vacuum Report
          </h1>
          <p className="text-[11px] text-slate-400">
            Pirani gauge leak test — Quality Analytics
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeFilter && (
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
              <Filter className="w-3 h-3" />
              {FILTER_LABELS[activeFilter] || activeFilter}
            </span>
          )}

          <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 min-w-[70px]">
            <span className="text-xl font-bold font-mono text-emerald-700">{totals.pass}</span>
            <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wide">Pass</span>
          </div>
          <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-rose-50 border border-rose-100 min-w-[70px]">
            <span className="text-xl font-bold font-mono text-rose-700">{totals.fail}</span>
            <span className="text-[10px] text-rose-500 font-medium uppercase tracking-wide">Fail</span>
          </div>
          <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-amber-50 border border-amber-100 min-w-[70px]">
            <span className="text-xl font-bold font-mono text-amber-700">{totals.error}</span>
            <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">Error</span>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {/* ── FILTERS CARD ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="w-3 h-3 text-slate-400" />
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Filters</p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[170px] flex-1">
              <DateTimePicker
                label="Start Time"
                name="startTime"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); setActiveFilter("custom"); }}
              />
            </div>
            <div className="min-w-[170px] flex-1">
              <DateTimePicker
                label="End Time"
                name="endTime"
                value={endTime}
                onChange={(e) => { setEndTime(e.target.value); setActiveFilter("custom"); }}
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Result</label>
              <div className="relative">
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  className="w-full appearance-none px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-8"
                >
                  {RESULT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="min-w-[170px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Model, Serial No, Line…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pb-0.5 flex-wrap">
              <button
                onClick={handleQuery}
                disabled={loading || !startTime || !endTime}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading || !startTime || !endTime
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200"
                }`}
              >
                {loading ? <Spinner cls="w-4 h-4" /> : <Search className="w-4 h-4" />}
                {loading ? "Loading…" : "Query"}
              </button>

              <button
                onClick={() => handleQuickFilter("yesterday")}
                disabled={loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "yesterday" ? "bg-amber-500 text-white shadow-sm ring-2 ring-offset-1 ring-amber-300" : "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                }`}
              >
                Yesterday
              </button>

              <button
                onClick={() => handleQuickFilter("today")}
                disabled={loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "today" ? "bg-emerald-600 text-white shadow-sm ring-2 ring-offset-1 ring-emerald-300" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                }`}
              >
                Today
              </button>

              <button
                onClick={() => handleQuickFilter("thisMonth")}
                disabled={loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "thisMonth" ? "bg-indigo-600 text-white shadow-sm ring-2 ring-offset-1 ring-indigo-300" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                }`}
              >
                MTD
              </button>

              <button
                onClick={handleClear}
                title="Clear All"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {hasData && <ExportButton data={exportData} filename="Vacuum_Report" />}
            </div>
          </div>
        </div>

        {/* ── LOADING STATE ── */}
        {loading && (
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center gap-3">
            <Spinner cls="w-5 h-5 text-blue-600" />
            <p className="text-sm text-slate-400">Fetching Vacuum records…</p>
          </div>
        )}

        {/* ── Trend panel — shown above the table once a row is selected ── */}
        {selectedTest && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Activity size={14} className="text-blue-500" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Vacuum Trend — {selectedTest.SerialNo}
              </span>
              <span className="text-[11px] text-slate-400">
                {selectedTest.ModelName} · {selectedTest.LineName}
              </span>
              <button onClick={() => setSelectedTest(null)} className="ml-auto p-1 rounded hover:bg-slate-100">
                <X size={14} className="text-slate-400" />
              </button>
            </div>
            <div className="p-4 h-[280px]">
              {trendLoading ? (
                <div className="h-full flex items-center justify-center gap-2 text-slate-400 text-sm">
                  <Spinner /> Loading trend…
                </div>
              ) : trendData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">No readings for this test.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      label={{ value: "Elapsed (mm:ss)", position: "insideBottom", offset: -2, fontSize: 10, fill: "#94a3b8" }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }} formatter={(v) => [`${v} mbar`, "Vacuum"]} />
                    {selectedTest.UpperLimit != null && (
                      <ReferenceLine y={selectedTest.UpperLimit} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Upper Limit", fontSize: 10, fill: "#ef4444", position: "insideTopRight" }} />
                    )}
                    <Line type="monotone" dataKey="Vacuum" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── DATA TABLE ── */}
        {!loading && hasData && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Vacuum Test Records</span>
                {activeFilter && (
                  <span className="ml-1 px-2 py-0.5 bg-slate-800 text-white text-[11px] font-semibold rounded-full flex items-center gap-1">
                    <CalendarRange className="w-2.5 h-2.5 text-amber-400" />
                    {FILTER_LABELS[activeFilter]}
                  </span>
                )}
                <span className="ml-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full border border-blue-100">
                  {searchTerm ? `${filteredData.length} of ${totals.total.toLocaleString()}` : totals.total.toLocaleString()} records
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Click a row to see its vacuum-vs-time trend</p>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    {["Start Time", "Line", "Model", "Serial No", "Gauge", "Duration (min)", "Upper Limit", "Result"].map((label) => (
                      <th key={label} className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item) => (
                    <tr
                      key={item.TestId}
                      onClick={() => openTrend(item)}
                      className={`hover:bg-blue-50/60 transition-colors even:bg-slate-50/40 cursor-pointer ${selectedTest?.TestId === item.TestId ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-700 font-semibold font-mono">
                        {fmtDate(item.StartTime)}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-600">
                        {item.LineName}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap font-semibold text-slate-700">
                        {item.ModelName}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap font-mono text-slate-600">
                        {item.SerialNo}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-500">
                        {item.GaugeId}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-600">
                        {item.DurationMinutes != null ? Number(item.DurationMinutes).toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-500">
                        {item.UpperLimit ?? "—"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        <ResultBadge result={item.FinalResult} />
                      </td>
                    </tr>
                  ))}

                  {filteredData.length === 0 && (
                    <EmptyState colSpan={8} onTodayClick={() => handleQuickFilter("today")} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Empty: no filters set ── */}
        {!loading && !hasData && !activeFilter && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 shadow-sm flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
              <Gauge className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-600">Select a Date Range</h3>
            <p className="text-xs text-slate-400 max-w-sm text-center">
              Use the quick select or set a custom date & time range to load Vacuum report data.
            </p>
          </div>
        )}

        {/* ── Empty: filters applied, no results ── */}
        {!loading && !hasData && activeFilter && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 text-slate-300" strokeWidth={1.2} />
            <h3 className="text-sm font-semibold text-slate-600">No Records Found</h3>
            <p className="text-xs text-slate-400 max-w-sm text-center">
              No vacuum test records matched the selected date range. Try adjusting your filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VacuumReport;
