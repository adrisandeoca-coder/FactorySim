import type { WIPData, SimWarning } from '../../types';

interface ChartEvent {
  time: number;
  label: string;
  color: string;
}

interface WipTrendChartProps {
  data: WIPData;
  events?: ChartEvent[];
  warnings?: SimWarning[];
}

export function WipTrendChart({ data, events = [], warnings = [] }: WipTrendChartProps) {
  const timeSeries = data.timeSeries.length > 0 ? data.timeSeries : [];

  if (timeSeries.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        No WIP time series data available
      </div>
    );
  }

  const chartWidth = 600;
  const chartHeight = 240;
  const padding = { top: 20, right: 35, bottom: 35, left: 45 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const maxTime = Math.max(...timeSeries.map((d) => d.time));
  const minTime = Math.min(...timeSeries.map((d) => d.time));
  const maxWip = Math.max(...timeSeries.map((d) => d.wip), 1);
  const peakWip = Math.max(...timeSeries.map((d) => d.wip));
  const avgWip = timeSeries.reduce((sum, d) => sum + d.wip, 0) / timeSeries.length;
  const timeRange = maxTime - minTime || 1;

  const scaleX = (t: number) => padding.left + ((t - minTime) / timeRange) * plotWidth;
  const scaleY = (w: number) => padding.top + plotHeight - (w / maxWip) * plotHeight;

  // Build SVG path
  const pathData = timeSeries
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(d.time).toFixed(1)} ${scaleY(d.wip).toFixed(1)}`)
    .join(' ');

  // Fill area under curve
  const areaPath = `${pathData} L ${scaleX(timeSeries[timeSeries.length - 1].time).toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} L ${scaleX(timeSeries[0].time).toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`;

  // Simple Moving Average for trend line
  const windowSize = Math.max(5, Math.floor(timeSeries.length / 20));
  const smaValues = timeSeries.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = timeSeries.slice(start, i + 1);
    return slice.reduce((sum, d) => sum + d.wip, 0) / slice.length;
  });
  const smaPath = timeSeries
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(d.time).toFixed(1)} ${scaleY(smaValues[i]).toFixed(1)}`)
    .join(' ');

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxWip / yTicks) * i));

  // X-axis ticks (time in hours)
  const xTicks = Math.min(8, Math.ceil(timeRange / 3600));
  const xTickValues = Array.from({ length: xTicks + 1 }, (_, i) => minTime + (timeRange / xTicks) * i);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: '280px' }}>
        <defs>
          <linearGradient id="wipAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTickValues.map((val) => (
          <line
            key={`grid-${val}`}
            x1={padding.left}
            y1={scaleY(val)}
            x2={padding.left + plotWidth}
            y2={scaleY(val)}
            stroke="#e5e7eb"
            strokeDasharray="3,3"
          />
        ))}

        {/* Peak WIP reference line */}
        <line
          x1={padding.left}
          y1={scaleY(peakWip)}
          x2={padding.left + plotWidth}
          y2={scaleY(peakWip)}
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="6,3"
        />
        <text
          x={padding.left + plotWidth + 3}
          y={scaleY(peakWip) + 3}
          fill="#ef4444"
          fontSize="9"
          fontWeight="600"
        >
          Peak
        </text>

        {/* Avg WIP reference line */}
        <line
          x1={padding.left}
          y1={scaleY(avgWip)}
          x2={padding.left + plotWidth}
          y2={scaleY(avgWip)}
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="6,3"
        />
        <text
          x={padding.left + plotWidth + 3}
          y={scaleY(avgWip) + 3}
          fill="#3b82f6"
          fontSize="9"
          fontWeight="600"
        >
          Avg
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="url(#wipAreaGradient)" />

        {/* Raw line (semi-transparent) */}
        <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" opacity="0.5" />

        {/* SMA trend line */}
        <path d={smaPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yTickValues.map((val) => (
          <text
            key={`ylabel-${val}`}
            x={padding.left - 8}
            y={scaleY(val) + 4}
            textAnchor="end"
            fill="#9ca3af"
            fontSize="10"
          >
            {val}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickValues.map((val, i) => (
          <text
            key={`xlabel-${i}`}
            x={scaleX(val)}
            y={padding.top + plotHeight + 20}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="10"
          >
            {formatTime(val)}
          </text>
        ))}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + plotHeight}
          stroke="#e5e7eb"
        />
        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={padding.left + plotWidth}
          y2={padding.top + plotHeight}
          stroke="#e5e7eb"
        />

        {/* Event markers */}
        {events.filter(e => e.time >= minTime && e.time <= maxTime).map((evt, i) => {
          const x = scaleX(evt.time);
          return (
            <g key={`evt-${i}`}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotHeight}
                stroke={evt.color} strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
              <circle cx={x} cy={padding.top + 4} r={3} fill={evt.color} />
              <title>{evt.label} at {formatTime(evt.time)}</title>
              <text x={x + 4} y={padding.top + 2} fill={evt.color} fontSize="8" fontWeight="600"
                opacity={0.8}>{evt.label}</text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={padding.left + plotWidth / 2}
          y={chartHeight - 2}
          textAnchor="middle"
          fill="#6b7280"
          fontSize="10"
        >
          Time
        </text>

        {/* Legend */}
        <g transform={`translate(${padding.left + 8}, ${padding.top + 4})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke="#3b82f6" strokeWidth="2" opacity="0.5" />
          <text x="20" y="3.5" fill="#6b7280" fontSize="9" fontWeight="500">Raw</text>
          <line x1="50" y1="0" x2="66" y2="0" stroke="#f59e0b" strokeWidth="2" />
          <text x="70" y="3.5" fill="#6b7280" fontSize="9" fontWeight="500">Trend</text>
        </g>
      </svg>

      {/* Summary */}
      <div className="flex justify-around text-xs">
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Current WIP</div>
          <div className="font-semibold font-mono tabular-nums text-sm">{data.total} items</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Peak WIP</div>
          <div className="font-semibold font-mono tabular-nums text-sm">{Math.max(...timeSeries.map((d) => d.wip))} items</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Avg WIP</div>
          <div className="font-semibold font-mono tabular-nums text-sm">
            {Math.round(timeSeries.reduce((sum, d) => sum + d.wip, 0) / timeSeries.length)} items
          </div>
        </div>
      </div>

      {/* Steady-state warning */}
      {warnings.filter(w => w.type === 'wip_no_steady_state').map((w, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          <span className="mt-0.5">{'\u26A0'}</span>
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
}
