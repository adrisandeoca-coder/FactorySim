import type { OEEData } from '../../types';

interface OEEChartProps {
  data: OEEData;
}

export function OEEChart({ data }: OEEChartProps) {
  const { availability, performance, quality, overall } = data;

  const chartWidth = 500;
  const chartHeight = 260;
  const padding = { top: 25, right: 20, bottom: 50, left: 45 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const scaleY = (v: number) => padding.top + plotHeight - (v / 100) * plotHeight;

  // Waterfall columns: Start at 100%, subtract losses, end at OEE
  const availLoss = (1 - availability) * 100;
  const perfLoss = availability * (1 - performance) * 100;
  const oeeValue = overall * 100;

  const columns = [
    { label: 'Potential', top: 100, bottom: 0, color: '#94a3b8', isBase: true },
    { label: 'Avail.\nLoss', top: 100, bottom: 100 - availLoss, lossTop: 100, lossBottom: 100 - availLoss, color: '#3b82f6' },
    { label: 'Perf.\nLoss', top: 100 - availLoss, bottom: 100 - availLoss - perfLoss, lossTop: 100 - availLoss, lossBottom: 100 - availLoss - perfLoss, color: '#22c55e' },
    { label: 'Quality\nLoss', top: 100 - availLoss - perfLoss, bottom: oeeValue, lossTop: 100 - availLoss - perfLoss, lossBottom: oeeValue, color: '#a855f7' },
    { label: 'OEE', top: oeeValue, bottom: 0, color: oeeValue >= 85 ? '#22c55e' : oeeValue >= 60 ? '#f59e0b' : '#ef4444', isResult: true },
  ];

  const colCount = columns.length;
  const colWidth = plotWidth / colCount;
  const barWidth = colWidth * 0.6;

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 85, 100];

  return (
    <div className="h-64">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: '260px' }}>
        {/* Grid lines */}
        {yTicks.map((val) => (
          <line
            key={`grid-${val}`}
            x1={padding.left}
            y1={scaleY(val)}
            x2={padding.left + plotWidth}
            y2={scaleY(val)}
            stroke={val === 85 ? '#ef4444' : '#f1f5f9'}
            strokeWidth={val === 85 ? 1 : 0.5}
            strokeDasharray={val === 85 ? '6,3' : 'none'}
          />
        ))}

        {/* 85% target label */}
        <text
          x={padding.left + plotWidth + 4}
          y={scaleY(85) + 3.5}
          fill="#ef4444"
          fontSize="9"
          fontWeight="600"
        >
          85%
        </text>

        {/* Y-axis labels */}
        {yTicks.filter(v => v !== 85).map((val) => (
          <text
            key={`ylabel-${val}`}
            x={padding.left - 8}
            y={scaleY(val) + 4}
            textAnchor="end"
            fill="#9ca3af"
            fontSize="10"
          >
            {val}%
          </text>
        ))}

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#e5e7eb" />

        {/* Waterfall bars */}
        {columns.map((col, i) => {
          const cx = padding.left + i * colWidth + colWidth / 2;
          const bx = cx - barWidth / 2;

          if (col.isBase) {
            // Full 100% bar (light gray)
            return (
              <g key={col.label}>
                <rect
                  x={bx} y={scaleY(100)}
                  width={barWidth} height={scaleY(0) - scaleY(100)}
                  fill="#e2e8f0" rx={3}
                />
                <text x={cx} y={scaleY(100) - 6} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">100%</text>
                <text x={cx} y={padding.top + plotHeight + 16} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="600">{col.label}</text>
              </g>
            );
          }

          if (col.isResult) {
            // OEE result bar
            return (
              <g key={col.label}>
                <rect
                  x={bx} y={scaleY(col.top)}
                  width={barWidth} height={scaleY(0) - scaleY(col.top)}
                  fill={col.color} rx={3}
                  opacity={0.9}
                />
                <text x={cx} y={scaleY(col.top) - 6} textAnchor="middle" fill={col.color} fontSize="12" fontWeight="800">{col.top.toFixed(1)}%</text>
                <text x={cx} y={padding.top + plotHeight + 16} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="700">{col.label}</text>
              </g>
            );
          }

          // Loss bars: gray base (remaining) + colored loss segment
          const lossHeight = scaleY(col.bottom!) - scaleY(col.top!);
          return (
            <g key={col.label}>
              {/* Gray base (what remains below) */}
              <rect
                x={bx} y={scaleY(col.bottom!)}
                width={barWidth} height={scaleY(0) - scaleY(col.bottom!)}
                fill="#e2e8f0" rx={3}
              />
              {/* Colored loss segment */}
              <rect
                x={bx} y={scaleY(col.top!)}
                width={barWidth} height={Math.max(lossHeight, 1)}
                fill={col.color} opacity={0.7} rx={2}
              />
              {/* Loss value label */}
              <text
                x={cx} y={scaleY(col.top!) + lossHeight / 2 + 4}
                textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700"
              >
                {(col.top! - col.bottom!).toFixed(1)}%
              </text>
              {/* Column label (multiline) */}
              {col.label.split('\n').map((line, li) => (
                <text
                  key={li}
                  x={cx}
                  y={padding.top + plotHeight + 14 + li * 12}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="9"
                  fontWeight="500"
                >
                  {line}
                </text>
              ))}
              {/* Connector line to next column */}
              {i < columns.length - 1 && (
                <line
                  x1={bx + barWidth} y1={scaleY(col.bottom!)}
                  x2={padding.left + (i + 1) * colWidth + colWidth / 2 - barWidth / 2} y2={scaleY(col.bottom!)}
                  stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* OEE Formula */}
      <div className="mt-1 text-center text-xs text-gray-500">
        OEE = <span className="font-mono tabular-nums">{(availability * 100).toFixed(0)}%</span> × <span className="font-mono tabular-nums">{(performance * 100).toFixed(0)}%</span> × <span className="font-mono tabular-nums">{(quality * 100).toFixed(0)}%</span> = <span className="font-medium text-gray-900 font-mono tabular-nums">{(overall * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
