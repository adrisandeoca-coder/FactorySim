import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  Node,
  Edge,
  NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useModelStore } from '../../stores/modelStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { useAppStore } from '../../stores/appStore';
import { LiveStationNode } from '../factory-builder/nodes/LiveStationNode';
import { LiveBufferNode } from '../factory-builder/nodes/LiveBufferNode';
import { LiveGenericNode } from '../factory-builder/nodes/LiveGenericNode';
import { LiveAnimationOverlay } from './LiveAnimationOverlay';
import { formatDuration, useSimulationStore } from '../../stores/simulationStore';
import { registerElement } from '../../services/elementRegistry';

const liveNodeTypes: NodeTypes = {
  station: LiveStationNode,
  buffer: LiveBufferNode,
  source: LiveGenericNode,
  sink: LiveGenericNode,
  conveyor: LiveGenericNode,
  operator: LiveGenericNode,
  inspection: LiveStationNode,
  assembly: LiveStationNode,
  splitter: LiveGenericNode,
  merge: LiveGenericNode,
  disassembly: LiveStationNode,
  palletize: LiveStationNode,
  depalletize: LiveStationNode,
  matchbuffer: LiveBufferNode,
};

// Product type colors (must match LiveAnimationOverlay)
const PRODUCT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

// #3 — State legend colors (always shown)
const STATE_LEGEND: { label: string; key: string; color: string }[] = [
  { label: 'Processing', key: 'processing', color: '#22c55e' },
  { label: 'Starved', key: 'starved', color: '#f59e0b' },
  { label: 'Blocked', key: 'blocked', color: '#ef4444' },
  { label: 'Idle', key: 'idle', color: '#9ca3af' },
  { label: 'Off-shift', key: 'off_shift', color: '#64748b' },
  { label: 'Setup', key: 'setup', color: '#f97316' },
  { label: 'Failed', key: 'failed', color: '#b91c1c' },
  { label: 'Batching', key: 'batch_wait', color: '#3b82f6' },
];

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Solid zone colors for nav buttons
const ZONE_BTN_COLORS = [
  '#3b82f6', '#f97316', '#22c55e', '#a855f7', '#14b8a6', '#f43f5e',
];

interface LiveSimulationViewProps {
  progress: number;
  elapsedSeconds: number;
  simDuration: number;
  height?: string | number;
}

function LiveSimulationViewInner({ progress, elapsedSeconds, simDuration, height: heightOverride }: LiveSimulationViewProps) {
  const { model } = useModelStore();
  const warmupPeriod = useSimulationStore((s) => s.defaultOptions.warmupPeriod) ?? 0;
  const stationStates = useLiveSimulationStore((s) => s.stationStates);
  const bufferLevels = useLiveSimulationStore((s) => s.bufferLevels);
  const activeProducts = useLiveSimulationStore((s) => s.activeProducts);
  const currentTime = useLiveSimulationStore((s) => s.currentTime);
  const isReplaying = useLiveSimulationStore((s) => s.isReplaying);
  const stationProducts = useLiveSimulationStore((s) => s.stationProducts);
  const stationProcessedCounts = useLiveSimulationStore((s) => s.stationProcessedCounts);
  const batchQueueCounts = useLiveSimulationStore((s) => s.batchQueueCounts);
  const sourceGeneratedCounts = useLiveSimulationStore((s) => s.sourceGeneratedCounts);
  const sinkExitedCounts = useLiveSimulationStore((s) => s.sinkExitedCounts);
  const productTypes = useLiveSimulationStore((s) => s.productTypes);
  const stationUtilizations = useLiveSimulationStore((s) => s.stationUtilizations);
  const edgeFlowCounts = useLiveSimulationStore((s) => s.edgeFlowCounts);

  // P0 — Fullscreen
  const isFullscreen = useAppStore((s) => s.isAnimationFullscreen);
  const setFullscreen = useAppStore((s) => s.setAnimationFullscreen);
  const reactFlow = useReactFlow();

  // P0 — Escape key listener
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, setFullscreen]);

  // P0 — fitView after fullscreen toggle (skip mount — ReactFlow's own fitView handles that)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const t = setTimeout(() => reactFlow.fitView({ padding: 0.08, minZoom: 0.5, maxZoom: 2, duration: 300 }), 150);
    return () => clearTimeout(t);
  }, [isFullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track product color assignments
  const productColorMap = useRef<Map<string, string>>(new Map());
  const productColorIdx = useRef(0);

  const getProductColor = useCallback((pt: string) => {
    if (!productColorMap.current.has(pt)) {
      productColorMap.current.set(pt, PRODUCT_COLORS[productColorIdx.current++ % PRODUCT_COLORS.length]);
    }
    return productColorMap.current.get(pt)!;
  }, []);

  // State filter — dim non-matching stations
  const [stateFilter, setStateFilter] = useState<string | null>(null);

  // Count station states for summary
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const state of Object.values(stationStates)) {
      counts[state] = (counts[state] || 0) + 1;
    }
    return counts;
  }, [stationStates]);

  // Build active edge set for highlighting
  const activeEdgeNodes = useMemo(() => {
    const active = new Set<string>();
    for (const [name, state] of Object.entries(stationStates)) {
      if (state === 'processing' || state === 'blocked') {
        active.add(name);
      }
    }
    for (const [name, info] of Object.entries(stationProducts)) {
      if (info) active.add(name);
    }
    for (const [name, bl] of Object.entries(bufferLevels)) {
      if (bl.level > 0) active.add(name);
    }
    return active;
  }, [stationStates, stationProducts, bufferLevels]);

  // P2 — Detect bottleneck stations: util > 95% AND upstream buffer full
  const bottleneckStationIds = useMemo(() => {
    const ids = new Set<string>();
    // Build station-id→name and name→id maps
    const stationIdToName = new Map<string, string>();
    for (const s of model.stations) stationIdToName.set(s.id, s.name);
    // Find stations with high utilization
    for (const s of model.stations) {
      const util = stationUtilizations[s.name] ?? 0;
      if (util < 0.95) continue;
      // Check if any upstream buffer is full
      for (const conn of model.connections) {
        if (conn.target !== s.id) continue;
        const srcBuf = bufferLevels[
          model.buffers.find(b => b.id === conn.source)?.name || ''
        ];
        if (srcBuf && srcBuf.capacity > 0 && srcBuf.level >= srcBuf.capacity) {
          ids.add(s.id);
          break;
        }
      }
      // Also flag if util > 98% regardless of buffer state
      if (util >= 0.98) ids.add(s.id);
    }
    return ids;
  }, [model, stationUtilizations, bufferLevels]);

  // Total sink exits — the true "Done" count matching KPIs
  const totalSinkExited = useMemo(() => {
    return Object.values(sinkExitedCounts).reduce((sum, c) => sum + c, 0);
  }, [sinkExitedCounts]);

  const nodes: Node[] = useMemo(() => {
    const stationNodes: Node[] = model.stations.map((station) => {
      const currentState = stationStates[station.name] || 'idle';
      const dimmed = stateFilter ? currentState !== stateFilter : false;
      return {
        id: station.id,
        type: station.id.startsWith('inspection') ? 'inspection' :
              station.id.startsWith('assembly') ? 'assembly' :
              station.id.startsWith('disassembly') ? 'disassembly' :
              station.id.startsWith('palletize') ? 'palletize' :
              station.id.startsWith('depalletize') ? 'depalletize' :
              'station',
        position: station.position,
        data: {
          name: station.name,
          liveState: currentState,
          currentProduct: stationProducts[station.name] || undefined,
          processedCount: stationProcessedCounts[station.name] || 0,
          simTime: currentTime,
          utilization: stationUtilizations[station.name] ?? 0,
          isBottleneck: bottleneckStationIds.has(station.id),
          batchSize: station.batchSize || 1,
          batchQueueCount: batchQueueCounts[station.name] || 0,
          dimmedByFilter: dimmed,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        style: dimmed ? { opacity: 0.25, transition: 'opacity 0.3s' } : { transition: 'opacity 0.3s' },
      };
    });

    const bufferNodes: Node[] = model.buffers.map((buffer) => {
      // Try name first, then id (server may key by either)
      const live = bufferLevels[buffer.name] || bufferLevels[buffer.id];
      return {
        id: buffer.id,
        type: buffer.id.startsWith('matchbuffer') ? 'matchbuffer' : 'buffer',
        position: buffer.position,
        data: {
          name: buffer.name,
          liveLevel: live?.level ?? 0,
          liveCapacity: live?.capacity ?? buffer.capacity,
        },
        draggable: false,
        selectable: false,
        connectable: false,
      };
    });

    const extraNodes: Node[] = model.extraNodes.map((entry) => ({
      id: entry.id,
      type: entry.type,
      position: entry.position,
      data: {
        name: entry.data.name,
        nodeType: entry.type,
        completedCount: entry.type === 'sink' ? totalSinkExited : undefined,
        generatedCount: entry.type === 'source' ? (sourceGeneratedCounts[entry.data.name] || 0) : undefined,
        exitedCount: entry.type === 'sink' ? (sinkExitedCounts[entry.data.name] || 0) : undefined,
        simTime: currentTime,
      },
      draggable: false,
      selectable: false,
      connectable: false,
    }));

    return [...stationNodes, ...bufferNodes, ...extraNodes];
  }, [model, stationStates, bufferLevels, totalSinkExited, stationProducts, stationProcessedCounts, batchQueueCounts, sourceGeneratedCounts, sinkExitedCounts, currentTime, stationUtilizations, bottleneckStationIds, stateFilter]);

  // Build name→id map for edge highlighting
  const nameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of model.stations) map.set(s.name, s.id);
    for (const b of model.buffers) map.set(b.name, b.id);
    for (const e of model.extraNodes) map.set(e.data.name, e.id);
    return map;
  }, [model]);

  // #6 — Build buffer ID→capacity map for bottleneck detection
  const bufferIdCapMap = useMemo(() => {
    const map = new Map<string, { level: number; capacity: number }>();
    for (const b of model.buffers) {
      const live = bufferLevels[b.name];
      if (live) map.set(b.id, live);
    }
    return map;
  }, [model.buffers, bufferLevels]);

  // P2 — Compute node flow map: nodeId → throughput count
  // Combine edgeFlowCounts (from animation) with stationProcessedCounts + sourceGeneratedCounts (from diagnostics)
  const nodeFlowMap = useMemo(() => {
    const map = new Map<string, number>();
    // Station processed counts (from Python diagnostics)
    for (const [name, count] of Object.entries(stationProcessedCounts)) {
      const id = nameToIdMap.get(name);
      if (id && count > 0) map.set(id, count);
    }
    // Source generated counts
    for (const [name, count] of Object.entries(sourceGeneratedCounts)) {
      const id = nameToIdMap.get(name);
      if (id && count > 0) map.set(id, count);
    }
    // Sink exited counts
    for (const [name, count] of Object.entries(sinkExitedCounts)) {
      const id = nameToIdMap.get(name);
      if (id && count > 0) map.set(id, count);
    }
    return map;
  }, [stationProcessedCounts, sourceGeneratedCounts, sinkExitedCounts, nameToIdMap]);

  // P2 — Compute max flow count for normalization (prefer nodeFlowMap, fallback to edgeFlowCounts)
  const maxFlowCount = useMemo(() => {
    const nodeVals = Array.from(nodeFlowMap.values());
    const edgeVals = Object.values(edgeFlowCounts);
    const all = [...nodeVals, ...edgeVals];
    return all.length > 0 ? Math.max(...all, 1) : 1;
  }, [nodeFlowMap, edgeFlowCounts]);

  const edges: Edge[] = useMemo(() => {
    const activeNodeIds = new Set<string>();
    for (const name of activeEdgeNodes) {
      const id = nameToIdMap.get(name);
      if (id) activeNodeIds.add(id);
    }

    const processingNodeIds = new Set<string>();
    for (const [name, state] of Object.entries(stationStates)) {
      if (state === 'processing') {
        const id = nameToIdMap.get(name);
        if (id) processingNodeIds.add(id);
      }
    }

    return model.connections.map((conn) => {
      const isActive = activeNodeIds.has(conn.target) || activeNodeIds.has(conn.source);
      const isProcessing = processingNodeIds.has(conn.target) || processingNodeIds.has(conn.source);

      const tgtBuf = bufferIdCapMap.get(conn.target);
      const isBottleneck = tgtBuf && tgtBuf.capacity > 0 && tgtBuf.level >= tgtBuf.capacity;
      const srcBuf = bufferIdCapMap.get(conn.source);
      const srcBottleneck = srcBuf && srcBuf.capacity > 0 && srcBuf.level >= srcBuf.capacity;
      const anyBottleneck = isBottleneck || srcBottleneck;

      // Quiet edges: no glow filters, subtle color, thin lines
      let stroke: string;
      let stateWidth: number;
      let opacity: number;

      if (anyBottleneck) {
        stroke = '#f87171';
        stateWidth = 2.5;
        opacity = 0.8;
      } else if (isProcessing) {
        stroke = '#4ade80';
        stateWidth = 1.5;
        opacity = 0.5;
      } else if (isActive) {
        stroke = '#60a5fa';
        stateWidth = 1.5;
        opacity = 0.4;
      } else {
        stroke = '#475569';
        stateWidth = 1;
        opacity = 0.25;
      }

      // Flow-based width — range 1-4px, zero-flow edges get dashed stroke
      const flowKey = `${conn.source}->${conn.target}`;
      let flowCount = edgeFlowCounts[flowKey] || 0;
      if (flowCount === 0) {
        const srcFlow = nodeFlowMap.get(conn.source) || 0;
        const tgtFlow = nodeFlowMap.get(conn.target) || 0;
        flowCount = Math.max(srcFlow, tgtFlow);
      }
      const flowRatio = maxFlowCount > 0 ? flowCount / maxFlowCount : 0;
      const flowWidth = 1 + flowRatio * 3; // 1-4px
      const strokeWidth = Math.max(stateWidth, flowWidth);
      const hasFlow = flowCount > 0;

      return {
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke,
          strokeWidth,
          opacity: hasFlow ? opacity : Math.min(opacity, 0.15),
          strokeDasharray: hasFlow ? undefined : '4 4',
          transition: 'stroke 0.6s, stroke-width 0.6s, opacity 0.6s',
        },
        pathOptions: { borderRadius: 12 },
      };
    });
  }, [model.connections, activeEdgeNodes, nameToIdMap, stationStates, bufferIdCapMap, edgeFlowCounts, maxFlowCount, nodeFlowMap]);

  const totalBufferItems = useMemo(() => {
    let total = 0;
    for (const v of Object.values(bufferLevels)) total += v.level;
    return total;
  }, [bufferLevels]);

  // Register container element for frame capture
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerElement('live-simulation', containerRef.current);
    return () => registerElement('live-simulation', null);
  }, []);

  // Product type legend items
  const productLegend = useMemo(() => {
    const items: { name: string; color: string }[] = [];
    for (const pt of productTypes) {
      items.push({ name: pt, color: getProductColor(pt) });
    }
    return items;
  }, [productTypes, getProductColor]);

  // P4 — Zone node IDs map for zoom presets
  // P4 — Zone detection: only split on " - " or "_" delimiters (not every space)
  const zoneNodeIds = useMemo(() => {
    const map = new Map<string, string[]>();
    const allItems: { name: string; id: string }[] = [];
    for (const s of model.stations) allItems.push({ name: s.name, id: s.id });
    for (const b of model.buffers) allItems.push({ name: b.name, id: b.id });
    for (const e of model.extraNodes) allItems.push({ name: e.data.name, id: e.id });

    for (const item of allItems) {
      // Only detect zones from explicit delimiters: "Zone A - Station 1" or "ZoneA_Station1"
      let prefix: string | null = null;
      if (item.name.includes(' - ')) {
        prefix = item.name.split(' - ')[0].trim();
      } else if (item.name.includes('_') && item.name.indexOf('_') < 20) {
        prefix = item.name.split('_')[0].trim();
      }
      if (!prefix || prefix.length > 20) continue;
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(item.id);
    }
    // Only keep zones with 2+ members
    for (const [k, v] of map) {
      if (v.length < 2) map.delete(k);
    }
    return map;
  }, [model]);

  // OEE — approximate using station utilization as availability proxy
  // This averages station busy% which is closer to Availability than full A×P×Q,
  // so label it accordingly. Full OEE comes from the KPI result after sim completes.
  const approxUtilization = useMemo(() => {
    const vals = Object.values(stationUtilizations);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [stationUtilizations]);

  // Throughput rate based on sink exits (matches KPI ratePerHour)
  const throughputRate = currentTime > 0 ? (totalSinkExited / currentTime) * 3600 : 0;

  // Issue 4+5 — Extract top bottleneck entry at component level (used by HUD + fly-to)
  // Only consider utilization keys that map to actual model stations (filters out orphaned/stale keys)
  const topBnEntry = useMemo(() => {
    return Object.entries(stationUtilizations)
      .filter(([name, u]) => u > 0 && nameToIdMap.has(name))
      .sort((a, b) => b[1] - a[1])[0] || null;
  }, [stationUtilizations, nameToIdMap]);

  const topBnId = useMemo(() => {
    if (!topBnEntry) return null;
    return nameToIdMap.get(topBnEntry[0]) || null;
  }, [topBnEntry, nameToIdMap]);

  // P3 — Double-click to focus
  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    reactFlow.fitView({ nodes: [node], padding: 0.5, minZoom: 0.5, maxZoom: 2, duration: 500 });
  }, [reactFlow]);

  // Issue 5 — B key shortcut to fly to bottleneck
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        if (topBnId) {
          reactFlow.fitView({ nodes: [{ id: topBnId }] as any, padding: 0.5, minZoom: 0.5, maxZoom: 2, duration: 500 });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [topBnId, reactFlow]);

  // P5 — Track selected zone for visual feedback
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [zoneNavExpanded, setZoneNavExpanded] = useState(false);

  // P6 — Hour tick marks for progress bar
  const hourTicks = useMemo(() => {
    if (simDuration <= 0) return [];
    const count = Math.floor(simDuration / 3600) + 1;
    return Array.from({ length: count }, (_, i) => ({
      hour: i,
      pct: (i * 3600 / simDuration) * 100,
    })).filter(t => t.pct <= 100);
  }, [simDuration]);

  // P0 — Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    setFullscreen(!isFullscreen);
  }, [isFullscreen, setFullscreen]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-xl"
      style={{ height: heightOverride ?? (isFullscreen ? '100vh' : 560) }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={liveNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.3, maxZoom: 1.5 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.3}
        maxZoom={4}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        onNodeDoubleClick={handleNodeDoubleClick}
      >
        <Background color="#334155" gap={24} size={1} />

        <LiveAnimationOverlay />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'source') return '#22c55e';
            if (node.type === 'sink') return '#ef4444';
            if (node.type === 'buffer' || node.type === 'matchbuffer') {
              const bl = (node.data as any);
              if (bl?.liveCapacity > 0 && bl?.liveLevel >= bl?.liveCapacity) return '#ef4444';
              return '#f59e0b';
            }
            const state = (node.data as any)?.liveState;
            if (state === 'processing') return '#22c55e';
            if (state === 'blocked') return '#ef4444';
            if (state === 'failed') return '#b91c1c';
            if (state === 'starved') return '#eab308';
            if (state === 'setup') return '#f97316';
            if (state === 'off_shift') return '#a855f7';
            return '#9ca3af';
          }}
          style={{ height: 150, width: 220 }}
          maskColor="rgba(0,0,0,0.6)"
          pannable
          zoomable={false}
        />
      </ReactFlow>

      {/* P6 — Progress bar with hour markers */}
      <div className="absolute top-0 left-0 right-0 h-5 bg-slate-800">
        {/* Warm-up zone overlay */}
        {warmupPeriod > 0 && simDuration > 0 && (
          <div
            className="absolute top-0 left-0 h-full z-[1]"
            style={{
              width: `${(warmupPeriod / simDuration) * 100}%`,
              background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.15) 3px, rgba(251,191,36,0.15) 6px)',
              borderRight: '1px solid rgba(251,191,36,0.4)',
            }}
          >
            {currentTime < warmupPeriod && (
              <span className="absolute top-0 left-1 text-[7px] font-bold text-amber-400/80 uppercase tracking-wider leading-5">
                warm-up
              </span>
            )}
          </div>
        )}
        {/* Fill */}
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
            boxShadow: '0 0 8px rgba(59,130,246,0.5)',
          }}
        />
        {/* Hour tick marks */}
        {hourTicks.map((tick) => (
          <div
            key={tick.hour}
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${tick.pct}%` }}
          >
            <div className="w-px h-full bg-slate-600/60" />
            <span
              className="absolute bottom-0 text-[8px] text-slate-500 font-mono leading-none"
              style={{ transform: 'translateX(-50%)' }}
            >
              {tick.hour}h
            </span>
          </div>
        ))}
        {/* Playhead dot + time label */}
        <div
          className="absolute top-1/2 flex flex-col items-center"
          style={{
            left: `${progress * 100}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.3s',
          }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-white shadow-md border border-slate-400" />
          {currentTime > 0 && (
            <span
              className="absolute top-4 text-[10px] font-mono font-bold text-white bg-slate-700/90 rounded px-1.5 py-0.5 whitespace-nowrap"
              style={{ transform: 'translateX(0)' }}
            >
              {formatHMS(currentTime)} / {formatHMS(simDuration)} ({Math.round(progress * 100)}%)
            </span>
          )}
        </div>
      </div>

      {/* #3 — Persistent state legend (top-left, offset for progress bar) */}
      <div className="absolute top-7 left-3 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-600 shadow-lg px-2.5 py-1.5 z-10">
        <div className="flex items-center space-x-2.5">
          {STATE_LEGEND.map((item) => (
            <div key={item.label} className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[9px] text-slate-400 font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* State filter (below legend) */}
      <div className="absolute top-14 left-3 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-600 shadow-lg px-2 py-1 z-10">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setStateFilter(null)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
              !stateFilter ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {STATE_LEGEND.map((item) => {
            const count = stateCounts[item.key] || 0;
            return (
              <button
                key={item.key}
                onClick={() => setStateFilter(stateFilter === item.key ? null : item.key)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors flex items-center space-x-1 ${
                  stateFilter === item.key
                    ? 'text-white ring-1 ring-white/50'
                    : count === 0
                      ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-700'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
                style={stateFilter === item.key ? { backgroundColor: item.color + '40' } : count === 0 ? { opacity: 0.5 } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
                <span className="text-[11px] font-bold text-slate-300">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product type legend (top-right, compact) */}
      {productLegend.length > 0 && (
        <div className="absolute top-7 right-3 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-600 shadow-lg px-2.5 py-1.5 z-10">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Products</div>
          <div className="flex flex-col space-y-0.5">
            {productLegend.map((item) => (
              <div key={item.name} className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}40` }} />
                <span className="text-[10px] text-slate-300 font-medium truncate max-w-[100px]">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GAP #6 — Floating KPI Panel (top-right, below product legend) — always rendered */}
      <div
        className="absolute z-20 bg-slate-900 rounded-xl border border-slate-600 shadow-2xl"
        style={{
          top: productLegend.length > 0 ? productLegend.length * 18 + 60 : 28,
          right: 12,
          width: 170,
          padding: '8px 10px',
        }}
      >
          {/* Avg Utilization circular gauge */}
          <div className="flex items-center space-x-2 mb-2">
            <div style={{ width: 44, height: 44, position: 'relative', flexShrink: 0 }}>
              <svg width={44} height={44} viewBox="0 0 44 44">
                <circle cx={22} cy={22} r={18} fill="none" stroke="#334155" strokeWidth={3} />
                <circle cx={22} cy={22} r={18} fill="none"
                  stroke={approxUtilization > 0.7 ? '#22c55e' : approxUtilization > 0.5 ? '#eab308' : '#ef4444'}
                  strokeWidth={3}
                  strokeDasharray={`${approxUtilization * 113.1} 113.1`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                  style={{ transition: 'stroke-dasharray 0.5s' }}
                />
                <text x={22} y={24} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold" fontFamily="monospace">
                  {currentTime > 0 ? `${(approxUtilization * 100).toFixed(0)}%` : '0%'}
                </text>
              </svg>
            </div>
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase">Util</div>
              <div className="text-sm font-black text-white font-mono">{currentTime > 0 ? `${(approxUtilization * 100).toFixed(1)}%` : '0.0%'}</div>
            </div>
          </div>

          {/* Throughput rate — always shown */}
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Throughput</span>
            <span className="text-[16px] font-black text-emerald-400 font-mono">{currentTime > 0 ? (throughputRate > 0 ? throughputRate.toFixed(0) : '0') : '--'}<span className="text-[10px] text-emerald-500">/hr</span></span>
          </div>

          {/* Top utilized station — always shown */}
          <div className="mb-2 pb-1.5 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Highest</span>
              {topBnEntry ? (
                <span className={`text-[10px] font-mono font-bold ${topBnEntry[1] >= 0.70 ? 'text-red-300' : 'text-amber-300/70'}`}>{(topBnEntry[1] * 100).toFixed(0)}%</span>
              ) : (
                <span className="text-[10px] text-slate-500 font-mono">—</span>
              )}
            </div>
            {topBnEntry ? (
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${topBnId && bottleneckStationIds.has(topBnId) ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className={`text-[12px] font-bold truncate max-w-[120px] ${topBnId && bottleneckStationIds.has(topBnId) ? 'text-red-400' : 'text-amber-400'}`}>{shortName(topBnEntry[0])}</span>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 italic mt-0.5">detecting...</div>
            )}
          </div>

          {/* WIP count — use max of activeProducts and sum of buffer levels + processing stations */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-slate-400 font-bold uppercase">WIP</span>
            <span className="text-[12px] font-black text-amber-400 font-mono">
              {(() => {
                const bufferWip = Object.values(bufferLevels).reduce((sum, bl) => sum + bl.level, 0);
                const processingCount = Object.values(stationStates).filter(s => s === 'processing').length;
                const computed = Math.max(activeProducts, bufferWip + processingCount);
                return computed > 0 ? computed : (currentTime > 0 ? '0' : '--');
              })()}
            </span>
          </div>

          {/* Time remaining — always rendered */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-slate-400 font-bold uppercase">Remaining</span>
            <span className="text-[10px] text-slate-300 font-mono">
              {simDuration > 0 && currentTime > 0 ? (() => {
                const rem = Math.max(0, simDuration - currentTime);
                if (rem <= 0) return 'Complete';
                const h = Math.floor(rem / 3600);
                const m = Math.floor((rem % 3600) / 60);
                return h > 0 ? `${h}h ${m}m` : `${m}m`;
              })() : '--'}
            </span>
          </div>

          {/* Fly-to-bottleneck button — always visible, disabled when no bottleneck */}
          <button
            className={`w-full text-[9px] font-bold rounded py-1 mb-1.5 transition-colors uppercase tracking-wider ${
              topBnId
                ? 'text-slate-400 hover:text-white bg-slate-800 hover:bg-red-900/50'
                : 'text-slate-600 bg-slate-800/50 cursor-not-allowed'
            }`}
            onClick={() => topBnId && reactFlow.fitView({ nodes: [{ id: topBnId }] as any, padding: 0.5, minZoom: 0.5, maxZoom: 2, duration: 500 })}
            disabled={!topBnId}
            title={topBnId ? 'Zoom to bottleneck station (B)' : 'No bottleneck detected'}
          >
            {topBnId ? 'Fly to Bottleneck' : 'No Bottleneck'}
          </button>

          {/* Active failures — always visible */}
          <div className="mb-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-bold uppercase">Failures</span>
              {(stateCounts.failed ?? 0) > 0 ? (
                <span className="text-[10px] font-bold text-red-400 animate-pulse">
                  {stateCounts.failed} station{(stateCounts.failed ?? 0) > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-green-400">
                  0 stations
                </span>
              )}
            </div>
            {(stateCounts.failed ?? 0) > 0 ? (
              <div className="mt-0.5">
                {Object.entries(stationStates)
                  .filter(([, s]) => s === 'failed')
                  .slice(0, 3)
                  .map(([name]) => (
                    <div key={name} className="text-[9px] text-red-300 truncate max-w-[150px]">
                      {shortName(name)}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="mt-0.5">
                <div className="text-[9px] text-green-400 flex items-center">
                  <svg className="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  All operational
                </div>
              </div>
            )}
          </div>
        </div>

      {/* P0 + P9 — Fullscreen toggle + Pop-out buttons */}
      <div
        className="absolute z-20 flex items-center space-x-1"
        style={{
          bottom: 52,
          right: 12,
        }}
      >
        {/* P0 — Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-600 shadow-lg p-1.5 hover:bg-slate-700 transition-colors"
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        {/* P9 — Pop-out button */}
        <button
          onClick={() => window.factorySim?.window?.createPopout()}
          className="bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-600 shadow-lg p-1.5 hover:bg-slate-700 transition-colors"
          title="Pop out animation"
        >
          <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </button>
      </div>

      {/* P4 — Zone-level zoom presets (bottom-left, collapsible) */}
      {zoneNodeIds.size > 0 && (
        <div className="absolute bottom-14 left-3 flex flex-col space-y-1 z-10">
          {/* Toggle button — always visible */}
          <button
            onClick={() => setZoneNavExpanded(!zoneNavExpanded)}
            className="bg-slate-800/90 backdrop-blur-sm rounded-md border border-slate-600 shadow-lg p-1.5 hover:bg-slate-700 transition-colors self-start"
            title={zoneNavExpanded ? 'Collapse zones' : 'Show zones'}
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              {zoneNavExpanded ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              )}
            </svg>
          </button>
          {/* Zone buttons — shown when expanded */}
          {zoneNavExpanded && (
            <>
              <button
                onClick={() => { setSelectedZone(null); reactFlow.fitView({ padding: 0.08, minZoom: 0.5, maxZoom: 2, duration: 500 }); }}
                className={`backdrop-blur-sm rounded-md border shadow-lg px-2.5 py-1 text-[10px] font-bold transition-all duration-200 ${
                  selectedZone === null
                    ? 'bg-blue-600/90 border-blue-400 text-white'
                    : 'bg-slate-800/90 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                Fit All
              </button>
              {Array.from(zoneNodeIds.entries()).map(([prefix, ids], i) => {
                const isSelected = selectedZone === prefix;
                const zoneColor = ZONE_BTN_COLORS[i % ZONE_BTN_COLORS.length];
                return (
                  <button
                    key={prefix}
                    onClick={() => {
                      setSelectedZone(prefix);
                      const zoneNodes = ids.map(id => ({ id }));
                      reactFlow.fitView({ nodes: zoneNodes as any, padding: 0.3, minZoom: 0.5, maxZoom: 2, duration: 500 });
                    }}
                    className={`backdrop-blur-sm rounded-md border shadow-lg px-2.5 py-1 text-[10px] font-medium transition-all duration-200 flex items-center space-x-1.5 ${
                      isSelected
                        ? 'text-white border-opacity-80'
                        : 'bg-slate-800/90 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                    style={isSelected ? {
                      backgroundColor: `${zoneColor}30`,
                      borderColor: zoneColor,
                      boxShadow: `0 0 8px ${zoneColor}40`,
                    } : {}}
                  >
                    <span
                      className="w-1.5 h-3.5 rounded-full flex-shrink-0 transition-all duration-200"
                      style={{
                        backgroundColor: zoneColor,
                        opacity: isSelected ? 1 : 0.5,
                        boxShadow: isSelected ? `0 0 4px ${zoneColor}` : 'none',
                      }}
                    />
                    <span style={isSelected ? { color: zoneColor, fontWeight: 700 } : {}}>{prefix}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Issue 6 — Buffer health strip */}
      {Object.keys(bufferLevels).length > 0 && (() => {
        const criticalCount = model.buffers.filter(b => {
          const live = bufferLevels[b.name];
          return live && live.capacity > 0 && live.level >= live.capacity * 0.95;
        }).length;
        return (
        <div
          className="absolute left-0 right-0 bg-slate-800/90 backdrop-blur-sm border-t border-slate-700/40 flex items-center px-2 z-10"
          style={{ bottom: 44, height: 20 }}
        >
          <span className="text-[8px] text-slate-500 font-bold uppercase mr-1 flex-shrink-0">Buf</span>
          {criticalCount > 0 && (
            <span className="text-[8px] font-bold text-red-400 bg-red-900/50 rounded px-1 mr-1.5 flex-shrink-0">{criticalCount}</span>
          )}
          <div className="flex items-center gap-px flex-1 overflow-hidden">
            {model.buffers.map((b) => {
              const live = bufferLevels[b.name];
              if (!live) return null;
              const pct = live.capacity > 0 ? (live.level / live.capacity) * 100 : 0;
              const barColor = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 50 ? '#eab308' : pct > 0 ? '#22c55e' : '#475569';
              const bufId = b.id;
              return (
                <button
                  key={b.id}
                  className="flex-1 min-w-[6px] max-w-[12px] h-3 rounded-sm transition-colors duration-300 hover:opacity-80"
                  style={{ backgroundColor: barColor }}
                  title={`${b.name}: ${live.level}/${live.capacity}`}
                  onClick={() => reactFlow.fitView({ nodes: [{ id: bufId }] as any, padding: 0.5, minZoom: 0.5, maxZoom: 2, duration: 500 })}
                />
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* Status bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm text-white border-t border-slate-700/50">
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Left: mode indicator + time */}
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${isReplaying ? 'bg-indigo-400' : 'bg-green-400'} animate-pulse`} />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {isReplaying ? 'Replay' : 'Live'}
              </span>
            </span>
            {!isReplaying && (
              <span className="text-[10px] text-slate-500">
                Elapsed: {formatDuration(elapsedSeconds)}
              </span>
            )}
          </div>

          {/* Center: station state pills */}
          <div className="flex items-center space-x-2">
            <StatePill label="Processing" count={stateCounts.processing} color="bg-green-500" />
            <StatePill label="Idle" count={stateCounts.idle} color="bg-gray-400" />
            <StatePill label="Blocked" count={stateCounts.blocked} color="bg-red-500" />
            <StatePill label="Starved" count={stateCounts.starved} color="bg-yellow-500" />
            {(stateCounts.failed ?? 0) > 0 && (
              <StatePill label="Failed" count={stateCounts.failed} color="bg-red-700" />
            )}
            {(stateCounts.setup ?? 0) > 0 && (
              <StatePill label="Setup" count={stateCounts.setup} color="bg-orange-500" />
            )}
            {(stateCounts.off_shift ?? 0) > 0 && (
              <StatePill label="Off" count={stateCounts.off_shift} color="bg-purple-500" />
            )}
          </div>

          {/* Right: metrics + OEE gauge + sparkline */}
          <div className="flex items-center space-x-3 text-sm">
            {/* P10 — Enlarged metrics */}
            <Metric label="WIP" value={activeProducts} warn={activeProducts > 50} />
            <Metric label="Buffers" value={totalBufferItems} />
            <Metric label="Done" value={totalSinkExited} accent />
            {throughputRate > 0 && (
              <span className="text-[10px] text-slate-400 font-mono">{throughputRate.toFixed(0)}/hr</span>
            )}
            {/* P5 — Mini OEE Gauge */}
            {approxUtilization > 0 && <MiniGauge value={approxUtilization} />}
            {/* Progress % removed — shown in gradient progress bar above */}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatePill({ label, count, color }: { label: string; count?: number; color: string }) {
  if (!count || count === 0) return null;
  return (
    <span className="flex items-center space-x-1" title={label}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-slate-500 font-medium">{label}</span>
      <span className="text-[10px] text-slate-300 font-bold">{count}</span>
    </span>
  );
}

// P10 — Enlarged metric counters with colored icon badges
function Metric({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  const iconColor = accent ? '#34d399' : warn ? '#fbbf24' : '#94a3b8';
  const icons: Record<string, string> = {
    WIP: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7',
    Buffers: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    Done: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  };
  return (
    <div className="flex items-center space-x-1.5">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={iconColor} viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[label] || icons.WIP} />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
        <span className={`font-extrabold font-mono tabular-nums ${
          accent ? 'text-[24px] text-emerald-400' :
          warn ? 'text-[22px] text-amber-400' :
          'text-[22px] text-white'
        }`}>
          {value.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// P5 — Mini semicircular utilization gauge
function MiniGauge({ value }: { value: number }) {
  const pct = Math.min(1, Math.max(0, value));
  const color = pct > 0.7 ? '#22c55e' : pct > 0.5 ? '#eab308' : '#ef4444';
  // SVG semicircle arc (bottom half hidden)
  const r = 14;
  const cx = 20;
  const cy = 20;
  const circumference = Math.PI * r; // half circle
  const filled = pct * circumference;

  return (
    <div className="relative" style={{ width: 40, height: 24 }} title={`Avg Utilization: ${(pct * 100).toFixed(0)}%`}>
      <svg width={40} height={24} viewBox="0 0 40 24" className="overflow-visible">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#334155"
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        {/* Value text */}
        <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize={9} fontWeight="bold" fontFamily="monospace">
          {(pct * 100).toFixed(0)}%
        </text>
      </svg>
    </div>
  );
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveSimulationView(props: LiveSimulationViewProps) {
  return (
    <ReactFlowProvider>
      <LiveSimulationViewInner {...props} />
    </ReactFlowProvider>
  );
}
