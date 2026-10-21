export const MetricTable = ({ rows, accentHex }) => (
  <table className="w-full border-separate border-spacing-0 text-xs">
    <thead>
      <tr>
        {[
          ["45%", "Metric", "left"],
          ["10%", "Unit", "center"],
          ["22%", "Target", "center"],
          ["23%", "Actual", "center"],
        ].map(([w, lbl, align]) => (
          <th
            key={lbl}
            className="px-2.5 py-2 text-white font-bold border border-white/20"
            style={{
              background: accentHex,
              textAlign: align,
              width: w,
              fontSize: 11,
            }}
          >
            {lbl}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => {
        const actualColor =
          r.highlight === "yellow"
            ? "#f59e0b"
            : r.green
              ? "#15803d"
              : "#0f172a";
        const mergeColumns = r.target == null;
        return (
          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
            <td className="px-2.5 py-1.5 border border-slate-100 text-slate-700 font-semibold">
              {r.label}
            </td>
            <td className="px-2.5 py-1.5 border border-slate-100 text-slate-400 text-center text-[11px]">
              {r.unit}
            </td>
            {mergeColumns ? (
              <td
                colSpan={2}
                className="px-2.5 py-1.5 border border-slate-100 font-extrabold text-center"
                style={{ color: actualColor }}
              >
                {r.actual ?? "—"}
              </td>
            ) : (
              <>
                <td
                  className="px-2.5 py-1.5 border border-slate-100 font-bold text-center"
                  style={{ color: accentHex }}
                >
                  {r.target ?? "—"}
                </td>
                <td
                  className="px-2.5 py-1.5 border border-slate-100 font-extrabold text-center"
                  style={{ color: actualColor }}
                >
                  {r.actual ?? "—"}
                </td>
              </>
            )}
          </tr>
        );
      })}
    </tbody>
  </table>
);
