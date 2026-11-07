import * as THREE from 'three';

// ── Material Handling ──
import { buildGantryCrane } from './material-handling/GantryCrane';
import { buildBridgeCrane } from './material-handling/BridgeCrane';
import { buildForklift } from './material-handling/Forklift';
import { buildTurntable } from './material-handling/Turntable';
import { buildElevator } from './material-handling/Elevator';
import { buildRailGuidedVehicle } from './material-handling/RailGuidedVehicle';

// ── Warehousing & Storage ──
import { buildWarehouseBay } from './warehousing/WarehouseBay';
import { buildASRS } from './warehousing/ASRS';
import { buildShelfUnit } from './warehousing/ShelfUnit';
import { buildColdStorage } from './warehousing/ColdStorage';
import { buildSilo } from './warehousing/Silo';

// ── Vehicles & Transport ──
import { buildTruck } from './vehicles/Truck';
import { buildTrailerDock } from './vehicles/TrailerDock';
import { buildTowTractor } from './vehicles/TowTractor';

// ── Processing Equipment ──
import { buildLaserCutter } from './processing/LaserCutter';
import { buildWeldingStation } from './processing/WeldingStation';
import { buildInfeedStation, buildOutfeedStation, buildAccumulationBuffer } from '../machines/LineEnds';
import { buildPaintBooth } from './processing/PaintBooth';
import { buildPress } from './processing/Press';
import { buildWasher } from './processing/Washer';
import { buildPrinter3D } from './processing/Printer3D';
import { buildPackagingMachine } from './processing/PackagingMachine';

// ── Infrastructure ──
import { buildSafetyBarrier } from './infrastructure/SafetyBarrier';
import { buildLoadingDock } from './infrastructure/LoadingDock';
import { buildControlRoom } from './infrastructure/ControlRoom';
import { buildElectricalPanel } from './infrastructure/ElectricalPanel';
import { buildCompressorUnit } from './infrastructure/CompressorUnit';

// ── Containers & Unit Loads ──
import { buildPalletStack } from './containers/PalletStack';
import { buildShippingContainer } from './containers/ShippingContainer';
import { buildDrum } from './containers/Drum';
import { buildToteBin } from './containers/ToteBin';
import { buildWireMeshCage } from './containers/WireMeshCage';

// ── Conveyors ──
import { buildRollerConveyor } from './conveyors/RollerConveyor';
import { buildBeltConveyor } from './conveyors/BeltConveyor';
import { buildChainConveyor } from './conveyors/ChainConveyor';
import { buildSpiralConveyor } from './conveyors/SpiralConveyor';
import { buildAccumulationTable } from './conveyors/AccumulationTable';

// ── Robots ──
import { buildPickAndPlaceRobot } from './robots/PickAndPlaceRobot';
import { buildPalletizerRobot } from './robots/PalletizerRobot';
import { buildScaraRobot } from './robots/ScaraRobot';
import { buildCobot } from './robots/Cobot';
import { buildIndustrialRobot } from './robots/IndustrialRobot';

// ── Machines ──
import { buildCNCLathe } from './machines/CNCLathe';
import { buildCNCMill2 } from './machines/CNCMill2';
import { buildInjectionMolder } from './machines/InjectionMolder';
import { buildOvenFurnace } from './machines/OvenFurnace';
import { buildGrindingMachine } from './machines/GrindingMachine';
import { buildDieCastingMachine } from './machines/DieCastingMachine';

// ── People ──
import { buildWorkerAtBench } from './people/WorkerAtBench';
import { buildSupervisor } from './people/Supervisor';
import { buildForkliftDriver } from './people/ForkliftDriver';

// ── Furniture ──
import { buildWorkbench } from './furniture/Workbench';
import { buildToolCabinet } from './furniture/ToolCabinet';
import { buildInspectionTable } from './furniture/InspectionTable';

// ── Additional Infrastructure ──
import { buildMezzanine } from './infrastructure/Mezzanine';
import { buildPipeRack } from './infrastructure/PipeRack';
import { buildFloorMarking } from './infrastructure/FloorMarking';
import { buildStaircase } from './infrastructure/Staircase';
import { buildFireStation } from './infrastructure/FireStation';
import { buildUtilityPost } from './infrastructure/UtilityPost';
import {
  buildWarehouseShell,
  buildFactoryShell,
  buildOfficeBlockShell,
} from './infrastructure/BuildingShell';

// ── Additional Vehicles ──
import { buildPalletJack } from './vehicles/PalletJack';
import { buildReachTruck } from './vehicles/ReachTruck';
import { buildAMR } from './vehicles/AMR';
import { buildTransferCart } from './vehicles/TransferCart';

// ── Additional Material Handling ──
import { buildScissorLift } from './material-handling/ScissorLift';
import { buildMonorail } from './material-handling/Monorail';
import { buildSortingSystem } from './material-handling/SortingSystem';

// ════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════

export type ModelCategory =
  | 'material-handling'
  | 'warehousing'
  | 'vehicles'
  | 'processing'
  | 'infrastructure'
  | 'containers'
  | 'conveyors'
  | 'robots'
  | 'machines'
  | 'people'
  | 'furniture';

export interface ModelLibraryEntry {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  tags: string[];
  builder: () => THREE.Group;
}

export interface ModelCategoryInfo {
  id: ModelCategory;
  name: string;
  icon: string;       // emoji for UI display
  description: string;
}

// ════════════════════════════════════════════════════════════════════════
// Category Definitions
// ════════════════════════════════════════════════════════════════════════

export const MODEL_CATEGORIES: ModelCategoryInfo[] = [
  {
    id: 'material-handling',
    name: 'Material Handling',
    icon: '🏗️',
    description: 'Cranes, forklifts, elevators, and transport systems',
  },
  {
    id: 'warehousing',
    name: 'Warehousing & Storage',
    icon: '🏭',
    description: 'Racking, shelving, silos, and cold storage',
  },
  {
    id: 'vehicles',
    name: 'Vehicles & Transport',
    icon: '🚛',
    description: 'Trucks, trailers, and tow tractors',
  },
  {
    id: 'processing',
    name: 'Processing Equipment',
    icon: '⚙️',
    description: 'Laser cutters, presses, welding, painting, and packaging',
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    icon: '🔧',
    description: 'Safety barriers, docks, control rooms, and utilities',
  },
  {
    id: 'containers',
    name: 'Containers & Unit Loads',
    icon: '📦',
    description: 'Pallets, bins, drums, and shipping containers',
  },
  {
    id: 'conveyors',
    name: 'Conveyors',
    icon: '➡️',
    description: 'Roller, belt, chain, spiral conveyors and accumulation tables',
  },
  {
    id: 'robots',
    name: 'Robots',
    icon: '🤖',
    description: 'Industrial robots, cobots, SCARA, and palletizers',
  },
  {
    id: 'machines',
    name: 'CNC & Machines',
    icon: '🔩',
    description: 'CNC lathes, mills, injection molders, ovens, and grinders',
  },
  {
    id: 'people',
    name: 'People',
    icon: '👷',
    description: 'Workers, supervisors, and operators',
  },
  {
    id: 'furniture',
    name: 'Furniture & Fixtures',
    icon: '🪑',
    description: 'Workbenches, tool cabinets, and inspection tables',
  },
];

// ════════════════════════════════════════════════════════════════════════
// Full Model Library
// ════════════════════════════════════════════════════════════════════════

export const MODEL_LIBRARY: ModelLibraryEntry[] = [
  // ── Material Handling ──────────────────────────────────────────────
  {
    id: 'gantry-crane',
    name: 'Gantry Crane',
    category: 'material-handling',
    description: 'Overhead gantry crane with trolley, hoist, and floor rails',
    tags: ['crane', 'overhead', 'gantry', 'hoist', 'lifting', 'heavy'],
    builder: buildGantryCrane,
  },
  {
    id: 'bridge-crane',
    name: 'Bridge Crane',
    category: 'material-handling',
    description: 'Indoor overhead bridge crane on runway beams',
    tags: ['crane', 'overhead', 'bridge', 'hoist', 'lifting', 'indoor'],
    builder: buildBridgeCrane,
  },
  {
    id: 'forklift',
    name: 'Forklift',
    category: 'material-handling',
    description: 'Counterbalance forklift truck with mast and forks',
    tags: ['forklift', 'truck', 'lift', 'pallet', 'transport', 'warehouse'],
    builder: buildForklift,
  },
  {
    id: 'turntable',
    name: 'Turntable',
    category: 'material-handling',
    description: 'Conveyor transfer turntable with roller section',
    tags: ['turntable', 'transfer', 'rotate', 'conveyor', 'divert'],
    builder: buildTurntable,
  },
  {
    id: 'elevator',
    name: 'Elevator / Lift',
    category: 'material-handling',
    description: 'Vertical reciprocating conveyor with safety gates',
    tags: ['elevator', 'lift', 'vertical', 'conveyor', 'VRC'],
    builder: buildElevator,
  },
  {
    id: 'rail-guided-vehicle',
    name: 'Rail-Guided Vehicle',
    category: 'material-handling',
    description: 'Rail-guided vehicle (RGV) shuttle on floor tracks',
    tags: ['RGV', 'rail', 'shuttle', 'guided', 'transport', 'ASRS'],
    builder: buildRailGuidedVehicle,
  },

  // ── Warehousing & Storage ──────────────────────────────────────────
  {
    id: 'warehouse-bay',
    name: 'Warehouse Bay',
    category: 'warehousing',
    description: 'Multi-level selective pallet racking with pallets',
    tags: ['rack', 'racking', 'pallet', 'warehouse', 'storage', 'bay', 'shelf'],
    builder: buildWarehouseBay,
  },
  {
    id: 'asrs',
    name: 'AS/RS System',
    category: 'warehousing',
    description: 'Automated Storage & Retrieval System with stacker crane',
    tags: ['ASRS', 'automated', 'storage', 'retrieval', 'crane', 'warehouse'],
    builder: buildASRS,
  },
  {
    id: 'shelf-unit',
    name: 'Shelf Unit',
    category: 'warehousing',
    description: 'Industrial steel shelving with bins and totes',
    tags: ['shelf', 'shelving', 'storage', 'bins', 'parts', 'small'],
    builder: buildShelfUnit,
  },
  {
    id: 'cold-storage',
    name: 'Cold Storage',
    category: 'warehousing',
    description: 'Walk-in cold storage / freezer unit with refrigeration',
    tags: ['cold', 'freezer', 'refrigeration', 'storage', 'temperature'],
    builder: buildColdStorage,
  },
  {
    id: 'silo',
    name: 'Silo',
    category: 'warehousing',
    description: 'Bulk material silo with hopper and discharge',
    tags: ['silo', 'hopper', 'bulk', 'tank', 'storage', 'powder', 'grain'],
    builder: buildSilo,
  },

  // ── Vehicles & Transport ───────────────────────────────────────────
  {
    id: 'truck',
    name: 'Truck',
    category: 'vehicles',
    description: 'Box truck for shipping and delivery',
    tags: ['truck', 'delivery', 'shipping', 'vehicle', 'transport', 'logistics'],
    builder: buildTruck,
  },
  {
    id: 'trailer-dock',
    name: 'Trailer at Dock',
    category: 'vehicles',
    description: 'Semi-trailer backed into loading dock bay',
    tags: ['trailer', 'dock', 'loading', 'semi', 'shipping', 'receiving'],
    builder: buildTrailerDock,
  },
  {
    id: 'tow-tractor',
    name: 'Tow Tractor',
    category: 'vehicles',
    description: 'Industrial tow tractor / tugger vehicle',
    tags: ['tow', 'tractor', 'tugger', 'transport', 'cart', 'pull'],
    builder: buildTowTractor,
  },

  // ── Line ends & buffers (default for Source / Sink / Buffer) ───────
  {
    id: 'infeed-station',
    name: 'Infeed Pallet Station',
    category: 'material-handling',
    description: 'Raw-material pallet in a marked bay with a roller infeed',
    tags: ['source', 'infeed', 'arrival', 'raw material', 'pallet'],
    builder: buildInfeedStation,
  },
  {
    id: 'outfeed-station',
    name: 'Outbound Pallet Station',
    category: 'material-handling',
    description: 'Outbound pallet that fills with cartons, stretch-wrap mast',
    tags: ['sink', 'outfeed', 'shipping', 'finished goods', 'pallet'],
    builder: buildOutfeedStation,
  },
  {
    id: 'accumulation-conveyor',
    name: 'Accumulation Conveyor',
    category: 'conveyors',
    description: 'Roller accumulation buffer; totes show the fill level',
    tags: ['buffer', 'queue', 'accumulation', 'wip', 'conveyor'],
    builder: buildAccumulationBuffer,
  },
  // ── Processing Equipment ───────────────────────────────────────────
  {
    id: 'laser-cutter',
    name: 'Laser Cutter',
    category: 'processing',
    description: 'Flatbed laser cutting machine with enclosed bed',
    tags: ['laser', 'cutting', 'sheet', 'metal', 'CNC', 'fabrication'],
    builder: buildLaserCutter,
  },
  {
    id: 'welding-station',
    name: 'Welding Station',
    category: 'processing',
    description: 'Robotic welding cell with positioner and fume extraction',
    tags: ['welding', 'weld', 'robot', 'MIG', 'TIG', 'fabrication', 'join'],
    builder: buildWeldingStation,
  },
  {
    id: 'paint-booth',
    name: 'Paint Booth',
    category: 'processing',
    description: 'Industrial spray paint booth with exhaust system',
    tags: ['paint', 'spray', 'booth', 'coating', 'finish', 'surface'],
    builder: buildPaintBooth,
  },
  {
    id: 'press',
    name: 'Hydraulic Press',
    category: 'processing',
    description: 'Hydraulic stamping/forming press with safety curtains',
    tags: ['press', 'stamping', 'forming', 'hydraulic', 'punch', 'die'],
    builder: buildPress,
  },
  {
    id: 'washer',
    name: 'Parts Washer',
    category: 'processing',
    description: 'Industrial parts washing/cleaning station',
    tags: ['washer', 'wash', 'clean', 'degrease', 'parts', 'surface'],
    builder: buildWasher,
  },
  {
    id: 'printer-3d',
    name: '3D Printer',
    category: 'processing',
    description: 'Industrial additive manufacturing / 3D printing machine',
    tags: ['3D', 'printer', 'additive', 'manufacturing', 'AM', 'print'],
    builder: buildPrinter3D,
  },
  {
    id: 'packaging-machine',
    name: 'Packaging Machine',
    category: 'processing',
    description: 'Stretch wrap / shrink wrap packaging machine',
    tags: ['packaging', 'wrap', 'stretch', 'shrink', 'pallet', 'ship'],
    builder: buildPackagingMachine,
  },

  // ── Infrastructure ─────────────────────────────────────────────────
  {
    id: 'safety-barrier',
    name: 'Safety Barrier',
    category: 'infrastructure',
    description: 'Industrial safety guard rail / barrier section',
    tags: ['safety', 'barrier', 'guard', 'rail', 'fence', 'protection'],
    builder: buildSafetyBarrier,
  },
  {
    id: 'loading-dock',
    name: 'Loading Dock',
    category: 'infrastructure',
    description: 'Loading dock bay with leveler, shelter, and door',
    tags: ['dock', 'loading', 'receiving', 'shipping', 'bay', 'door'],
    builder: buildLoadingDock,
  },
  {
    id: 'control-room',
    name: 'Control Room',
    category: 'infrastructure',
    description: 'Elevated glass-walled control room / supervisor office',
    tags: ['control', 'room', 'office', 'supervisor', 'SCADA', 'monitor'],
    builder: buildControlRoom,
  },
  {
    id: 'electrical-panel',
    name: 'Electrical Panel',
    category: 'infrastructure',
    description: 'Industrial electrical panel / motor control center',
    tags: ['electrical', 'panel', 'MCC', 'power', 'cabinet', 'switchgear'],
    builder: buildElectricalPanel,
  },
  {
    id: 'compressor-unit',
    name: 'Compressor Unit',
    category: 'infrastructure',
    description: 'Industrial air compressor with receiver tank and dryer',
    tags: ['compressor', 'air', 'pneumatic', 'pressure', 'utility'],
    builder: buildCompressorUnit,
  },

  // ── Containers & Unit Loads ────────────────────────────────────────
  {
    id: 'pallet-stack',
    name: 'Pallet Stack',
    category: 'containers',
    description: 'Stack of wooden pallets with boxes and stretch wrap',
    tags: ['pallet', 'stack', 'boxes', 'wood', 'load', 'unit'],
    builder: buildPalletStack,
  },
  {
    id: 'shipping-container',
    name: 'Shipping Container',
    category: 'containers',
    description: 'ISO 20ft intermodal shipping container',
    tags: ['container', 'shipping', 'ISO', 'intermodal', 'freight', 'sea'],
    builder: buildShippingContainer,
  },
  {
    id: 'drum',
    name: 'Drum / Barrel',
    category: 'containers',
    description: '55-gallon steel drum with bung holes and hoops',
    tags: ['drum', 'barrel', 'steel', 'liquid', 'chemical', 'storage'],
    builder: buildDrum,
  },
  {
    id: 'tote-bin',
    name: 'Tote Bin',
    category: 'containers',
    description: 'Stackable plastic tote bin for parts storage',
    tags: ['tote', 'bin', 'plastic', 'parts', 'stackable', 'KLT'],
    builder: buildToteBin,
  },
  {
    id: 'wire-mesh-cage',
    name: 'Wire Mesh Cage',
    category: 'containers',
    description: 'Collapsible wire mesh pallet container (Gitterbox)',
    tags: ['cage', 'wire', 'mesh', 'gitterbox', 'pallet', 'container'],
    builder: buildWireMeshCage,
  },

  // ── Conveyors ────────────────────────────────────────────────────────
  {
    id: 'roller-conveyor',
    name: 'Roller Conveyor',
    category: 'conveyors',
    description: 'Powered roller conveyor section with motor drive',
    tags: ['conveyor', 'roller', 'transport', 'powered', 'gravity'],
    builder: buildRollerConveyor,
  },
  {
    id: 'belt-conveyor',
    name: 'Belt Conveyor',
    category: 'conveyors',
    description: 'Flat belt conveyor with head and tail pulleys',
    tags: ['conveyor', 'belt', 'flat', 'transport', 'continuous'],
    builder: buildBeltConveyor,
  },
  {
    id: 'chain-conveyor',
    name: 'Chain Conveyor',
    category: 'conveyors',
    description: 'Slat chain conveyor for heavy loads',
    tags: ['conveyor', 'chain', 'slat', 'heavy', 'pallet'],
    builder: buildChainConveyor,
  },
  {
    id: 'spiral-conveyor',
    name: 'Spiral Conveyor',
    category: 'conveyors',
    description: 'Vertical spiral conveyor for elevation changes',
    tags: ['conveyor', 'spiral', 'helix', 'vertical', 'elevation'],
    builder: buildSpiralConveyor,
  },
  {
    id: 'accumulation-table',
    name: 'Accumulation Table',
    category: 'conveyors',
    description: 'Rotary accumulation table for product collection',
    tags: ['accumulation', 'table', 'rotary', 'collection', 'buffer'],
    builder: buildAccumulationTable,
  },

  // ── Robots ───────────────────────────────────────────────────────────
  {
    id: 'pick-and-place-robot',
    name: 'Pick & Place Robot',
    category: 'robots',
    description: '6-axis industrial robot with gripper and safety fence',
    tags: ['robot', '6-axis', 'pick', 'place', 'industrial', 'gripper'],
    builder: buildPickAndPlaceRobot,
  },
  {
    id: 'palletizer-robot',
    name: 'Palletizer Robot',
    category: 'robots',
    description: 'Large palletizing robot with vacuum gripper',
    tags: ['robot', 'palletizer', 'vacuum', 'pallet', 'stacking'],
    builder: buildPalletizerRobot,
  },
  {
    id: 'scara-robot',
    name: 'SCARA Robot',
    category: 'robots',
    description: 'Compact SCARA robot for assembly and pick-place',
    tags: ['robot', 'SCARA', 'assembly', 'compact', 'electronics'],
    builder: buildScaraRobot,
  },
  {
    id: 'cobot',
    name: 'Collaborative Robot',
    category: 'robots',
    description: 'Collaborative robot (cobot) with rounded safe design — 6-DOF rigged with FK+IK',
    tags: ['robot', 'cobot', 'collaborative', 'safe', 'flexible', 'rigged', '6-dof'],
    builder: buildCobot,
  },
  {
    id: 'industrial-robot',
    name: 'Industrial Robot (6-Axis)',
    category: 'robots',
    description: 'KUKA/ABB-style 6-axis industrial robot — 6-DOF rigged with FK+IK and TCP target driver',
    tags: ['robot', 'industrial', '6-axis', 'KUKA', 'ABB', 'rigged', 'IK', 'pick-and-place'],
    builder: buildIndustrialRobot,
  },

  // ── CNC & Machines ───────────────────────────────────────────────────
  {
    id: 'cnc-lathe',
    name: 'CNC Lathe',
    category: 'machines',
    description: 'CNC turning center with slant bed and turret',
    tags: ['CNC', 'lathe', 'turning', 'machining', 'metal'],
    builder: buildCNCLathe,
  },
  {
    id: 'cnc-mill',
    name: 'CNC Mill (VMC)',
    category: 'machines',
    description: 'Vertical machining center with tool magazine',
    tags: ['CNC', 'mill', 'VMC', 'machining', 'milling'],
    builder: buildCNCMill2,
  },
  {
    id: 'injection-molder',
    name: 'Injection Molder',
    category: 'machines',
    description: 'Plastic injection molding machine with toggle clamp',
    tags: ['injection', 'molding', 'plastic', 'mold', 'toggle'],
    builder: buildInjectionMolder,
  },
  {
    id: 'oven-furnace',
    name: 'Oven / Furnace',
    category: 'machines',
    description: 'Industrial oven for heat treatment and curing',
    tags: ['oven', 'furnace', 'heat', 'treatment', 'curing', 'bake'],
    builder: buildOvenFurnace,
  },
  {
    id: 'grinding-machine',
    name: 'Grinding Machine',
    category: 'machines',
    description: 'Surface grinding machine with magnetic chuck',
    tags: ['grinding', 'grinder', 'surface', 'finish', 'precision'],
    builder: buildGrindingMachine,
  },
  {
    id: 'die-casting-machine',
    name: 'Die Casting Machine',
    category: 'machines',
    description: 'High-pressure die casting machine',
    tags: ['die', 'casting', 'metal', 'aluminum', 'zinc', 'pressure'],
    builder: buildDieCastingMachine,
  },

  // ── People ───────────────────────────────────────────────────────────
  {
    id: 'worker-at-bench',
    name: 'Worker at Bench',
    category: 'people',
    description: 'Factory worker standing at workbench with tools',
    tags: ['worker', 'person', 'bench', 'operator', 'manual'],
    builder: buildWorkerAtBench,
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    category: 'people',
    description: 'Supervisor with clipboard and radio',
    tags: ['supervisor', 'person', 'manager', 'inspector', 'clipboard'],
    builder: buildSupervisor,
  },
  {
    id: 'forklift-driver',
    name: 'Forklift Driver',
    category: 'people',
    description: 'Seated forklift operator in driving position',
    tags: ['driver', 'person', 'forklift', 'operator', 'seated'],
    builder: buildForkliftDriver,
  },

  // ── Furniture & Fixtures ─────────────────────────────────────────────
  {
    id: 'workbench',
    name: 'Workbench',
    category: 'furniture',
    description: 'Heavy-duty workbench with pegboard and tools',
    tags: ['workbench', 'bench', 'table', 'tools', 'assembly'],
    builder: buildWorkbench,
  },
  {
    id: 'tool-cabinet',
    name: 'Tool Cabinet',
    category: 'furniture',
    description: 'Rolling tool cabinet with drawers',
    tags: ['cabinet', 'tool', 'storage', 'drawers', 'rolling'],
    builder: buildToolCabinet,
  },
  {
    id: 'inspection-table',
    name: 'Inspection Table',
    category: 'furniture',
    description: 'Granite inspection surface plate with gauges',
    tags: ['inspection', 'table', 'granite', 'measurement', 'QC'],
    builder: buildInspectionTable,
  },

  // ── Additional Infrastructure ────────────────────────────────────────
  {
    id: 'mezzanine',
    name: 'Mezzanine',
    category: 'infrastructure',
    description: 'Elevated steel mezzanine platform with staircase',
    tags: ['mezzanine', 'platform', 'elevated', 'stairs', 'level'],
    builder: buildMezzanine,
  },
  {
    id: 'pipe-rack',
    name: 'Pipe Rack',
    category: 'infrastructure',
    description: 'Overhead utility pipe rack with multiple services',
    tags: ['pipe', 'rack', 'utility', 'overhead', 'plumbing'],
    builder: buildPipeRack,
  },
  {
    id: 'floor-marking',
    name: 'Floor Marking',
    category: 'infrastructure',
    description: 'Factory floor markings with lanes and safety zones',
    tags: ['floor', 'marking', 'lane', 'safety', 'walkway', '5S'],
    builder: buildFloorMarking,
  },
  {
    id: 'staircase',
    name: 'Staircase',
    category: 'infrastructure',
    description: 'Industrial steel staircase with handrails',
    tags: ['stairs', 'staircase', 'access', 'steel', 'industrial'],
    builder: buildStaircase,
  },
  {
    id: 'fire-station',
    name: 'Fire Safety Station',
    category: 'infrastructure',
    description: 'Fire extinguisher, alarm, hose reel, and AED station',
    tags: ['fire', 'safety', 'extinguisher', 'alarm', 'AED', 'emergency'],
    builder: buildFireStation,
  },
  {
    id: 'utility-post',
    name: 'Utility Post',
    category: 'infrastructure',
    description: 'Utility drop with air, power, data, and e-stop',
    tags: ['utility', 'post', 'air', 'power', 'data', 'estop'],
    builder: buildUtilityPost,
  },
  {
    id: 'warehouse-shell',
    name: 'Warehouse Building (Shell)',
    category: 'infrastructure',
    description: 'Warehouse exterior with truck dock doors — used at supply-chain scale',
    tags: ['warehouse', 'building', 'shell', 'exterior', 'supply-chain', 'distribution', 'DC'],
    builder: buildWarehouseShell,
  },
  {
    id: 'factory-shell',
    name: 'Factory Building (Shell)',
    category: 'infrastructure',
    description: 'Factory exterior with saw-tooth roof and chimney — used at supply-chain scale',
    tags: ['factory', 'building', 'shell', 'exterior', 'plant', 'supply-chain'],
    builder: buildFactoryShell,
  },
  {
    id: 'office-shell',
    name: 'Office Block (Shell)',
    category: 'infrastructure',
    description: 'Multi-story office block with curtain-wall glazing',
    tags: ['office', 'building', 'shell', 'exterior', 'HQ', 'supply-chain'],
    builder: buildOfficeBlockShell,
  },

  // ── Additional Vehicles ──────────────────────────────────────────────
  {
    id: 'pallet-jack',
    name: 'Pallet Jack',
    category: 'vehicles',
    description: 'Manual pallet jack / pump truck',
    tags: ['pallet', 'jack', 'pump', 'truck', 'manual', 'hand'],
    builder: buildPalletJack,
  },
  {
    id: 'reach-truck',
    name: 'Reach Truck',
    category: 'vehicles',
    description: 'Narrow-aisle reach truck for warehouse racking',
    tags: ['reach', 'truck', 'narrow', 'aisle', 'warehouse', 'forklift'],
    builder: buildReachTruck,
  },
  {
    id: 'amr',
    name: 'AMR',
    category: 'vehicles',
    description: 'Autonomous Mobile Robot for flexible transport',
    tags: ['AMR', 'autonomous', 'mobile', 'robot', 'transport', 'AGV'],
    builder: buildAMR,
  },
  {
    id: 'transfer-cart',
    name: 'Transfer Cart',
    category: 'vehicles',
    description: 'Rail-mounted transfer cart for heavy loads',
    tags: ['cart', 'transfer', 'rail', 'heavy', 'transport'],
    builder: buildTransferCart,
  },

  // ── Additional Material Handling ─────────────────────────────────────
  {
    id: 'scissor-lift',
    name: 'Scissor Lift',
    category: 'material-handling',
    description: 'Scissor lift work platform',
    tags: ['scissor', 'lift', 'platform', 'elevated', 'maintenance'],
    builder: buildScissorLift,
  },
  {
    id: 'monorail',
    name: 'Monorail Hoist',
    category: 'material-handling',
    description: 'Overhead monorail with motorized hoist trolley',
    tags: ['monorail', 'hoist', 'overhead', 'trolley', 'chain'],
    builder: buildMonorail,
  },
  {
    id: 'sorting-system',
    name: 'Sorting System',
    category: 'material-handling',
    description: 'Conveyor sorting system with diverters and scanner',
    tags: ['sorting', 'divert', 'scanner', 'barcode', 'distribution'],
    builder: buildSortingSystem,
  },
];

// ════════════════════════════════════════════════════════════════════════
// Utility Functions
// ════════════════════════════════════════════════════════════════════════

/** Get all models in a category */
export function getModelsByCategory(category: ModelCategory): ModelLibraryEntry[] {
  return MODEL_LIBRARY.filter((m) => m.category === category);
}

/** Search models by text query (matches name, description, tags) */
export function searchModels(query: string): ModelLibraryEntry[] {
  const lower = query.toLowerCase().trim();
  if (!lower) return MODEL_LIBRARY;
  const terms = lower.split(/\s+/);
  return MODEL_LIBRARY.filter((m) => {
    const searchable = `${m.name} ${m.description} ${m.tags.join(' ')}`.toLowerCase();
    return terms.every((t) => searchable.includes(t));
  });
}

/** Get a model by ID */
export function getModelById(id: string): ModelLibraryEntry | undefined {
  return MODEL_LIBRARY.find((m) => m.id === id);
}

/** Build a model by ID, returns null if not found */
export function buildModelById(id: string): THREE.Group | null {
  const entry = getModelById(id);
  return entry ? entry.builder() : null;
}

/** Get all library model builders as a flat record (for integration with MachineRegistry) */
export function getLibraryBuilders(): Record<string, () => THREE.Group> {
  const builders: Record<string, () => THREE.Group> = {};
  for (const entry of MODEL_LIBRARY) {
    // Use the kebab-case id as key
    builders[entry.id] = entry.builder;
    // Also register a normalized key (no dashes, lowercase) for easy matching
    builders[entry.id.replace(/-/g, '')] = entry.builder;
  }
  return builders;
}
