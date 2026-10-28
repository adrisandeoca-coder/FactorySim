/**
 * SimulationAnimation3D — Animated 3D product flow during simulation.
 * Consumes events from liveSimulationStore and renders products
 * moving smoothly between nodes using Catmull-Rom spline paths.
 */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useModelStore } from '../../../stores/modelStore';
import { useLiveSimulationStore } from '../../../stores/liveSimulationStore';

// ── Constants ──
const TRAVEL_SPEED = 3.5; // world units per second
const PRODUCT_Y = 0.95;   // height of products on conveyor
const MAX_PRODUCTS = 60;
const SCALE = 0.012;       // must match Factory3DView

const PRODUCT_COLORS = [
  0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b,
  0x8b5cf6, 0xec4899, 0x06b6d4, 0xf97316,
];

function toWorld(pos: { x: number; y: number }): THREE.Vector3 {
  return new THREE.Vector3(pos.x * SCALE, PRODUCT_Y, pos.y * SCALE);
}

// ── Product entity tracked during animation ──
interface ProductEntity {
  id: string;
  mesh: THREE.Mesh;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  curve: THREE.QuadraticBezierCurve3;
  curveLen: number;
  progress: number;       // 0→1 along curve
  speed: number;          // progress per second
  alive: boolean;
  processingAt: string | null; // station name if paused
  processStartTime: number;
  processDuration: number;
}

export function SimulationAnimation3D() {
  const model = useModelStore(s => s.model);
  const recentEvents = useLiveSimulationStore(s => s.recentEvents);
  const stationProducts = useLiveSimulationStore(s => s.stationProducts);
  const edgeFlowCounts = useLiveSimulationStore(s => s.edgeFlowCounts);

  const productsRef = useRef<ProductEntity[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const processedEventIds = useRef(new Set<string>());
  const productColorMap = useRef(new Map<string, number>());
  const colorIdx = useRef(0);

  // Build lookup maps from model
  const { nodePositions, nameToId, edgeMap } = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    const n2id = new Map<string, string>();

    for (const s of model.stations) {
      positions.set(s.id, toWorld(s.position));
      n2id.set(s.name, s.id);
    }
    for (const b of model.buffers) {
      positions.set(b.id, toWorld(b.position));
      n2id.set(b.name, b.id);
    }
    for (const e of model.extraNodes) {
      positions.set(e.id, toWorld(e.position));
      n2id.set(e.data.name || e.type, e.id);
    }

    // Edge adjacency: for each target node, find source node(s)
    const edges = new Map<string, string[]>(); // target → [source1, source2, ...]
    const outEdges = new Map<string, string[]>(); // source → [target1, target2, ...]
    for (const c of model.connections) {
      if (!edges.has(c.target)) edges.set(c.target, []);
      edges.get(c.target)!.push(c.source);
      if (!outEdges.has(c.source)) outEdges.set(c.source, []);
      outEdges.get(c.source)!.push(c.target);
    }

    return { nodePositions: positions, nameToId: n2id, edgeMap: { incoming: edges, outgoing: outEdges } };
  }, [model]);

  // Get color for a product type
  function getColor(productType: string): number {
    if (!productColorMap.current.has(productType)) {
      productColorMap.current.set(productType, PRODUCT_COLORS[colorIdx.current % PRODUCT_COLORS.length]);
      colorIdx.current++;
    }
    return productColorMap.current.get(productType)!;
  }

  // Create a smooth Bezier curve between two 3D points with arc
  function makeCurve(src: THREE.Vector3, tgt: THREE.Vector3): THREE.QuadraticBezierCurve3 {
    const mid = new THREE.Vector3().addVectors(src, tgt).multiplyScalar(0.5);
    const dist = src.distanceTo(tgt);
    mid.y = PRODUCT_Y + Math.min(dist * 0.06, 0.4); // gentle arc
    return new THREE.QuadraticBezierCurve3(src.clone(), mid, tgt.clone());
  }

  // Spawn a product entity
  function spawnProduct(id: string, sourceId: string, targetId: string, productType: string): ProductEntity | null {
    const srcPos = nodePositions.get(sourceId);
    const tgtPos = nodePositions.get(targetId);
    if (!srcPos || !tgtPos) return null;

    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const color = getColor(productType);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(srcPos);

    const curve = makeCurve(srcPos, tgtPos);
    const curveLen = curve.getLength();

    return {
      id,
      mesh,
      sourcePos: srcPos.clone(),
      targetPos: tgtPos.clone(),
      curve,
      curveLen,
      progress: 0,
      speed: TRAVEL_SPEED / curveLen,
      alive: true,
      processingAt: null,
      processStartTime: 0,
      processDuration: 0,
    };
  }

  // Process new events and spawn/update products
  useEffect(() => {
    if (!groupRef.current || recentEvents.length === 0) return;
    const group = groupRef.current;

    for (const evt of recentEvents) {
      const evtKey = `${evt.type}-${evt.entity_id}-${evt.time}`;
      if (processedEventIds.current.has(evtKey)) continue;
      processedEventIds.current.add(evtKey);

      // Cap processed events memory
      if (processedEventIds.current.size > 500) {
        const arr = [...processedEventIds.current];
        processedEventIds.current = new Set(arr.slice(-250));
      }

      const entityId = nameToId.get(evt.entity_id) || evt.entity_id;

      if (evt.type === 'processing_start') {
        // Find incoming edge to this station
        const sources = edgeMap.incoming.get(entityId);
        if (sources && sources.length > 0) {
          const sourceId = sources[0]; // take first source
          const productType = (evt.details?.product_type as string) || 'default';
          const productId = (evt.details?.product_id as string) || `${evt.entity_id}-${evt.time}`;
          const cycleTime = (evt.details?.cycle_time as number) || 2;

          // Spawn travel product
          const p = spawnProduct(productId, sourceId, entityId, productType);
          if (p && productsRef.current.length < MAX_PRODUCTS) {
            p.processingAt = entityId;
            p.processDuration = cycleTime;
            group.add(p.mesh);
            productsRef.current.push(p);
          }
        }
      } else if (evt.type === 'processing_complete') {
        // When processing completes, spawn product traveling to next node
        const targets = edgeMap.outgoing.get(entityId);
        if (targets && targets.length > 0) {
          const targetId = targets[0];
          const productType = stationProducts[evt.entity_id]?.productType || 'default';
          const p = spawnProduct(`out-${evt.entity_id}-${evt.time}`, entityId, targetId, productType);
          if (p && productsRef.current.length < MAX_PRODUCTS) {
            group.add(p.mesh);
            productsRef.current.push(p);
          }
        }
      } else if (evt.type === 'source_generate') {
        // Product spawned at source, travels to first connected node
        const targets = edgeMap.outgoing.get(entityId);
        if (targets && targets.length > 0) {
          const productType = (evt.details?.product_type as string) || 'default';
          const p = spawnProduct(`src-${evt.entity_id}-${evt.time}`, entityId, targets[0], productType);
          if (p && productsRef.current.length < MAX_PRODUCTS) {
            group.add(p.mesh);
            productsRef.current.push(p);
          }
        }
      }
    }
  }, [recentEvents, nameToId, nodePositions, edgeMap, stationProducts]);

  // Also spawn ambient flow particles based on edge flow counts for visual richness
  const lastAmbientSpawn = useRef(0);
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const now = performance.now() / 1000;

    // Ambient flow: periodically spawn particles on active edges
    if (now - lastAmbientSpawn.current > 0.8 && Object.keys(edgeFlowCounts).length > 0) {
      lastAmbientSpawn.current = now;
      for (const [edgeKey, count] of Object.entries(edgeFlowCounts)) {
        if (count <= 0) continue;
        const [srcName, tgtName] = edgeKey.split('->');
        const srcId = nameToId.get(srcName) || srcName;
        const tgtId = nameToId.get(tgtName) || tgtName;
        // Probability proportional to flow (max ~30% per tick)
        if (Math.random() > Math.min(0.3, count * 0.01)) continue;
        const p = spawnProduct(`ambient-${edgeKey}-${now}`, srcId, tgtId, 'ambient');
        if (p && productsRef.current.length < MAX_PRODUCTS) {
          p.speed *= 0.8 + Math.random() * 0.4; // slight speed variation
          group.add(p.mesh);
          productsRef.current.push(p);
        }
      }
    }

    // ── Animate all products ──
    const toRemove: number[] = [];
    productsRef.current.forEach((p, i) => {
      if (!p.alive) { toRemove.push(i); return; }

      // Advance progress
      p.progress += p.speed * dt;

      if (p.progress >= 1) {
        // If this product was heading to a processing station, pause briefly
        if (p.processingAt && p.processDuration > 0) {
          // Hold at target position during processing
          p.mesh.position.copy(p.targetPos);
          p.processDuration -= dt;
          // Gentle pulse during processing
          const pulse = 1 + Math.sin(now * 8) * 0.06;
          p.mesh.scale.set(pulse, pulse, pulse);
          if (p.processDuration <= 0) {
            p.alive = false;
          }
          return;
        }
        // Reached end — remove
        p.alive = false;
        return;
      }

      // Smoothly interpolate along curve
      const point = p.curve.getPoint(p.progress);
      p.mesh.position.copy(point);

      // Tiny vibration for conveyor feel
      p.mesh.position.y += Math.sin(now * 12 + p.progress * 30) * 0.003;

      // Orient along tangent
      const tangent = p.curve.getTangent(p.progress);
      p.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);

      // Reset scale
      p.mesh.scale.setScalar(1);
    });

    // Cleanup dead products
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const p = productsRef.current[idx];
      group.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.MeshStandardMaterial).dispose();
      productsRef.current.splice(idx, 1);
    }
  });

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        productsRef.current.forEach(p => {
          groupRef.current!.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.MeshStandardMaterial).dispose();
        });
        productsRef.current = [];
      }
      processedEventIds.current.clear();
    };
  }, []);

  return <group ref={groupRef} />;
}

// ── Station state colors for 3D view ──
const STATE_COLORS: Record<string, number> = {
  idle: 0x94a3b8,
  processing: 0x22c55e,
  blocked: 0xef4444,
  starved: 0xf59e0b,
  failed: 0xb91c1c,
  off_shift: 0x475569,
  setup: 0x8b5cf6,
};

/**
 * Hook to get the current simulation state color for a node.
 * Returns the hex color based on station state from liveSimulationStore.
 */
export function useStationState(nodeName: string): {
  state: string;
  color: number;
  isProcessing: boolean;
  bufferLevel?: { level: number; capacity: number };
} {
  const stationStates = useLiveSimulationStore(s => s.stationStates);
  const bufferLevels = useLiveSimulationStore(s => s.bufferLevels);

  const state = stationStates[nodeName] || 'idle';
  const color = STATE_COLORS[state] || STATE_COLORS.idle;
  const bufferLevel = bufferLevels[nodeName];

  return {
    state,
    color,
    isProcessing: state === 'processing',
    bufferLevel,
  };
}
