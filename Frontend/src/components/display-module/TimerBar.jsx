/* ── TimerBar ── */
export const TimerBar = ({ progress, accentHex }) => (
  <div className="h-0.75 bg-slate-100 shrink-0">
    <div
      className="h-full transition-all"
      style={{ width: `${progress}%`, background: accentHex }}
    />
  </div>
);
