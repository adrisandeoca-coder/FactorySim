import React, { useMemo } from 'react';
import type { KPIData, FactoryModel } from '../../types';

interface ValueStreamMapProps {
  kpis: KPIData;
  model: FactoryModel;
}

const ValueStreamMap = React.memo(function ValueStreamMap({ kpis, model }: ValueStreamMapProps) {
  const vsmData = useMemo(() => {
    if (!model.products.length) return null;

    // Use the first product's routing to determine station sequence
    const product = model.products[0];
    const routing = product.routing || [];
    if (routing.length === 0) return null;

    const stations = routing
      .map(sid => model.stations.find(s => s.id === sid))
      .filter(Boolean) as typeof model.stations;

    if (stations.length === 0) return null;

    // Gather data for each station
    const stationData = stations.map(station => {
      const oee = kpis.oee?.byStation?.[station.id];
      const util = kpis.utilization?.byStation?.[station.id] as any;
      const ctVal = station.cycleTime?.parameters?.value;
      const ct = typeof ctVal === 'number' ? ctVal : 0;
      const stVal = station.setupTime?.parameters?.value;
      const setupTime = typeof stVal === 'number' ? stVal : 0;
      const uptime = oee ? (oee.availability * 100) : 100;
      const batchSize = station.batchSize || 1;

      return {
        id: station.id,
        name: station.name,
        cycleTime: ct,
        setupTime: setupTime,
        uptime: uptime,
        batchSize: batchSize,
        processingPct: util?.busy || 0,
      };
    });

    // Gather buffer WIP between consecutive stations
    const bufferData: Array<{ name: string; wip: number }> = [];
    for (let i = 0; i < stations.length - 1; i++) {
      // Find a buffer that connects station i to station i+1
      const fromId = stations[i].id;
      const toId = stations[i + 1].id;
      let foundBuffer = false;
      for (const conn of model.connections) {
        if (conn.source === fromId) {
          const buf = model.buffers.find(b => b.id === conn.target);
          if (buf) {
            const bufConn = model.connections.find(c => c.source === buf.id && c.target === toId);
            if (bufConn) {
              const wipLevel = kpis.wip?.byBuffer?.[buf.id] || 0;
              bufferData.push({ name: buf.name, wip: wipLevel });
              foundBuffer = true;
              break;
            }
          }
        }
      }
      if (!foundBuffer) {
        bufferData.push({ name: '', wip: 0 });
      }
    }

    // Calculate lead time and value-added time
    const totalProcessingTime = stationData.reduce((sum, s) => sum + s.cycleTime, 0);
    const meanCycleTime = kpis.cycleTime?.mean || totalProcessingTime;
    const vaRatio = meanCycleTime > 0 ? (totalProcessingTime / meanCycleTime) * 100 : 0;

    return { stationData, bufferData, totalProcessingTime, meanCycleTime, vaRatio };
  }, [kpis, model]);

  if (!vsmData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Configure at least one product with a routing to see the value stream map
      </div>
    );
  }

  const { stationData, bufferData, totalProcessingTime, meanCycleTime, vaRatio } = vsmData;

  // Layout constants
  const boxW = 120;
  const boxH = 90;
  const triW = 40;
  const gap = 20;
  const stationCount = stationData.length;
  const totalW = stationCount * (boxW + gap) + (stationCount - 1) * (triW + gap) + 40;
  const topY = 30;
  const ladderY = boxH + topY + 60;
  const totalH = ladderY + 60;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Value-Added Time</div>
          <div className="text-xl font-bold text-green-600 font-mono tabular-nums mt-1">
            {formatSec(totalProcessingTime)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Lead Time</div>
          <div className="text-xl font-bold text-gray-900 font-mono tabular-nums mt-1">
            {formatSec(meanCycleTime)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">VA Ratio</div>
          <div className="text-xl font-bold text-blue-600 font-mono tabular-nums mt-1">
            {vaRatio.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* VSM diagram */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${totalW} ${totalH}`} className="w-full" style={{ minWidth: 600, maxHeight: 350 }}>
          {stationData.map((station, i) => {
            const x = 20 + i * (boxW + triW + gap * 2);
            const y = topY;

            return (
              <g key={station.id}>
                {/* Process box */}
                <rect x={x} y={y} width={boxW} height={boxH} rx={4}
                  fill="#f0f4ff" stroke="#3b82f6" strokeWidth={1.5} />
                <text x={x + boxW / 2} y={y + 16} textAnchor="middle"
                  fontSize="10" fontWeight="bold" fill="#1e40af">
                  {station.name.length > 14 ? station.name.slice(0, 14) + '\u2026' : station.name}
                </text>

                {/* Data box rows */}
                <text x={x + 6} y={y + 32} fontSize="8" fill="#6b7280">C/T:</text>
                <text x={x + boxW - 6} y={y + 32} textAnchor="end" fontSize="8" fill="#374151" fontFamily="monospace">{formatSec(station.cycleTime)}</text>

                <text x={x + 6} y={y + 44} fontSize="8" fill="#6b7280">C/O:</text>
                <text x={x + boxW - 6} y={y + 44} textAnchor="end" fontSize="8" fill="#374151" fontFamily="monospace">{formatSec(station.setupTime)}</text>

                <text x={x + 6} y={y + 56} fontSize="8" fill="#6b7280">Uptime:</text>
                <text x={x + boxW - 6} y={y + 56} textAnchor="end" fontSize="8" fill="#374151" fontFamily="monospace">{station.uptime.toFixed(0)}%</text>

                <text x={x + 6} y={y + 68} fontSize="8" fill="#6b7280">Batch:</text>
                <text x={x + boxW - 6} y={y + 68} textAnchor="end" fontSize="8" fill="#374151" fontFamily="monospace">{station.batchSize}</text>

                {/* Lead time ladder */}
                {/* Green bar = processing */}
                <rect x={x} y={ladderY} width={boxW} height={12} rx={2} fill="#17C964" opacity={0.8} />
                <text x={x + boxW / 2} y={ladderY + 9} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">
                  {formatSec(station.cycleTime)}
                </text>

                {/* Inventory triangle between stations */}
                {i < stationData.length - 1 && bufferData[i] && (
                  <g>
                    {/* Arrow connecting stations */}
                    <line x1={x + boxW} y1={y + boxH / 2}
                      x2={x + boxW + gap} y2={y + boxH / 2}
                      stroke="#d1d5db" strokeWidth={1} />

                    {/* Triangle */}
                    <polygon
                      points={`${x + boxW + gap + triW / 2},${y + 15} ${x + boxW + gap},${y + boxH - 15} ${x + boxW + gap + triW},${y + boxH - 15}`}
                      fill="#FFC107" stroke="#F59E0B" strokeWidth={1} opacity={0.8}
                    />
                    <text x={x + boxW + gap + triW / 2} y={y + boxH - 8}
                      textAnchor="middle" fontSize="9" fontWeight="bold" fill="#92400e">
                      {bufferData[i].wip}
                    </text>

                    {/* Arrow from triangle to next station */}
                    <line x1={x + boxW + gap + triW} y1={y + boxH / 2}
                      x2={x + boxW + gap * 2 + triW} y2={y + boxH / 2}
                      stroke="#d1d5db" strokeWidth={1} markerEnd="url(#vsm-arrow)" />

                    {/* Red bar in ladder = waiting */}
                    <rect x={x + boxW} y={ladderY + 14} width={gap * 2 + triW} height={10} rx={2}
                      fill="#F31260" opacity={0.6} />
                  </g>
                )}
              </g>
            );
          })}

          {/* Arrow marker */}
          <defs>
            <marker id="vsm-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#9ca3af" />
            </marker>
          </defs>
        </svg>
      </div>
    </div>
  );
});
export { ValueStreamMap };

function formatSec(s: number): string {
  if (s >= 3600) return `${(s / 3600).toFixed(1)}h`;
  if (s >= 60) return `${(s / 60).toFixed(1)}m`;
  return `${s.toFixed(0)}s`;
}
