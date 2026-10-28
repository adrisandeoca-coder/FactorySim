import React from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface EnergyChartProps {
  kpis: KPIData;
  model: FactoryModel;
}

const EnergyChart = React.memo(function EnergyChart({ kpis, model }: EnergyChartProps) {
  const energyData = kpis.energy;

  const hasEnergyConfig = model.stations.some(
    s => (s as any).energyProcessingKw || (s as any).energyIdleKw || (s as any).energySetupKw
  );

  if (!hasEnergyConfig && !energyData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Configure station energy (kW) in the property panel
      </div>
    );
  }

  if (!energyData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Run a simulation to see energy data
      </div>
    );
  }

  const stationEnergy = model.stations
    .filter(s => energyData.byStation[s.id] && energyData.byStation[s.id].kwh > 0)
    .map(s => ({
      name: s.name,
      ...energyData.byStation[s.id],
    }))
    .sort((a, b) => b.kwh - a.kwh);

  const maxKwh = stationEnergy.length > 0 ? Math.max(...stationEnergy.map(s => s.kwh)) : 1;

  const chartWidth = 540;
  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const barAreaWidth = chartWidth - labelWidth - 80;
  const visibleStations = stationEnergy.slice(0, 15);
  const chartHeight = visibleStations.length * (barHeight + gap) + 20;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Energy</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatKwh(energyData.totalEnergy)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Per Unit</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatKwh(energyData.energyPerUnit)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Energy Cost</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {energyData.totalCost > 0 ? `$${energyData.totalCost.toFixed(2)}` : '--'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">CO2</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {energyData.co2Kg > 0 ? `${energyData.co2Kg.toFixed(1)} kg` : '--'}
          </div>
        </div>
      </div>

      {/* Bar chart per station */}
      {visibleStations.length > 0 && (
        <div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: Math.min(chartHeight, 500) }}>
            {visibleStations.map((se, i) => {
              const y = i * (barHeight + gap) + 10;
              const scale = maxKwh > 0 ? barAreaWidth / maxKwh : 0;
              const barW = se.kwh * scale;

              const shortLabel = se.name.length > 20
                ? se.name.slice(0, 20) + '\u2026'
                : se.name;

              return (
                <g key={se.name + i}>
                  <text
                    x={labelWidth - 8}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    fill="#374151"
                    fontSize="11"
                    fontFamily="system-ui, sans-serif"
                  >
                    <title>{se.name}</title>
                    {shortLabel}
                  </text>
                  <rect
                    x={labelWidth}
                    y={y}
                    width={Math.max(barW, 1)}
                    height={barHeight}
                    fill="#F5A524"
                    rx={2}
                    opacity={0.85}
                  >
                    <title>{se.kwh.toFixed(2)} kWh</title>
                  </rect>
                  <text
                    x={labelWidth + barW + 8}
                    y={y + barHeight / 2 + 4}
                    fill="#6b7280"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {formatKwh(se.kwh)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
});
export { EnergyChart };

function formatKwh(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} MWh`;
  if (value >= 1) return `${value.toFixed(2)} kWh`;
  if (value > 0) return `${(value * 1000).toFixed(1)} Wh`;
  return '0 kWh';
}
