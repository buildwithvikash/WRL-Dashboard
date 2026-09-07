import { RefreshCcw } from "lucide-react";

/**
 * stats: [{ label, value, tone }] — tone is one of "amber" | "emerald" | "blue" | "slate"
 */
const TONE_STYLES = {
  amber: {
    box: "bg-amber-50 border-amber-100",
    value: "text-amber-700",
    label: "text-amber-600",
  },
  emerald: {
    box: "bg-emerald-50 border-emerald-100",
    value: "text-emerald-700",
    label: "text-emerald-500",
  },
  blue: {
    box: "bg-blue-50 border-blue-100",
    value: "text-blue-700",
    label: "text-blue-500",
  },
  slate: {
    box: "bg-slate-100 border-slate-200",
    value: "text-slate-700",
    label: "text-slate-500",
  },
};

const GatePassHeader = ({
  title,
  subtitle,
  stats = [],
  refreshing,
  onRefresh,
}) => (
  <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm shrink-0 flex-wrap gap-3">
    <div>
      <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
        {title}
      </h1>
      {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">
      {stats.map(({ label, value, tone = "slate" }) => {
        const s = TONE_STYLES[tone] || TONE_STYLES.slate;
        return (
          <div
            key={label}
            className={`flex flex-col items-center px-4 py-1.5 rounded-lg border min-w-[80px] ${s.box}`}
          >
            <span className={`text-xl font-bold font-mono ${s.value}`}>
              {value}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide ${s.label}`}
            >
              {label}
            </span>
          </div>
        );
      })}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCcw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      )}
    </div>
  </div>
);

export default GatePassHeader;
