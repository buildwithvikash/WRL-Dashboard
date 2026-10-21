import { memo, useEffect, useRef, useState } from "react";
import ReactSpeedometer from "react-d3-speedometer";

export const GaugePanel = memo(
  ({ value, maxValue = 1000, label, sublabel, accentHex }) => {
    const clamped = Math.min(Math.max(Number(value) || 0, 0), maxValue);
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ width: 400, height: 220 });

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const measure = () => {
        // ✅ FIX: clientWidth/clientHeight are NOT affected by the CSS
        // transform scale, unlike getBoundingClientRect().
        const width = el.clientWidth;
        const height = el.clientHeight;
        if (width > 0 && height > 0) {
          const maxW = Math.floor(width - 16);
          const maxH = Math.floor(height - 100);
          const finalW = Math.max(180, Math.min(maxW, maxH * 1.8));
          const finalH = Math.floor(finalW / 2);
          if (finalW > 100 && finalH > 50)
            setDims({ width: finalW, height: finalH });
        }
      };
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      measure();
      return () => ro.disconnect();
    }, []);

    const pct = maxValue > 0 ? (clamped / maxValue) * 100 : 0;
    const statusColor =
      pct >= 80 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#dc2626";
    const statusLabel =
      pct >= 80 ? "On Track" : pct >= 50 ? "Warning" : "Critical";

    return (
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center w-full h-full relative"
      >
        <div
          className="absolute inset-0 opacity-[0.04] rounded-2xl"
          style={{
            background: `radial-gradient(circle at 50% 60%, ${accentHex}, transparent 70%)`,
          }}
        />
        {(label || sublabel) && (
          <div className="text-center mb-2 z-10">
            {label && (
              <p
                className="text-lg font-extrabold uppercase tracking-[0.2em] font-mono"
                style={{ color: accentHex }}
              >
                {label}
              </p>
            )}
            {sublabel && (
              <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>
            )}
          </div>
        )}
        <div className="z-10">
          <ReactSpeedometer
            value={clamped}
            minValue={0}
            maxValue={maxValue}
            width={dims.width}
            height={dims.height}
            segments={10}
            segmentColors={[
              "#dc2626",
              "#ea580c",
              "#f97316",
              "#fb923c",
              "#f59e0b",
              "#eab308",
              "#bef264",
              "#86efac",
              "#4ade80",
              "#16a34a",
            ]}
            needleColor={accentHex}
            needleTransitionDuration={2000}
            needleTransition="easeQuadInOut"
            currentValueText=""
            textColor="#1e293b"
            valueTextFontSize="0px"
            labelFontSize="12px"
            ringWidth={Math.max(18, dims.width * 0.06)}
            paddingVertical={4}
            forceRender={false}
          />
        </div>
        <div className="z-10 flex flex-col items-center -mt-2">
          <div
            className="px-6 xl:px-10 py-3 rounded-2xl text-white font-black text-2xl md:text-3xl xl:text-4xl font-mono tracking-[0.15em] shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${accentHex}, ${accentHex}dd)`,
              boxShadow: `0 8px 30px ${accentHex}40`,
            }}
          >
            {Number(clamped)}
          </div>
          <div
            className="mt-3 flex items-center gap-2 px-4 py-1.5 rounded-full border-[1.5px]"
            style={{
              borderColor: `${statusColor}44`,
              background: `${statusColor}10`,
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: statusColor }}
            />
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: statusColor }}
            >
              {statusLabel}
            </span>
            <span className="text-xs font-mono text-slate-400">
              {pct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.value === next.value &&
    prev.maxValue === next.maxValue &&
    prev.label === next.label &&
    prev.sublabel === next.sublabel &&
    prev.accentHex === next.accentHex,
);
GaugePanel.displayName = "GaugePanel";
