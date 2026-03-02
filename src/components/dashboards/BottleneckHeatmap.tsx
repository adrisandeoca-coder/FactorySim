import React, { useState } from 'react';
import type { Station, KPIData, Connection } from '../../types';

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

export function BottleneckHeatmap({ stations, kpis, connections }: BottleneckHeatmapProps) {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flow' | 'grid'>(stations.length > 8 ? 'grid' : 'flow');

  if (stations.length === 0) {
    return (
      <div className="h-80 flex flex-col items-center justify-center text-gray-500 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
        <FactoryIcon className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium">No stations in model</p>
        <p className="text-sm text-gray-400 mt-1">Add stations in the Factory Builder to see bottleneck analysis</p>
      </div>
    );
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          title="Top Bottleneck"
          value={topBottleneck.station.name}
          subtitle={`${(topBottleneck.utilization * 100).toFixed(1)}% (busy + setup + failed)`}
          icon={<AlertIcon className="w-5 h-5" />}
          color="red"
        />
        <SummaryCard
          title="Critical Stations"
          value={stationMetrics.filter(m => m.severity === 'critical').length.toString()}
          subtitle="Above 90% busy"
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
        <SummaryCard
          title="Healthy Stations"
          value={`${stationMetrics.filter(m => m.severity === 'low').length} of ${stationMetrics.length}`}
          subtitle="Operating normally"
          icon={<CheckIcon className="w-5 h-5" />}
          color="green"
        />
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Factory Floor Analysis</h4>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {(['flow', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === mode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {mode === 'flow' ? 'Flow View' : 'Grid View'}
            </button>
          ))}
        </div>
      </div>

      {/* Top 5 Bottleneck Chips */}
      {stations.length > 12 && viewMode === 'grid' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">Top 5:</span>
          {sortedMetrics.slice(0, 5).map((m, i) => (
            <button
              key={m.station.id}
              onClick={() => setSelectedStation(selectedStation === m.station.id ? null : m.station.id)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                selectedStation === m.station.id
                  ? 'ring-2 ring-blue-400 bg-blue-50 text-blue-700'
                  : `${m.gradient} text-white shadow-sm hover:shadow-md`
              }`}
            >
              <span className="font-bold mr-1">#{i + 1}</span>
              {shortName(m.station.name)}
              <span className="ml-1.5 opacity-80">{(m.utilization * 100).toFixed(0)}%</span>
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
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center flex-shrink-0">
            <RankIcon className="w-4 h-4 mr-2 text-gray-500" />
            Bottleneck Ranking
            <span className="ml-auto text-xs text-gray-400 font-normal" title="Utilization = busy + setup + failed">{sortedMetrics.length} stations</span>
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
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-600 mb-3">Severity Legend</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Critical (>90%)', color: 'bg-red-500', pulse: true },
                { label: 'High (80-90%)', color: 'bg-orange-500', pulse: false },
                { label: 'Medium (65-80%)', color: 'bg-yellow-500', pulse: false },
                { label: 'Low (<65%)', color: 'bg-green-500', pulse: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${item.color} ${item.pulse ? 'animate-pulse' : ''}`} />
                  <span className="text-xs text-gray-500">{item.label}</span>
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
              <StationIcon className="w-4 h-4 mr-2 text-gray-500" />
              Extra Nodes
              <span className="ml-auto text-xs text-gray-400 font-normal">{extraEntries.length} nodes</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {extraEntries.map(([id, stats]: [string, any]) => {
                const st = stats.state_times || stats.stateTimes || {};
                const total = Object.values(st).reduce((s: number, v: any) => s + (v as number), 0) || 1;
                const processing = ((st.processing || 0) / (total as number));
                const waiting = ((st.waiting || 0) / (total as number));
                const util = processing + waiting;
                const severity = getSeverity(util);
                return (
                  <div key={id} className={`p-3 rounded-xl ${getGradient(severity)} shadow-md`} style={{ minWidth: 160 }}>
                    <div className="text-sm font-bold text-white mb-1 truncate">{stats.name || id}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/70">Occupied</span>
                      <span className="text-sm font-bold text-white">{(util * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-white/30 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-white rounded-full" style={{ width: `${util * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-2 pt-1.5 border-t border-white/20">
                      <div className="text-center">
                        <div className="text-[9px] text-white/60">Process</div>
                        <div className="text-[11px] font-bold text-white">{(processing * 100).toFixed(0)}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-white/60">Wait</div>
                        <div className="text-[11px] font-bold text-white">{(waiting * 100).toFixed(0)}%</div>
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
}

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
      className="relative bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 rounded-xl border border-gray-200 overflow-y-auto"
      style={{ maxHeight: '70vh', minHeight: 200 }}
    >
      {/* Grid Pattern Background */}
      <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Show all toggle for large station counts */}
      {metrics.length > 10 && (
        <div className="relative px-4 pt-3 flex justify-end">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showAll ? 'Show top 10' : `Show all ${metrics.length}`}
          </button>
        </div>
      )}

      {/* Station Nodes — flow layout with wrapping */}
      <div className="relative p-4 flex flex-wrap gap-4 justify-center">
        {displayMetrics.map((m) => {
          const isSelected = selectedStation === m.station.id;

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
                <div className="absolute inset-0 -m-2">
                  <div className={`w-full h-full rounded-xl ${m.color} opacity-30 animate-ping`} />
                </div>
              )}

              {/* Station Card */}
              <div
                className={`relative p-3 rounded-xl shadow-lg border-2 transition-all
                  ${isSelected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-transparent'}
                  ${m.gradient}`}
                style={{ minWidth: 180, maxWidth: 220 }}
              >
                <div className="text-sm font-bold text-white mb-1.5" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(m.station.name)}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/80">Busy</span>
                  <span className="text-sm font-bold text-white">{(m.utilization * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-1.5 h-2 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${m.utilization * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2 pt-1.5 border-t border-white/20">
                  <div className="text-center">
                    <div className="text-[9px] text-white/60">Queue</div>
                    <div className="text-[11px] font-bold text-white">{m.queueLength}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-white/60">Thru</div>
                    <div className="text-[11px] font-bold text-white">{m.throughput}/hr</div>
                  </div>
                </div>
                {m.isBottleneck && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                    <span className="text-[10px] text-red-600 font-bold">!</span>
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
      className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 p-4 overflow-y-auto"
      style={{ maxHeight: '70vh', minHeight: 200 }}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const isSelected = selectedStation === m.station.id;
          return (
            <div
              key={m.station.id}
              onClick={() => onSelectStation(isSelected ? null : m.station.id)}
              title={m.station.name}
              className={`relative p-4 rounded-xl cursor-pointer transition-all duration-300
                ${m.gradient} shadow-md hover:shadow-xl
                ${isSelected ? 'ring-4 ring-blue-400 scale-105' : 'hover:scale-102'}`}
              style={{ minWidth: 180 }}
            >
              {m.isBottleneck && (
                <div className="absolute top-2 right-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                  </span>
                </div>
              )}

              <div className="text-sm font-bold text-white mb-2" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(m.station.name)}</div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/70">Occupied</span>
                  <span className="text-sm font-bold text-white">{(m.utilization * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${m.utilization * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2 pt-2 border-t border-white/20">
                  <div className="text-center">
                    <div className="text-[10px] text-white/60">Queue</div>
                    <div className="text-xs font-bold text-white">{m.queueLength}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-white/60">Thru</div>
                    <div className="text-xs font-bold text-white">{m.throughput}/hr</div>
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
      className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200
        ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
    >
      <div className={`w-8 h-8 rounded-lg ${metrics.gradient} flex items-center justify-center shadow-sm mr-3`}>
        <span className="text-xs font-bold text-white">{rank}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-900 truncate" title={metrics.station.name}>{shortName(metrics.station.name)}</span>
          {metrics.isBottleneck && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">
              BOTTLENECK
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 mt-1">
          <span className="text-xs text-gray-500">
            {metrics.isPassThrough ? `Flow-through (${metrics.bufferTotalItems} items)` : `Queue: ${metrics.queueLength}`}
          </span>
          <span className="text-xs text-gray-500">Wait: {metrics.waitTime.toFixed(0)}s</span>
          {metrics.blocked > 0.3 && (
            <span className="text-xs text-amber-600 font-medium">Blocked: {(metrics.blocked * 100).toFixed(0)}%</span>
          )}
          {metrics.starved > 0.5 && (
            <span className="text-xs text-purple-600 font-medium">Starved: {(metrics.starved * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>

      <div className="text-right ml-2" title="Busy % (processing + setup + failed)">
        <div className={`text-sm font-bold ${getTextColor(metrics.severity)}`}>
          {(metrics.utilization * 100).toFixed(1)}%
        </div>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
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
      <div className="text-xl font-bold truncate">{value}</div>
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
        <span className="text-lg font-bold text-gray-900">{value}</span>
        {trend === 'up' && <span className="text-red-500 text-sm">↑</span>}
        {trend === 'down' && <span className="text-green-500 text-sm">↓</span>}
        {trend === 'stable' && <span className="text-gray-400 text-sm">→</span>}
      </div>
    </div>
  );
}

// Helper Functions
function getSeverity(utilization: number): 'low' | 'medium' | 'high' | 'critical' {
  if (utilization >= 0.9) return 'critical';
  if (utilization >= 0.8) return 'high';
  if (utilization >= 0.65) return 'medium';
  return 'low';
}

function getColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    default: return 'bg-green-500';
  }
}

function getGradient(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-gradient-to-br from-red-500 to-red-700';
    case 'high': return 'bg-gradient-to-br from-orange-500 to-orange-700';
    case 'medium': return 'bg-gradient-to-br from-yellow-500 to-yellow-600';
    default: return 'bg-gradient-to-br from-green-500 to-green-700';
  }
}

function getTextColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-600';
    case 'high': return 'text-orange-600';
    case 'medium': return 'text-yellow-600';
    default: return 'text-green-600';
  }
}

// Icon Components
function FactoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  );
}

function StationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
