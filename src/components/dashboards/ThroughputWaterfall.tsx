import React from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface ThroughputWaterfallProps {
  kpis: KPIData;
  model: FactoryModel;
}

const ThroughputWaterfall = React.memo(function ThroughputWaterfall({ kpis, model: _model }: ThroughputWaterfallProps) {
  const { oee, throughput } = kpis;
  const actual = throughput.total;

  // Calculate theoretical max from OEE: actual = theoreticalMax * A * P * Q
  // So theoreticalMax = actual / OEE (if OEE > 0)
  const oeeProduct = oee.overall;
  if (oeeProduct <= 0 || actual <= 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No throughput data to display waterfall
      </div>
    );
  }

  const theoreticalMax = actual / oeeProduct;
  const availLoss = theoreticalMax * (1 - oee.availability);
  const afterAvail = theoreticalMax - availLoss;
  const perfLoss = afterAvail * (1 - oee.performance);
  const afterPerf = afterAvail - perfLoss;
  const qualLoss = afterPerf * (1 - oee.quality);

  const chartWidth = 540;
  const chartHeight = 280;
  const padding = { top: 30, right: 20, bottom: 55, left: 60 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const maxVal = theoreticalMax * 1.05;
  const scaleY = (v: number) => padding.top + plotHeight - (v / maxVal) * plotHeight;

  const columns = [
    {
      label: 'Theoretical\nMax',
      top: theoreticalMax,
      bottom: 0,
      color: '#94a3b8',
      isBase: true,
      value: theoreticalMax,
    },
    {
      label: 'Availability\nLoss',
      top: theoreticalMax,
      bottom: afterAvail,
      color: '#2563EB',
      isLoss: true,
      value: availLoss,
    },
    {
      label: 'Performance\nLoss',
      top: afterAvail,
      bottom: afterPerf,
      color: '#17C964',
      isLoss: true,
      value: perfLoss,
    },
    {
      label: 'Quality\nLoss',
      top: afterPerf,
      bottom: actual,
      color: '#a855f7',
      isLoss: true,
      value: qualLoss,
    },
    {
      label: 'Actual\nOutput',
      top: actual,
      bottom: 0,
      color: '#10b981',
      isResult: true,
      value: actual,
    },
  ];

  const colCount = columns.length;
  const colWidth = plotWidth / colCount;
  const barWidth = colWidth * 0.6;

  // Y-axis ticks
  const niceStep = niceTickStep(maxVal, 5);
  const yTicks: number[] = [];
  for (let v = 0; v <= maxVal; v += niceStep) {
    yTicks.push(Math.round(v));
  }

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
            stroke="#f1f5f9"
            strokeWidth={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((val) => (
          <text
            key={`ylabel-${val}`}
            x={padding.left - 8}
            y={scaleY(val) + 4}
            textAnchor="end"
            fill="#9ca3af"
            fontSize="10"
          >
            {formatNum(val)}
          </text>
        ))}

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#e5e7eb" />

        {/* Y-axis title */}
        <text
          x={14}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          fill="#6b7280"
          fontSize="10"
          transform={`rotate(-90, 14, ${padding.top + plotHeight / 2})`}
        >
          Units
        </text>

        {/* Waterfall bars */}
        {columns.map((col, i) => {
          const cx = padding.left + i * colWidth + colWidth / 2;
          const bx = cx - barWidth / 2;

          if (col.isBase) {
            return (
              <g key={col.label}>
                <rect
                  x={bx} y={scaleY(col.top)}
                  width={barWidth} height={scaleY(0) - scaleY(col.top)}
                  fill="#e2e8f0" rx={3}
                />
                <text x={cx} y={scaleY(col.top) - 6} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
                  {formatNum(Math.round(col.value))}
                </text>
                {col.label.split('\n').map((line, li) => (
                  <text key={li} x={cx} y={padding.top + plotHeight + 14 + li * 12} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="600">
                    {line}
                  </text>
                ))}
              </g>
            );
          }

          if (col.isResult) {
            return (
              <g key={col.label}>
                <rect
                  x={bx} y={scaleY(col.top)}
                  width={barWidth} height={scaleY(0) - scaleY(col.top)}
                  fill={col.color} rx={3} opacity={0.9}
                />
                <text x={cx} y={scaleY(col.top) - 6} textAnchor="middle" fill={col.color} fontSize="12" fontWeight="800">
                  {formatNum(Math.round(col.value))}
                </text>
                {col.label.split('\n').map((line, li) => (
                  <text key={li} x={cx} y={padding.top + plotHeight + 14 + li * 12} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="700">
                    {line}
                  </text>
                ))}
              </g>
            );
          }

          // Loss bars
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
              {lossHeight > 14 && (
                <text
                  x={cx} y={scaleY(col.top!) + lossHeight / 2 + 4}
                  textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700"
                >
                  -{formatNum(Math.round(col.value))}
                </text>
              )}
              {lossHeight <= 14 && (
                <text
                  x={cx} y={scaleY(col.top!) - 6}
                  textAnchor="middle" fill={col.color} fontSize="9" fontWeight="700"
                >
                  -{formatNum(Math.round(col.value))}
                </text>
              )}
              {/* Column label */}
              {col.label.split('\n').map((line, li) => (
                <text key={li} x={cx} y={padding.top + plotHeight + 14 + li * 12} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="500">
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

      {/* Summary formula */}
      <div className="mt-1 text-center text-xs text-gray-500">
        {formatNum(Math.round(theoreticalMax))} × {(oee.availability * 100).toFixed(0)}% A × {(oee.performance * 100).toFixed(0)}% P × {(oee.quality * 100).toFixed(0)}% Q = <span className="font-medium text-gray-900 font-mono tabular-nums">{actual} units</span>
      </div>
    </div>
  );
});
export { ThroughputWaterfall };

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function niceTickStep(max: number, targetTicks: number): number {
  const rough = max / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3) nice = 2;
  else if (residual <= 7) nice = 5;
  else nice = 10;
  return nice * mag;
}
