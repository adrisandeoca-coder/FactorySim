import * as THREE from 'three';

/**
 * Vehicle path animation system for forklifts, AGVs, and cranes.
 * Animates vehicles traveling between nodes carrying products.
 */

interface VehicleInstance {
  id: string;
  type: 'forklift' | 'agv' | 'crane';
  mesh: THREE.Group;
  // Path following
  path: THREE.Vector3[];
  pathIndex: number;
  progress: number;     // 0-1 between current and next waypoint
  speed: number;        // world units per second
  // State
  state: 'idle' | 'traveling' | 'loading' | 'unloading';
  stateTimer: number;
  // Fork/hook animation
  forkHeight: number;
  targetForkHeight: number;
  // Carrying
  carryMesh: THREE.Mesh | null;
}

interface CraneInstance {
  id: string;
  mesh: THREE.Group;
  trolleyMesh: THREE.Object3D | null;
  hookMesh: THREE.Object3D | null;
  cableMesh: THREE.Mesh | null;
  // Trolley position along beam
  trolleyPos: number;     // 0-1 along beam length
  targetTrolleyPos: number;
  // Hook height
  hookHeight: number;
  targetHookHeight: number;
  // State
  state: 'idle' | 'moving' | 'lifting' | 'lowering';
  spanWidth: number;
}

// Simple box product mesh
function createCarryMesh(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.15, 0.1, 0.12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc4934a,
    roughness: 0.8,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.name = '_carried';
  return mesh;
}

export class VehicleAnimationManager {
  private vehicles: Map<string, VehicleInstance> = new Map();
  private cranes: Map<string, CraneInstance> = new Map();
  private idCounter = 0;

  constructor(_scene: THREE.Scene) {
    // Scene reference kept for future use (adding carry meshes, etc.)
  }

  /**
   * Register a forklift/AGV group for animation.
   */
  registerVehicle(
    _nodeId: string,
    nodeType: 'forklift' | 'agv',
    group: THREE.Group,
    speed: number = 2.0,
  ): string {
    const id = `vehicle_${this.idCounter++}`;

    this.vehicles.set(id, {
      id,
      type: nodeType,
      mesh: group,
      path: [],
      pathIndex: 0,
      progress: 0,
      speed,
      state: 'idle',
      stateTimer: 0,
      forkHeight: 0,
      targetForkHeight: 0,
      carryMesh: null,
    });

    return id;
  }

  /**
   * Register a crane group for trolley/hook animation.
   */
  registerCrane(_nodeId: string, group: THREE.Group, spanWidth: number = 6): string {
    const id = `crane_${this.idCounter++}`;

    let trolleyMesh: THREE.Object3D | null = null;
    let hookMesh: THREE.Object3D | null = null;
    let cableMesh: THREE.Mesh | null = null;

    group.traverse((child) => {
      const name = child.name.toLowerCase();
      if (name.includes('trolley') || name.includes('carriage')) trolleyMesh = child;
      if (name.includes('hook') || name.includes('grab')) hookMesh = child;
      if (name.includes('cable') || name.includes('rope')) cableMesh = child as THREE.Mesh;
    });

    this.cranes.set(id, {
      id,
      mesh: group,
      trolleyMesh,
      hookMesh,
      cableMesh,
      trolleyPos: 0.5,
      targetTrolleyPos: 0.5,
      hookHeight: 0.3,
      targetHookHeight: 0.3,
      state: 'idle',
      spanWidth,
    });

    return id;
  }

  /**
   * Send a vehicle on a delivery path.
   */
  sendVehicle(vehicleId: string, path: THREE.Vector3[]) {
    const v = this.vehicles.get(vehicleId);
    if (!v || path.length < 2) return;

    v.path = path;
    v.pathIndex = 0;
    v.progress = 0;
    v.state = 'loading';
    v.stateTimer = 1.5; // loading time
    v.targetForkHeight = 0.15; // lift fork

    // Add carry mesh
    if (!v.carryMesh) {
      v.carryMesh = createCarryMesh();
      v.mesh.add(v.carryMesh);
    }
    v.carryMesh.visible = true;
  }

  /**
   * Send crane to a position along its beam.
   */
  sendCrane(craneId: string, targetPos: number, liftDown: boolean) {
    const c = this.cranes.get(craneId);
    if (!c) return;

    c.targetTrolleyPos = Math.max(0, Math.min(1, targetPos));
    c.state = 'moving';

    if (liftDown) {
      c.targetHookHeight = 0.05; // lower hook
    } else {
      c.targetHookHeight = 0.3; // raise hook
    }
  }

  /**
   * Update all vehicle and crane animations. Call each frame.
   */
  update(dt: number, elapsed: number) {
    this.updateVehicles(dt, elapsed);
    this.updateCranes(dt, elapsed);
  }

  private updateVehicles(dt: number, elapsed: number) {
    for (const v of this.vehicles.values()) {
      // Animate fork height
      v.forkHeight += (v.targetForkHeight - v.forkHeight) * Math.min(1, dt * 4);

      // Apply fork height to mesh
      v.mesh.traverse((child) => {
        if (child.name === 'forkCarriage' || child.name === 'fork' || child.name === 'cargo') {
          child.position.y = child.userData._baseY !== undefined
            ? child.userData._baseY + v.forkHeight
            : v.forkHeight;
        }
      });

      // Carry mesh follows fork
      if (v.carryMesh) {
        v.carryMesh.position.y = 0.4 + v.forkHeight;
      }

      switch (v.state) {
        case 'idle':
          // Subtle idle bounce
          v.mesh.position.y = Math.sin(elapsed * 1.5) * 0.002;
          break;

        case 'loading':
          v.stateTimer -= dt;
          if (v.stateTimer <= 0) {
            v.state = 'traveling';
          }
          break;

        case 'traveling': {
          if (v.path.length === 0) {
            v.state = 'idle';
            break;
          }

          // Move along path
          v.progress += (v.speed * dt) / Math.max(0.1,
            v.path[v.pathIndex].distanceTo(
              v.path[Math.min(v.pathIndex + 1, v.path.length - 1)]
            )
          );

          if (v.progress >= 1) {
            v.pathIndex++;
            v.progress = 0;

            if (v.pathIndex >= v.path.length - 1) {
              // Reached destination
              v.state = 'unloading';
              v.stateTimer = 1.5;
              v.targetForkHeight = 0; // lower fork
              break;
            }
          }

          // Interpolate position
          const from = v.path[v.pathIndex];
          const to = v.path[Math.min(v.pathIndex + 1, v.path.length - 1)];
          v.mesh.position.lerpVectors(from, to, v.progress);

          // Face direction of travel
          const dx = to.x - from.x;
          const dz = to.z - from.z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            const targetAngle = Math.atan2(dx, dz);
            // Smooth rotation
            let angleDiff = targetAngle - v.mesh.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            v.mesh.rotation.y += angleDiff * Math.min(1, dt * 5);
          }

          // Wheel rotation visual
          const wheelSpeed = v.speed * dt * 8;
          v.mesh.traverse((child) => {
            if (child.name.includes('wheel') || child.name.includes('Wheel')) {
              child.rotation.x += wheelSpeed;
            }
          });
          break;
        }

        case 'unloading':
          v.stateTimer -= dt;
          if (v.stateTimer <= 0) {
            v.state = 'idle';
            v.path = [];
            if (v.carryMesh) v.carryMesh.visible = false;
          }
          break;
      }
    }
  }

  private updateCranes(dt: number, elapsed: number) {
    for (const c of this.cranes.values()) {
      // Smooth trolley movement
      const trolleyDiff = c.targetTrolleyPos - c.trolleyPos;
      c.trolleyPos += trolleyDiff * Math.min(1, dt * 2);

      // Smooth hook height
      const hookDiff = c.targetHookHeight - c.hookHeight;
      c.hookHeight += hookDiff * Math.min(1, dt * 3);

      // Apply trolley position along beam
      if (c.trolleyMesh) {
        const xPos = (c.trolleyPos - 0.5) * c.spanWidth;
        c.trolleyMesh.position.x = xPos;
      }

      // Apply hook height
      if (c.hookMesh) {
        c.hookMesh.position.y = c.hookHeight;
      }

      // Scale cable to match hook distance
      if (c.cableMesh && c.trolleyMesh) {
        const cableLength = (c.trolleyMesh.position.y || 1.0) - c.hookHeight;
        c.cableMesh.scale.y = Math.max(0.1, cableLength);
        c.cableMesh.position.y = c.hookHeight + cableLength / 2;
      }

      // Idle sway
      if (c.state === 'idle' && c.hookMesh) {
        c.hookMesh.rotation.z = Math.sin(elapsed * 0.8) * 0.03;
      }

      // Check if arrived at target
      if (Math.abs(trolleyDiff) < 0.01 && Math.abs(hookDiff) < 0.01) {
        if (c.state === 'moving') c.state = 'idle';
      }
    }
  }

  removeVehicle(id: string) {
    const v = this.vehicles.get(id);
    if (v && v.carryMesh) {
      v.mesh.remove(v.carryMesh);
      v.carryMesh.geometry.dispose();
      (v.carryMesh.material as THREE.Material).dispose();
    }
    this.vehicles.delete(id);
  }

  removeCrane(id: string) {
    this.cranes.delete(id);
  }

  dispose() {
    for (const v of this.vehicles.values()) {
      if (v.carryMesh) {
        v.mesh.remove(v.carryMesh);
        v.carryMesh.geometry.dispose();
        (v.carryMesh.material as THREE.Material).dispose();
      }
    }
    this.vehicles.clear();
    this.cranes.clear();
  }
}
