import { create } from 'zustand';
import { WAREHOUSE_DEFAULTS } from '../utils/warehouseDefaults';
import type { FactoryModel, Station, Buffer, Connection, Product, Resource, Template, ExtraNodeEntry, ExtraNodeData, NodeType, Order, LayoutData, TransportWaypoint, TransportLane } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { autoLayout } from '../services/autoLayout';
import { autoAssignLibraryModels } from '../services/modelAutoAssign';

// Debounced history saving — batches rapid edits into a single snapshot
let _historyTimer: ReturnType<typeof setTimeout> | null = null;
const HISTORY_DEBOUNCE_MS = 500;

function debouncedSaveToHistory(save: () => void) {
  if (_historyTimer) clearTimeout(_historyTimer);
  _historyTimer = setTimeout(save, HISTORY_DEBOUNCE_MS);
}


interface SavedModelSummary {
  id: string;
  name: string;
  description?: string;
  stationCount: number;
  updatedAt: string;
}

interface ModelState {
  // Current model
  model: FactoryModel;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // History for undo/redo
  history: FactoryModel[];
  historyIndex: number;

  // Templates
  templates: Template[];

  // Saved models
  savedModels: SavedModelSummary[];

  // Actions - Model
  setModel: (model: FactoryModel) => void;
  resetModel: () => void;
  loadTemplate: (template: Template) => void;
  setModelName: (name: string) => void;
  applyAutoLayout: () => void;
  saveModel: () => Promise<void>;
  loadSavedModel: (id: string) => Promise<void>;
  listSavedModels: () => Promise<void>;
  deleteSavedModel: (id: string) => Promise<void>;

  // Actions - Stations
  addStation: (station: Partial<Station>) => void;
  updateStation: (id: string, updates: Partial<Station>) => void;
  removeStation: (id: string) => void;

  // Actions - Buffers
  addBuffer: (buffer: Partial<Buffer>) => void;
  updateBuffer: (id: string, updates: Partial<Buffer>) => void;
  removeBuffer: (id: string) => void;

  // Actions - Connections
  addConnection: (connection: Partial<Connection>) => void;
  removeConnection: (id: string) => void;

  // Actions - Products
  addProduct: (product: Partial<Product>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  removeProduct: (id: string) => void;

  // Actions - Resources
  addResource: (resource: Partial<Resource>) => void;
  updateResource: (id: string, updates: Partial<Resource>) => void;
  removeResource: (id: string) => void;

  // Actions - Orders
  addOrder: (order: Partial<Order>) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  removeOrder: (id: string) => void;
  setOrders: (orders: Order[]) => void;

  // Actions - Extra Nodes
  addExtraNode: (type: NodeType, data: Partial<ExtraNodeData>, position: { x: number; y: number }) => void;
  updateExtraNode: (id: string, updates: Partial<ExtraNodeData>) => void;
  updateExtraNodePosition: (id: string, position: { x: number; y: number }) => void;
  removeExtraNode: (id: string) => void;

  // Actions - Visual Customization
  setLibraryModelId: (nodeId: string, libraryModelId: string | undefined) => void;

  // Actions - Background Image
  setBackgroundImage: (image: string | undefined) => void;
  setBackgroundSettings: (settings: Partial<Pick<LayoutData, 'backgroundOpacity' | 'backgroundScale' | 'backgroundOffsetX' | 'backgroundOffsetY' | 'backgroundLocked'>>) => void;

  // Actions - Transport Network
  addWaypoint: (waypoint: TransportWaypoint) => void;
  updateWaypoint: (id: string, updates: Partial<TransportWaypoint>) => void;
  removeWaypoint: (id: string) => void;
  addLane: (lane: TransportLane) => void;
  updateLane: (id: string, updates: Partial<TransportLane>) => void;
  removeLane: (id: string) => void;
  setTransportNetworkEnabled: (enabled: boolean) => void;

  // Actions - Selection
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

const createEmptyModel = (): FactoryModel => ({
  name: 'New Factory Model',
  description: '',
  stations: [],
  buffers: [],
  connections: [],
  products: [],
  resources: [],
  extraNodes: [
    { id: 'default-source', type: 'source', data: { id: 'default-source', name: 'Source', arrivalRate: 120, feedMode: 'interval' }, position: { x: 50, y: 300 } },
    { id: 'default-sink', type: 'sink', data: { id: 'default-sink', name: 'Sink' }, position: { x: 1100, y: 300 } },
  ],
  orders: [],
  layout: {
    width: 1200,
    height: 800,
    gridSize: 20,
  },
});

function getDefaultExtraNodeData(type: NodeType, id: string): ExtraNodeData {
  const name = `${type.charAt(0).toUpperCase() + type.slice(1)}`;
  switch (type) {
    case 'source':
      return { id, name, arrivalRate: 120, feedMode: 'interval' };
    case 'sink':
      return { id, name };
    case 'conveyor':
      return { id, name, length: 10, speed: 1, capacity: 10 };
    case 'operator':
      return { id, name, count: 1, efficiency: 100, skill: 'General' };
    case 'inspection':
      return { id, name, inspectionTime: 30, defectRate: 2, inspectionType: 'visual' };
    case 'assembly':
      return { id, name, cycleTime: 60, inputParts: 2 };
    case 'splitter':
      return { id, name, outputs: 2, splitType: 'equal' };
    case 'merge':
      return { id, name, inputs: 2, mergeType: 'fifo' };
    case 'disassembly':
      return { id, name: 'Disassembly', cycleTime: 30, outputParts: [] };
    case 'palletize':
      return { id, name: 'Palletize', defaultPalletSize: 10, cycleTime: 15 };
    case 'depalletize':
      return { id, name: 'Depalletize', cycleTime: 5 };
    case 'matchbuffer':
      return { id, name: 'Match Buffer', capacity: 20, matchKey: 'order', requiredParts: [] };
    case 'agv':
      return { id, name: 'AGV', count: 1, speed: 1.5, capacity: 1 };
    case 'roboticcell':
      return { id, name: 'Robotic Cell', cycleTime: 30 };
    case 'humanoid':
      return { id, name: 'Humanoid', count: 1, efficiency: 100, skill: 'General' };
    case 'warehouse':
      return { id, name: 'Warehouse', ...structuredClone(WAREHOUSE_DEFAULTS) };
    case 'loadingdock':
      return { id, name: 'Loading Dock', dockCount: 2, loadTime: 1800, unloadTime: 1200, truckArrivalRate: 3600, mode: 'both' };
    case 'crane':
      return { id, name: 'Crane', craneType: 'bridge', liftCapacity: 5000, travelSpeed: 1.0, liftSpeed: 0.3, spanWidth: 15 };
    case 'forklift':
      return { id, name: 'Forklift', count: 1, liftCapacity: 2500, speed: 2.5, liftHeight: 6 };
    case 'coldstorage':
      return { id, name: 'Cold Storage', capacity: 200, temperature: -20, putTime: 60, pickTime: 45 };
    case 'press':
      return { id, name: 'Press', cycleTime: 15, tonnage: 200, setupTime: 600, scrapRate: 0.02 };
    case 'lasercutter':
      return { id, name: 'Laser Cutter', cycleTime: 45, sheetSize: '1500x3000', laserPower: 4000, setupTime: 300 };
    case 'weldingcell':
      return { id, name: 'Welding Cell', cycleTime: 60, weldType: 'MIG', fixtureCount: 2, setupTime: 180 };
    case 'paintbooth':
      return { id, name: 'Paint Booth', cycleTime: 120, cureTime: 300, boothType: 'spray', batchSize: 4 };
    case 'packager':
      return { id, name: 'Packager', cycleTime: 20, packType: 'stretchwrap', unitsPerPack: 1 };
    case 'washer':
      return { id, name: 'Washer', cycleTime: 180, batchSize: 8, washType: 'aqueous', temperature: 55 };
    case 'cncmachine':
      return { id, name: 'CNC Machine', cycleTime: 45, toolChangeTime: 12, spindleSpeed: 8000, machineType: 'mill' };
    case 'oven':
      return { id, name: 'Oven', rampUpTime: 300, holdTime: 1800, coolDownTime: 600, batchSize: 20, temperature: 200 };
    case 'injectionmolder':
      return { id, name: 'Injection Molder', cycleTime: 30, cavityCount: 4, coolingTime: 15, clampForce: 250 };
    case 'sortingstation':
      return { id, name: 'Sorting Station', outputs: 3, scanTime: 0.5, divertSpeed: 60, sortMode: 'barcode' };
    case 'accumulator':
      return { id, name: 'Accumulator', capacity: 50, releaseSize: 10, releaseInterval: 60, mode: 'batch' };
    case 'turntable':
      return { id, name: 'Turntable', rotationTime: 3, transferTime: 2, positions: 4 };
    case 'elevator':
      return { id, name: 'Elevator', loadTime: 5, unloadTime: 5, travelSpeed: 0.5, floors: 3, floorHeight: 4 };
    case 'overheadconveyor':
      return { id, name: 'Overhead Conveyor', carrierCount: 10, carrierSpeed: 0.5, loadTime: 8, unloadTime: 8, trackLength: 50 };
    case 'sorter':
      return { id, name: 'Sorter', sortDelay: 1, errorRate: 0.01, outputs: 4 };
    case 'shuttle':
      return { id, name: 'Shuttle', travelSpeed: 2, laneCount: 4, loadTime: 5, unloadTime: 5 };
    case 'rollerconveyor':
      return { id, name: 'Roller Conveyor', length: 10, speed: 0.5, capacity: 20 };
    case 'trackguidedvehicle':
      return { id, name: 'Track Guided Vehicle', count: 2, speed: 1.5, capacity: 1, trackLength: 100 };
    case 'crossover':
      return { id, name: 'Crossover', transferTime: 2, laneCount: 2 };
    case 'pickstation':
      return { id, name: 'Pick Station', pickerCount: 2, pickTime: 5, errorRate: 0.02 };
    case 'weighing':
      return { id, name: 'Weighing', measureTime: 3, rejectRate: 0.01 };
    case 'labeler':
      return { id, name: 'Labeler', labelTime: 2, errorRate: 0.005 };
    default:
      return { id, name };
  }
}

export const useModelStore = create<ModelState>((set, get) => ({
  model: createEmptyModel(),
  selectedNodeId: null,
  selectedEdgeId: null,
  history: [],
  historyIndex: -1,
  templates: [],
  savedModels: [],

  // Model actions
  setModel: (model) => {
    set({ model, selectedNodeId: null, selectedEdgeId: null });
    get().saveToHistory();
  },

  resetModel: () => {
    set({
      model: createEmptyModel(),
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [],
      historyIndex: -1,
    });
  },

  loadTemplate: (template) => {
    const model: FactoryModel = {
      ...createEmptyModel(),
      name: template.name,
      description: template.description,
      ...template.template,
    };
    // Auto-assign 3D library models so the template renders with diverse,
    // visually distinct geometry in 3D World instead of all stations falling
    // back to the same default. User-set libraryModelIds are preserved.
    autoAssignLibraryModels(model);
    set({ model, selectedNodeId: null, selectedEdgeId: null });
    get().applyAutoLayout();
  },

  applyAutoLayout: () => {
    const { model } = get();
    const positions = autoLayout(
      model.stations,
      model.buffers,
      model.extraNodes,
      model.connections
    );
    set((state) => ({
      model: {
        ...state.model,
        stations: state.model.stations.map((s) => {
          const pos = positions.get(s.id);
          return pos ? { ...s, position: pos } : s;
        }),
        buffers: state.model.buffers.map((b) => {
          const pos = positions.get(b.id);
          return pos ? { ...b, position: pos } : b;
        }),
        extraNodes: state.model.extraNodes.map((n) => {
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }),
      },
    }));
    get().saveToHistory();
  },

  setModelName: (name: string) => {
    set((state) => ({
      model: { ...state.model, name },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  saveModel: async () => {
    const { model } = get();
    const modelToSave = { ...model };
    if (!modelToSave.id) {
      modelToSave.id = uuidv4();
      set({ model: modelToSave });
    }

    // Try Electron IPC first
    try {
      const win = window as unknown as { factorySim?: { model?: { saveModel?: (m: FactoryModel) => Promise<string> } } };
      if (win.factorySim?.model?.saveModel) {
        await win.factorySim.model.saveModel(modelToSave);
        return;
      }
    } catch { /* fallback to localStorage */ }

    // localStorage fallback
    const key = `factorysim-models-${modelToSave.id}`;
    localStorage.setItem(key, JSON.stringify(modelToSave));

    // Update index
    const indexKey = 'factorysim-model-index';
    let index: SavedModelSummary[] = [];
    try {
      const existing = localStorage.getItem(indexKey);
      if (existing) index = JSON.parse(existing);
    } catch { /* ignore */ }

    const summary: SavedModelSummary = {
      id: modelToSave.id!,
      name: modelToSave.name,
      description: modelToSave.description,
      stationCount: modelToSave.stations.length,
      updatedAt: new Date().toISOString(),
    };

    const existingIdx = index.findIndex((m) => m.id === modelToSave.id);
    if (existingIdx >= 0) {
      index[existingIdx] = summary;
    } else {
      index.push(summary);
    }
    localStorage.setItem(indexKey, JSON.stringify(index));
  },

  loadSavedModel: async (id: string) => {
    // Try Electron IPC first
    try {
      const win = window as unknown as { factorySim?: { model?: { loadModel?: (id: string) => Promise<FactoryModel> } } };
      if (win.factorySim?.model?.loadModel) {
        const loaded = await win.factorySim.model.loadModel(id);
        get().setModel(loaded);
        return;
      }
    } catch { /* fallback */ }

    // localStorage fallback
    const json = localStorage.getItem(`factorysim-models-${id}`);
    if (json) {
      const loaded = JSON.parse(json) as FactoryModel;
      get().setModel(loaded);
    }
  },

  listSavedModels: async () => {
    // Try Electron IPC first
    try {
      const win = window as unknown as { factorySim?: { model?: { listModels?: () => Promise<SavedModelSummary[]> } } };
      if (win.factorySim?.model?.listModels) {
        const models = await win.factorySim.model.listModels();
        set({ savedModels: models });
        return;
      }
    } catch { /* fallback */ }

    // localStorage fallback
    try {
      const indexJson = localStorage.getItem('factorysim-model-index');
      if (indexJson) {
        set({ savedModels: JSON.parse(indexJson) });
      }
    } catch { /* ignore */ }
  },

  deleteSavedModel: async (id: string) => {
    // Try Electron IPC first
    try {
      const win = window as unknown as { factorySim?: { model?: { deleteModel?: (id: string) => Promise<void> } } };
      if (win.factorySim?.model?.deleteModel) {
        await win.factorySim.model.deleteModel(id);
        set((state) => ({
          savedModels: state.savedModels.filter((m) => m.id !== id),
        }));
        return;
      }
    } catch { /* fallback */ }

    // localStorage fallback
    localStorage.removeItem(`factorysim-models-${id}`);
    try {
      const indexJson = localStorage.getItem('factorysim-model-index');
      if (indexJson) {
        const index = JSON.parse(indexJson) as SavedModelSummary[];
        const updated = index.filter((m) => m.id !== id);
        localStorage.setItem('factorysim-model-index', JSON.stringify(updated));
        set({ savedModels: updated });
      }
    } catch { /* ignore */ }
  },

  // Station actions
  addStation: (station) => {
    const newStation: Station = {
      id: station.id || uuidv4(),
      name: station.name || `Station ${get().model.stations.length + 1}`,
      cycleTime: station.cycleTime || { type: 'constant', parameters: { value: 60 } },
      position: station.position || { x: 100, y: 100 },
      ...station,
    };

    set((state) => ({
      model: {
        ...state.model,
        stations: [...state.model.stations, newStation],
      },
    }));
    get().saveToHistory();
  },

  updateStation: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        stations: state.model.stations.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeStation: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        stations: state.model.stations.filter((s) => s.id !== id),
        connections: state.model.connections.filter(
          (c) => c.source !== id && c.target !== id
        ),
      },
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
    get().saveToHistory();
  },

  // Buffer actions
  addBuffer: (buffer) => {
    const newBuffer: Buffer = {
      id: buffer.id || uuidv4(),
      name: buffer.name || `Buffer ${get().model.buffers.length + 1}`,
      capacity: buffer.capacity || 10,
      queueRule: buffer.queueRule || 'FIFO',
      position: buffer.position || { x: 100, y: 100 },
      ...buffer,
    };

    set((state) => ({
      model: {
        ...state.model,
        buffers: [...state.model.buffers, newBuffer],
      },
    }));
    get().saveToHistory();
  },

  updateBuffer: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        buffers: state.model.buffers.map((b) =>
          b.id === id ? { ...b, ...updates } : b
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeBuffer: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        buffers: state.model.buffers.filter((b) => b.id !== id),
        connections: state.model.connections.filter(
          (c) => c.source !== id && c.target !== id
        ),
      },
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
    get().saveToHistory();
  },

  // Connection actions
  addConnection: (connection) => {
    const newConnection: Connection = {
      id: connection.id || uuidv4(),
      source: connection.source!,
      target: connection.target!,
      probability: connection.probability,
    };

    // Check if connection already exists
    const exists = get().model.connections.some(
      (c) => c.source === newConnection.source && c.target === newConnection.target
    );

    if (!exists) {
      set((state) => ({
        model: {
          ...state.model,
          connections: [...state.model.connections, newConnection],
        },
      }));
      get().saveToHistory();
    }
  },

  removeConnection: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        connections: state.model.connections.filter((c) => c.id !== id),
      },
      selectedEdgeId: state.selectedEdgeId === id ? null : state.selectedEdgeId,
    }));
    get().saveToHistory();
  },

  // Product actions
  addProduct: (product) => {
    const newProduct: Product = {
      id: product.id || uuidv4(),
      name: product.name || `Product ${get().model.products.length + 1}`,
      routing: product.routing || [],
      arrivalRate: product.arrivalRate,
      priority: product.priority || 0,
    };

    set((state) => ({
      model: {
        ...state.model,
        products: [...state.model.products, newProduct],
      },
    }));
    get().saveToHistory();
  },

  updateProduct: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        products: state.model.products.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeProduct: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        products: state.model.products.filter((p) => p.id !== id),
      },
    }));
    get().saveToHistory();
  },

  // Resource actions
  addResource: (resource) => {
    const newResource: Resource = {
      id: resource.id || uuidv4(),
      name: resource.name || `Resource ${get().model.resources.length + 1}`,
      type: resource.type || 'operator',
      capacity: resource.capacity || 1,
      shifts: resource.shifts,
      skills: resource.skills,
    };

    set((state) => ({
      model: {
        ...state.model,
        resources: [...state.model.resources, newResource],
      },
    }));
    get().saveToHistory();
  },

  updateResource: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        resources: state.model.resources.map((r) =>
          r.id === id ? { ...r, ...updates } : r
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeResource: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        resources: state.model.resources.filter((r) => r.id !== id),
      },
    }));
    get().saveToHistory();
  },

  // Order actions
  addOrder: (order) => {
    const newOrder: Order = {
      id: order.id || uuidv4(),
      productId: order.productId || '',
      quantity: order.quantity || 1,
      priority: order.priority || 'medium',
      dueDate: order.dueDate || new Date().toISOString().slice(0, 10),
      status: order.status || 'pending',
      isWip: order.isWip || false,
      initialStationId: order.initialStationId,
    };

    set((state) => ({
      model: {
        ...state.model,
        orders: [...(state.model.orders || []), newOrder],
      },
    }));
    get().saveToHistory();
  },

  updateOrder: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        orders: (state.model.orders || []).map((o) =>
          o.id === id ? { ...o, ...updates } : o
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeOrder: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        orders: (state.model.orders || []).filter((o) => o.id !== id),
      },
    }));
    get().saveToHistory();
  },

  setOrders: (orders) => {
    set((state) => ({
      model: {
        ...state.model,
        orders,
      },
    }));
    get().saveToHistory();
  },

  // Extra Node actions
  addExtraNode: (type, data, position) => {
    const id = data.id || uuidv4();
    const defaults = getDefaultExtraNodeData(type, id);
    const entry: ExtraNodeEntry = {
      id,
      type,
      data: { ...defaults, ...data, id } as ExtraNodeData,
      position,
    };

    set((state) => ({
      model: {
        ...state.model,
        extraNodes: [...state.model.extraNodes, entry],
      },
    }));
    get().saveToHistory();
  },

  updateExtraNode: (id, updates) => {
    set((state) => ({
      model: {
        ...state.model,
        extraNodes: state.model.extraNodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } as ExtraNodeData } : n
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  updateExtraNodePosition: (id, position) => {
    set((state) => ({
      model: {
        ...state.model,
        extraNodes: state.model.extraNodes.map((n) =>
          n.id === id ? { ...n, position } : n
        ),
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeExtraNode: (id) => {
    set((state) => ({
      model: {
        ...state.model,
        extraNodes: state.model.extraNodes.filter((n) => n.id !== id),
        connections: state.model.connections.filter(
          (c) => c.source !== id && c.target !== id
        ),
      },
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
    get().saveToHistory();
  },

  // Visual Customization
  setLibraryModelId: (nodeId, libraryModelId) => {
    set((state) => {
      const model = { ...state.model };
      // Check stations
      const sIdx = model.stations.findIndex((s) => s.id === nodeId);
      if (sIdx >= 0) {
        model.stations = model.stations.map((s) =>
          s.id === nodeId ? { ...s, libraryModelId } : s
        );
        return { model };
      }
      // Check buffers
      const bIdx = model.buffers.findIndex((b) => b.id === nodeId);
      if (bIdx >= 0) {
        model.buffers = model.buffers.map((b) =>
          b.id === nodeId ? { ...b, libraryModelId } : b
        );
        return { model };
      }
      // Check extra nodes
      model.extraNodes = model.extraNodes.map((n) =>
        n.id === nodeId ? { ...n, libraryModelId } : n
      );
      return { model };
    });
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  // Background Image actions
  setBackgroundImage: (image) => {
    set((state) => ({
      model: {
        ...state.model,
        layout: { ...state.model.layout, backgroundImage: image },
      },
    }));
    get().saveToHistory();
  },

  setBackgroundSettings: (settings) => {
    set((state) => ({
      model: {
        ...state.model,
        layout: { ...state.model.layout, ...settings },
      },
    }));
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  // Transport Network actions
  addWaypoint: (waypoint) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            waypoints: [...network.waypoints, waypoint],
          },
        },
      };
    });
    get().saveToHistory();
  },

  updateWaypoint: (id, updates) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            waypoints: network.waypoints.map((w) =>
              w.id === id ? { ...w, ...updates } : w
            ),
          },
        },
      };
    });
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeWaypoint: (id) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            waypoints: network.waypoints.filter((w) => w.id !== id),
          },
        },
      };
    });
    get().saveToHistory();
  },

  addLane: (lane) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            lanes: [...network.lanes, lane],
          },
        },
      };
    });
    get().saveToHistory();
  },

  updateLane: (id, updates) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            lanes: network.lanes.map((l) =>
              l.id === id ? { ...l, ...updates } : l
            ),
          },
        },
      };
    });
    debouncedSaveToHistory(() => get().saveToHistory());
  },

  removeLane: (id) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            lanes: network.lanes.filter((l) => l.id !== id),
          },
        },
      };
    });
    get().saveToHistory();
  },

  setTransportNetworkEnabled: (enabled) => {
    set((state) => {
      const network = state.model.transportNetwork || { waypoints: [], lanes: [], enabled: false };
      return {
        model: {
          ...state.model,
          transportNetwork: {
            ...network,
            enabled,
          },
        },
      };
    });
    get().saveToHistory();
  },

  // Selection actions
  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  // History actions
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      set({
        model: history[historyIndex - 1],
        historyIndex: historyIndex - 1,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      set({
        model: history[historyIndex + 1],
        historyIndex: historyIndex + 1,
      });
    }
  },

  saveToHistory: () => {
    const { model, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    // Use structuredClone when available (faster, handles more types),
    // fall back to JSON round-trip for older environments.
    const snapshot = typeof structuredClone === 'function'
      ? structuredClone(model)
      : JSON.parse(JSON.stringify(model));
    newHistory.push(snapshot);

    // Limit history to 50 entries to prevent unbounded memory growth
    if (newHistory.length > 50) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
}));
