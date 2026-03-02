import React, { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Panel,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { captureScreenshot, captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { StationNode } from './nodes/StationNode';
import { BufferNode } from './nodes/BufferNode';
import { SourceNode } from './nodes/SourceNode';
import { SinkNode } from './nodes/SinkNode';
import { ConveyorNode } from './nodes/ConveyorNode';
import { OperatorNode } from './nodes/OperatorNode';
import { InspectionNode } from './nodes/InspectionNode';
import { AssemblyNode } from './nodes/AssemblyNode';
import { SplitterNode } from './nodes/SplitterNode';
import { MergeNode } from './nodes/MergeNode';
import { DisassemblyNode } from './nodes/DisassemblyNode';
import { PalletizeNode } from './nodes/PalletizeNode';
import { DepalletizeNode } from './nodes/DepalletizeNode';
import { MatchBufferNode } from './nodes/MatchBufferNode';
import { ZoneBackgroundNode } from './nodes/ZoneBackgroundNode';
import { PropertyPanel } from './PropertyPanel';
import { TemplateSelector } from './TemplateSelector';
import { SimulationAnimationOverlay } from './SimulationAnimationOverlay';
import { useSimulationStore } from '../../stores/simulationStore';
import type { Station, Buffer, ExtraNodeData } from '../../types';

const nodeTypes: NodeTypes = {
  station: StationNode,
  buffer: BufferNode,
  source: SourceNode,
  sink: SinkNode,
  conveyor: ConveyorNode,
  operator: OperatorNode,
  inspection: InspectionNode,
  assembly: AssemblyNode,
  splitter: SplitterNode,
  merge: MergeNode,
  disassembly: DisassemblyNode,
  palletize: PalletizeNode,
  depalletize: DepalletizeNode,
  matchbuffer: MatchBufferNode,
  zoneBackground: ZoneBackgroundNode,
};

const NODE_PALETTE_GROUPS = [
  {
    label: 'Flow',
    items: [
      { type: 'source', label: 'Source', shortCode: 'So', color: 'bg-green-500', icon: '↓', tooltip: 'Source - Generates parts entering the line' },
      { type: 'sink', label: 'Sink', shortCode: 'Si', color: 'bg-red-500', icon: '⬇', tooltip: 'Sink - Collects finished products' },
    ],
  },
  {
    label: 'Processing',
    items: [
      { type: 'station', label: 'Station', shortCode: 'St', color: 'bg-blue-500', icon: '⚙', tooltip: 'Station - Processing step with configurable cycle time' },
      { type: 'assembly', label: 'Assembly', shortCode: 'As', color: 'bg-indigo-500', icon: '+', tooltip: 'Assembly - Combines multiple parts into one' },
      { type: 'disassembly', label: 'Disassembly', shortCode: 'Di', color: 'bg-orange-500', icon: '−', tooltip: 'Disassembly - Splits one part into multiple' },
      { type: 'inspection', label: 'Inspection', shortCode: 'In', color: 'bg-cyan-500', icon: '✓', tooltip: 'Inspection - Quality check with pass/fail rate' },
    ],
  },
  {
    label: 'Storage',
    items: [
      { type: 'buffer', label: 'Buffer', shortCode: 'Bu', color: 'bg-amber-500', icon: '▭', tooltip: 'Buffer - Queue between stations' },
      { type: 'matchbuffer', label: 'Match Buffer', shortCode: 'MB', color: 'bg-purple-500', icon: '⇔', tooltip: 'Match Buffer - Holds parts until matching set available' },
      { type: 'conveyor', label: 'Conveyor', shortCode: 'Cv', color: 'bg-amber-400', icon: '→', tooltip: 'Conveyor - Transport with travel time' },
    ],
  },
  {
    label: 'Routing',
    items: [
      { type: 'splitter', label: 'Splitter', shortCode: 'Sp', color: 'bg-teal-500', icon: '⋔', tooltip: 'Splitter - Routes parts to multiple outputs' },
      { type: 'merge', label: 'Merge', shortCode: 'Me', color: 'bg-emerald-500', icon: '⋒', tooltip: 'Merge - Combines multiple input streams' },
      { type: 'palletize', label: 'Palletize', shortCode: 'Pa', color: 'bg-amber-600', icon: '▦', tooltip: 'Palletize - Groups parts into batches' },
      { type: 'depalletize', label: 'Depalletize', shortCode: 'Dp', color: 'bg-yellow-600', icon: '▤', tooltip: 'Depalletize - Splits batches into individual parts' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { type: 'operator', label: 'Operator', shortCode: 'Op', color: 'bg-violet-500', icon: '👤', tooltip: 'Operator - Shared human resource for stations' },
    ],
  },
];

// Flat palette for backward compatibility
const NODE_PALETTE = NODE_PALETTE_GROUPS.flatMap(g => g.items);

export function FactoryBuilder() {
  const {
    model,
    addStation,
    addBuffer,
    addConnection,
    removeStation,
    removeBuffer,
    removeConnection,
    updateStation,
    updateBuffer,
    addExtraNode,
    updateExtraNode,
    updateExtraNodePosition,
    removeExtraNode,
    selectedNodeId,
    setSelectedNode,
    undo,
    redo,
    history,
    historyIndex,
    applyAutoLayout,
  } = useModelStore();

  const { addToast } = useAppStore();
  const { isRunning: isSimulating, lastResult } = useSimulationStore();

  const [showTemplates, setShowTemplates] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addNodeType, setAddNodeType] = useState<string>('station');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const factoryRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  // Register element in registry for cross-tab screenshot access.
  // On unmount, capture a fresh screenshot to cache BEFORE clearing the element,
  // so the Dashboard can use it even after FactoryBuilder is unmounted.
  useEffect(() => {
    registerElement('factory-canvas', factoryRef.current);
    return () => {
      if (factoryRef.current) {
        // Element is still in DOM during cleanup — capture immediately
        captureToBase64(factoryRef.current)
          .then((base64) => setCachedImage('factory-canvas', base64))
          .catch(() => {});
      }
      registerElement('factory-canvas', null);
    };
  }, []);

  // Cache a base64 screenshot of the canvas when model changes (debounced 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (factoryRef.current) {
        captureToBase64(factoryRef.current)
          .then((base64) => setCachedImage('factory-canvas', base64))
          .catch(() => {}); // non-critical
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [model.stations, model.buffers, model.connections, model.extraNodes]);

  // Fit all nodes into viewport when model changes (handles long linear layouts)
  useEffect(() => {
    if (rfInstance.current) {
      // Small delay to let React Flow update its internal node positions
      const timer = setTimeout(() => {
        rfInstance.current?.fitView({ padding: 0.15, maxZoom: 1.0 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [model.stations, model.buffers, model.extraNodes]);

  const handleScreenshot = async () => {
    if (!factoryRef.current) return;
    try {
      await captureScreenshot(factoryRef.current, `factory-builder-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`);
      addToast({ type: 'success', message: 'Screenshot saved' });
    } catch {
      addToast({ type: 'error', message: 'Failed to capture screenshot' });
    }
  };

  // Convert model to React Flow nodes and edges
  const getInitialNodes = (): Node[] => {
    const modelNodes: Node[] = [
      ...model.stations.map((station) => ({
        id: station.id,
        type: 'station',
        position: station.position,
        data: station,
      })),
      ...model.buffers.map((buffer) => ({
        id: buffer.id,
        type: 'buffer',
        position: buffer.position,
        data: buffer,
      })),
      ...model.extraNodes.map((entry) => ({
        id: entry.id,
        type: entry.type,
        position: entry.position,
        data: { label: entry.data.name, ...entry.data },
      })),
    ];
    return modelNodes;
  };

  const initialEdges: Edge[] = model.connections.map((conn) => ({
    id: conn.id,
    source: conn.source,
    target: conn.target,
    animated: true,
    style: { stroke: '#64748b', strokeWidth: 2 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes with model store
  React.useEffect(() => {
    const modelNodes: Node[] = [
      ...model.stations.map((station) => ({
        id: station.id,
        type: 'station',
        position: station.position,
        data: station,
        selected: station.id === selectedNodeId,
      })),
      ...model.buffers.map((buffer) => ({
        id: buffer.id,
        type: 'buffer',
        position: buffer.position,
        data: buffer,
        selected: buffer.id === selectedNodeId,
      })),
      ...model.extraNodes.map((entry) => ({
        id: entry.id,
        type: entry.type,
        position: entry.position,
        data: { label: entry.data.name, ...entry.data },
        selected: entry.id === selectedNodeId,
      })),
    ];

    // Compute zone background nodes when zones are visible
    const zoneNodes: Node[] = [];
    if (showZones) {
      const ZONE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
      const zoneMap = new Map<string, { ids: string[]; positions: { x: number; y: number }[] }>();
      for (const n of modelNodes) {
        const name: string = n.data?.name || n.data?.label || '';
        const prefix = name.includes(' - ') ? name.split(' - ')[0].trim()
          : name.includes('_') ? name.split('_')[0].trim()
          : null;
        if (prefix && prefix.length <= 20) {
          if (!zoneMap.has(prefix)) zoneMap.set(prefix, { ids: [], positions: [] });
          const z = zoneMap.get(prefix)!;
          z.ids.push(n.id);
          z.positions.push(n.position);
        }
      }
      let colorIdx = 0;
      for (const [prefix, zone] of zoneMap) {
        if (zone.ids.length < 2) continue; // need at least 2 nodes for a zone
        const pad = 40;
        const nodeW = 200;
        const nodeH = 100;
        const minX = Math.min(...zone.positions.map(p => p.x)) - pad;
        const minY = Math.min(...zone.positions.map(p => p.y)) - pad;
        const maxX = Math.max(...zone.positions.map(p => p.x)) + nodeW + pad;
        const maxY = Math.max(...zone.positions.map(p => p.y)) + nodeH + pad;
        const color = ZONE_COLORS[colorIdx % ZONE_COLORS.length];
        colorIdx++;
        zoneNodes.push({
          id: `__zone_${prefix}`,
          type: 'zoneBackground',
          position: { x: minX, y: minY },
          data: { label: prefix, width: maxX - minX, height: maxY - minY, color },
          selectable: false,
          draggable: false,
          connectable: false,
          zIndex: -1,
        });
      }
    }

    setNodes([...zoneNodes, ...modelNodes]);
  }, [model.stations, model.buffers, model.extraNodes, selectedNodeId, showZones, setNodes]);

  React.useEffect(() => {
    const newEdges: Edge[] = model.connections.map((conn) => {
      const isUpstream = selectedNodeId && conn.target === selectedNodeId;
      const isDownstream = selectedNodeId && conn.source === selectedNodeId;
      const highlighted = isUpstream || isDownstream;
      return {
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: isUpstream ? '#22c55e' : isDownstream ? '#3b82f6' : selectedNodeId ? '#334155' : '#64748b',
          strokeWidth: highlighted ? 3 : selectedNodeId ? 1 : 2,
          opacity: selectedNodeId && !highlighted ? 0.3 : 1,
        },
      };
    });
    setEdges(newEdges);
  }, [model.connections, selectedNodeId, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addConnection({ source: params.source, target: params.target });
        addToast({ type: 'success', message: 'Connection added' });
      }
    },
    [addConnection, addToast]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const isStation = model.stations.some((s) => s.id === node.id);
      const isBuffer = model.buffers.some((b) => b.id === node.id);

      if (isStation) {
        updateStation(node.id, { position: node.position });
      } else if (isBuffer) {
        updateBuffer(node.id, { position: node.position });
      } else {
        updateExtraNodePosition(node.id, node.position);
      }
    },
    [model.stations, model.buffers, updateStation, updateBuffer, updateExtraNodePosition]
  );

  const onNodesDelete = useCallback(
    (nodesToDelete: Node[]) => {
      nodesToDelete.filter(n => !n.id.startsWith('__zone_')).forEach((node) => {
        const isStation = model.stations.some((s) => s.id === node.id);
        const isBuffer = model.buffers.some((b) => b.id === node.id);

        if (isStation) {
          removeStation(node.id);
        } else if (isBuffer) {
          removeBuffer(node.id);
        } else {
          removeExtraNode(node.id);
        }
      });
      addToast({ type: 'info', message: `Deleted ${nodesToDelete.length} node(s)` });
    },
    [model.stations, model.buffers, removeStation, removeBuffer, removeExtraNode, addToast]
  );

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach((edge) => {
        removeConnection(edge.id);
      });
    },
    [removeConnection]
  );

  const handleAddNode = (type: string, data: Record<string, unknown>) => {
    const position = { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 };

    if (type === 'station') {
      addStation({ ...data, position } as Partial<Station>);
    } else if (type === 'buffer') {
      addBuffer({ ...data, position } as Partial<Buffer>);
    } else {
      addExtraNode(type as any, data as Partial<ExtraNodeData>, position);
    }

    setShowAddNode(false);
    addToast({ type: 'success', message: `${type} added` });
  };

  // Node search — filter all nodes by name
  const allModelNodes = [
    ...model.stations.map(s => ({ id: s.id, name: s.name, type: 'station' })),
    ...model.buffers.map(b => ({ id: b.id, name: b.name, type: 'buffer' })),
    ...model.extraNodes.map(e => ({ id: e.id, name: e.data.name || e.type, type: e.type })),
  ];
  const searchResults = searchQuery.trim()
    ? allModelNodes.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const focusNode = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    setSearchOpen(false);
    setSearchQuery('');
    if (rfInstance.current) {
      rfInstance.current.fitView({ nodes: [{ id: nodeId }] as any, padding: 0.5, duration: 500 });
    }
  }, [setSelectedNode]);

  // Ctrl+F shortcut to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          searchRef.current?.querySelector('input')?.focus();
        }, 50);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  const extraNodeEntry = selectedNodeId
    ? model.extraNodes.find((n) => n.id === selectedNodeId)
    : null;

  const selectedNode = selectedNodeId
    ? model.stations.find((s) => s.id === selectedNodeId) ||
      model.buffers.find((b) => b.id === selectedNodeId) ||
      extraNodeEntry?.data ||
      null
    : null;

  const selectedNodeType = selectedNodeId
    ? model.stations.some((s) => s.id === selectedNodeId)
      ? 'station'
      : model.buffers.some((b) => b.id === selectedNodeId)
        ? 'buffer'
        : extraNodeEntry?.type || null
    : null;

  return (
    <>
    <div className="h-full flex flex-col" ref={factoryRef}>
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTemplates(true)}
          >
            Load Template
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              applyAutoLayout();
              setTimeout(() => {
                rfInstance.current?.fitView({ padding: 0.15, maxZoom: 1.0 });
              }, 200);
            }}
            title="Auto Layout"
          >
            <LayoutIcon className="w-4 h-4 mr-1" />
            Auto Layout
          </Button>
          <div className="h-6 w-px bg-gray-200 mx-2" />

          {/* Node Palette — grouped with dividers */}
          <div className="flex items-center">
            {NODE_PALETTE_GROUPS.map((group, gi) => (
              <div key={group.label} className="flex items-center">
                {gi > 0 && <div className="h-8 w-px bg-gray-200 mx-1" />}
                {group.items.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => {
                      setAddNodeType(item.type);
                      setShowAddNode(true);
                    }}
                    className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex flex-col items-center"
                    title={item.tooltip}
                  >
                    <div className={`w-7 h-7 ${item.color} rounded-md flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                      {item.shortCode}
                    </div>
                    <span className="text-[9px] text-gray-600 mt-0.5 leading-tight truncate max-w-[56px] font-medium">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowZones(!showZones)}
            className={`px-2 py-1 text-xs rounded transition-colors ${showZones ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Toggle zone outlines"
          >
            Zones
          </button>
          <div className="h-6 w-px bg-gray-200 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            <UndoIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
          >
            <RedoIcon className="w-4 h-4" />
          </Button>
          <div className="h-6 w-px bg-gray-200 mx-2" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleScreenshot}
            title="Screenshot"
          >
            <CameraIcon className="w-4 h-4" />
          </Button>
          <div className="h-6 w-px bg-gray-200 mx-2" />

          {/* Node Search */}
          <div className="relative" ref={searchRef}>
            <button
              onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchRef.current?.querySelector('input')?.focus(), 50); }}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              title="Search nodes (Ctrl+F)"
            >
              <SearchIcon className="w-4 h-4 text-gray-500" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search nodes..."
                  className="w-full px-3 py-2 text-sm border-b border-gray-100 rounded-t-lg outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
                {searchQuery.trim() && (
                  <div className="max-h-48 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
                    ) : (
                      searchResults.map(r => (
                        <button
                          key={r.id}
                          onClick={() => focusNode(r.id)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                        >
                          <span className="text-[10px] uppercase text-gray-400 w-12 shrink-0">{r.type}</span>
                          <span className="truncate">{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-gray-200 mx-2" />
          <span className="text-sm text-gray-500">
            {nodes.length} elements, {edges.length} connections
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            onInit={(instance) => { rfInstance.current = instance; }}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.0 }}
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode="Delete"
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  station: '#3b82f6',
                  buffer: '#f59e0b',
                  source: '#22c55e',
                  sink: '#ef4444',
                  conveyor: '#f59e0b',
                  operator: '#8b5cf6',
                  inspection: '#06b6d4',
                  assembly: '#6366f1',
                  splitter: '#14b8a6',
                  merge: '#10b981',
                  disassembly: '#f97316',
                  palletize: '#d97706',
                  depalletize: '#ca8a04',
                  matchbuffer: '#a855f7',
                };
                return colors[node.type || 'station'] || '#64748b';
              }}
              style={{ height: 150, width: 220 }}
              maskColor="rgba(0,0,0,0.6)"
            />
            <Panel position="bottom-center">
              <div className="bg-white px-3 py-1.5 rounded-lg shadow text-xs text-gray-500">
                {isSimulating ? 'Simulation running...' : 'Drag to connect elements. Press Delete to remove. Click palette to add.'}
              </div>
            </Panel>
            <SimulationAnimationOverlay
              isSimulating={isSimulating}
              events={lastResult?.events?.map(e => ({
                time: e.time,
                type: e.type,
                entity_id: e.entityId,
                details: e.details,
              })) || []}
            />
          </ReactFlow>
        </div>

        {/* Property Panel */}
        {selectedNode && (
          <PropertyPanel
            node={selectedNode}
            nodeType={selectedNodeType!}
            onUpdate={(updates) => {
              try {
                if (selectedNodeType === 'station') {
                  updateStation(selectedNodeId!, updates as Partial<Station>);
                } else if (selectedNodeType === 'buffer') {
                  updateBuffer(selectedNodeId!, updates as Partial<Buffer>);
                } else {
                  updateExtraNode(selectedNodeId!, updates as Partial<ExtraNodeData>);
                }
                addToast({ type: 'success', message: `${updates.name || selectedNodeType} saved` });
              } catch {
                addToast({ type: 'error', message: 'Failed to save changes' });
              }
            }}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

    </div>

    {/* Modals — outside factoryRef to avoid appearing in screenshots */}
    <TemplateSelector
      isOpen={showTemplates}
      onClose={() => setShowTemplates(false)}
    />

    <AddNodeModal
      isOpen={showAddNode}
      nodeType={addNodeType}
      onClose={() => setShowAddNode(false)}
      onAdd={handleAddNode}
    />
    </>
  );
}

// Add Node Modal
function AddNodeModal({
  isOpen,
  nodeType,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  nodeType: string;
  onClose: () => void;
  onAdd: (type: string, data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [cycleTime, setCycleTime] = useState(60);
  const [capacity, setCapacity] = useState(10);
  const [arrivalRate, setArrivalRate] = useState(120);
  const [count, setCount] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const baseData = { name: name || `New ${nodeType}` };

    switch (nodeType) {
      case 'station':
        onAdd(nodeType, {
          ...baseData,
          cycleTime: { type: 'constant', parameters: { value: cycleTime } },
        });
        break;
      case 'buffer':
        onAdd(nodeType, { ...baseData, capacity, queueRule: 'FIFO' });
        break;
      case 'source':
        onAdd(nodeType, { ...baseData, arrivalRate });
        break;
      case 'sink':
        onAdd(nodeType, baseData);
        break;
      case 'conveyor':
        onAdd(nodeType, { ...baseData, length: 10, speed: 1, capacity });
        break;
      case 'operator':
        onAdd(nodeType, { ...baseData, count, efficiency: 100, skill: 'General' });
        break;
      case 'inspection':
        onAdd(nodeType, { ...baseData, inspectionTime: 30, defectRate: 2 });
        break;
      case 'assembly':
        onAdd(nodeType, { ...baseData, cycleTime, inputParts: 2 });
        break;
      case 'splitter':
        onAdd(nodeType, { ...baseData, outputs: 2, splitType: 'equal' });
        break;
      case 'merge':
        onAdd(nodeType, { ...baseData, inputs: 2, mergeType: 'fifo' });
        break;
      case 'disassembly':
        onAdd(nodeType, { ...baseData, cycleTime, outputParts: [] });
        break;
      case 'palletize':
        onAdd(nodeType, { ...baseData, defaultPalletSize: 10, cycleTime });
        break;
      case 'depalletize':
        onAdd(nodeType, { ...baseData, cycleTime });
        break;
      case 'matchbuffer':
        onAdd(nodeType, { ...baseData, capacity, matchKey: 'order', requiredParts: [] });
        break;
      default:
        onAdd(nodeType, baseData);
    }

    setName('');
    setCycleTime(60);
    setCapacity(10);
  };

  const renderFields = () => {
    switch (nodeType) {
      case 'station':
      case 'assembly':
      case 'disassembly':
      case 'palletize':
      case 'depalletize':
        return (
          <div>
            <label className="input-label">Cycle Time (seconds)</label>
            <input
              type="number"
              value={cycleTime}
              onChange={(e) => setCycleTime(Number(e.target.value))}
              min={1}
              className="input"
            />
          </div>
        );
      case 'buffer':
      case 'conveyor':
      case 'matchbuffer':
        return (
          <div>
            <label className="input-label">Capacity</label>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              min={1}
              className="input"
            />
          </div>
        );
      case 'source':
        return (
          <div>
            <label className="input-label">Arrival Interval (seconds)</label>
            <input
              type="number"
              value={arrivalRate}
              onChange={(e) => setArrivalRate(Number(e.target.value))}
              min={1}
              className="input"
            />
          </div>
        );
      case 'operator':
        return (
          <div>
            <label className="input-label">Number of Operators</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              min={1}
              className="input"
            />
          </div>
        );
      default:
        return null;
    }
  };

  const nodeInfo = NODE_PALETTE.find(n => n.type === nodeType);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add ${nodeInfo?.label || nodeType}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center space-x-3 pb-2 border-b">
          <div className={`w-10 h-10 ${nodeInfo?.color || 'bg-gray-500'} rounded flex items-center justify-center text-white text-lg`}>
            {nodeInfo?.icon}
          </div>
          <div className="text-sm text-gray-600">
            {nodeType === 'source' && 'Generates products entering the system'}
            {nodeType === 'station' && 'Processing workstation with cycle time'}
            {nodeType === 'buffer' && 'Queue between stations'}
            {nodeType === 'conveyor' && 'Transport between locations'}
            {nodeType === 'operator' && 'Human resource for stations'}
            {nodeType === 'inspection' && 'Quality check with pass/fail outputs'}
            {nodeType === 'assembly' && 'Combines multiple parts into one'}
            {nodeType === 'disassembly' && 'Breaks one item into multiple parts'}
            {nodeType === 'splitter' && 'Splits flow to multiple outputs'}
            {nodeType === 'merge' && 'Combines multiple inputs into one'}
            {nodeType === 'palletize' && 'Groups items onto a pallet'}
            {nodeType === 'depalletize' && 'Unloads items from a pallet'}
            {nodeType === 'matchbuffer' && 'Waits for matching parts before releasing'}
            {nodeType === 'sink' && 'Exit point for finished products'}
          </div>
        </div>

        <div>
          <label className="input-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g., ${nodeInfo?.label} 1`}
            className="input"
          />
        </div>

        {renderFields()}

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add {nodeInfo?.label}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Icons
function UndoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
    </svg>
  );
}

function LayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7h4M7 10v4m10-4v4m-7 3h4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
