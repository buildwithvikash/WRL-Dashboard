import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  DoorOpen, Footprints, RefreshCcw, SlidersHorizontal, Search, CalendarRange,
  Building2, Tag, AlertTriangle, UserRound, MoreVertical, Printer,
  PenLine, UserCheck2, ShieldCheck, LogOut, LogIn,
} from "lucide-react";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx";
import { EmptyState, Avatar, StatusPipeline, FilterPill } from "../../components/employeeManagement/Gatepassui.jsx";
import { formatDateTime, isSameDay, inDateRange, printGatePassSlip } from "../../components/employeeManagement/gatePassHelpers.js";
import { STAGE_SEQUENCE, getPipelineInfo } from "./Constants.js";

const isOverdue = (pass) => pass.expectedInDateTime && new Date(pass.expectedInDateTime).getTime() < Date.now();

// ── Filters ──────────────────────────────────────────────────────────────
const applyFilters = (list, { search, department, passType, dateRange }) => {
  let out = list;
  if (department !== "all") out = out.filter((p) => p.deptName === department);
  if (passType !== "all") out = out.filter((p) => p.type === passType);
  if (dateRange !== "all") out = out.filter((p) => inDateRange(p.createdAt, dateRange));
  const s = search.trim().toLowerCase();
  if (s) out = out.filter((p) => `${p.empName}${p.empCode}${p.deptName}${p.placeOfVisit}`.toLowerCase().includes(s));
  return out;
};

// ── Small shared bits ────────────────────────────────────────────────────
const TypeBadge = ({ type }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
    type === "Personal" ? "bg-violet-50 text-violet-600 border-violet-100" : "bg-blue-50 text-blue-600 border-blue-100"
  }`}>
    {type}
  </span>
);

const CHIP_TONES = {
  slate: "bg-slate-50 border-slate-200 text-slate-600",
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  red: "bg-red-50 border-red-200 text-red-700",
};
const Chip = ({ label, value, tone = "slate" }) => (
  <div className={`border rounded-lg px-2.5 py-1.5 min-w-0 ${CHIP_TONES[tone]}`}>
    <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
    <p className="text-xs font-semibold truncate">{value}</p>
  </div>
);

// Live-ticking HH:MM:SS until (or since) the expected return time.
const Countdown = ({ expectedInDateTime, comingBack }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (comingBack === "No" || !expectedInDateTime) {
    return <span className="text-xs text-slate-400">Not returning</span>;
  }
  const diffMs = new Date(expectedInDateTime).getTime() - now;
  const overdue = diffMs < 0;
  const totalSec = Math.floor(Math.abs(diffMs) / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return (
    <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${overdue ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
      {overdue ? "−" : ""}{hh}:{mm}:{ss}
    </span>
  );
};

const RowMenu = ({ onMarkIn, onViewTimeline }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-xs">
          <button onClick={() => { onViewTimeline(); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer">
            View Timeline
          </button>
          <button onClick={() => { onMarkIn(); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-700 font-semibold cursor-pointer">
            Mark Gate In
          </button>
        </div>
      )}
    </div>
  );
};

// ── Approval Timeline (right panel) ─────────────────────────────────────
const TIMELINE_ICONS = [PenLine, UserCheck2, ShieldCheck, LogOut, LogIn];
const TIMELINE_NAME_KEYS = ["empName", "deptHeadName", "hrName", "securityOutName", "securityInName"];
const TIMELINE_AT_KEYS = ["createdAt", "deptHeadAt", "hrAt", "gateOutAt", "gateInAt"];

const STEP_PILL = {
  submitted: "bg-slate-100 text-slate-500",
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  waiting: "bg-slate-50 text-slate-300",
};

const ApprovalTimeline = ({ pass, approverName, busy, onMarkOut, onMarkIn, onPrint }) => {
  const { completedUpTo, activeIndex, rejectedIndex } = getPipelineInfo(pass);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-full">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Approval Timeline</p>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {STAGE_SEQUENCE.map((stage, i) => {
          const Icon = TIMELINE_ICONS[i];
          const name = pass[TIMELINE_NAME_KEYS[i]];
          const at = pass[TIMELINE_AT_KEYS[i]];
          const isRejectedHere = rejectedIndex === i;
          const isDone = i <= completedUpTo && rejectedIndex === null;
          const isActive = activeIndex === i;
          const isSkipped = rejectedIndex !== null && i > rejectedIndex;

          let pillKey = "waiting";
          let pillText = "Waiting";
          if (isRejectedHere) { pillKey = "rejected"; pillText = "Rejected"; }
          else if (isDone && i === 0) { pillKey = "submitted"; pillText = "Submitted"; }
          else if (isDone) { pillKey = "approved"; pillText = "Approved"; }
          else if (isActive) { pillKey = "pending"; pillText = "Pending"; }
          else if (isSkipped) { pillKey = "waiting"; pillText = "Skipped"; }

          return (
            <div key={stage.key} className="flex gap-3 pb-4 last:pb-0 relative">
              {i < STAGE_SEQUENCE.length - 1 && (
                <span className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${isDone || isRejectedHere ? "bg-emerald-200" : "bg-slate-100"}`} />
              )}
              <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                isRejectedHere ? "bg-red-100 text-red-600" : isDone ? "bg-emerald-100 text-emerald-600" : isActive ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-300"
              }`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1 flex items-start justify-between gap-2 pt-0.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{stage.label}{name && !isSkipped ? ` (${name})` : ""}</p>
                  <p className="text-[10px] text-slate-400">{at ? formatDateTime(at) : isSkipped ? "Skipped" : "Not yet"}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${STEP_PILL[pillKey]}`}>{pillText}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
        <span className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 bg-slate-50">
          <UserRound className="w-3.5 h-3.5 text-slate-400 shrink-0" /> Acting as: {approverName || "—"}
        </span>
        {pass.status === "Approved" && (
          <button disabled={busy} onClick={onMarkOut} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm">
            <LogOut className="w-4 h-4" /> Mark Gate Out
          </button>
        )}
        {pass.status === "Out" && (
          <button disabled={busy} onClick={onMarkIn} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm">
            <LogIn className="w-4 h-4" /> Mark Gate In
          </button>
        )}
        {!["Approved", "Out"].includes(pass.status) && (
          <p className="text-[11px] text-slate-400 text-center py-1">No gate action available at this stage.</p>
        )}
        <button onClick={onPrint} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all cursor-pointer">
          <Printer className="w-3.5 h-3.5" /> Re-Print Pass
        </button>
      </div>
    </div>
  );
};

const GatePassSecurityGate = () => {
  const { passes, initialLoading, refreshing, actionId, fetchPasses, security } = useGatePasses();
  const { user } = useSelector((store) => store.auth);
  const approverName = user?.name || "";

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [passType, setPassType] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const departmentOptions = useMemo(() => {
    const names = [...new Set(passes.map((p) => p.deptName).filter(Boolean))].sort();
    return [{ value: "all", label: "All Departments" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [passes]);

  const readyForOut = useMemo(
    () => applyFilters(
      [...passes.filter((p) => p.status === "Approved")].sort((a, b) => new Date(a.outDateTime) - new Date(b.outDateTime)),
      { search, department, passType, dateRange },
    ),
    [passes, search, department, passType, dateRange],
  );
  const currentlyOut = useMemo(
    () => applyFilters(
      [...passes.filter((p) => p.status === "Out")].sort((a, b) => new Date(a.gateOutAt) - new Date(b.gateOutAt)),
      { search, department, passType, dateRange },
    ),
    [passes, search, department, passType, dateRange],
  );
  const overdueCount = useMemo(() => passes.filter((p) => p.status === "Out" && isOverdue(p)).length, [passes]);

  const todaysPasses = useMemo(
    () => passes.filter((p) => p.createdAt && isSameDay(new Date(p.createdAt), new Date())),
    [passes],
  );
  const summary = useMemo(() => {
    let approved = 0, pending = 0, rejected = 0;
    for (const p of todaysPasses) {
      if (p.status === "Rejected") rejected++;
      else if (p.status === "Pending Dept Head" || p.status === "Pending HR") pending++;
      else if (p.hrAt) approved++;
    }
    return { total: todaysPasses.length, approved, pending, rejected };
  }, [todaysPasses]);

  const recentActivity = useMemo(() => {
    const withEvent = todaysPasses.map((p) => {
      if (p.status === "Rejected") {
        const atHr = Boolean(p.hrAt);
        return { pass: p, at: atHr ? p.hrAt : p.deptHeadAt, label: "Rejected", tone: "bg-red-50 text-red-600" };
      }
      if (p.gateInAt) return { pass: p, at: p.gateInAt, label: "Gate In", tone: "bg-slate-100 text-slate-500" };
      if (p.gateOutAt) return { pass: p, at: p.gateOutAt, label: "Out", tone: "bg-blue-50 text-blue-600" };
      if (p.hrAt) return { pass: p, at: p.hrAt, label: "HR Approved", tone: "bg-emerald-50 text-emerald-600" };
      if (p.deptHeadAt) return { pass: p, at: p.deptHeadAt, label: "Dept Head Approved", tone: "bg-emerald-50 text-emerald-600" };
      return { pass: p, at: p.createdAt, label: "Requested", tone: "bg-slate-100 text-slate-500" };
    });
    return withEvent
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);
  }, [todaysPasses]);

  const selectable = useMemo(() => [...readyForOut, ...currentlyOut], [readyForOut, currentlyOut]);
  const selected = selectable.find((p) => p.id === selectedId) || selectable[0] || null;

  const handleAction = async (id, direction) => {
    if (!approverName) {
      toast.error("Could not determine your logged-in name.");
      return;
    }
    await security(id, direction, approverName);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        icon={DoorOpen}
        title="Security Gate"
        stats={[
          { label: "Ready", value: readyForOut.length, tone: "emerald", icon: DoorOpen },
          { label: "Out", value: currentlyOut.length, tone: "red", icon: Footprints },
          ...(overdueCount > 0 ? [{ label: "Overdue", value: overdueCount, tone: "amber", icon: AlertTriangle }] : []),
        ]}
        extra={
          <>
            <button
              onClick={() => fetchPasses()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                showFilters ? "border-blue-300 text-blue-600 bg-blue-50/50" : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced Options
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-hidden p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0 overflow-auto flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search employee, code, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {showFilters && (
              <>
                <FilterPill
                  icon={CalendarRange}
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  options={[
                    { value: "all", label: "All Dates" },
                    { value: "today", label: "Today" },
                    { value: "yesterday", label: "Yesterday" },
                    { value: "7d", label: "Last 7 Days" },
                  ]}
                />
                <FilterPill icon={Building2} value={department} onChange={(e) => setDepartment(e.target.value)} options={departmentOptions} />
                <FilterPill
                  icon={Tag}
                  value={passType}
                  onChange={(e) => setPassType(e.target.value)}
                  options={[
                    { value: "all", label: "All Pass Types" },
                    { value: "Official", label: "Official" },
                    { value: "Personal", label: "Personal" },
                  ]}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <DoorOpen className="w-3.5 h-3.5 text-emerald-500" /> Ready for Gate Out
              </p>
              <p className="text-xs text-slate-400 mb-3">Approved passes waiting to exit — oldest first.</p>
              {readyForOut.length === 0 ? (
                <EmptyState title="Nothing to release" subtitle="Approved passes will appear here." />
              ) : (
                <div className="flex flex-col gap-2">
                  {readyForOut.map((p) => {
                    const isSelected = selected?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          isSelected ? "border-blue-300 ring-1 ring-blue-100 bg-blue-50/30" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={p.empName} empCode={p.empCode} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {p.empName} <span className="text-slate-400 font-normal text-xs">· {p.empCode}</span>
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {p.deptName} · {p.placeOfVisit}
                              {p.contactNo ? ` · Contact: ${p.contactNo}` : ""}
                            </p>
                          </div>
                          <TypeBadge type={p.type} />
                        </div>
                        {isSelected && (
                          <>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <Chip label="Reason" value={p.reason || "—"} />
                              <Chip label="Contact" value={p.contactNo || "—"} />
                              <Chip label="Scheduled Out" value={formatDateTime(p.outDateTime)} tone="blue" />
                              <Chip
                                label="Expected Return"
                                value={p.comingBack === "No" ? "Not returning today" : formatDateTime(p.expectedInDateTime)}
                                tone={p.comingBack === "No" ? "red" : "slate"}
                              />
                            </div>
                            <div className="mt-3">
                              <StatusPipeline pass={p} compact />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selected ? (
              <ApprovalTimeline
                pass={selected}
                approverName={approverName}
                busy={actionId === selected.id}
                onMarkOut={() => handleAction(selected.id, "out")}
                onMarkIn={() => handleAction(selected.id, "in")}
                onPrint={() => printGatePassSlip(selected)}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex items-center justify-center">
                <EmptyState title="Nothing selected" subtitle="Pick a pass to see its approval timeline." />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <Footprints className="w-3.5 h-3.5 text-blue-500" /> Currently Out
            </p>
            <p className="text-xs text-slate-400 mb-3">Log the return when the employee is back.</p>
            {currentlyOut.length === 0 ? (
              <EmptyState title="Everyone's in" subtitle="No one is currently marked out." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-slate-50">
                      {["Name", "Out", "Expected In", ""].map((h) => (
                        <th key={h} className="px-3 py-2 font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentlyOut.map((p) => {
                      const overdue = isOverdue(p);
                      const isSelected = selected?.id === p.id;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-3 py-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={p.empName} empCode={p.empCode} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">
                                  {p.empName} <span className="text-slate-400 font-normal">· {p.empCode}</span>
                                </p>
                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 flex-wrap">
                                  {p.deptName} · {p.placeOfVisit} <TypeBadge type={p.type} />
                                  {overdue && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 whitespace-nowrap">{formatDateTime(p.gateOutAt)}</td>
                          <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                            <Countdown expectedInDateTime={p.expectedInDateTime} comingBack={p.comingBack} />
                          </td>
                          <td className="px-3 py-2.5 border-b border-slate-100 text-right" onClick={(e) => e.stopPropagation()}>
                            <RowMenu onMarkIn={() => handleAction(p.id, "in")} onViewTimeline={() => setSelectedId(p.id)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0 overflow-y-auto flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Today's Shift Status</p>
            <p className="text-xs font-bold text-slate-700 mb-2">Gate Pass Summary</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-slate-400">Total Today</span>
              <span className="text-lg font-bold text-slate-800 font-mono">{summary.total}</span>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Approved Today</span>
                <span className="font-semibold text-slate-700">{summary.approved}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending Review</span>
                <span className="font-semibold text-slate-700">{summary.pending}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Rejected Today</span>
                <span className="font-semibold text-slate-700">{summary.rejected}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col min-h-0">
            <p className="text-xs font-bold text-slate-700 mb-2">Employee Actions</p>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {recentActivity.length === 0 ? (
                <EmptyState title="No activity today" subtitle="Gate pass actions will show up here." />
              ) : (
                recentActivity.map(({ pass: p, label, tone, at }) => (
                  <div key={`${p.id}-${label}`} className="flex items-center gap-2.5 py-2.5 border-b border-slate-100 last:border-0">
                    <Avatar name={p.empName} empCode={p.empCode} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700 truncate">{p.empName}</p>
                      <p className="text-[10px] text-slate-400 truncate">{p.empCode} · {p.deptName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
                      <span className="text-[9px] text-slate-300">{formatDateTime(at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatePassSecurityGate;
