import React, { useCallback, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  NodeTypes,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  ReactFlowInstance,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useModelStore } from '../../stores/modelStore';
import {
  useDataConnectorStore,
  type DataSourceNode,
  type TransformNode,
  type ModelTargetNode,
  type DataSourceType,
  type TransformType,
  type DataField,
} from '../../stores/dataConnectorStore';
import {
  FileText,
  Database,
  Globe,
  Wifi,
  Cpu,
  Edit3,
  ArrowRightLeft,
  Filter,
  Layers,
  Search,
  SplitSquareVertical,
  Merge,
  Box,
  Play,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════════════

const SOURCE_TYPE_CONFIG: Record<DataSourceType, { label: string; color: string; bgColor: string; Icon: React.FC<{ className?: string }> }> = {
  'csv':       { label: 'CSV / Excel',  color: '#059669', bgColor: '#ecfdf5', Icon: (p) => <FileText {...p} /> },
  'database':  { label: 'Database',     color: '#7c3aed', bgColor: '#f5f3ff', Icon: (p) => <Database {...p} /> },
  'rest-api':  { label: 'REST API',     color: '#2563eb', bgColor: '#eff6ff', Icon: (p) => <Globe {...p} /> },
  'mqtt':      { label: 'MQTT',         color: '#d97706', bgColor: '#fffbeb', Icon: (p) => <Wifi {...p} /> },
  'opcua':     { label: 'OPC-UA',       color: '#dc2626', bgColor: '#fef2f2', Icon: (p) => <Cpu {...p} /> },
  'manual':    { label: 'Manual Input', color: '#6b7280', bgColor: '#f9fafb', Icon: (p) => <Edit3 {...p} /> },
};

const TRANSFORM_TYPE_CONFIG: Record<TransformType, { label: string; Icon: React.FC<{ className?: string }> }> = {
  'field-map':     { label: 'Field Map',     Icon: (p) => <ArrowRightLeft {...p} /> },
  'formula':       { label: 'Formula',       Icon: (p) => <Zap {...p} /> },
  'filter':        { label: 'Filter',        Icon: (p) => <Filter {...p} /> },
  'aggregate':     { label: 'Aggregate',     Icon: (p) => <Layers {...p} /> },
  'lookup':        { label: 'Lookup',        Icon: (p) => <Search {...p} /> },
  'unit-convert':  { label: 'Unit Convert',  Icon: (p) => <ArrowRightLeft {...p} /> },
  'split':         { label: 'Split',         Icon: (p) => <SplitSquareVertical {...p} /> },
  'merge-fields':  { label: 'Merge Fields',  Icon: (p) => <Merge {...p} /> },
};

const MODEL_PARAM_LABELS: Record<string, string> = {
  cycleTime: 'Cycle Time',
  setupTime: 'Setup Time',
  mtbf: 'MTBF',
  mttr: 'MTTR',
  scrapRate: 'Scrap Rate',
  batchSize: 'Batch Size',
  capacity: 'Capacity',
  interArrivalTime: 'Inter-Arrival Time',
  speed: 'Speed',
  inspectionTime: 'Inspection Time',
  assemblyTime: 'Assembly Time',
  custom: 'Custom',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  station: 'Station',
  buffer: 'Buffer',
  source: 'Source',
  sink: 'Sink',
  conveyor: 'Conveyor',
  operator: 'Operator',
  inspection: 'Inspection',
  assembly: 'Assembly',
  splitter: 'Splitter',
  merge: 'Merge',
};

// ════════════════════════════════════════════════════════════════════════
// Custom ReactFlow Nodes
// ════════════════════════════════════════════════════════════════════════

// ── Data Source Node ──

function DataSourceNodeComponent({ data, selected }: NodeProps) {
  const cfg = SOURCE_TYPE_CONFIG[data.sourceType as DataSourceType] || SOURCE_TYPE_CONFIG.manual;
  const fields: DataField[] = data.fields || [];

  return (
    <div
      className={`rounded-xl border-2 shadow-lg min-w-[220px] transition-all ${
        selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''
      }`}
      style={{ borderColor: cfg.color, backgroundColor: cfg.bgColor }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[10px]"
        style={{ backgroundColor: cfg.color }}
      >
        <cfg.Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white truncate flex-1">
          {data.label || cfg.label}
        </span>
        <span className="text-[10px] text-white/70 uppercase tracking-wider">Source</span>
      </div>

      {/* Config preview */}
      {data.configPreview && (
        <div className="px-3 py-1 text-[10px] text-gray-500 border-b" style={{ borderColor: `${cfg.color}30` }}>
          {data.configPreview}
        </div>
      )}

      {/* Fields (output handles) */}
      <div className="px-1 py-1.5">
        {fields.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-1 italic">No fields defined</div>
        ) : (
          fields.map((field) => (
            <div key={field.id} className="relative flex items-center justify-between px-2 py-1 group">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-white/50 text-gray-500 border border-gray-200">
                  {field.type === 'number' ? '#' : field.type === 'string' ? 'Aa' : field.type === 'boolean' ? '?' : '📅'}
                </span>
                <span className="text-xs text-gray-700 truncate">{field.name}</span>
              </div>
              {field.sampleValue && (
                <span className="text-[10px] text-gray-400 ml-2 truncate max-w-[60px]">{field.sampleValue}</span>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={field.id}
                className="!w-3 !h-3 !border-2 !border-white"
                style={{ background: cfg.color, right: -6 }}
              />
            </div>
          ))
        )}
      </div>

      {/* Input handle (for chaining) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !border-2 !border-white !bg-gray-400"
        style={{ left: -6 }}
      />
    </div>
  );
}

// ── Transform Node ──

function TransformNodeComponent({ data, selected }: NodeProps) {
  const cfg = TRANSFORM_TYPE_CONFIG[data.transformType as TransformType] || TRANSFORM_TYPE_CONFIG['field-map'];

  return (
    <div
      className={`rounded-xl border-2 border-amber-400 shadow-lg min-w-[180px] bg-amber-50 transition-all ${
        selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500 rounded-t-[10px]">
        <cfg.Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white truncate flex-1">
          {data.label || cfg.label}
        </span>
        <span className="text-[10px] text-white/70 uppercase tracking-wider">Transform</span>
      </div>

      {/* Config */}
      <div className="px-3 py-2 space-y-1">
        {data.formula && (
          <div className="text-xs font-mono bg-white/50 rounded px-2 py-1 text-amber-800 border border-amber-200">
            {data.formula}
          </div>
        )}
        {data.description && (
          <div className="text-[10px] text-gray-500">{data.description}</div>
        )}
        {!data.formula && !data.description && (
          <div className="text-xs text-gray-400 italic">Click to configure</div>
        )}
      </div>

      {/* Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !border-2 !border-white !bg-amber-500"
        style={{ left: -6 }}
      />
      {/* Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !border-2 !border-white !bg-amber-500"
        style={{ right: -6 }}
      />
    </div>
  );
}

// ── Model Target Node ──

function ModelTargetNodeComponent({ data, selected }: NodeProps) {
  const params: string[] = data.parameters || [];
  const entityType = data.modelEntityType || 'station';

  return (
    <div
      className={`rounded-xl border-2 border-blue-500 shadow-lg min-w-[220px] bg-blue-50 transition-all ${
        selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-t-[10px]">
        <Box className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white truncate flex-1">
          {data.label || 'Model Object'}
        </span>
        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
          {NODE_TYPE_LABELS[entityType] || entityType}
        </span>
      </div>

      {/* Entity info */}
      <div className="px-3 py-1 text-[10px] text-blue-600 border-b border-blue-200">
        ID: {data.modelEntityId}
      </div>

      {/* Parameter handles (inputs) */}
      <div className="px-1 py-1.5">
        {params.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-1 italic">No parameters mapped</div>
        ) : (
          params.map((param: string) => (
            <div key={param} className="relative flex items-center px-2 py-1 group">
              <Handle
                type="target"
                position={Position.Left}
                id={param}
                className="!w-3 !h-3 !border-2 !border-white !bg-blue-500"
                style={{ left: -6 }}
              />
              <span className="text-xs text-gray-700 ml-1">
                {MODEL_PARAM_LABELS[param] || param}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Output handle (for chaining to downstream) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !border-2 !border-white !bg-blue-400"
        style={{ right: -6 }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  'data-source': DataSourceNodeComponent,
  'transform': TransformNodeComponent,
  'model-target': ModelTargetNodeComponent,
};

// ════════════════════════════════════════════════════════════════════════
// Add Node Panel
// ════════════════════════════════════════════════════════════════════════

interface AddNodePanelProps {
  onAdd: (kind: string, subType: string) => void;
  onClose: () => void;
}

function AddNodePanel({ onAdd, onClose }: AddNodePanelProps) {
  const model = useModelStore((s) => s.model);
  const [tab, setTab] = useState<'sources' | 'transforms' | 'targets'>('sources');

  return (
    <div className="absolute top-14 left-4 z-20 bg-white rounded-xl shadow-2xl border border-gray-200 w-[340px] max-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Add Node</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['sources', 'transforms', 'targets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'sources' ? 'Data Sources' : t === 'transforms' ? 'Transforms' : 'Model Objects'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {tab === 'sources' && (
          <>
            {(Object.entries(SOURCE_TYPE_CONFIG) as [DataSourceType, typeof SOURCE_TYPE_CONFIG[DataSourceType]][]).map(
              ([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onAdd('data-source', key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors text-left"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: cfg.bgColor }}
                  >
                    <span style={{ color: cfg.color, display: 'flex' }}><cfg.Icon className="w-4 h-4" /></span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{cfg.label}</div>
                    <div className="text-[10px] text-gray-400">Add as data source</div>
                  </div>
                </button>
              )
            )}
          </>
        )}

        {tab === 'transforms' && (
          <>
            {(Object.entries(TRANSFORM_TYPE_CONFIG) as [TransformType, typeof TRANSFORM_TYPE_CONFIG[TransformType]][]).map(
              ([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onAdd('transform', key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50">
                    <cfg.Icon className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{cfg.label}</div>
                    <div className="text-[10px] text-gray-400">Add transform node</div>
                  </div>
                </button>
              )
            )}
          </>
        )}

        {tab === 'targets' && (
          <>
            <div className="text-xs text-gray-400 px-1 mb-2">
              Select a model object to map data to:
            </div>
            {/* Stations */}
            {model.stations.map((s) => (
              <button
                key={s.id}
                onClick={() => onAdd('model-target', `station:${s.id}:${s.name}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
                  <Box className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{s.name}</div>
                  <div className="text-[10px] text-gray-400">Station</div>
                </div>
              </button>
            ))}
            {/* Buffers */}
            {model.buffers.map((b) => (
              <button
                key={b.id}
                onClick={() => onAdd('model-target', `buffer:${b.id}:${b.name}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50">
                  <Layers className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{b.name}</div>
                  <div className="text-[10px] text-gray-400">Buffer</div>
                </div>
              </button>
            ))}
            {/* Extra Nodes */}
            {model.extraNodes.map((e) => (
              <button
                key={e.id}
                onClick={() => onAdd('model-target', `${e.type}:${e.id}:${e.data?.name || e.type}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50">
                  <Box className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{(e.data as any)?.name || e.type}</div>
                  <div className="text-[10px] text-gray-400 capitalize">{e.type}</div>
                </div>
              </button>
            ))}
            {model.stations.length === 0 && model.buffers.length === 0 && model.extraNodes.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-xs">
                No model objects found. Add stations/buffers in the Builder first.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Node Config Panel (right side)
// ════════════════════════════════════════════════════════════════════════

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (updates: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: () => void;
}

function NodeConfigPanel({ node, onUpdate, onClose, onDelete }: NodeConfigPanelProps) {
  const data = node.data;

  return (
    <div className="absolute top-14 right-4 z-20 bg-white rounded-xl shadow-2xl border border-gray-200 w-[300px] max-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Configure Node</h3>
        <div className="flex items-center gap-1">
          <button onClick={onDelete} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500" title="Delete node">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
          <input
            type="text"
            value={data.label || ''}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Data Source specific config */}
        {node.type === 'data-source' && (
          <DataSourceConfig data={data} onUpdate={onUpdate} />
        )}

        {/* Transform specific config */}
        {node.type === 'transform' && (
          <TransformConfig data={data} onUpdate={onUpdate} />
        )}

        {/* Model Target specific config */}
        {node.type === 'model-target' && (
          <ModelTargetConfig data={data} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}

function DataSourceConfig({ data, onUpdate }: { data: any; onUpdate: (u: Record<string, unknown>) => void }) {
  const fields: DataField[] = data.fields || [];

  const addField = () => {
    const newField: DataField = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `field_${fields.length + 1}`,
      type: 'number',
    };
    onUpdate({ fields: [...fields, newField] });
  };

  const updateField = (idx: number, updates: Partial<DataField>) => {
    const updated = fields.map((f, i) => (i === idx ? { ...f, ...updates } : f));
    onUpdate({ fields: updated });
  };

  const removeField = (idx: number) => {
    onUpdate({ fields: fields.filter((_: DataField, i: number) => i !== idx) });
  };

  return (
    <>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Source Type</label>
        <select
          value={data.sourceType || 'csv'}
          onChange={(e) => onUpdate({ sourceType: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {Object.entries(SOURCE_TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {data.sourceType === 'csv' && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">File Path / URL</label>
          <input
            type="text"
            value={data.configPreview || ''}
            onChange={(e) => onUpdate({ configPreview: e.target.value })}
            placeholder="/data/production.csv"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {data.sourceType === 'rest-api' && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Endpoint URL</label>
            <input
              type="text"
              value={data.configPreview || ''}
              onChange={(e) => onUpdate({ configPreview: e.target.value })}
              placeholder="https://api.example.com/data"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Method</label>
            <select
              value={(data.config as any)?.method || 'GET'}
              onChange={(e) => onUpdate({ config: { ...data.config, method: e.target.value } })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
        </>
      )}

      {data.sourceType === 'database' && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Connection String</label>
          <input
            type="text"
            value={data.configPreview || ''}
            onChange={(e) => onUpdate({ configPreview: e.target.value })}
            placeholder="postgresql://host/db"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {data.sourceType === 'mqtt' && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Topic</label>
          <input
            type="text"
            value={data.configPreview || ''}
            onChange={(e) => onUpdate({ configPreview: e.target.value })}
            placeholder="factory/machine/+/data"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {/* Fields */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">Output Fields</label>
          <button
            onClick={addField}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {fields.map((field: DataField, idx: number) => (
            <div key={field.id} className="flex items-center gap-1.5">
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField(idx, { name: e.target.value })}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
                placeholder="Field name"
              />
              <select
                value={field.type}
                onChange={(e) => updateField(idx, { type: e.target.value as DataField['type'] })}
                className="px-1.5 py-1.5 border border-gray-200 rounded text-xs w-20"
              >
                <option value="number">#</option>
                <option value="string">Aa</option>
                <option value="boolean">?</option>
                <option value="datetime">Date</option>
              </select>
              <button onClick={() => removeField(idx)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TransformConfig({ data, onUpdate }: { data: any; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Transform Type</label>
        <select
          value={data.transformType || 'field-map'}
          onChange={(e) => onUpdate({ transformType: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {Object.entries(TRANSFORM_TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {(data.transformType === 'formula' || data.transformType === 'field-map') && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            {data.transformType === 'formula' ? 'Formula Expression' : 'Mapping Rule'}
          </label>
          <textarea
            value={data.formula || ''}
            onChange={(e) => onUpdate({ formula: e.target.value })}
            placeholder={data.transformType === 'formula' ? 'e.g., value * 1.1 + 5' : 'e.g., source_field -> target_param'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none"
            rows={3}
          />
        </div>
      )}

      {data.transformType === 'filter' && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Filter Condition</label>
          <textarea
            value={data.formula || ''}
            onChange={(e) => onUpdate({ formula: e.target.value })}
            placeholder="e.g., value > 0 && type == 'A'"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none"
            rows={2}
          />
        </div>
      )}

      {data.transformType === 'unit-convert' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">From</label>
            <input
              type="text"
              value={(data.config as any)?.fromUnit || ''}
              onChange={(e) => onUpdate({ config: { ...data.config, fromUnit: e.target.value } })}
              placeholder="minutes"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">To</label>
            <input
              type="text"
              value={(data.config as any)?.toUnit || ''}
              onChange={(e) => onUpdate({ config: { ...data.config, toUnit: e.target.value } })}
              placeholder="seconds"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="What does this transform do?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
    </>
  );
}

function ModelTargetConfig({ data, onUpdate }: { data: any; onUpdate: (u: Record<string, unknown>) => void }) {
  const params: string[] = data.parameters || [];

  const allParams = [
    'cycleTime', 'setupTime', 'mtbf', 'mttr', 'scrapRate', 'batchSize',
    'capacity', 'interArrivalTime', 'speed', 'inspectionTime', 'assemblyTime', 'custom',
  ];

  const toggleParam = (param: string) => {
    if (params.includes(param)) {
      onUpdate({ parameters: params.filter((p: string) => p !== param) });
    } else {
      onUpdate({ parameters: [...params, param] });
    }
  };

  return (
    <>
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">Entity:</span> {data.modelEntityName} ({data.modelEntityType})
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-2">Mappable Parameters</label>
        <div className="space-y-1">
          {allParams.map((param) => (
            <label key={param} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={params.includes(param)}
                onChange={() => toggleParam(param)}
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-xs text-gray-700">{MODEL_PARAM_LABELS[param] || param}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Main Data Connector Flow Editor
// ════════════════════════════════════════════════════════════════════════

interface DataConnectorFlowProps {
  pipelineId: string;
}

export function DataConnectorFlow({ pipelineId }: DataConnectorFlowProps) {
  const store = useDataConnectorStore();
  const pipeline = store.pipelines.find((p) => p.id === pipelineId);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Convert pipeline nodes to ReactFlow nodes
  const initialNodes = useMemo<Node[]>(() => {
    if (!pipeline) return [];
    return pipeline.nodes.map((n) => ({
      id: n.id,
      type: n.kind,
      position: n.position,
      data: {
        ...('sourceType' in n ? { sourceType: n.sourceType, fields: (n as DataSourceNode).fields, config: n.config, configPreview: (n.config as any)?.preview } : {}),
        ...('transformType' in n ? { transformType: (n as TransformNode).transformType, formula: ((n as TransformNode).config as any)?.formula, description: ((n as TransformNode).config as any)?.description, config: n.config } : {}),
        ...('modelEntityId' in n ? { modelEntityId: (n as ModelTargetNode).modelEntityId, modelEntityName: (n as ModelTargetNode).modelEntityName, modelEntityType: (n as ModelTargetNode).modelEntityType, parameters: (n as ModelTargetNode).parameters } : {}),
        label: n.kind === 'data-source' ? (n as DataSourceNode).name : n.kind === 'transform' ? (n as TransformNode).name : (n as ModelTargetNode).modelEntityName,
      },
    }));
  }, [pipeline]);

  // Convert mappings to ReactFlow edges
  const initialEdges = useMemo<Edge[]>(() => {
    if (!pipeline) return [];
    return pipeline.mappings.map((m) => ({
      id: m.id,
      source: m.sourceNodeId,
      sourceHandle: m.sourceHandle,
      target: m.targetNodeId,
      targetHandle: m.targetHandle,
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    }));
  }, [pipeline]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const id = `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newEdge: Edge = {
        id,
        source: connection.source,
        sourceHandle: connection.sourceHandle || 'output',
        target: connection.target,
        targetHandle: connection.targetHandle || 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      };
      setEdges((eds) => [...eds, newEdge]);

      // Persist mapping
      store.addMapping(pipelineId, {
        id,
        sourceNodeId: connection.source,
        sourceHandle: connection.sourceHandle || 'output',
        targetNodeId: connection.target,
        targetHandle: connection.targetHandle || 'input',
      });
    },
    [pipelineId, store, setEdges]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      deletedEdges.forEach((e) => store.removeMapping(pipelineId, e.id));
    },
    [pipelineId, store]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      store.updateNodePosition(pipelineId, node.id, node.position);
    },
    [pipelineId, store]
  );

  const handleAddNode = useCallback(
    (kind: string, subType: string) => {
      const pos = { x: 250 + Math.random() * 200, y: 100 + Math.random() * 200 };

      let newNode: Node;
      const nodeId = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (kind === 'data-source') {
        const srcType = subType as DataSourceType;
        const cfg = SOURCE_TYPE_CONFIG[srcType];
        newNode = {
          id: nodeId,
          type: 'data-source',
          position: pos,
          data: {
            label: cfg.label,
            sourceType: srcType,
            fields: [],
            config: {},
          },
        };
        store.addNode(pipelineId, {
          id: nodeId,
          kind: 'data-source',
          name: cfg.label,
          sourceType: srcType,
          fields: [],
          config: {},
          position: pos,
        } as DataSourceNode);
      } else if (kind === 'transform') {
        const txType = subType as TransformType;
        const cfg = TRANSFORM_TYPE_CONFIG[txType];
        newNode = {
          id: nodeId,
          type: 'transform',
          position: pos,
          data: {
            label: cfg.label,
            transformType: txType,
            config: {},
          },
        };
        store.addNode(pipelineId, {
          id: nodeId,
          kind: 'transform',
          name: cfg.label,
          transformType: txType,
          config: {},
          position: pos,
        } as TransformNode);
      } else {
        // model-target — subType format: "type:id:name"
        const [entityType, entityId, entityName] = subType.split(':');
        const defaultParams = entityType === 'station'
          ? ['cycleTime', 'setupTime', 'mtbf', 'mttr', 'scrapRate']
          : entityType === 'buffer'
          ? ['capacity']
          : ['cycleTime'];
        newNode = {
          id: nodeId,
          type: 'model-target',
          position: pos,
          data: {
            label: entityName,
            modelEntityId: entityId,
            modelEntityName: entityName,
            modelEntityType: entityType,
            parameters: defaultParams,
          },
        };
        store.addNode(pipelineId, {
          id: nodeId,
          kind: 'model-target',
          modelEntityId: entityId,
          modelEntityName: entityName,
          modelEntityType: entityType,
          parameters: defaultParams,
          position: pos,
        } as ModelTargetNode);
      }

      setNodes((nds) => [...nds, newNode]);
      setShowAddPanel(false);
    },
    [pipelineId, store, setNodes]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [selectedNodeId, nodes]
  );

  const handleUpdateNode = useCallback(
    (updates: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updates } } : n
        )
      );
      // Persist to store
      store.updateNode(pipelineId, selectedNodeId, { config: updates } as any);
    },
    [selectedNodeId, pipelineId, store, setNodes]
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    store.removeNode(pipelineId, selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId, pipelineId, store, setNodes, setEdges]);

  if (!pipeline) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Pipeline not found
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        onInit={(instance) => { rfInstance.current = instance; }}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
        }}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(n) =>
            n.type === 'data-source' ? '#059669' :
            n.type === 'transform' ? '#d97706' :
            '#2563eb'
          }
          maskColor="rgba(0,0,0,0.08)"
        />

        {/* Top toolbar */}
        <Panel position="top-left">
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur rounded-lg shadow-md border border-gray-200 px-3 py-2">
            <span className="text-sm font-semibold text-gray-800 mr-2">{pipeline.name}</span>
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Node
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
              onClick={() => {
                store.updatePipeline(pipelineId, { lastRun: new Date().toISOString() });
              }}
            >
              <Play className="w-3.5 h-3.5" /> Run Pipeline
            </button>
          </div>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-200 px-3 py-2 text-[10px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-emerald-500" />
              <span>Data Source</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-amber-500" />
              <span>Transform</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span>Model Object</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Add Node Panel */}
      {showAddPanel && (
        <AddNodePanel
          onAdd={handleAddNode}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {/* Selected Node Config */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={handleUpdateNode}
          onClose={() => setSelectedNodeId(null)}
          onDelete={handleDeleteNode}
        />
      )}
    </div>
  );
}
