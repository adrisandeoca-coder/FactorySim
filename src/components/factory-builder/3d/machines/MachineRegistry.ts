import * as THREE from 'three';
import { buildStation } from './Station';
import { buildInfeedStation, buildOutfeedStation, buildAccumulationBuffer } from './LineEnds';
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
// New component types
import { buildAGV } from './AGV';
import { buildRoboticCell } from './RoboticCell';
import { buildHumanoid } from './Humanoid';
// Model library imports
import { buildWarehouseBay } from '../model-library/warehousing/WarehouseBay';
import { buildLoadingDock } from '../model-library/infrastructure/LoadingDock';
import { buildGantryCrane } from '../model-library/material-handling/GantryCrane';

import { buildForklift as buildForkliftModel } from '../model-library/material-handling/Forklift';
import { buildColdStorage } from '../model-library/warehousing/ColdStorage';
import { buildPress } from '../model-library/processing/Press';
import { buildLaserCutter } from '../model-library/processing/LaserCutter';
import { buildWeldingStation } from '../model-library/processing/WeldingStation';
import { buildPaintBooth } from '../model-library/processing/PaintBooth';
import { buildPackagingMachine } from '../model-library/processing/PackagingMachine';
import { buildWasher } from '../model-library/processing/Washer';
import { buildCNCMill2 } from '../model-library/machines/CNCMill2';
import { buildOvenFurnace } from '../model-library/machines/OvenFurnace';
import { buildInjectionMolder as buildInjectionMolderModel } from '../model-library/machines/InjectionMolder';
import { buildSortingSystem } from '../model-library/material-handling/SortingSystem';
import { buildAccumulationTable } from '../model-library/conveyors/AccumulationTable';
// Station variants (name-based differentiation)
import { buildCNCMill } from './CNCMill';
import { buildGrinder } from './Grinder';
import { buildHeatTreat } from './HeatTreat';
import { buildFilling } from './Filling';
import { buildLabeling } from './Labeling';
import { buildQCStation } from './QCStation';

export const MODEL_BUILDERS: Record<string, () => THREE.Group> = {
  station: buildStation,
  buffer: buildAccumulationBuffer,
  source: buildInfeedStation,
  sink: buildOutfeedStation,
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
  agv: buildAGV,
  roboticcell: buildRoboticCell,
  humanoid: buildHumanoid,
  lifobuffer: buildLIFOBuffer,
  palletconveyor: buildPalletConveyor,
  prioritymerge: buildPriorityMerge,
  // Model library types
  warehouse: buildWarehouseBay,
  loadingdock: buildLoadingDock,
  crane: buildGantryCrane,
  forklift: buildForkliftModel,
  coldstorage: buildColdStorage,
  press: buildPress,
  lasercutter: buildLaserCutter,
  weldingcell: buildWeldingStation,
  paintbooth: buildPaintBooth,
  packager: buildPackagingMachine,
  washer: buildWasher,
  cncmachine: buildCNCMill2,
  oven: buildOvenFurnace,
  injectionmolder: buildInjectionMolderModel,
  sortingstation: buildSortingSystem,
  accumulator: buildAccumulationTable,
  // Station variants (matched by name in getNodeBuilder)
  cncmill: buildCNCMill,
  grinder: buildGrinder,
  heattreat: buildHeatTreat,
  filling: buildFilling,
  labeling: buildLabeling,
  qcstation: buildQCStation,
};
