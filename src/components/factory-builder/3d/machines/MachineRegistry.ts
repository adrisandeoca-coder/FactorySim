import * as THREE from 'three';
import { buildStation } from './Station';
import { buildSource } from './Source';
import { buildSink } from './Sink';
import { buildBuffer } from './Buffer';
import { buildConveyor } from './Conveyor';
import { buildAssembly } from './Assembly';
import { buildInspection } from './Inspection';
import { buildOperator } from './Operator';
import { buildSplitter } from './Splitter';
import { buildMerge } from './Merge';
import { buildDisassembly } from './Disassembly';
import { buildPalletize } from './Palletize';
import { buildDepalletize } from './Depalletize';
import { buildMatchBuffer } from './MatchBuffer';
import { buildLIFOBuffer } from './LIFOBuffer';
import { buildPalletConveyor } from './PalletConveyor';
import { buildPriorityMerge } from './PriorityMerge';
// Station variants (name-based differentiation)
import { buildCNCMill } from './CNCMill';
import { buildGrinder } from './Grinder';
import { buildHeatTreat } from './HeatTreat';
import { buildFilling } from './Filling';
import { buildLabeling } from './Labeling';
import { buildQCStation } from './QCStation';

export const MODEL_BUILDERS: Record<string, () => THREE.Group> = {
  station: buildStation,
  buffer: buildBuffer,
  source: buildSource,
  sink: buildSink,
  conveyor: buildConveyor,
  assembly: buildAssembly,
  inspection: buildInspection,
  operator: buildOperator,
  splitter: buildSplitter,
  merge: buildMerge,
  disassembly: buildDisassembly,
  palletize: buildPalletize,
  depalletize: buildDepalletize,
  matchbuffer: buildMatchBuffer,
  lifobuffer: buildLIFOBuffer,
  palletconveyor: buildPalletConveyor,
  prioritymerge: buildPriorityMerge,
  // Station variants (matched by name in getNodeBuilder)
  cncmill: buildCNCMill,
  grinder: buildGrinder,
  heattreat: buildHeatTreat,
  filling: buildFilling,
  labeling: buildLabeling,
  qcstation: buildQCStation,
};
