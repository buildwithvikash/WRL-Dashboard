import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { baseURL } from "../../../assets/assets";
import ExportButton from "../../../components/ui/ExportButton";
import EmptyState from "../../../components/ui/EmptyState";
import {
  Search,
  RotateCcw,
  Clock,
  StopCircle,
  Play,
  Activity,
  MapPin,
  Calendar,
  BarChart2,
  List,
  ChevronDown,
  Loader2,
  Filter,
  Layers,
  Server,
  TrendingUp,
  Zap,
  AlertTriangle,
  Award,
  ArrowUp,
  Minus,
} from "lucide-react";

// ── Spinner ────────────────────────────────────────────────────────────────────
const Spinner = ({ cls = "w-4 h-4" }) => (
  <Loader2 className={`animate-spin ${cls}`} />
);

// ── QuickBtn ───────────────────────────────────────────────────────────────────
const QuickBtn = ({ label, sublabel, loading, onClick, colorClass }) => (
  <button
    disabled={loading}
    onClick={onClick}
    className={`w-full flex flex-col items-center justify-center gap-0.5 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-150 ${
      loading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : colorClass
    }`}
  >
    {loading ? (
      <span className="flex items-center gap-2">
        <Spinner /> Loading…
      </span>
    ) : (
      <>
        <span className="text-[15px] font-bold tracking-widest">{label}</span>
        <span className="text-[10px] opacity-75 font-normal">{sublabel}</span>
      </>
    )}
  </button>
);

// ── Tab config — Live is first so it opens immediately ────────────────────────
const INNER_TABS = [
  { key: "summary", label: "Summary Report", icon: BarChart2 },
  { key: "detail", label: "Detail Report", icon: List },
];

// ── Date helpers ───────────────────────────────────────────────────────────────
function fmtLocal(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
function today8AM() {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}
function yesterday8AM() {
  const d = today8AM();
  d.setDate(d.getDate() - 1);
  return d;
}
function startOfMonth8AM() {
  const d = new Date();
  d.setDate(1);
  d.setHours(8, 0, 0, 0);
  return d;
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function formatSeconds(seconds) {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Duration Badge ─────────────────────────────────────────────────────────────
function DurationBadge({ duration, seconds }) {
  const color =
    seconds > 600
      ? "bg-red-50 text-red-700 border-red-200"
      : seconds > 120
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full border ${color}`}
    >
      <Clock className="w-2.5 h-2.5" /> {duration}
    </span>
  );
}

// ── Dependent Select ───────────────────────────────────────────────────────────
function DependentSelect({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  loading,
  disabled,
  placeholder,
  allLabel,
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[170px] flex-1">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 text-xs text-slate-700 bg-slate-50 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">
            {loading ? "Loading…" : disabled ? placeholder : allLabel}
          </option>
          {options.map((opt, i) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {loading ? (
          <Spinner cls="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        ) : (
          <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        )}
      </div>
    </div>
  );
}

// ── Mini horizontal bar ────────────────────────────────────────────────────────
function HBar({ pct, color = "bg-blue-500" }) {
  return (
    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-700`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

// ── Summary Table ──────────────────────────────────────────────────────────────
function SummaryTable({ data }) {
  const totalStops = data.reduce(
    (sum, d) => sum + (d.Total_Stop_Count || 0),
    0,
  );
  const totalSeconds = data.reduce((sum, d) => sum + (d.Total_Seconds || 0), 0);
  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="min-w-[700px] w-full text-xs text-left border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100">
            {[
              "Sr No",
              "Station Name",
              "Total Stop Time",
              "Total Stops",
              "Avg per Stop",
            ].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-center first:text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((item, idx) => {
              const isTop = idx === 0;
              const avgSeconds =
                item.Total_Stop_Count > 0
                  ? Math.round(
                      (item.Total_Seconds || 0) / item.Total_Stop_Count,
                    )
                  : 0;
              return (
                <tr
                  key={idx}
                  className={`transition-colors hover:bg-blue-50/60 ${isTop ? "bg-red-50/40" : "even:bg-slate-50/40"}`}
                >
                  <td className="px-3 py-2 border-b border-slate-100 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${isTop ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-slate-100 text-slate-600"}`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <MapPin
                        className={`w-3 h-3 shrink-0 ${isTop ? "text-red-400" : "text-slate-400"}`}
                      />
                      <span
                        className={`font-semibold ${isTop ? "text-red-700" : "text-slate-800"}`}
                      >
                        {item.Station_Name}
                      </span>
                      {isTop && (
                        <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase bg-red-100 text-red-600 rounded-md">
                          Highest
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center">
                    <DurationBadge
                      duration={item.Total_Stop_Time}
                      seconds={item.Total_Seconds}
                    />
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${item.Total_Stop_Count > 10 ? "bg-red-50 text-red-700 border-red-200" : item.Total_Stop_Count > 5 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                    >
                      <StopCircle className="w-2.5 h-2.5" />{" "}
                      {item.Total_Stop_Count}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center">
                    <span className="text-xs text-slate-600 font-mono bg-slate-50 px-2 py-1 rounded-lg">
                      {formatSeconds(avgSeconds)}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5}>
                <EmptyState message="No stop & loss data found for the selected filters." />
              </td>
            </tr>
          )}
        </tbody>
        {data.length > 0 && (
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-slate-800 text-white">
              <td colSpan={2} className="px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                  <BarChart2 className="w-3 h-3" /> TOTAL ({data.length}{" "}
                  stations)
                </div>
              </td>
              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full bg-white/15">
                  <Clock className="w-2.5 h-2.5" />{" "}
                  {formatSeconds(totalSeconds)}
                </span>
              </td>
              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full bg-white/15">
                  <StopCircle className="w-2.5 h-2.5" /> {totalStops}
                </span>
              </td>
              <td className="px-3 py-3 text-center">
                <span className="text-[10px] font-bold font-mono bg-white/10 px-2.5 py-1 rounded-full">
                  {totalStops > 0
                    ? formatSeconds(Math.round(totalSeconds / totalStops))
                    : "—"}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Detail Table ───────────────────────────────────────────────────────────────
function DetailTable({ data }) {
  const [expandedStations, setExpandedStations] = useState(new Set());

  const groupedData = useMemo(() => {
    const groups = {};
    data.forEach((item) => {
      const key = item.Station_Name || "Unknown Station";
      if (!groups[key])
        groups[key] = {
          stationName: key,
          records: [],
          totalSeconds: 0,
          longStops: 0,
        };
      groups[key].records.push(item);
      groups[key].totalSeconds += item.Duration_Seconds || 0;
      if ((item.Duration_Seconds || 0) > 600) groups[key].longStops += 1;
    });
    return Object.values(groups).sort(
      (a, b) => b.totalSeconds - a.totalSeconds,
    );
  }, [data]);

  const toggleStation = useCallback(
    (name) =>
      setExpandedStations((prev) => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
      }),
    [],
  );

  const totalDetailSeconds = useMemo(
    () => data.reduce((sum, d) => sum + (d.Duration_Seconds || 0), 0),
    [data],
  );
  const totalLongStops = useMemo(
    () => data.filter((d) => (d.Duration_Seconds || 0) > 600).length,
    [data],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-4 py-2 shrink-0 border-b border-slate-100">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
          {groupedData.length} Stations · {data.length} Total Stops
        </span>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {groupedData.length > 0 ? (
          groupedData.map((group, gIdx) => {
            const isExpanded = expandedStations.has(group.stationName);
            const isWorst = gIdx === 0;
            const stopCount = group.records.length;
            return (
              <div
                key={group.stationName}
                className="border-b border-slate-100 last:border-b-0"
              >
                <button
                  onClick={() => toggleStation(group.stationName)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isExpanded ? "bg-blue-600 text-white" : isWorst ? "bg-red-50/60 hover:bg-red-50" : gIdx % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50/40 hover:bg-slate-100/60"}`}
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-0 text-white/70" : "-rotate-90 text-slate-400"}`}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MapPin
                      className={`w-3.5 h-3.5 shrink-0 ${isExpanded ? "text-white/70" : isWorst ? "text-red-400" : "text-slate-400"}`}
                    />
                    <span
                      className={`text-sm font-bold truncate ${isExpanded ? "text-white" : isWorst ? "text-red-700" : "text-slate-800"}`}
                    >
                      {group.stationName}
                    </span>
                    {isWorst && !isExpanded && (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase bg-red-100 text-red-600 rounded-md shrink-0">
                        Highest
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${isExpanded ? "bg-white/15 text-white border-white/20" : stopCount > 10 ? "bg-red-50 text-red-700 border-red-200" : stopCount > 5 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                    >
                      <StopCircle className="w-2.5 h-2.5" /> {stopCount}
                    </span>
                    {group.longStops > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${isExpanded ? "bg-red-400/30 text-red-100 border-red-400/20" : "bg-red-50 text-red-600 border-red-200"}`}
                      >
                        {group.longStops} long
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border font-mono ${isExpanded ? "bg-white/15 text-white border-white/20" : group.totalSeconds > 600 ? "bg-red-50 text-red-700 border-red-200" : group.totalSeconds > 120 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                    >
                      <Clock className="w-2.5 h-2.5" />{" "}
                      {formatSeconds(group.totalSeconds)}
                    </span>
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${isExpanded ? "max-h-[2000px]" : "max-h-0"}`}
                >
                  <div className="bg-white">
                    <div className="grid grid-cols-12 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">
                      <div className="col-span-1">#</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-3">Stop Time</div>
                      <div className="col-span-3">Start Time</div>
                      <div className="col-span-3">Duration</div>
                    </div>
                    {group.records.map((item, rIdx) => {
                      const secs = item.Duration_Seconds || 0;
                      const isLong = secs > 600;
                      const isMedium = secs > 120;
                      return (
                        <div
                          key={rIdx}
                          className={`grid grid-cols-12 px-4 py-2.5 items-center border-b border-slate-100/80 text-center transition-colors hover:bg-blue-50/30 ${isLong ? "bg-red-50/20" : rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                        >
                          <div className="col-span-1 flex justify-center">
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold ${isLong ? "bg-red-100 text-red-600" : isMedium ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}
                            >
                              {item.Sr_No}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium bg-slate-50 px-2 py-0.5 rounded-md">
                              <Calendar className="w-2.5 h-2.5 text-slate-400" />
                              {String(item.Date).split("T")[0]}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200">
                              <StopCircle className="w-2.5 h-2.5" />{" "}
                              {item.Stop_Time}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <Play className="w-2.5 h-2.5" /> {item.Start_Time}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-center items-center gap-2">
                            <DurationBadge
                              duration={item.Duration}
                              seconds={secs}
                            />
                            {isLong && (
                              <span className="text-[8px] font-bold uppercase text-red-500 animate-pulse">
                                ⚠ Long
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-12 px-4 py-2 items-center bg-slate-100/80 border-t border-slate-200 text-center">
                      <div className="col-span-3 col-start-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Subtotal
                        </span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-[10px] font-bold text-slate-500">
                          {stopCount} {stopCount === 1 ? "stop" : "stops"}
                        </span>
                      </div>
                      <div className="col-span-3 flex justify-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700">
                          <Clock className="w-2.5 h-2.5" />{" "}
                          {formatSeconds(group.totalSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-10">
            <EmptyState message="No detail data found for the selected filters." />
          </div>
        )}
      </div>
      {data.length > 0 && (
        <div className="shrink-0 bg-slate-800 text-white px-4 py-3 flex items-center justify-between rounded-b-xl">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-white/60" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">
                Grand Total
              </p>
              <p className="text-xs font-bold text-white/90">
                {groupedData.length} Stations · {data.length} Records
              </p>
            </div>
          </div>
          {totalLongStops > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full bg-red-500/25 text-red-200 border border-red-400/30">
              <StopCircle className="w-2.5 h-2.5" /> {totalLongStops} Long Stops
              (&gt;10 min)
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">
              Total Duration
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full bg-white/15 border border-white/10">
              <Clock className="w-3 h-3" /> {formatSeconds(totalDetailSeconds)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
function StopLossReport() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [lineName, setLineName] = useState("");
  const [location, setLocation] = useState("");
  const [station, setStation] = useState("");

  const [lines, setLines] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  const [ydayLoading, setYdayLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("summary");
  const [queried, setQueried] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [tabCache, setTabCache] = useState({
    summary: { data: [], loading: false, fetched: false },
    detail: { data: [], loading: false, fetched: false },
  });

  const abortRef = useRef(null);

  useEffect(() => {
    axios
      .get(`${baseURL}prod/stop-loss/lines`)
      .then((res) => setLines(res?.data?.data?.map((r) => r.LineName) || []))
      .catch(() => toast.error("Failed to load lines."));
    axios
      .get(`${baseURL}prod/stop-loss/locations`)
      .then((res) =>
        setLocations(res?.data?.data?.map((r) => r.Location) || []),
      )
      .catch(() => toast.error("Failed to load locations."));
  }, []);

  useEffect(() => {
    setStation("");
    setStations([]);
    if (!lineName || !location) return;
    setStationsLoading(true);
    axios
      .get(`${baseURL}prod/stop-loss/stations`, {
        params: { location, lineName },
      })
      .then((res) =>
        setStations(res?.data?.data?.map((r) => r.StationName) || []),
      )
      .catch(() => toast.error("Failed to fetch stations."))
      .finally(() => setStationsLoading(false));
  }, [location, lineName]);

  const freshCache = () => ({
    summary: { data: [], loading: false, fetched: false },
    detail: { data: [], loading: false, fetched: false },
  });

  const fetchTabData = useCallback(
    async (tabKey, overrideParams = null) => {
      const endpoint =
        tabKey === "summary"
          ? "prod/stop-loss/summary"
          : "prod/stop-loss/detail";
      const params = overrideParams ?? {
        fromDate,
        toDate,
        location,
        lineName,
        station,
      };
      setTabCache((prev) => ({
        ...prev,
        [tabKey]: { ...prev[tabKey], loading: true },
      }));
      try {
        const res = await axios.get(`${baseURL}${endpoint}`, {
          params,
          signal: abortRef.current?.signal,
        });
        const data = res?.data?.data || [];
        setTabCache((prev) => ({
          ...prev,
          [tabKey]: { data, loading: false, fetched: true },
        }));
      } catch (err) {
        if (axios.isCancel(err)) return;
        toast.error(`Failed to fetch ${tabKey} data.`);
        setTabCache((prev) => ({
          ...prev,
          [tabKey]: { ...prev[tabKey], loading: false },
        }));
      }
    },
    [fromDate, toDate, location, lineName, station],
  );

  const validateDropdowns = () => {
    if (!lineName) {
      toast.error("Please select a Line.");
      return false;
    }
    if (!location) {
      toast.error("Please select a Location.");
      return false;
    }
    return true;
  };

  const handleQuery = async () => {
    if (isQuerying) return;
    if (!fromDate || !toDate) {
      toast.error("Please select From Date and To Date.");
      return;
    }
    if (!validateDropdowns()) return;
    if (new Date(fromDate) >= new Date(toDate)) {
      toast.error("From Date must be before To Date.");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsQuerying(true);
    setTabCache(freshCache());
    setQueried(true);
    setActiveTab("summary"); // switch to summary when manual query runs

    try {
      await fetchTabData("summary");
      await fetchTabData("detail");
    } finally {
      setIsQuerying(false);
    }
  };

  const applyQuickFilter = async (fromD, toD, setLoadingFn, label) => {
    if (!validateDropdowns()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoadingFn(true);
    setFromDate(fromD);
    setToDate(toD);
    setTabCache(freshCache());
    setQueried(true);
    setActiveTab("summary");
    const params = {
      fromDate: fromD,
      toDate: toD,
      location,
      lineName,
      ...(station ? { station } : {}),
    };
    try {
      await Promise.all([
        fetchTabData("summary", params),
        fetchTabData("detail", params),
      ]);
    } catch {
      toast.error(`Failed to fetch ${label} data.`);
    } finally {
      setLoadingFn(false);
    }
  };

  const fetchYesterday = () =>
    applyQuickFilter(
      fmtLocal(yesterday8AM()),
      fmtLocal(today8AM()),
      setYdayLoading,
      "Yesterday",
    );
  const fetchToday = () =>
    applyQuickFilter(
      fmtLocal(today8AM()),
      fmtLocal(new Date()),
      setTodayLoading,
      "Today",
    );
  const fetchMTD = () =>
    applyQuickFilter(
      fmtLocal(startOfMonth8AM()),
      fmtLocal(new Date()),
      setMonthLoading,
      "MTD",
    );

  const handleTabSwitch = useCallback(
    (tabKey) => {
      setActiveTab(tabKey);
      if (!queried) return;
      if (!tabCache[tabKey].fetched && !tabCache[tabKey].loading)
        fetchTabData(tabKey);
    },
    [queried, tabCache, fetchTabData],
  );

  const handleReset = () => {
    abortRef.current?.abort();
    setFromDate("");
    setToDate("");
    setLineName("");
    setLocation("");
    setStation("");
    setStations([]);
    setQueried(false);
    setIsQuerying(false);
    setActiveTab("summary");
    setTabCache(freshCache());
  };

  const currentCache = tabCache[activeTab];
  const currentTab = INNER_TABS.find((t) => t.key === activeTab);
  const summaryData = tabCache.summary.data;
  const totalStops = summaryData.reduce(
    (s, d) => s + (d.Total_Stop_Count || 0),
    0,
  );
  const totalSeconds = summaryData.reduce(
    (s, d) => s + (d.Total_Seconds || 0),
    0,
  );
  const anyQuickLoading = ydayLoading || todayLoading || monthLoading;
  const isBusy = currentCache.loading || isQuerying || anyQuickLoading;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* ── PAGE HEADER ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            Stop Loss Report
          </h1>
          <p className="text-[11px] text-slate-400">
            Station-level downtime analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {queried && summaryData.length > 0 && (
            <>
              <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-blue-50 border border-blue-100 min-w-[90px]">
                <span className="text-xl font-bold font-mono text-blue-700">
                  {summaryData.length}
                </span>
                <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">
                  Stations
                </span>
              </div>
              <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-red-50 border border-red-100 min-w-[90px]">
                <span className="text-xl font-bold font-mono text-red-700">
                  {totalStops}
                </span>
                <span className="text-[10px] text-red-500 font-medium uppercase tracking-wide">
                  Total Stops
                </span>
              </div>
              <div className="flex flex-col items-center px-4 py-1.5 rounded-lg bg-amber-50 border border-amber-100 min-w-[90px]">
                <span className="text-lg font-bold font-mono text-amber-700">
                  {formatSeconds(totalSeconds)}
                </span>
                <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">
                  Total Time
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
        {/* ── FILTERS ROW ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="w-3 h-3 text-slate-400" />
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Filters
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[185px] flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                From Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined}
                className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[185px] flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                To Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
                className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[150px] flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                Line
              </label>
              <div className="relative">
                <select
                  value={lineName}
                  onChange={(e) => setLineName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 text-xs text-slate-700 bg-slate-50 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                >
                  <option value="">Select Line</option>
                  {lines.map((line, i) => (
                    <option key={i} value={line}>
                      {line}
                    </option>
                  ))}
                </select>
                <Layers className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-[150px] flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                Location
              </label>
              <div className="relative">
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 text-xs text-slate-700 bg-slate-50 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                >
                  <option value="">Select Location</option>
                  {locations.map((loc, i) => (
                    <option key={i} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <DependentSelect
              label="Station (Optional)"
              icon={Server}
              value={station}
              onChange={setStation}
              options={stations}
              loading={stationsLoading}
              disabled={!location}
              placeholder="Select Location first"
              allLabel="All Stations"
            />

            {/* All action buttons — Query, Reset, quick filters — inline */}
            <div className="flex items-center gap-2 pb-0.5 flex-wrap">
              <button
                onClick={handleQuery}
                disabled={isBusy}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${isBusy ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200"}`}
              >
                {isQuerying ? <Spinner /> : <Search className="w-4 h-4" />}
                {isQuerying ? "Searching…" : "Query"}
              </button>

              <button
                onClick={fetchYesterday}
                disabled={ydayLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${ydayLoading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"}`}
              >
                {ydayLoading && <Spinner cls="w-4 h-4" />}
                {ydayLoading ? "Loading…" : "Yesterday"}
              </button>

              <button
                onClick={fetchToday}
                disabled={todayLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${todayLoading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"}`}
              >
                {todayLoading && <Spinner cls="w-4 h-4" />}
                {todayLoading ? "Loading…" : "Today"}
              </button>

              <button
                onClick={fetchMTD}
                disabled={monthLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${monthLoading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"}`}
              >
                {monthLoading && <Spinner cls="w-4 h-4" />}
                {monthLoading ? "Loading…" : "MTD"}
              </button>

              {queried && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Reset
                </button>
              )}
            </div>

            {queried && (
              <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl w-full flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <div>
                    <p className="text-[9px] uppercase font-bold text-blue-400 tracking-widest leading-none">
                      Line
                    </p>
                    <p className="text-xs font-bold text-blue-700 mt-0.5">
                      {lineName}
                    </p>
                  </div>
                </div>
                <div className="w-px h-7 bg-blue-200" />
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-500" />
                  <div>
                    <p className="text-[9px] uppercase font-bold text-blue-400 tracking-widest leading-none">
                      Location
                    </p>
                    <p className="text-xs font-bold text-blue-700 mt-0.5">
                      {location}
                    </p>
                  </div>
                </div>
                {station && (
                  <>
                    <div className="w-px h-7 bg-blue-200" />
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-blue-500" />
                      <div>
                        <p className="text-[9px] uppercase font-bold text-blue-400 tracking-widest leading-none">
                          Station
                        </p>
                        <p className="text-xs font-bold text-blue-700 mt-0.5">
                          {station}
                        </p>
                      </div>
                    </div>
                  </>
                )}
                <div className="w-px h-7 bg-blue-200" />
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <div>
                    <p className="text-[9px] uppercase font-bold text-blue-400 tracking-widest leading-none">
                      Period
                    </p>
                    <p className="text-[11px] font-semibold text-blue-700 mt-0.5">
                      {fromDate?.replace("T", " ")} →{" "}
                      {toDate?.replace("T", " ")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── REPORT PANEL ── */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="flex items-center justify-between px-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
            <div className="flex gap-1 pt-1.5">
              {INNER_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;

                const cache = tabCache[tab.key];
                const count = cache.fetched ? cache.data.length : null;

                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabSwitch(tab.key)}
                    className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all ${
                      isActive
                        ? "bg-white text-blue-700 border-t-2 border-x border-t-blue-500 border-x-slate-200 -mb-px shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/70"
                    }`}
                  >
                    {/* Live tab gets pulsing dot instead of spinner */}
                    {cache.loading ? (
                      <Spinner cls="w-3.5 h-3.5" />
                    ) : (
                      <Icon
                        className={`w-3.5 h-3.5 ${
                          isActive ? "text-blue-500" : "text-slate-400"
                        }`}
                      />
                    )}
                    {tab.label}
                    {count != null && (
                      <span
                        className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded-full text-[10px] font-bold ${isActive ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}
                      >
                        {count}
                      </span>
                    )}
                    {cache.fetched && !isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
            {queried && currentCache.fetched && currentCache.data.length > 0 && (
              <div className="py-2">
                <ExportButton
                  data={currentCache.data}
                  filename={`Stop_Loss_${activeTab === "summary" ? "Summary" : "Detail"}_Report`}
                />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {!queried ? (
              <div className="flex flex-col items-center justify-center flex-1 text-slate-400">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <Activity className="w-8 h-8 text-blue-300" />
                </div>
                <p className="text-base font-bold text-slate-500">
                  Stop &amp; Loss Report
                </p>
                <p className="text-sm mt-1 text-slate-400 text-center max-w-xs">
                  Select Line &amp; Location, then click{" "}
                  <span className="font-semibold text-blue-500">Query</span> or
                  use a{" "}
                  <span className="font-semibold text-amber-500">
                    Quick Filter
                  </span>
                  .
                </p>
              </div>
            ) : currentCache.loading ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3">
                <Spinner cls="w-6 h-6 text-blue-600" />
                <p className="text-sm text-slate-400">
                  Fetching {currentTab.label}…
                </p>
              </div>
            ) : currentCache.fetched ? (
              activeTab === "summary" ? (
                <SummaryTable data={currentCache.data} />
              ) : (
                <DetailTable data={currentCache.data} />
              )
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400">
                <Spinner cls="w-5 h-5" />
                <p className="text-sm">Loading {currentTab.label}…</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StopLossReport;
