import * as THREE from 'three';
import type { ScenarioRenderResult } from './ScenarioRenderer';

/**
 * StationFlowAnimator — animates products traveling between connected stations
 * along straight or curved paths. Bridges the gap between conveyor flow (already
 * handled by ProductFlowAnimator) and inter-station connections.
 *
 * Inputs:
 *   - The render result (to get entity world positions)
 *   - A list of edges: { source: entityId, target: entityId }
 *
 * Behavior:
 *   - Each edge spawns a small product at intervals; the product travels from
 *     source position to target position along an arched path; on arrival it
 *     vanishes (representing flow into the next station).
 *   - Edges between rigged robots and conveyors are skipped (handled elsewhere).
 *   - Per-edge speed and spawn rate are configurable.
 */

export interface FlowEdge {
  /** Stable id for the edge (e.g. `${source}->${target}`). */
  id: string;
  source: string;     // source entity id
  target: string;     // target entity id
  /** Items per second (Poisson-ish); default 0.4. */
  rate?: number;
  /** Travel speed in m/s; default 1.0. */
  speed?: number;
}

interface ManagedEdge {
  edge: FlowEdge;
  curve: THREE.CatmullRomCurve3 | THREE.LineCurve3 | null;
  length: number;
  spawnTimer: number;
  products: { group: THREE.Group; t: number }[];
}

const COLORS = [0xc94a3a, 0x2d8c4e, 0x356fc7, 0xc99a35, 0x7a3ec9, 0xe74c8d];
let colorRotation = 0;

function buildProductGlyph(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flowProduct';
  const color = COLORS[colorRotation++ % COLORS.length];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.10, 0.14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 }),
  );
  body.castShadow = true;
  body.position.y = 0.05;
  g.add(body);
  return g;
}

export class StationFlowAnimator {
  private edges: ManagedEdge[] = [];
  private root: THREE.Group | null = null;

  /**
   * Attach to a render result with a list of flow edges. The animator builds
   * an arched path for each edge and starts spawning products on it.
   */
  attach(result: ScenarioRenderResult, edges: FlowEdge[]): void {
    this.dispose();
    this.root = result.root;

    for (const edge of edges) {
      const sourceWrapper = result.entityById.get(edge.source);
      const targetWrapper = result.entityById.get(edge.target);
      if (!sourceWrapper || !targetWrapper) continue;

      const start = new THREE.Vector3();
      const end = new THREE.Vector3();
      sourceWrapper.getWorldPosition(start);
      targetWrapper.getWorldPosition(end);

      // Lift start/end slightly so products visually sit above the floor.
      start.y = Math.max(0.4, start.y + 0.5);
      end.y = Math.max(0.4, end.y + 0.5);

      // Build a parabolic arched path: source → mid (raised) → target
      const dist = start.distanceTo(end);
      if (dist < 0.05) continue;
      const mid = start.clone().lerp(end, 0.5);
      mid.y += Math.min(0.6, dist * 0.15);

      const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
      const length = curve.getLength();

      this.edges.push({
        edge,
        curve,
        length,
        spawnTimer: Math.random() * (1 / (edge.rate ?? 0.4)),
        products: [],
      });
    }
  }

  /** Per-frame update — spawn and advance products along each edge. */
  update(dt: number): void {
    if (!this.root) return;

    const tmpPos = new THREE.Vector3();
    const tmpTan = new THREE.Vector3();

    for (const me of this.edges) {
      // Spawn cadence
      const rate = me.edge.rate ?? 0.4;
      const interval = 1 / Math.max(0.05, rate);
      me.spawnTimer -= dt;
      if (me.spawnTimer <= 0 && me.products.length < 8 && me.curve) {
        const p = buildProductGlyph();
        this.root.add(p);
        me.products.push({ group: p, t: 0 });
        me.spawnTimer = interval;
      }

      // Advance products
      if (!me.curve || me.length <= 0) continue;
      const speed = me.edge.speed ?? 1.0;
      const dt_t = (speed * dt) / me.length;
      const surviving: typeof me.products = [];
      for (const p of me.products) {
        p.t += dt_t;
        if (p.t >= 1) {
          if (p.group.parent) p.group.parent.remove(p.group);
          this.disposeProduct(p.group);
          continue;
        }
        me.curve.getPointAt(p.t, tmpPos);
        me.curve.getTangentAt(p.t, tmpTan).normalize();
        p.group.position.copy(tmpPos);
        // Subtle product spin so it's visually identifiable as moving
        p.group.rotation.y += dt * 1.0;
        surviving.push(p);
      }
      me.products = surviving;
    }
  }

  private disposeProduct(g: THREE.Group): void {
    g.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
        else mat?.dispose();
      }
    });
  }

  count(): { edges: number; products: number } {
    return {
      edges: this.edges.length,
      products: this.edges.reduce((a, e) => a + e.products.length, 0),
    };
  }

  dispose(): void {
    for (const me of this.edges) {
      for (const p of me.products) {
        if (p.group.parent) p.group.parent.remove(p.group);
        this.disposeProduct(p.group);
      }
    }
    this.edges = [];
    this.root = null;
  }
}
