import type { SimulationEvent, Station } from '../types';

export interface GanttBlock {
  stationId: string;
  stationName: string;
  state: 'processing' | 'setup' | 'idle' | 'blocked' | 'starved' | 'failed' | 'offShift' | 'batchWait';
  startTime: number;
  endTime: number;
  productId?: string;
  productType?: string;
}

export interface GanttProductTrace {
  productId: string;
  productType: string;
  blocks: GanttBlock[];
}

export interface GanttData {
  stationTimelines: Record<string, GanttBlock[]>;
  stationOrder: string[]; // station names sorted by utilization desc
  productTraces: Record<string, GanttProductTrace>;
  duration: number;
}

// Map from event log state names to our canonical Gantt states
function normalizeState(state: string): GanttBlock['state'] {
  switch (state) {
    case 'processing': return 'processing';
    case 'setup': return 'setup';
    case 'idle': return 'idle';
    case 'blocked': return 'blocked';
    case 'starved': return 'starved';
    case 'failed': return 'failed';
    case 'off_shift': return 'offShift';
    case 'batch_wait': return 'batchWait';
    default: return 'idle';
  }
}

/**
 * Build Gantt chart data from the simulation event log.
 * Processes state_change + processing_start/complete events into
 * per-station timeline blocks and per-product traces.
 */
export function buildGanttData(
  events: SimulationEvent[],
  stations: Station[],
  simulationDuration: number
): GanttData {
  if (!events || events.length === 0) {
    return { stationTimelines: {}, stationOrder: [], productTraces: {}, duration: simulationDuration };
  }

  const sorted = [...events].sort((a, b) => a.time - b.time);

  // CRITICAL: result.duration is wall-clock time (e.g. 5s), NOT simulation time.
  // Derive actual simulation duration from events — the last event timestamp is
  // the true end of the simulation timeline.
  const lastEventTime = sorted[sorted.length - 1].time;
  simulationDuration = Math.max(simulationDuration, lastEventTime);

  // --- Station timelines from state_change events ---
  // Track current state per station
  const stationCurrentState: Record<string, { state: GanttBlock['state']; startTime: number; productId?: string; productType?: string }> = {};
  const stationTimelines: Record<string, GanttBlock[]> = {};
  const stationNameMap = new Map<string, string>(); // stationName -> stationId

  for (const s of stations) {
    stationNameMap.set(s.name, s.id);
    stationTimelines[s.name] = [];
    // Initialize every station to IDLE at time 0 — the Python engine starts
    // stations in IDLE but doesn't log that initial state to the event log.
    // Without this, time before the first state_change has no block.
    stationCurrentState[s.name] = { state: 'idle', startTime: 0 };
  }

  // Track which product is at which station (for annotating state blocks)
  const stationProduct: Record<string, { id: string; type: string }> = {};

  for (const event of sorted) {
    const details = event.details || {};

    if (event.type === 'processing_start') {
      const station = details.station as string;
      const productId = details.productId as string || details.product_id as string || '';
      const productType = details.productType as string || details.product_type as string || '';
      if (station) {
        stationProduct[station] = { id: productId, type: productType };
      }
    }

    if (event.type === 'state_change') {
      const station = (details.station as string) || event.entityId;
      const newState = normalizeState(details.state as string || 'idle');

      if (!station) continue;

      // Ensure timeline array exists (for stations not in model, like extra nodes)
      if (!stationTimelines[station]) {
        stationTimelines[station] = [];
      }

      const current = stationCurrentState[station];
      if (current) {
        // Close the previous block
        if (event.time > current.startTime) {
          stationTimelines[station].push({
            stationId: stationNameMap.get(station) || station,
            stationName: station,
            state: current.state,
            startTime: current.startTime,
            endTime: event.time,
            productId: current.productId,
            productType: current.productType,
          });
        }
      }

      // Open new block
      const prod = stationProduct[station];
      stationCurrentState[station] = {
        state: newState,
        startTime: event.time,
        productId: newState === 'processing' ? prod?.id : undefined,
        productType: newState === 'processing' ? prod?.type : undefined,
      };
    }
  }

  // Close any open blocks at simulation end
  for (const [station, current] of Object.entries(stationCurrentState)) {
    if (current && simulationDuration > current.startTime) {
      if (!stationTimelines[station]) stationTimelines[station] = [];
      stationTimelines[station].push({
        stationId: stationNameMap.get(station) || station,
        stationName: station,
        state: current.state,
        startTime: current.startTime,
        endTime: simulationDuration,
        productId: current.productId,
        productType: current.productType,
      });
    }
  }

  // --- Product traces from processing events ---
  const productTraces: Record<string, GanttProductTrace> = {};
  const productProcessing: Record<string, { station: string; startTime: number; productType: string }> = {};

  for (const event of sorted) {
    const details = event.details || {};

    if (event.type === 'processing_start') {
      const station = details.station as string;
      const productId = details.productId as string || details.product_id as string || '';
      const productType = details.productType as string || details.product_type as string || '';

      if (productId && station) {
        productProcessing[productId] = { station, startTime: event.time, productType };
        if (!productTraces[productId]) {
          productTraces[productId] = { productId, productType, blocks: [] };
        }
      }
    }

    if (event.type === 'processing_complete') {
      const station = details.station as string;
      const productId = details.productId as string || details.product_id as string || '';
      const prev = productProcessing[productId];

      if (prev && station) {
        productTraces[productId]?.blocks.push({
          stationId: stationNameMap.get(station) || station,
          stationName: station,
          state: 'processing',
          startTime: prev.startTime,
          endTime: event.time,
          productId,
          productType: prev.productType,
        });
        delete productProcessing[productId];
      }
    }
  }

  // --- Station order by busy time (descending) ---
  const stationBusy: Record<string, number> = {};
  for (const [name, blocks] of Object.entries(stationTimelines)) {
    stationBusy[name] = blocks
      .filter(b => b.state === 'processing' || b.state === 'setup')
      .reduce((sum, b) => sum + (b.endTime - b.startTime), 0);
  }

  // Only include stations from the model
  const modelStationNames = new Set(stations.map(s => s.name));
  const stationOrder = Object.keys(stationTimelines)
    .filter(name => modelStationNames.has(name))
    .sort((a, b) => (stationBusy[b] || 0) - (stationBusy[a] || 0));

  return {
    stationTimelines,
    stationOrder,
    productTraces,
    duration: simulationDuration,
  };
}

/** Get all unique product IDs involved in a station's timeline */
export function getProductsAtStation(ganttData: GanttData, stationName: string): string[] {
  const blocks = ganttData.stationTimelines[stationName] || [];
  const ids = new Set<string>();
  for (const b of blocks) {
    if (b.productId) ids.add(b.productId);
  }
  return Array.from(ids);
}

/** Get all station names a product visited */
export function getStationsForProduct(ganttData: GanttData, productId: string): string[] {
  const trace = ganttData.productTraces[productId];
  if (!trace) return [];
  return trace.blocks.map(b => b.stationName);
}
