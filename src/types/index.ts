// Factory Model Types

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
}

export interface Buffer {
  id: string;
  name: string;
  capacity: number;
  queueRule: 'FIFO' | 'LIFO' | 'PRIORITY';
  position: Position;
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

export interface KPIData {
  oee: OEEData;
  throughput: ThroughputData;
  utilization: UtilizationData;
  wip: WIPData;
  cycleTime: CycleTimeData;
  delivery?: DeliveryData;
  warnings?: SimWarning[];
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
  total: number;
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
  | 'gantt-schedule';

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
  | MatchBufferNodeData;

export interface ExtraNodeEntry {
  id: string;
  type: NodeType;
  data: ExtraNodeData;
  position: Position;
}

// Scenario Override Types

export interface ScenarioParameterOverride {
  entityType: 'station' | 'buffer' | 'source' | 'product' | 'conveyor' | 'inspection' | 'assembly' | 'splitter' | 'merge' | 'disassembly' | 'palletize' | 'depalletize' | 'matchbuffer';
  entityId: string;
  entityName: string;
  parameter: string;
  originalValue: unknown;
  overrideValue: unknown;
}

// Node Types for React Flow

export type NodeType = 'station' | 'buffer' | 'source' | 'sink' | 'conveyor' | 'operator' | 'inspection' | 'assembly' | 'splitter' | 'merge' | 'disassembly' | 'palletize' | 'depalletize' | 'matchbuffer';

// Parameter Sweep Types

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
  mode: 'oat' | 'full';
  kpiTarget: string;
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

// Window API type augmentation for Electron preload bridge
declare global {
  interface Window {
    factorySim?: {
      simulation?: {
        runSimulation: (model: any, options: any) => Promise<SimulationResult>;
        stopSimulation: (runId: string) => Promise<void>;
      };
      model?: {
        saveModel: (model: any) => Promise<string>;
        loadModel: (id: string) => Promise<FactoryModel>;
        listModels: () => Promise<any[]>;
        deleteModel: (id: string) => Promise<void>;
        exportModel: (id: string, format: 'json' | 'python') => Promise<string>;
      };
      code?: {
        exportModel: (model: any, options?: Record<string, unknown>) => Promise<string>;
      };
      app?: {
        getVersion: () => string;
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
