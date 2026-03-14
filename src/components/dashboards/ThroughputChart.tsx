import type { ThroughputData } from '../../types';

interface ThroughputChartProps {
  data: ThroughputData;
}

const MAX_BARS = 24;

/**
 * Aggregate hourly data into a fixed number of buckets so the chart
 * always fits within its container regardless of simulation duration.
 */
function bucketData(hourly: number[]): { values: number[]; labels: string[] } {
  const n = hourly.length;
  if (n === 0) return { values: [], labels: [] };

  if (n <= MAX_BARS) {
    // Few enough hours — show one bar per hour
    return {
      values: hourly,
      labels: hourly.map((_, i) => `${i + 1}h`),
    };
  }

  // Aggregate into MAX_BARS evenly-sized buckets
  const bucketSize = n / MAX_BARS;
  const values: number[] = [];
  const labels: string[] = [];

  for (let b = 0; b < MAX_BARS; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.floor((b + 1) * bucketSize);
    let sum = 0;
    for (let i = start; i < end && i < n; i++) sum += hourly[i];
    values.push(sum);
    labels.push(formatBucketLabel(start, end, n));
  }

  return { values, labels };
}

function formatBucketLabel(startHour: number, endHour: number, totalHours: number): string {
  if (totalHours <= 48) {
    // Show hour ranges: "1-4h"
    return `${startHour + 1}-${endHour}h`;
  }
  // Show day-based labels: "D1", "D2", ...
  const startDay = Math.floor(startHour / 24) + 1;
  const endDay = Math.floor((endHour - 1) / 24) + 1;
  if (startDay === endDay) return `D${startDay}`;
  return `D${startDay}-${endDay}`;
}

export function ThroughputChart({ data }: ThroughputChartProps) {
  const hourlyData = data.byHour.length > 0 ? data.byHour : [];

  if (hourlyData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        No hourly throughput data available
      </div>
    );
  }

  const { values, labels } = bucketData(hourlyData);
  const maxValue = Math.max(...values, 1);

  // Cumulative throughput
  const cumulative = values.reduce<number[]>((acc, val) => {
    acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + val);
    return acc;
  }, []);
  const maxCumulative = cumulative.length > 0 ? cumulative[cumulative.length - 1] : 1;

  // SVG chart dimensions
  const chartWidth = 600;
  const chartHeight = 220;
  const padding = { top: 15, right: 40, bottom: 30, left: 45 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const scaleY = (v: number) => padding.top + plotHeight - (v / maxValue) * plotHeight;
  const scaleCumY = (v: number) => padding.top + plotHeight - (v / maxCumulative) * plotHeight;

  // Build stepped area path (matches bar chart feel)
  const stepWidth = plotWidth / values.length;
  let areaPath = `M ${padding.left} ${padding.top + plotHeight}`;
  let linePath = '';
  for (let i = 0; i < values.length; i++) {
    const x1 = padding.left + i * stepWidth;
    const x2 = padding.left + (i + 1) * stepWidth;
    const y = scaleY(values[i]);
    if (i === 0) {
      areaPath += ` L ${x1} ${y}`;
      linePath = `M ${x1} ${y}`;
    } else {
      areaPath += ` L ${x1} ${y}`;
      linePath += ` L ${x1} ${y}`;
    }
    areaPath += ` L ${x2} ${y}`;
    linePath += ` L ${x2} ${y}`;
  }
  areaPath += ` L ${padding.left + plotWidth} ${padding.top + plotHeight} Z`;

  // Cumulative line path
  const cumPoints = cumulative.map((c, i) => {
    const x = padding.left + (i + 0.5) * stepWidth;
    const y = scaleCumY(c);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxValue / yTicks) * i));

  // X-axis labels (evenly spaced subset of labels)
  const maxLabels = 12;
  const labelStep = Math.max(1, Math.ceil(labels.length / maxLabels));

  return (
    <div className="h-64">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: '240px' }}>
        <defs>
          <linearGradient id="throughputAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
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

        {/* Area fill */}
        <path d={areaPath} fill="url(#throughputAreaGradient)" />

        {/* Step line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />

        {/* Cumulative dashed line */}
        {cumPoints && (
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="6,4"
            points={cumPoints.replace(/[ML]\s*/g, '')}
          />
        )}

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
        {labels.map((label, i) => {
          if (i % labelStep !== 0) return null;
          const x = padding.left + (i + 0.5) * stepWidth;
          return (
            <text
              key={`xlabel-${i}`}
              x={x}
              y={padding.top + plotHeight + 18}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="9"
            >
              {label}
            </text>
          );
        })}

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#e5e7eb" />

        {/* Hover dots for each data point */}
        {values.map((val, i) => {
          const x = padding.left + (i + 0.5) * stepWidth;
          const y = scaleY(val);
          return (
            <circle
              key={`dot-${i}`}
              cx={x} cy={y} r={3}
              fill="#3b82f6" stroke="#fff" strokeWidth={1}
              opacity={0}
              className="hover:opacity-100 transition-opacity"
            >
              <title>{`${labels[i]}: ${val} units`}</title>
            </circle>
          );
        })}
      </svg>

      {/* Summary */}
      <div className="mt-2 flex justify-around text-xs">
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Total Output</div>
          <div className="font-semibold font-mono tabular-nums text-sm">{data.total || hourlyData.reduce((a, b) => a + b, 0)} units</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Avg Rate</div>
          <div className="font-semibold font-mono tabular-nums text-sm">{data.ratePerHour?.toFixed(0) || Math.round(hourlyData.reduce((a, b) => a + b, 0) / hourlyData.length)} /hr</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 uppercase tracking-wider">Peak Hour</div>
          <div className="font-semibold font-mono tabular-nums text-sm">{Math.max(...hourlyData)} units</div>
        </div>
      </div>
    </div>
  );
}
