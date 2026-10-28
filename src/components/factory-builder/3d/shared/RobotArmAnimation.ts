import * as THREE from 'three';

/**
 * Realistic 6-axis industrial robot arm animation manager.
 * Drives joint-level motion programs with cubic ease-in-out interpolation,
 * dwell pauses, micro-vibration, gripper open/close, and visual enhancements.
 */

// ── Interfaces ──────────────────────────────────────────────────────────────

type RobotState = 'processing' | 'idle' | 'blocked' | 'starved' | 'failed';

interface JointTargets {
  shoulder: number;   // Y rotation in radians
  upperArm: number;   // Z rotation
  forearm: number;     // Z rotation
  wrist?: number;      // Y rotation
  gripper?: number;    // Z rotation (open/close angle, also controls grip scale)
}

interface MotionProgram {
  waypoints: JointTargets[];
  cycleTime: number;           // total seconds for one full cycle
  smoothness: number;          // acceleration factor (lower = smoother)
  dwellTime: number;           // seconds to pause at each waypoint
}

interface JointRefs {
  shoulder: THREE.Object3D | null;
  upperArm: THREE.Object3D | null;
  forearm: THREE.Object3D | null;
  wrist: THREE.Object3D | null;
  gripper: THREE.Object3D | null;
}

interface RobotRecord {
  joints: JointRefs;
  program: MotionProgram;
  state: RobotState;

  // Interpolation state
  currentJoints: JointTargets;
  waypointIndex: number;
  waypointProgress: number;    // 0-1 progress toward current waypoint
  dwellRemaining: number;      // seconds remaining in dwell pause
  isDwelling: boolean;

  // Gripper scale
  gripScale: number;           // current grip scale.x (1.0 = open, 0.6 = closed)

  // Palletizing grid state
  palletCycle: number;

  // Failure droop
  droopAmount: number;

  // Emissive tracking
  emissiveMeshes: THREE.Mesh[];
  baseEmissives: Map<THREE.Mesh, number>;

  // Speed tracking for vibration/emissive
  jointSpeed: number;
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Cubic ease-in-out for smooth trapezoid-like velocity profile. */
function cubicEaseInOut(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Lerp a single value. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a value between min and max. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Convert degrees to radians. */
function deg(d: number): number {
  return d * (Math.PI / 180);
}

// ── Predefined motion programs ──────────────────────────────────────────────

function makeWeldingProgram(): MotionProgram {
  return {
    waypoints: [
      { shoulder: deg(0),   upperArm: deg(-30), forearm: deg(45),  wrist: deg(0),   gripper: deg(0) },
      { shoulder: deg(-40), upperArm: deg(-20), forearm: deg(35),  wrist: deg(10),  gripper: deg(5) },
      { shoulder: deg(-60), upperArm: deg(-15), forearm: deg(30),  wrist: deg(15),  gripper: deg(5) },
      { shoulder: deg(60),  upperArm: deg(-15), forearm: deg(30),  wrist: deg(-15), gripper: deg(5) },
      { shoulder: deg(40),  upperArm: deg(-20), forearm: deg(35),  wrist: deg(-10), gripper: deg(0) },
      { shoulder: deg(0),   upperArm: deg(-40), forearm: deg(50),  wrist: deg(0),   gripper: deg(0) },
    ],
    cycleTime: 4,
    smoothness: 3.5,
    dwellTime: 0.2,
  };
}

function makeAssemblyProgram(): MotionProgram {
  return {
    waypoints: [
      { shoulder: deg(0),   upperArm: deg(-20), forearm: deg(30),  wrist: deg(0),  gripper: deg(0) },
      { shoulder: deg(-35), upperArm: deg(-40), forearm: deg(55),  wrist: deg(5),  gripper: deg(0) },
      { shoulder: deg(-35), upperArm: deg(-40), forearm: deg(55),  wrist: deg(5),  gripper: deg(20) },
      { shoulder: deg(-20), upperArm: deg(-25), forearm: deg(35),  wrist: deg(5),  gripper: deg(20) },
      { shoulder: deg(10),  upperArm: deg(-35), forearm: deg(50),  wrist: deg(-5), gripper: deg(20) },
      { shoulder: deg(10),  upperArm: deg(-35), forearm: deg(50),  wrist: deg(-5), gripper: deg(0) },
      { shoulder: deg(5),   upperArm: deg(-25), forearm: deg(35),  wrist: deg(0),  gripper: deg(0) },
      { shoulder: deg(0),   upperArm: deg(-20), forearm: deg(30),  wrist: deg(0),  gripper: deg(0) },
    ],
    cycleTime: 3,
    smoothness: 4.5,
    dwellTime: 0.3,
  };
}

function makePalletizingProgram(gridIndex: number): MotionProgram {
  // 3x3 grid: compute column/row offsets for pallet placement
  const col = gridIndex % 3;
  const row = Math.floor(gridIndex / 3) % 3;
  const shoulderOffset = deg(-30 + col * 30);   // spread across ±30 degrees
  const armReach = deg(-35 - row * 5);           // slightly different reach per row

  return {
    waypoints: [
      { shoulder: deg(0),           upperArm: deg(-45), forearm: deg(60),  wrist: deg(0),  gripper: deg(0) },
      { shoulder: deg(0),           upperArm: deg(-50), forearm: deg(70),  wrist: deg(0),  gripper: deg(25) },
      { shoulder: deg(0),           upperArm: deg(-30), forearm: deg(40),  wrist: deg(0),  gripper: deg(25) },
      { shoulder: shoulderOffset,   upperArm: armReach,  forearm: deg(50),  wrist: deg(0),  gripper: deg(25) },
      { shoulder: shoulderOffset,   upperArm: deg(armReach + 0.1), forearm: deg(55), wrist: deg(0), gripper: deg(0) },
      { shoulder: deg(0),           upperArm: deg(-30), forearm: deg(40),  wrist: deg(0),  gripper: deg(0) },
    ],
    cycleTime: 5,
    smoothness: 3.0,
    dwellTime: 0.4,
  };
}

function makePaintingProgram(): MotionProgram {
  // Serpentine sweep pattern
  return {
    waypoints: [
      { shoulder: deg(-50), upperArm: deg(-25), forearm: deg(35), wrist: deg(10),  gripper: deg(0) },
      { shoulder: deg(50),  upperArm: deg(-25), forearm: deg(35), wrist: deg(-10), gripper: deg(0) },
      { shoulder: deg(50),  upperArm: deg(-30), forearm: deg(40), wrist: deg(-10), gripper: deg(0) },
      { shoulder: deg(-50), upperArm: deg(-30), forearm: deg(40), wrist: deg(10),  gripper: deg(0) },
      { shoulder: deg(-50), upperArm: deg(-35), forearm: deg(45), wrist: deg(10),  gripper: deg(0) },
      { shoulder: deg(50),  upperArm: deg(-35), forearm: deg(45), wrist: deg(-10), gripper: deg(0) },
    ],
    cycleTime: 6,
    smoothness: 2.5,    // very smooth transitions
    dwellTime: 0.15,
  };
}

function makeDefaultProgram(): MotionProgram {
  return {
    waypoints: [
      { shoulder: deg(0),   upperArm: deg(-20), forearm: deg(30), wrist: deg(0),  gripper: deg(0) },
      { shoulder: deg(-30), upperArm: deg(-40), forearm: deg(55), wrist: deg(5),  gripper: deg(15) },
      { shoulder: deg(20),  upperArm: deg(-35), forearm: deg(50), wrist: deg(-5), gripper: deg(15) },
      { shoulder: deg(20),  upperArm: deg(-35), forearm: deg(50), wrist: deg(-5), gripper: deg(0) },
    ],
    cycleTime: 3,
    smoothness: 4.0,
    dwellTime: 0.3,
  };
}

/** Home position (resting/idle). */
const HOME_JOINTS: JointTargets = {
  shoulder: 0,
  upperArm: deg(-15),
  forearm: deg(20),
  wrist: 0,
  gripper: 0,
};

/** Limp/failed position (gravity droop). */
const LIMP_JOINTS: JointTargets = {
  shoulder: 0,
  upperArm: deg(-70),
  forearm: deg(80),
  wrist: deg(20),
  gripper: deg(-10),
};

// ── Program selection by node type keywords ─────────────────────────────────

function selectProgram(nodeId: string, palletCycle: number): MotionProgram {
  const id = nodeId.toLowerCase();
  if (id.includes('weld'))       return makeWeldingProgram();
  if (id.includes('assembl'))    return makeAssemblyProgram();
  if (id.includes('pallet'))     return makePalletizingProgram(palletCycle);
  if (id.includes('paint') || id.includes('spray') || id.includes('coat'))
    return makePaintingProgram();
  return makeDefaultProgram();
}

// ── Manager ─────────────────────────────────────────────────────────────────

export class RobotArmAnimationManager {
  private robots = new Map<string, RobotRecord>();

  constructor() {}

  // ── Public API ──────────────────────────────────────────────────────────

  /** Scan a THREE.Group for robot arm parts, register and initialise. */
  register(nodeId: string, group: THREE.Group): void {
    const joints: JointRefs = {
      shoulder: null,
      upperArm: null,
      forearm: null,
      wrist: null,
      gripper: null,
    };

    const emissiveMeshes: THREE.Mesh[] = [];
    const baseEmissives = new Map<THREE.Mesh, number>();

    group.traverse((child) => {
      const name = child.name.toLowerCase();
      if (name.includes('robotshoulder') || name === 'robotshoulder') {
        joints.shoulder = child;
      } else if (name.includes('robotupperarm') || name === 'robotupperarm') {
        joints.upperArm = child;
      } else if (name.includes('robotforearm') || name === 'robotforearm') {
        joints.forearm = child;
      } else if (name.includes('robotwrist') || name === 'robotwrist') {
        joints.wrist = child;
      } else if (name.includes('robotgripper') || name.includes('toolflange')) {
        joints.gripper = child;
      }

      // Collect meshes with emissive material for servo glow effect
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive !== undefined) {
          emissiveMeshes.push(mesh);
          baseEmissives.set(mesh, mat.emissiveIntensity ?? 0);
        }
      }
    });

    // At minimum we need a shoulder or upper arm to animate
    if (!joints.shoulder && !joints.upperArm) return;

    const program = selectProgram(nodeId, 0);

    const record: RobotRecord = {
      joints,
      program,
      state: 'idle',
      currentJoints: { ...HOME_JOINTS },
      waypointIndex: 0,
      waypointProgress: 0,
      dwellRemaining: 0,
      isDwelling: false,
      gripScale: 1.0,
      palletCycle: 0,
      droopAmount: 0,
      emissiveMeshes,
      baseEmissives,
      jointSpeed: 0,
    };

    // Apply home position immediately
    this.applyJoints(record, record.currentJoints);
    this.robots.set(nodeId, record);
  }

  /** Set the animation state for a registered robot. */
  setState(nodeId: string, state: string): void {
    const rec = this.robots.get(nodeId);
    if (!rec) return;

    const prev = rec.state;
    rec.state = state as RobotState;

    if (state === 'processing' && prev !== 'processing') {
      // Start or restart the motion program
      rec.waypointIndex = 0;
      rec.waypointProgress = 0;
      rec.dwellRemaining = 0;
      rec.isDwelling = false;
      rec.droopAmount = 0;
      // For palletizing, cycle through grid positions
      if (nodeId.toLowerCase().includes('pallet')) {
        rec.palletCycle = (rec.palletCycle + 1) % 9;
        rec.program = makePalletizingProgram(rec.palletCycle);
      }
    }
    if (state === 'failed') {
      rec.droopAmount = 0; // will ramp up in update
    }
  }

  /** Animate all registered robots. Call every frame. */
  update(dt: number, elapsed: number): void {
    for (const [nodeId, rec] of this.robots) {
      switch (rec.state) {
        case 'processing':
          this.updateProcessing(rec, dt, elapsed, nodeId);
          break;
        case 'idle':
          this.updateIdle(rec, dt);
          break;
        case 'blocked':
        case 'starved':
          this.updateHoldWithVibration(rec, dt, elapsed);
          break;
        case 'failed':
          this.updateFailed(rec, dt);
          break;
      }

      this.updateEmissive(rec, dt);
    }
  }

  /** Unregister a single robot. */
  remove(nodeId: string): void {
    const rec = this.robots.get(nodeId);
    if (rec) {
      // Reset emissive intensities
      for (const mesh of rec.emissiveMeshes) {
        const base = rec.baseEmissives.get(mesh) ?? 0;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat) mat.emissiveIntensity = base;
      }
      this.robots.delete(nodeId);
    }
  }

  /** Unregister all robots and reset state. */
  dispose(): void {
    for (const nodeId of Array.from(this.robots.keys())) {
      this.remove(nodeId);
    }
  }

  // ── State update routines ───────────────────────────────────────────────

  private updateProcessing(rec: RobotRecord, dt: number, elapsed: number, nodeId: string): void {
    const { program } = rec;
    const wpCount = program.waypoints.length;
    if (wpCount === 0) return;

    // Handle dwell pause at waypoints
    if (rec.isDwelling) {
      rec.dwellRemaining -= dt;
      if (rec.dwellRemaining <= 0) {
        rec.isDwelling = false;
        rec.waypointIndex = (rec.waypointIndex + 1) % wpCount;
        rec.waypointProgress = 0;

        // For palletizing, advance grid position when completing a full cycle
        if (rec.waypointIndex === 0 && nodeId.toLowerCase().includes('pallet')) {
          rec.palletCycle = (rec.palletCycle + 1) % 9;
          rec.program = makePalletizingProgram(rec.palletCycle);
        }
      } else {
        // Settling oscillation during dwell — exponential decay for physically
        // realistic servo damping: amplitude falls off as e^(-dampRate * t_elapsed)
        const settleFreq = 25;
        const dampRate = 8;
        const dwellElapsed = program.dwellTime - rec.dwellRemaining;
        const settleAmp = 0.003 * Math.exp(-dampRate * dwellElapsed);
        const settle = Math.sin(elapsed * settleFreq) * settleAmp;

        const settled: JointTargets = { ...rec.currentJoints };
        settled.shoulder += settle;
        settled.upperArm += settle * 0.7;
        settled.forearm += settle * 0.5;
        this.applyJoints(rec, settled);
        rec.jointSpeed = Math.abs(settle) * settleFreq;
        return;
      }
    }

    // Compute per-waypoint segment time
    const segTime = program.cycleTime / wpCount;
    const speedFactor = program.smoothness;

    // Advance progress
    rec.waypointProgress += (dt / segTime);
    rec.waypointProgress = clamp(rec.waypointProgress, 0, 1);

    // Eased progress
    const eased = cubicEaseInOut(rec.waypointProgress);

    // Get previous and target waypoints
    const prevIdx = (rec.waypointIndex - 1 + wpCount) % wpCount;
    const target = program.waypoints[rec.waypointIndex];
    const prev = rec.waypointProgress < 0.01
      ? rec.currentJoints
      : program.waypoints[prevIdx];

    // Interpolate each joint
    const interp: JointTargets = {
      shoulder: lerp(prev.shoulder, target.shoulder, eased),
      upperArm: lerp(prev.upperArm, target.upperArm, eased),
      forearm:  lerp(prev.forearm, target.forearm, eased),
      wrist:    lerp(prev.wrist ?? 0, target.wrist ?? 0, eased),
      gripper:  lerp(prev.gripper ?? 0, target.gripper ?? 0, eased),
    };

    // Micro-vibration during fast movement (mid-segment)
    const vibeEnvelope = Math.sin(rec.waypointProgress * Math.PI); // peak at center
    const vibeAmp = 0.007 * vibeEnvelope * speedFactor / 4;
    const vibeFreq = 60;
    const vibe = Math.sin(elapsed * vibeFreq) * vibeAmp;

    interp.shoulder += vibe;
    interp.upperArm += vibe * 0.8;
    interp.forearm  += vibe * 0.6;

    // Track joint speed for emissive effect
    rec.jointSpeed = Math.abs(target.shoulder - prev.shoulder) * eased +
                     Math.abs(target.upperArm - prev.upperArm) * eased +
                     Math.abs(target.forearm - prev.forearm) * eased;

    // Store and apply
    rec.currentJoints = {
      shoulder: interp.shoulder,
      upperArm: interp.upperArm,
      forearm:  interp.forearm,
      wrist:    interp.wrist,
      gripper:  interp.gripper,
    };
    this.applyJoints(rec, interp);

    // Update gripper scale
    const gripAngle = Math.abs(interp.gripper ?? 0);
    const gripNorm = clamp(gripAngle / deg(25), 0, 1);
    const targetGripScale = lerp(1.0, 0.6, gripNorm);
    rec.gripScale = lerp(rec.gripScale, targetGripScale, clamp(dt * 8, 0, 1));
    if (rec.joints.gripper) {
      rec.joints.gripper.scale.x = rec.gripScale;
    }

    // Check if we've reached the waypoint
    if (rec.waypointProgress >= 1.0) {
      rec.isDwelling = true;
      rec.dwellRemaining = program.dwellTime;
      rec.waypointProgress = 1.0;
    }
  }

  private updateIdle(rec: RobotRecord, dt: number): void {
    // Slow drift toward home position
    const speed = 1.5; // slower than processing
    const t = clamp(dt * speed, 0, 1);

    rec.currentJoints.shoulder = lerp(rec.currentJoints.shoulder, HOME_JOINTS.shoulder, t);
    rec.currentJoints.upperArm = lerp(rec.currentJoints.upperArm, HOME_JOINTS.upperArm, t);
    rec.currentJoints.forearm  = lerp(rec.currentJoints.forearm, HOME_JOINTS.forearm, t);
    rec.currentJoints.wrist    = lerp(rec.currentJoints.wrist ?? 0, HOME_JOINTS.wrist ?? 0, t);
    rec.currentJoints.gripper  = lerp(rec.currentJoints.gripper ?? 0, HOME_JOINTS.gripper ?? 0, t);

    rec.gripScale = lerp(rec.gripScale, 1.0, t);
    if (rec.joints.gripper) {
      rec.joints.gripper.scale.x = rec.gripScale;
    }

    rec.droopAmount = lerp(rec.droopAmount, 0, t);
    rec.jointSpeed = 0;

    this.applyJoints(rec, rec.currentJoints);
  }

  private updateHoldWithVibration(rec: RobotRecord, _dt: number, elapsed: number): void {
    // Hold current position with slight vibration (machine vibration / tension)
    const vibeAmp = 0.008;
    const vibeFreq = 15;
    const vx = Math.sin(elapsed * vibeFreq) * vibeAmp;
    const vy = Math.cos(elapsed * vibeFreq * 1.3) * vibeAmp * 0.6;

    const vibrated: JointTargets = {
      shoulder: rec.currentJoints.shoulder + vx,
      upperArm: rec.currentJoints.upperArm + vy,
      forearm:  rec.currentJoints.forearm + vx * 0.5,
      wrist:    (rec.currentJoints.wrist ?? 0) + vy * 0.3,
      gripper:  rec.currentJoints.gripper,
    };

    rec.jointSpeed = vibeAmp * vibeFreq * 0.3;
    this.applyJoints(rec, vibrated);
  }

  private updateFailed(rec: RobotRecord, dt: number): void {
    // Slowly droop joints toward limp position (gravity simulation)
    const droopSpeed = 0.4;
    const t = clamp(dt * droopSpeed, 0, 1);

    rec.droopAmount = lerp(rec.droopAmount, 1, t);

    const drooped: JointTargets = {
      shoulder: lerp(rec.currentJoints.shoulder, LIMP_JOINTS.shoulder, t),
      upperArm: lerp(rec.currentJoints.upperArm, LIMP_JOINTS.upperArm, t),
      forearm:  lerp(rec.currentJoints.forearm, LIMP_JOINTS.forearm, t),
      wrist:    lerp(rec.currentJoints.wrist ?? 0, LIMP_JOINTS.wrist ?? 0, t),
      gripper:  lerp(rec.currentJoints.gripper ?? 0, LIMP_JOINTS.gripper ?? 0, t),
    };

    rec.currentJoints = { ...drooped };

    // Gripper opens limply
    rec.gripScale = lerp(rec.gripScale, 1.0, t);
    if (rec.joints.gripper) {
      rec.joints.gripper.scale.x = rec.gripScale;
    }

    rec.jointSpeed = rec.droopAmount < 0.95 ? 0.3 : 0;
    this.applyJoints(rec, drooped);
  }

  // ── Joint application ───────────────────────────────────────────────────

  private applyJoints(rec: RobotRecord, targets: JointTargets): void {
    if (rec.joints.shoulder) {
      rec.joints.shoulder.rotation.y = targets.shoulder;
    }
    if (rec.joints.upperArm) {
      rec.joints.upperArm.rotation.z = targets.upperArm;
    }
    if (rec.joints.forearm) {
      rec.joints.forearm.rotation.z = targets.forearm;
    }
    if (rec.joints.wrist && targets.wrist !== undefined) {
      rec.joints.wrist.rotation.y = targets.wrist;
    }
    if (rec.joints.gripper && targets.gripper !== undefined) {
      rec.joints.gripper.rotation.z = targets.gripper;
    }
  }

  // ── Visual enhancements ─────────────────────────────────────────────────

  private updateEmissive(rec: RobotRecord, dt: number): void {
    // Boost emissive during fast joint movement (servo glow)
    const glowBoost = clamp(rec.jointSpeed * 0.5, 0, 0.8);

    for (const mesh of rec.emissiveMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) continue;

      const base = rec.baseEmissives.get(mesh) ?? 0;
      const target = base + glowBoost;
      mat.emissiveIntensity = lerp(mat.emissiveIntensity, target, clamp(dt * 6, 0, 1));
    }
  }
}
