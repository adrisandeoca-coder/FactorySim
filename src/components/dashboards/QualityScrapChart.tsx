import { useState, useRef } from 'react';
import type { OEEData, SimulationResult } from '../../types';
import { useModelStore } from '../../stores/modelStore';

interface QualityScrapChartProps {
  data: OEEData;
  result?: SimulationResult | null;
}

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const BAR_HEIGHT = 28;
const GAP = 6;
const LABEL_WIDTH = 150;
const PCT_LABEL_WIDTH = 50;
const CHART_WIDTH = 620;
const MAX_WIDGET_HEIGHT = 600;

function qualityColor(q: number): string {
  if (q >= 0.98) return '#22c55e'; // green
  if (q >= 0.95) return '#f59e0b'; // orange
  return '#ef4444'; // red
}

export function QualityScrapChart({ data, result }: QualityScrapChartProps) {
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

  // Build station data with quality values, sorted ascending (worst first)
  const allSorted = [...stations]
    .map((s) => {
      const oeeStation = data.byStation[s.id];
      const quality = oeeStation?.quality ?? 1;
      return { id: s.id, name: s.name, quality, scrapRate: s.scrapRate ?? 0 };
    })
    .sort((a, b) => a.quality - b.quality);

  // Show only stations with scrap by default to highlight quality issues
  const stationsWithScrap = allSorted.filter((s) => s.quality < 0.999);
  const hasScrapStations = stationsWithScrap.length > 0;
  const effectiveList = showAll ? allSorted : (hasScrapStations ? stationsWithScrap : allSorted);
  const hasTruncation = effectiveList.length > 20;
  const displayed = hasTruncation ? effectiveList.slice(0, 15) : effectiveList;

  // Scale for large counts
  const isLarge = displayed.length > 15;
  const effectiveBarHeight = isLarge ? 22 : BAR_HEIGHT;
  const effectiveGap = isLarge ? 3 : GAP;
  const fontSize = isLarge ? 10 : 12;

  const barAreaWidth = CHART_WIDTH - LABEL_WIDTH - PCT_LABEL_WIDTH;
  const contentHeight = displayed.length * (effectiveBarHeight + effectiveGap) + 20;
  const widgetHeight = Math.min(contentHeight, MAX_WIDGET_HEIGHT);
  const scrollable = contentHeight > MAX_WIDGET_HEIGHT;

  const handleBarHover = (stationId: string, e: React.MouseEvent) => {
    setHoveredStation(stationId);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const hoveredData = hoveredStation
    ? displayed.find((s) => s.id === hoveredStation) ?? null
    : null;

  return (
    <div className="space-y-3">
      <div
        className={`relative ${scrollable ? 'overflow-y-auto' : ''}`}
        style={{ maxHeight: widgetHeight }}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${contentHeight}`}
          className="w-full"
          style={{ height: contentHeight, minHeight: widgetHeight }}
        >
          {displayed.map((station, i) => {
            const y = i * (effectiveBarHeight + effectiveGap) + 10;
            const qualPct = station.quality;
            const scrapPct = 1 - qualPct;
            const qualWidth = qualPct * barAreaWidth;
            const scrapWidth = scrapPct * barAreaWidth;
            const isHovered = hoveredStation === station.id;
            const color = qualityColor(qualPct);

            return (
              <g
                key={station.id}
                onMouseEnter={(e) => handleBarHover(station.id, e as any)}
                onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoveredStation(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover highlight */}
                {isHovered && (
                  <rect
                    x={0}
                    y={y - 2}
                    width={CHART_WIDTH}
                    height={effectiveBarHeight + 4}
                    fill="rgba(59,130,246,0.06)"
                    rx={4}
                  />
                )}

                {/* Station name */}
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
                  {(() => {
                    const sn = shortName(station.name);
                    return sn.length > 22 ? sn.slice(0, 22) + '\u2026' : sn;
                  })()}
                </text>

                {/* Quality bar (green portion) */}
                {qualWidth > 0.5 && (
                  <rect
                    x={LABEL_WIDTH}
                    y={y}
                    width={qualWidth}
                    height={effectiveBarHeight}
                    fill={color}
                    rx={3}
                    opacity={isHovered ? 1 : 0.85}
                  />
                )}

                {/* Scrap bar (red portion) */}
                {scrapWidth > 0.5 && (
                  <rect
                    x={LABEL_WIDTH + qualWidth}
                    y={y}
                    width={scrapWidth}
                    height={effectiveBarHeight}
                    fill="#ef4444"
                    rx={scrapWidth === barAreaWidth ? 3 : 0}
                    opacity={isHovered ? 1 : 0.7}
                  />
                )}

                {/* Quality % label on right */}
                <text
                  x={LABEL_WIDTH + barAreaWidth + 8}
                  y={y + effectiveBarHeight / 2 + 4}
                  fill={qualPct >= 0.98 ? '#16a34a' : qualPct >= 0.95 ? '#d97706' : '#dc2626'}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  {(qualPct * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>

        {scrollable && (
          <div className="sticky bottom-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>

      {/* Show all / filter toggle */}
      {(hasScrapStations || allSorted.length > 20) && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showAll
              ? (hasScrapStations ? `Show only stations with scrap (${stationsWithScrap.length})` : 'Show top 15')
              : `Show all ${allSorted.length} stations`}
          </button>
        </div>
      )}

      {/* Tooltip */}
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
          <div className="font-bold text-sm mb-1">{shortName(hoveredData.name)}</div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-1.5">
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: qualityColor(hoveredData.quality) }}
                />
                <span className="text-gray-300">Quality</span>
              </div>
              <span className="font-mono font-bold">
                {(hoveredData.quality * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-sm bg-red-500" />
                <span className="text-gray-300">Scrap</span>
              </div>
              <span className="font-mono font-bold">
                {((1 - hoveredData.quality) * 100).toFixed(1)}%
              </span>
            </div>
            {hoveredData.scrapRate > 0 && (
              <div className="flex items-center justify-between space-x-4 pt-0.5 border-t border-gray-700">
                <span className="text-gray-400">Configured rate</span>
                <span className="font-mono text-gray-300">
                  {(hoveredData.scrapRate * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspection Rejections Summary */}
      {(() => {
        const extraNodes = (result as any)?.kpis?.extraNodes || (result as any)?.kpis?.extra_nodes;
        if (!extraNodes) return null;
        const inspections = Object.entries(extraNodes).filter(
          ([, v]: [string, any]) => v?.type === 'inspection' && v?.itemsFailed > 0
        );
        if (inspections.length === 0) return null;
        return (
          <div className="border-t border-gray-100 pt-2 mt-1">
            <div className="text-xs font-semibold text-gray-600 mb-1">Inspection Rejections</div>
            <div className="space-y-1">
              {inspections.map(([id, v]: [string, any]) => (
                <div key={id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{v.name || id}</span>
                  <span className="font-mono text-red-600 font-medium">
                    {v.itemsFailed} rejected / {v.itemsProcessed} inspected ({((v.itemsFailed / v.itemsProcessed) * 100).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 border-t border-gray-100">
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-xs text-gray-600">Quality (&ge;98%)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-500" />
          <span className="text-xs text-gray-600">Quality (95-98%)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-xs text-gray-600">Scrap / Quality &lt;95%</span>
        </div>
      </div>
    </div>
  );
}
