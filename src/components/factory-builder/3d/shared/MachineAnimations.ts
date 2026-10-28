import * as THREE from 'three';

/**
 * Detailed micro-animation system for factory machines.
 * Manages vibration, gauge needles, spinning parts, screen flicker,
 * door/hatch motion, pneumatic pistons, fans, and warning beacons.
 */

type MachineState = 'processing' | 'idle' | 'blocked' | 'starved' | 'failed' | 'off';

// ── Per-part animation records ──────────────────────────────────────────────

interface VibrationAnim {
  kind: 'vibration';
  basePos: THREE.Vector3;
  intensity: number;   // current
  target: number;      // target intensity (0-1)
}

interface GaugeAnim {
  kind: 'gauge';
  obj: THREE.Object3D;
  baseRotation: number;
  current: number;     // 0-1 normalised needle position
  target: number;
}

interface SpindleAnim {
  kind: 'spindle';
  obj: THREE.Object3D;
  speed: number;       // current rad/s
  target: number;      // target rad/s
}

interface ScreenAnim {
  kind: 'screen';
  mesh: THREE.Mesh;
  baseEmissiveIntensity: number;
  intensity: number;
  target: number;
  refreshTimer: number;
  refreshing: boolean;
}

interface DoorAnim {
  kind: 'door';
  obj: THREE.Object3D;
  angle: number;       // current rotation.y
  target: number;      // target rotation.y
}

interface PistonAnim {
  kind: 'piston';
  obj: THREE.Object3D;
  baseY: number;
  phase: number;       // 0-1 cycle position
  active: boolean;
}

interface FanAnim {
  kind: 'fan';
  obj: THREE.Object3D;
  speed: number;       // current rad/s
  target: number;
}

interface BeaconAnim {
  kind: 'beacon';
  mesh: THREE.Mesh;
  flashTimer: number;
  color: THREE.Color;
  targetColor: THREE.Color;
  intensity: number;
  targetIntensity: number;
  flashRate: number;   // Hz, 0 = steady
}

type PartAnim =
  | VibrationAnim
  | GaugeAnim
  | SpindleAnim
  | ScreenAnim
  | DoorAnim
  | PistonAnim
  | FanAnim
  | BeaconAnim;

// ── Registered machine record ───────────────────────────────────────────────

interface RegisteredMachine {
  nodeId: string;
  nodeType: string;
  group: THREE.Group;
  state: MachineState;
  parts: PartAnim[];
}

// ── Node-type sets for matching ─────────────────────────────────────────────

const VIBRATION_TYPES = new Set([
  'station', 'assembly', 'press', 'injectionmolder',
]);
const SPINDLE_TYPES = new Set(['cncmachine', 'lathe']);
const DOOR_TYPES = new Set(['washer', 'oven', 'paintbooth']);
const PISTON_TYPES = new Set(['press', 'injectionmolder']);
const FAN_TYPES = new Set(['paintbooth', 'oven']);

// ── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh === true;
}

function getEmissiveMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  const mat = mesh.material;
  if (mat && (mat as THREE.MeshStandardMaterial).emissive !== undefined) {
    return mat as THREE.MeshStandardMaterial;
  }
  return null;
}

// ── Main manager class ──────────────────────────────────────────────────────

export class MachineAnimationManager {
  private machines: Map<string, RegisteredMachine> = new Map();

  // ── Registration ────────────────────────────────────────────────────────

  /**
   * Scan the group for animatable child parts and register them.
   * Different node types receive different animation sets.
   */
  register(nodeId: string, nodeType: string, group: THREE.Group): void {
    const type = nodeType.toLowerCase().replace(/[\s_-]/g, '');
    const parts: PartAnim[] = [];

    // Vibration for the whole group
    if (VIBRATION_TYPES.has(type)) {
      parts.push({
        kind: 'vibration',
        basePos: group.position.clone(),
        intensity: 0,
        target: 0,
      });
    }

    // Traverse children to find named parts
    group.traverse((child) => {
      const name = child.name.toLowerCase();

      // Gauge / dial
      if (name === 'gauge' || name === 'dial') {
        parts.push({
          kind: 'gauge',
          obj: child,
          baseRotation: child.rotation.z,
          current: 0.1,
          target: 0.1,
        });
      }

      // Spindle / chuck
      if (SPINDLE_TYPES.has(type) && (name === 'spindle' || name === 'chuck')) {
        parts.push({
          kind: 'spindle',
          obj: child,
          speed: 0,
          target: 0,
        });
      }

      // Screen / display
      if ((name === 'screen' || name === 'display') && isMesh(child)) {
        const mat = getEmissiveMaterial(child);
        parts.push({
          kind: 'screen',
          mesh: child,
          baseEmissiveIntensity: mat?.emissiveIntensity ?? 1,
          intensity: 0.3,
          target: 0.3,
          refreshTimer: Math.random() * 3,
          refreshing: false,
        });
      }

      // Door / hatch
      if (DOOR_TYPES.has(type) && (name === 'door' || name === 'hatch')) {
        parts.push({
          kind: 'door',
          obj: child,
          angle: child.rotation.y,
          target: child.rotation.y,
        });
      }

      // Piston / ram
      if (PISTON_TYPES.has(type) && (name === 'piston' || name === 'ram')) {
        parts.push({
          kind: 'piston',
          obj: child,
          baseY: child.position.y,
          phase: 0,
          active: false,
        });
      }

      // Fan / vent
      if (FAN_TYPES.has(type) && (name === 'fan' || name === 'vent')) {
        parts.push({
          kind: 'fan',
          obj: child,
          speed: 0,
          target: 0,
        });
      }

      // Beacon / warning light (on any machine)
      if ((name === 'beacon' || name === 'warninglight') && isMesh(child)) {
        parts.push({
          kind: 'beacon',
          mesh: child,
          flashTimer: 0,
          color: new THREE.Color(0x00ff00),
          targetColor: new THREE.Color(0x00ff00),
          intensity: 0,
          targetIntensity: 0,
          flashRate: 0,
        });
      }
    });

    this.machines.set(nodeId, {
      nodeId,
      nodeType: type,
      group,
      state: 'idle',
      parts,
    });

    // Apply initial idle state targets
    this.applyStateTargets(this.machines.get(nodeId)!);
  }

  // ── State management ────────────────────────────────────────────────────

  /**
   * Set the processing state for a registered machine.
   */
  setState(nodeId: string, state: string): void {
    const machine = this.machines.get(nodeId);
    if (!machine) return;
    machine.state = state as MachineState;
    this.applyStateTargets(machine);
  }

  /**
   * Map the current state to animation targets for every part.
   */
  private applyStateTargets(machine: RegisteredMachine): void {
    const { state, parts } = machine;

    for (const part of parts) {
      switch (part.kind) {
        case 'vibration':
          part.target = state === 'processing' ? 1 : 0;
          break;

        case 'gauge':
          if (state === 'processing') part.target = 0.7 + Math.random() * 0.2; // 70-90%
          else if (state === 'failed') part.target = 0;
          else part.target = 0.1; // idle
          break;

        case 'spindle':
          part.target = state === 'processing' ? 18 : 1.5; // rad/s — high or slow
          if (state === 'off' || state === 'failed') part.target = 0;
          break;

        case 'screen':
          if (state === 'processing') part.target = 1.0;
          else if (state === 'off') part.target = 0;
          else part.target = 0.3; // idle dim glow
          break;

        case 'door':
          // Processing: closed (0), otherwise open (-PI/2)
          part.target = state === 'processing' ? 0 : -Math.PI / 2;
          break;

        case 'piston':
          part.active = state === 'processing';
          break;

        case 'fan':
          part.target = state === 'processing' ? 14 : 0.8; // rad/s
          if (state === 'off' || state === 'failed') part.target = 0;
          break;

        case 'beacon':
          this.applyBeaconState(part, state);
          break;
      }
    }
  }

  private applyBeaconState(beacon: BeaconAnim, state: MachineState): void {
    switch (state) {
      case 'processing':
        beacon.targetColor.setHex(0x00cc44);
        beacon.targetIntensity = 0.8;
        beacon.flashRate = 0; // steady
        break;
      case 'blocked':
      case 'starved':
        beacon.targetColor.setHex(0xffcc00);
        beacon.targetIntensity = 1.0;
        beacon.flashRate = 1; // 1 Hz
        break;
      case 'failed':
        beacon.targetColor.setHex(0xff2200);
        beacon.targetIntensity = 1.2;
        beacon.flashRate = 3; // 3 Hz
        break;
      case 'idle':
        beacon.targetColor.setHex(0x00cc44);
        beacon.targetIntensity = 0.3;
        beacon.flashRate = 0;
        break;
      default: // off
        beacon.targetIntensity = 0;
        beacon.flashRate = 0;
        break;
    }
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  /**
   * Update all registered machine animations.
   * @param dt  Delta time in seconds since last frame
   * @param elapsed  Total elapsed time in seconds
   */
  update(dt: number, elapsed: number): void {
    const rampSpeed = 4; // interpolation speed multiplier

    for (const machine of this.machines.values()) {
      for (const part of machine.parts) {
        switch (part.kind) {
          case 'vibration':
            this.updateVibration(part, machine.group, dt, elapsed, rampSpeed);
            break;
          case 'gauge':
            this.updateGauge(part, dt, elapsed, rampSpeed);
            break;
          case 'spindle':
            this.updateSpindle(part, dt, rampSpeed);
            break;
          case 'screen':
            this.updateScreen(part, dt, elapsed, rampSpeed);
            break;
          case 'door':
            this.updateDoor(part, dt);
            break;
          case 'piston':
            this.updatePiston(part, dt);
            break;
          case 'fan':
            this.updateFan(part, dt, rampSpeed);
            break;
          case 'beacon':
            this.updateBeacon(part, dt, elapsed, rampSpeed);
            break;
        }
      }
    }
  }

  // ── Individual animation updaters ───────────────────────────────────────

  private updateVibration(
    v: VibrationAnim,
    group: THREE.Group,
    dt: number,
    elapsed: number,
    rampSpeed: number,
  ): void {
    v.intensity = lerp(v.intensity, v.target, clamp(rampSpeed * dt, 0, 1));
    if (v.intensity < 0.001) {
      // Snap back to base when effectively zero
      group.position.copy(v.basePos);
      return;
    }
    const amplitude = 0.003 * v.intensity;
    const freq = 60; // Hz — high frequency jitter
    group.position.x = v.basePos.x + Math.sin(elapsed * freq) * amplitude;
    group.position.y = v.basePos.y + Math.cos(elapsed * freq * 1.3) * amplitude * 0.7;
    group.position.z = v.basePos.z + Math.sin(elapsed * freq * 0.9 + 1.7) * amplitude * 0.5;
  }

  private updateGauge(
    g: GaugeAnim,
    dt: number,
    elapsed: number,
    rampSpeed: number,
  ): void {
    g.current = lerp(g.current, g.target, clamp(rampSpeed * dt * 0.5, 0, 1));

    // Add subtle oscillation when in upper range (processing)
    let oscillation = 0;
    if (g.target > 0.5) {
      oscillation = Math.sin(elapsed * 4) * 0.03 + Math.sin(elapsed * 7.3) * 0.015;
    }

    // Map 0-1 to rotation range: 0 = -PI/3 (low), 1 = PI/3 (high)
    const range = Math.PI / 3;
    g.obj.rotation.z = g.baseRotation + lerp(-range, range, clamp(g.current + oscillation, 0, 1));
  }

  private updateSpindle(
    s: SpindleAnim,
    dt: number,
    rampSpeed: number,
  ): void {
    s.speed = lerp(s.speed, s.target, clamp(rampSpeed * dt * 0.3, 0, 1));
    s.obj.rotation.y += s.speed * dt;
  }

  private updateScreen(
    sc: ScreenAnim,
    dt: number,
    elapsed: number,
    rampSpeed: number,
  ): void {
    // Handle refresh flicker cycle
    sc.refreshTimer -= dt;
    if (sc.refreshTimer <= 0 && sc.target > 0.5) {
      sc.refreshing = true;
      sc.refreshTimer = 2.5 + Math.random() * 1.0; // ~3s ± jitter
    }

    let flickerTarget = sc.target;
    if (sc.refreshing) {
      // Brief dip for refresh
      flickerTarget = sc.target * 0.4;
      sc.refreshing = false; // single frame dip, recovers next frame
    }

    // Processing: subtle flicker in 0.8-1.2 range
    if (sc.target >= 0.8) {
      const flicker = 1.0 + Math.sin(elapsed * 23) * 0.08 + Math.sin(elapsed * 47) * 0.04;
      flickerTarget *= flicker;
    }

    sc.intensity = lerp(sc.intensity, flickerTarget, clamp(rampSpeed * dt, 0, 1));

    const mat = getEmissiveMaterial(sc.mesh);
    if (mat) {
      mat.emissiveIntensity = sc.intensity * sc.baseEmissiveIntensity;
    }
  }

  private updateDoor(d: DoorAnim, dt: number): void {
    if (Math.abs(d.angle - d.target) < 0.001) {
      d.angle = d.target;
    } else {
      // Smooth ease using smoothstep-shaped interpolation
      const diff = d.target - d.angle;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), 3 * dt);
      const t = smoothStep(clamp(Math.abs(step / diff), 0, 1));
      d.angle += diff * clamp(4 * dt * (0.3 + 0.7 * t), 0, 1);
    }
    d.obj.rotation.y = d.angle;
  }

  private updatePiston(p: PistonAnim, dt: number): void {
    if (!p.active) {
      // Return to rest
      p.phase = lerp(p.phase, 0, clamp(3 * dt, 0, 1));
    } else {
      // Advance cycle — ~2 second period
      p.phase += dt / 2;
      if (p.phase > 1) p.phase -= 1;
    }

    // Asymmetric motion: quick down stroke (0-0.3), slow return (0.3-1.0)
    let displacement: number;
    if (p.phase < 0.3) {
      // Quick down stroke
      const t = p.phase / 0.3;
      displacement = smoothStep(t);
    } else {
      // Slow return
      const t = (p.phase - 0.3) / 0.7;
      displacement = 1 - smoothStep(t);
    }

    p.obj.position.y = p.baseY - displacement * 0.3;
  }

  private updateFan(
    f: FanAnim,
    dt: number,
    rampSpeed: number,
  ): void {
    f.speed = lerp(f.speed, f.target, clamp(rampSpeed * dt * 0.2, 0, 1));
    f.obj.rotation.z += f.speed * dt;
  }

  private updateBeacon(
    b: BeaconAnim,
    dt: number,
    _elapsed: number,
    rampSpeed: number,
  ): void {
    // Lerp colour
    b.color.lerp(b.targetColor, clamp(rampSpeed * dt, 0, 1));
    b.intensity = lerp(b.intensity, b.targetIntensity, clamp(rampSpeed * dt, 0, 1));

    // Flash modulation
    let flashMod = 1;
    if (b.flashRate > 0) {
      b.flashTimer += dt;
      // Square-ish flash via smoothed sine
      const raw = Math.sin(b.flashTimer * b.flashRate * Math.PI * 2);
      flashMod = raw > 0 ? 1 : 0.1;
    }

    const mat = getEmissiveMaterial(b.mesh);
    if (mat) {
      mat.emissive.copy(b.color);
      mat.emissiveIntensity = b.intensity * flashMod;
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Remove a single registered machine.
   */
  remove(nodeId: string): void {
    const machine = this.machines.get(nodeId);
    if (!machine) return;

    // Reset positions / rotations to base values
    for (const part of machine.parts) {
      switch (part.kind) {
        case 'vibration':
          machine.group.position.copy(part.basePos);
          break;
        case 'gauge':
          part.obj.rotation.z = part.baseRotation;
          break;
        case 'piston':
          part.obj.position.y = part.baseY;
          break;
      }
    }

    this.machines.delete(nodeId);
  }

  /**
   * Remove all registered machines and clean up.
   */
  dispose(): void {
    for (const nodeId of Array.from(this.machines.keys())) {
      this.remove(nodeId);
    }
    this.machines.clear();
  }
}
