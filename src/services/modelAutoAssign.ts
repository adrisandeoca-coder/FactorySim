import type { FactoryModel, NodeType } from '../types';
import {
  MODEL_LIBRARY,
  type ModelLibraryEntry,
} from '../components/factory-builder/3d/model-library/ModelLibraryRegistry';

/**
 * modelAutoAssign — given a FactoryModel, walk every station / buffer / extra
 * node and assign a sensible `libraryModelId` based on the entity's name and
 * type. This turns generic templates (where all stations show as cnc-mills)
 * into visually diverse 3D scenes that read like real factories.
 *
 * Rules of thumb:
 *   1. If `libraryModelId` is already set, leave it alone (user pick wins).
 *   2. Match the entity's name against keyword patterns (case-insensitive).
 *   3. Fall back to a per-NodeType default.
 *   4. Cycle through equivalent models when a name is ambiguous, so a row of
 *      6 unnamed stations doesn't all become the same model.
 *
 * Returns a new FactoryModel; caller decides whether to commit.
 */

interface NamePattern {
  match: RegExp;
  modelKey: string;
}

// Order matters — first match wins.
const NAME_PATTERNS: NamePattern[] = [
  // Robots
  { match: /\bcobot\b/i, modelKey: 'cobot' },
  { match: /\bscara\b/i, modelKey: 'scara-robot' },
  { match: /\bpalletiz/i, modelKey: 'palletizer-robot' },
  { match: /\bkuka|abb|fanuc|6.?axis\b/i, modelKey: 'industrial-robot' },
  { match: /\b(pick.?(and.?)?place|p&p|robot arm|robotic\s*cell)\b/i, modelKey: 'pick-and-place-robot' },
  { match: /\brobot\b/i, modelKey: 'industrial-robot' },

  // Manufacturing processes
  { match: /\b(cnc.*lathe|lathe|turning)\b/i, modelKey: 'cnc-lathe' },
  { match: /\b(cnc|mill|milling|machining)\b/i, modelKey: 'cnc-mill' },
  { match: /\b(laser|cut|cutting|saw)/i, modelKey: 'laser-cutter' },
  { match: /\bweld/i, modelKey: 'welding-station' },
  { match: /\b(paint|spray|coat)/i, modelKey: 'paint-booth' },
  { match: /\bpress\b/i, modelKey: 'press' },
  { match: /\b(wash|clean|degrease)/i, modelKey: 'washer' },
  { match: /\b(oven|furnace|heat.?treat|temper|anneal)/i, modelKey: 'oven-furnace' },
  { match: /\b(injection|mold)/i, modelKey: 'injection-molder' },
  { match: /\b(grind|polish|deburr)/i, modelKey: 'grinding-machine' },
  { match: /\b(die.?cast)/i, modelKey: 'die-casting-machine' },
  { match: /\b(3d.?print|additive|fdm)/i, modelKey: '3d-printer' },

  // QC / inspection / assembly
  { match: /\b(inspect|qc|quality|test|gauge)/i, modelKey: 'inspection-table' },
  { match: /\b(assembly|assemble|sub-?assembly)/i, modelKey: 'workbench' },
  { match: /\b(workbench|bench)/i, modelKey: 'workbench' },

  // Packaging / labeling
  { match: /\b(packag|wrap|seal|cartoner)/i, modelKey: 'packaging-machine' },
  { match: /\b(label|print)/i, modelKey: 'packaging-machine' },

  // Conveyors
  { match: /\bbelt/i, modelKey: 'belt-conveyor' },
  { match: /\broller/i, modelKey: 'roller-conveyor' },
  { match: /\bchain/i, modelKey: 'chain-conveyor' },
  { match: /\bspiral/i, modelKey: 'spiral-conveyor' },
  { match: /\baccumulat/i, modelKey: 'accumulation-table' },
  { match: /\bconveyor/i, modelKey: 'belt-conveyor' },

  // Material handling
  { match: /\bgantry/i, modelKey: 'gantry-crane' },
  { match: /\b(bridge.?crane|overhead.?crane)/i, modelKey: 'bridge-crane' },
  { match: /\bcrane/i, modelKey: 'gantry-crane' },
  { match: /\bforklift/i, modelKey: 'forklift' },
  { match: /\b(amr|agv|mobile.?robot)/i, modelKey: 'amr' },
  { match: /\b(rail|rgv)/i, modelKey: 'rail-guided-vehicle' },
  { match: /\bturntable/i, modelKey: 'turntable' },
  { match: /\belevator|lift/i, modelKey: 'elevator' },
  { match: /\bsort/i, modelKey: 'sorting-system' },
  { match: /\bmonorail/i, modelKey: 'monorail' },

  // Storage
  { match: /\b(asrs|automated.?storage)/i, modelKey: 'asrs' },
  { match: /\b(cold.?storage|freezer|chiller)/i, modelKey: 'cold-storage' },
  { match: /\b(silo|tank)/i, modelKey: 'silo' },
  { match: /\b(rack|shelf|shelving)/i, modelKey: 'shelf-unit' },
  { match: /\b(warehouse.?bay|bay)/i, modelKey: 'warehouse-bay' },
  { match: /\bwarehouse/i, modelKey: 'warehouse-shell' },

  // Logistics
  { match: /\btruck/i, modelKey: 'truck' },
  { match: /\b(dock|trailer)/i, modelKey: 'trailer-dock' },
  { match: /\b(tow|tractor)/i, modelKey: 'tow-tractor' },
  { match: /\b(pallet.?jack|pump.?truck)/i, modelKey: 'pallet-jack' },
  { match: /\breach.?truck/i, modelKey: 'reach-truck' },
  { match: /\bcart/i, modelKey: 'transfer-cart' },

  // People
  { match: /\b(supervisor|foreman|manager)/i, modelKey: 'supervisor' },
  { match: /\b(worker|operator|technician)/i, modelKey: 'worker-at-bench' },
  { match: /\bdriver/i, modelKey: 'forklift-driver' },

  // Containers
  { match: /\b(pallet)/i, modelKey: 'pallet-stack' },
  { match: /\b(container|shipping)/i, modelKey: 'shipping-container' },
  { match: /\b(drum)/i, modelKey: 'drum' },
  { match: /\b(tote|bin)/i, modelKey: 'tote-bin' },
  { match: /\b(cage|wire.?mesh)/i, modelKey: 'wire-mesh-cage' },

  // Furniture / infrastructure
  { match: /\b(fire|safety|extinguish)/i, modelKey: 'fire-station' },
  { match: /\b(dock|loading)/i, modelKey: 'loading-dock' },
  { match: /\b(staircase|stairs)/i, modelKey: 'staircase' },
  { match: /\b(mezzanine|platform)/i, modelKey: 'mezzanine' },
  { match: /\b(barrier|fence)/i, modelKey: 'safety-barrier' },
  { match: /\b(panel|breaker|electric)/i, modelKey: 'electrical-panel' },
  { match: /\b(compress|pneumatic)/i, modelKey: 'compressor-unit' },
  { match: /\b(pipe|piping)/i, modelKey: 'pipe-rack' },
  { match: /\b(office|hq)/i, modelKey: 'office-shell' },
  { match: /\b(factory|plant|building)/i, modelKey: 'factory-shell' },
  { match: /\b(control.?room)/i, modelKey: 'control-room' },
  { match: /\b(utility|power|air)/i, modelKey: 'utility-post' },

  // Storage / logistics wording on buffers, sources and sinks
  { match: /\b(rack|racking|warehouse)/i, modelKey: 'warehouse-bay' },
  { match: /\b(dock|truck|trailer)/i, modelKey: 'loading-dock' },

  // Tool storage
  { match: /\b(tool.?cabinet|toolbox)/i, modelKey: 'tool-cabinet' },
];

// Per-NodeType fallback when name doesn't match any pattern. Cycled across an
// array so multiple unnamed stations get visual variety.
const TYPE_DEFAULTS: Partial<Record<NodeType, string[]>> = {
  station: ['cnc-mill', 'cnc-lathe', 'press', 'welding-station', 'inspection-table', 'workbench'],
  buffer: ['accumulation-conveyor'],
  source: ['infeed-station'],
  sink: ['outfeed-station'],
  conveyor: ['belt-conveyor', 'roller-conveyor', 'chain-conveyor'],
  operator: ['worker-at-bench', 'supervisor', 'forklift-driver'],
  inspection: ['inspection-table'],
  assembly: ['workbench'],
  splitter: ['belt-conveyor'],
  merge: ['belt-conveyor'],
  roboticcell: ['industrial-robot', 'cobot', 'pick-and-place-robot', 'palletizer-robot'],
  humanoid: ['cobot'],
  warehouse: ['warehouse-bay'],
  loadingdock: ['loading-dock'],
  crane: ['gantry-crane', 'bridge-crane'],
  forklift: ['forklift', 'reach-truck'],
  coldstorage: ['cold-storage'],
  press: ['press'],
  lasercutter: ['laser-cutter'],
  weldingcell: ['welding-station'],
  paintbooth: ['paint-booth'],
  packager: ['packaging-machine'],
  washer: ['washer'],
  cncmachine: ['cnc-mill', 'cnc-lathe'],
  oven: ['oven-furnace'],
  injectionmolder: ['injection-molder'],
  rollerconveyor: ['roller-conveyor'],
  overheadconveyor: ['chain-conveyor', 'monorail'],
  agv: ['amr'],
  trackguidedvehicle: ['rail-guided-vehicle'],
  turntable: ['turntable'],
  elevator: ['elevator'],
  sorter: ['sorting-system'],
  shuttle: ['rail-guided-vehicle'],
  pickstation: ['pick-and-place-robot'],
  weighing: ['inspection-table'],
  labeler: ['packaging-machine'],
  palletize: ['palletizer-robot'],
  depalletize: ['palletizer-robot'],
  matchbuffer: ['shelf-unit'],
  sortingstation: ['sorting-system'],
  accumulator: ['accumulation-table'],
  disassembly: ['workbench'],
  crossover: ['belt-conveyor'],
};

const VALID_KEYS = new Set(MODEL_LIBRARY.map((m: ModelLibraryEntry) => m.id));

function pickByName(name: string): string | null {
  if (!name) return null;
  for (const p of NAME_PATTERNS) {
    if (p.match.test(name) && p.modelKey && VALID_KEYS.has(p.modelKey)) return p.modelKey;
  }
  return null;
}

function pickByType(type: NodeType, counter: number): string | null {
  const list = TYPE_DEFAULTS[type];
  if (!list || list.length === 0) return null;
  // Cycle through the list so multiple same-typed nodes get variety.
  for (let attempt = 0; attempt < list.length; attempt++) {
    const candidate = list[(counter + attempt) % list.length];
    if (VALID_KEYS.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Walk a model and assign `libraryModelId` to every entity that doesn't have
 * one yet. Returns the same model with mutated child arrays (or a new model
 * if `clone` is true).
 */
export function autoAssignLibraryModels(
  model: FactoryModel,
  opts: { clone?: boolean; force?: boolean } = {},
): FactoryModel {
  const target = opts.clone
    ? { ...model,
        stations: model.stations.map(s => ({ ...s })),
        buffers: model.buffers.map(b => ({ ...b })),
        extraNodes: model.extraNodes.map(e => ({ ...e })),
      }
    : model;

  const typeCounters = new Map<NodeType, number>();
  const nextCounter = (t: NodeType) => {
    const c = typeCounters.get(t) ?? 0;
    typeCounters.set(t, c + 1);
    return c;
  };

  for (const s of target.stations) {
    if (!opts.force && s.libraryModelId) continue;
    const byName = pickByName(s.name);
    s.libraryModelId = byName ?? pickByType('station', nextCounter('station')) ?? 'cnc-mill';
  }

  for (const b of target.buffers) {
    if (!opts.force && b.libraryModelId) continue;
    const byName = pickByName(b.name);
    b.libraryModelId = byName ?? pickByType('buffer', nextCounter('buffer')) ?? 'accumulation-conveyor';
  }

  for (const e of target.extraNodes) {
    if (!opts.force && e.libraryModelId) continue;
    const dataName = (e.data as { name?: string })?.name ?? '';
    const byName = pickByName(dataName);
    e.libraryModelId = byName ?? pickByType(e.type, nextCounter(e.type)) ?? undefined;
  }

  return target;
}

/** Stats for UI feedback after running auto-assign. */
export function describeAssignment(model: FactoryModel): {
  totalAssigned: number;
  total: number;
  modelDistribution: Record<string, number>;
} {
  const all = [
    ...model.stations,
    ...model.buffers,
    ...model.extraNodes,
  ];
  const dist: Record<string, number> = {};
  let assigned = 0;
  for (const e of all) {
    const id = (e as { libraryModelId?: string }).libraryModelId;
    if (id) {
      assigned++;
      dist[id] = (dist[id] ?? 0) + 1;
    }
  }
  return { totalAssigned: assigned, total: all.length, modelDistribution: dist };
}
