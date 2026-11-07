import * as THREE from 'three';

/**
 * Cable/wire visual system for factory machines.
 * Creates realistic hanging cables and pipes between machines,
 * along walls, and from ceiling fixtures using catenary curves.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CableType = 'power' | 'data' | 'airHose' | 'coolant';

export interface CableOptions {
  sag?: number;        // how much the cable droops in the middle (default 0.3)
  segments?: number;   // curve segments (default 16)
  attachToWall?: boolean;
}

interface CableTypeConfig {
  color: number;
  roughness: number;
  metalness: number;
  radius: number;
  transparent: boolean;
  opacity: number;
}

interface CableRecord {
  id: string;
  mesh: THREE.Mesh;
  type: CableType;
  phase: number;       // random phase for sway animation
  frequency: number;   // Hz, for sway animation
  curvePoints: THREE.Vector3[];
}

// ---------------------------------------------------------------------------
// Cable type configurations
// ---------------------------------------------------------------------------

const CABLE_CONFIGS: Record<CableType, CableTypeConfig> = {
  power: {
    color: 0x1a1a1a,
    roughness: 0.9,
    metalness: 0,
    radius: 0.015,
    transparent: false,
    opacity: 1.0,
  },
  data: {
    color: 0x4466aa,
    roughness: 0.7,
    metalness: 0.1,
    radius: 0.008,
    transparent: false,
    opacity: 1.0,
  },
  airHose: {
    color: 0xccaa22,
    roughness: 0.6,
    metalness: 0,
    radius: 0.012,
    transparent: false,
    opacity: 1.0,
  },
  coolant: {
    color: 0x3388cc,
    roughness: 0.3,
    metalness: 0.1,
    radius: 0.010,
    transparent: true,
    opacity: 0.7,
  },
};

// ---------------------------------------------------------------------------
// CatenaryCurve — custom THREE.Curve for tube geometry
// ---------------------------------------------------------------------------

class CatenaryCurve extends THREE.Curve<THREE.Vector3> {
  private start: THREE.Vector3;
  private end: THREE.Vector3;
  private sag: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, sag: number) {
    super();
    this.start = start.clone();
    this.end = end.clone();
    this.sag = sag;
  }

  /** Parabolic approximation of a tilted catenary. */
  getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    const target = optionalTarget ?? new THREE.Vector3();

    // Linear interpolation between endpoints
    const x = THREE.MathUtils.lerp(this.start.x, this.end.x, t);
    const z = THREE.MathUtils.lerp(this.start.z, this.end.z, t);

    // Height: linear blend with parabolic sag
    const linearY = THREE.MathUtils.lerp(this.start.y, this.end.y, t);
    const sagOffset = this.sag * 4 * t * (1 - t);
    const y = linearY - sagOffset;

    return target.set(x, y, z);
  }
}

// ---------------------------------------------------------------------------
// CoiledCatenaryCurve — adds slight coil for air hoses
// ---------------------------------------------------------------------------

class CoiledCatenaryCurve extends THREE.Curve<THREE.Vector3> {
  private base: CatenaryCurve;
  private coilAmplitude: number;
  private coilFrequency: number;
  private perpendicular: THREE.Vector3;

  constructor(start: THREE.Vector3, end: THREE.Vector3, sag: number) {
    super();
    this.base = new CatenaryCurve(start, end, sag);
    this.coilAmplitude = 0.005;
    this.coilFrequency = 12; // coils along length

    // Compute a perpendicular direction for the coil displacement
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    this.perpendicular = new THREE.Vector3().crossVectors(dir, up).normalize();
    if (this.perpendicular.lengthSq() < 0.001) {
      this.perpendicular.set(1, 0, 0);
    }
  }

  getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    const target = optionalTarget ?? new THREE.Vector3();
    this.base.getPoint(t, target);

    const coilOffset = Math.sin(t * this.coilFrequency * Math.PI * 2) * this.coilAmplitude;
    target.x += this.perpendicular.x * coilOffset;
    target.z += this.perpendicular.z * coilOffset;

    return target;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 0;
function generateId(prefix: string): string {
  return `${prefix}_${_nextId++}`;
}

function createCableMaterial(config: CableTypeConfig): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: config.roughness,
    metalness: config.metalness,
    transparent: config.transparent,
    opacity: config.opacity,
    side: THREE.DoubleSide,
  });
}

function createClipMesh(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.4,
    metalness: 0.6,
  });
  return new THREE.Mesh(geo, mat);
}

function createTieWrapMesh(radius: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(radius + 0.003, 0.002, 4, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.8,
    metalness: 0,
  });
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// CableSystemManager
// ---------------------------------------------------------------------------

export class CableSystemManager {
  private scene: THREE.Scene;
  private cables: Map<string, CableRecord> = new Map();
  private groups: Map<string, THREE.Group> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // -----------------------------------------------------------------------
  // addCable
  // -----------------------------------------------------------------------

  addCable(
    start: THREE.Vector3,
    end: THREE.Vector3,
    type: CableType,
    options?: CableOptions,
  ): string {
    const id = generateId('cable');
    const config = CABLE_CONFIGS[type];
    const sag = options?.sag ?? 0.3;
    const segments = options?.segments ?? 16;
    const radialSegments = type === 'power' ? 6 : 4;

    // Pick curve type
    const curve: THREE.Curve<THREE.Vector3> =
      type === 'airHose'
        ? new CoiledCatenaryCurve(start, end, sag)
        : new CatenaryCurve(start, end, sag);

    const geometry = new THREE.TubeGeometry(curve, segments, config.radius, radialSegments, false);
    const material = createCableMaterial(config);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.scene.add(mesh);

    // Store curve sample points for animation reference
    const curvePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      curvePoints.push(curve.getPoint(i / segments));
    }

    const record: CableRecord = {
      id,
      mesh,
      type,
      phase: Math.random() * Math.PI * 2,
      frequency: 0.3 + Math.random() * 0.5, // 0.3–0.8 Hz
      curvePoints,
    };

    this.cables.set(id, record);
    return id;
  }

  // -----------------------------------------------------------------------
  // addCableBundle
  // -----------------------------------------------------------------------

  addCableBundle(
    start: THREE.Vector3,
    end: THREE.Vector3,
    count: number,
  ): string {
    const bundleId = generateId('bundle');
    const group = new THREE.Group();
    const cableIds: string[] = [];
    const bundleRadius = 0.015;

    for (let i = 0; i < count; i++) {
      // Alternate power and data cables
      const type: CableType = i % 2 === 0 ? 'power' : 'data';

      // Slight random offset from bundle center
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const offsetDist = bundleRadius * (0.5 + Math.random() * 0.5);
      const offsetX = Math.cos(angle) * offsetDist;
      const offsetZ = Math.sin(angle) * offsetDist;

      const offsetStart = start.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));
      const offsetEnd = end.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));

      const sag = 0.25 + Math.random() * 0.1;
      const cableId = this.addCable(offsetStart, offsetEnd, type, { sag, segments: 14 });
      cableIds.push(cableId);

      // Re-parent mesh into the group
      const record = this.cables.get(cableId);
      if (record) {
        this.scene.remove(record.mesh);
        group.add(record.mesh);
      }
    }

    // Add periodic tie wraps along the bundle
    const tieCount = Math.max(2, Math.floor(start.distanceTo(end) / 0.4));
    for (let i = 1; i < tieCount; i++) {
      const t = i / tieCount;
      const pos = new THREE.Vector3().lerpVectors(start, end, t);
      // Lower tie to sag level
      const sagOffset = 0.3 * 4 * t * (1 - t);
      pos.y -= sagOffset;

      const tie = createTieWrapMesh(bundleRadius);
      tie.position.copy(pos);
      // Orient tie ring perpendicular to cable direction
      const dir = new THREE.Vector3().subVectors(end, start).normalize();
      tie.lookAt(pos.clone().add(dir));
      group.add(tie);
    }

    this.scene.add(group);
    this.groups.set(bundleId, group);
    return bundleId;
  }

  // -----------------------------------------------------------------------
  // addCeilingCableRun
  // -----------------------------------------------------------------------

  addCeilingCableRun(points: THREE.Vector3[], type: CableType): string {
    const runId = generateId('ceilrun');
    const group = new THREE.Group();

    if (points.length < 2) return runId;

    // Create a cable segment between each pair of consecutive support points
    for (let i = 0; i < points.length - 1; i++) {
      const segStart = points[i];
      const segEnd = points[i + 1];
      const dist = segStart.distanceTo(segEnd);
      const sag = Math.min(0.4, dist * 0.15);

      const cableId = this.addCable(segStart, segEnd, type, { sag, segments: 12 });
      const record = this.cables.get(cableId);
      if (record) {
        this.scene.remove(record.mesh);
        group.add(record.mesh);
      }
    }

    // Add cable tray clips at each support point
    for (const pt of points) {
      const clip = createClipMesh();
      clip.position.copy(pt);
      group.add(clip);
    }

    this.scene.add(group);
    this.groups.set(runId, group);
    return runId;
  }

  // -----------------------------------------------------------------------
  // autoGenerateCables
  // -----------------------------------------------------------------------

  autoGenerateCables(nodeGroups: Map<string, THREE.Group>): void {
    const ceilingY = 3.5; // assumed ceiling height
    const wallX = -4.0;   // assumed wall manifold x-position

    const pneumaticTypes = new Set(['press', 'injectionmolder']);

    const entries = Array.from(nodeGroups.entries());

    for (const [nodeId, group] of entries) {
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);

      // --- Power cable from ceiling to each machine ---
      const ceilingPoint = new THREE.Vector3(worldPos.x, ceilingY, worldPos.z);
      this.addCable(ceilingPoint, worldPos, 'power', { sag: 0.15 });

      // --- Air hoses from wall manifold to pneumatic machines ---
      const lowerNodeId = nodeId.toLowerCase();
      if (Array.from(pneumaticTypes).some((pt) => lowerNodeId.includes(pt))) {
        const wallPoint = new THREE.Vector3(wallX, worldPos.y + 0.5, worldPos.z);
        this.addCable(wallPoint, worldPos, 'airHose', { sag: 0.2 });
      }
    }

    // --- Data cables between machines that are close together ---
    const positionPairs: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const posA = new THREE.Vector3();
      entries[i][1].getWorldPosition(posA);

      for (let j = i + 1; j < entries.length; j++) {
        const posB = new THREE.Vector3();
        entries[j][1].getWorldPosition(posB);

        if (posA.distanceTo(posB) < 3.0) {
          positionPairs.push({ a: posA, b: posB });
        }
      }
    }

    for (const pair of positionPairs) {
      // Offset data cables slightly above machine centers
      const startOff = pair.a.clone().add(new THREE.Vector3(0, 0.3, 0));
      const endOff = pair.b.clone().add(new THREE.Vector3(0, 0.3, 0));
      this.addCable(startOff, endOff, 'data', { sag: 0.15 });
    }
  }

  // -----------------------------------------------------------------------
  // update — subtle sway animation
  // -----------------------------------------------------------------------

  update(_dt: number, elapsed: number): void {
    const amplitude = 0.005;

    for (const record of this.cables.values()) {
      const offset =
        Math.sin(elapsed * record.frequency * Math.PI * 2 + record.phase) * amplitude;

      // Apply a gentle lateral displacement to the mesh position
      // This is cheaper than rebuilding geometry each frame
      record.mesh.position.x = offset;
      record.mesh.position.z = offset * 0.5;
    }
  }

  // -----------------------------------------------------------------------
  // removeCable
  // -----------------------------------------------------------------------

  removeCable(id: string): void {
    const record = this.cables.get(id);
    if (record) {
      record.mesh.geometry.dispose();
      if (record.mesh.material instanceof THREE.Material) {
        record.mesh.material.dispose();
      }
      if (record.mesh.parent) {
        record.mesh.parent.remove(record.mesh);
      } else {
        this.scene.remove(record.mesh);
      }
      this.cables.delete(id);
    }

    // Also check groups (bundles / ceiling runs)
    const group = this.groups.get(id);
    if (group) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(group);
      this.groups.delete(id);
    }
  }

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  dispose(): void {
    // Dispose all individual cables
    for (const record of this.cables.values()) {
      record.mesh.geometry.dispose();
      if (record.mesh.material instanceof THREE.Material) {
        record.mesh.material.dispose();
      }
      if (record.mesh.parent) {
        record.mesh.parent.remove(record.mesh);
      } else {
        this.scene.remove(record.mesh);
      }
    }
    this.cables.clear();

    // Dispose all groups (bundles, ceiling runs)
    for (const group of this.groups.values()) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(group);
    }
    this.groups.clear();
  }
}
