import { create } from 'zustand';

// ════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════

export type DataSourceType = 'csv' | 'database' | 'rest-api' | 'mqtt' | 'opcua' | 'manual';

export interface DataField {
  id: string;
  name: string;
  type: 'number' | 'string' | 'boolean' | 'datetime';
  unit?: string;        // e.g., 'seconds', 'items/hr', '°C'
  sampleValue?: string; // preview value
}

export interface DataSourceNode {
  id: string;
  kind: 'data-source';
  name: string;
  sourceType: DataSourceType;
  fields: DataField[];
  config: Record<string, unknown>; // connection-specific config
  position: { x: number; y: number };
}

export type TransformType =
  | 'field-map'      // direct 1:1 field mapping
  | 'formula'        // computed field (e.g., "cycleTime * 1.1")
  | 'filter'         // conditional filter
  | 'aggregate'      // group-by / average / sum
  | 'lookup'         // lookup table
  | 'unit-convert'   // unit conversion
  | 'split'          // split one field into many
  | 'merge-fields';  // merge many fields into one

export interface TransformNode {
  id: string;
  kind: 'transform';
  name: string;
  transformType: TransformType;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export type TargetParameter =
  | 'cycleTime'
  | 'setupTime'
  | 'mtbf'
  | 'mttr'
  | 'scrapRate'
  | 'batchSize'
  | 'capacity'
  | 'interArrivalTime'
  | 'speed'
  | 'inspectionTime'
  | 'assemblyTime'
  | 'custom';

export interface ModelTargetNode {
  id: string;
  kind: 'model-target';
  modelEntityId: string;  // station/buffer/extraNode id
  modelEntityName: string;
  modelEntityType: string; // 'station' | 'buffer' | etc.
  parameters: TargetParameter[];
  position: { x: number; y: number };
}

export type ConnectorNode = DataSourceNode | TransformNode | ModelTargetNode;

export interface DataMapping {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;  // field id or output handle
  targetNodeId: string;
  targetHandle: string;  // parameter name or input handle
}

export interface DataConnectorPipeline {
  id: string;
  name: string;
  description?: string;
  nodes: ConnectorNode[];
  mappings: DataMapping[];
  enabled: boolean;
  lastRun?: string;
  schedule?: string; // cron expression
}

// ════════════════════════════════════════════════════════════════════════
// Store
// ════════════════════════════════════════════════════════════════════════

interface DataConnectorState {
  pipelines: DataConnectorPipeline[];
  activePipelineId: string | null;

  // Actions
  addPipeline: (pipeline: Partial<DataConnectorPipeline>) => string;
  updatePipeline: (id: string, updates: Partial<DataConnectorPipeline>) => void;
  removePipeline: (id: string) => void;
  setActivePipeline: (id: string | null) => void;

  // Node actions
  addNode: (pipelineId: string, node: ConnectorNode) => void;
  updateNode: (pipelineId: string, nodeId: string, updates: Partial<ConnectorNode>) => void;
  updateNodePosition: (pipelineId: string, nodeId: string, position: { x: number; y: number }) => void;
  removeNode: (pipelineId: string, nodeId: string) => void;

  // Mapping actions
  addMapping: (pipelineId: string, mapping: DataMapping) => void;
  removeMapping: (pipelineId: string, mappingId: string) => void;
}

let _idCounter = 0;
function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

export const useDataConnectorStore = create<DataConnectorState>((set) => ({
  pipelines: [],
  activePipelineId: null,

  addPipeline: (partial) => {
    const id = genId('pipeline');
    const pipeline: DataConnectorPipeline = {
      id,
      name: partial.name || 'New Pipeline',
      description: partial.description,
      nodes: partial.nodes || [],
      mappings: partial.mappings || [],
      enabled: partial.enabled ?? true,
      lastRun: partial.lastRun,
      schedule: partial.schedule,
    };
    set((s) => ({
      pipelines: [...s.pipelines, pipeline],
      activePipelineId: id,
    }));
    return id;
  },

  updatePipeline: (id, updates) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  removePipeline: (id) => {
    set((s) => ({
      pipelines: s.pipelines.filter((p) => p.id !== id),
      activePipelineId: s.activePipelineId === id ? null : s.activePipelineId,
    }));
  },

  setActivePipeline: (id) => set({ activePipelineId: id }),

  addNode: (pipelineId, node) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId ? { ...p, nodes: [...p.nodes, node] } : p
      ),
    }));
  },

  updateNode: (pipelineId, nodeId, updates) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId ? { ...n, ...updates } as ConnectorNode : n
              ),
            }
          : p
      ),
    }));
  },

  updateNodePosition: (pipelineId, nodeId, position) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId ? { ...n, position } : n
              ),
            }
          : p
      ),
    }));
  },

  removeNode: (pipelineId, nodeId) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? {
              ...p,
              nodes: p.nodes.filter((n) => n.id !== nodeId),
              mappings: p.mappings.filter(
                (m) => m.sourceNodeId !== nodeId && m.targetNodeId !== nodeId
              ),
            }
          : p
      ),
    }));
  },

  addMapping: (pipelineId, mapping) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? { ...p, mappings: [...p.mappings, mapping] }
          : p
      ),
    }));
  },

  removeMapping: (pipelineId, mappingId) => {
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? { ...p, mappings: p.mappings.filter((m) => m.id !== mappingId) }
          : p
      ),
    }));
  },
}));
