export const StatCard = ({ label, value, accentHex = "#1e40af", sub }) => (
  <div
    className="relative bg-white rounded-xl p-4 shadow-sm border border-slate-100 overflow-hidden"
    style={{ borderLeft: `4px solid ${accentHex}` }}
  >
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
      {label}
    </p>
    <p className="text-3xl font-black font-mono" style={{ color: accentHex }}>
      {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
    </p>
    {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    <div
      className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full opacity-10"
      style={{ background: accentHex }}
    />
  </div>
);