import { useEffect, useState, useRef, useCallback } from 'react';
import { useReactFlow } from 'reactflow';

interface AnimatedEntity {
  id: string;
  productType: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number; // 0 to 1
  color: string;
  startTime: number;
  duration: number; // ms for animation
}

interface SimulationEvent {
  time: number;
  type: string;
  entity_id: string;
  details: Record<string, unknown>;
}

const PRODUCT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function getColorForProduct(_productType: string, index: number): string {
  return PRODUCT_COLORS[index % PRODUCT_COLORS.length];
}

interface Props {
  isSimulating: boolean;
  events: SimulationEvent[];
  simulationSpeed?: number; // 1 = realtime, 10 = 10x
}

export function SimulationAnimationOverlay({ isSimulating, events, simulationSpeed = 10 }: Props) {
  const [entities, setEntities] = useState<AnimatedEntity[]>([]);
  const animationRef = useRef<number | null>(null);
  const productTypeColors = useRef<Map<string, string>>(new Map());
  const productTypeIndex = useRef(0);
  const { getNodes, getEdges } = useReactFlow();

  const getProductColor = useCallback((productType: string) => {
    if (!productTypeColors.current.has(productType)) {
      productTypeColors.current.set(productType, getColorForProduct(productType, productTypeIndex.current++));
    }
    return productTypeColors.current.get(productType)!;
  }, []);

  // Process incoming events to create animated entities
  useEffect(() => {
    if (!isSimulating || events.length === 0) {
      setEntities([]);
      return;
    }

    const nodes = getNodes();
    const edges = getEdges();

    // Build a map of node positions
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const node of nodes) {
      nodePositions.set(node.id, {
        x: node.position.x + (node.width || 140) / 2,
        y: node.position.y + (node.height || 60) / 2,
        width: node.width || 140,
        height: node.height || 60,
      });
    }

    // Process recent events to show movement
    const now = Date.now();
    const recentEvents = events.slice(-50); // Only process last 50 events
    const newEntities: AnimatedEntity[] = [];

    for (const event of recentEvents) {
      if (event.type === 'processing_start') {
        const stationId = event.entity_id;
        const productId = event.details.product_id as string;
        const productType = event.details.product_type as string;

        // Find an edge leading to this station
        const incomingEdge = edges.find(e => e.target === stationId);
        if (incomingEdge) {
          const sourcePos = nodePositions.get(incomingEdge.source);
          const targetPos = nodePositions.get(incomingEdge.target);
          if (sourcePos && targetPos) {
            newEntities.push({
              id: `${productId}-${event.time}`,
              productType,
              sourceNodeId: incomingEdge.source,
              targetNodeId: incomingEdge.target,
              progress: Math.min(1, (now % 2000) / 2000),
              color: getProductColor(productType),
              startTime: now - Math.random() * 1500,
              duration: 2000 / simulationSpeed,
            });
          }
        }
      }
    }

    setEntities(prev => {
      // Keep entities that are still animating
      const stillActive = prev.filter(e => (now - e.startTime) < e.duration);
      // Add new ones, deduplicate by id
      const existingIds = new Set(stillActive.map(e => e.id));
      const toAdd = newEntities.filter(e => !existingIds.has(e.id));
      return [...stillActive.slice(-30), ...toAdd.slice(-20)]; // Cap at 50 total
    });
  }, [isSimulating, events, getNodes, getEdges, simulationSpeed, getProductColor]);

  // Animation loop
  useEffect(() => {
    if (!isSimulating || entities.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      const now = Date.now();
      setEntities(prev =>
        prev
          .map(e => ({
            ...e,
            progress: Math.min(1, (now - e.startTime) / e.duration),
          }))
          .filter(e => e.progress < 1)
      );
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSimulating, entities.length]);

  if (!isSimulating || entities.length === 0) return null;

  const nodes = getNodes();
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    nodePositions.set(node.id, {
      x: node.position.x + (node.width || 140) / 2,
      y: node.position.y + (node.height || 60) / 2,
    });
  }

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {entities.map(entity => {
        const sourcePos = nodePositions.get(entity.sourceNodeId);
        const targetPos = nodePositions.get(entity.targetNodeId);
        if (!sourcePos || !targetPos) return null;

        const x = sourcePos.x + (targetPos.x - sourcePos.x) * entity.progress;
        const y = sourcePos.y + (targetPos.y - sourcePos.y) * entity.progress;

        return (
          <g key={entity.id}>
            {/* Glow effect */}
            <circle
              cx={x}
              cy={y}
              r={8}
              fill={entity.color}
              opacity={0.2}
            />
            {/* Main dot */}
            <circle
              cx={x}
              cy={y}
              r={5}
              fill={entity.color}
              stroke="white"
              strokeWidth={1.5}
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}
