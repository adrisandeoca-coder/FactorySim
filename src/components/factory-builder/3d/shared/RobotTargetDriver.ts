import * as THREE from 'three';
import { FKChain, solveCCD, driveChain } from './Kinematics';

/**
 * RobotTargetDriver — high-level controller for any rigged robot arm
 * (cobot or industrial). Accepts Cartesian TCP targets and motion type
 * (MoveJ = joint-space ease, MoveL = Cartesian-linear interpolation),
 * solves IK, and smoothly drives the joints.
 *
 * This is the layer that Visual Components / RobotStudio expose as the
 * "program" interface: a list of waypoints with TCP targets and move types.
 */

export type MoveType = 'movej' | 'movel';

export interface Waypoint {
  /** World-space target position for the TCP. */
  position: THREE.Vector3;
  /** Motion type. movej = joint-space (curved path); movel = linear. */
  type?: MoveType;
  /** Time to traverse this segment (seconds). Default: auto from speed. */
  duration?: number;
  /** Dwell at the waypoint after arrival (seconds). Default: 0. */
  dwell?: number;
  /** Optional tool action triggered on arrival: 'open' | 'close' | null. */
  toolAction?: 'open' | 'close' | null;
}

export interface RobotTargetDriverOptions {
  /** Default linear speed for movel (m/s). */
  linearSpeed?: number;
  /** Default joint speed for movej (rad/s, max joint). */
  jointSpeed?: number;
  /** Called when a waypoint completes. */
  onWaypoint?: (index: number, wp: Waypoint) => void;
  /** Optional gripper group whose .scale.x = open(1)/close(0.5). */
  gripper?: THREE.Object3D | null;
}

interface ProgramState {
  waypoints: Waypoint[];
  index: number;
  startAngles: number[];
  goalAngles: number[];
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  segElapsed: number;
  segDuration: number;
  dwellRemaining: number;
  loop: boolean;
  done: boolean;
}

const _tmpVec = new THREE.Vector3();

/** Cubic ease-in-out (S-curve velocity profile, like a real servo). */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class RobotTargetDriver {
  readonly chain: FKChain;
  private opts: Required<Omit<RobotTargetDriverOptions, 'onWaypoint' | 'gripper'>> &
    Pick<RobotTargetDriverOptions, 'onWaypoint' | 'gripper'>;
  private prog: ProgramState | null = null;
  private gripState: 'open' | 'closed' = 'open';
  private gripScale = 1.0;

  constructor(chain: FKChain, opts: RobotTargetDriverOptions = {}) {
    this.chain = chain;
    this.opts = {
      linearSpeed: opts.linearSpeed ?? 0.4,
      jointSpeed: opts.jointSpeed ?? 1.5,
      onWaypoint: opts.onWaypoint,
      gripper: opts.gripper ?? null,
    };
  }

  /** Set a one-shot or looping waypoint program. Replaces any current program. */
  loadProgram(waypoints: Waypoint[], loop = true): void {
    if (waypoints.length === 0) {
      this.prog = null;
      return;
    }
    this.prog = {
      waypoints,
      index: 0,
      startAngles: this.chain.getAngles(),
      goalAngles: this.chain.getAngles(),
      startPos: this.chain.endEffectorWorld(new THREE.Vector3()),
      endPos: waypoints[0].position.clone(),
      segElapsed: 0,
      segDuration: 0,
      dwellRemaining: 0,
      loop,
      done: false,
    };
    this.beginSegment(0);
  }

  /** Drive to a single target immediately (no program). */
  setTarget(target: THREE.Vector3, moveType: MoveType = 'movej', duration?: number): void {
    this.loadProgram([{ position: target.clone(), type: moveType, duration }], false);
  }

  /** Stop the current program; joints freeze in place. */
  halt(): void {
    this.prog = null;
  }

  /** True if the (non-looping) program has finished. */
  isDone(): boolean {
    return this.prog?.done ?? true;
  }

  update(dt: number): void {
    this.updateGripper(dt);
    if (!this.prog || this.prog.done) return;

    if (this.prog.dwellRemaining > 0) {
      this.prog.dwellRemaining -= dt;
      return;
    }

    const prog = this.prog;
    prog.segElapsed += dt;
    const t = prog.segDuration <= 0 ? 1 : Math.min(1, prog.segElapsed / prog.segDuration);
    const wp = prog.waypoints[prog.index];
    const move = wp.type ?? 'movej';

    if (move === 'movej') {
      // Joint-space cubic ease — natural curved Cartesian path.
      const k = ease(t);
      const angles = prog.startAngles.map((a, i) => a + (prog.goalAngles[i] - a) * k);
      this.chain.setAngles(angles);
    } else {
      // Cartesian-linear: interpolate TCP target, solve IK each step.
      const k = ease(t);
      _tmpVec.copy(prog.startPos).lerp(prog.endPos, k);
      solveCCD(this.chain, _tmpVec, { iterations: 8, tolerance: 1e-3 });
    }

    if (t >= 1) {
      this.completeWaypoint(wp);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private completeWaypoint(wp: Waypoint): void {
    if (!this.prog) return;
    if (wp.toolAction === 'open') this.gripState = 'open';
    else if (wp.toolAction === 'close') this.gripState = 'closed';

    this.opts.onWaypoint?.(this.prog.index, wp);

    if (wp.dwell && wp.dwell > 0) {
      this.prog.dwellRemaining = wp.dwell;
    }

    const next = this.prog.index + 1;
    if (next >= this.prog.waypoints.length) {
      if (this.prog.loop) {
        this.prog.index = 0;
        this.beginSegment(0);
      } else {
        this.prog.done = true;
      }
    } else {
      this.prog.index = next;
      this.beginSegment(next);
    }
  }

  private beginSegment(index: number): void {
    if (!this.prog) return;
    const prog = this.prog;
    const wp = prog.waypoints[index];

    // Sample current pose as the segment start.
    prog.startAngles = this.chain.getAngles();
    prog.startPos = this.chain.endEffectorWorld(new THREE.Vector3());
    prog.endPos.copy(wp.position);
    prog.segElapsed = 0;

    // Solve IK on a temporary chain copy to discover the goal joint angles
    // for movej. We do this by snapshotting, solving, snapshotting goal,
    // restoring the start angles for the actual interpolation.
    if ((wp.type ?? 'movej') === 'movej') {
      const saved = this.chain.getAngles();
      solveCCD(this.chain, wp.position, { iterations: 25, tolerance: 5e-4 });
      prog.goalAngles = this.chain.getAngles();
      this.chain.setAngles(saved);
    } else {
      prog.goalAngles = prog.startAngles.slice();
    }

    // Duration: use override, else derive from speed.
    if (wp.duration && wp.duration > 0) {
      prog.segDuration = wp.duration;
    } else if ((wp.type ?? 'movej') === 'movel') {
      const dist = prog.startPos.distanceTo(wp.position);
      prog.segDuration = Math.max(0.1, dist / this.opts.linearSpeed);
    } else {
      const maxDelta = Math.max(...prog.startAngles.map((a, i) =>
        Math.abs((prog.goalAngles[i] ?? a) - a)
      ));
      prog.segDuration = Math.max(0.1, maxDelta / this.opts.jointSpeed);
    }
  }

  private updateGripper(dt: number): void {
    const target = this.gripState === 'open' ? 1.0 : 0.5;
    const k = Math.min(1, dt * 6);
    this.gripScale += (target - this.gripScale) * k;
    if (this.opts.gripper) {
      this.opts.gripper.scale.x = this.gripScale;
    }
  }
}

/** Convenience: drive a chain toward a fixed pose at bounded rate (no program). */
export function holdAt(chain: FKChain, angles: number[], maxRate = 1.5, dt = 0.016): void {
  driveChain(chain, angles, maxRate, dt);
}
