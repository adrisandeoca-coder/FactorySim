import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, BarChart3, CheckCircle2, ArrowUpDown, Settings, X } from 'lucide-react';
import type { Station, KPIData, Connection } from '../../types';
import { ChartEmptyState } from './ChartEmptyState';

interface BottleneckHeatmapProps {
  stations: Station[];
  kpis: KPIData;
  connections?: Connection[];
}

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

interface StationMetrics {
  station: Station;
  utilization: number;
  blocked: number;
  starved: number;
  waitTime: number;
  throughput: number;
  queueLength: number;
  isPassThrough: boolean;
  bufferTotalItems: number;
  isBottleneck: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  gradient: string;
}

const BottleneckHeatmap = React.memo(function BottleneckHeatmap({ stations, kpis, connections }: BottleneckHeatmapProps) {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flow' | 'grid'>(stations.length > 8 ? 'grid' : 'flow');

  if (!kpis || stations.length === 0) {
    return <ChartEmptyState message="No bottleneck data available" height="h-80" />;
  }

  // Build station → input buffer mapping from connections
  const bufferIds = new Set(Object.keys(kpis.wip?.byBuffer || {}));
  const stationInputBuffer: Record<string, string> = {};
  if (connections) {
    for (const conn of connections) {
      // A connection from a buffer to a station means the buffer is the station's input
      if (bufferIds.has(conn.source) && stations.some(s => s.id === conn.target)) {
        stationInputBuffer[conn.target] = conn.source;
      }
    }
  }

  // Calculate comprehensive metrics for each station using per-station buffer data
  const stationMetrics: StationMetrics[] = stations.map((station) => {
    const stationUtil = kpis.utilization.byStation[station.id];
    const busy = stationUtil?.busy ?? 0;
    const setup = stationUtil?.setup ?? 0;
    const failed = stationUtil?.failed ?? 0;
    const utilization = busy + setup + failed;  // busy + setup + failed = non-idle fraction
    const blocked = stationUtil?.blocked ?? 0;
    const starved = stationUtil?.starved ?? 0;

    // Use this station's input buffer stats (if available)
    const inputBufferId = stationInputBuffer[station.id];
    const bufferStats = inputBufferId ? (kpis.wip.byBuffer[inputBufferId] as any) : null;
    const waitTime = bufferStats?.averageWaitingTime ?? 0;
    const queueLength = Math.round(bufferStats?.averageWip ?? 0);
    const isPassThrough = bufferStats?.isPassThrough ?? false;
    const bufferTotalItems = bufferStats?.totalItems ?? 0;

    // Use per-station throughput if available, otherwise fall back to global
    const throughput = (kpis.throughput as any).byStation?.[station.id] ?? Math.round(kpis.throughput.ratePerHour);

    const isBottleneck = utilization > 0.85;
    const severity = getSeverity(utilization);

    return {
      station,
      utilization,
      blocked,
      starved,
      waitTime,
      throughput,
      queueLength,
      isPassThrough,
      bufferTotalItems,
      isBottleneck,
      severity,
      color: getColor(severity),
      gradient: getGradient(severity),
    };
  });

  // Sort for ranking
  const sortedMetrics = [...stationMetrics].sort((a, b) => b.utilization - a.utilization);
  const topBottleneck = sortedMetrics[0];
  const avgUtilization = stationMetrics.reduce((sum, m) => sum + m.utilization, 0) / stationMetrics.length;

  // Detect if there's a clear bottleneck:
  // - At least one station above 85% utilization AND
  // - The top station is meaningfully higher than the average (>10pp spread)
  const hasBottlenecks = stationMetrics.some(m => m.isBottleneck);
  const topSpread = topBottleneck.utilization - avgUtilization;
  const hasClearBottleneck = hasBottlenecks || topSpread > 0.10;

  return (
    <div className="space-y-6">
      {/* No clear bottleneck warning */}
      {!hasClearBottleneck && (
        <div className="flex items-start gap-3 p-4 bg-white border border-gray-200 border-l-[3px] border-l-amber-500 rounded-xl">
          <WarningIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-gray-800">No Clear Bottleneck Detected</h4>
            <p className="text-sm text-gray-600 mt-1">
              All stations have similar utilization levels (avg {(avgUtilization * 100).toFixed(0)}%, spread {(topSpread * 100).toFixed(0)}pp).
              The line is relatively balanced — consider increasing arrival rate or reducing buffer sizes to reveal the true constraint.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          title={hasClearBottleneck ? "Top Bottleneck" : "Highest Utilization"}
          value={topBottleneck.station.name}
          subtitle={`${(topBottleneck.utilization * 100).toFixed(1)}% (busy + setup + failed)`}
          icon={<AlertIcon className="w-5 h-5" />}
          color={hasClearBottleneck ? "red" : "blue"}
        />
        <SummaryCard
          title="Overloaded Stations"
          value={stationMetrics.filter(m => m.severity === 'critical').length.toString()}
          subtitle="95% or more of the time in use"
          icon={<WarningIcon className="w-5 h-5" />}
          color="orange"
        />
        <SummaryCard
          title="Avg Utilization"
          value={`${(avgUtilization * 100).toFixed(1)}%`}
          subtitle="Across all stations"
          icon={<ChartIcon className="w-5 h-5" />}
          color="blue"
        />
        <div title={stationMetrics.filter(m => m.severity === 'low').map(m => m.station.name).join(', ') || 'None'}>
          <SummaryCard
            title="Stations with Headroom"
            value={`${stationMetrics.filter(m => m.severity === 'low').length} of ${stationMetrics.length}`}
            subtitle="Below 75% in use — spare capacity"
            icon={<CheckIcon className="w-5 h-5" />}
            color="green"
          />
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-t-2xl px-6 py-4 -mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <BarChart3 className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">Factory Floor Analysis</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">{stationMetrics.length} stations monitored</p>
          </div>
        </div>
        <div className="flex bg-slate-700/50 backdrop-blur rounded-xl p-1 border border-slate-600/50">
          {(['flow', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                viewMode === mode
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode === 'flow' ? 'Flow View' : 'Grid View'}
            </button>
          ))}
        </div>
      </div>

      {/* Top 5 Bottleneck Chips */}
      {stations.length > 12 && viewMode === 'grid' && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-700/50">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Top 5</span>
          {sortedMetrics.slice(0, 5).map((m, i) => (
            <button
              key={m.station.id}
              onClick={() => setSelectedStation(selectedStation === m.station.id ? null : m.station.id)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedStation === m.station.id
                  ? 'ring-2 ring-blue-400/50 bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : `${m.gradient} text-white shadow-lg hover:shadow-xl hover:scale-105`
              }`}
            >
              <span className="font-black mr-1.5 opacity-70">#{i + 1}</span>
              {shortName(m.station.name)}
              <span className="ml-2 opacity-80 font-mono">{(m.utilization * 100).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Visualization */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Visual Map */}
        <div className="xl:col-span-2">
          {viewMode === 'flow' && (
            <FlowView
              metrics={stationMetrics}
              selectedStation={selectedStation}
              onSelectStation={setSelectedStation}
            />
          )}
          {viewMode === 'grid' && (
            <GridView
              metrics={stationMetrics}
              selectedStation={selectedStation}
              onSelectStation={setSelectedStation}
            />
          )}
        </div>

        {/* Ranking Panel — scrollable with dynamic height */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 p-4 shadow-xl flex flex-col">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center flex-shrink-0">
            <RankIcon className="w-4 h-4 mr-2 text-slate-400" />
            Bottleneck Ranking
            <span className="ml-auto text-xs text-slate-500 font-normal" title="Utilization = busy + setup + failed">{sortedMetrics.length} stations</span>
          </h4>

          <div
            className="space-y-3 overflow-y-auto flex-1"
            style={{ maxHeight: Math.min(sortedMetrics.length * 72, 480) }}
          >
            {sortedMetrics.map((metrics, index) => (
              <StationRankCard
                key={metrics.station.id}
                metrics={metrics}
                rank={index + 1}
                isSelected={selectedStation === metrics.station.id}
                onClick={() => setSelectedStation(
                  selectedStation === metrics.station.id ? null : metrics.station.id
                )}
              />
            ))}
          </div>

          {/* Enhanced Legend */}
          <div className="mt-6 pt-4 border-t border-slate-700/50">
            <div className="text-xs font-medium text-slate-400 mb-3">Severity Legend</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Critical (>90%)', color: 'bg-[#F31260]', pulse: true },
                { label: 'High (80-90%)', color: 'bg-[#F5A524]', pulse: false },
                { label: 'Medium (65-80%)', color: 'bg-[#2563EB]', pulse: false },
                { label: 'Low (<65%)', color: 'bg-[#17C964]', pulse: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${item.color} ${item.pulse ? 'animate-pulse' : ''}`} />
                  <span className="text-xs text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Extra Nodes Section (palletizer, conveyor, etc.) */}
      {(() => {
        const extraNodes = (kpis as any).extraNodes || {};
        const stationIds = new Set(stations.map(s => s.id));
        const extraEntries = Object.entries(extraNodes).filter(([id]) => !stationIds.has(id));
        if (extraEntries.length === 0) return null;
        return (
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 shadow-xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <StationIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Extra Nodes</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">{extraEntries.length} auxiliary components</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {extraEntries.map(([id, stats]: [string, any]) => {
                const st = stats.state_times || stats.stateTimes || {};
                const total = Object.values(st).reduce((s: number, v: any) => s + (v as number), 0) || 1;
                const processing = ((st.processing || 0) / (total as number));
                const waiting = ((st.waiting || 0) / (total as number));
                const util = processing + waiting;
                const severity = getSeverity(util);
                return (
                  <div key={id} className="relative p-4 rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.03] backdrop-blur-sm border border-white/10 shadow-xl hover:border-white/20 transition-all duration-300 hover:scale-[1.02]" style={{ minWidth: 160 }}>
                    <div className={`absolute top-0 left-4 right-4 h-[2px] rounded-full ${getColor(severity)}`} />
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${getColor(severity)}`} />
                      <div className="text-sm font-bold text-white truncate flex-1">{stats.name || id}</div>
                    </div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Occupied</span>
                      <span className="text-xl font-black text-white font-mono tabular-nums">{(util * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${getColor(severity)}`} style={{ width: `${util * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/10">
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wide">Process</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{(processing * 100).toFixed(0)}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wide">Wait</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{(waiting * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Selected Station Details */}
      {selectedStation && (
        <StationDetails
          metrics={stationMetrics.find(m => m.station.id === selectedStation)!}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
});
export { BottleneckHeatmap };

// Flow View Component - Shows stations connected with flow lines
function FlowView({
  metrics,
  selectedStation,
  onSelectStation,
}: {
  metrics: StationMetrics[];
  selectedStation: string | null;
  onSelectStation: (id: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const displayMetrics = !showAll && metrics.length > 10
    ? [...metrics].sort((a, b) => b.utilization - a.utilization).slice(0, 10)
    : metrics;

  return (
    <div
      className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-b-2xl overflow-y-auto"
      style={{ maxHeight: '70vh', minHeight: 200 }}
    >
      {/* Dot Pattern Background */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
        <defs>
          <pattern id="dots-flow" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#64748b" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots-flow)" />
      </svg>

      {/* Show all toggle for large station counts */}
      {metrics.length > 10 && (
        <div className="relative px-5 pt-4 flex justify-end">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20"
          >
            {showAll ? 'Show top 10' : `Show all ${metrics.length}`}
          </button>
        </div>
      )}

      {/* Station Nodes — flow layout with wrapping */}
      <div className="relative p-5 flex flex-wrap gap-4 justify-center">
        {displayMetrics.map((m) => {
          const isSelected = selectedStation === m.station.id;
          const severityGlow = m.severity === 'critical' ? 'shadow-red-500/30' : m.severity === 'high' ? 'shadow-amber-500/20' : 'shadow-black/30';

          return (
            <div
              key={m.station.id}
              className={`relative transition-all duration-300 cursor-pointer
                ${isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'}`}
              onClick={() => onSelectStation(isSelected ? null : m.station.id)}
              title={m.station.name}
            >
              {/* Pulse ring for bottlenecks */}
              {m.isBottleneck && (
                <div className="absolute -inset-1 rounded-2xl bg-red-500/20 animate-pulse" />
              )}

              {/* Station Card — Glassmorphic */}
              <div
                className={`relative p-4 rounded-2xl shadow-xl ${severityGlow} border transition-all backdrop-blur-sm
                  ${isSelected ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-white/10 hover:border-white/20'}
                  bg-gradient-to-br from-white/10 to-white/[0.03]`}
                style={{ minWidth: 190, maxWidth: 230 }}
              >
                {/* Severity accent bar */}
                <div className={`absolute top-0 left-4 right-4 h-[2px] rounded-full ${m.color}`} />

                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full ${m.color} ${m.isBottleneck ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-bold text-white truncate flex-1">{shortName(m.station.name)}</div>
                </div>

                <div className="flex items-end justify-between mb-2">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Utilization</span>
                  <span className="text-xl font-black text-white font-mono tabular-nums">{(m.utilization * 100).toFixed(0)}%</span>
                </div>

                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${m.color}`}
                    style={{ width: `${m.utilization * 100}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Queue</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{m.queueLength}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Thru</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{m.throughput}/h</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Block</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{(m.blocked * 100).toFixed(0)}%</div>
                  </div>
                </div>

                {m.isBottleneck && (
                  <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-red-500 rounded-md shadow-lg shadow-red-500/30">
                    <span className="text-[9px] font-black text-white uppercase tracking-wide">Hot</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Grid View Component - Clean grid layout
function GridView({
  metrics,
  selectedStation,
  onSelectStation,
}: {
  metrics: StationMetrics[];
  selectedStation: string | null;
  onSelectStation: (id: string | null) => void;
}) {
  return (
    <div
      className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-b-2xl p-5 overflow-y-auto"
      style={{ maxHeight: '70vh', minHeight: 200 }}
    >
      {/* Dot pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
        <defs>
          <pattern id="dots-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#64748b" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots-grid)" />
      </svg>

      <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const isSelected = selectedStation === m.station.id;
          const severityGlow = m.severity === 'critical' ? 'shadow-red-500/30' : m.severity === 'high' ? 'shadow-amber-500/20' : 'shadow-black/30';
          return (
            <div
              key={m.station.id}
              onClick={() => onSelectStation(isSelected ? null : m.station.id)}
              title={m.station.name}
              className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-300
                bg-gradient-to-br from-white/10 to-white/[0.03] backdrop-blur-sm
                shadow-xl ${severityGlow} border
                ${isSelected ? 'ring-2 ring-blue-400/40 border-blue-400 scale-105' : 'border-white/10 hover:border-white/20 hover:scale-[1.02]'}`}
              style={{ minWidth: 180 }}
            >
              {/* Severity accent */}
              <div className={`absolute top-0 left-4 right-4 h-[2px] rounded-full ${m.color}`} />

              {m.isBottleneck && (
                <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-red-500 rounded-md shadow-lg shadow-red-500/30">
                  <span className="text-[9px] font-black text-white uppercase tracking-wide">Hot</span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${m.color} ${m.isBottleneck ? 'animate-pulse' : ''}`} />
                <div className="text-sm font-bold text-white truncate flex-1">{shortName(m.station.name)}</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Utilization</span>
                  <span className="text-xl font-black text-white font-mono tabular-nums">{(m.utilization * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${m.color}`}
                    style={{ width: `${m.utilization * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Queue</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{m.queueLength}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Thru</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{m.throughput}/h</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Block</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{(m.blocked * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Station Rank Card Component
function StationRankCard({
  metrics,
  rank,
  isSelected,
  onClick,
}: {
  metrics: StationMetrics;
  rank: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 border
        ${isSelected ? 'bg-blue-500/10 border-blue-500/30' : 'hover:bg-white/5 border-transparent'}`}
    >
      <div className={`w-8 h-8 rounded-lg ${metrics.gradient} flex items-center justify-center shadow-lg mr-3`}>
        <span className="text-xs font-bold text-white">{rank}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center">
          <span className="text-sm font-medium text-slate-200 truncate" title={metrics.station.name}>{shortName(metrics.station.name)}</span>
          {metrics.isBottleneck && (
            <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[9px] font-bold text-red-400 uppercase tracking-wide">
              Bottleneck
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 mt-1">
          <span className="text-xs text-slate-500">
            {metrics.isPassThrough ? `Flow-through (${metrics.bufferTotalItems} items)` : `Queue: ${metrics.queueLength}`}
          </span>
          <span className="text-xs text-slate-500">Wait: {metrics.waitTime.toFixed(0)}s</span>
          {metrics.blocked > 0.3 && (
            <span className="text-xs text-amber-400 font-medium">Blocked: {(metrics.blocked * 100).toFixed(0)}%</span>
          )}
          {metrics.starved > 0.5 && (
            <span className="text-xs text-purple-400 font-medium">Starved: {(metrics.starved * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>

      <div className="text-right ml-2" title="Busy % (processing + setup + failed)">
        <div className={`text-sm font-bold font-mono tabular-nums ${getDarkTextColor(metrics.severity)}`}>
          {(metrics.utilization * 100).toFixed(1)}%
        </div>
        <div className="w-16 h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full ${metrics.color} rounded-full transition-all duration-500`}
            style={{ width: `${metrics.utilization * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Station Details Panel
function StationDetails({
  metrics,
  onClose,
}: {
  metrics: StationMetrics;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className={`w-10 h-10 rounded-xl ${metrics.gradient} flex items-center justify-center mr-3`}>
            <StationIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{metrics.station.name}</h3>
            <span className={`text-sm ${getTextColor(metrics.severity)}`}>
              {metrics.severity.charAt(0).toUpperCase() + metrics.severity.slice(1)} Priority
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <CloseIcon className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricBox
          label="Occupied"
          value={`${(metrics.utilization * 100).toFixed(1)}%`}
          trend={metrics.utilization > 0.85 ? 'up' : 'stable'}
          color={metrics.severity}
        />
        <MetricBox
          label="Blocked"
          value={`${(metrics.blocked * 100).toFixed(1)}%`}
          trend={metrics.blocked > 0.3 ? 'up' : 'stable'}
          color={metrics.blocked > 0.3 ? 'high' : 'low'}
        />
        <MetricBox
          label="Starved"
          value={`${(metrics.starved * 100).toFixed(1)}%`}
          trend={metrics.starved > 0.5 ? 'up' : 'stable'}
          color={metrics.starved > 0.5 ? 'high' : 'low'}
        />
        <MetricBox
          label="Avg Wait Time"
          value={`${metrics.waitTime.toFixed(1)}s`}
          trend={metrics.waitTime > 60 ? 'up' : 'down'}
          color={metrics.waitTime > 60 ? 'high' : 'low'}
        />
        <MetricBox
          label="Throughput"
          value={`${metrics.throughput}/hr`}
          trend="stable"
          color="low"
        />
        <MetricBox
          label="Queue Length"
          value={metrics.queueLength.toString()}
          trend={metrics.queueLength > 10 ? 'up' : 'stable'}
          color={metrics.queueLength > 10 ? 'medium' : 'low'}
        />
      </div>

      {metrics.isBottleneck && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <WarningIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">Bottleneck Detected</h4>
              <p className="text-sm text-red-600 mt-1">
                This station is constraining overall throughput. Consider adding capacity,
                reducing cycle time, or balancing load with parallel stations.
              </p>
            </div>
          </div>
        </div>
      )}

      {metrics.blocked > 0.3 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <WarningIcon className="w-5 h-5 text-amber-500 mt-0.5 mr-3" />
            <div>
              <h4 className="text-sm font-semibold text-amber-800">
                Critically Blocked ({(metrics.blocked * 100).toFixed(0)}%)
              </h4>
              <p className="text-sm text-amber-600 mt-1">
                This station spends {(metrics.blocked * 100).toFixed(0)}% of the time blocked waiting
                to push items downstream. Check downstream buffer capacity or processing speed.
              </p>
            </div>
          </div>
        </div>
      )}

      {metrics.starved > 0.5 && !metrics.isBottleneck && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-start">
            <WarningIcon className="w-5 h-5 text-purple-500 mt-0.5 mr-3" />
            <div>
              <h4 className="text-sm font-semibold text-purple-800">
                Severely Starved ({(metrics.starved * 100).toFixed(0)}%)
              </h4>
              <p className="text-sm text-purple-600 mt-1">
                This station is idle {(metrics.starved * 100).toFixed(0)}% of the time waiting for
                input. The upstream process cannot keep up.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: 'red' | 'orange' | 'blue' | 'green';
}) {
  const colors = {
    red: 'bg-red-50 border-red-200 text-red-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
  };

  const iconColors = {
    red: 'bg-red-100 text-red-600',
    orange: 'bg-orange-100 text-orange-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-80">{title}</span>
        <div className={`p-1.5 rounded-lg ${iconColors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold truncate font-mono tabular-nums">{value}</div>
      <div className="text-xs opacity-70 mt-1">{subtitle}</div>
    </div>
  );
}

// Metric Box Component
function MetricBox({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  color?: string;
}) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900 font-mono tabular-nums">{value}</span>
        {trend === 'up' && <span className="text-red-500 text-sm">↑</span>}
        {trend === 'down' && <span className="text-green-500 text-sm">↓</span>}
        {trend === 'stable' && <span className="text-gray-400 text-sm">→</span>}
      </div>
    </div>
  );
}

// Helper Functions
function getSeverity(utilization: number): 'low' | 'medium' | 'high' | 'critical' {
  if (utilization >= 0.95) return 'critical';
  if (utilization >= 0.85) return 'high';
  if (utilization >= 0.75) return 'medium';
  return 'low';
}

function getColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-[#F31260]';
    case 'high': return 'bg-[#F5A524]';
    case 'medium': return 'bg-[#2563EB]';
    default: return 'bg-[#17C964]';
  }
}

function getGradient(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-gradient-to-br from-[#F31260] to-[#c00e4d]';
    case 'high': return 'bg-gradient-to-br from-[#F5A524] to-[#c4841d]';
    case 'medium': return 'bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]';
    default: return 'bg-gradient-to-br from-[#17C964] to-[#12a050]';
  }
}

function getTextColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-600';
    case 'high': return 'text-amber-700';
    case 'medium': return 'text-gray-600';
    default: return 'text-gray-500';
  }
}

function getDarkTextColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-amber-400';
    case 'medium': return 'text-blue-400';
    default: return 'text-slate-400';
  }
}

// Icon wrappers using Lucide
const sw = 1.75;
function AlertIcon({ className }: { className?: string }) {
  return <AlertTriangle className={className} strokeWidth={sw} />;
}
function WarningIcon({ className }: { className?: string }) {
  return <AlertCircle className={className} strokeWidth={sw} />;
}
function ChartIcon({ className }: { className?: string }) {
  return <BarChart3 className={className} strokeWidth={sw} />;
}
function CheckIcon({ className }: { className?: string }) {
  return <CheckCircle2 className={className} strokeWidth={sw} />;
}
function RankIcon({ className }: { className?: string }) {
  return <ArrowUpDown className={className} strokeWidth={sw} />;
}
function StationIcon({ className }: { className?: string }) {
  return <Settings className={className} strokeWidth={sw} />;
}
function CloseIcon({ className }: { className?: string }) {
  return <X className={className} strokeWidth={sw} />;
}
