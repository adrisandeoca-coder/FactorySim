import React from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface MaintenanceChartProps {
  kpis: KPIData;
  model: FactoryModel;
}

const MaintenanceChart = React.memo(function MaintenanceChart({ kpis, model }: MaintenanceChartProps) {
  const maintData = kpis.maintenance;

  const hasPmConfig = model.stations.some(
    s => (s as any).pmInterval && (s as any).pmDuration
  );

  if (!hasPmConfig && !maintData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Configure preventive maintenance in the property panel
      </div>
    );
  }

  if (!maintData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Run a simulation to see maintenance data
      </div>
    );
  }

  const stationMaint = model.stations
    .filter(s => {
      const d = maintData.byStation[s.id];
      return d && (d.plannedDowntime > 0 || d.unplannedDowntime > 0);
    })
    .map(s => ({
      name: s.name,
      ...maintData.byStation[s.id],
    }))
    .sort((a, b) => (b.plannedDowntime + b.unplannedDowntime) - (a.plannedDowntime + a.unplannedDowntime));

  const maxTime = stationMaint.length > 0
    ? Math.max(...stationMaint.map(s => s.plannedDowntime + s.unplannedDowntime))
    : 1;

  const chartWidth = 540;
  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const barAreaWidth = chartWidth - labelWidth - 80;
  const visibleStations = stationMaint.slice(0, 15);
  const chartHeight = visibleStations.length * (barHeight + gap) + 20;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Downtime</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatTime(maintData.totalDowntime)}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xs text-green-600 font-medium uppercase tracking-wider">Planned (PM)</div>
          <div className="text-xl font-bold text-green-700 font-mono tabular-nums mt-1">
            {formatTime(maintData.plannedDowntime)}
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-xs text-red-600 font-medium uppercase tracking-wider">Unplanned</div>
          <div className="text-xl font-bold text-red-700 font-mono tabular-nums mt-1">
            {formatTime(maintData.unplannedDowntime)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">PM Cost</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {maintData.pmCost > 0 ? `$${maintData.pmCost.toFixed(2)}` : '--'}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">{maintData.pmEvents} events</div>
        </div>
      </div>

      {/* Stacked bar chart: planned (green) + unplanned (red) */}
      {visibleStations.length > 0 && (
        <div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: Math.min(chartHeight, 500) }}>
            {visibleStations.map((sm, i) => {
              const y = i * (barHeight + gap) + 10;
              const scale = maxTime > 0 ? barAreaWidth / maxTime : 0;
              const plannedW = sm.plannedDowntime * scale;
              const unplannedW = sm.unplannedDowntime * scale;

              const shortLabel = sm.name.length > 20
                ? sm.name.slice(0, 20) + '\u2026'
                : sm.name;

              return (
                <g key={sm.name + i}>
                  <text
                    x={labelWidth - 8}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    fill="#374151"
                    fontSize="11"
                    fontFamily="system-ui, sans-serif"
                  >
                    <title>{sm.name}</title>
                    {shortLabel}
                  </text>
                  {plannedW > 0.5 && (
                    <rect
                      x={labelWidth}
                      y={y}
                      width={plannedW}
                      height={barHeight}
                      fill="#17C964"
                      rx={2}
                      opacity={0.85}
                    >
                      <title>Planned PM: {formatTime(sm.plannedDowntime)}</title>
                    </rect>
                  )}
                  {unplannedW > 0.5 && (
                    <rect
                      x={labelWidth + plannedW}
                      y={y}
                      width={unplannedW}
                      height={barHeight}
                      fill="#F31260"
                      rx={0}
                      opacity={0.85}
                    >
                      <title>Unplanned: {formatTime(sm.unplannedDowntime)}</title>
                    </rect>
                  )}
                  <text
                    x={labelWidth + plannedW + unplannedW + 8}
                    y={y + barHeight / 2 + 4}
                    fill="#6b7280"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {formatTime(sm.plannedDowntime + sm.unplannedDowntime)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 border-t border-gray-100">
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#17C964' }} />
          <span className="text-xs text-gray-600">Planned (PM)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#F31260' }} />
          <span className="text-xs text-gray-600">Unplanned</span>
        </div>
      </div>
    </div>
  );
});
export { MaintenanceChart };

function formatTime(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${seconds.toFixed(0)}s`;
}
