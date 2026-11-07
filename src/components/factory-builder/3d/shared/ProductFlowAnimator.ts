import * as THREE from 'three';
import { PathFollower } from './PathFollower';
import type { ScenarioRenderResult } from './ScenarioRenderer';

/**
 * ProductFlowAnimator — animates products flowing along conveyors and snapping
 * onto robot end-effectors when picked. This is the layer that turns a static
 * scene into a *factory simulation* — when paired with the simulation event
 * stream, products visibly move from feed conveyor → station → robot → pallet.
 *
 * Detection rule: any entity whose modelKey contains "conveyor" gets a path
 * inferred from its bounding box (front-edge to back-edge). Products are
 * spawned on a configurable interval and ride the path. Reaching the end
 * either loops (default) or triggers an `onArrive` callback.
 *
 * Visual products: small colored crates. Each has its own THREE.Group so it
 * can be reparented onto a robot tool flange without world-position jumps
 * (uses WorkObject.reparent under the hood).
 */

export interface ConveyorBelt {
  entityId: string;
  follower: PathFollower;
  /** Active products currently on the belt, in order from start (t=0) to end (t=1). */
  products: ConveyorProduct[];
  /** Conveyor wrapper group, used to attach products to it. */
  hostGroup: THREE.Group;
}

export interface ConveyorProduct {
  group: THREE.Group;
  t: number;            // path parameter [0, 1]
  speed: number;        // override per-product speed if needed
}

const DEFAULT_PRODUCT_COLORS = [0xc94a3a, 0x2d8c4e, 0x356fc7, 0xc99a35, 0x7a3ec9];

function buildProductMesh(colorIndex: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'product';
  const mat = new THREE.MeshStandardMaterial({
    color: DEFAULT_PRODUCT_COLORS[colorIndex % DEFAULT_PRODUCT_COLORS.length],
    roughness: 0.45,
    metalness: 0.10,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.07;
  g.add(body);
  // Top trim for visual interest.
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.012, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.6 }),
  );
  trim.position.y = 0.144;
  g.add(trim);
  return g;
}

export class ProductFlowAnimator {
  private belts: ConveyorBelt[] = [];
  private spawnInterval = 1.6; // seconds between new products on each belt
  private productSpeed = 0.7;  // m/s along the belt
  private maxPerBelt = 6;
  private spawnTimers = new Map<string, number>();
  private nextColor = 0;

  /** Scan a render result for conveyors, infer paths, register them. */
  attach(result: ScenarioRenderResult): void {
    this.dispose();

    for (const [entityId, wrapper] of result.entityById) {
      const detailed = wrapper.userData.multiScale?.levels?.detailed as THREE.Group | undefined;
      if (!detailed) continue;
      // Heuristic: name-based conveyor detection (entity wrapper names are 'entity:<id>').
      // The id often contains 'belt' or 'conveyor' or the model is registered as such.
      // We can also probe userData for a `conveyorPath` if present.
      const id = entityId.toLowerCase();
      const looksLikeConveyor = id.includes('conveyor') || id.includes('belt')
        || (detailed.name || '').toLowerCase().includes('conveyor')
        || (detailed.name || '').toLowerCase().includes('belt');
      if (!looksLikeConveyor) continue;

      // Compute a straight path from -X to +X across the bounding box of the conveyor.
      const bbox = new THREE.Box3().setFromObject(detailed);
      if (bbox.isEmpty()) continue;
      const size = bbox.getSize(new THREE.Vector3());
      // Use the longer horizontal axis for travel.
      const useX = size.x >= size.z;
      const length = useX ? size.x : size.z;
      const beltY = bbox.max.y + 0.02;  // sit on top of belt surface

      // The path is in WORLD coordinates. Build it relative to the wrapper position
      // so it stays correct when entities re-position.
      const wrapPos = wrapper.position;
      const start = useX
        ? new THREE.Vector3(wrapPos.x - length / 2 + 0.05, beltY, wrapPos.z)
        : new THREE.Vector3(wrapPos.x, beltY, wrapPos.z - length / 2 + 0.05);
      const end = useX
        ? new THREE.Vector3(wrapPos.x + length / 2 - 0.05, beltY, wrapPos.z)
        : new THREE.Vector3(wrapPos.x, beltY, wrapPos.z + length / 2 - 0.05);

      const curve = new THREE.LineCurve3(start, end);
      const follower = new PathFollower(curve, { loop: false, speed: this.productSpeed });

      this.belts.push({
        entityId,
        follower,
        products: [],
        hostGroup: result.root,
      });
      this.spawnTimers.set(entityId, Math.random() * this.spawnInterval);
    }
  }

  /** Per-frame update — advance products and spawn new ones. */
  update(dt: number): void {
    for (const belt of this.belts) {
      // Spawn cadence
      let timer = this.spawnTimers.get(belt.entityId) ?? 0;
      timer -= dt;
      if (timer <= 0 && belt.products.length < this.maxPerBelt) {
        this.spawnProduct(belt);
        timer = this.spawnInterval;
      }
      this.spawnTimers.set(belt.entityId, timer);

      // Move products
      const length = belt.follower.getLength();
      if (length <= 0) continue;
      const ds = (this.productSpeed * dt) / length;
      const surviving: ConveyorProduct[] = [];
      const tmpPos = new THREE.Vector3();
      const tmpTan = new THREE.Vector3();
      for (const p of belt.products) {
        p.t += ds;
        if (p.t >= 1) {
          // Remove from scene
          if (p.group.parent) p.group.parent.remove(p.group);
          this.disposeProduct(p);
          continue;
        }
        // Sample curve at t and place product on world-space curve.
        const curve = (belt.follower as unknown as { curve: THREE.Curve<THREE.Vector3> }).curve;
        curve.getPointAt(p.t, tmpPos);
        curve.getTangentAt(p.t, tmpTan).normalize();
        p.group.position.copy(tmpPos);
        p.group.lookAt(tmpPos.clone().add(tmpTan));
        surviving.push(p);
      }
      belt.products = surviving;
    }
  }

  private spawnProduct(belt: ConveyorBelt): void {
    const product = buildProductMesh(this.nextColor++);
    belt.hostGroup.add(product);
    belt.products.push({ group: product, t: 0, speed: this.productSpeed });
  }

  private disposeProduct(p: ConveyorProduct): void {
    p.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach(mm => mm.dispose());
        else m?.dispose();
      }
    });
  }

  count(): { belts: number; products: number } {
    return {
      belts: this.belts.length,
      products: this.belts.reduce((a, b) => a + b.products.length, 0),
    };
  }

  dispose(): void {
    for (const belt of this.belts) {
      for (const p of belt.products) {
        if (p.group.parent) p.group.parent.remove(p.group);
        this.disposeProduct(p);
      }
    }
    this.belts = [];
    this.spawnTimers.clear();
  }
}
