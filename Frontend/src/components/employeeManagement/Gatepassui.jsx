import { Loader2, Inbox } from "lucide-react";
import { STATUS_STYLES } from "../../pages/EmployeeManagement/Constants.js";

export const Spinner = ({ cls = "w-4 h-4" }) => (
  <Loader2 className={`animate-spin ${cls}`} />
);

export const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
      STATUS_STYLES[status] || "bg-slate-100 text-slate-500 border-slate-200"
    }`}
  >
    {status}
  </span>
);

export const EmptyState = ({ title, subtitle }) => (
  <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-14">
    <Inbox className="w-10 h-10 opacity-25" strokeWidth={1.2} />
    <p className="text-sm font-medium text-slate-500">{title}</p>
    {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
  </div>
);