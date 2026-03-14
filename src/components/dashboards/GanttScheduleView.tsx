import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, ZoomIn, ZoomOut, Info, Search, Filter, X, Package } from 'lucide-react';
import type { SimulationResult, Station, StationUtilization } from '../../types';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { buildGanttData, getStationsForProduct, type GanttBlock, type GanttData } from '../../services/ganttDataBuilder';

// Strip distribution suffix: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

interface GanttScheduleViewProps {
  result: SimulationResult;
  stations: Station[];
  utilization?: Record<string, StationUtilization>;
  /** Day of week the simulation starts (0=Mon, 6=Sun) */
  startDayOfWeek?: number;
  /** Hour of day the simulation starts (0-23) */
  startHour?: number;
}

// State colors matching the app's visual language
const STATE_COLORS: Record<string, string> = {
  processing: '#22c55e', // green-500
  setup: '#f59e0b',      // amber-500
  idle: '#e5e7eb',        // gray-200
  blocked: '#ef4444',     // red-500
  starved: '#a855f7',     // purple-500
  failed: '#dc2626',      // red-600
  offShift: '#6b7280',    // gray-500
  batchWait: '#3b82f6',   // blue-500
};

const STATE_LABELS: Record<string, string> = {
  processing: 'Processing',
  setup: 'Setup',
  idle: 'Idle',
  blocked: 'Blocked',
  starved: 'Starved',
  failed: 'Breakdown',
  offShift: 'Off Shift',
  batchWait: 'Batch Wait',
};

const ZOOM_LEVELS = [
  { label: '1x', scale: 1 },
  { label: '2x', scale: 2 },
  { label: '4x', scale: 4 },
  { label: 'Fit', scale: 0 }, // 0 = auto-fit
];

const LANE_HEIGHT = 32;
const LANE_GAP = 4;
const LABEL_WIDTH = 140;
const TIME_HEADER_HEIGHT = 32;
const SIDEBAR_WIDTH = 180;
const MIN_LABEL_WIDTH_PX = 28; // Minimum block width to show inline product label

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Convert sim seconds to a date-like string: "Mon 08:30" or "Tue 14:15" */
function formatAsDate(seconds: number, startDayOfWeek: number, startHour: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const startMinuteOfWeek = startDayOfWeek * 24 * 60 + startHour * 60;
  const absMinute = startMinuteOfWeek + totalMinutes;
  const dayIndex = Math.floor(absMinute / (24 * 60)) % 7;
  const hourOfDay = Math.floor((absMinute % (24 * 60)) / 60);
  const minuteOfHour = absMinute % 60;
  return `${DAY_NAMES[dayIndex]} ${String(hourOfDay).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}`;
}

function formatAsDateShort(seconds: number, startDayOfWeek: number, startHour: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const startMinuteOfWeek = startDayOfWeek * 24 * 60 + startHour * 60;
  const absMinute = startMinuteOfWeek + totalMinutes;
  const dayIndex = Math.floor(absMinute / (24 * 60)) % 7;
  const hourOfDay = Math.floor((absMinute % (24 * 60)) / 60);
  const minuteOfHour = absMinute % 60;
  // For tick labels, omit day if sim < 24h or show compact day
  if (seconds < 86400) {
    return `${String(hourOfDay).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}`;
  }
  return `${DAY_NAMES[dayIndex].charAt(0)} ${String(hourOfDay).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}`;
}

/** Format duration (for block durations in tooltips) */
function formatDurationGantt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Shorten product IDs for inline labels: "Widget-Product-42" → "W-42" */
function shortProductLabel(productType?: string, productId?: string): string {
  if (!productType && !productId) return '';
  // Prefer product type for label, fall back to ID
  const raw = productType || productId || '';
  // If it looks like "Something-123", show first letter + number
  const match = raw.match(/^(.+?)[-_]?(\d+)$/);
  if (match) return `${match[1].charAt(0).toUpperCase()}-${match[2]}`;
  // Otherwise truncate
  return raw.length > 6 ? raw.slice(0, 5) + '…' : raw;
}

export function GanttScheduleView({ result, stations, utilization, startDayOfWeek = 0, startHour = 0 }: GanttScheduleViewProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localPlayheadTime, setLocalPlayheadTime] = useState(0);
  const [highlightedProduct, setHighlightedProduct] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; block: GanttBlock } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const playStartRef = useRef<{ wallTime: number; simTime: number }>({ wallTime: 0, simTime: 0 });

  // Filters
  const [stationSearch, setStationSearch] = useState('');
  const [hiddenStates, setHiddenStates] = useState<Set<string>>(new Set());
  const [selectedProductTypes, setSelectedProductTypes] = useState<Set<string>>(new Set()); // empty = all
  const [showProductBrowser, setShowProductBrowser] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Replay state from store — sync playhead when replay is active
  const isReplaying = useLiveSimulationStore((s) => s.isReplaying);
  const replayTime = useLiveSimulationStore((s) => s.replayTime);

  // Build gantt data from events
  const ganttData = useMemo<GanttData>(() => {
    return buildGanttData(result.events, stations, result.duration);
  }, [result.events, stations, result.duration]);

  const duration = ganttData.duration;
  const allStationNames = ganttData.stationOrder;

  // Extract all unique product types from traces
  const allProductTypes = useMemo(() => {
    const types = new Set<string>();
    for (const trace of Object.values(ganttData.productTraces)) {
      if (trace.productType) types.add(trace.productType);
    }
    return Array.from(types).sort();
  }, [ganttData.productTraces]);

  // Filter stations by search
  const stationNames = useMemo(() => {
    if (!stationSearch.trim()) return allStationNames;
    const q = stationSearch.toLowerCase();
    return allStationNames.filter(name => shortName(name).toLowerCase().includes(q));
  }, [allStationNames, stationSearch]);

  // Filter product traces for browser
  const filteredProducts = useMemo(() => {
    let traces = Object.values(ganttData.productTraces);
    if (selectedProductTypes.size > 0) {
      traces = traces.filter(t => selectedProductTypes.has(t.productType));
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      traces = traces.filter(t =>
        t.productId.toLowerCase().includes(q) ||
        t.productType.toLowerCase().includes(q)
      );
    }
    return traces.sort((a, b) => {
      const aStart = a.blocks[0]?.startTime ?? 0;
      const bStart = b.blocks[0]?.startTime ?? 0;
      return aStart - bStart;
    });
  }, [ganttData.productTraces, selectedProductTypes, productSearch]);

  // Check if a block should be visible based on filters
  const isBlockVisible = useCallback((block: GanttBlock) => {
    if (hiddenStates.has(block.state)) return false;
    if (selectedProductTypes.size > 0 && block.state === 'processing') {
      if (block.productType && !selectedProductTypes.has(block.productType)) return false;
    }
    return true;
  }, [hiddenStates, selectedProductTypes]);

  const hasActiveFilters = stationSearch.length > 0 || hiddenStates.size > 0 || selectedProductTypes.size > 0;

  const toggleState = useCallback((state: string) => {
    setHiddenStates(prev => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }, []);

  const toggleProductType = useCallback((type: string) => {
    setSelectedProductTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setStationSearch('');
    setHiddenStates(new Set());
    setSelectedProductTypes(new Set());
    setProductSearch('');
  }, []);

  // Effective playhead: use replay time when replaying, local time otherwise
  const playheadTime = isReplaying ? replayTime : localPlayheadTime;

  // Sync: stop local playback when replay starts
  useEffect(() => {
    if (isReplaying && localPlaying) {
      setLocalPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
    }
  }, [isReplaying, localPlaying]);

  // Highlighted stations (when a product is clicked)
  const highlightedStations = useMemo(() => {
    if (!highlightedProduct) return new Set<string>();
    return new Set(getStationsForProduct(ganttData, highlightedProduct));
  }, [ganttData, highlightedProduct]);

  // Timeline dimensions
  const containerWidth = 900; // base width, scales with zoom
  const zoom = ZOOM_LEVELS[zoomIndex];
  const effectiveScale = zoom.scale === 0 ? 1 : zoom.scale;
  const timelineWidth = containerWidth * effectiveScale;
  const totalHeight = TIME_HEADER_HEIGHT + stationNames.length * (LANE_HEIGHT + LANE_GAP) + 20;

  // Pixel per second
  const pxPerSec = duration > 0 ? timelineWidth / duration : 1;

  // Time ticks
  const timeTicks = useMemo(() => {
    if (duration <= 0) return [];
    const targetTicks = 10;
    const rawInterval = duration / targetTicks;
    const niceIntervals = [60, 300, 600, 900, 1800, 3600, 7200, 14400, 28800];
    let interval = niceIntervals.find(i => i >= rawInterval) || rawInterval;
    if (effectiveScale >= 2) interval = Math.max(60, interval / effectiveScale);

    const ticks: { time: number; label: string }[] = [];
    for (let t = 0; t <= duration; t += interval) {
      ticks.push({ time: t, label: formatAsDateShort(t, startDayOfWeek, startHour) });
    }
    return ticks;
  }, [duration, effectiveScale, startDayOfWeek, startHour]);

  // --- Local playhead animation (only when NOT replaying) ---
  const startPlayback = useCallback(() => {
    if (isReplaying) return; // Don't start local playback during replay
    setLocalPlaying(true);
    playStartRef.current = { wallTime: performance.now(), simTime: localPlayheadTime };

    const animate = () => {
      const elapsed = (performance.now() - playStartRef.current.wallTime) / 1000;
      const speed = duration / 15; // 15-second full playthrough
      const newTime = playStartRef.current.simTime + elapsed * speed;
      if (newTime >= duration) {
        setLocalPlayheadTime(duration);
        setLocalPlaying(false);
        return;
      }
      setLocalPlayheadTime(newTime);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [localPlayheadTime, duration, isReplaying]);

  const stopPlayback = useCallback(() => {
    setLocalPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Click on timeline to set playhead
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isReplaying) return; // Don't allow seeking during replay (replay controls time)
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / timelineWidth) * duration;
    setLocalPlayheadTime(Math.max(0, Math.min(duration, time)));
    if (localPlaying) {
      stopPlayback();
    }
  }, [timelineWidth, duration, localPlaying, stopPlayback, isReplaying]);

  // Block click → highlight product route
  const handleBlockClick = useCallback((block: GanttBlock) => {
    if (block.productId) {
      setHighlightedProduct(prev => prev === block.productId ? null : (block.productId ?? null));
    }
  }, []);

  // Tooltip handlers
  const handleBlockHover = useCallback((e: React.MouseEvent, block: GanttBlock) => {
    const rect = (e.currentTarget as HTMLElement).closest('.gantt-scroll-container')?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, block });
  }, []);

  const handleBlockLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // KPI sidebar data
  const stationKpis = useMemo(() => {
    if (!utilization) return null;
    const kpis: Record<string, { busy: number; blocked: number; starved: number }> = {};
    for (const name of stationNames) {
      const station = stations.find(s => s.name === name);
      if (station && utilization[station.id]) {
        const u = utilization[station.id];
        kpis[name] = { busy: u.busy, blocked: u.blocked, starved: u.starved };
      }
    }
    return kpis;
  }, [utilization, stationNames, stations]);

  if (allStationNames.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center text-gray-400">
        <Info className="w-5 h-5 mr-2" />
        No station events found in simulation log
      </div>
    );
  }

  const playheadX = (playheadTime / duration) * timelineWidth;

  return (
    <div className="space-y-2">
      {/* Controls Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Play/Pause — disabled during replay */}
          <button
            onClick={localPlaying ? stopPlayback : startPlayback}
            disabled={isReplaying}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isReplaying
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
            title={isReplaying ? 'Gantt synced to replay — use replay controls' : undefined}
          >
            {localPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {localPlaying ? 'Pause' : 'Play'}
          </button>

          {/* Playhead time display */}
          <span className="text-xs text-gray-500 font-mono tabular-nums min-w-[60px]">
            {formatAsDate(playheadTime, startDayOfWeek, startHour)} / {formatAsDate(duration, startDayOfWeek, startHour)}
          </span>

          {/* Replay sync indicator */}
          {isReplaying && (
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Synced to Replay
            </span>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 text-blue-700'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>

          {/* Product browser toggle */}
          <button
            onClick={() => setShowProductBrowser(!showProductBrowser)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showProductBrowser
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Products
            <span className="text-[10px] text-gray-400">({Object.keys(ganttData.productTraces).length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => setZoomIndex(Math.max(0, zoomIndex - 1))}
            disabled={zoomIndex === 0}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z.label}
              onClick={() => setZoomIndex(i)}
              className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                zoomIndex === i
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {z.label}
            </button>
          ))}
          <button
            onClick={() => setZoomIndex(Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1))}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Filter Bar — collapsible */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Filters</span>
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
                Clear all
              </button>
            )}
          </div>

          {/* Station search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              placeholder="Search stations..."
              className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
            {stationSearch && (
              <button onClick={() => setStationSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* State visibility toggles */}
          <div>
            <div className="text-[10px] text-gray-500 font-medium mb-1.5">Show/Hide States</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATE_LABELS).map(([key, label]) => {
                const isHidden = hiddenStates.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleState(key)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all border ${
                      isHidden
                        ? 'border-gray-200 bg-white text-gray-400 line-through'
                        : 'border-transparent bg-white text-gray-700 shadow-sm'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{
                        backgroundColor: STATE_COLORS[key],
                        opacity: isHidden ? 0.3 : (key === 'idle' ? 0.4 : 1),
                      }}
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product type filter */}
          {allProductTypes.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 font-medium mb-1.5">Product Types</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedProductTypes(new Set())}
                  className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all border ${
                    selectedProductTypes.size === 0
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
                {allProductTypes.map(type => {
                  const isSelected = selectedProductTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleProductType(type)}
                      className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all border ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active filter summary */}
          {stationSearch && (
            <div className="text-[10px] text-gray-500">
              Showing {stationNames.length} of {allStationNames.length} stations
            </div>
          )}
        </div>
      )}

      {/* Product highlight indicator */}
      {highlightedProduct && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <span className="text-blue-700 font-medium">
            Tracking: <span className="font-bold">{highlightedProduct}</span>
            {ganttData.productTraces[highlightedProduct]?.productType && (
              <span className="text-blue-500 ml-1">
                ({ganttData.productTraces[highlightedProduct].productType})
              </span>
            )}
          </span>
          <span className="text-blue-400 ml-2">
            {ganttData.productTraces[highlightedProduct]?.blocks.length || 0} operations
          </span>
          <button
            onClick={() => setHighlightedProduct(null)}
            className="text-blue-500 hover:text-blue-700 font-bold ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Main Gantt area */}
      <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* KPI sidebar */}
        {stationKpis && (
          <div className="flex-shrink-0 bg-gray-50 border-r border-gray-200" style={{ width: SIDEBAR_WIDTH }}>
            <div
              className="text-[10px] font-bold text-gray-500 uppercase px-3 flex items-center border-b border-gray-200"
              style={{ height: TIME_HEADER_HEIGHT }}
            >
              Utilization
            </div>
            {stationNames.map(name => {
              const kpi = stationKpis[name];
              const dimmed = highlightedProduct && !highlightedStations.has(name);
              return (
                <div
                  key={name}
                  className={`flex items-center px-3 border-b border-gray-100 transition-opacity ${dimmed ? 'opacity-30' : ''}`}
                  style={{ height: LANE_HEIGHT + LANE_GAP }}
                >
                  {kpi ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                        <div className="h-full bg-green-500" style={{ width: `${kpi.busy * 100}%` }} title={`Busy: ${(kpi.busy * 100).toFixed(0)}%`} />
                        <div className="h-full bg-red-400" style={{ width: `${kpi.blocked * 100}%` }} title={`Blocked: ${(kpi.blocked * 100).toFixed(0)}%`} />
                        <div className="h-full bg-purple-400" style={{ width: `${kpi.starved * 100}%` }} title={`Starved: ${(kpi.starved * 100).toFixed(0)}%`} />
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-gray-600 w-8 text-right">
                        {(kpi.busy * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Station labels (sticky) */}
        <div className="flex-shrink-0 bg-white z-10 border-r border-gray-200" style={{ width: LABEL_WIDTH }}>
          <div
            className="text-[10px] font-bold text-gray-500 uppercase px-3 flex items-center border-b border-gray-200"
            style={{ height: TIME_HEADER_HEIGHT }}
          >
            Station
          </div>
          {stationNames.map(name => {
            const dimmed = highlightedProduct && !highlightedStations.has(name);
            return (
              <div
                key={name}
                className={`flex items-center px-3 text-xs font-medium text-gray-700 border-b border-gray-100 truncate transition-opacity ${dimmed ? 'opacity-30' : ''}`}
                style={{ height: LANE_HEIGHT + LANE_GAP }}
                title={name}
              >
                {shortName(name)}
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden relative gantt-scroll-container"
          onClick={handleTimelineClick}
        >
          <div style={{ width: timelineWidth, minHeight: totalHeight }} className="relative">
            {/* Time header */}
            <div
              className="sticky top-0 bg-white border-b border-gray-200 z-10"
              style={{ height: TIME_HEADER_HEIGHT }}
            >
              <svg width={timelineWidth} height={TIME_HEADER_HEIGHT}>
                {timeTicks.map(tick => {
                  const x = tick.time * pxPerSec;
                  return (
                    <g key={tick.time}>
                      <line x1={x} y1={TIME_HEADER_HEIGHT - 8} x2={x} y2={TIME_HEADER_HEIGHT} stroke="#d1d5db" strokeWidth={1} />
                      <text x={x + 4} y={TIME_HEADER_HEIGHT - 12} fontSize={10} fill="#9ca3af" fontFamily="monospace">
                        {tick.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Swimlanes */}
            <div ref={timelineRef} className="relative">
              {stationNames.map((name, laneIdx) => {
                const blocks = ganttData.stationTimelines[name] || [];
                const y = laneIdx * (LANE_HEIGHT + LANE_GAP);
                const dimmed = highlightedProduct && !highlightedStations.has(name);

                return (
                  <div
                    key={name}
                    className={`absolute left-0 border-b border-gray-50 transition-opacity ${dimmed ? 'opacity-20' : ''}`}
                    style={{ top: y, height: LANE_HEIGHT + LANE_GAP, width: timelineWidth }}
                  >
                    {/* Lane background stripe */}
                    {laneIdx % 2 === 0 && (
                      <div className="absolute inset-0 bg-gray-50/50" />
                    )}

                    {/* Grid lines */}
                    <svg className="absolute inset-0 pointer-events-none" width={timelineWidth} height={LANE_HEIGHT + LANE_GAP}>
                      {timeTicks.map(tick => (
                        <line
                          key={tick.time}
                          x1={tick.time * pxPerSec}
                          y1={0}
                          x2={tick.time * pxPerSec}
                          y2={LANE_HEIGHT + LANE_GAP}
                          stroke="#f3f4f6"
                          strokeWidth={1}
                        />
                      ))}
                    </svg>

                    {/* State blocks */}
                    {blocks.map((block, blockIdx) => {
                      // Apply visibility filters
                      if (!isBlockVisible(block)) return null;

                      const x = block.startTime * pxPerSec;
                      const w = Math.max(1, (block.endTime - block.startTime) * pxPerSec);
                      const color = STATE_COLORS[block.state] || '#e5e7eb';
                      const isProductHighlighted = highlightedProduct && block.productId === highlightedProduct;
                      const isIdle = block.state === 'idle';
                      const isProcessing = block.state === 'processing';

                      // Don't render very narrow idle blocks
                      if (isIdle && w < 2) return null;

                      // Inline product/order label for processing blocks wide enough
                      const inlineLabel = isProcessing && w >= MIN_LABEL_WIDTH_PX
                        ? shortProductLabel(block.productType, block.productId)
                        : '';

                      return (
                        <div
                          key={blockIdx}
                          className={`absolute cursor-pointer transition-all ${
                            isProductHighlighted
                              ? 'ring-2 ring-blue-500 z-20 brightness-110'
                              : 'hover:brightness-110 hover:z-10'
                          }`}
                          style={{
                            left: x,
                            top: LANE_GAP / 2,
                            width: w,
                            height: LANE_HEIGHT,
                            backgroundColor: color,
                            borderRadius: w > 4 ? 3 : 1,
                            opacity: isIdle ? 0.4 : 1,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBlockClick(block);
                          }}
                          onMouseEnter={(e) => handleBlockHover(e, block)}
                          onMouseLeave={handleBlockLeave}
                        >
                          {/* Inline product label on processing blocks */}
                          {inlineLabel && (
                            <span
                              className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 pointer-events-none select-none overflow-hidden"
                              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                            >
                              {inlineLabel}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Playhead */}
              {playheadTime > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 z-30 pointer-events-none"
                  style={{
                    left: playheadX,
                    backgroundColor: isReplaying ? '#6366f1' : '#2563eb', // indigo when synced, blue when local
                  }}
                >
                  <div
                    className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: isReplaying ? '#6366f1' : '#2563eb' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-50 pointer-events-none bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs max-w-[250px]"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: STATE_COLORS[tooltip.block.state] }}
                />
                {STATE_LABELS[tooltip.block.state] || tooltip.block.state}
              </div>
              <div className="text-gray-300 space-y-0.5">
                <div>Station: {shortName(tooltip.block.stationName)}</div>
                <div>Time: {formatAsDate(tooltip.block.startTime, startDayOfWeek, startHour)} — {formatAsDate(tooltip.block.endTime, startDayOfWeek, startHour)}</div>
                <div>Duration: {formatDurationGantt(tooltip.block.endTime - tooltip.block.startTime)}</div>
                {tooltip.block.productId && (
                  <div className="text-blue-300 font-medium">Job: {tooltip.block.productId}</div>
                )}
                {tooltip.block.productType && (
                  <div className="text-green-300">Product: {tooltip.block.productType}</div>
                )}
              </div>
              {tooltip.block.productId && (
                <div className="mt-1 pt-1 border-t border-gray-700 text-gray-400 text-[10px]">
                  Click to trace this job across all stations
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Product Browser Panel */}
      {showProductBrowser && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex-1">
              Product Browser ({filteredProducts.length})
            </span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-6 pr-2 py-1 text-[10px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 w-40"
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-gray-400">No products found</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredProducts.slice(0, 100).map(trace => {
                  const isActive = highlightedProduct === trace.productId;
                  const firstOp = trace.blocks[0];
                  const lastOp = trace.blocks[trace.blocks.length - 1];
                  const totalTime = lastOp ? lastOp.endTime - (firstOp?.startTime || 0) : 0;
                  return (
                    <button
                      key={trace.productId}
                      onClick={() => setHighlightedProduct(isActive ? null : trace.productId)}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
                        isActive
                          ? 'bg-blue-50 border-l-2 border-blue-500'
                          : 'hover:bg-gray-50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                            {trace.productId}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            {trace.productType}
                          </span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          {trace.blocks.length} ops
                          {firstOp && <> &middot; {formatAsDate(firstOp.startTime, startDayOfWeek, startHour)} — {lastOp ? formatAsDate(lastOp.endTime, startDayOfWeek, startHour) : '?'}</>}
                          {totalTime > 0 && <> &middot; {formatDurationGantt(totalTime)} total</>}
                        </div>
                      </div>
                      {/* Mini route dots */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {trace.blocks.slice(0, 6).map((b, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: STATE_COLORS.processing }}
                            title={b.stationName}
                          />
                        ))}
                        {trace.blocks.length > 6 && (
                          <span className="text-[8px] text-gray-300">+{trace.blocks.length - 6}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredProducts.length > 100 && (
                  <div className="px-3 py-2 text-[10px] text-gray-400 text-center">
                    Showing 100 of {filteredProducts.length} products
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend — clickable to toggle state visibility */}
      <div className="flex items-center gap-3 flex-wrap px-1">
        {Object.entries(STATE_LABELS).filter(([key]) => key !== 'idle').map(([key, label]) => {
          const isHidden = hiddenStates.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleState(key)}
              className={`flex items-center gap-1.5 transition-opacity ${isHidden ? 'opacity-30' : ''}`}
              title={isHidden ? `Show ${label}` : `Hide ${label}`}
            >
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: STATE_COLORS[key] }}
              />
              <span className={`text-[10px] font-medium ${isHidden ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                {label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => toggleState('idle')}
          className={`flex items-center gap-1.5 transition-opacity ${hiddenStates.has('idle') ? 'opacity-30' : ''}`}
        >
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATE_COLORS.idle, opacity: 0.4 }} />
          <span className={`text-[10px] font-medium ${hiddenStates.has('idle') ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
            Idle
          </span>
        </button>
        {hiddenStates.size > 0 && (
          <button
            onClick={() => setHiddenStates(new Set())}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium ml-2"
          >
            Show all
          </button>
        )}
      </div>
    </div>
  );
}
