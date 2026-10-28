import type { FactoryModel, NodeType } from '../types';
import type {
  ScenarioInput,
  ScenarioEntity,
  ScenarioConnection,
} from '../components/factory-builder/3d/shared/ScenarioRenderer';

/**
 * Convert a FactoryBuilder FactoryModel into a ScenarioInput consumable by
 * the 3D World viewer. This is the bridge that lets the *same* model the
 * user authored as a 2D node graph render as a 3D scene with rigged robots,
 * conveyors, building shells, etc.
 *
 * Mapping rules:
 *   - 2D flow-chart positions (pixels) are scaled to meters and laid on the XZ plane.
 *   - `Station.libraryModelId` (already part of the schema) picks the 3D model.
 *   - When `libraryModelId` is missing, a sensible default is chosen from the
 *     node's name/type (cobot, industrial-robot, station-block, …).
 */

// Pixels-per-meter for the 2D layout. 80 px ≈ 1 m gives a comfortable footprint
// for a 1000×1000 px canvas → ~12 m floor plate.
const PX_PER_M = 80;

// Target footprint (meters) the scene should occupy after auto-scaling. We
// adapt pxPerM to the actual extent of the input layout so a tiny graph
// doesn't end up sub-meter and a sprawling one doesn't go off-screen.
const TARGET_MAX_DIM_M = 14;
const MIN_SPACING_M = 1.4;

const DEFAULT_FOR_TYPE: Partial<Record<NodeType, string>> = {
  station: 'cnc-mill',
  buffer: 'pallet-stack',
  source: 'loading-dock',
  sink: 'loading-dock',
  conveyor: 'belt-conveyor',
  operator: 'worker-at-bench',
  inspection: 'inspection-table',
  assembly: 'workbench',
  splitter: 'belt-conveyor',
  merge: 'belt-conveyor',
  roboticcell: 'industrial-robot',
  humanoid: 'cobot',
  warehouse: 'warehouse-shell',
  loadingdock: 'loading-dock',
  crane: 'gantry-crane',
  forklift: 'forklift',
  coldstorage: 'cold-storage',
  press: 'press',
  lasercutter: 'laser-cutter',
  weldingcell: 'welding-station',
  paintbooth: 'paint-booth',
  packager: 'packaging-machine',
  washer: 'washer',
  cncmachine: 'cnc-mill',
  oven: 'oven-furnace',
  injectionmolder: 'injection-molder',
  rollerconveyor: 'roller-conveyor',
  overheadconveyor: 'chain-conveyor',
  agv: 'amr',
  trackguidedvehicle: 'rail-guided-vehicle',
  turntable: 'turntable',
  elevator: 'elevator',
};

function pickModelFromName(name: string, fallback: string): string {
  const n = name.toLowerCase();
  if (/cobot/.test(n)) return 'cobot';
  if (/kuka|abb|fanuc|industrial|6.?axis/.test(n)) return 'industrial-robot';
  if (/scara/.test(n)) return 'scara-robot';
  if (/palletiz/.test(n)) return 'palletizer-robot';
  if (/cnc.*lath|lathe/.test(n)) return 'cnc-lathe';
  if (/cnc/.test(n)) return 'cnc-mill';
  if (/laser/.test(n)) return 'laser-cutter';
  if (/weld/.test(n)) return 'welding-station';
  if (/paint|spray/.test(n)) return 'paint-booth';
  if (/press/.test(n)) return 'press';
  if (/wash/.test(n)) return 'washer';
  if (/oven|furnace/.test(n)) return 'oven-furnace';
  if (/injection|mold/.test(n)) return 'injection-molder';
  if (/inject|inspection|qc|quality/.test(n)) return 'inspection-table';
  if (/conveyor/.test(n)) return 'belt-conveyor';
  if (/forklift/.test(n)) return 'forklift';
  if (/warehouse/.test(n)) return 'warehouse-shell';
  if (/factory|plant/.test(n)) return 'factory-shell';
  if (/office|hq/.test(n)) return 'office-shell';
  if (/operator|worker|human/.test(n)) return 'worker-at-bench';
  if (/buffer|stack|pallet/.test(n)) return 'pallet-stack';
  return fallback;
}

export interface ConvertOptions {
  /** Scenario type for the 3D World. Default: 'factory'. */
  type?: ScenarioInput['type'];
  /** Pixels per meter. Default 80. */
  pxPerM?: number;
  /** Origin offset (px) so the model centers nicely. Computed automatically if omitted. */
  centerOnLayout?: boolean;
}

export function modelToScenario(model: FactoryModel, opts: ConvertOptions = {}): ScenarioInput {
  const centerOnLayout = opts.centerOnLayout ?? true;

  // Collect every position so we can compute the bbox and centroid.
  const positions: { x: number; y: number }[] = [];
  for (const s of model.stations) positions.push(s.position);
  for (const b of model.buffers) positions.push(b.position);
  for (const e of model.extraNodes) positions.push(e.position);

  let cx = 0, cz = 0;
  let pxPerM = opts.pxPerM ?? PX_PER_M;

  if (positions.length > 0) {
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (centerOnLayout) {
      cx = (minX + maxX) / 2;
      cz = (minY + maxY) / 2;
    }
    // Adaptive scale: pick pxPerM so the bigger of the two axes spans
    // TARGET_MAX_DIM_M meters. Falls back to PX_PER_M if extents are zero.
    if (!opts.pxPerM) {
      const extentPx = Math.max(maxX - minX, maxY - minY);
      if (extentPx > 1) pxPerM = Math.max(20, Math.min(160, extentPx / TARGET_MAX_DIM_M));
    }
  }

  // De-collinearity: if every entity lies on a single horizontal row (typical
  // of left-to-right flow templates), spread them in Z so the 3D scene isn't
  // a paper-thin line. We jitter by index, alternating ±MIN_SPACING_M*0.5.
  const collinearOnY = positions.length > 1 && positions.every(p => p.y === positions[0].y);
  const collinearOnX = positions.length > 1 && positions.every(p => p.x === positions[0].x);

  const toWorld = (p: { x: number; y: number }, idx: number) => {
    let x = (p.x - cx) / pxPerM;
    let z = (p.y - cz) / pxPerM;
    if (collinearOnY) z += ((idx % 2) === 0 ? -1 : 1) * MIN_SPACING_M * 0.5 * Math.floor(idx / 2 + 1);
    if (collinearOnX) x += ((idx % 2) === 0 ? -1 : 1) * MIN_SPACING_M * 0.5 * Math.floor(idx / 2 + 1);
    // Enforce minimum spacing for already-spread layouts that still cluster.
    return { x, y: 0, z };
  };

  const entities: ScenarioEntity[] = [];

  let idx = 0;
  for (const s of model.stations) {
    const modelKey = s.libraryModelId ?? pickModelFromName(s.name, 'cnc-mill');
    entities.push({
      id: s.id,
      modelKey,
      position: toWorld(s.position, idx++),
    });
  }

  for (const b of model.buffers) {
    const modelKey = b.libraryModelId ?? 'pallet-stack';
    entities.push({
      id: b.id,
      modelKey,
      position: toWorld(b.position, idx++),
    });
  }

  for (const e of model.extraNodes) {
    const fallback = DEFAULT_FOR_TYPE[e.type] ?? 'workbench';
    const modelKey = e.libraryModelId ?? pickModelFromName(
      (e.data as { name?: string })?.name ?? '',
      fallback,
    );
    entities.push({
      id: e.id,
      modelKey,
      position: toWorld(e.position, idx++),
    });
  }

  // Carry connections through so StationFlowAnimator animates the real graph.
  const connections: ScenarioConnection[] = (model.connections ?? []).map((c) => ({
    source: c.source,
    target: c.target,
  }));

  return {
    type: opts.type ?? 'factory',
    entities,
    connections,
  };
}
