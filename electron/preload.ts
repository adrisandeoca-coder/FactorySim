import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for exposed APIs
export interface SimulationAPI {
  runSimulation: (model: object, options: SimulationOptions) => Promise<SimulationResult>;
  validateModel: (model: object) => Promise<ValidationResult>;
  stopSimulation: (runId: string) => Promise<void>;
  getSimulationStatus: (runId: string) => Promise<SimulationStatus>;
}

export interface ModelAPI {
  saveModel: (model: FactoryModel) => Promise<string>;
  loadModel: (id: string) => Promise<FactoryModel>;
  listModels: () => Promise<ModelSummary[]>;
  deleteModel: (id: string) => Promise<void>;
  exportModel: (id: string, format: 'json' | 'python') => Promise<string>;
}

export interface ScenarioAPI {
  createScenario: (modelId: string, name: string, parameters: object) => Promise<string>;
  loadScenario: (id: string) => Promise<Scenario>;
  listScenarios: (modelId?: string) => Promise<ScenarioSummary[]>;
  deleteScenario: (id: string) => Promise<void>;
  compareScenarios: (ids: string[]) => Promise<ComparisonResult>;
}

export interface DataAPI {
  importCSV: (filePath: string, options: ImportOptions) => Promise<ImportResult>;
  importExcel: (filePath: string, options: ImportOptions) => Promise<ImportResult>;
  exportReport: (runId: string, format: 'pdf' | 'csv' | 'excel') => Promise<string>;
  getSyncStatus: () => Promise<SyncStatus>;
  configureSyncConnector: (config: ConnectorConfig) => Promise<void>;
}

export interface DialogAPI {
  showOpenDialog: (options: OpenDialogOptions) => Promise<string[] | undefined>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<string | undefined>;
  showMessageBox: (options: MessageBoxOptions) => Promise<number>;
}

export interface AppAPI {
  getVersion: () => string;
  getPlatform: () => string;
  getUserDataPath: () => Promise<string>;
  onSimulationProgress: (callback: (progress: SimulationProgress) => void) => () => void;
  onSyncUpdate: (callback: (status: SyncStatus) => void) => () => void;
}

// Interfaces
interface SimulationOptions {
  duration: number;
  warmupPeriod?: number;
  seed?: number;
  replications?: number;
}

interface SimulationResult {
  runId: string;
  status: 'completed' | 'error';
  kpis: KPIData;
  events: SimulationEvent[];
  duration: number;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface SimulationStatus {
  status: 'running' | 'completed' | 'error' | 'stopped';
  progress: number;
  currentTime: number;
  eventsProcessed: number;
}

interface Order {
  id: string;
  productId: string;
  quantity: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'late';
  isWip: boolean;
  initialStationId?: string;
}

interface FactoryModel {
  id?: string;
  name: string;
  description?: string;
  stations: Station[];
  buffers: Buffer[];
  connections: Connection[];
  products: Product[];
  resources: Resource[];
  orders?: Order[];
  layout: LayoutData;
}

interface ModelSummary {
  id: string;
  name: string;
  description?: string;
  stationCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Scenario {
  id: string;
  modelId: string;
  name: string;
  parameters: object;
  createdAt: string;
  results?: SimulationResult;
}

interface ScenarioSummary {
  id: string;
  name: string;
  modelId: string;
  createdAt: string;
  hasResults: boolean;
}

interface ComparisonResult {
  scenarios: ScenarioSummary[];
  kpiComparison: KPIComparison[];
  statisticalTests: StatisticalTest[];
}

interface ImportOptions {
  columnMapping?: Record<string, string>;
  skipRows?: number;
  sheetName?: string;
}

interface ImportResult {
  success: boolean;
  rowsImported: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

interface SyncStatus {
  connected: boolean;
  lastSync?: string;
  nextSync?: string;
  connectorType?: string;
}

interface ConnectorConfig {
  type: 'mes' | 'erp' | 'mqtt' | 'opcua' | 'csv';
  settings: Record<string, unknown>;
}

interface OpenDialogOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
}

interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  title?: string;
  message: string;
  buttons?: string[];
}

interface SimulationProgress {
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

interface KPIData {
  oee: OEEData;
  throughput: ThroughputData;
  utilization: UtilizationData;
  wip: WIPData;
  cycleTime: CycleTimeData;
}

interface OEEData {
  overall: number;
  availability: number;
  performance: number;
  quality: number;
  byStation: Record<string, { availability: number; performance: number; quality: number }>;
}

interface ThroughputData {
  total: number;
  byProduct: Record<string, number>;
  byHour: number[];
}

interface UtilizationData {
  byStation: Record<string, { busy: number; idle: number; blocked: number; failed: number }>;
  byResource: Record<string, number>;
}

interface WIPData {
  total: number;
  byBuffer: Record<string, number>;
  timeSeries: { time: number; wip: number }[];
}

interface CycleTimeData {
  mean: number;
  std: number;
  min: number;
  max: number;
  byProduct: Record<string, { mean: number; std: number }>;
}

interface Station {
  id: string;
  name: string;
  cycleTime: DistributionConfig;
  setupTime?: DistributionConfig;
  mtbf?: number;
  mttr?: number;
  scrapRate?: number;
  batchSize?: number;
  position: { x: number; y: number };
}

interface Buffer {
  id: string;
  name: string;
  capacity: number;
  queueRule: 'FIFO' | 'LIFO' | 'PRIORITY';
  position: { x: number; y: number };
}

interface Connection {
  id: string;
  source: string;
  target: string;
  probability?: number;
}

interface Product {
  id: string;
  name: string;
  routing: string[];
  arrivalRate?: number;
}

interface Resource {
  id: string;
  name: string;
  type: 'operator' | 'machine' | 'tool';
  capacity: number;
  shifts?: ShiftSchedule[];
  skills?: string[];
}

interface ShiftSchedule {
  name: string;
  startHour: number;
  endHour: number;
  days: number[];
}

interface DistributionConfig {
  type: 'constant' | 'normal' | 'exponential' | 'triangular' | 'weibull' | 'empirical';
  parameters: Record<string, number | number[]>;
}

interface LayoutData {
  width: number;
  height: number;
  backgroundImage?: string;
  gridSize?: number;
}

interface SimulationEvent {
  time: number;
  type: string;
  entityId: string;
  details: Record<string, unknown>;
}

interface ValidationError {
  path: string;
  message: string;
  code: string;
}

interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

interface KPIComparison {
  kpiName: string;
  values: { scenarioId: string; value: number }[];
  percentChange: number;
}

interface StatisticalTest {
  testName: string;
  pValue: number;
  significant: boolean;
}

interface ImportError {
  row: number;
  column: string;
  message: string;
}

interface ImportWarning {
  row: number;
  column: string;
  message: string;
}

// Expose APIs to renderer process
contextBridge.exposeInMainWorld('factorySim', {
  simulation: {
    runSimulation: (model: object, options: SimulationOptions) =>
      ipcRenderer.invoke('simulation:run', model, options),
    validateModel: (model: object) =>
      ipcRenderer.invoke('simulation:validate', model),
    stopSimulation: (runId: string) =>
      ipcRenderer.invoke('simulation:stop', runId),
    getSimulationStatus: (runId: string) =>
      ipcRenderer.invoke('simulation:status', runId),
  } as SimulationAPI,

  model: {
    saveModel: (model: FactoryModel) =>
      ipcRenderer.invoke('model:save', model),
    loadModel: (id: string) =>
      ipcRenderer.invoke('model:load', id),
    listModels: () =>
      ipcRenderer.invoke('model:list'),
    deleteModel: (id: string) =>
      ipcRenderer.invoke('model:delete', id),
    exportModel: (id: string, format: 'json' | 'python') =>
      ipcRenderer.invoke('model:export', id, format),
  } as ModelAPI,

  scenario: {
    createScenario: (modelId: string, name: string, parameters: object) =>
      ipcRenderer.invoke('scenario:create', modelId, name, parameters),
    loadScenario: (id: string) =>
      ipcRenderer.invoke('scenario:load', id),
    listScenarios: (modelId?: string) =>
      ipcRenderer.invoke('scenario:list', modelId),
    deleteScenario: (id: string) =>
      ipcRenderer.invoke('scenario:delete', id),
    compareScenarios: (ids: string[]) =>
      ipcRenderer.invoke('scenario:compare', ids),
  } as ScenarioAPI,

  data: {
    importCSV: (filePath: string, options: ImportOptions) =>
      ipcRenderer.invoke('data:importCSV', filePath, options),
    importExcel: (filePath: string, options: ImportOptions) =>
      ipcRenderer.invoke('data:importExcel', filePath, options),
    exportReport: (runId: string, format: 'pdf' | 'csv' | 'excel') =>
      ipcRenderer.invoke('data:exportReport', runId, format),
    getSyncStatus: () =>
      ipcRenderer.invoke('data:syncStatus'),
    configureSyncConnector: (config: ConnectorConfig) =>
      ipcRenderer.invoke('data:configureSync', config),
  } as DataAPI,

  dialog: {
    showOpenDialog: (options: OpenDialogOptions) =>
      ipcRenderer.invoke('dialog:open', options),
    showSaveDialog: (options: SaveDialogOptions) =>
      ipcRenderer.invoke('dialog:save', options),
    showMessageBox: (options: MessageBoxOptions) =>
      ipcRenderer.invoke('dialog:message', options),
  } as DialogAPI,

  code: {
    exportModel: (model: object, options?: object) =>
      ipcRenderer.invoke('code:exportModel', model, options),
  },

  app: {
    getVersion: () => ipcRenderer.sendSync('app:version'),
    getPlatform: () => process.platform,
    getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),
    writeDiag: (content: string) => ipcRenderer.invoke('app:writeDiag', content),
    onSimulationProgress: (callback: (progress: SimulationProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: SimulationProgress) => callback(progress);
      ipcRenderer.on('simulation:progress', handler);
      return () => ipcRenderer.removeListener('simulation:progress', handler);
    },
    onSimulationEvent: (callback: (event: SimulationEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, simEvent: SimulationEvent) => callback(simEvent);
      ipcRenderer.on('simulation:event', handler);
      return () => ipcRenderer.removeListener('simulation:event', handler);
    },
    onSyncUpdate: (callback: (status: SyncStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: SyncStatus) => callback(status);
      ipcRenderer.on('sync:update', handler);
      return () => ipcRenderer.removeListener('sync:update', handler);
    },
    onMenuAction: (callback: (action: string, payload?: unknown) => void) => {
      const actions = ['menu:new-model', 'menu:save-model', 'menu:navigate'];
      const handlers = actions.map((action) => {
        const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(action, args[0]);
        ipcRenderer.on(action, handler);
        return { action, handler };
      });
      return () => {
        for (const { action, handler } of handlers) {
          ipcRenderer.removeListener(action, handler);
        }
      };
    },
  } as AppAPI,

  artifacts: {
    saveRunBundle: (bundle: {
      folderName: string;
      files: Array<{ name: string; content: string; encoding?: string }>;
    }) => ipcRenderer.invoke('artifacts:saveRunBundle', bundle),
    openRunFolder: (folderPath: string) =>
      ipcRenderer.invoke('artifacts:openRunFolder', folderPath),
    listRuns: () => ipcRenderer.invoke('artifacts:listRuns'),
    loadRunFrames: (runPath: string) =>
      ipcRenderer.invoke('artifacts:loadRunFrames', runPath),
    loadRunEventLog: (runPath: string) =>
      ipcRenderer.invoke('artifacts:loadRunEventLog', runPath),
  },

  help: {
    open: () => ipcRenderer.invoke('help:open'),
  },

  window: {
    createPopout: () => ipcRenderer.invoke('window:create-popout'),
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugin:list'),
    enable: (name: string) => ipcRenderer.invoke('plugin:enable', name),
    disable: (name: string) => ipcRenderer.invoke('plugin:disable', name),
    getLogs: (name: string) => ipcRenderer.invoke('plugin:logs', name),
    reload: () => ipcRenderer.invoke('plugin:reload'),
    openFolder: () => ipcRenderer.invoke('plugin:openFolder'),
  },
});
