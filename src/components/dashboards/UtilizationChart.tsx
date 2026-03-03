import { useState, useRef } from 'react';
import type { UtilizationData, ResourceUtilization } from '../../types';
import { useModelStore } from '../../stores/modelStore';

interface UtilizationChartProps {
  data: UtilizationData;
}

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const BAR_HEIGHT = 42;
const GAP = 8;
const LABEL_WIDTH = 150;
const MAX_WIDGET_HEIGHT = 600;
const CHART_WIDTH = 620;

const categories = [
  { key: 'busy', color: '#3b82f6', label: 'Busy', pattern: 'pat-busy' },
  { key: 'idle', color: '#d1d5db', label: 'Idle', pattern: 'pat-idle' },
  { key: 'setup', color: '#8b5cf6', label: 'Setup', pattern: 'pat-setup' },
  { key: 'blocked', color: '#f59e0b', label: 'Blocked', pattern: 'pat-blocked' },
  { key: 'failed', color: '#ef4444', label: 'Failed', pattern: 'pat-failed' },
  { key: 'starved', color: '#a855f7', label: 'Starved', pattern: 'pat-starved' },
  { key: 'offShift', color: '#6b7280', label: 'Off Shift', pattern: 'pat-offShift' },
  { key: 'batchWait', color: '#60a5fa', label: 'Batching', pattern: 'pat-batchWait' },
] as const;

export function UtilizationChart({ data }: UtilizationChartProps) {
  const { model } = useModelStore();
  const stations = model.stations;
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showAll, setShowAll] = useState(false);

  if (stations.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No stations in model
      </div>
    );
  }

  // Scale down for large station counts
  const isLarge = stations.length > 15;
  const effectiveBarHeight = isLarge ? 32 : BAR_HEIGHT;
  const effectiveGap = isLarge ? 4 : GAP;
  const fontSize = isLarge ? 10 : 12;

  // Sort stations by busy% descending for better readability
  const allSorted = [...stations].sort((a, b) => {
    const aUtil = (data.byStation[a.id] as unknown as Record<string, number>)?.busy || 0;
    const bUtil = (data.byStation[b.id] as unknown as Record<string, number>)?.busy || 0;
    return bUtil - aUtil;
  });
  const hasTruncation = stations.length > 20 && !showAll;
  const sortedStations = hasTruncation ? allSorted.slice(0, 15) : allSorted;

  // Dynamic height: each bar gets guaranteed space (uses displayed count)
  const contentHeight = sortedStations.length * (effectiveBarHeight + effectiveGap) + 20;
  const widgetHeight = Math.min(contentHeight, MAX_WIDGET_HEIGHT);
  const scrollable = contentHeight > MAX_WIDGET_HEIGHT;
  const barAreaWidth = CHART_WIDTH - LABEL_WIDTH - 40;

  const handleBarHover = (stationId: string, e: React.MouseEvent) => {
    setHoveredStation(stationId);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  // Get tooltip data for hovered station
  const hoveredData = hoveredStation ? (() => {
    const station = stations.find(s => s.id === hoveredStation);
    const d = data.byStation[hoveredStation] as unknown as Record<string, number> | undefined;
    if (!station || !d) return null;
    return { name: station.name, data: d };
  })() : null;

  return (
    <div className="space-y-3">
      {/* Chart container — scrollable if needed */}
      <div
        className={`relative ${scrollable ? 'overflow-y-auto' : ''}`}
        style={{ maxHeight: widgetHeight }}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${contentHeight}`}
          className="w-full"
          style={{ height: contentHeight, minHeight: widgetHeight }}
        >
          <defs>
            {/* Busy: solid (no overlay pattern needed — default) */}
            <pattern id="pat-busy" patternUnits="userSpaceOnUse" width="8" height="8">
              <rect width="8" height="8" fill="#3b82f6" />
            </pattern>
            {/* Idle: horizontal lines */}
            <pattern id="pat-idle" patternUnits="userSpaceOnUse" width="8" height="8">
              <rect width="8" height="8" fill="#d1d5db" />
              <line x1="0" y1="4" x2="8" y2="4" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
            </pattern>
            {/* Setup: diagonal stripes (45deg) */}
            <pattern id="pat-setup" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#8b5cf6" />
              <line x1="0" y1="0" x2="6" y2="0" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
            </pattern>
            {/* Blocked: dots */}
            <pattern id="pat-blocked" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#f59e0b" />
              <circle cx="3" cy="3" r="1.2" fill="#fff" opacity="0.45" />
            </pattern>
            {/* Failed: crosshatch */}
            <pattern id="pat-failed" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#ef4444" />
              <line x1="0" y1="0" x2="6" y2="6" stroke="#fff" strokeWidth="1" opacity="0.4" />
              <line x1="6" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="1" opacity="0.4" />
            </pattern>
            {/* Starved: diagonal stripes (135deg) */}
            <pattern id="pat-starved" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(135)">
              <rect width="6" height="6" fill="#a855f7" />
              <line x1="0" y1="0" x2="6" y2="0" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
            </pattern>
            {/* Off Shift: vertical lines */}
            <pattern id="pat-offShift" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#6b7280" />
              <line x1="3" y1="0" x2="3" y2="6" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
            </pattern>
            {/* Batching: checkerboard */}
            <pattern id="pat-batchWait" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#60a5fa" />
              <rect x="0" y="0" width="3" height="3" fill="#fff" opacity="0.25" />
              <rect x="3" y="3" width="3" height="3" fill="#fff" opacity="0.25" />
            </pattern>
          </defs>
          {sortedStations.map((station, i) => {
            const stationData = data.byStation[station.id] || {
              busy: 0, idle: 0, setup: 0, blocked: 0, failed: 0, starved: 0, offShift: 0,
            };
            const d = stationData as unknown as Record<string, number>;
            const total = categories.reduce((sum, cat) => sum + (d[cat.key] || 0), 0);
            const scale = total > 0 ? 1 / total : 0;
            const y = i * (effectiveBarHeight + effectiveGap) + 10;
            const busyPct = (d.busy || 0) * 100;
            const isHovered = hoveredStation === station.id;

            let xOffset = LABEL_WIDTH;

            return (
              <g
                key={station.id}
                onMouseEnter={(e) => handleBarHover(station.id, e as any)}
                onMouseLeave={() => setHoveredStation(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover highlight */}
                {isHovered && (
                  <rect
                    x={0} y={y - 2}
                    width={CHART_WIDTH} height={effectiveBarHeight + 4}
                    fill="rgba(59,130,246,0.06)"
                    rx={4}
                  />
                )}

                {/* Station name — full name, truncate at 18 chars */}
                <text
                  x={LABEL_WIDTH - 8}
                  y={y + effectiveBarHeight / 2 + 4}
                  textAnchor="end"
                  fill={isHovered ? '#1e40af' : '#374151'}
                  fontSize={fontSize}
                  fontWeight={isHovered ? '600' : '400'}
                  fontFamily="system-ui, sans-serif"
                >
                  <title>{station.name}</title>
                  {(() => { const sn = shortName(station.name); return sn.length > 22 ? sn.slice(0, 22) + '\u2026' : sn; })()}
                </text>

                {/* Stacked bar segments */}
                {categories.map((cat) => {
                  const rawVal = d[cat.key] || 0;
                  const val = rawVal * scale;
                  const segWidth = val * barAreaWidth;
                  const x = xOffset;
                  xOffset += segWidth;
                  if (segWidth < 0.5) return null;
                  return (
                    <rect
                      key={cat.key}
                      x={x} y={y}
                      width={Math.max(segWidth, 0)}
                      height={effectiveBarHeight}
                      fill={`url(#${cat.pattern})`}
                      rx={cat.key === 'busy' ? 3 : 0}
                      opacity={isHovered ? 1 : 0.85}
                    >
                      <title>{`${station.name} \u2014 ${cat.label}: ${(rawVal * 100).toFixed(1)}%`}</title>
                    </rect>
                  );
                })}

                {/* Busy % label on the right */}
                <text
                  x={LABEL_WIDTH + barAreaWidth + 8}
                  y={y + effectiveBarHeight / 2 + 4}
                  fill={busyPct > 90 ? '#dc2626' : busyPct > 70 ? '#d97706' : '#6b7280'}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  {busyPct.toFixed(0)}%
                </text>
              </g>
            );
          })}
        </svg>

        {/* Scroll fade indicator */}
        {scrollable && (
          <div className="sticky bottom-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>

      {/* Top 15 / Show all toggle */}
      {stations.length > 20 && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showAll ? 'Show top 15' : `Show all ${stations.length} stations`}
          </button>
        </div>
      )}

      {/* Tooltip — shows full breakdown on hover */}
      {hoveredData && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-bold text-sm mb-1">{hoveredData.name}</div>
          <div className="space-y-0.5">
            {categories.map(cat => {
              const val = (hoveredData.data[cat.key] || 0) * 100;
              if (val < 0.1) return null;
              return (
                <div key={cat.key} className="flex items-center justify-between space-x-4">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                    <span className="text-gray-300">{cat.label}</span>
                  </div>
                  <span className="font-mono font-bold">{val.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Operator Utilization — shown when resources exist */}
      <OperatorUtilizationSection byResource={data.byResource} />

      {/* Legend — sticky, always visible */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 border-t border-gray-100">
        {categories.map((cat) => (
          <div key={cat.key} className="flex items-center space-x-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
            <span className="text-xs text-gray-600">{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact operator utilization bars — only renders when resource data exists */
function OperatorUtilizationSection({ byResource }: { byResource: Record<string, number | ResourceUtilization> }) {
  const entries = Object.entries(byResource)
    .map(([id, val]) => {
      if (typeof val === 'number') return { id, name: id, utilization: val, capacity: 1, requestCount: 0 };
      return { id, name: val.name || id, utilization: val.utilization, capacity: val.capacity, requestCount: val.requestCount };
    })
    .sort((a, b) => b.utilization - a.utilization);

  if (entries.length === 0) return null;

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operator Utilization</div>
      <div className="space-y-1.5">
        {entries.map((op) => {
          const pct = Math.round(op.utilization * 100);
          const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : pct > 40 ? '#3b82f6' : '#9ca3af';
          return (
            <div key={op.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-28 truncate text-right" title={op.name}>{op.name}</span>
              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden relative">
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
                />
                {op.capacity > 1 && (
                  <span className="absolute right-1 top-0 text-[9px] text-gray-400 leading-5">{op.capacity}x</span>
                )}
              </div>
              <span className="text-xs font-mono font-semibold w-10 text-right" style={{ color }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
