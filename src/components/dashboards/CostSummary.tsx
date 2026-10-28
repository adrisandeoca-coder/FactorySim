import React from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface CostSummaryProps {
  kpis: KPIData;
  model: FactoryModel;
}

const CostSummary = React.memo(function CostSummary({ kpis, model }: CostSummaryProps) {
  const costData = kpis.cost;

  // Check if any station has cost fields configured
  const hasCostConfig = model.stations.some(
    s => s.costPerHour || s.costPerUnit || s.scrapCostPerUnit
  );

  if (!hasCostConfig && !costData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Configure station costs in the property panel
      </div>
    );
  }

  // Use engine-provided cost data if available, otherwise compute client-side
  let totalCost: number;
  let costPerUnit: number;
  let operatingTotal: number;
  let variableTotal: number;
  let scrapTotal: number;
  let stationCosts: Array<{
    name: string;
    operating: number;
    variable: number;
    scrapCost: number;
    total: number;
  }>;

  if (costData) {
    totalCost = costData.totalCost;
    costPerUnit = costData.costPerUnit;
    operatingTotal = costData.operatingCost;
    variableTotal = costData.variableCost;
    scrapTotal = costData.scrapCost;
    stationCosts = model.stations
      .filter(s => costData.byStation[s.id])
      .map(s => ({
        name: s.name,
        ...costData.byStation[s.id],
      }));
  } else {
    // Client-side calculation
    const simDurationHrs = (kpis as any).simDuration
      ? (kpis as any).simDuration / 3600
      : 8; // fallback

    operatingTotal = 0;
    variableTotal = 0;
    scrapTotal = 0;
    stationCosts = [];

    for (const station of model.stations) {
      const util = kpis.utilization.byStation[station.id];
      const busyFraction = util ? (util as any).busy || 0 : 0;

      let operating = 0;
      let variable = 0;
      let stationScrap = 0;

      if (station.costPerHour) {
        operating = station.costPerHour * simDurationHrs * busyFraction;
      }

      if (station.costPerUnit) {
        // Estimate throughput through this station from OEE data
        const stationOee = kpis.oee.byStation[station.id];
        // Rough estimate: use total throughput scaled by busy fraction
        const stationThroughput = stationOee
          ? kpis.throughput.total * (busyFraction > 0 ? 1 : 0)
          : 0;
        variable = station.costPerUnit * stationThroughput;
      }

      if (station.scrapCostPerUnit && station.scrapRate) {
        const stationThroughput = kpis.throughput.total;
        stationScrap = station.scrapCostPerUnit * station.scrapRate * stationThroughput;
      }

      const stationTotal = operating + variable + stationScrap;
      if (stationTotal > 0) {
        stationCosts.push({
          name: station.name,
          operating,
          variable,
          scrapCost: stationScrap,
          total: stationTotal,
        });
      }

      operatingTotal += operating;
      variableTotal += variable;
      scrapTotal += stationScrap;
    }

    totalCost = operatingTotal + variableTotal + scrapTotal;
    costPerUnit = kpis.throughput.total > 0 ? totalCost / kpis.throughput.total : 0;
  }

  // Sort stations by total cost descending
  stationCosts.sort((a, b) => b.total - a.total);

  const maxStationCost = stationCosts.length > 0 ? Math.max(...stationCosts.map(s => s.total)) : 1;

  // Chart dimensions for stacked bars
  const chartWidth = 540;
  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const valueWidth = 60;
  const barAreaWidth = chartWidth - labelWidth - valueWidth - 20;
  const visibleStations = stationCosts.slice(0, 15);
  const chartHeight = visibleStations.length * (barHeight + gap) + 20;

  return (
    <div className="space-y-4">
      {/* Big numbers */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Cost</div>
          <div className="text-2xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatCurrency(totalCost)}
          </div>
          <div className="flex justify-center gap-3 mt-1 text-[10px] text-gray-500">
            <span>Op: {formatCurrency(operatingTotal)}</span>
            <span>Var: {formatCurrency(variableTotal)}</span>
            <span>Scrap: {formatCurrency(scrapTotal)}</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Cost / Unit</div>
          <div className="text-2xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatCurrency(costPerUnit)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {kpis.throughput.total} units produced
          </div>
        </div>
      </div>

      {/* Stacked bar chart per station */}
      {visibleStations.length > 0 && (
        <div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ maxHeight: Math.min(chartHeight, 500) }}>
            {visibleStations.map((sc, i) => {
              const y = i * (barHeight + gap) + 10;
              const scale = maxStationCost > 0 ? barAreaWidth / maxStationCost : 0;

              const opWidth = sc.operating * scale;
              const varWidth = sc.variable * scale;
              const scrapWidth = sc.scrapCost * scale;

              const shortLabel = sc.name.length > 20
                ? sc.name.replace(/\s*\([^)]*\)\s*$/, '').trim().slice(0, 20) + '\u2026'
                : sc.name.replace(/\s*\([^)]*\)\s*$/, '').trim();

              return (
                <g key={sc.name + i}>
                  {/* Station label */}
                  <text
                    x={labelWidth - 8}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    fill="#374151"
                    fontSize="11"
                    fontFamily="system-ui, sans-serif"
                  >
                    <title>{sc.name}</title>
                    {shortLabel}
                  </text>

                  {/* Stacked bar: operating (blue) | variable (green) | scrap (red) */}
                  {opWidth > 0.5 && (
                    <rect
                      x={labelWidth}
                      y={y}
                      width={opWidth}
                      height={barHeight}
                      fill="#2563EB"
                      rx={2}
                      opacity={0.85}
                    >
                      <title>Operating: {formatCurrency(sc.operating)}</title>
                    </rect>
                  )}
                  {varWidth > 0.5 && (
                    <rect
                      x={labelWidth + opWidth}
                      y={y}
                      width={varWidth}
                      height={barHeight}
                      fill="#17C964"
                      rx={0}
                      opacity={0.85}
                    >
                      <title>Variable: {formatCurrency(sc.variable)}</title>
                    </rect>
                  )}
                  {scrapWidth > 0.5 && (
                    <rect
                      x={labelWidth + opWidth + varWidth}
                      y={y}
                      width={scrapWidth}
                      height={barHeight}
                      fill="#F31260"
                      rx={0}
                      opacity={0.85}
                    >
                      <title>Scrap: {formatCurrency(sc.scrapCost)}</title>
                    </rect>
                  )}

                  {/* Total value */}
                  <text
                    x={labelWidth + opWidth + varWidth + scrapWidth + 8}
                    y={y + barHeight / 2 + 4}
                    fill="#6b7280"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {formatCurrency(sc.total)}
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
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#2563EB' }} />
          <span className="text-xs text-gray-600">Operating</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#17C964' }} />
          <span className="text-xs text-gray-600">Variable</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#F31260' }} />
          <span className="text-xs text-gray-600">Scrap</span>
        </div>
      </div>
    </div>
  );
});
export { CostSummary };

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0.00';
}
