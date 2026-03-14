import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';

const PRODUCT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const TRAVEL_DURATION = 1200; // ms per edge traversal
const MAX_PRODUCTS = 60;

interface AnimProduct {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  duration: number;
  color: string;
}

interface Props {
  isSimulating: boolean;
  events: any[]; // legacy prop, ignored — we use liveSimulationStore instead
}

export function SimulationAnimationOverlay({ isSimulating }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const productsRef = useRef<AnimProduct[]>([]);
  const processedEventsRef = useRef(new Set<string>());
  const productColorsRef = useRef(new Map<string, string>());
  const colorIdxRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const { getNodes, getEdges } = useReactFlow();

  const getColor = useCallback((productType: string): string => {
    if (!productColorsRef.current.has(productType)) {
      productColorsRef.current.set(productType, PRODUCT_COLORS[colorIdxRef.current++ % PRODUCT_COLORS.length]);
    }
    return productColorsRef.current.get(productType)!;
  }, []);

  // Build node position and edge maps from ReactFlow
  const getTopology = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const positions = new Map<string, { x: number; y: number }>();
    const nameToId = new Map<string, string>();

    for (const node of nodes) {
      const cx = node.position.x + (node.width || 140) / 2;
      const cy = node.position.y + (node.height || 60) / 2;
      positions.set(node.id, { x: cx, y: cy });
      // Map node name/label to id
      const name = (node.data as any)?.name || (node.data as any)?.label || node.id;
      nameToId.set(name, node.id);
    }

    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const e of edges) {
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e.source);
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source)!.push(e.target);
    }

    return { positions, nameToId, incoming, outgoing };
  }, [getNodes, getEdges]);

  // Spawn a product between two nodes
  const spawnProduct = useCallback((sourceId: string, targetId: string, productType: string, positions: Map<string, { x: number; y: number }>) => {
    const src = positions.get(sourceId);
    const tgt = positions.get(targetId);
    if (!src || !tgt) return;
    if (productsRef.current.length >= MAX_PRODUCTS) return;

    productsRef.current.push({
      id: `${sourceId}-${targetId}-${Date.now()}-${Math.random()}`,
      sourceX: src.x, sourceY: src.y,
      targetX: tgt.x, targetY: tgt.y,
      startTime: performance.now(),
      duration: TRAVEL_DURATION,
      color: getColor(productType),
    });
  }, [getColor]);

  // Main animation loop — processes events + draws on canvas
  useEffect(() => {
    if (!isSimulating) {
      productsRef.current = [];
      processedEventsRef.current.clear();
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastEventCheck = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();

      // Resize canvas to match parent
      const parent = canvas.parentElement;
      if (parent) {
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      // Process new events from liveSimulationStore (check every ~50ms)
      if (now - lastEventCheck > 50) {
        lastEventCheck = now;
        const liveState = useLiveSimulationStore.getState();
        const { positions, nameToId, incoming, outgoing } = getTopology();

        for (const evt of liveState.recentEvents) {
          const evtKey = `${evt.type}-${evt.entity_id}-${evt.time}`;
          if (processedEventsRef.current.has(evtKey)) continue;
          processedEventsRef.current.add(evtKey);

          // Cap memory
          if (processedEventsRef.current.size > 500) {
            const arr = [...processedEventsRef.current];
            processedEventsRef.current = new Set(arr.slice(-250));
          }

          const entityId = nameToId.get(evt.entity_id) || evt.entity_id;

          if (evt.type === 'processing_start') {
            const sources = incoming.get(entityId);
            if (sources?.length) {
              const productType = (evt.details?.product_type as string) || 'default';
              spawnProduct(sources[0], entityId, productType, positions);
            }
          } else if (evt.type === 'processing_complete') {
            const targets = outgoing.get(entityId);
            if (targets?.length) {
              const productType = liveState.stationProducts[evt.entity_id]?.productType || 'default';
              spawnProduct(entityId, targets[0], productType, positions);
            }
          } else if (evt.type === 'source_generate') {
            const targets = outgoing.get(entityId);
            if (targets?.length) {
              const productType = (evt.details?.product_type as string) || 'default';
              spawnProduct(entityId, targets[0], productType, positions);
            }
          }
        }
      }

      // Draw
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw products
      const alive: AnimProduct[] = [];
      for (const p of productsRef.current) {
        const elapsed = now - p.startTime;
        const t = Math.min(1, elapsed / p.duration);

        if (t >= 1) continue; // dead

        // Smooth easing (ease-in-out)
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const x = p.sourceX + (p.targetX - p.sourceX) * ease;
        const y = p.sourceY + (p.targetY - p.sourceY) * ease;

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = p.color + '33'; // 20% opacity
        ctx.fill();

        // Main dot
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        alive.push(p);
      }
      productsRef.current = alive;
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isSimulating, getTopology, spawnProduct]);

  if (!isSimulating) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
}
