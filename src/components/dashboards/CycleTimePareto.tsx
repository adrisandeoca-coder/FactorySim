import React from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface CycleTimeParetoProps {
  kpis: KPIData;
  model: FactoryModel;
}

// Strip distribution type: "CNC Mill (Weibull)" -> "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const CycleTimePareto = React.memo(function CycleTimePareto({ kpis, model }: CycleTimeParetoProps) {
  const stations = model.stations;

  if (stations.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No stations in model
      </div>
    );
  }

  // Rank stations by busy % descending
  const ranked = [...stations]
    .map((s) => {
      const util = kpis.utilization.byStation[s.id] as unknown as Record<string, number> | undefined;
      const busy = util?.busy ?? 0;
      return { id: s.id, name: shortName(s.name), busy };
    })
    .filter((s) => s.busy > 0)
    .sort((a, b) => b.busy - a.busy);

  if (ranked.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No utilization data available
      </div>
    );
  }

  // Compute cumulative %
  const totalBusy = ranked.reduce((sum, s) => sum + s.busy, 0);
  let cumulative = 0;
  const data = ranked.map((s) => {
    cumulative += s.busy;
    return {
      ...s,
      pct: (s.busy / totalBusy) * 100,
      cumPct: (cumulative / totalBusy) * 100,
    };
  });

  // Display at most 15 stations for readability
  const displayData = data.length > 15 ? data.slice(0, 15) : data;
  const truncated = data.length > 15;

  // Chart dimensions
  const chartWidth = 620;
  const chartHeight = 300;
  const padding = { top: 30, right: 50, bottom: 70, left: 50 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const barCount = displayData.length;
  const barGap = Math.max(2, Math.min(6, plotWidth / barCount * 0.15));
  const barWidth = (plotWidth - barGap * (barCount - 1)) / barCount;

  // Scales
  const maxPct = Math.ceil(Math.max(...displayData.map((d) => d.pct)) / 5) * 5;
  const scaleBarY = (v: number) => padding.top + plotHeight - (v / maxPct) * plotHeight;
  const scaleCumY = (v: number) => padding.top + plotHeight - (v / 100) * plotHeight;
  const barX = (i: number) => padding.left + i * (barWidth + barGap);

  // Y-axis ticks (bar %)
  const barTicks = [];
  for (let t = 0; t <= maxPct; t += Math.max(5, Math.ceil(maxPct / 5 / 5) * 5)) {
    barTicks.push(t);
  }
  if (!barTicks.includes(maxPct)) barTicks.push(maxPct);

  // Cumulative Y ticks
  const cumTicks = [0, 20, 40, 60, 80, 100];

  // Cumulative line points
  const linePoints = displayData.map((d, i) => {
    const cx = barX(i) + barWidth / 2;
    const cy = scaleCumY(d.cumPct);
    return `${cx},${cy}`;
  }).join(' ');

  // Find where 80% threshold crosses
  const threshold80Y = scaleCumY(80);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: '300px' }}>
        {/* Grid lines */}
        {barTicks.map((val) => (
          <line
            key={`grid-${val}`}
            x1={padding.left}
            y1={scaleBarY(val)}
            x2={padding.left + plotWidth}
            y2={scaleBarY(val)}
            stroke="#e5e5e5"
            strokeWidth={0.5}
          />
        ))}

        {/* 80% threshold dashed line */}
        <line
          x1={padding.left}
          y1={threshold80Y}
          x2={padding.left + plotWidth}
          y2={threshold80Y}
          stroke="#F31260"
          strokeWidth={1}
          strokeDasharray="6,3"
        />
        <text
          x={padding.left + plotWidth + 4}
          y={threshold80Y + 3.5}
          fill="#F31260"
          fontSize="9"
          fontWeight="600"
        >
          80%
        </text>

        {/* Left Y-axis labels (bar %) */}
        {barTicks.map((val) => (
          <text
            key={`ylabel-${val}`}
            x={padding.left - 8}
            y={scaleBarY(val) + 4}
            textAnchor="end"
            fill="#9ca3af"
            fontSize="10"
          >
            {val}%
          </text>
        ))}

        {/* Right Y-axis labels (cumulative %) */}
        {cumTicks.map((val) => (
          <text
            key={`cumlabel-${val}`}
            x={padding.left + plotWidth + 8}
            y={scaleCumY(val) + 4}
            textAnchor="start"
            fill="#6b7280"
            fontSize="9"
            opacity={0.7}
          >
            {val}%
          </text>
        ))}

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#e5e7eb" />
        <line x1={padding.left + plotWidth} y1={padding.top} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#e5e7eb" strokeDasharray="3,2" />

        {/* Bars */}
        {displayData.map((d, i) => {
          const x = barX(i);
          const barH = (d.pct / maxPct) * plotHeight;
          const y = padding.top + plotHeight - barH;
          // Color: first bars (high contribution) are darker
          const intensity = 1 - i * 0.04;
          const color = d.cumPct <= 80 ? `rgba(55, 65, 81, ${Math.max(0.5, intensity)})` : `rgba(148, 163, 184, ${Math.max(0.4, intensity)})`;

          return (
            <g key={d.id}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={color}
                rx={2}
              >
                <title>{`${d.name}: ${d.busy >= 0.01 ? (d.busy * 100).toFixed(1) : (d.busy * 100).toFixed(2)}% busy (${d.pct.toFixed(1)}% of total)`}</title>
              </rect>
              {/* Value label on bar (only if bar is tall enough) */}
              {barH > 16 && barWidth > 20 && (
                <text
                  x={x + barWidth / 2}
                  y={y + Math.min(14, barH / 2 + 4)}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={barWidth > 30 ? '9' : '8'}
                  fontWeight="600"
                >
                  {d.pct.toFixed(0)}%
                </text>
              )}
              {/* Station name (rotated) */}
              <text
                x={0}
                y={0}
                textAnchor="end"
                fill="#475569"
                fontSize={barCount > 10 ? '8' : '9'}
                transform={`translate(${x + barWidth / 2 + 3}, ${padding.top + plotHeight + 8}) rotate(-45)`}
              >
                {d.name.length > 14 ? d.name.slice(0, 14) + '\u2026' : d.name}
              </text>
            </g>
          );
        })}

        {/* Cumulative line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="#6b7280"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Cumulative dots */}
        {displayData.map((d, i) => {
          const cx = barX(i) + barWidth / 2;
          const cy = scaleCumY(d.cumPct);
          return (
            <circle
              key={`dot-${d.id}`}
              cx={cx}
              cy={cy}
              r={3}
              fill="#6b7280"
              stroke="#fff"
              strokeWidth={1.5}
            >
              <title>{`Cumulative: ${d.cumPct.toFixed(1)}%`}</title>
            </circle>
          );
        })}

        {/* Axis titles */}
        <text
          x={padding.left - 35}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          fill="#9ca3af"
          fontSize="9"
          transform={`rotate(-90, ${padding.left - 35}, ${padding.top + plotHeight / 2})`}
        >
          Contribution %
        </text>
        <text
          x={padding.left + plotWidth + 38}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          fill="#6b7280"
          fontSize="9"
          opacity={0.6}
          transform={`rotate(90, ${padding.left + plotWidth + 38}, ${padding.top + plotHeight / 2})`}
        >
          Cumulative %
        </text>
      </svg>

      {truncated && (
        <div className="text-center text-xs text-gray-400">
          Showing top 15 of {data.length} stations
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Top 80% contributors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-400" />
          <span>Remaining</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 bg-gray-500 rounded" />
          <span>Cumulative %</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 border-t-2 border-dashed border-red-500" />
          <span>80% threshold</span>
        </div>
      </div>
    </div>
  );
});
export { CycleTimePareto };
