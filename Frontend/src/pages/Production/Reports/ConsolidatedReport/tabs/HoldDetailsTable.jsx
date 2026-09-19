import { Lock, Unlock } from "lucide-react";
import EmptyState from "../../../../../components/ui/EmptyState";

function StatusBadge({ status }) {
  const isHold = status === "Hold";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
        isHold
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      {isHold ? (
        <Lock className="w-2.5 h-2.5" />
      ) : (
        <Unlock className="w-2.5 h-2.5" />
      )}
      {status}
    </span>
  );
}

function DaysBadge({ days }) {
  const cfg =
    days > 7
      ? "bg-rose-50 text-rose-600 border-rose-200"
      : days > 3
        ? "bg-amber-50 text-amber-600 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md font-semibold text-xs border ${cfg}`}
    >
      {days}d
    </span>
  );
}

function fmt(d) {
  return d ? d.replace("T", " ").replace("Z", "").slice(0, 16) : "—";
}

function HoldDetailsTable({ data }) {
  if (!Array.isArray(data))
    return <EmptyState message="No hold data found." />;

  const onHold = data.filter((d) => d.Status === "Hold").length;
  const released = data.filter((d) => d.Status === "Release").length;

  const headers = [
    "Model",
    "Hold Reason",
    "Responsible Dept.",
    "Responsible HOD",
    "Target Rework Completion",
    "Hold Date",
    "Hold By",
    "Days on Hold",
    "Corrective Action",
    "Released On",
    "Released By",
    "Status",
  ];

  return (
    <div className="flex flex-col gap-4">
      {data.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-100 shadow-sm">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                On Hold
              </p>
              <p className="text-sm font-black text-amber-700">{onHold}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-emerald-100 shadow-sm">
            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Released
              </p>
              <p className="text-sm font-black text-emerald-700">
                {released}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[500px] rounded-xl border border-slate-200 shadow-sm">
        <table className="min-w-full text-xs text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr className="bg-amber-500 text-white">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center border-r border-white/10 last:border-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((item, idx) => (
                <tr
                  key={idx}
                  className={`text-center transition-colors hover:bg-amber-50/30 ${
                    item.Status === "Hold"
                      ? "bg-amber-50/40"
                      : idx % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50/40"
                  }`}
                >
                  <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap font-bold text-slate-800">
                    {item.ModelNo}
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-slate-100 text-left max-w-[180px] truncate text-slate-600"
                    title={item.HoldReason}
                  >
                    {item.HoldReason || "—"}
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-slate-100 text-left max-w-[160px] truncate text-slate-600"
                    title={item.ResponsibleDepartment}
                  >
                    {item.ResponsibleDepartment || "—"}
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-slate-100 text-left max-w-[160px] truncate text-slate-600"
                    title={item.ResponsibleHOD}
                  >
                    {item.ResponsibleHOD || "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 font-mono text-slate-500 whitespace-nowrap">
                    {fmt(item.TargetDateOfReworkCompletion)}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 font-mono text-slate-500 whitespace-nowrap">
                    {fmt(item.HoldDate)}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap text-slate-700 font-medium">
                    {item.HoldBy || "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100">
                    <DaysBadge days={item.DaysOnHold} />
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-slate-100 text-left max-w-[180px] truncate text-slate-600"
                    title={item.CorrectiveAction}
                  >
                    {item.CorrectiveAction || "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 font-mono text-slate-500 whitespace-nowrap">
                    {fmt(item.ReleasedOn)}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap text-slate-700 font-medium">
                    {item.ReleasedBy || "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100">
                    <StatusBadge status={item.Status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Lock className="w-10 h-10 opacity-20" strokeWidth={1.2} />
                    <p className="text-sm">
                      No hold history found for this serial number.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HoldDetailsTable;
