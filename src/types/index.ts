import type { WAREHOUSE_DEFAULTS, Sku as WarehouseSku } from '../utils/warehouseDefaults';
// Factory Model Types

export interface TransportWaypoint {
  id: string;
  position: { x: number; y: number };
  type: 'waypoint' | 'station-stop' | 'charging' | 'parking';
  linkedNodeId?: string;  // if type is 'station-stop', links to a station/buffer
}

export interface TransportLane {
  id: string;
  name: string;
  waypoints: string[];  // ordered waypoint IDs forming the path
  oneWay: boolean;
  speedLimit: number;   // m/s
  laneType: 'agv' | 'forklift' | 'both';
}

export interface TransportNetwork {
  waypoints: TransportWaypoint[];
  lanes: TransportLane[];
  enabled: boolean;
}

export type ScriptHook = 'on_enter' | 'on_exit' | 'on_failure' | 'on_setup' | 'on_create';

export interface ScriptEntry {
  nodeId: string;
  hook: ScriptHook;
  code: string;
  enabled?: boolean;
}

export interface FactoryModel {
  id?: string;
  name: string;
  description?: string;
  stations: Station[];
  buffers: Buffer[];
  connections: Connection[];
  products: Product[];
  resources: Resource[];
  extraNodes: ExtraNodeEntry[];
  orders?: Order[];
  layout: LayoutData;
  transportNetwork?: TransportNetwork;
  scripts?: ScriptEntry[];
  energyCostPerKwh?: number;
  co2EmissionFactor?: number;
  subModels?: SubModelInstance[];
  templates?: ModelTemplate[];
}

export interface Station {
  id: string;
  name: string;
  cycleTime: DistributionConfig;
  setupTime?: DistributionConfig;
  mtbf?: number;
  mttr?: number;
  scrapRate?: number;
  batchSize?: number;
  position: Position;
  productCycleTimes?: Record<string, DistributionConfig>;  // productId -> cycle time override
  shifts?: ShiftSchedule[];
  // Cost modeling
  costPerHour?: number;       // Operating cost per hour ($/hr)
  costPerUnit?: number;       // Variable cost per item processed
  scrapCostPerUnit?: number;  // Cost per scrapped item
  // Energy modeling (kW)
  energyIdleKw?: number;
  energyProcessingKw?: number;
  energySetupKw?: number;
  // Preventive maintenance
  pmInterval?: number;        // Hours between PM events
  pmDuration?: number;        // Hours per PM event
  pmCostPerEvent?: number;    // Cost per PM event
  // Rework
  reworkTarget?: string;      // Station ID to send defective items for rework (instead of scrapping)
  reworkRate?: number;        // Fraction of defects sent to rework (0-1, rest are scrapped)
  // Visual customization
  libraryModelId?: string;    // Override 3D model from the model library (e.g. 'laser-cutter', 'press')
}

export interface Buffer {
  id: string;
  name: string;
  capacity: number;
  queueRule: 'FIFO' | 'LIFO' | 'PRIORITY';
  position: Position;
  kanbanEnabled?: boolean;
  kanbanCards?: number;
  libraryModelId?: string;    // Override 3D model from the model library
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  probability?: number;
}

export interface Product {
  id: string;
  name: string;
  routing: string[];
  arrivalRate?: number;
  priority?: number;
  dueDate?: number; // due date offset in seconds (used for order-driven delivery metrics)
}

export interface Resource {
  id: string;
  name: string;
  type: 'operator' | 'machine' | 'tool';
  capacity: number;
  shifts?: ShiftSchedule[];
  skills?: string[];
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'late';
  isWip: boolean;
  initialStationId?: string;
}

export interface ShiftSchedule {
  name: string;
  startHour: number;
  endHour: number;
  days: number[];
}

export interface DistributionConfig {
  type: 'constant' | 'normal' | 'exponential' | 'triangular' | 'weibull' | 'empirical' | 'uniform' | 'lognormal';
  parameters: Record<string, number | number[]>;
}

export interface Position {
  x: number;
  y: number;
}

export interface LayoutData {
  width: number;
  height: number;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundScale?: number;
  backgroundOffsetX?: number;
  backgroundOffsetY?: number;
  backgroundLocked?: boolean;
  gridSize?: number;
}

// Simulation Types

export interface SimulationOptions {
  duration: number;
  warmupPeriod?: number;
  seed?: number;
  replications?: number;
  traceMode?: boolean;
  confidenceLevel?: number;
  streamEvents?: boolean;
  /** ISO date string for simulation start (default: today 06:00) */
  simulationStartDate?: string;
  /** Warm start: initial WIP positions — stationId → count of items already in progress */
  warmStart?: Record<string, number>;
  /** Day of week to start simulation (0=Sun, 1=Mon, etc.) */
  startDayOfWeek?: number;
  /** Hour of day to start simulation (0-23) */
  startHour?: number;
}

export interface ConfidenceInterval {
  mean: number;
  ci_lower: number;
  ci_upper: number;
  std: number;
  half_width?: number;
}

export interface SimulationResult {
  runId: string;
  status: 'completed' | 'error';
  kpis: KPIData;
  events: SimulationEvent[];
  duration: number;
  replications?: number;
  replicationResults?: KPIData[];
}

export interface SimulationEvent {
  time: number;
  type: string;
  entityId: string;
  details: Record<string, unknown>;
}

export interface SimulationProgress {
  runId: string;
  progress: number;
  currentTime: number;
  message?: string;
  diagnostics?: {
    activeProducts: number;
    completedProducts: number;
    stationStates: Record<string, string>;
    bufferLevels: Record<string, { level: number; capacity: number }>;
  };
}

// KPI Types

export interface SimWarning {
  type: string;
  severity: 'warning' | 'error' | 'info';
  message: string;
}

export interface DeliveryData {
  onTimeRate: number;
  averageLateness: number;
  ordersAtRisk: number;
}

export interface CostData {
  totalCost: number;
  costPerUnit: number;
  byStation: Record<string, { operating: number; variable: number; scrapCost: number; total: number }>;
  operatingCost: number;
  variableCost: number;
  scrapCost: number;
}

export interface EnergyData {
  totalEnergy: number;
  energyPerUnit: number;
  totalCost: number;
  co2Kg: number;
  byStation: Record<string, { kwh: number; perUnit: number; cost: number; co2Kg: number }>;
}

export interface MaintenanceData {
  totalDowntime: number;
  plannedDowntime: number;
  unplannedDowntime: number;
  pmEvents: number;
  pmCost: number;
  byStation: Record<string, { plannedDowntime: number; unplannedDowntime: number; pmEvents: number; pmCost: number }>;
}

export interface KPIData {
  oee: OEEData;
  throughput: ThroughputData;
  utilization: UtilizationData;
  wip: WIPData;
  cycleTime: CycleTimeData;
  delivery?: DeliveryData;
  warnings?: SimWarning[];
  cost?: CostData;
  energy?: EnergyData;
  maintenance?: MaintenanceData;
  /** Warehouse elements keyed by node id (engine/warehouse.py get_statistics). */
  warehouses?: Record<string, Record<string, unknown>>;
}

export interface OEEData {
  overall: number;
  availability: number;
  performance: number;
  quality: number;
  byStation: Record<string, {
    availability: number;
    performance: number;
    quality: number;
    oee: number;
  }>;
}

export interface ThroughputData {
  total: number;
  inProgress?: number;
  ratePerHour: number;
  byProduct: Record<string, number>;
  byHour: number[];
  consumed?: Record<string, number>;
}

export interface StationUtilization {
  busy: number;
  idle: number;
  setup: number;
  blocked: number;
  failed: number;
  starved: number;
  offShift: number;
  batchWait: number;
}

export interface ResourceUtilization {
  utilization: number;
  name: string;
  capacity: number;
  totalBusyTime: number;
  totalIdleTime: number;
  requestCount: number;
}

export interface UtilizationData {
  byStation: Record<string, StationUtilization>;
  byResource: Record<string, number | ResourceUtilization>;
}

export interface WIPData {
  /** WIP at the end of the run (not the time-average) */
  total: number;
  /** Time-average WIP over the run (engine: kpis.wip.average) */
  average?: number;
  /** Peak WIP observed (engine: kpis.wip.peak) */
  peak?: number;
  byBuffer: Record<string, number>;
  timeSeries: Array<{ time: number; wip: number }>;
}

export interface CycleTimeData {
  mean: number;
  std: number;
  min: number;
  max: number;
  byProduct: Record<string, { mean: number; std: number }>;
}

// Dashboard Widget Types

export type DashboardWidgetType =
  | 'oee-summary'
  | 'throughput-summary'
  | 'cycle-time-summary'
  | 'wip-summary'
  | 'quality-summary'
  | 'oee-chart'
  | 'throughput-chart'
  | 'bottleneck-heatmap'
  | 'station-table'
  | 'utilization-chart'
  | 'wip-trend-chart'
  | 'quality-chart'
  | 'gantt-schedule'
  | 'sankey-flow'
  | 'cycle-time-pareto'
  | 'throughput-waterfall'
  | 'buffer-sparklines'
  | 'cost-summary'
  | 'energy-chart'
  | 'maintenance-chart'
  | 'value-stream-map'
  | 'experiment-results';

export interface DashboardWidgetConfig {
  id: string;
  type: DashboardWidgetType;
  label: string;
  size: 'sm' | 'md' | 'lg' | 'full';
}

// Scenario Types

export interface Scenario {
  id: string;
  modelId: string;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  overrides?: ScenarioParameterOverride[];
  createdAt: string;
  results?: SimulationResult;
}

export interface ScenarioComparison {
  scenarios: Scenario[];
  kpiDifferences: KPIDifference[];
}

export interface KPIDifference {
  kpiName: string;
  values: Array<{ scenarioId: string; value: number }>;
  percentChange: number;
}

// User Types

export type UserRole = 'operator' | 'analyst' | 'engineer' | 'developer';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  dashboardLayout: string[];
  defaultDuration: number;
}

// UI Types

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// Template Types

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  template: Partial<FactoryModel>;
}

// Extra Node Data Types

export interface SourceNodeData {
  id: string;
  name: string;
  arrivalRate: number; // seconds between arrivals
  feedMode: 'interval' | 'orders';
  productFilter?: string; // optional product ID filter (only spawn this product)
  productBatchSize?: number; // consecutive parts of same type before switching (default 1 = round-robin)
}

export interface SinkNodeData {
  id: string;
  name: string;
}

export interface ConveyorNodeData {
  id: string;
  name: string;
  length: number;
  speed: number;
  capacity: number;
  accumulationMode?: 'accumulating' | 'non-accumulating';
}

export interface OperatorNodeData {
  id: string;
  name: string;
  count: number;
  efficiency: number; // percentage
  skill: string;
}

export interface InspectionNodeData {
  id: string;
  name: string;
  inspectionTime: number; // seconds
  defectRate: number; // percentage
  inspectionType: 'visual' | 'automated' | 'sampling';
}

export interface AssemblyNodeData {
  id: string;
  name: string;
  cycleTime: number; // seconds
  inputParts: number;
  inputPartsByProduct?: { productId: string; productName: string; quantity: number }[];
}

export interface SplitterNodeData {
  id: string;
  name: string;
  outputs: number; // 2-5
  splitType: 'equal' | 'percentage' | 'conditional' | 'product-based';
  percentages?: number[]; // per-output percentages (must sum to 100), used when splitType='percentage'
  productRouting?: Record<string, number>; // productId -> output index (0-based)
}

export interface MergeNodeData {
  id: string;
  name: string;
  inputs: number; // 2-5
  mergeType: 'fifo' | 'priority' | 'alternating';
}

export interface DisassemblyNodeData {
  id: string;
  name: string;
  cycleTime: number;
  outputParts: { productId: string; productName: string; quantity: number }[];
}

export interface PalletizeNodeData {
  id: string;
  name: string;
  defaultPalletSize: number;  // default items per pallet
  palletSizeByProduct?: Record<string, number>;  // productId -> pallet size override
  cycleTime: number;   // seconds to palletize
}

export interface DepalletizeNodeData {
  id: string;
  name: string;
  cycleTime: number;   // seconds per item to depalletize (unloads until empty)
}

export interface MatchBufferNodeData {
  id: string;
  name: string;
  capacity: number;
  matchKey: 'order' | 'batch';
  requiredParts: { productId: string; productName: string; quantity: number }[];
  timeout?: number;  // optional: max wait time in seconds
}

export interface AGVNodeData {
  id: string;
  name: string;
  count: number;
  speed: number;       // m/s
  capacity: number;    // items per trip
}

export interface RoboticCellNodeData {
  id: string;
  name: string;
  cycleTime: number;   // seconds
  program?: string;    // program/task name
}

export interface HumanoidNodeData {
  id: string;
  name: string;
  count: number;
  efficiency: number;  // percentage
  skill: string;
}

/**
 * Warehouse element (engine/warehouse.py). Rack layout, equipment, SKUs,
 * inbound, orders. The legacy fields (capacity, levels, put/pick time) are
 * kept for models saved before rack layouts; the engine maps capacity +
 * levels onto a layout when `layout` is missing.
 */
export interface WarehouseNodeData {
  id: string;
  name: string;
  layout?: typeof WAREHOUSE_DEFAULTS.layout;
  slotting?: string;
  storageType?: 'racks' | 'asrs';
  cranes?: typeof WAREHOUSE_DEFAULTS.cranes;
  outbound?: typeof WAREHOUSE_DEFAULTS.outbound;
  crossDock?: boolean;
  forklifts?: typeof WAREHOUSE_DEFAULTS.forklifts;
  pickers?: typeof WAREHOUSE_DEFAULTS.pickers;
  inbound?: typeof WAREHOUSE_DEFAULTS.inbound;
  orders?: typeof WAREHOUSE_DEFAULTS.orders;
  lineSupply?: typeof WAREHOUSE_DEFAULTS.lineSupply;
  store?: typeof WAREHOUSE_DEFAULTS.store;
  skus?: WarehouseSku[];
  capacity?: number;
  levels?: number;
  putTime?: number;
  pickTime?: number;
  utilizationTarget?: number;
}

export interface LoadingDockNodeData {
  id: string;
  name: string;
  dockCount: number;         // number of dock doors
  loadTime: number;          // seconds to load a truck
  unloadTime: number;        // seconds to unload a truck
  truckArrivalRate: number;  // seconds between truck arrivals
  mode: 'inbound' | 'outbound' | 'both';
}

export interface CraneNodeData {
  id: string;
  name: string;
  craneType: 'gantry' | 'bridge';
  liftCapacity: number;      // kg
  travelSpeed: number;       // m/s
  liftSpeed: number;         // m/s
  spanWidth: number;         // meters
}

export interface ForkliftNodeData {
  id: string;
  name: string;
  count: number;
  liftCapacity: number;      // kg
  speed: number;             // m/s
  liftHeight: number;        // meters max
}

export interface ColdStorageNodeData {
  id: string;
  name: string;
  capacity: number;          // pallet positions
  temperature: number;       // target temp in Celsius
  putTime: number;           // seconds
  pickTime: number;          // seconds
}

export interface PressNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds
  tonnage: number;           // press force in tons
  setupTime: number;         // die change seconds
  scrapRate: number;         // 0-1
}

export interface LaserCutterNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds per part
  sheetSize: string;         // e.g. "1500x3000"
  laserPower: number;        // watts
  setupTime: number;         // seconds
}

export interface WeldingCellNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds
  weldType: 'MIG' | 'TIG' | 'spot' | 'laser';
  fixtureCount: number;      // number of fixtures/positioners
  setupTime: number;         // seconds
}

export interface PaintBoothNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds spray time
  cureTime: number;          // seconds cure/dry time
  boothType: 'spray' | 'powder' | 'dip';
  batchSize: number;
}

export interface PackagerNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds per unit
  packType: 'shrinkwrap' | 'stretchwrap' | 'boxing' | 'banding';
  unitsPerPack: number;
}

export interface WasherNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds per batch
  batchSize: number;
  washType: 'aqueous' | 'solvent' | 'ultrasonic';
  temperature: number;       // Celsius
}

export interface CNCMachineNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds per part
  toolChangeTime: number;    // seconds
  spindleSpeed: number;      // RPM
  machineType: 'lathe' | 'mill' | 'grinder';
}

export interface OvenNodeData {
  id: string;
  name: string;
  rampUpTime: number;        // seconds to reach temp
  holdTime: number;          // seconds at temp
  coolDownTime: number;      // seconds to cool
  batchSize: number;
  temperature: number;       // Celsius
}

export interface InjectionMolderNodeData {
  id: string;
  name: string;
  cycleTime: number;         // seconds
  cavityCount: number;       // parts per shot
  coolingTime: number;       // seconds
  clampForce: number;        // tons
}

export interface SortingStationNodeData {
  id: string;
  name: string;
  outputs: number;           // number of output lanes (2-6)
  scanTime: number;          // seconds to identify
  divertSpeed: number;       // items per minute
  sortMode: 'barcode' | 'weight' | 'vision' | 'manual';
}

export interface AccumulatorNodeData {
  id: string;
  name: string;
  capacity: number;          // max items held
  releaseSize: number;       // items released per burst
  releaseInterval: number;   // seconds between releases
  mode: 'fifo' | 'batch';
}

export interface TurntableNodeData {
  id: string;
  name: string;
  rotationTime: number;      // seconds per rotation
  transferTime: number;      // seconds to transfer item
  positions: number;         // number of positions (2-8)
}

export interface ElevatorNodeData {
  id: string;
  name: string;
  loadTime: number;          // seconds to load
  unloadTime: number;        // seconds to unload
  travelSpeed: number;       // m/s vertical
  floors: number;            // number of floors served
  floorHeight: number;       // meters between floors
}

export interface OverheadConveyorNodeData {
  id: string;
  name: string;
  carrierCount: number;      // number of carriers
  carrierSpeed: number;      // m/s
  loadTime: number;          // seconds to load onto carrier
  unloadTime: number;        // seconds to unload
  trackLength: number;       // meters
}

export interface SorterNodeData {
  id: string;
  name: string;
  sortDelay: number;         // seconds per sort decision
  errorRate: number;         // 0-1 fraction mis-sorted
  outputs: number;           // number of sort destinations
}

export interface ShuttleNodeData {
  id: string;
  name: string;
  travelSpeed: number;       // m/s
  laneCount: number;         // number of lanes
  loadTime: number;          // seconds
  unloadTime: number;        // seconds
}

export interface RollerConveyorNodeData {
  id: string;
  name: string;
  length: number;            // meters
  speed: number;             // m/s
  capacity: number;          // items
}

export interface TrackGuidedVehicleNodeData {
  id: string;
  name: string;
  count: number;             // fleet size
  speed: number;             // m/s
  capacity: number;          // items per trip
  trackLength: number;       // meters of fixed rail
}

export interface CrossoverNodeData {
  id: string;
  name: string;
  transferTime: number;      // seconds to switch lanes
  laneCount: number;         // number of input/output lanes
}

export interface PickStationNodeData {
  id: string;
  name: string;
  pickerCount: number;       // number of human pickers
  pickTime: number;          // seconds per pick
  errorRate: number;         // 0-1 fraction pick errors
}

export interface WeighingNodeData {
  id: string;
  name: string;
  measureTime: number;       // seconds per measurement
  rejectRate: number;        // 0-1 fraction out-of-spec
}

export interface LabelerNodeData {
  id: string;
  name: string;
  labelTime: number;         // seconds per label
  errorRate: number;         // 0-1 fraction label errors
}

export type ExtraNodeData =
  | SourceNodeData
  | SinkNodeData
  | ConveyorNodeData
  | OperatorNodeData
  | InspectionNodeData
  | AssemblyNodeData
  | SplitterNodeData
  | MergeNodeData
  | DisassemblyNodeData
  | PalletizeNodeData
  | DepalletizeNodeData
  | MatchBufferNodeData
  | AGVNodeData
  | RoboticCellNodeData
  | HumanoidNodeData
  | WarehouseNodeData
  | LoadingDockNodeData
  | CraneNodeData
  | ForkliftNodeData
  | ColdStorageNodeData
  | PressNodeData
  | LaserCutterNodeData
  | WeldingCellNodeData
  | PaintBoothNodeData
  | PackagerNodeData
  | WasherNodeData
  | CNCMachineNodeData
  | OvenNodeData
  | InjectionMolderNodeData
  | SortingStationNodeData
  | AccumulatorNodeData
  | TurntableNodeData
  | ElevatorNodeData
  | OverheadConveyorNodeData
  | SorterNodeData
  | ShuttleNodeData
  | RollerConveyorNodeData
  | TrackGuidedVehicleNodeData
  | CrossoverNodeData
  | PickStationNodeData
  | WeighingNodeData
  | LabelerNodeData;

export interface ExtraNodeEntry {
  id: string;
  type: NodeType;
  data: ExtraNodeData;
  position: Position;
  libraryModelId?: string;    // Override 3D model from the model library
}

// Scenario Override Types

export interface ScenarioParameterOverride {
  entityType: 'station' | 'buffer' | 'source' | 'product' | 'conveyor' | 'inspection' | 'assembly' | 'splitter' | 'merge' | 'disassembly' | 'palletize' | 'depalletize' | 'matchbuffer' | 'warehouse' | 'loadingdock' | 'crane' | 'forklift' | 'coldstorage' | 'press' | 'lasercutter' | 'weldingcell' | 'paintbooth' | 'packager' | 'washer' | 'cncmachine' | 'oven' | 'injectionmolder' | 'sortingstation' | 'accumulator' | 'turntable' | 'elevator' | 'overheadconveyor' | 'sorter' | 'shuttle' | 'rollerconveyor' | 'trackguidedvehicle' | 'crossover' | 'pickstation' | 'weighing' | 'labeler';
  entityId: string;
  entityName: string;
  parameter: string;
  originalValue: unknown;
  overrideValue: unknown;
}

// Node Types for React Flow

export type NodeType = 'station' | 'buffer' | 'source' | 'sink' | 'conveyor' | 'operator' | 'inspection' | 'assembly' | 'splitter' | 'merge' | 'disassembly' | 'palletize' | 'depalletize' | 'matchbuffer' | 'agv' | 'roboticcell' | 'humanoid' | 'warehouse' | 'loadingdock' | 'crane' | 'forklift' | 'coldstorage' | 'press' | 'lasercutter' | 'weldingcell' | 'paintbooth' | 'packager' | 'washer' | 'cncmachine' | 'oven' | 'injectionmolder' | 'sortingstation' | 'accumulator' | 'turntable' | 'elevator' | 'overheadconveyor' | 'sorter' | 'shuttle' | 'rollerconveyor' | 'trackguidedvehicle' | 'crossover' | 'pickstation' | 'weighing' | 'labeler';

// Parameter Sweep Types

export type SweepMode = 'oat' | 'full' | 'lhs' | 'montecarlo';

export interface SweepParameterDef {
  entityType: ScenarioParameterOverride['entityType'];
  entityId: string;
  entityName: string;
  parameter: string;
  parameterLabel: string;
  min: number;
  max: number;
  steps: number;
}

export interface SweepConfig {
  id: string;
  name: string;
  parameters: SweepParameterDef[];
  mode: SweepMode;
  kpiTarget: string;
  sampleCount: number;
  baseOptions: SimulationOptions;
}

export interface SweepPointResult {
  parameterValues: Record<string, number>;
  kpis: KPIData;
  runId: string;
}

export interface SweepResult {
  configId: string;
  startedAt: string;
  completedAt: string;
  totalRuns: number;
  pointResults: SweepPointResult[];
}

// Experiment Manager Types

export type ExperimentMode = 'sweep' | 'optimize' | 'replicate';

export interface ExperimentParameterRange {
  path: string;              // dot-path to parameter (e.g. "stations.0.cycleTime.parameters.value")
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface ExperimentConfig {
  mode: ExperimentMode;
  parameters: ExperimentParameterRange[];
  replications: number;
  confidenceLevel: number;   // 0-1 (e.g. 0.95)
  objective?: string;        // KPI name for optimization (e.g. "throughput", "cycle_time")
  maximize?: boolean;
  // GA settings
  populationSize?: number;
  generations?: number;
  mutationRate?: number;
  crossoverRate?: number;
  elitismCount?: number;
}

export interface ExperimentTrialResult {
  parameters: Record<string, number>;
  kpis: KPIData;
  objectiveValue?: number;
  confidenceInterval?: ConfidenceInterval;
}

export interface ExperimentResult {
  mode: ExperimentMode;
  trials: ExperimentTrialResult[];
  bestTrial?: ExperimentTrialResult;
  totalRuns: number;
  elapsedSeconds: number;
}

// Multi-Model Hierarchy Types

export interface SubModelPort {
  id: string;
  name: string;
  direction: 'input' | 'output';
  linkedNodeId: string;      // node inside the sub-model this port maps to
}

export interface SubModelInstance {
  id: string;
  templateId: string;
  name: string;
  position: Position;
  inputPorts: SubModelPort[];
  outputPorts: SubModelPort[];
  parameterOverrides?: Record<string, unknown>;
}

export interface ModelTemplate {
  id: string;
  name: string;
  description?: string;
  model: FactoryModel;       // the sub-model content
  parameters?: Record<string, unknown>;  // default parameter values
}

// Plugin Types

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  hooks: string[];
  errors?: string[];
}

export interface FactoryNode {
  id: string;
  type: NodeType;
  data: Station | Buffer | ExtraNodeData;
  position: Position;
}

export interface FactoryEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

// MQTT Connector Types

export interface MQTTConnectConfig {
  broker: string;
  port?: number;
  username?: string;
  password?: string;
  clientId?: string;
  topics?: string[];
}

export interface MQTTConnectResult {
  status: 'connected' | 'error';
  broker?: string;
  port?: number;
  topics?: string[];
  error?: string;
}

export interface MQTTMessageData {
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
  qos: number;
}

export interface MQTTStatusResult {
  connected: boolean;
  messageCount: number;
  messages: MQTTMessageData[];
  latestByTopic: Record<string, MQTTMessageData>;
  broker?: string;
  port?: number;
  topics?: string[];
}

// OPC-UA Connector Types

export interface OPCUAConnectConfig {
  endpoint: string;
  username?: string;
  password?: string;
  securityPolicy?: string;
}

export interface OPCUAConnectResult {
  status: 'connected' | 'error';
  endpoint?: string;
  serverInfo?: Record<string, unknown>;
  error?: string;
}

export interface OPCUAStatusResult {
  connected: boolean;
  endpoint?: string;
}

export interface OPCUANodeInfo {
  nodeId: string;
  displayName: string;
  nodeClass: string;
}

export interface OPCUAReadResult {
  success: boolean;
  nodeId?: string;
  value?: unknown;
  dataType?: string;
  timestamp?: string;
  nodes?: Record<string, { success: boolean; nodeId: string; value?: unknown; dataType?: string; timestamp?: string; error?: string }>;
  error?: string;
}

export interface OPCUABrowseResult {
  success: boolean;
  parent: string;
  children: OPCUANodeInfo[];
  error?: string;
}

// Window API type augmentation for Electron preload bridge
declare global {
  interface Window {
    factorySim?: {
      simulation?: {
        runSimulation: (model: FactoryModel, options: SimulationOptions) => Promise<SimulationResult>;
        stopSimulation: (runId: string) => Promise<void>;
      };
      model?: {
        saveModel: (model: FactoryModel) => Promise<string>;
        loadModel: (id: string) => Promise<FactoryModel>;
        listModels: () => Promise<Array<{ id: string; name: string; description?: string; stationCount: number; updatedAt: string }>>;
        deleteModel: (id: string) => Promise<void>;
        exportModel: (id: string, format: 'json' | 'python') => Promise<string>;
      };
      code?: {
        exportModel: (model: FactoryModel, options?: Record<string, unknown>) => Promise<string>;
      };
      app?: {
        getVersion: () => Promise<string>;
        getPlatform: () => string;
        getUserDataPath: () => Promise<string>;
        onSimulationProgress?: (callback: (progress: SimulationProgress) => void) => (() => void) | undefined;
        onSimulationEvent?: (callback: (event: SimulationEvent) => void) => (() => void) | undefined;
        onMenuAction?: (callback: (action: string, payload?: unknown) => void) => () => void;
      };
      artifacts?: {
        saveRunBundle: (bundle: {
          folderName: string;
          files: Array<{ name: string; content: string; encoding?: string }>;
        }) => Promise<string>;
        openRunFolder: (folderPath: string) => Promise<void>;
        listRuns: () => Promise<Array<{ name: string; path: string }>>;
        loadRunFrames: (runPath: string) => Promise<{
          frames: Array<{
            progress: number;
            imageBase64: string;
            sidecar: Record<string, unknown> | null;
          }>;
          runInfo?: Record<string, unknown> | null;
          model?: Record<string, unknown> | null;
        }>;
        loadRunEventLog: (runPath: string) => Promise<{
          events: Array<Record<string, unknown>>;
          runInfo?: Record<string, unknown> | null;
          model?: Record<string, unknown> | null;
        }>;
      };
      help?: {
        open: () => Promise<void>;
      };
      window?: {
        createPopout: () => Promise<void>;
      };
      mqtt?: {
        connect: (config: MQTTConnectConfig) => Promise<MQTTConnectResult>;
        disconnect: () => Promise<{ status: string }>;
        status: (options?: { limit?: number }) => Promise<MQTTStatusResult>;
        publish: (data: { topic: string; payload: unknown }) => Promise<{ status: string; topic?: string; error?: string }>;
        subscribe: (data: { topics: string[] }) => Promise<{ status: string; results: Array<{ success: boolean; topic?: string; error?: string }> }>;
      };
      opcua?: {
        connect: (config: OPCUAConnectConfig) => Promise<OPCUAConnectResult>;
        disconnect: () => Promise<{ status: string }>;
        status: () => Promise<OPCUAStatusResult>;
        read: (data: { nodeId?: string; nodeIds?: string[] }) => Promise<OPCUAReadResult>;
        browse: (data?: { nodeId?: string }) => Promise<OPCUABrowseResult>;
      };
      plugins?: {
        list: () => Promise<PluginInfo[]>;
        enable: (name: string) => Promise<void>;
        disable: (name: string) => Promise<void>;
        getLogs: (name: string) => Promise<string[]>;
        reload: () => Promise<void>;
        openFolder: () => Promise<void>;
      };
    };
  }
}
