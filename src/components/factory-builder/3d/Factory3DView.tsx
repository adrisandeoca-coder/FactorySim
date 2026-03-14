import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useModelStore } from '../../../stores/modelStore';
import { useLiveSimulationStore } from '../../../stores/liveSimulationStore';
import { useSimulationStore } from '../../../stores/simulationStore';
import { MODEL_BUILDERS } from './machines/MachineRegistry';
import { setStatusLampState } from './shared/helpers';
import { M } from './shared/materials';

// ── Constants ──────────────────────────────────────────────────────────────────

const SCALE = 0.012;

// ── Label Texture Helper ───────────────────────────────────────────────────────

function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 512;
  canvas.height = 128;

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // background pill
  const metrics = ctx.measureText(text);
  const pw = metrics.width + 32;
  const ph = 64;
  const px = (canvas.width - pw) / 2;
  const py = (canvas.height - ph) / 2;
  ctx.fillStyle = 'rgba(15,23,42,0.82)';
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.fill();

  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Selection Ring ─────────────────────────────────────────────────────────────

function createSelectionRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.7, 0.9, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  return ring;
}

// ── Connection — steel conveyor strip per edge ───────────────────────────────

const CONN_GEO = new THREE.BoxGeometry(1, 1, 1); // shared, scaled per connection
const CONN_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.78, roughness: 0.28 }); // steel — catches light
const ARROW_MAT = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.2, roughness: 0.5, emissive: 0xfbbf24, emissiveIntensity: 0.25 });
const ARROW_GEO = new THREE.ConeGeometry(0.04, 0.08, 3);
const FOOTPRINT_GEO = new THREE.BoxGeometry(1, 0.005, 1);
const FOOTPRINT_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.98, metalness: 0 });
// Glass panel for stations — shared
const GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x88bbdd, metalness: 0.0, roughness: 0.05,
  transparent: true, opacity: 0.15, side: THREE.DoubleSide,
});
const GLASS_GEO = new THREE.BoxGeometry(1, 1, 0.02); // shared, scaled

// ── Conveyor parts — small boxes that travel along connections ──
const CONV_PART_GEO = new THREE.BoxGeometry(0.14, 0.09, 0.11);
const CONV_PART_COLORS = [0x4488cc, 0xcc8844, 0x88aa88, 0x5588bb, 0xbb7744];

interface ConveyorPart {
  mesh: THREE.Mesh;
  t: number;           // 0→1 position along path
  speed: number;       // units per second
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  edgeKey: string;
}

interface ConnectionGroup extends THREE.Group {
  userData: {
    edgeKey: string;
    flowRate: number;
    beltMesh: THREE.Mesh;
    arrowMesh: THREE.Mesh;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    dist: number;
  };
}

function createConveyorConnection(
  start: THREE.Vector3,
  end: THREE.Vector3,
  flowRate: number = 0,
  maxFlowRate: number = 1
): ConnectionGroup {
  const g = new THREE.Group() as ConnectionGroup;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);

  // Flow-driven thickness: thin (0.044) to thick (0.144) — 3.3× range
  const flowFactor = maxFlowRate > 0 ? flowRate / maxFlowRate : 0;
  const halfW = 0.022 + flowFactor * 0.050;

  // Single flat steel conveyor strip
  const beltMat = CONN_MAT.clone();
  const belt = new THREE.Mesh(CONN_GEO, beltMat);
  belt.scale.set(halfW * 2, 0.02, dist);
  belt.position.set((start.x + end.x) / 2, 0.22, (start.z + end.z) / 2);
  belt.rotation.y = angle;
  g.add(belt);

  // Single direction arrow at midpoint
  const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT);
  arrow.position.set((start.x + end.x) / 2, 0.26, (start.z + end.z) / 2);
  const dir = new THREE.Vector3(dx, 0, dz).normalize();
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(arrow);

  g.userData = {
    edgeKey: '',
    flowRate,
    beltMesh: belt,
    arrowMesh: arrow,
    startPos: start.clone(),
    endPos: end.clone(),
    dist,
  } as any;

  return g;
}

// ── Station Name → Variant Mapping ──────────────────────────────────────────

function getNodeBuilder(type: string, name: string): () => THREE.Group {
  const lower = name.toLowerCase();

  if (type === 'station') {
    if (lower.includes('cnc') || lower.includes('mill') || lower.includes('turn') || lower.includes('lathe'))
      return MODEL_BUILDERS['cncmill'] || MODEL_BUILDERS['station'];
    if (lower.includes('grind'))
      return MODEL_BUILDERS['grinder'] || MODEL_BUILDERS['station'];
    if (lower.includes('heat') || lower.includes('furnace') || lower.includes('treat') || lower.includes('oven'))
      return MODEL_BUILDERS['heattreat'] || MODEL_BUILDERS['station'];
    if (lower.includes('fill'))
      return MODEL_BUILDERS['filling'] || MODEL_BUILDERS['station'];
    if (lower.includes('label'))
      return MODEL_BUILDERS['labeling'] || MODEL_BUILDERS['station'];
    if (lower.includes('qc') || lower.includes('quality') || lower.includes('inspect') || lower.includes('sampling') || lower.includes('check'))
      return MODEL_BUILDERS['qcstation'] || MODEL_BUILDERS['inspection'];
  }

  // Buffer variants by name
  if (type === 'buffer') {
    if (lower.includes('lifo') || lower.includes('stack') || lower.includes('staging'))
      return MODEL_BUILDERS['lifobuffer'] || MODEL_BUILDERS['buffer'];
    if (lower.includes('sync') || lower.includes('match') || lower.includes('part sync'))
      return MODEL_BUILDERS['matchbuffer'] || MODEL_BUILDERS['buffer'];
  }

  // Conveyor variants
  if (type === 'conveyor') {
    if (lower.includes('pallet'))
      return MODEL_BUILDERS['palletconveyor'] || MODEL_BUILDERS['conveyor'];
  }

  // Merge variants
  if (type === 'merge') {
    if (lower.includes('priority'))
      return MODEL_BUILDERS['prioritymerge'] || MODEL_BUILDERS['merge'];
  }

  return MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
}

// ── Simulation Animation System ──────────────────────────────────────────────

const PRODUCT_COLORS = [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4, 0xf97316];
const PRODUCT_Y = 0.5;
const TRAVEL_SPEED = 3.5;
const MAX_PRODUCTS = 60;

const STATE_COLORS: Record<string, number> = {
  idle: 0x94a3b8, processing: 0x22c55e, blocked: 0xef4444,
  starved: 0xf59e0b, failed: 0xb91c1c, off_shift: 0x475569, setup: 0x8b5cf6,
};

interface AnimProduct {
  mesh: THREE.Mesh;
  curve: THREE.QuadraticBezierCurve3;
  curveLen: number;
  progress: number;
  speed: number;
  alive: boolean;
  processingAt: string | null;
  processDuration: number;
}

class SimulationAnimator {
  private scene: THREE.Scene;
  private products: AnimProduct[] = [];
  private processedEvents = new Set<string>();
  private productColorMap = new Map<string, number>();
  private colorIdx = 0;
  private nodePositions = new Map<string, THREE.Vector3>();
  private nameToId = new Map<string, string>();
  private edgeIncoming = new Map<string, string[]>();
  private edgeOutgoing = new Map<string, string[]>();
  private partGeos = {
    raw: new THREE.BoxGeometry(0.10, 0.08, 0.10),        // small rough box
    inProcess: new THREE.BoxGeometry(0.12, 0.09, 0.12),  // machined block
    finished: new THREE.BoxGeometry(0.10, 0.08, 0.10),   // clean part
    fallback: new THREE.BoxGeometry(0.11, 0.09, 0.11),
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  updateTopology(model: { stations: any[]; buffers: any[]; extraNodes: any[]; connections: any[] }) {
    this.nodePositions.clear();
    this.nameToId.clear();
    this.edgeIncoming.clear();
    this.edgeOutgoing.clear();

    for (const s of model.stations) {
      this.nodePositions.set(s.id, new THREE.Vector3(s.position.x * SCALE, PRODUCT_Y, s.position.y * SCALE));
      this.nameToId.set(s.name, s.id);
    }
    for (const b of model.buffers) {
      this.nodePositions.set(b.id, new THREE.Vector3(b.position.x * SCALE, PRODUCT_Y, b.position.y * SCALE));
      this.nameToId.set(b.name, b.id);
    }
    for (const e of model.extraNodes) {
      this.nodePositions.set(e.id, new THREE.Vector3(e.position.x * SCALE, PRODUCT_Y, e.position.y * SCALE));
      this.nameToId.set(e.data?.name || e.type, e.id);
    }
    for (const c of model.connections) {
      if (!this.edgeIncoming.has(c.target)) this.edgeIncoming.set(c.target, []);
      this.edgeIncoming.get(c.target)!.push(c.source);
      if (!this.edgeOutgoing.has(c.source)) this.edgeOutgoing.set(c.source, []);
      this.edgeOutgoing.get(c.source)!.push(c.target);
    }
  }

  private getColor(productType: string): number {
    if (!this.productColorMap.has(productType)) {
      this.productColorMap.set(productType, PRODUCT_COLORS[this.colorIdx++ % PRODUCT_COLORS.length]);
    }
    return this.productColorMap.get(productType)!;
  }

  private spawn(sourceId: string, targetId: string, productType: string, processingAt?: string, processDuration?: number): AnimProduct | null {
    const src = this.nodePositions.get(sourceId);
    const tgt = this.nodePositions.get(targetId);
    if (!src || !tgt || this.products.length >= MAX_PRODUCTS) return null;

    const mid = new THREE.Vector3().addVectors(src, tgt).multiplyScalar(0.5);
    mid.y = PRODUCT_Y + Math.min(src.distanceTo(tgt) * 0.06, 0.4);
    const curve = new THREE.QuadraticBezierCurve3(src.clone(), mid, tgt.clone());
    const curveLen = curve.getLength();

    const color = this.getColor(productType);
    // Stage-appropriate part geometry + material
    let geo: THREE.BufferGeometry;
    let metalness = 0.1;
    let roughness = 0.4;
    if (productType === 'ambient' || productType === 'default') {
      geo = this.partGeos.fallback;
    } else if (processingAt) {
      geo = this.partGeos.raw;         // entering a station = raw material
      metalness = 0.05; roughness = 0.7;
    } else {
      geo = this.partGeos.inProcess;   // leaving a station = machined
      metalness = 0.5; roughness = 0.25;
    }

    const meshMat = new THREE.MeshStandardMaterial({
      color, roughness, metalness, emissive: color, emissiveIntensity: 0.08,
    });
    const mesh = new THREE.Mesh(geo, meshMat);
    mesh.position.copy(src);
    this.scene.add(mesh);

    const p: AnimProduct = {
      mesh, curve, curveLen, progress: 0,
      speed: TRAVEL_SPEED / curveLen, alive: true,
      processingAt: processingAt || null, processDuration: processDuration || 0,
    };
    this.products.push(p);
    return p;
  }

  processEvents(events: any[], stationProducts: Record<string, any>) {
    for (const evt of events) {
      const evtKey = `${evt.type}-${evt.entity_id}-${evt.time}`;
      if (this.processedEvents.has(evtKey)) continue;
      this.processedEvents.add(evtKey);
      if (this.processedEvents.size > 500) {
        const arr = [...this.processedEvents];
        this.processedEvents = new Set(arr.slice(-250));
      }

      // entity_id could be a station name — resolve to node ID
      const entityId = this.nameToId.get(evt.entity_id) || evt.entity_id;
      const d = evt.details || {};

      if (evt.type === 'processing_start') {
        const sources = this.edgeIncoming.get(entityId);
        if (sources?.length) {
          const productType = (d.product_type || d.productType || 'default') as string;
          const cycleTime = (d.cycle_time || d.cycleTime || 2) as number;
          this.spawn(sources[0], entityId, productType, entityId, cycleTime);
        }
      } else if (evt.type === 'processing_complete') {
        const targets = this.edgeOutgoing.get(entityId);
        if (targets?.length) {
          const productType = stationProducts[evt.entity_id]?.productType || 'default';
          this.spawn(entityId, targets[0], productType);
        }
      } else if (evt.type === 'source_generate') {
        const targets = this.edgeOutgoing.get(entityId);
        if (targets?.length) {
          const productType = (d.product_type || d.productType || 'default') as string;
          this.spawn(entityId, targets[0], productType);
        }
      }
    }
  }

  processAmbientFlow(edgeFlowCounts: Record<string, number>) {
    for (const [edgeKey, count] of Object.entries(edgeFlowCounts)) {
      if (count <= 0 || Math.random() > Math.min(0.3, count * 0.01)) continue;
      const [srcName, tgtName] = edgeKey.split('->');
      const srcId = this.nameToId.get(srcName) || srcName;
      const tgtId = this.nameToId.get(tgtName) || tgtName;
      const p = this.spawn(srcId, tgtId, 'ambient');
      if (p) p.speed *= 0.8 + Math.random() * 0.4;
    }
  }

  update(dt: number, elapsed: number) {
    const toRemove: number[] = [];
    this.products.forEach((p, i) => {
      if (!p.alive) { toRemove.push(i); return; }
      p.progress += p.speed * dt;

      if (p.progress >= 1) {
        if (p.processingAt && p.processDuration > 0) {
          p.mesh.position.copy(p.curve.getPoint(1));
          p.processDuration -= dt;
          const pulse = 1 + Math.sin(elapsed * 8) * 0.06;
          p.mesh.scale.set(pulse, pulse, pulse);
          if (p.processDuration <= 0) p.alive = false;
          return;
        }
        p.alive = false;
        return;
      }

      const point = p.curve.getPoint(p.progress);
      p.mesh.position.copy(point);
      p.mesh.position.y += Math.sin(elapsed * 12 + p.progress * 30) * 0.003;
      const tangent = p.curve.getTangent(p.progress);
      p.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
      p.mesh.scale.setScalar(1);
    });

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const p = this.products[toRemove[i]];
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.MeshStandardMaterial).dispose();
      this.products.splice(toRemove[i], 1);
    }
  }

  updateStationStates(stationStates: Record<string, string>, nodeGroups: Map<string, THREE.Group>) {
    for (const [name, state] of Object.entries(stationStates)) {
      const id = this.nameToId.get(name);
      if (!id) continue;
      const group = nodeGroups.get(id);
      if (!group) continue;

      // Update andon lamp stack (new detailed models)
      setStatusLampState(group, state);

      // Also update legacy statusLight sphere for backwards compat
      const statusLight = group.children.find(c => c.name === 'statusLight');
      if (statusLight && (statusLight as THREE.Mesh).isMesh) {
        const color = STATE_COLORS[state] || STATE_COLORS.idle;
        const m = (statusLight as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.color.setHex(color);
        if (m.emissive) m.emissive.setHex(color);
      }
    }
  }

  clear() {
    this.products.forEach(p => {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.MeshStandardMaterial).dispose();
    });
    this.products = [];
    this.processedEvents.clear();
  }

  dispose() {
    this.clear();
    this.partGeos.raw.dispose();
    this.partGeos.inProcess.dispose();
    this.partGeos.finished.dispose();
    this.partGeos.fallback.dispose();
  }
}

// ── Unified Node Position Lookup ───────────────────────────────────────────────

interface NodeInfo {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
}

function collectNodes(model: { stations: any[]; buffers: any[]; extraNodes: any[] }): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  for (const s of model.stations) {
    nodes.push({ id: s.id, name: s.name, type: 'station', position: s.position });
  }
  for (const b of model.buffers) {
    nodes.push({ id: b.id, name: b.name, type: 'buffer', position: b.position });
  }
  for (const e of model.extraNodes) {
    nodes.push({ id: e.id, name: e.data?.name || e.type, type: e.type, position: e.position });
  }
  return nodes;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Factory3DView() {
  const containerRef = useRef<HTMLDivElement>(null);

  // React subscriptions for model data
  const model = useModelStore(s => s.model);
  const selectedNodeId = useModelStore(s => s.selectedNodeId);
  const isSimulating = useSimulationStore(s => s.isRunning);

  // Refs for Three.js objects that persist across renders
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animFrameId: number;
    nodeGroups: Map<string, THREE.Group>;
    selectionRing: THREE.Mesh;
    connections: ConnectionGroup[];
    clock: THREE.Clock;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animator: SimulationAnimator;
    lastAmbientSpawn: number;
    bottleneckOrbit: THREE.PointLight;
    bottleneckLabel: THREE.Sprite;
    bottleneckNodeId: string;
    bottleneckMaxUtil: number;
    lastFlyToSignal: number;
    flyToTarget: THREE.Vector3 | null;
    flyToProgress: number;
    flyToStart: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
    conveyorParts: ConveyorPart[];
    lastConveyorSync: number;
  } | null>(null);

  // ── Click handler ──────────────────────────────────────────────────────────

  const handleClick = useCallback((e: MouseEvent) => {
    const s = sceneRef.current;
    if (!s || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(s.mouse, s.camera);

    // Gather all meshes in node groups
    const targets: THREE.Object3D[] = [];
    s.nodeGroups.forEach(group => group.traverse(child => {
      if ((child as THREE.Mesh).isMesh) targets.push(child);
    }));

    const hits = s.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      // Walk up to find the node group
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.nodeId) obj = obj.parent;
      if (obj?.userData.nodeId) {
        const store = useModelStore.getState();
        const clickedId = obj.userData.nodeId as string;
        store.setSelectedNode(clickedId === store.selectedNodeId ? null : clickedId);
        return;
      }
    }
    // Clicked empty space - deselect
    useModelStore.getState().setSelectedNode(null);
  }, []);

  // ── Init renderer, scene, camera, controls, lights, ground ─────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer — shadows disabled for performance with 60+ nodes
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0xd4dbe4);
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd4dbe4, 35, 90);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(6, 10, 6); // higher angle — shows more factory, less floor

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 60;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 15, 10);
    scene.add(dir);

    const hemi = new THREE.HemisphereLight(0xb0d4f1, 0x8b9467, 0.4);
    scene.add(hemi);

    // Factory floor — polished concrete look
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.85, metalness: 0.05 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Subtle floor grid — reduced divisions for performance
    const grid = new THREE.GridHelper(60, 15, 0x8894a0, 0x8894a0);
    grid.position.y = 0.003;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.15;
    scene.add(grid);

    // Yellow safety lane markings — only 2 cross lines to minimize draw calls
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.3 });
    const laneGeo = new THREE.BoxGeometry(40, 0.004, 0.05);
    const laneH = new THREE.Mesh(laneGeo, laneMat);
    laneH.position.set(0, 0.004, 0);
    scene.add(laneH);
    const laneV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 40), laneMat);
    laneV.position.set(0, 0.004, 0);
    scene.add(laneV);

    // Selection ring
    const selectionRing = createSelectionRing();
    scene.add(selectionRing);

    const clock = new THREE.Clock();

    const animator = new SimulationAnimator(scene);

    // Bottleneck orbiting light
    const bottleneckOrbit = new THREE.PointLight(0xff8800, 0, 5);
    bottleneckOrbit.name = '_orbitLight';
    scene.add(bottleneckOrbit);
    const bottleneckLabel = createTextSprite('⚠ BOTTLENECK');
    bottleneckLabel.visible = false;
    bottleneckLabel.scale.set(2.8, 0.7, 1);
    scene.add(bottleneckLabel);

    const state = {
      renderer,
      scene,
      camera,
      controls,
      animFrameId: 0,
      nodeGroups: new Map<string, THREE.Group>(),
      selectionRing,
      connections: [] as ConnectionGroup[],
      clock,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      animator,
      lastAmbientSpawn: 0,
      bottleneckOrbit,
      bottleneckLabel,
      bottleneckNodeId: '' as string,
      bottleneckMaxUtil: 0,
      // Camera fly-to state
      lastFlyToSignal: 0,
      flyToTarget: null as THREE.Vector3 | null,
      flyToProgress: 0,
      flyToStart: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null,
      // Conveyor parts — animated boxes on connections
      conveyorParts: [] as ConveyorPart[],
      lastConveyorSync: 0,
    };
    sceneRef.current = state;

    // Animation loop
    let frameCount = 0;
    function animate() {
      state.animFrameId = requestAnimationFrame(animate);
      state.controls.update();
      const dt = state.clock.getDelta();
      const elapsed = state.clock.elapsedTime;
      const safeDt = dt > 0.1 ? 0.016 : dt;
      frameCount++;

      // Get live simulation state once per frame
      const liveState = useLiveSimulationStore.getState();

      // ── Label LOD — throttled to every 4 frames ───────────
      if (frameCount % 4 === 0) {
        const selectedId = useModelStore.getState().selectedNodeId;
        state.nodeGroups.forEach(group => {
          group.traverse(child => {
            if ((child as THREE.Sprite).isSprite) {
              const sprite = child as THREE.Sprite;
              const distToNode = state.camera.position.distanceTo(group.position);
              let opacity = 1.0;
              if (distToNode > 14) opacity = 0;
              else if (distToNode > 6) opacity = 1 - (distToNode - 6) / 8;
              if (group.userData.nodeId === selectedId) opacity = 1;
              sprite.material.opacity = opacity;
              sprite.visible = opacity > 0.01;
            }
          });
        });
      }

      // ── Animate spindles + operators — throttled every 3 frames ─────
      if (frameCount % 3 === 0) {
        state.nodeGroups.forEach(group => {
          if (group.userData._spindle === undefined) {
            group.userData._spindle = group.getObjectByName('spindle') || null;
            group.userData._figure = group.getObjectByName('figure') || null;
            group.userData._armL = group.getObjectByName('armLeft') || null;
            group.userData._armR = group.getObjectByName('armRight') || null;
          }
          const spindle = group.userData._spindle;
          if (spindle) spindle.rotation.y = elapsed * 3;

          const figure = group.userData._figure;
          if (figure && group.userData.nodeType === 'operator') {
            figure.rotation.y = Math.sin(elapsed * 0.8) * 0.06;
            const armL = group.userData._armL;
            const armR = group.userData._armR;
            const isWorking = Object.values(liveState.stationStates).some(s => s === 'processing');
            const targetAngle = isWorking ? -0.5 : -0.15;
            if (armL) armL.rotation.x += (targetAngle - armL.rotation.x) * 0.08;
            if (armR) armR.rotation.x += (targetAngle - armR.rotation.x) * 0.08;
          }
        });
      }

      // ── Pulse selection ring ────────────────────────────────────────
      if (state.selectionRing.visible) {
        const scale = 1 + Math.sin(elapsed * 4) * 0.08;
        state.selectionRing.scale.set(scale, scale, scale);
      }

      // ── Simulation animation ────────────────────────────────────────
      state.animator.update(safeDt, elapsed);

      // Process live simulation events
      if (liveState.recentEvents.length > 0) {
        state.animator.processEvents(liveState.recentEvents, liveState.stationProducts);
      }
      // Ambient flow particles
      if (elapsed - state.lastAmbientSpawn > 0.8 && Object.keys(liveState.edgeFlowCounts).length > 0) {
        state.lastAmbientSpawn = elapsed;
        state.animator.processAmbientFlow(liveState.edgeFlowCounts);
      }
      // Station state colors
      state.animator.updateStationStates(liveState.stationStates, state.nodeGroups);

      // ── Connection state animation — throttled every 6 frames ─────
      // Visual hierarchy: active flow = teal/green tint, no flow = dim steel, blocked = subtle warm
      if (frameCount % 6 === 0) {
        state.connections.forEach(conn => {
          const edgeKey = conn.userData.edgeKey;
          const flow = liveState.edgeFlowCounts[edgeKey] || 0;
          const parts = edgeKey.split('->');
          const tgtState = liveState.stationStates[parts[1]] || '';

          const bm = conn.userData.beltMesh.material as THREE.MeshStandardMaterial;
          if (flow > 0) {
            // Active flow — subtle green-steel tint
            bm.color.setHex(0x2a3a30);
            bm.emissive.setHex(0x002211);
            bm.emissiveIntensity = Math.min(0.15, flow * 0.002);
          } else if (tgtState === 'blocked') {
            // Blocked target — subtle warm tint (NOT red)
            bm.color.setHex(0x3a3028);
            bm.emissive.setHex(0x221100);
            bm.emissiveIntensity = 0.08;
          } else {
            // No flow / starved — neutral dim steel
            bm.color.setHex(0x2a3040);
            bm.emissive.setHex(0x000000);
            bm.emissiveIntensity = 0;
          }
          // Chevron arrows only visible when flow is active
          conn.userData.arrowMesh.visible = flow > 0;
        });
      }

      // ── Conveyor parts — spawn/sync every 20 frames, animate every frame ──
      if (frameCount % 20 === 0 && Object.keys(liveState.edgeFlowCounts).length > 0) {
        // Compute max flow for relative part density
        let maxFlow = 1;
        for (const count of Object.values(liveState.edgeFlowCounts)) {
          if (count > maxFlow) maxFlow = count;
        }

        // Build set of active edge keys
        const activeEdges = new Set<string>();
        state.connections.forEach(conn => {
          const edgeKey = conn.userData.edgeKey;
          const flow = liveState.edgeFlowCounts[edgeKey] || 0;
          if (flow <= 0) return;
          activeEdges.add(edgeKey);

          // Count existing parts for this edge
          const existing = state.conveyorParts.filter(p => p.edgeKey === edgeKey).length;
          const desired = Math.min(4, Math.max(1, Math.floor((flow / maxFlow) * 4)));

          // Remove excess parts if flow decreased
          if (existing > desired) {
            let removed = 0;
            for (let i = state.conveyorParts.length - 1; i >= 0 && removed < existing - desired; i--) {
              if (state.conveyorParts[i].edgeKey === edgeKey) {
                state.scene.remove(state.conveyorParts[i].mesh);
                (state.conveyorParts[i].mesh.material as THREE.Material).dispose();
                state.conveyorParts.splice(i, 1);
                removed++;
              }
            }
          } else if (existing < desired) {
            // Spawn new parts evenly spaced
            for (let i = existing; i < desired; i++) {
              const colorIdx = (state.conveyorParts.length + i) % CONV_PART_COLORS.length;
              const partMat = new THREE.MeshStandardMaterial({
                color: CONV_PART_COLORS[colorIdx],
                metalness: 0.4, roughness: 0.5,
              });
              const mesh = new THREE.Mesh(CONV_PART_GEO, partMat);
              mesh.position.copy(conn.userData.startPos);
              state.scene.add(mesh);
              state.conveyorParts.push({
                mesh,
                t: i / desired, // evenly spaced
                speed: 0.3 + (flow / maxFlow) * 0.4, // faster on busy lines
                startPos: conn.userData.startPos.clone(),
                endPos: conn.userData.endPos.clone(),
                edgeKey,
              });
            }
          }
        });

        // Remove parts on edges that no longer have flow
        for (let i = state.conveyorParts.length - 1; i >= 0; i--) {
          if (!activeEdges.has(state.conveyorParts[i].edgeKey)) {
            state.scene.remove(state.conveyorParts[i].mesh);
            (state.conveyorParts[i].mesh.material as THREE.Material).dispose();
            state.conveyorParts.splice(i, 1);
          }
        }
      }
      // Animate all conveyor parts every frame
      for (const part of state.conveyorParts) {
        part.t += part.speed * safeDt;
        if (part.t > 1) part.t -= 1;
        // Lerp along straight line at conveyor height
        part.mesh.position.lerpVectors(part.startPos, part.endPos, part.t);
        part.mesh.position.y = 0.30; // slightly above belt surface
        // Rotate to face direction of travel
        const dx = part.endPos.x - part.startPos.x;
        const dz = part.endPos.z - part.startPos.z;
        part.mesh.rotation.y = Math.atan2(dx, dz);
      }

      // ── Buffer + Sink fill-level visualization — throttled every 5 frames ──
      const bufferLevels = liveState.bufferLevels;
      if (frameCount % 5 === 0) {
        state.nodeGroups.forEach(group => {
          const nodeType = group.userData.nodeType;
          const nodeName = group.userData.nodeName;

          // Buffer fill from bufferLevels — all queue/buffer types
          const isBufferType = nodeType === 'buffer' || nodeType === 'conveyor' ||
            (nodeName && (
              nodeName.toLowerCase().includes('queue') ||
              nodeName.toLowerCase().includes('buffer') ||
              nodeName.toLowerCase().includes('staging') ||
              nodeName.toLowerCase().includes('wip')
            ));
          if (isBufferType && Object.keys(bufferLevels).length > 0) {
            const bl = bufferLevels[nodeName];
            if (!bl) return;
            const fillRatio = bl.capacity > 0 ? bl.level / bl.capacity : 0;
            const fillGroup = group.getObjectByName('fillGroup');
            if (fillGroup) {
              const bins: THREE.Mesh[] = [];
              fillGroup.traverse(c => {
                if ((c as THREE.Mesh).isMesh && c.name.startsWith('bin_')) bins.push(c as THREE.Mesh);
              });
              const visibleCount = Math.round(fillRatio * bins.length);
              bins.forEach((bin, i) => {
                bin.visible = i < visibleCount;
                const bm = bin.material as THREE.MeshStandardMaterial;
                if (fillRatio > 0.8) {
                  bm.color.setHex(0xdd3333);
                  bm.emissive.setHex(0x331111);
                  bm.emissiveIntensity = 0.3;
                } else if (fillRatio > 0.5) {
                  bm.color.setHex(0xddaa22);
                  bm.emissive.setHex(0x332200);
                  bm.emissiveIntensity = 0.15;
                } else {
                  bm.color.setHex(0x3388cc);
                  bm.emissive.setHex(0x000000);
                  bm.emissiveIntensity = 0;
                }
              });
            }
          }

          // Sink fill — count incoming flow to estimate fill level
          if (nodeType === 'sink') {
            const fillGroup = group.getObjectByName('fillGroup');
            if (fillGroup) {
              // Sum up total flow into this sink
              let totalFlow = 0;
              for (const [key, count] of Object.entries(liveState.edgeFlowCounts)) {
                if (key.endsWith(`->${nodeName}`)) totalFlow += count;
              }
              const fillRatio = Math.min(1.0, totalFlow / 100); // scale: 100 parts = full
              const bins: THREE.Mesh[] = [];
              fillGroup.traverse(c => {
                if ((c as THREE.Mesh).isMesh && c.name.startsWith('bin_')) bins.push(c as THREE.Mesh);
              });
              const visibleCount = Math.round(fillRatio * bins.length);
              bins.forEach((bin, i) => { bin.visible = i < visibleCount; });
            }
          }
        });
      }

      // ── Bottleneck identification via utilization — every 10 frames ──
      if (frameCount % 10 === 0) {
        const utilEntries = Object.entries(liveState.stationUtilizations || {});
        let bottleneckId = '';
        let maxUtil = 0;
        for (const [name, util] of utilEntries) {
          if (util > maxUtil) {
            maxUtil = util;
            const id = state.animator['nameToId']?.get(name);
            if (id) bottleneckId = id;
          }
        }
        // Always track highest-utilization station so fly-to-bottleneck works
        // (visual bottleneck indicator still only shows when utilization > 80%)
        state.bottleneckNodeId = bottleneckId;
        state.bottleneckMaxUtil = maxUtil;

        // Update station visual states — strict hierarchy:
        // Processing: normal body, green lamp, interior light bright
        // Starved: normal body, yellow lamp ONLY — no shell tint, no red
        // Blocked: subtle orange shell emissive 0.06, red lamp, footprint warm
        // Failed: red shell pulse, red footprint glow
        // Idle: normal body, blue dim lamp
        // Off-shift: everything dim, interior light off
        const stationStateEntries = Object.entries(liveState.stationStates);
        for (const [name, st] of stationStateEntries) {
          const id = state.animator['nameToId']?.get(name);
          if (!id) continue;
          const group = state.nodeGroups.get(id);
          if (!group) continue;

          // Skip bottleneck node — handled separately
          if (id === state.bottleneckNodeId) continue;

          group.scale.setScalar(1.0);

          // Interior light — ALWAYS stays blue, only intensity changes
          const il = group.getObjectByName('interiorLight') as THREE.PointLight;
          if (il) {
            il.color.setHex(0x80d0ff); // fixed blue-white, never changes color
            if (st === 'processing') il.intensity = 0.9;
            else if (st === 'off_shift') il.intensity = 0;
            else if (st === 'idle') il.intensity = 0.3;
            else il.intensity = 0.5;
          }

          // Reset shell emissive on all body meshes first
          group.traverse(child => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
            const m = mesh.material as THREE.MeshStandardMaterial;
            if (!m.emissive || m.transparent) return;
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          });

          // Reset footprint
          const fp = group.getObjectByName('_footprint') as THREE.Mesh;
          if (fp) {
            const fm = fp.material as THREE.MeshStandardMaterial;
            fm.emissive.setHex(0x000000);
            fm.emissiveIntensity = 0;
          }

          // Apply shell tint ONLY for blocked and failed
          if (st === 'blocked') {
            group.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
              const m = mesh.material as THREE.MeshStandardMaterial;
              if (!m.emissive || m.transparent) return;
              m.emissive.setHex(0xff2200);
              m.emissiveIntensity = 0.06;
            });
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0xff1100);
              fm.emissiveIntensity = 0.04;
            }
          } else if (st === 'failed') {
            const pulse = 0.08 + 0.07 * Math.sin(elapsed * 6);
            group.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
              const m = mesh.material as THREE.MeshStandardMaterial;
              if (!m.emissive || m.transparent) return;
              m.emissive.setHex(0xff0000);
              m.emissiveIntensity = pulse;
            });
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0xff0000);
              fm.emissiveIntensity = 0.10;
            }
          }
          // Starved, Processing, Idle, Off-shift, Setup: NO shell tint — lamp only
        }

        // Also update connection thickness dynamically
        let mfr = 1;
        for (const count of Object.values(liveState.edgeFlowCounts)) {
          if (count > mfr) mfr = count;
        }
        state.connections.forEach(conn => {
          const flow = liveState.edgeFlowCounts[conn.userData.edgeKey] || 0;
          const factor = mfr > 0 ? flow / mfr : 0;
          const halfW = 0.022 + factor * 0.050;
          // Update belt scale X to reflect flow thickness
          const belt = conn.userData.beltMesh;
          const currentZ = belt.scale.z; // preserve length
          belt.scale.set(halfW * 2, 0.02, currentZ);
          // Tint by flow intensity
          const bm = belt.material as THREE.MeshStandardMaterial;
          if (factor > 0.7) {
            bm.color.setHex(0x2a4a44); // teal for high flow
          } else if (factor > 0.3) {
            bm.color.setHex(0x2a3040); // neutral steel
          } else {
            bm.color.setHex(0x1a1e24); // dim for low flow
          }
        });
      }

      // ── Orbiting bottleneck light + shell pulse — runs every frame ──
      // Only show visual indicator when the bottleneck station has high utilization
      if (state.bottleneckNodeId && state.bottleneckMaxUtil > 0.8) {
        const bnGroup = state.nodeGroups.get(state.bottleneckNodeId);
        if (bnGroup) {
          // Orbiting amber light — wider radius, higher intensity
          const orbitAngle = elapsed * 0.9;
          state.bottleneckOrbit.position.set(
            bnGroup.position.x + Math.cos(orbitAngle) * 1.8,
            2.4,
            bnGroup.position.z + Math.sin(orbitAngle) * 1.8
          );
          state.bottleneckOrbit.intensity = 2.5 + 0.5 * Math.sin(elapsed * 5);
          state.bottleneckOrbit.color.setHex(0xff8800);

          // Bottleneck label always visible
          state.bottleneckLabel.visible = true;
          state.bottleneckLabel.position.set(
            bnGroup.position.x, 2.2, bnGroup.position.z
          );

          // Machine shell orange emissive pulse
          bnGroup.traverse(child => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const name = mesh.name;
            // Pulse the main body/shell meshes, skip lamps/lights/footprints
            if (name.startsWith('lamp_') || name === '_footprint' || name === 'statusLight') return;
            const m = mesh.material as THREE.MeshStandardMaterial;
            if (!m.emissive) return;
            // Only pulse opaque body meshes (not glass, not tiny details)
            if (m.transparent) return;
            // Cache original emissive if not already saved
            if (mesh.userData._origEmissive === undefined) {
              mesh.userData._origEmissive = m.emissive.getHex();
              mesh.userData._origEmissiveI = m.emissiveIntensity;
            }
            m.emissive.setHex(0xff4400);
            m.emissiveIntensity = 0.1 + 0.08 * Math.sin(elapsed * 3);
          });

          // Footprint amber glow — pulsing
          const fp = bnGroup.getObjectByName('_footprint') as THREE.Mesh;
          if (fp) {
            const fm = fp.material as THREE.MeshStandardMaterial;
            fm.emissive.setHex(0xff6600);
            fm.emissiveIntensity = 0.2 + 0.1 * Math.sin(elapsed * 2);
          }

          // Status lamp blinks 3× faster (rapid red flash)
          if (frameCount % 2 === 0) {
            const lampRed = bnGroup.getObjectByName('lamp_red') as THREE.Mesh;
            if (lampRed) {
              const lm = lampRed.material as THREE.MeshStandardMaterial;
              const flash = Math.sin(elapsed * 12) > 0;
              lm.emissive.setHex(flash ? 0xff2200 : 0x440000);
              lm.emissiveIntensity = flash ? 2.5 : 0.2;
              lm.color.setHex(flash ? 0xff4400 : 0x440000);
            }
          }
        }
      } else {
        state.bottleneckOrbit.intensity = 0;
        state.bottleneckLabel.visible = false;
        // Reset all shell glows and footprints
        if (frameCount % 30 === 0) {
          state.nodeGroups.forEach(g => {
            // Reset footprint
            const fp = g.getObjectByName('_footprint') as THREE.Mesh;
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0x000000);
              fm.emissiveIntensity = 0;
            }
            // Restore original emissive on all meshes
            g.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.userData._origEmissive !== undefined) {
                const m = mesh.material as THREE.MeshStandardMaterial;
                m.emissive.setHex(mesh.userData._origEmissive);
                m.emissiveIntensity = mesh.userData._origEmissiveI;
                delete mesh.userData._origEmissive;
                delete mesh.userData._origEmissiveI;
              }
            });
          });
        }
      }

      // ── Camera fly-to bottleneck — smooth animation ──
      const flySignal = useLiveSimulationStore.getState().flyToBottleneck3DSignal;
      if (flySignal > state.lastFlyToSignal) {
        state.lastFlyToSignal = flySignal;
        // Find the current bottleneck node position
        if (state.bottleneckNodeId) {
          const bnGroup = state.nodeGroups.get(state.bottleneckNodeId);
          if (bnGroup) {
            state.flyToTarget = bnGroup.position.clone();
            state.flyToProgress = 0;
            state.flyToStart = {
              pos: state.camera.position.clone(),
              target: state.controls.target.clone(),
            };
          }
        }
      }
      // Animate fly-to
      if (state.flyToTarget && state.flyToStart && state.flyToProgress < 1) {
        state.flyToProgress = Math.min(1, state.flyToProgress + safeDt * 1.5);
        const t = 1 - Math.pow(1 - state.flyToProgress, 3); // ease-out cubic
        const dest = state.flyToTarget;
        const endPos = new THREE.Vector3(dest.x + 4, 4.5, dest.z + 4);
        state.camera.position.lerpVectors(state.flyToStart.pos, endPos, t);
        state.controls.target.lerpVectors(state.flyToStart.target, dest, t);
        state.controls.update();
      }

      renderer.render(scene, camera);
    }
    animate();

    // Click handler
    renderer.domElement.addEventListener('click', handleClick);

    // Resize
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(state.animFrameId);
      renderer.domElement.removeEventListener('click', handleClick);
      ro.disconnect();
      controls.dispose();

      // Dispose all geometries and materials
      scene.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(m => {
            if ((m as THREE.MeshStandardMaterial).map) (m as THREE.MeshStandardMaterial).map!.dispose();
            m.dispose();
          });
        }
        if ((obj as THREE.Sprite).isSprite) {
          const sprite = obj as THREE.Sprite;
          sprite.material.map?.dispose();
          sprite.material.dispose();
        }
      });

      // Clean up conveyor parts
      for (const part of state.conveyorParts) {
        state.scene.remove(part.mesh);
        (part.mesh.material as THREE.Material).dispose();
      }
      state.conveyorParts = [];

      state.animator.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []); // init once

  // ── Sync nodes & connections from model ────────────────────────────────────

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    const nodes = collectNodes(model);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Update simulation animator topology
    s.animator.updateTopology(model);

    // Determine which nodes to add / remove
    const currentIds = new Set(nodes.map(n => n.id));
    const existingIds = new Set(s.nodeGroups.keys());

    // Remove stale nodes
    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        const group = s.nodeGroups.get(id)!;
        s.scene.remove(group);
        group.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry.dispose();
            const mats = Array.isArray((obj as THREE.Mesh).material) ? (obj as THREE.Mesh).material as THREE.Material[] : [(obj as THREE.Mesh).material as THREE.Material];
            mats.forEach(m => m.dispose());
          }
          if ((obj as THREE.Sprite).isSprite) {
            (obj as THREE.Sprite).material.map?.dispose();
            (obj as THREE.Sprite).material.dispose();
          }
        });
        s.nodeGroups.delete(id);
      }
    });

    // ── Minimum spacing enforcement — push apart overlapping nodes ──
    const MIN_DIST = 1.8; // minimum center-to-center distance in 3D units
    const positions3d = new Map<string, { x: number; z: number }>();
    nodes.forEach(n => {
      positions3d.set(n.id, { x: n.position.x * SCALE, z: n.position.y * SCALE });
    });
    // Iterative repulsion — 3 passes
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions3d.get(nodes[i].id)!;
          const b = positions3d.get(nodes[j].id)!;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < MIN_DIST && dist > 0.01) {
            const push = (MIN_DIST - dist) / 2;
            const nx = dx / dist;
            const nz = dz / dist;
            a.x -= nx * push;
            a.z -= nz * push;
            b.x += nx * push;
            b.z += nz * push;
          }
        }
      }
    }

    // Add or update nodes
    nodes.forEach(n => {
      const pos = positions3d.get(n.id)!;
      const x3d = pos.x;
      const z3d = pos.z;

      if (s.nodeGroups.has(n.id)) {
        // Update position
        const group = s.nodeGroups.get(n.id)!;
        group.position.set(x3d, 0, z3d);
      } else {
        // Create new — use name-based variant for stations/buffers/merges
        const builder = getNodeBuilder(n.type, n.name);
        const group = builder();
        group.userData.nodeId = n.id;
        group.userData.nodeType = n.type;
        group.userData.nodeName = n.name;
        group.position.set(x3d, 0, z3d);

        // Add glass enclosure + interior light to stations that don't have one
        if (n.type === 'station' && !group.getObjectByName('interiorLight')) {
          // Glass side panels — scaled from shared geometry
          const glassL = new THREE.Mesh(GLASS_GEO, GLASS_MAT);
          glassL.scale.set(0.02, 0.8, 1.0);
          glassL.position.set(-0.65, 0.7, 0);
          group.add(glassL);
          const glassR = new THREE.Mesh(GLASS_GEO, GLASS_MAT);
          glassR.scale.set(0.02, 0.8, 1.0);
          glassR.position.set(0.65, 0.7, 0);
          group.add(glassR);
          // Interior light — capped intensity
          const iLight = new THREE.PointLight(0x80d0ff, 0.6, 2.0);
          iLight.position.set(0, 0.7, 0);
          iLight.name = 'interiorLight';
          group.add(iLight);
        }
        // Cap any existing interiorLight from machine builder
        const existingIL = group.getObjectByName('interiorLight') as THREE.PointLight;
        if (existingIL) {
          existingIL.intensity = Math.min(existingIL.intensity, 1.2);
        }

        // Scale sources down slightly so they're smaller than stations
        if (n.type === 'source') {
          group.scale.setScalar(0.82);
        }

        // Floor footprint — cloned material for per-node bottleneck glow
        const fpW = n.type === 'sink' ? 1.8 : n.type === 'source' ? 0.9 : n.type === 'conveyor' ? 1.4 : n.type === 'operator' ? 0.6 : 1.2;
        const fpD = n.type === 'sink' ? 1.3 : n.type === 'source' ? 0.7 : n.type === 'conveyor' ? 0.6 : n.type === 'operator' ? 0.6 : 1.0;
        const fpMat = FOOTPRINT_MAT.clone();
        const footprint = new THREE.Mesh(FOOTPRINT_GEO, fpMat);
        footprint.scale.set(fpW, 1, fpD);
        footprint.position.set(0, 0.003, 0);
        footprint.name = '_footprint';
        group.add(footprint);

        // Label
        const label = createTextSprite(n.name);
        label.position.set(0, 1.2, 0);
        group.add(label);

        // Orient operators toward their connected station + vest color by role
        if (n.type === 'operator') {
          const outgoing = model.connections.filter(c => c.source === n.id);
          const incoming = model.connections.filter(c => c.target === n.id);
          const connectedId = outgoing[0]?.target || incoming[0]?.source;
          if (connectedId) {
            const connNode = nodeMap.get(connectedId);
            if (connNode) {
              const dx = connNode.position.x * SCALE - x3d;
              const dz = connNode.position.y * SCALE - z3d;
              const figure = group.getObjectByName('figure');
              if (figure) {
                figure.rotation.y = Math.atan2(dx, dz);
              }
            }
          }
          // Vest color by name keywords
          const lower = n.name.toLowerCase();
          let vestColor = 0xff6600; // default orange
          if (lower.includes('qc') || lower.includes('quality') || lower.includes('inspect')) {
            vestColor = 0xffffff; // white for QC
          } else if (lower.includes('rush') || lower.includes('lead') || lower.includes('supervisor')) {
            vestColor = 0xffcc00; // yellow for rush/lead
          }
          group.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              const m = (child as THREE.Mesh).material;
              if (m === M.vest) {
                const newMat = M.vest.clone();
                newMat.color.setHex(vestColor);
                (child as THREE.Mesh).material = newMat;
              }
            }
          });
        }

        s.scene.add(group);
        s.nodeGroups.set(n.id, group);
      }
    });

    // Remove old connections and their conveyor parts
    s.connections.forEach(conn => {
      s.scene.remove(conn);
      conn.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = (obj as THREE.Mesh).material;
          if (m !== CONN_MAT && m !== ARROW_MAT && m !== FOOTPRINT_MAT) {
            (m as THREE.Material).dispose();
          }
        }
      });
    });
    s.connections = [];
    // Clear conveyor parts
    for (const part of s.conveyorParts) {
      s.scene.remove(part.mesh);
      (part.mesh.material as THREE.Material).dispose();
    }
    s.conveyorParts = [];

    // Get live flow data for thickness
    const liveState = useLiveSimulationStore.getState();

    // Compute maxFlowRate across all edges for relative thickness
    const flowCounts = liveState.edgeFlowCounts;
    let maxFlowRate = 1;
    for (const count of Object.values(flowCounts)) {
      if (count > maxFlowRate) maxFlowRate = count;
    }

    // Create connections — 2 meshes per connection (belt + arrow)
    // Use adjusted positions (post-spacing enforcement) so connections match actual node positions
    model.connections.forEach(conn => {
      const srcNode = nodeMap.get(conn.source);
      const tgtNode = nodeMap.get(conn.target);
      if (!srcNode || !tgtNode) return;
      const srcPos = positions3d.get(conn.source);
      const tgtPos = positions3d.get(conn.target);
      if (!srcPos || !tgtPos) return;
      const start = new THREE.Vector3(srcPos.x, 0.22, srcPos.z);
      const end = new THREE.Vector3(tgtPos.x, 0.22, tgtPos.z);

      const edgeKey = `${srcNode.name}->${tgtNode.name}`;
      const flowRate = flowCounts[edgeKey] || 0;

      const connection = createConveyorConnection(start, end, flowRate, maxFlowRate);
      connection.userData.edgeKey = edgeKey;
      s.scene.add(connection);
      s.connections.push(connection);
    });

    // Center camera on nodes (only when nodes exist and first time)
    if (nodes.length > 0) {
      let cx = 0, cz = 0;
      nodes.forEach(n => { cx += n.position.x * SCALE; cz += n.position.y * SCALE; });
      cx /= nodes.length;
      cz /= nodes.length;
      s.controls.target.set(cx, 0, cz);
      // Only reposition camera if it's still at default
      if (s.camera.position.x === 6 && s.camera.position.y === 10 && s.camera.position.z === 6) {
        s.camera.position.set(cx + 5, 8, cz + 5); // higher angle, tighter framing
      }
      s.controls.update();
    }
  }, [model.stations, model.buffers, model.extraNodes, model.connections]);

  // ── Sync selection highlight ───────────────────────────────────────────────

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    if (selectedNodeId && s.nodeGroups.has(selectedNodeId)) {
      const group = s.nodeGroups.get(selectedNodeId)!;
      s.selectionRing.visible = true;
      s.selectionRing.position.set(group.position.x, 0.02, group.position.z);
    } else {
      s.selectionRing.visible = false;
    }
  }, [selectedNodeId]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: '#d4dbe4' }}
      />
      {isSimulating && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(34,197,94,0.9)', color: 'white',
          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: 'white',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          Simulation Running — 3D Live View
        </div>
      )}
    </div>
  );
}
