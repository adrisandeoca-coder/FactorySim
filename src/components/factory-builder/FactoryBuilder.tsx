import React, { useCallback, useRef, useState, useEffect, lazy, Suspense } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
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
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useNavigate } from 'react-router-dom';
import {
  Globe as GlobeIcon, LayoutTemplate, LayoutGrid, Network, Box, SquareDashed, Route, Flame, Undo2, Redo2, Search,
  Camera, Wand2, Shapes, ArrowDownToLine, Cog, Layers, MoveRight, ScanSearch, Combine, UserRound, PackageCheck,
} from 'lucide-react';
import { RibbonContent, RibbonGroup, RibbonButton, RibbonSmallButton, RibbonStack, DockPanel } from '../layout/Ribbon';
import { ModelOutline } from './ModelOutline';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { useScenarioBridgeStore } from '../../stores/scenarioBridgeStore';
import { modelToScenario } from '../../services/modelToScenario';
import { autoAssignLibraryModels, describeAssignment } from '../../services/modelAutoAssign';
import { captureScreenshot, captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';
import { useModelValidation } from '../../hooks/useModelValidation';
import { Button } from '../common/Button';

// Lazy-load the 3D view to avoid loading Three.js when not needed
const Factory3DView = lazy(() =>
  import('./3d/Factory3DView').then(m => ({ default: m.Factory3DView }))
);
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
import { AGVNode } from './nodes/AGVNode';
import { RoboticCellNode } from './nodes/RoboticCellNode';
import { HumanoidNode } from './nodes/HumanoidNode';
import { WarehouseNode } from './nodes/WarehouseNode';
import { LoadingDockNode } from './nodes/LoadingDockNode';
import { CraneNode } from './nodes/CraneNode';
import { ForkliftNode } from './nodes/ForkliftNode';
import { ColdStorageNode } from './nodes/ColdStorageNode';
import { PressNode } from './nodes/PressNode';
import { LaserCutterNode } from './nodes/LaserCutterNode';
import { WeldingCellNode } from './nodes/WeldingCellNode';
import { PaintBoothNode } from './nodes/PaintBoothNode';
import { PackagerNode } from './nodes/PackagerNode';
import { WasherNode } from './nodes/WasherNode';
import { CNCMachineNode } from './nodes/CNCMachineNode';
import { OvenNode } from './nodes/OvenNode';
import { InjectionMolderNode } from './nodes/InjectionMolderNode';
import { SortingStationNode } from './nodes/SortingStationNode';
import { AccumulatorNode } from './nodes/AccumulatorNode';
import { TurntableNode } from './nodes/TurntableNode';
import { ElevatorNode } from './nodes/ElevatorNode';
import { OverheadConveyorNode } from './nodes/OverheadConveyorNode';
import { SorterNode } from './nodes/SorterNode';
import { ShuttleNode } from './nodes/ShuttleNode';
import { RollerConveyorNode } from './nodes/RollerConveyorNode';
import { TrackGuidedVehicleNode } from './nodes/TrackGuidedVehicleNode';
import { CrossoverNode } from './nodes/CrossoverNode';
import { PickStationNode } from './nodes/PickStationNode';
import { WeighingNode } from './nodes/WeighingNode';
import { LabelerNode } from './nodes/LabelerNode';
import { ZoneBackgroundNode } from './nodes/ZoneBackgroundNode';
import { PropertyPanel } from './PropertyPanel';
import { TemplateSelector } from './TemplateSelector';
import { SimulationAnimationOverlay } from './SimulationAnimationOverlay';
import { TransportNetworkOverlay } from './TransportNetworkOverlay';
import { FloorPlanOverlay } from './FloorPlanOverlay';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { useSimulationStore } from '../../stores/simulationStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
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
  agv: AGVNode,
  roboticcell: RoboticCellNode,
  humanoid: HumanoidNode,
  warehouse: WarehouseNode,
  loadingdock: LoadingDockNode,
  crane: CraneNode,
  forklift: ForkliftNode,
  coldstorage: ColdStorageNode,
  press: PressNode,
  lasercutter: LaserCutterNode,
  weldingcell: WeldingCellNode,
  paintbooth: PaintBoothNode,
  packager: PackagerNode,
  washer: WasherNode,
  cncmachine: CNCMachineNode,
  oven: OvenNode,
  injectionmolder: InjectionMolderNode,
  sortingstation: SortingStationNode,
  accumulator: AccumulatorNode,
  turntable: TurntableNode,
  elevator: ElevatorNode,
  overheadconveyor: OverheadConveyorNode,
  sorter: SorterNode,
  shuttle: ShuttleNode,
  rollerconveyor: RollerConveyorNode,
  trackguidedvehicle: TrackGuidedVehicleNode,
  crossover: CrossoverNode,
  pickstation: PickStationNode,
  weighing: WeighingNode,
  labeler: LabelerNode,
  zoneBackground: ZoneBackgroundNode,
};

const NODE_PALETTE_GROUPS = [
  {
    label: 'Flow',
    items: [
      { type: 'source', label: 'Source', shortCode: 'So', color: 'bg-gray-100', accent: '#17C964', icon: '↓', tooltip: 'Source - Generates parts entering the line' },
      { type: 'sink', label: 'Sink', shortCode: 'Si', color: 'bg-gray-100', accent: '#F31260', icon: '⬇', tooltip: 'Sink - Collects finished products' },
    ],
  },
  {
    label: 'Processing',
    items: [
      { type: 'station', label: 'Station', shortCode: 'St', color: 'bg-gray-100', accent: '#2563EB', icon: '⚙', tooltip: 'Station - Processing step with configurable cycle time' },
      { type: 'assembly', label: 'Assembly', shortCode: 'As', color: 'bg-gray-100', accent: '#6366f1', icon: '+', tooltip: 'Assembly - Combines multiple parts into one' },
      { type: 'disassembly', label: 'Disassembly', shortCode: 'Di', color: 'bg-gray-100', accent: '#f97316', icon: '−', tooltip: 'Disassembly - Splits one part into multiple' },
      { type: 'inspection', label: 'Inspection', shortCode: 'In', color: 'bg-gray-100', accent: '#06b6d4', icon: '✓', tooltip: 'Inspection - Quality check with pass/fail rate' },
    ],
  },
  {
    label: 'Storage',
    items: [
      { type: 'buffer', label: 'Buffer', shortCode: 'Bu', color: 'bg-gray-100', accent: '#F5A524', icon: '▭', tooltip: 'Buffer - Queue between stations' },
      { type: 'matchbuffer', label: 'Match Buffer', shortCode: 'MB', color: 'bg-gray-100', accent: '#a855f7', icon: '⇔', tooltip: 'Match Buffer - Holds parts until matching set available' },
      { type: 'conveyor', label: 'Conveyor', shortCode: 'Cv', color: 'bg-gray-100', accent: '#F5A524', icon: '→', tooltip: 'Conveyor - Transport with travel time' },
    ],
  },
  {
    label: 'Routing',
    items: [
      { type: 'splitter', label: 'Splitter', shortCode: 'Sp', color: 'bg-gray-100', accent: '#14b8a6', icon: '⋔', tooltip: 'Splitter - Routes parts to multiple outputs' },
      { type: 'merge', label: 'Merge', shortCode: 'Me', color: 'bg-gray-100', accent: '#10b981', icon: '⋒', tooltip: 'Merge - Combines multiple input streams' },
      { type: 'palletize', label: 'Palletize', shortCode: 'Pa', color: 'bg-gray-100', accent: '#d97706', icon: '▦', tooltip: 'Palletize - Groups parts into batches' },
      { type: 'depalletize', label: 'Depalletize', shortCode: 'Dp', color: 'bg-gray-100', accent: '#ca8a04', icon: '▤', tooltip: 'Depalletize - Splits batches into individual parts' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { type: 'operator', label: 'Operator', shortCode: 'Op', color: 'bg-gray-100', accent: '#8b5cf6', icon: '👤', tooltip: 'Operator - Shared human resource for stations' },
      { type: 'humanoid', label: 'Humanoid', shortCode: 'Hu', color: 'bg-gray-100', accent: '#0ea5e9', icon: '🤖', tooltip: 'Humanoid - Bipedal robot worker (behaves like operator)' },
      { type: 'agv', label: 'AGV', shortCode: 'Ag', color: 'bg-gray-100', accent: '#06b6d4', icon: '🚗', tooltip: 'AGV - Autonomous guided vehicle for transport (behaves like forklift)' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { type: 'roboticcell', label: 'Robotic Cell', shortCode: 'Rc', color: 'bg-gray-100', accent: '#ea580c', icon: '🦾', tooltip: 'Robotic Cell - Industrial robot arm in safety cage (behaves like station)' },
    ],
  },
  {
    label: 'Logistics',
    items: [
      { type: 'warehouse', label: 'Warehouse', shortCode: 'Wh', color: 'bg-gray-100', accent: '#f59e0b', icon: '🏭', tooltip: 'Warehouse - Multi-level storage with put/pick operations' },
      { type: 'loadingdock', label: 'Loading Dock', shortCode: 'Ld', color: 'bg-gray-100', accent: '#64748b', icon: '🚛', tooltip: 'Loading Dock - Truck loading/unloading bay' },
      { type: 'crane', label: 'Crane', shortCode: 'Cr', color: 'bg-gray-100', accent: '#eab308', icon: '🏗️', tooltip: 'Crane - Overhead gantry or bridge crane' },
      { type: 'forklift', label: 'Forklift', shortCode: 'Fk', color: 'bg-gray-100', accent: '#f97316', icon: '🚜', tooltip: 'Forklift - Material handling lift truck' },
      { type: 'coldstorage', label: 'Cold Storage', shortCode: 'Cs', color: 'bg-gray-100', accent: '#0ea5e9', icon: '❄️', tooltip: 'Cold Storage - Temperature-controlled storage' },
    ],
  },
  {
    label: 'Specialized',
    items: [
      { type: 'press', label: 'Press', shortCode: 'Pr', color: 'bg-gray-100', accent: '#ef4444', icon: '⬇', tooltip: 'Press - Hydraulic stamping/forming press' },
      { type: 'lasercutter', label: 'Laser Cutter', shortCode: 'Lc', color: 'bg-gray-100', accent: '#8b5cf6', icon: '⚡', tooltip: 'Laser Cutter - CNC laser cutting machine' },
      { type: 'weldingcell', label: 'Welding Cell', shortCode: 'Wc', color: 'bg-gray-100', accent: '#d97706', icon: '🔥', tooltip: 'Welding Cell - Robotic welding station' },
      { type: 'paintbooth', label: 'Paint Booth', shortCode: 'Pb', color: 'bg-gray-100', accent: '#ec4899', icon: '🎨', tooltip: 'Paint Booth - Spray painting with cure cycle' },
      { type: 'packager', label: 'Packager', shortCode: 'Pk', color: 'bg-gray-100', accent: '#84cc16', icon: '📦', tooltip: 'Packager - End-of-line packaging' },
      { type: 'washer', label: 'Washer', shortCode: 'Wa', color: 'bg-gray-100', accent: '#06b6d4', icon: '💧', tooltip: 'Washer - Parts washing/cleaning station' },
      { type: 'cncmachine', label: 'CNC Machine', shortCode: 'Cn', color: 'bg-gray-100', accent: '#10b981', icon: '⚙', tooltip: 'CNC Machine - Lathe, mill, or grinder with tool changes' },
      { type: 'oven', label: 'Oven', shortCode: 'Ov', color: 'bg-gray-100', accent: '#ea580c', icon: '🔥', tooltip: 'Oven - Batch heat treatment with ramp/hold/cool cycle' },
      { type: 'injectionmolder', label: 'Inj. Molder', shortCode: 'Im', color: 'bg-gray-100', accent: '#9333ea', icon: '⬤', tooltip: 'Injection Molder - Multi-cavity plastic molding' },
      { type: 'sortingstation', label: 'Sorter', shortCode: 'Sr', color: 'bg-gray-100', accent: '#14b8a6', icon: '↕', tooltip: 'Sorting Station - Multi-output product sorting' },
      { type: 'accumulator', label: 'Accumulator', shortCode: 'Ac', color: 'bg-gray-100', accent: '#6366f1', icon: '▥', tooltip: 'Accumulator - Collects and releases in bursts' },
    ],
  },
  {
    label: 'Material Handling',
    items: [
      { type: 'turntable', label: 'Turntable', shortCode: 'Tt', color: 'bg-gray-100', accent: '#14b8a6', icon: '↻', tooltip: 'Turntable - Rotary transfer between conveyors' },
      { type: 'elevator', label: 'Elevator', shortCode: 'El', color: 'bg-gray-100', accent: '#6366f1', icon: '⇕', tooltip: 'Elevator - Vertical transport between floors' },
      { type: 'overheadconveyor', label: 'Overhead', shortCode: 'Oc', color: 'bg-gray-100', accent: '#06b6d4', icon: '⌒', tooltip: 'Overhead Conveyor - Carrier-based overhead transport' },
      { type: 'sorter', label: 'Sorter', shortCode: 'So', color: 'bg-gray-100', accent: '#10b981', icon: '⇣', tooltip: 'Sorter - Multi-output sorting with error rate' },
      { type: 'shuttle', label: 'Shuttle', shortCode: 'Sh', color: 'bg-gray-100', accent: '#8b5cf6', icon: '⇔', tooltip: 'Shuttle - Lane-based shuttle transport' },
      { type: 'rollerconveyor', label: 'Roller Conv.', shortCode: 'Rc', color: 'bg-gray-100', accent: '#f59e0b', icon: '═', tooltip: 'Roller Conveyor - Simple roller transport' },
      { type: 'trackguidedvehicle', label: 'TGV', shortCode: 'Tg', color: 'bg-gray-100', accent: '#64748b', icon: '⊞', tooltip: 'Track Guided Vehicle - Fixed-rail fleet transport' },
      { type: 'crossover', label: 'Crossover', shortCode: 'Cx', color: 'bg-gray-100', accent: '#ec4899', icon: '✕', tooltip: 'Crossover - Lane transfer switch' },
    ],
  },
  {
    label: 'Quality & Finishing',
    items: [
      { type: 'pickstation', label: 'Pick Station', shortCode: 'Pk', color: 'bg-gray-100', accent: '#f97316', icon: '✋', tooltip: 'Pick Station - Manual pick-to-light with error rate' },
      { type: 'weighing', label: 'Weighing', shortCode: 'Wg', color: 'bg-gray-100', accent: '#3b82f6', icon: '⚖', tooltip: 'Weighing - Weight measurement with reject rate' },
      { type: 'labeler', label: 'Labeler', shortCode: 'Lb', color: 'bg-gray-100', accent: '#84cc16', icon: '🏷', tooltip: 'Labeler - Label application with error rate' },
    ],
  },
];

// Flat palette for backward compatibility
const NODE_PALETTE = NODE_PALETTE_GROUPS.flatMap(g => g.items);

// ── Essential elements (shown as large ribbon buttons in both modes) ─────────
const SIMPLE_PALETTE: Array<{ type: string; label: string; hint: string; icon: React.ReactNode }> = [
  { type: 'source', label: 'Source', hint: 'Where parts enter the line', icon: <ArrowDownToLine size={26} color="#059669" /> },
  { type: 'station', label: 'Station', hint: 'A machine or work step with a cycle time', icon: <Cog size={26} color="#2563EB" /> },
  { type: 'buffer', label: 'Buffer', hint: 'Queue / storage space between stations', icon: <Layers size={26} color="#D97706" /> },
  { type: 'conveyor', label: 'Conveyor', hint: 'Moves parts with a travel time', icon: <MoveRight size={26} color="#B45309" /> },
  { type: 'inspection', label: 'Inspection', hint: 'Quality check with a reject rate', icon: <ScanSearch size={26} color="#0891B2" /> },
  { type: 'assembly', label: 'Assembly', hint: 'Joins several parts into one', icon: <Combine size={26} color="#4F46E5" /> },
  { type: 'operator', label: 'Operator', hint: 'A worker shared by stations', icon: <UserRound size={26} color="#7C3AED" /> },
  { type: 'sink', label: 'Sink', hint: 'Where finished parts leave the line', icon: <PackageCheck size={26} color="#DC2626" /> },
];

// ── "More elements" ribbon button: every element type, grouped (expert mode) ──
function MoreElementsButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <RibbonButton
        icon={<Shapes size={26} color="#475569" />}
        label="More"
        dropdown
        active={open}
        onClick={() => setOpen((v) => !v)}
        title="All 47 element types"
      />
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 61, marginTop: 2,
              background: '#fff', border: '1px solid var(--chrome-border)', boxShadow: '0 8px 24px rgba(15,23,42,.18)',
              padding: 10, display: 'grid', gridTemplateColumns: 'repeat(5, 150px)', gap: '10px 14px',
            }}
          >
            {NODE_PALETTE_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-label" style={{ marginBottom: 4 }}>{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.type}
                    role="menuitem"
                    type="button"
                    title={item.tooltip}
                    onClick={() => { onAdd(item.type); setOpen(false); }}
                    className="file-menu-item"
                    style={{ padding: '3px 4px', gap: 7, fontSize: 12 }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: (item as any).accent || '#94a3b8', flexShrink: 0 }} />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


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
    setTransportNetworkEnabled,
  } = useModelStore();

  const { addToast } = useAppStore();
  const simpleMode = useAppStore((st) => st.simpleMode);
  // Hoisted: these were called inline in JSX, which breaks hook order once the box is conditional
  const maxOperators = useLiveSimulationStore((st) => st.maxOperators);
  const maxForklifts = useLiveSimulationStore((st) => st.maxForklifts);
  const navigate = useNavigate();
  const setBridgeScenario = useScenarioBridgeStore((s) => s.setPending);
  const { isRunning: isSimulating, lastResult } = useSimulationStore();

  const openInScenarioWorld = useCallback(() => {
    const scenario = modelToScenario(model, { type: 'factory' });
    setBridgeScenario(scenario);
    navigate('/world');
    addToast({
      type: 'success',
      message: `Opened ${scenario.entities.length} entities in 3D World`,
    });
  }, [model, setBridgeScenario, navigate, addToast]);

  const onAutoAssignModels = useCallback(() => {
    // Force reassignment for every entity (overwrites prior auto-picks; user
    // picks via the property panel are still taken into account first because
    // autoAssignLibraryModels respects existing libraryModelId unless force=true).
    const updated = autoAssignLibraryModels({ ...model,
      stations: model.stations.map(s => ({ ...s, libraryModelId: undefined })),
      buffers: model.buffers.map(b => ({ ...b, libraryModelId: undefined })),
      extraNodes: model.extraNodes.map(e => ({ ...e, libraryModelId: undefined })),
    });
    useModelStore.getState().setModel(updated);
    const stats = describeAssignment(updated);
    addToast({
      type: 'success',
      message: `Auto-assigned 3D models to ${stats.totalAssigned}/${stats.total} entities (${Object.keys(stats.modelDistribution).length} unique).`,
    });
  }, [model, addToast]);
  const validationIssues = useModelValidation(model);
  const errorCount = validationIssues.filter(i => i.severity === 'error').length;
  const warningCount = validationIssues.filter(i => i.severity === 'warning').length;

  const [showTemplates, setShowTemplates] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addNodeType, setAddNodeType] = useState<string>('station');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [heatmapMode, setHeatmapMode] = useState<'off' | 'utilization' | 'blocked' | 'starved'>('off');
  const searchRef = useRef<HTMLDivElement>(null);
  const factoryRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  // Track whether component is still mounted to guard async callbacks
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

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
      if (!isMountedRef.current) return;
      if (factoryRef.current) {
        captureToBase64(factoryRef.current)
          .then((base64) => {
            if (isMountedRef.current) setCachedImage('factory-canvas', base64);
          })
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
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    style: { stroke: '#64748b', strokeWidth: 2 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes with model store
  React.useEffect(() => {
    // Build heatmap data from last result
    const heatmapData: Record<string, { value: number; color: string }> = {};
    if (heatmapMode !== 'off' && lastResult?.kpis?.utilization?.byStation) {
      const util = lastResult.kpis.utilization.byStation;
      for (const [sid, s] of Object.entries(util)) {
        const su = s as any;
        const val = heatmapMode === 'utilization' ? (su.busy || 0)
          : heatmapMode === 'blocked' ? (su.blocked || 0)
          : (su.starved || 0);
        // Color: green (low) → yellow → red (high)
        const r = Math.round(255 * Math.min(1, val * 2));
        const g = Math.round(255 * Math.min(1, (1 - val) * 2));
        heatmapData[sid] = { value: val, color: `rgb(${r}, ${g}, 0)` };
      }
    }

    const modelNodes: Node[] = [
      ...model.stations.map((station) => ({
        id: station.id,
        type: 'station',
        position: station.position,
        data: { ...station, _heatmap: heatmapData[station.id] },
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
      const ZONE_COLORS = ['#2563EB', '#8b5cf6', '#06b6d4', '#F5A524', '#10b981', '#F31260', '#ec4899'];
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
  }, [model.stations, model.buffers, model.extraNodes, selectedNodeId, showZones, setNodes, heatmapMode, lastResult]);

  React.useEffect(() => {
    const newEdges: Edge[] = model.connections.map((conn) => {
      const isUpstream = selectedNodeId && conn.target === selectedNodeId;
      const isDownstream = selectedNodeId && conn.source === selectedNodeId;
      const highlighted = isUpstream || isDownstream;
      const baseColor = isUpstream ? '#10b981' : isDownstream ? '#3b82f6' : selectedNodeId ? '#94a3b8' : '#64748b';
      return {
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
        style: {
          stroke: baseColor,
          strokeWidth: highlighted ? 2.5 : selectedNodeId ? 1.5 : 2,
          opacity: selectedNodeId && !highlighted ? 0.25 : 1,
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
      {/* Commands live in the app ribbon (engineering-desktop style) */}
      <RibbonContent>
        <RibbonGroup label="Model">
          <RibbonButton icon={<LayoutTemplate size={26} color="#1F5FAD" />} label="Load template" onClick={() => setShowTemplates(true)} />
          <RibbonButton
            icon={<LayoutGrid size={26} color="#475569" />}
            label="Auto layout"
            title="Arrange elements left to right by flow"
            onClick={() => {
              applyAutoLayout();
              setTimeout(() => {
                rfInstance.current?.fitView({ padding: 0.15, maxZoom: 1.0 });
              }, 200);
            }}
          />
        </RibbonGroup>

        <RibbonGroup label="Add element">
          {SIMPLE_PALETTE.map((item) => (
            <RibbonButton
              key={item.type}
              icon={item.icon}
              label={item.label}
              title={`Add ${item.label} — ${item.hint}`}
              onClick={() => { setAddNodeType(item.type); setShowAddNode(true); }}
            />
          ))}
          {!simpleMode && (
            <MoreElementsButton
              onAdd={(type) => { setAddNodeType(type); setShowAddNode(true); }}
            />
          )}
        </RibbonGroup>

        <RibbonGroup label="View">
          <RibbonButton icon={<Network size={26} color="#2563EB" />} label="2D layout" active={viewMode === '2d'} onClick={() => setViewMode('2d')} title="2D flow layout" />
          <RibbonButton icon={<Box size={26} color={isSimulating ? '#059669' : '#475569'} />} label="3D view" active={viewMode === '3d'} onClick={() => setViewMode('3d')} title="3D view (works during simulation)" />
          {(!simpleMode || lastResult) && (
            <RibbonStack>
              {!simpleMode && (
                <RibbonSmallButton icon={<SquareDashed size={14} />} label="Zones" active={showZones} onClick={() => setShowZones(!showZones)} title="Toggle zone outlines" />
              )}
              {!simpleMode && (
                <RibbonSmallButton icon={<Route size={14} />} label="Transport" active={!!model.transportNetwork?.enabled} onClick={() => setTransportNetworkEnabled(!model.transportNetwork?.enabled)} title="Toggle transport network (AGV/forklift paths)" />
              )}
              {lastResult && (
                <label className="ribbon-field" title="Colour stations by simulation results">
                  <Flame size={14} color="#EA580C" />
                  <select value={heatmapMode} onChange={(e) => setHeatmapMode(e.target.value as any)}>
                    <option value="off">Heatmap: off</option>
                    <option value="utilization">Utilization</option>
                    <option value="blocked">Blocked</option>
                    <option value="starved">Starved</option>
                  </select>
                </label>
              )}
            </RibbonStack>
          )}
        </RibbonGroup>

        <RibbonGroup label="Edit">
          <RibbonStack>
            <RibbonSmallButton icon={<Undo2 size={14} />} label="Undo" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" />
            <RibbonSmallButton icon={<Redo2 size={14} />} label="Redo" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" />
            <div className="relative" ref={searchRef}>
              <RibbonSmallButton
                icon={<Search size={14} />}
                label="Find"
                active={searchOpen}
                onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchRef.current?.querySelector('input')?.focus(), 50); }}
                title="Find element (Ctrl+F)"
              />
              {searchOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white shadow-lg border border-gray-300 z-50">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find element by name…"
                    className="w-full px-2 py-1.5 text-sm border-b border-gray-200 outline-none"
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
                            className="w-full text-left px-2 py-1 text-sm hover:bg-blue-50 flex items-center gap-2"
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
          </RibbonStack>
        </RibbonGroup>

        <RibbonGroup label="Output">
          <RibbonButton icon={<Camera size={26} color="#475569" />} label="Screenshot" onClick={handleScreenshot} title="Save the layout as PNG" />
        </RibbonGroup>

        {!simpleMode && (
          <RibbonGroup label="3D">
            <RibbonButton
              icon={<Wand2 size={26} color="#7C3AED" />}
              label="Auto 3D models"
              onClick={onAutoAssignModels}
              title="Auto-assign 3D library models to every station/buffer based on name + type"
              disabled={model.stations.length + model.buffers.length + model.extraNodes.length === 0}
            />
            <RibbonButton
              icon={<GlobeIcon size={26} color="#0891B2" />}
              label="Open in 3D World"
              onClick={openInScenarioWorld}
              title="Open the current model in the 3D World viewer with rigged robots and live animation"
              disabled={model.stations.length + model.buffers.length + model.extraNodes.length === 0}
            />
          </RibbonGroup>
        )}

        {!simpleMode && (
          <RibbonGroup label="Animation">
            <RibbonStack>
              <label className="ribbon-field" title="Maximum animated operators in the live view">
                <span>Operators</span>
                <input type="number" min={1} max={50} value={maxOperators} style={{ width: 48 }}
                  onChange={(e) => useLiveSimulationStore.getState().setMaxOperators(parseInt(e.target.value) || 1)} />
              </label>
              <label className="ribbon-field" title="Maximum animated forklifts in the live view">
                <span>Forklifts</span>
                <input type="number" min={1} max={20} value={maxForklifts} style={{ width: 48 }}
                  onChange={(e) => useLiveSimulationStore.getState().setMaxForklifts(parseInt(e.target.value) || 1)} />
              </label>
            </RibbonStack>
          </RibbonGroup>
        )}
      </RibbonContent>

      {/* Inline validation warnings */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className={`px-4 py-1.5 text-xs flex items-center space-x-3 border-b ${errorCount > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          <span className="font-medium">
            {errorCount > 0 && `${errorCount} error${errorCount > 1 ? 's' : ''}`}
            {errorCount > 0 && warningCount > 0 && ', '}
            {warningCount > 0 && `${warningCount} warning${warningCount > 1 ? 's' : ''}`}
          </span>
          <span className="text-gray-400">|</span>
          <span>{validationIssues.filter(i => i.severity !== 'info').slice(0, 3).map(i => i.message).join(' · ')}</span>
        </div>
      )}

      {/* Workspace: outline (left) · graphics (centre) · properties (right) */}
      <div className="flex-1 flex min-h-0" style={{ gap: 0 }}>
        <DockPanel title="Outline" style={{ width: 230, flexShrink: 0, borderTop: 'none', borderLeft: 'none', borderBottom: 'none' }}>
          <ModelOutline
            onSelect={(id) => {
              setSelectedNode(id);
              rfInstance.current?.fitView({ nodes: [{ id }] as any, padding: 2, maxZoom: 1, duration: 300 });
            }}
          />
        </DockPanel>
        <div className="flex-1 flex flex-col min-w-0">
        <div className="graphics-title">
          <span><b style={{ fontWeight: 600 }}>{viewMode === '3d' ? '3D view' : 'Layout'}</b>{' — '}{model.name || 'Untitled model'}</span>
          <span style={{ color: '#64748B' }}>{nodes.length} elements · {edges.length} connections</span>
        </div>
        <div className="flex-1 relative">
          {viewMode === '3d' ? (
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center" style={{ background: '#1c2333' }}>
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mx-auto mb-4" style={{ boxShadow: '0 0 12px rgba(59,130,246,0.5)' }}></div>
                  <p style={{ color: '#94a3b8', fontSize: 13, letterSpacing: '0.05em' }}>Initialising 3D Factory…</p>
                </div>
              </div>
            }>
              <Factory3DView />
            </Suspense>
          ) : (
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
            <Background variant={BackgroundVariant.Dots} color="#cbd5e1" gap={20} size={1.5} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  station: '#93c5fd',    // blue-300
                  buffer: '#fcd34d',     // amber-300
                  source: '#86efac',     // green-300
                  sink: '#fca5a5',       // red-300
                  conveyor: '#fcd34d',   // amber-300
                  operator: '#c4b5fd',   // violet-300
                  inspection: '#67e8f9', // cyan-300
                  assembly: '#a5b4fc',   // indigo-300
                  splitter: '#5eead4',   // teal-300
                  merge: '#6ee7b7',      // emerald-300
                  disassembly: '#fdba74', // orange-300
                  palletize: '#fbbf24',  // amber-400
                  depalletize: '#fde047', // yellow-300
                  matchbuffer: '#d8b4fe', // purple-300
                };
                return colors[node.type || 'station'] || '#64748b';
              }}
              style={{ height: 120, width: 200 }}
              maskColor="rgba(241,245,249,0.7)"
              maskStrokeColor="#2563EB"
              maskStrokeWidth={2}
              pannable
              zoomable
            />
            <Panel position="bottom-center">
              <div className="rf-hint-panel" style={{
                background: 'rgba(15,23,42,0.8)',
                backdropFilter: 'blur(6px)',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 11,
                letterSpacing: '0.01em',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                {isSimulating ? (
                  <>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80', display: 'inline-block', animation: 'replay-blink 1.5s ease-in-out infinite' }} />
                    Simulation running — canvas is live
                  </>
                ) : (
                  <>
                    <span style={{ opacity: 0.5 }}>Drag handle to connect</span>
                    <span style={{ opacity: 0.25 }}>·</span>
                    <span style={{ opacity: 0.5 }}>Del to remove</span>
                    <span style={{ opacity: 0.25 }}>·</span>
                    <span style={{ opacity: 0.5 }}>Ctrl+F to search</span>
                  </>
                )}
              </div>
            </Panel>
            <Panel position="top-right">
              <div className="flex flex-col gap-2">
                <FloorPlanToolbar />
              </div>
            </Panel>
            <FloorPlanOverlay />
            <TransportNetworkOverlay />
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
          )}
        </div>
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
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: (nodeInfo as any)?.accent || '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            boxShadow: `0 2px 8px ${(nodeInfo as any)?.accent || '#64748b'}55`,
          }}>
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




