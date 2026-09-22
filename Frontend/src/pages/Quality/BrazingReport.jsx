import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import ExportButton from "../../components/ui/ExportButton";
import DateTimePicker from "../../components/ui/DateTimePicker";
import { baseURL } from "../../assets/assets";
import {
  Flame,
  Search,
  RotateCcw,
  Calendar,
  Filter,
  User,
  MapPin,
  Link2,
  AlertTriangle,
  PackageOpen,
  Loader2,
  CalendarRange,
  FileText,
  List,
  BarChart3,
  Table2,
  ChevronDown,
  Zap,
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

const GROUP_OPTIONS = [
  { label: "Station", value: "Station" },
  { label: "Brazer", value: "Brazer_Name" },
  { label: "Line", value: "Line" },
  { label: "Joint Name", value: "Joint_Name" },
  { label: "Joint Description", value: "Joint_Description" },
  { label: "Date", value: "Date" },
  { label: "Month", value: "Month" },
];

const LINE_OPTIONS = [
  { label: "All Lines", value: "all" },
  { label: "Freezer Brazing", value: "freezer" },
  { label: "SUS Brazing", value: "sus" },
  { label: "VISI Brazing", value: "visi" },
];

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
        <p className="text-xs font-semibold text-slate-500">
          No data available
        </p>
        <p className="text-xs">
          Use quick filters or set a custom date & time range
        </p>
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

const LeakageBadge = ({ count }) => {
  const isClean = !count;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-semibold text-xs ${
        isClean
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-rose-50 text-rose-700 border border-rose-200"
      }`}
    >
      {count}
    </span>
  );
};

const GroupSummaryTable = ({ grouped, groupLabel, totalJoints }) => {
  if (!grouped || grouped.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-16">
        <PackageOpen className="w-10 h-10 opacity-20" strokeWidth={1.2} />
        <p className="text-xs font-semibold text-slate-500">No data to group</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="min-w-full text-xs text-left border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100">
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-center whitespace-nowrap w-12">
              Sr. No.
            </th>
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-left whitespace-nowrap">
              {groupLabel}
            </th>
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-center whitespace-nowrap">
              Records
            </th>
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-center whitespace-nowrap">
              Total Joint Brazed
            </th>
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-center whitespace-nowrap">
              Leakage Count
            </th>
            <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 text-center whitespace-nowrap">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((item, i) => {
            const pct = totalJoints ? Math.round((item.joints / totalJoints) * 100) : 0;
            return (
              <tr key={item.key} className="hover:bg-blue-50/60 transition-colors even:bg-slate-50/40">
                <td className="px-3 py-2.5 border-b border-slate-100 text-center font-bold text-blue-600">
                  {i + 1}
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-20 shrink-0">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          i === 0 ? "bg-blue-500" : i === 1 ? "bg-violet-500" : "bg-slate-400"
                        }`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-700 font-medium truncate max-w-[220px]" title={item.key}>
                      {item.key}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 text-center font-semibold text-slate-600">
                  {item.records}
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 text-center font-bold text-slate-900">
                  {item.joints}
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                  <LeakageBadge count={item.leakage} />
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                    {pct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const BrazingReport = () => {
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reportData, setReportData] = useState([]);
  const [activeFilter, setActiveFilter] = useState("");
  const [activeTab, setActiveTab] = useState("table");
  const [groupBy, setGroupBy] = useState(GROUP_OPTIONS[0]);
  const [line, setLine] = useState("all");

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

  const fetchDataWithDates = async (start, end, selectedLine = line) => {
    if (!start || !end) {
      toast.error("Please select a date & time range.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${baseURL}quality/brazing-report`, {
        params: { startDate: toAPIDateTime(start), endDate: toAPIDateTime(end), line: selectedLine },
      });
      if (res?.data?.success) {
        setReportData(res.data.data ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch Brazing Report:", error);
      toast.error("Failed to fetch Brazing Report.");
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
    setReportData([]);
    setActiveFilter("");
  };

  const handleLineChange = (nextLine) => {
    setLine(nextLine);
    if (startTime && endTime) fetchDataWithDates(startTime, endTime, nextLine);
  };

  const hasData = reportData.length > 0;

  const totals = useMemo(() => {
    const totalJoints = reportData.reduce((a, r) => a + (r.Total_Joint_Brazed || 0), 0);
    const totalLeaks = reportData.reduce((a, r) => a + (r.Leakage_Count || 0), 0);
    const brazers = new Set(reportData.map((r) => r.Brazer_Name)).size;
    return { totalJoints, totalLeaks, brazers };
  }, [reportData]);

  const groupedData = useMemo(() => {
    if (!reportData.length) return [];
    const map = reportData.reduce((acc, item) => {
      const key = item[groupBy.value] || "Unknown";
      if (!acc[key]) acc[key] = { key, records: 0, joints: 0, leakage: 0 };
      acc[key].records += 1;
      acc[key].joints += item.Total_Joint_Brazed || 0;
      acc[key].leakage += item.Leakage_Count || 0;
      return acc;
    }, {});
    return Object.values(map).sort((a, b) => b.joints - a.joints);
  }, [reportData, groupBy]);

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* ── PAGE HEADER — sticky ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            Brazing Report
          </h1>
          <p className="text-[11px] text-slate-400">
            Brazer-wise joint count and leakage — Quality Analytics
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeFilter && (
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
              <Filter className="w-3 h-3" />
              {FILTER_LABELS[activeFilter] || activeFilter}
            </span>
          )}

          <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-rose-50 border border-rose-100 min-w-[80px]">
            <span className="text-xl font-bold font-mono text-rose-700">
              {totals.totalLeaks.toLocaleString()}
            </span>
            <span className="text-[10px] text-rose-500 font-medium uppercase tracking-wide">
              Leakages
            </span>
          </div>

          <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-blue-50 border border-blue-100 min-w-[80px]">
            <span className="text-xl font-bold font-mono text-blue-700">
              {totals.totalJoints.toLocaleString()}
            </span>
            <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">
              Joints
            </span>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {/* ── FILTERS CARD ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="w-3 h-3 text-slate-400" />
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Filters
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[170px] flex-1">
              <DateTimePicker
                label="Start Time"
                name="startTime"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setActiveFilter("custom");
                }}
              />
            </div>
            <div className="min-w-[170px] flex-1">
              <DateTimePicker
                label="End Time"
                name="endTime"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setActiveFilter("custom");
                }}
              />
            </div>

            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Line
              </label>
              <div className="relative">
                <select
                  value={line}
                  onChange={(e) => handleLineChange(e.target.value)}
                  disabled={loading}
                  className="w-full appearance-none px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-8 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {LINE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
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
                  loading
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "yesterday"
                      ? "bg-amber-500 text-white shadow-sm ring-2 ring-offset-1 ring-amber-300"
                      : "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                }`}
              >
                Yesterday
              </button>

              <button
                onClick={() => handleQuickFilter("today")}
                disabled={loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "today"
                      ? "bg-emerald-600 text-white shadow-sm ring-2 ring-offset-1 ring-emerald-300"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                }`}
              >
                Today
              </button>

              <button
                onClick={() => handleQuickFilter("thisMonth")}
                disabled={loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loading
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeFilter === "thisMonth"
                      ? "bg-indigo-600 text-white shadow-sm ring-2 ring-offset-1 ring-indigo-300"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
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

              {hasData && <ExportButton data={reportData} filename="Brazing_Report" />}
            </div>

            {startTime && endTime && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 w-fit">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] text-slate-400">Range:</span>
                <span className="text-[11px] font-semibold text-slate-700">
                  {new Date(startTime).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="text-[11px] text-slate-400">→</span>
                <span className="text-[11px] font-semibold text-slate-700">
                  {new Date(endTime).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── LOADING STATE ── */}
        {loading && (
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center gap-3">
            <Spinner cls="w-5 h-5 text-blue-600" />
            <p className="text-sm text-slate-400">Fetching Brazing records…</p>
          </div>
        )}

        {/* ── Tab Bar ── */}
        {!loading && hasData && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5 flex items-center gap-1 shrink-0 w-fit">
            <button
              onClick={() => setActiveTab("table")}
              className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "table"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <List className="w-3.5 h-3.5" /> Detail View
            </button>
            <button
              onClick={() => setActiveTab("summary")}
              className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "summary"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Group Summary
            </button>
            <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full border border-blue-100">
              {reportData.length} rows
            </span>
          </div>
        )}

        {/* ── DATA TABLE ── */}
        {!loading && hasData && activeTab === "table" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Brazer / Joint Summary
                </span>
                {activeFilter && (
                  <span className="ml-1 px-2 py-0.5 bg-slate-800 text-white text-[11px] font-semibold rounded-full flex items-center gap-1">
                    <CalendarRange className="w-2.5 h-2.5 text-amber-400" />
                    {FILTER_LABELS[activeFilter]}
                  </span>
                )}
                <span className="ml-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full border border-blue-100">
                  {reportData.length.toLocaleString()} rows
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                <span className="font-semibold text-slate-600">{totals.brazers}</span> brazers
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    {[
                      { icon: Calendar, label: "Date" },
                      { icon: Zap, label: "Line" },
                      { icon: MapPin, label: "Station" },
                      { icon: User, label: "Brazer" },
                      { icon: Link2, label: "Joint" },
                      { icon: FileText, label: "Joint Description" },
                      { icon: AlertTriangle, label: "Leakage Count" },
                      { icon: Flame, label: "Total Joint Brazed" },
                    ].map((col) => {
                      const Icon = col.icon;
                      return (
                        <th
                          key={col.label}
                          className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap"
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon className="w-3 h-3 opacity-50" />
                            {col.label}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((item, index) => (
                    <tr
                      key={`${item.Date}-${item.Station}-${item.Brazer_Name}-${item.Joint_Name}-${index}`}
                      className="hover:bg-blue-50/60 transition-colors even:bg-slate-50/40"
                    >
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-700 font-semibold">
                        {item.Date}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100">
                        <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 w-fit whitespace-nowrap">
                          <Zap className="w-2.5 h-2.5" />
                          {item.Line}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100">
                        <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 w-fit whitespace-nowrap">
                          <MapPin className="w-2.5 h-2.5" />
                          {item.Station}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-700">
                        {item.Brazer_Name}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100">
                        <span className="font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded-lg whitespace-nowrap">
                          {item.Joint_Name}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-slate-500">
                        {item.Joint_Description}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        <LeakageBadge count={item.Leakage_Count} />
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        <span className="font-bold text-slate-700">{item.Total_Joint_Brazed}</span>
                      </td>
                    </tr>
                  ))}

                  {reportData.length === 0 && (
                    <EmptyState colSpan={8} onTodayClick={() => handleQuickFilter("today")} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── GROUP SUMMARY ── */}
        {!loading && hasData && activeTab === "summary" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1">
            {/* Group Selector */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 xl:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Group By
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {GROUP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGroupBy(opt)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all flex items-center justify-between border cursor-pointer ${
                      groupBy.value === opt.value
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    {opt.label}
                    {groupBy.value === opt.value && (
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md">
                        {groupedData.length} groups
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <ExportButton
                  data={groupedData.map((g) => ({
                    [groupBy.label]: g.key,
                    Records: g.records,
                    Total_Joint_Brazed: g.joints,
                    Leakage_Count: g.leakage,
                  }))}
                  filename={`Brazing_Report_${groupBy.label.replace(/\s+/g, "_")}_Summary`}
                />
              </div>
            </div>

            {/* Summary Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col xl:col-span-2 min-h-[400px]">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 shrink-0">
                <Table2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  {groupBy.label} Breakdown
                </span>
                {groupedData.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full border border-blue-100">
                    {groupedData.length} groups
                  </span>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1 overflow-hidden">
                <GroupSummaryTable
                  grouped={groupedData}
                  groupLabel={groupBy.label}
                  totalJoints={totals.totalJoints}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Empty: no filters set ── */}
        {!loading && !hasData && !activeFilter && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 shadow-sm flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
              <Search className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-600">
              Select a Date Range
            </h3>
            <p className="text-xs text-slate-400 max-w-sm text-center">
              Use the quick select or set a custom date & time range to load Brazing report data.
            </p>
          </div>
        )}

        {/* ── Empty: filters applied, no results ── */}
        {!loading && !hasData && activeFilter && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 text-slate-300" strokeWidth={1.2} />
            <h3 className="text-sm font-semibold text-slate-600">
              No Records Found
            </h3>
            <p className="text-xs text-slate-400 max-w-sm text-center">
              No brazing records matched the selected date range. Try adjusting your filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrazingReport;
