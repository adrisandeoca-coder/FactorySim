import type { Station, Buffer, ExtraNodeEntry, Connection, Position } from '../types';

// Layout constants
const LAYER_GAP_X = 220;
const NODE_GAP_Y = 40;
const MARGIN_LEFT = 60;
const MARGIN_TOP = 60;

// Approximate node dimensions by type (width × height)
const NODE_SIZES: Record<string, { w: number; h: number }> = {
  station: { w: 180, h: 90 },
  buffer: { w: 140, h: 80 },
  source: { w: 160, h: 90 },
  sink: { w: 160, h: 90 },
  conveyor: { w: 160, h: 80 },
  operator: { w: 140, h: 80 },
  inspection: { w: 160, h: 90 },
  assembly: { w: 160, h: 90 },
  splitter: { w: 140, h: 80 },
  merge: { w: 140, h: 80 },
  disassembly: { w: 160, h: 90 },
  palletize: { w: 160, h: 90 },
  depalletize: { w: 160, h: 90 },
  matchbuffer: { w: 160, h: 90 },
};

function getNodeSize(type: string): { w: number; h: number } {
  return NODE_SIZES[type] || { w: 160, h: 90 };
}

interface LayoutNode {
  id: string;
  type: string;
}

/**
 * Compute a left-to-right layered graph layout.
 * Returns a map of nodeId → { x, y } positions.
 */
export function autoLayout(
  stations: Station[],
  buffers: Buffer[],
  extraNodes: ExtraNodeEntry[],
  connections: Connection[]
): Map<string, Position> {
  // 1. Build unified node list
  const allNodes: LayoutNode[] = [
    ...stations.map((s) => ({ id: s.id, type: 'station' })),
    ...buffers.map((b) => ({ id: b.id, type: 'buffer' })),
    ...extraNodes.map((n) => ({ id: n.id, type: n.type })),
  ];

  const nodeIds = new Set(allNodes.map((n) => n.id));
  const nodeTypeMap = new Map(allNodes.map((n) => [n.id, n.type]));

  // 2. Build adjacency
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    successors.set(id, []);
    predecessors.set(id, []);
    inDegree.set(id, 0);
  }

  for (const conn of connections) {
    if (!nodeIds.has(conn.source) || !nodeIds.has(conn.target)) continue;
    successors.get(conn.source)!.push(conn.target);
    predecessors.get(conn.target)!.push(conn.source);
    inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
  }

  // Identify connected vs orphan nodes
  const connectedIds = new Set<string>();
  for (const conn of connections) {
    if (nodeIds.has(conn.source)) connectedIds.add(conn.source);
    if (nodeIds.has(conn.target)) connectedIds.add(conn.target);
  }
  const orphanIds = [...nodeIds].filter((id) => !connectedIds.has(id));

  // 3. Assign layers via Kahn's topological BFS (longest-path layering)
  const layer = new Map<string, number>();
  const queue: string[] = [];

  // Start from roots (in-degree 0 among connected nodes)
  for (const id of connectedIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const curLayer = layer.get(cur)!;
    for (const next of successors.get(cur)!) {
      const newLayer = curLayer + 1;
      if (!layer.has(next) || layer.get(next)! < newLayer) {
        layer.set(next, newLayer);
      }
      inDegree.set(next, inDegree.get(next)! - 1);
      if (inDegree.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  // Handle cycles: any connected node not yet layered gets max+1
  const maxLayer = layer.size > 0 ? Math.max(...layer.values()) : 0;
  for (const id of connectedIds) {
    if (!layer.has(id)) {
      layer.set(id, maxLayer + 1);
    }
  }

  // 4. Group connected nodes by layer
  const layerCount = layer.size > 0 ? Math.max(...layer.values()) + 1 : 0;
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const [id, l] of layer) {
    layers[l].push(id);
  }

  // 5. Order within layers — median heuristic (3 passes)
  for (let pass = 0; pass < 3; pass++) {
    const forward = pass % 2 === 0;
    const range = forward
      ? Array.from({ length: layerCount }, (_, i) => i)
      : Array.from({ length: layerCount }, (_, i) => layerCount - 1 - i);

    for (const li of range) {
      if (li === 0 && forward) continue;
      if (li === layerCount - 1 && !forward) continue;

      const adjacentLayer = forward ? layers[li - 1] : layers[li + 1];
      if (!adjacentLayer) continue;

      const posInAdjacentLayer = new Map<string, number>();
      adjacentLayer.forEach((id, idx) => posInAdjacentLayer.set(id, idx));

      // For each node in this layer, compute median of adjacent-layer neighbors
      const medians = new Map<string, number>();
      for (const id of layers[li]) {
        const neighbors = forward ? predecessors.get(id)! : successors.get(id)!;
        const positions = neighbors
          .filter((n) => posInAdjacentLayer.has(n))
          .map((n) => posInAdjacentLayer.get(n)!)
          .sort((a, b) => a - b);

        if (positions.length > 0) {
          const mid = Math.floor(positions.length / 2);
          medians.set(
            id,
            positions.length % 2 === 1
              ? positions[mid]
              : (positions[mid - 1] + positions[mid]) / 2
          );
        } else {
          medians.set(id, Infinity);
        }
      }

      // Sort layer by median, keeping nodes without neighbors at their current position
      layers[li].sort((a, b) => {
        const ma = medians.get(a)!;
        const mb = medians.get(b)!;
        if (ma === Infinity && mb === Infinity) return 0;
        if (ma === Infinity) return 1;
        if (mb === Infinity) return -1;
        return ma - mb;
      });
    }
  }

  // 6. Assign coordinates
  const positions = new Map<string, Position>();

  // Find the tallest layer height to center shorter layers
  const layerHeights: number[] = layers.map((layerNodes) => {
    let h = 0;
    for (const id of layerNodes) {
      const size = getNodeSize(nodeTypeMap.get(id) || 'station');
      h += size.h;
    }
    h += (layerNodes.length - 1) * NODE_GAP_Y;
    return Math.max(h, 0);
  });
  const maxHeight = Math.max(...layerHeights, 0);

  for (let li = 0; li < layers.length; li++) {
    const x = MARGIN_LEFT + li * LAYER_GAP_X;
    const layerHeight = layerHeights[li];
    const offsetY = MARGIN_TOP + (maxHeight - layerHeight) / 2;

    let y = offsetY;
    for (const id of layers[li]) {
      const size = getNodeSize(nodeTypeMap.get(id) || 'station');
      positions.set(id, { x, y });
      y += size.h + NODE_GAP_Y;
    }
  }

  // 7. Place orphans in a row below the main graph
  if (orphanIds.length > 0) {
    const orphanY = MARGIN_TOP + maxHeight + 80;
    let orphanX = MARGIN_LEFT;
    for (const id of orphanIds) {
      const size = getNodeSize(nodeTypeMap.get(id) || 'station');
      positions.set(id, { x: orphanX, y: orphanY });
      orphanX += size.w + NODE_GAP_Y;
    }
  }

  return positions;
}
