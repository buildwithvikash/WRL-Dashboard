import { useEffect, useState } from "react";
import { Loader2, Inbox, Check, X, ChevronDown } from "lucide-react";
import { STATUS_STYLES, STAGE_SEQUENCE, getPipelineInfo } from "../../pages/EmployeeManagement/Constants.js";

export const Spinner = ({ cls = "w-4 h-4" }) => (
  <Loader2 className={`animate-spin ${cls}`} />
);

export const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
      STATUS_STYLES[status] || "bg-slate-100 text-slate-500 border-slate-200"
    }`}
  >
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
    {status}
  </span>
);

// Compact icon-prefixed native <select>, styled as a filter pill — used by
// any page with a filter bar (Security Gate, Reports).
export const FilterPill = ({ icon: Icon, value, onChange, options }) => (
  <div className="relative">
    {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
    <select
      value={value}
      onChange={onChange}
      className={`appearance-none ${Icon ? "pl-9" : "pl-3"} pr-7 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);

export const EmptyState = ({ title, subtitle }) => (
  <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-14">
    <Inbox className="w-10 h-10 opacity-25" strokeWidth={1.2} />
    <p className="text-sm font-medium text-slate-500">{title}</p>
    {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
  </div>
);

// ── Avatar ──────────────────────────────────────────────────────────────
// Initials-based, color derived from the name so the same person always
// gets the same color across the whole module — a quick visual anchor in
// dense lists where every card otherwise looks alike.
const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
];

const hashString = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const initialsOf = (name) => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) || [];
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const Avatar = ({ name, size = "md" }) => {
  const sizeCls = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-12 h-12 text-sm" : "w-10 h-10 text-xs";
  const palette = AVATAR_PALETTE[hashString(name || "?") % AVATAR_PALETTE.length];
  return (
    <div className={`shrink-0 rounded-full flex items-center justify-center font-bold ${sizeCls} ${palette}`}>
      {initialsOf(name)}
    </div>
  );
};

// ── Elapsed time badge ─────────────────────────────────────────────────
// Relative "how long has this been sitting here" indicator that escalates
// color as it ages — a plain timestamp doesn't communicate urgency, this
// does at a glance. Ticks live via a 30s interval rather than being
// computed once at render.
const formatElapsed = (mins) => {
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const ElapsedBadge = ({ since, urgentAfterMinutes = 240, warnAfterMinutes = 60 }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!since) return null;
  const mins = (now - new Date(since).getTime()) / 60000;
  if (mins < 0) return null;

  const tone =
    mins >= urgentAfterMinutes
      ? "bg-red-50 text-red-600 border-red-100"
      : mins >= warnAfterMinutes
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-slate-50 text-slate-500 border-slate-200";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}>
      {formatElapsed(mins)} ago
    </span>
  );
};

// ── Status Pipeline ─────────────────────────────────────────────────────
// Requested → Dept Head → HR → Gate Out → Gate In, as a visual stepper.
// `compact` renders a small dots-only strip for table rows; the full form
// shows labels beneath each step for cards.
export const StatusPipeline = ({ pass, compact = false }) => {
  const { completedUpTo, activeIndex, rejectedIndex } = getPipelineInfo(pass);

  return (
    <div className={`flex items-center ${compact ? "gap-0.5" : "gap-1"}`}>
      {STAGE_SEQUENCE.map((stage, i) => {
        const isRejectedHere = rejectedIndex === i;
        const isDone = i <= completedUpTo && rejectedIndex === null;
        const isActive = activeIndex === i;
        const dotSize = compact ? "w-2 h-2" : "w-3 h-3";

        let dotCls = "bg-slate-200";
        if (isRejectedHere) dotCls = "bg-red-500";
        else if (isDone) dotCls = "bg-emerald-500";
        else if (isActive) dotCls = "bg-blue-500 ring-4 ring-blue-100 animate-pulse";
        else if (rejectedIndex !== null && i > rejectedIndex) dotCls = "bg-slate-150 opacity-50";

        const lineCls =
          i === 0
            ? ""
            : (i <= completedUpTo || (isRejectedHere && i - 1 <= completedUpTo)) && rejectedIndex === null
            ? "bg-emerald-400"
            : rejectedIndex !== null && i <= rejectedIndex
            ? "bg-red-300"
            : "bg-slate-200";

        return (
          <div key={stage.key} className="flex items-center" title={isRejectedHere ? `Rejected at ${stage.label}` : stage.label}>
            {i > 0 && <div className={`${compact ? "w-3" : "w-5"} h-0.5 ${lineCls} transition-colors`} />}
            <div className={`relative rounded-full flex items-center justify-center transition-all ${dotSize} ${dotCls}`}>
              {isRejectedHere && !compact && <X className="w-2 h-2 text-white" strokeWidth={4} />}
              {isDone && !compact && i > 0 && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
            </div>
            {!compact && (
              <span className={`ml-1 mr-1 text-[9px] font-semibold whitespace-nowrap ${
                isRejectedHere ? "text-red-500" : isActive ? "text-blue-600" : isDone ? "text-emerald-600" : "text-slate-300"
              }`}>
                {stage.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
