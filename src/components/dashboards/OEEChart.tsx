import React from 'react';
import type { OEEData } from '../../types';
import { ChartEmptyState } from './ChartEmptyState';

interface OEEChartProps {
  data: OEEData;
}

const OEEChart = React.memo(function OEEChart({ data }: OEEChartProps) {
  if (!data || (data.overall === 0 && data.availability === 0 && data.performance === 0 && data.quality === 0)) {
    return <ChartEmptyState message="No OEE data available" />;
  }

  const { availability, performance, quality, overall } = data;

  const chartWidth = 500;
  const chartHeight = 260;
  const padding = { top: 25, right: 12, bottom: 40, left: 40 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const scaleY = (v: number) => padding.top + plotHeight - (v / 100) * plotHeight;

  // Waterfall columns: Start at 100%, subtract losses, end at OEE
  const availLoss = (1 - availability) * 100;
  const perfLoss = availability * (1 - performance) * 100;
  const oeeValue = overall * 100;

  const columns = [
    { label: 'Potential', top: 100, bottom: 0, color: '#94a3b8', isBase: true },
    { label: 'Availability\nloss', top: 100, bottom: 100 - availLoss, lossTop: 100, lossBottom: 100 - availLoss, color: '#F87171' },
    { label: 'Performance\nloss', top: 100 - availLoss, bottom: 100 - availLoss - perfLoss, lossTop: 100 - availLoss, lossBottom: 100 - availLoss - perfLoss, color: '#F87171' },
    { label: 'Quality\nloss', top: 100 - availLoss - perfLoss, bottom: oeeValue, lossTop: 100 - availLoss - perfLoss, lossBottom: oeeValue, color: '#F87171' },
    { label: 'OEE', top: oeeValue, bottom: 0, color: oeeValue >= 85 ? '#059669' : oeeValue >= 60 ? '#D97706' : '#DC2626', isResult: true },
  ];

  const colCount = columns.length;
  const colWidth = plotWidth / colCount;
  const barWidth = colWidth * 0.6;

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 85, 100];

  return (
    <div className="px-4 pb-4">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: 280, display: 'block' }}>
        {/* Grid lines */}
        {yTicks.map((val) => (
          <line
            key={`grid-${val}`}
            x1={padding.left}
            y1={scaleY(val)}
            x2={padding.left + plotWidth}
            y2={scaleY(val)}
            stroke={val === 85 ? '#64748B' : '#E2E8F0'}
            strokeWidth={val === 85 ? 1 : 0.75}
            strokeDasharray={val === 85 ? '6,3' : 'none'}
          />
        ))}

        {/* 85% world-class reference — label sits on the axis side so it can't collide with the OEE value */}
        <text
          x={padding.left - 8}
          y={scaleY(85) + 4}
          textAnchor="end"
          fill="#475569"
          fontSize="10"
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
            fill="#94A3B8"
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
                fill={col.color} rx={2}
              />
              {/* Loss value label: inside the segment when it fits, above it otherwise; none for ~0 */}
              {(col.top! - col.bottom!) >= 0.05 && <text
                x={cx}
                y={lossHeight >= 18 ? scaleY(col.top!) + lossHeight / 2 + 4 : scaleY(col.top!) - 5}
                textAnchor="middle"
                fill={lossHeight >= 18 ? '#fff' : '#B91C1C'}
                fontSize="10" fontWeight="700"
              >
                −{(col.top! - col.bottom!).toFixed(1)}%
              </text>}
              {/* Column label (multiline) */}
              {col.label.split('\n').map((line, li) => (
                <text
                  key={li}
                  x={cx}
                  y={padding.top + plotHeight + 14 + li * 12}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="10"
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

      {/* OEE Trio summary */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {[
          { label: 'Availability', value: availability },
          { label: 'Performance', value: performance },
          { label: 'Quality', value: quality },
        ].map(item => (
          <div key={item.label} className="text-center rounded-md" style={{ padding: '10px 8px', background: 'var(--gray-50)', border: '1px solid var(--border)' }}>
            <div style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.6px',
              fontVariantNumeric: 'tabular-nums',
              color: item.value < 0.7 ? 'var(--amber)' : 'var(--t1)',
            }}>
              {(item.value * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
export { OEEChart };
