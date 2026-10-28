import type { TransportNetwork, TransportWaypoint } from '../types';

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

interface Neighbor {
  neighborId: string;
  distance: number;
  speedLimit: number;
}

/** Build adjacency list from the transport network */
function buildGraph(network: TransportNetwork): Map<string, Neighbor[]> {
  const graph = new Map<string, Neighbor[]>();
  const wpMap = new Map(network.waypoints.map((w) => [w.id, w]));

  for (const wp of network.waypoints) {
    if (!graph.has(wp.id)) graph.set(wp.id, []);
  }

  for (const lane of network.lanes) {
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const aId = lane.waypoints[i];
      const bId = lane.waypoints[i + 1];
      const a = wpMap.get(aId);
      const b = wpMap.get(bId);
      if (!a || !b) continue;
      const d = distance(a.position, b.position);

      graph.get(aId)!.push({ neighborId: bId, distance: d, speedLimit: lane.speedLimit });
      if (!lane.oneWay) {
        graph.get(bId)!.push({ neighborId: aId, distance: d, speedLimit: lane.speedLimit });
      }
    }
  }

  return graph;
}

/** Find shortest path between two waypoints using A* */
export function findPath(
  network: TransportNetwork,
  startId: string,
  goalId: string,
): { path: string[]; totalDistance: number; estimatedTime: number } | null {
  const wpMap = new Map(network.waypoints.map((w) => [w.id, w]));
  const start = wpMap.get(startId);
  const goal = wpMap.get(goalId);
  if (!start || !goal) return null;

  const graph = buildGraph(network);

  // g[nodeId] = cost from start to nodeId
  const gScore = new Map<string, number>();
  // f[nodeId] = g + heuristic
  const fScore = new Map<string, number>();
  // parent map for path reconstruction
  const parentMap = new Map<string, string | null>();
  // speed map to track speed along best path for time estimation
  const speedOnEdge = new Map<string, number>();
  // open set (nodes to explore)
  const openSet = new Set<string>();
  // closed set (already explored)
  const closedSet = new Set<string>();

  const h = distance(start.position, goal.position);
  gScore.set(startId, 0);
  fScore.set(startId, h);
  parentMap.set(startId, null);
  openSet.add(startId);

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let currentId: string | null = null;
    let currentF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentId = id;
      }
    }
    if (!currentId) break;

    // Goal reached — reconstruct path
    if (currentId === goalId) {
      const path: string[] = [];
      let cur: string | null = goalId;
      while (cur !== null) {
        path.unshift(cur);
        cur = parentMap.get(cur) ?? null;
      }

      const totalDistance = gScore.get(goalId) ?? 0;

      // Estimate time: sum of (edge distance / edge speed) along the path
      let estimatedTime = 0;
      for (let i = 1; i < path.length; i++) {
        const prevWp = wpMap.get(path[i - 1])!;
        const curWp = wpMap.get(path[i])!;
        const edgeDist = distance(prevWp.position, curWp.position);
        const speed = speedOnEdge.get(path[i]) || 2.0;
        estimatedTime += edgeDist / speed;
      }

      return { path, totalDistance, estimatedTime };
    }

    openSet.delete(currentId);
    closedSet.add(currentId);

    const neighbors = graph.get(currentId) || [];
    const currentG = gScore.get(currentId) ?? Infinity;

    for (const neighbor of neighbors) {
      if (closedSet.has(neighbor.neighborId)) continue;

      const tentativeG = currentG + neighbor.distance;
      const existingG = gScore.get(neighbor.neighborId) ?? Infinity;

      if (tentativeG < existingG) {
        const wp = wpMap.get(neighbor.neighborId)!;
        const heuristic = distance(wp.position, goal.position);
        gScore.set(neighbor.neighborId, tentativeG);
        fScore.set(neighbor.neighborId, tentativeG + heuristic);
        parentMap.set(neighbor.neighborId, currentId);
        speedOnEdge.set(neighbor.neighborId, neighbor.speedLimit);
        openSet.add(neighbor.neighborId);
      }
    }
  }

  return null; // No path found
}

/** Find the nearest waypoint of a given type to a position */
export function findNearestWaypoint(
  network: TransportNetwork,
  position: { x: number; y: number },
  type?: TransportWaypoint['type'],
): TransportWaypoint | null {
  let nearest: TransportWaypoint | null = null;
  let minDist = Infinity;

  for (const wp of network.waypoints) {
    if (type && wp.type !== type) continue;
    const d = distance(position, wp.position);
    if (d < minDist) {
      minDist = d;
      nearest = wp;
    }
  }

  return nearest;
}

/** Get all station-stops linked to simulation nodes */
export function getStationStops(network: TransportNetwork): TransportWaypoint[] {
  return network.waypoints.filter((w) => w.type === 'station-stop' && w.linkedNodeId);
}
