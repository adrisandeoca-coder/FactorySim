/**
 * Model scripts: Python that builds a FactorySim model (python/factorysim/script).
 * The engine runs the script; this module turns its output into a model the
 * canvas can show, and holds the editor's examples.
 */
import type { FactoryModel, ScriptResult, NodeType, ExtraNodeData } from '../types';
import { autoLayout } from './autoLayout';
import { autoAssignLibraryModels } from './modelAutoAssign';
import { getDefaultExtraNodeData } from '../stores/modelStore';

type Backend = NonNullable<NonNullable<Window['factorySim']>['code']>;

function backend(): Backend | undefined {
  return (window as unknown as { factorySim?: { code?: Backend } }).factorySim?.code;
}

export function scriptBackendAvailable(): boolean {
  return typeof backend()?.scriptBuild === 'function';
}

export async function buildModelScript(code: string): Promise<ScriptResult> {
  const b = backend();
  if (!b?.scriptBuild) {
    return { ok: false, output: '', line: 0, error: 'Model scripts need the engine of the desktop app.' };
  }
  try {
    return await b.scriptBuild(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, output: '', line: 0, error: /fetch|ECONN|bridge/i.test(msg) ? `Engine not reachable (${msg})` : msg };
  }
}

export async function runPythonScript(code: string): Promise<ScriptResult> {
  const b = backend();
  if (!b?.scriptRun) {
    return { ok: false, output: '', line: 0, error: 'Running Python needs the engine of the desktop app.' };
  }
  try {
    return await b.scriptRun(code);
  } catch (e) {
    return { ok: false, output: '', line: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function scriptFromModel(model: FactoryModel): Promise<string | null> {
  const b = backend();
  if (!b?.scriptFromModel) return null;
  return b.scriptFromModel(model);
}

/**
 * Fill element defaults, lay out elements the script did not place and pick
 * 3D models, so the result renders like a model drawn on the canvas.
 */
export function normalizeScriptModel(raw: FactoryModel & { _unplaced?: string[] }): FactoryModel {
  const { _unplaced, ...rest } = raw;
  const model: FactoryModel = {
    ...rest,
    stations: (rest.stations || []).map(s => ({ ...s })),
    buffers: (rest.buffers || []).map(b => ({ ...b })),
    connections: (rest.connections || []).map(c => ({ ...c })),
    products: (rest.products || []).map(p => ({ ...p })),
    resources: rest.resources || [],
    orders: rest.orders || [],
    extraNodes: (rest.extraNodes || []).map(n => ({
      ...n,
      data: { ...getDefaultExtraNodeData(n.type as NodeType, n.id), ...n.data } as ExtraNodeData,
    })),
    layout: { gridSize: 20, ...(rest.layout || { width: 1600, height: 1000 }) },
  };
  const unplaced = new Set(_unplaced || []);
  if (unplaced.size) {
    const pos = autoLayout(model.stations, model.buffers, model.extraNodes, model.connections);
    const place = <T extends { id: string; position: { x: number; y: number } }>(e: T): T =>
      unplaced.has(e.id) && pos.get(e.id) ? { ...e, position: pos.get(e.id)! } : e;
    model.stations = model.stations.map(place);
    model.buffers = model.buffers.map(place);
    model.extraNodes = model.extraNodes.map(place);
  }
  autoAssignLibraryModels(model);
  return model;
}

export const SCRIPT_EXAMPLES: { id: string; name: string; code: string }[] = [
  {
    id: 'line',
    name: 'Simple line',
    code: `# A four-step line. Times are in seconds, MTBF and MTTR in hours.
from factorysim.script import *

m = Model("Bracket line")

raw   = m.source("Raw material", every=45)
cut   = m.station("Laser cut", cycle=normal(40, 4), mtbf=8, mttr=0.3)
b1    = m.buffer("Cut parts", capacity=10)
bend  = m.station("Press brake", cycle=tri(30, 35, 45), setup=120)
b2    = m.buffer("Bent parts", capacity=6)
weld  = m.station("Weld", cycle=tri(35, 40, 55), scrap=0.02)
ship  = m.sink("Shipping")

raw >> cut >> b1 >> bend >> b2 >> weld >> ship
`,
  },
  {
    id: 'cell',
    name: 'Parallel cell with operators',
    code: `# Three welding robots share one infeed. Two welders serve them, and a
# forklift takes finished parts to the warehouse dock.
from factorysim.script import *

m = Model("Welding cell")

src    = m.source("Blanks", every=30)
infeed = m.buffer("Infeed", capacity=12)
robots = [m.station(f"Robot {i}", cycle=tri(80, 90, 120), mtbf=20, mttr=0.5) for i in (1, 2, 3)]
outq   = m.buffer("Outfeed", capacity=20)
check  = m.inspection("Visual check", inspection_time=12, defect_rate=1.5)
dock   = m.sink("Dock")

welders = m.operator("Welders", count=2)

src >> infeed >> robots
robots >> outq
outq.to(check, transport="manual")
check.to(dock, transport="forklift")
welders.serves(*robots)
`,
  },
  {
    id: 'loop',
    name: 'Line generated from a table',
    code: `# Python builds the line from a table: add a row and the preview
# redraws, with no stations to place by hand.
from factorysim.script import *

steps = [
    # name           mean  std   mtbf  mttr
    ("Saw",           30,  2,    10,   0.2),
    ("Deburr",        25,  3,    None, None),
    ("Drill",         42,  4,    6,    0.4),
    ("Tap",           38,  3,    None, None),
    ("Wash",          35,  1,    24,   0.5),
    ("Assemble",      44,  5,    None, None),
]

m = Model("Generated line")
prev = m.source("Bar stock", every=48)
for name, mean, std, mtbf, mttr in steps:
    st = m.station(name, cycle=normal(mean, std))
    if mtbf:
        st.set(mtbf=mtbf, mttr=mttr)
    buf = m.buffer(f"{name} out", capacity=5)
    prev >> st >> buf
    prev = buf
prev >> m.sink("Finished")

print(f"{len(steps)} stations, bottleneck guess:", max(steps, key=lambda s: s[1])[0])
`,
  },
  {
    id: 'mix',
    name: 'Product mix with routings',
    code: `# Two products share machines but take different routes.
from factorysim.script import *

m = Model("Machining mix")

src   = m.source("Orders", every=60)
saw   = m.station("Saw", cycle=20)
mill  = m.station("Mill", cycle=normal(55, 6), setup=300)
lathe = m.station("Lathe", cycle=normal(45, 5))
qc    = m.station("QC", cycle=15, scrap=0.01)
done  = m.sink("Finished")

src >> saw
saw >> [mill, lathe]
[mill, lathe] >> qc
qc >> done

shaft  = m.product("Shaft",  route=[saw, lathe, qc])
flange = m.product("Flange", route=[saw, mill, qc])
mill.set(product_cycle_times={"Flange": normal(60, 6)})
`,
  },
];
