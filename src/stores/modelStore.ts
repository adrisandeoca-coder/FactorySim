import { create } from 'zustand';
import type { FactoryModel, Station, Buffer, Connection, Product, Resource, Template, ExtraNodeEntry, ExtraNodeData, NodeType, Order } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { autoLayout } from '../services/autoLayout';

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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    get().saveToHistory();
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
    newHistory.push(JSON.parse(JSON.stringify(model)));

    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
}));
