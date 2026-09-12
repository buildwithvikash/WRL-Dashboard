import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import SelectField from "../../components/ui/SelectField.jsx";
import Loader from "../../components/ui/Loader.jsx";
import ExportButton from "../../components/ui/ExportButton.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx"
import { StatusBadge, EmptyState } from "../../components/employeeManagement/Gatepassui.jsx"
import { STATUS_FILTER_OPTIONS } from "./Constants.js";

const GatePassReports = () => {
  const { passes, initialLoading, refreshing, fetchPasses, fetchExportData } =
    useGatePasses();
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  const badges = useMemo(
    () => ({
      "/gatepass/depthead": passes.filter(
        (p) => p.status === "Pending Dept Head",
      ).length,
      "/gatepass/hr-approval": passes.filter((p) => p.status === "Pending HR")
        .length,
      "/gatepass/security": passes.filter(
        (p) => p.status === "Approved" || p.status === "Out",
      ).length,
    }),
    [passes],
  );

  const rows = useMemo(() => {
    let list = [...passes];
    if (statusFilter !== "All") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((p) =>
        `${p.empName}${p.empCode}${p.deptName}`.toLowerCase().includes(s),
      );
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [passes, statusFilter, search]);

  const handleExport = () =>
    fetchExportData({
      status: statusFilter !== "All" ? statusFilter : undefined,
      search: search.trim() || undefined,
    });

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        title="Gate Pass Reports"
        subtitle="Complete history and current state of every gate pass"
        stats={[{ label: "Total", value: passes.length, tone: "slate" }]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              All Passes
            </p>
            {rows.length > 0 && (
              <ExportButton
                fetchData={handleExport}
                filename="Gate_Pass_Report"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3 mb-3">
            <div className="min-w-[190px]">
              <SelectField
                label="Status"
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Name, code, or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {rows.length === 0 ? (
              <EmptyState
                title="No matching passes"
                subtitle="Try a different filter or search term."
              />
            ) : (
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    {["Employee", "Dept", "Type", "Out", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-blue-50/60 transition-colors even:bg-slate-50/40"
                    >
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {p.empName}
                        </span>
                        <br />
                        <span className="text-slate-400">{p.empCode}</span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        {p.deptName}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        {p.type}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap font-mono text-[11px]">
                        {p.outDateTime}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
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
