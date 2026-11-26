import { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { baseURL } from "../../../assets/assets";
import ExportButton from "../../../components/ui/ExportButton";
import EmptyState from "../../../components/ui/EmptyState";
import { Search, RotateCcw, Loader2, ChevronDown } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");

// Format used by <input type="datetime-local">
const formatDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// 8 AM, N days ago (shift start)
const at8AM = (daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(8, 0, 0, 0);
  return d;
};

// 01:05:30
const formatSeconds = (sec) => {
  const s = Math.round(Number(sec) || 0);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// Short version: "1h 05m", "12m 30s", "45s"
const formatShort = (sec) => {
  const s = Math.round(Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
};

// One colour rule used everywhere: over 10 min red, over 2 min amber, else green
const durationColor = (sec) =>
  sec > 600
    ? "bg-red-50 text-red-700 border-red-200"
    : sec > 120
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";

const inputClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300";

// ── Small pieces ───────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1 min-w-[160px] flex-1">
    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
      {label}
    </label>
    {children}
  </div>
);

const Select = ({ value, onChange, options, placeholder, disabled }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`${inputClass} disabled:opacity-50`}
  >
    <option value="">{placeholder}</option>
    {options.map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
);

const StatCard = ({ label, value, hint, tone }) => (
  <div className={`rounded-xl border px-4 py-3 ${tone}`}>
    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
      {label}
    </p>
    <p className="text-xl font-bold font-mono mt-0.5 truncate" title={value}>
      {value}
    </p>
    <p className="text-[11px] opacity-70 truncate" title={hint}>
      {hint}
    </p>
  </div>
);

const Badge = ({ seconds, children }) => (
  <span
    className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold font-mono ${durationColor(seconds)}`}
  >
    {children}
  </span>
);

// ── Summary cards ──────────────────────────────────────────────────────────────
const SummaryCards = ({ data }) => {
  const totalSeconds = data.reduce((s, r) => s + (r.Total_Seconds || 0), 0);
  const totalStops = data.reduce((s, r) => s + (r.Total_Stop_Count || 0), 0);
  const worst = data[0]; // backend sorts by most downtime first

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Total Downtime"
        value={formatSeconds(totalSeconds)}
        hint="hh:mm:ss, breaks excluded"
        tone="bg-red-50 border-red-100 text-red-700"
      />
      <StatCard
        label="Total Stops"
        value={totalStops}
        hint={`across ${data.length} stations`}
        tone="bg-blue-50 border-blue-100 text-blue-700"
      />
      <StatCard
        label="Avg per Stop"
        value={totalStops ? formatShort(totalSeconds / totalStops) : "—"}
        hint="downtime ÷ stops"
        tone="bg-amber-50 border-amber-100 text-amber-700"
      />
      <StatCard
        label="Worst Station"
        value={worst ? worst.Station_Name : "—"}
        hint={worst ? `${formatShort(worst.Total_Seconds)} lost` : ""}
        tone="bg-slate-50 border-slate-200 text-slate-700"
      />
    </div>
  );
};

// ── One station row (used by both tabs) ────────────────────────────────────────
// Pass onToggle + children to make it open/close.
const StationRow = ({
  index,
  name,
  seconds,
  stops,
  maxSeconds,
  share,
  open,
  onToggle,
  children,
}) => {
  const clickable = Boolean(onToggle);

  return (
    <div>
      <div
        onClick={onToggle}
        className={`px-4 py-3 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""} ${open ? "bg-blue-50/50" : ""}`}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-sm font-semibold text-slate-800 truncate flex items-center">
            {clickable && (
              <ChevronDown
                className={`w-4 h-4 mr-1.5 text-slate-400 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
              />
            )}
            <span className="text-slate-400 font-mono mr-2">{index + 1}.</span>
            {name}
          </p>
          <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
            <span>
              <b className="text-slate-700">{stops}</b> stops
            </span>
            <span>
              avg{" "}
              <b className="text-slate-700">
                {formatShort(seconds / (stops || 1))}
              </b>
            </span>
            <Badge seconds={seconds}>{formatSeconds(seconds)}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${index === 0 ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${(seconds / maxSeconds) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right text-[11px] font-semibold text-slate-500">
            {share}%
          </span>
        </div>
      </div>
      {open && children}
    </div>
  );
};

// ── By Station: ranked list with bars ──────────────────────────────────────────
const SummaryList = ({ data }) => {
  if (!data.length) return <EmptyState message="No stops found." />;

  const maxSeconds = data[0].Total_Seconds || 1;
  const totalSeconds =
    data.reduce((s, r) => s + (r.Total_Seconds || 0), 0) || 1;

  return (
    <div className="divide-y divide-slate-100">
      {data.map((r, i) => (
        <StationRow
          key={r.Station_Name}
          index={i}
          name={r.Station_Name}
          seconds={r.Total_Seconds}
          stops={r.Total_Stop_Count}
          maxSeconds={maxSeconds}
          share={Math.round((r.Total_Seconds / totalSeconds) * 100)}
        />
      ))}
    </div>
  );
};

// ── All Stops: same rows, click a station to open its stops ────────────────────
const DetailList = ({ data }) => {
  const [openStation, setOpenStation] = useState(null);

  if (!data.length) return <EmptyState message="No stops found." />;

  // Group stops by station, worst station first
  const groups = Object.values(
    data.reduce((acc, r) => {
      const g = (acc[r.Station_Name] ??= {
        name: r.Station_Name,
        stops: [],
        seconds: 0,
      });
      g.stops.push(r);
      g.seconds += r.Duration_Seconds || 0;
      return acc;
    }, {}),
  ).sort((a, b) => b.seconds - a.seconds);

  const maxSeconds = groups[0].seconds || 1;
  const totalSeconds = groups.reduce((s, g) => s + g.seconds, 0) || 1;

  return (
    <div className="divide-y divide-slate-100">
      {groups.map((g, i) => (
        <StationRow
          key={g.name}
          index={i}
          name={g.name}
          seconds={g.seconds}
          stops={g.stops.length}
          maxSeconds={maxSeconds}
          share={Math.round((g.seconds / totalSeconds) * 100)}
          open={openStation === g.name}
          onToggle={() =>
            setOpenStation(openStation === g.name ? null : g.name)
          }
        >
          <table className="w-full text-xs border-separate border-spacing-0 bg-slate-50/60">
            <thead>
              <tr>
                {["Sr. No", "Date", "Stopped At", "Restarted At", "Duration"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 border-y border-slate-200 font-semibold text-slate-500 text-center"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {g.stops.map((r, j) => (
                <tr key={j} className="hover:bg-blue-50/50">
                  <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-400">
                    {j + 1}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-500">
                    {String(r.Date).split("T")[0]}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center font-mono text-red-600">
                    {r.Stop_Time}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center font-mono text-emerald-600">
                    {r.Start_Time}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-center">
                    <Badge seconds={r.Duration_Seconds}>{r.Duration}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </StationRow>
      ))}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const StopLossReport = () => {
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [lineName, setLineName] = useState("");
  const [location, setLocation] = useState("");
  const [station, setStation] = useState("");

  // Dropdown options
  const [lines, setLines] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stations, setStations] = useState([]);

  // Report
  const [summary, setSummary] = useState([]);
  const [detail, setDetail] = useState([]);
  const [tab, setTab] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState(false);

  // Load lines + locations once
  useEffect(() => {
    axios
      .get(`${baseURL}prod/stop-loss/lines`)
      .then((res) => setLines(res.data.data.map((r) => r.LineName)))
      .catch(() => toast.error("Failed to load lines."));
    axios
      .get(`${baseURL}prod/stop-loss/locations`)
      .then((res) => setLocations(res.data.data.map((r) => r.Location)))
      .catch(() => toast.error("Failed to load locations."));
  }, []);

  // Load stations when line + location change
  useEffect(() => {
    setStation("");
    setStations([]);
    if (!lineName || !location) return;
    axios
      .get(`${baseURL}prod/stop-loss/stations`, {
        params: { location, lineName },
      })
      .then((res) => setStations(res.data.data.map((r) => r.StationName)))
      .catch(() => toast.error("Failed to load stations."));
  }, [lineName, location]);

  // Fetch summary + detail together
  const fetchReport = async (from, to) => {
    const params = { fromDate: from, toDate: to, location, lineName };
    if (station) params.station = station;

    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        axios.get(`${baseURL}prod/stop-loss/summary`, { params }),
        axios.get(`${baseURL}prod/stop-loss/detail`, { params }),
      ]);
      setSummary(s.data.data || []);
      setDetail(d.data.data || []);
      setQueried(true);
    } catch {
      toast.error("Failed to fetch report.");
    } finally {
      setLoading(false);
    }
  };

  const hasLineAndLocation = () => {
    if (!lineName || !location) {
      toast.error("Please select Line and Location.");
      return false;
    }
    return true;
  };

  const handleQuery = () => {
    if (!fromDate || !toDate) return toast.error("Select From and To date.");
    if (new Date(fromDate) >= new Date(toDate))
      return toast.error("From Date must be before To Date.");
    if (!hasLineAndLocation()) return;
    fetchReport(fromDate, toDate);
  };

  const handleToday = () => {
    if (!hasLineAndLocation()) return;
    const now = new Date();
    // Before 8 AM the current shift started yesterday at 8 AM
    const start = now < at8AM(0) ? at8AM(1) : at8AM(0);
    setFromDate(formatDate(start));
    setToDate(formatDate(now));
    fetchReport(formatDate(start), formatDate(now));
  };

  const handleYesterday = () => {
    if (!hasLineAndLocation()) return;
    const start = formatDate(at8AM(1));
    const end = formatDate(at8AM(0));
    setFromDate(start);
    setToDate(end);
    fetchReport(start, end);
  };

  const handleReset = () => {
    setFromDate("");
    setToDate("");
    setLineName("");
    setLocation("");
    setStation("");
    setSummary([]);
    setDetail([]);
    setQueried(false);
    setTab("summary");
  };

  const btn = (color) =>
    `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed ${color}`;

  const activeData = tab === "summary" ? summary : detail;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Stop Loss Report</h1>
        <p className="text-[11px] text-slate-400">
          How long each station stopped the line (shift breaks excluded)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-3">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="From">
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="To">
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Line">
              <Select
                value={lineName}
                onChange={setLineName}
                options={lines}
                placeholder="Select Line"
              />
            </Field>
            <Field label="Location">
              <Select
                value={location}
                onChange={setLocation}
                options={locations}
                placeholder="Select Location"
              />
            </Field>
            <Field label="Station (optional)">
              <Select
                value={station}
                onChange={setStation}
                options={stations}
                placeholder="All Stations"
                disabled={!stations.length}
              />
            </Field>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleQuery}
                disabled={loading}
                className={btn("bg-blue-600 hover:bg-blue-700")}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Query
              </button>
              <button
                onClick={handleYesterday}
                disabled={loading}
                className={btn("bg-amber-500 hover:bg-amber-600")}
              >
                Yesterday
              </button>
              <button
                onClick={handleToday}
                disabled={loading}
                className={btn("bg-emerald-600 hover:bg-emerald-700")}
              >
                Today
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-600 hover:text-slate-800 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {queried && !loading && summary.length > 0 && (
          <SummaryCards data={summary} />
        )}

        {/* Report */}
        <div className="flex-1 min-h-[320px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/50">
            <div className="flex gap-1">
              {[
                ["summary", "By Station", summary.length],
                ["detail", "All Stops", detail.length],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
                    tab === key
                      ? "bg-blue-600 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {label}
                  {queried && ` (${count})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden md:flex items-center gap-2 text-[10px] text-slate-400">
                <i className="w-2 h-2 rounded-full bg-emerald-400" /> under 2
                min
                <i className="w-2 h-2 rounded-full bg-amber-400" /> 2–10 min
                <i className="w-2 h-2 rounded-full bg-red-400" /> over 10 min
              </span>
              {queried && activeData.length > 0 && (
                <ExportButton
                  data={activeData}
                  filename={`Stop_Loss_${tab === "summary" ? "Summary" : "Detail"}_Report`}
                />
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
              </div>
            ) : !queried ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Select Line and Location, then click Query, Today or Yesterday.
              </div>
            ) : tab === "summary" ? (
              <SummaryList data={summary} />
            ) : (
              <DetailList data={detail} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StopLossReport;
