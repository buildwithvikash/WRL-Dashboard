import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search, UserRound, MapPinned, CalendarClock, Send,
  Building2, Phone, MessageSquare, History, RefreshCcw,
} from "lucide-react";
import { baseURL } from "../../assets/assets.js";
import SelectField from "../../components/ui/SelectField.jsx";
import DateTimePicker from "../../components/ui/DateTimePicker.jsx";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import { Spinner, StatusBadge, EmptyState, Avatar, ElapsedBadge, StatusPipeline, PhotoZoomModal } from "../../components/employeeManagement/Gatepassui.jsx"
import { TYPE_OPTIONS, COMING_BACK_OPTIONS, EMPTY_FORM } from "./Constants.js";

const REQUIRED_FIELDS = [
  "empCode",
  "empName",
  "deptName",
  "contactNo",
  "placeOfVisit",
  "reason",
  "outDateTime",
];

const RECENT_CODES_KEY = "gatepassRecentEmpCodes";

// Per-viewer convenience only (localStorage) — not shared/synced, just saves
// re-typing a code you searched a moment ago.
const loadRecentCodes = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_CODES_KEY) || "[]"); } catch { return []; }
};
const saveRecentCode = (entry) => {
  try {
    const existing = loadRecentCodes().filter((r) => r.empCode !== entry.empCode);
    localStorage.setItem(RECENT_CODES_KEY, JSON.stringify([entry, ...existing].slice(0, 5)));
  } catch { /* localStorage unavailable — not critical */ }
};

const FieldLabel = ({ icon: Icon, hint, children }) => (
  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
    {Icon && <Icon className="w-3 h-3 text-slate-300" />}
    {children}
    {hint && (
      <span title={hint} className="w-3.5 h-3.5 rounded-full border border-slate-300 text-slate-400 text-[9px] flex items-center justify-center font-bold normal-case cursor-help">i</span>
    )}
  </label>
);

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow";

// Type-ahead search against the employee badge directory (Backend reads
// pool4/CLMS's Name table) — picking a match auto-fills name + contact so
// the requester only has to remember the employee code. Also remembers the
// last few picks per-browser for one-click reuse.
const EmployeeCodeLookup = ({ value, onSelect, onChange }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingCode, setLoadingCode] = useState(null);
  const [recent, setRecent] = useState(loadRecentCodes);
  const boxRef = useRef(null);

  const applySelection = (empCode, empName, contactNo, deptName) => {
    onSelect({ empCode, empName, contactNo, deptName });
    saveRecentCode({ empCode, empName });
    setRecent(loadRecentCodes());
  };

  // Full record (with department) is only fetched once a specific employee
  // is picked — the dropdown itself just needs the lightweight prefix search.
  const handlePick = async (s) => {
    setOpen(false);
    setLoadingCode(s.empCode);
    try {
      const res = await axios.get(`${baseURL}gatepass/employee-details`, { params: { empCode: s.empCode } });
      const d = res.data?.data;
      applySelection(d?.empCode || s.empCode, d?.employeeName?.trim() || s.empName?.trim(), d?.employeePhone || s.contactNo, d?.businessUnitName || "");
    } catch {
      // Details lookup is a bonus (department) — fall back to what the
      // prefix search already gave us rather than losing the pick entirely.
      applySelection(s.empCode, s.empName?.trim(), s.contactNo, "");
    } finally {
      setLoadingCode(null);
    }
  };

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`${baseURL}gatepass/search-employee`, { params: { q: query } });
        setSuggestions(res.data?.data || []);
        setOpen(true);
      } catch {
        // Non-fatal — the field stays freely editable either way.
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showRecent = value.trim().length === 0 && recent.length > 0;

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <input
          className={`${inputCls} pr-8`}
          value={value}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => (suggestions.length > 0 || showRecent) && setOpen(true)}
          placeholder="e.g. WRLZ0242"
          autoComplete="off"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300">
          {searching ? <Spinner cls="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
        </span>
      </div>
      {open && showRecent && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <p className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <History className="w-3 h-3" /> Recent Searches
          </p>
          <div className="py-1">
            {recent.map((r) => (
              <button
                key={r.empCode}
                type="button"
                onClick={() => handlePick(r)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
              >
                <History className="w-3 h-3 text-slate-300 shrink-0" />
                <span className="text-slate-600">{r.empName ? `${r.empName} · ${r.empCode}` : r.empCode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && !showRecent && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="py-1 max-h-56 overflow-auto">
            {suggestions.map((s) => (
              <button
                key={s.empCode}
                type="button"
                disabled={loadingCode === s.empCode}
                onClick={() => handlePick(s)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <Avatar name={s.empName} empCode={s.empCode} size="sm" />
                <span className="flex-1 flex flex-col items-start min-w-0">
                  <span className="font-semibold text-slate-800 truncate w-full">{s.empName?.trim()}</span>
                  <span className="text-slate-400">{s.empCode} · {s.contactNo || "no phone"}</span>
                </span>
                {loadingCode === s.empCode && <Spinner cls="w-3 h-3 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// A ring showing how much of the currently in-flight (not yet Completed or
// Rejected) traffic is stuck waiting on an approval — the share of the
// active pipeline that's still pending, not just a raw count.
const PendingDonut = ({ pendingCount, pct }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="84" height="84" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke="#f59e0b" strokeWidth="8"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x="44" y="41" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#1e293b">{pendingCount}</text>
      <text x="44" y="56" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#94a3b8" letterSpacing="1">PENDING</text>
    </svg>
  );
};

// Extracts "HH:mm" from a "YYYY-MM-DD HH:mm:ss" value.
const timeOf = (dt) => dt?.split(" ")[1]?.slice(0, 5) || "";

// A pass-card-style live preview — closer to what the physical/printed gate
// pass looks like than a plain field list, so the requester recognizes it.
const PassPreviewCard = ({ form }) => {
  const hasEmployee = form.empCode || form.empName;
  const outTime = timeOf(form.outDateTime);
  const inTime = timeOf(form.expectedInDateTime);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const photoSrc = form.empCode ? `${baseURL}gatepass/employee-photo/${form.empCode}` : null;

  useEffect(() => { setPhotoFailed(false); }, [form.empCode]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center shrink-0">
          <Building2 className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-white font-bold text-xs leading-tight">Western Refrigeration Pvt. Ltd</span>
      </div>
      <div className="bg-white p-4">
        {!hasEmployee ? (
          <p className="text-xs text-slate-400 text-center py-4">Fill in the form to preview the pass.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {photoSrc && !photoFailed && (
                <img
                  src={photoSrc}
                  alt=""
                  onError={() => setPhotoFailed(true)}
                  onClick={() => setZoomed(true)}
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-zoom-in hover:opacity-90 transition-opacity"
                />
              )}
              {zoomed && photoSrc && (
                <PhotoZoomModal src={photoSrc} alt={form.empName || form.empCode} onClose={() => setZoomed(false)} />
              )}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Employee Name</p>
                <p className="text-sm font-bold text-slate-800">{form.empName || "—"}{form.empCode ? `-${form.empCode}` : ""}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Reason</p>
              <p className="text-sm text-slate-700">{[form.deptName, form.reason].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Time</p>
              <p className="text-sm text-slate-700">{outTime ? (inTime ? `${outTime} - ${inTime}` : outTime) : "—"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const GatePassRequest = () => {
  const { passes, initialLoading, refreshing, fetchPasses, createPass } =
    useGatePasses();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const recentRequests = useMemo(
    () =>
      [...passes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 15),
    [passes],
  );

  const { pendingCount, pendingPct } = useMemo(() => {
    const pending = passes.filter((p) => p.status === "Pending Dept Head" || p.status === "Pending HR").length;
    const active = passes.filter((p) => p.status !== "Completed" && p.status !== "Rejected").length;
    return { pendingCount: pending, pendingPct: active > 0 ? Math.round((pending / active) * 100) : 0 };
  }, [passes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = REQUIRED_FIELDS.filter((f) => !form[f]?.trim?.());
    if (missing.length) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    const ok = await createPass(form);
    if (ok) setForm(EMPTY_FORM);
    setSubmitting(false);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <div className="px-5 py-4 bg-white border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-800">
          Request Gate Pass <span className="text-sm font-normal text-slate-400">— Out-pass request for approval</span>
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <form onSubmit={handleSubmit} className="lg:col-span-2 flex flex-col gap-4">
            {/* Employee section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                <UserRound className="w-3.5 h-3.5 text-blue-500" /> Employee
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel hint="Type to search by employee code — pick a match to auto-fill the rest">Employee Code</FieldLabel>
                  <EmployeeCodeLookup
                    value={form.empCode}
                    onChange={(v) => setForm((f) => ({ ...f, empCode: v }))}
                    onSelect={(emp) =>
                      setForm((f) => ({
                        ...f,
                        empCode: emp.empCode,
                        empName: emp.empName || f.empName,
                        contactNo: emp.contactNo || f.contactNo,
                        deptName: emp.deptName || f.deptName,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Employee Name</FieldLabel>
                  <input className={inputCls} value={form.empName} onChange={handleChange("empName")} />
                </div>
                <div>
                  <FieldLabel icon={Building2}>Department</FieldLabel>
                  <input className={inputCls} value={form.deptName} onChange={handleChange("deptName")} />
                </div>
                <div>
                  <FieldLabel icon={Phone}>Contact No.</FieldLabel>
                  <input className={inputCls} value={form.contactNo} onChange={handleChange("contactNo")} />
                </div>
              </div>
            </div>

            {/* Visit details section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                <MapPinned className="w-3.5 h-3.5 text-blue-500" /> Visit Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel icon={MapPinned}>Place of Visit</FieldLabel>
                  <input className={inputCls} value={form.placeOfVisit} onChange={handleChange("placeOfVisit")} />
                </div>
                <div>
                  <FieldLabel icon={MessageSquare}>Reason</FieldLabel>
                  <input className={inputCls} value={form.reason} onChange={handleChange("reason")} />
                </div>
                <SelectField label="Pass Type" options={TYPE_OPTIONS} value={form.type} onChange={handleChange("type")} />
                <SelectField label="Coming Back?" options={COMING_BACK_OPTIONS} value={form.comingBack} onChange={handleChange("comingBack")} />
              </div>
            </div>

            {/* Timing section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                <CalendarClock className="w-3.5 h-3.5 text-blue-500" /> Timing
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DateTimePicker label="Out Date & Time" name="outDateTime" value={form.outDateTime} onChange={handleChange("outDateTime")} />
                <DateTimePicker label="Expected In (optional)" name="expectedInDateTime" value={form.expectedInDateTime} onChange={handleChange("expectedInDateTime")} />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer w-full ${
                submitting
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-teal-700 hover:bg-teal-800 text-white shadow-md shadow-teal-200"
              }`}
            >
              {submitting ? <Spinner cls="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>

          {/* Sidebar */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Pending Requests Overview</p>
                <button onClick={() => fetchPasses()} disabled={refreshing} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer disabled:opacity-50">
                  <RefreshCcw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
              <div className="flex items-center justify-center">
                <PendingDonut pendingCount={pendingCount} pct={pendingPct} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">Pass Preview</p>
              <PassPreviewCard form={form} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Recent Requests
          </p>
          {recentRequests.length === 0 ? (
            <EmptyState
              title="No passes yet"
              subtitle="Submit a request above to get started."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recentRequests.map((p) => (
                <div
                  key={p.id}
                  className="border border-slate-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Avatar name={p.empName} empCode={p.empCode} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {p.empName}{" "}
                        <span className="text-slate-400 font-normal">· {p.empCode}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.deptName} · {p.type} · {p.placeOfVisit}
                      </p>
                    </div>
                  </div>
                  <StatusPipeline pass={p} compact />
                  <ElapsedBadge since={p.createdAt} urgentAfterMinutes={480} warnAfterMinutes={120} />
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GatePassRequest;
