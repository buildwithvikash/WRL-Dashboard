import { Fragment, useMemo, useState } from "react";
import {
  Search, ListChecks, Clock3, LogOut as LogOutStat, CheckCircle2, ChevronDown,
  UserCheck2, ShieldCheck, LogOut, LogIn, PenLine, Building2, Tag, CalendarRange,
} from "lucide-react";
import Loader from "../../components/ui/Loader.jsx";
import ExportButton from "../../components/ui/ExportButton.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx";
import { StatusBadge, EmptyState, Avatar, StatusPipeline, FilterPill } from "../../components/employeeManagement/Gatepassui.jsx";
import { formatDateTime, inDateRange, toExportRow } from "../../components/employeeManagement/gatePassHelpers.js";
import { STATUS_FILTER_OPTIONS } from "./Constants.js";

// One row of the expanded timeline — a stage that already happened (name +
// timestamp present), one still pending, or one that never happened because
// the pass was rejected before reaching it.
const TimelineStep = ({ icon: Icon, label, name, at, skipped }) => (
  <div className={`flex items-center gap-3 py-2 ${skipped ? "opacity-40" : ""}`}>
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${name ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      {name ? (
        <p className="text-[11px] text-slate-400">{name} · {at}</p>
      ) : (
        <p className="text-[11px] text-slate-300">{skipped ? "Skipped" : "Not yet"}</p>
      )}
    </div>
  </div>
);

// Who is expected to act next (and who already did) — the "Pending
// Approvals" detail the reports mockup shows on expand.
const ApprovalSteps = ({ pass }) => {
  const steps = [
    { label: "Dept Head", name: pass.deptHeadName, done: Boolean(pass.deptHeadAt), pending: pass.status === "Pending Dept Head" },
    { label: "HR", name: pass.hrName, done: Boolean(pass.hrAt), pending: pass.status === "Pending HR" },
  ];
  const relevant = steps.filter((s) => s.done || s.pending);
  if (relevant.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <p className="text-[11px] font-semibold text-slate-500 mb-1">
        {pass.status === "Pending Dept Head" || pass.status === "Pending HR" ? "Pending Approvals" : "Approvals"}
      </p>
      <ul className="space-y-0.5">
        {relevant.map((s, i) => (
          <li key={s.label} className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="text-slate-400">Step {i + 1}: {s.label}</span>
            {s.done ? (
              <span className="text-slate-600 font-medium">— {s.name || "—"}</span>
            ) : (
              <span className="text-amber-600 font-medium">— awaiting action</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ExpandedRow = ({ pass }) => {
  const rejectedAtHr = pass.status === "Rejected" && pass.hrAt;
  const rejectedAtDeptHead = pass.status === "Rejected" && !pass.hrAt;
  return (
    <tr className="bg-slate-50/70">
      <td colSpan={7} className="px-5 py-3 border-b border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-6 divide-y sm:divide-y-0 divide-slate-100">
          <TimelineStep icon={PenLine} label="Requested" name={pass.empName} at={pass.createdAt ? new Date(pass.createdAt).toLocaleString("en-IN") : ""} />
          <TimelineStep icon={UserCheck2} label="Dept Head" name={pass.deptHeadName} at={pass.deptHeadAt} skipped={false} />
          <TimelineStep icon={ShieldCheck} label="HR" name={pass.hrName} at={pass.hrAt} skipped={rejectedAtDeptHead} />
          <TimelineStep icon={LogOut} label="Gate Out" name={pass.securityOutName} at={pass.gateOutAt} skipped={rejectedAtDeptHead || rejectedAtHr} />
          <TimelineStep icon={LogIn} label="Gate In" name={pass.securityInName} at={pass.gateInAt} skipped={rejectedAtDeptHead || rejectedAtHr} />
        </div>
        {(pass.reason || pass.placeOfVisit) && (
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">{pass.placeOfVisit}</span> — {pass.reason}
            {pass.contactNo && <span className="text-slate-400"> · {pass.contactNo}</span>}
          </div>
        )}
        <ApprovalSteps pass={pass} />
      </td>
    </tr>
  );
};

const GatePassReports = () => {
  const { passes, initialLoading, refreshing, fetchPasses } = useGatePasses();

  const [statusFilter, setStatusFilter] = useState("All");
  const [department, setDepartment] = useState("all");
  const [passType, setPassType] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const counts = useMemo(() => {
    const c = { total: passes.length, pending: 0, out: 0, completed: 0 };
    for (const p of passes) {
      if (p.status === "Pending Dept Head" || p.status === "Pending HR") c.pending++;
      if (p.status === "Out") c.out++;
      if (p.status === "Completed") c.completed++;
    }
    return c;
  }, [passes]);

  const departmentOptions = useMemo(() => {
    const names = [...new Set(passes.map((p) => p.deptName).filter(Boolean))].sort();
    return [{ value: "all", label: "All Departments" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [passes]);

  const rows = useMemo(() => {
    let list = [...passes];
    if (statusFilter !== "All") list = list.filter((p) => p.status === statusFilter);
    if (department !== "all") list = list.filter((p) => p.deptName === department);
    if (passType !== "all") list = list.filter((p) => p.type === passType);
    if (dateRange !== "all") list = list.filter((p) => inDateRange(p.createdAt, dateRange));
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((p) => `${p.empName}${p.empCode}${p.deptName}`.toLowerCase().includes(s));
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [passes, statusFilter, department, passType, dateRange, search]);

  const selectedRows = useMemo(() => rows.filter((p) => selectedIds.has(p.id)), [rows, selectedIds]);
  const exportData = (selectedRows.length ? selectedRows : rows).map(toExportRow);

  const toggleRow = (id) => setSelectedIds((set) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelectedIds((set) =>
    set.size === rows.length ? new Set() : new Set(rows.map((p) => p.id)),
  );

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        icon={ListChecks}
        title="Gate Pass Reports"
        subtitle="Complete history and current state of every gate pass"
        stats={[
          { label: "Total", value: counts.total, tone: "blue", icon: ListChecks },
          { label: "Pending", value: counts.pending, tone: "amber", icon: Clock3 },
          { label: "Out", value: counts.out, tone: "red", icon: LogOutStat },
          { label: "Complete", value: counts.completed, tone: "emerald", icon: CheckCircle2 },
        ]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
        refreshLabel="Refresh Dashboard"
      />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Report Tools</p>
          <div className="flex items-end gap-3 flex-wrap">
            <ExportButton
              data={exportData}
              filename="Gate_Pass_Report"
              label={selectedRows.length ? `Export Selected (${selectedRows.length})` : "Export"}
            />

            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Department</p>
              <FilterPill icon={Building2} value={department} onChange={(e) => setDepartment(e.target.value)} options={departmentOptions} />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</p>
              <FilterPill
                icon={Tag}
                value={passType}
                onChange={(e) => setPassType(e.target.value)}
                options={[
                  { value: "all", label: "All Types" },
                  { value: "Official", label: "Official" },
                  { value: "Personal", label: "Personal" },
                ]}
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Date Range</p>
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
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</p>
              <FilterPill
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={STATUS_FILTER_OPTIONS}
              />
            </div>

            <div className="flex-1 min-w-[220px]">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Search</p>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search by Employee Name, Code, or Dept…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            {rows.length === 0 ? (
              <EmptyState title="No matching passes" subtitle="Try a different filter or search term." />
            ) : (
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2.5 border-b border-slate-200 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === rows.length}
                        onChange={toggleAll}
                        className="cursor-pointer"
                      />
                    </th>
                    {["Employee", "Dept", "Type", "Out", "Pipeline", "Status"].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const isOpen = expandedId === p.id;
                    const isChecked = selectedIds.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className={`transition-colors ${isOpen ? "bg-blue-50/60" : "hover:bg-blue-50/40 even:bg-slate-50/40"}`}>
                          <td className="px-3 py-2 border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleRow(p.id)} className="cursor-pointer" />
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap cursor-pointer" onClick={() => setExpandedId(isOpen ? null : p.id)}>
                            <div className="flex items-center gap-2">
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              <Avatar name={p.empName} size="sm" />
                              <div>
                                <span className="font-medium text-slate-800 block">{p.empName}</span>
                                <span className="text-slate-400">{p.empCode}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">{p.deptName}</td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">{p.type}</td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap font-mono text-[11px]">{formatDateTime(p.outDateTime)}</td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <StatusPipeline pass={p} compact />
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <StatusBadge status={p.status} />
                          </td>
                        </tr>
                        {isOpen && <ExpandedRow pass={p} />}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatePassReports;
