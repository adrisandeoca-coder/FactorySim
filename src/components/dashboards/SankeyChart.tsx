import React from 'react';
// @ts-expect-error no type declarations for react-plotly.js
import Plot from 'react-plotly.js';
import type { KPIData, FactoryModel, SimulationResult } from '../../types';

interface SankeyChartProps {
  kpis: KPIData;
  model: FactoryModel;
  result: SimulationResult | null;
}

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Color palette by entity type
const COLORS = {
  source: '#17C964',   // green
  station: '#2563EB',  // blue
  buffer: '#64748b',   // slate
  sink: '#a855f7',     // purple
  scrap: '#F31260',    // red
};

const SankeyChart = React.memo(function SankeyChart({ kpis, model, result }: SankeyChartProps) {
  if (!result || !model) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        Run a simulation to see material flow
      </div>
    );
  }

  // Build node index: sources, stations, buffers, sinks, scrap sinks
  const nodeLabels: string[] = [];
  const nodeColors: string[] = [];
  const nodeIdMap = new Map<string, number>(); // entity id -> node index

  // Sources
  const sources = model.extraNodes.filter((n) => n.type === 'source');
  for (const s of sources) {
    const idx = nodeLabels.length;
    nodeIdMap.set(s.id, idx);
    nodeLabels.push(shortName((s.data as { name: string }).name || 'Source'));
    nodeColors.push(COLORS.source);
  }

  // Stations
  for (const st of model.stations) {
    const idx = nodeLabels.length;
    nodeIdMap.set(st.id, idx);
    nodeLabels.push(shortName(st.name));
    nodeColors.push(COLORS.station);
  }

  // Buffers
  for (const buf of model.buffers) {
    const idx = nodeLabels.length;
    nodeIdMap.set(buf.id, idx);
    nodeLabels.push(shortName(buf.name));
    nodeColors.push(COLORS.buffer);
  }

  // Sinks
  const sinks = model.extraNodes.filter((n) => n.type === 'sink');
  for (const s of sinks) {
    const idx = nodeLabels.length;
    nodeIdMap.set(s.id, idx);
    nodeLabels.push(shortName((s.data as { name: string }).name || 'Sink'));
    nodeColors.push(COLORS.sink);
  }

  // Compute station throughput from utilization busy% and total throughput
  // Use byStation OEE quality to estimate scrap per station
  const totalThroughput = kpis.throughput.total || 1;

  // Build a connection-weight map: we distribute throughput along the routing paths
  // We'll use connection topology + proportional throughput estimation
  const linkSources: number[] = [];
  const linkTargets: number[] = [];
  const linkValues: number[] = [];
  const linkColors: string[] = [];
  const linkLabels: string[] = [];

  // Calculate station-level throughput estimate from utilization data
  // Each station's "flow" ≈ totalThroughput * (station busy / sum of all busy)
  // But a better approach: follow connections and distribute throughput proportionally
  const stationScrap = new Map<string, number>();
  for (const st of model.stations) {
    const oeeStation = kpis.oee.byStation[st.id];
    const quality = oeeStation?.quality ?? 1;
    const scrapRate = 1 - quality;
    if (scrapRate > 0.001) {
      stationScrap.set(st.id, scrapRate);
    }
  }

  // Build adjacency from connections to compute flow per connection
  // Strategy: for each connection, estimate flow based on the source node's throughput share
  // We'll compute "flow through" each entity using BFS from sources

  // First, build outgoing connection map
  const outgoing = new Map<string, { target: string; probability: number; connId: string }[]>();
  for (const conn of model.connections) {
    if (!outgoing.has(conn.source)) {
      outgoing.set(conn.source, []);
    }
    outgoing.get(conn.source)!.push({
      target: conn.target,
      probability: conn.probability ?? 1,
      connId: conn.id,
    });
  }

  // Compute flow through each node using BFS from sources
  // Flow into a source = product arrival throughput
  const nodeFlow = new Map<string, number>();

  // Initialize source flows from product throughput
  // If multiple sources, distribute by product filter or evenly
  const totalProductThroughput = Object.values(kpis.throughput.byProduct).reduce((a, b) => a + b, 0) || totalThroughput;

  for (const src of sources) {
    const srcData = src.data as { productFilter?: string };
    if (srcData.productFilter && kpis.throughput.byProduct[srcData.productFilter]) {
      nodeFlow.set(src.id, kpis.throughput.byProduct[srcData.productFilter]);
    } else {
      // Distribute total throughput evenly across sources without filters
      const unfilteredSources = sources.filter((s) => !(s.data as { productFilter?: string }).productFilter);
      nodeFlow.set(src.id, totalProductThroughput / Math.max(1, unfilteredSources.length));
    }
  }

  // BFS to propagate flow
  const visited = new Set<string>();
  const queue = sources.map((s) => s.id);
  // Process in topological order (BFS)
  let iterations = 0;
  const maxIterations = 1000;
  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const flow = nodeFlow.get(nodeId) || 0;
    const edges = outgoing.get(nodeId) || [];

    if (edges.length === 0) continue;

    // Normalize probabilities
    const totalProb = edges.reduce((sum, e) => sum + e.probability, 0) || 1;

    // Compute scrap loss at this node (only for stations)
    const scrapRate = stationScrap.get(nodeId) || 0;
    const flowAfterScrap = flow * (1 - scrapRate);

    for (const edge of edges) {
      const edgeFlow = flowAfterScrap * (edge.probability / totalProb);

      // Only add link if both nodes exist in our index
      const srcIdx = nodeIdMap.get(nodeId);
      const tgtIdx = nodeIdMap.get(edge.target);
      if (srcIdx !== undefined && tgtIdx !== undefined && edgeFlow > 0.01) {
        linkSources.push(srcIdx);
        linkTargets.push(tgtIdx);
        linkValues.push(Math.max(edgeFlow, 0.1));
        linkColors.push('rgba(100,150,200,0.3)');
        linkLabels.push(`${Math.round(edgeFlow)} units`);
      }

      // Accumulate flow at target
      nodeFlow.set(edge.target, (nodeFlow.get(edge.target) || 0) + edgeFlow);

      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // Add scrap side-links: station → scrap sink node
  for (const [stationId, scrapRate] of stationScrap) {
    const flow = nodeFlow.get(stationId) || 0;
    const scrapFlow = flow * scrapRate;
    if (scrapFlow < 0.1) continue;

    const srcIdx = nodeIdMap.get(stationId);
    if (srcIdx === undefined) continue;

    const stationName = model.stations.find((s) => s.id === stationId)?.name || 'Station';
    // Create a scrap sink node for this station
    const scrapNodeIdx = nodeLabels.length;
    nodeLabels.push(`Scrap (${shortName(stationName)})`);
    nodeColors.push(COLORS.scrap);

    linkSources.push(srcIdx);
    linkTargets.push(scrapNodeIdx);
    linkValues.push(Math.max(scrapFlow, 0.1));
    linkColors.push('rgba(243,18,96,0.5)');
    linkLabels.push(`${Math.round(scrapFlow)} scrapped`);
  }

  // If no links were generated, show a message
  if (linkSources.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        No material flow data available (check model connections)
      </div>
    );
  }

  const data: any[] = [
    {
      type: 'sankey' as const,
      orientation: 'h',
      node: {
        pad: 20,
        thickness: 20,
        line: { color: 'rgba(0,0,0,0.3)', width: 0.5 },
        label: nodeLabels,
        color: nodeColors,
        hovertemplate: '%{label}<br>Flow: %{value:.0f} units<extra></extra>',
      },
      link: {
        source: linkSources,
        target: linkTargets,
        value: linkValues,
        color: linkColors,
        label: linkLabels,
        hovertemplate: '%{source.label} → %{target.label}<br>%{label}<extra></extra>',
      },
    },
  ];

  const layout: any = {
    font: { size: 11, family: 'Inter, system-ui, sans-serif', color: '#334155' },
    margin: { l: 10, r: 10, t: 10, b: 10 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    height: 400,
  };

  return (
    <div className="w-full overflow-x-auto">
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        useResizeHandler
        style={{ width: '100%', height: '400px' }}
      />
      <div className="flex items-center gap-4 px-2 pb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.source }} />
          Source
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.station }} />
          Station
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.buffer }} />
          Buffer
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.sink }} />
          Sink
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.scrap }} />
          Scrap
        </span>
      </div>
    </div>
  );
});
export { SankeyChart };
