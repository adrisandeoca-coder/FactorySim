import * as THREE from 'three';

/**
 * Forward + Inverse kinematics for rigged THREE.Group hierarchies.
 *
 * Rigging convention (matches Visual Components / Unity):
 *   - Each joint is a THREE.Group whose `rotation[axis]` drives that joint.
 *   - Joints are nested parent->child. Rotating a joint moves every descendant.
 *   - The end-effector is a THREE.Object3D leaf at the tool tip.
 *
 * This module is renderer-side only — the simulation backend stays untouched.
 */

export type Axis = 'x' | 'y' | 'z';

export interface Joint {
  group: THREE.Object3D;  // pivot; rotation[axis] is the joint angle
  axis: Axis;             // local rotation axis
  min?: number;           // soft lower limit (radians)
  max?: number;           // soft upper limit (radians)
  rest?: number;          // home/rest angle (radians)
}

const TMP_VEC = new THREE.Vector3();
const TMP_VEC2 = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_AXIS = new THREE.Vector3();

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function applyLimits(j: Joint, angle: number): number {
  if (j.min !== undefined && angle < j.min) return j.min;
  if (j.max !== undefined && angle > j.max) return j.max;
  return angle;
}

/** Forward Kinematics chain. Drives joint angles and reads the tool pose. */
export class FKChain {
  readonly joints: Joint[];
  readonly tool: THREE.Object3D;

  constructor(joints: Joint[], tool: THREE.Object3D) {
    this.joints = joints;
    this.tool = tool;
  }

  /** Number of degrees of freedom in this chain. */
  get dof(): number {
    return this.joints.length;
  }

  /** Read the current joint angle (radians), with no limit clamping. */
  getAngle(i: number): number {
    const j = this.joints[i];
    return j.group.rotation[j.axis];
  }

  /** Set one joint angle (radians); applies limits if defined. */
  setAngle(i: number, angle: number): void {
    const j = this.joints[i];
    j.group.rotation[j.axis] = applyLimits(j, angle);
  }

  /** Set all joint angles at once. */
  setAngles(angles: number[]): void {
    const n = Math.min(angles.length, this.joints.length);
    for (let i = 0; i < n; i++) this.setAngle(i, angles[i]);
  }

  /** Read all joint angles into a fresh array. */
  getAngles(): number[] {
    return this.joints.map((_, i) => this.getAngle(i));
  }

  /** Drive every joint toward its rest pose. */
  resetToRest(): void {
    for (let i = 0; i < this.joints.length; i++) {
      this.setAngle(i, this.joints[i].rest ?? 0);
    }
  }

  /** World-space position of the tool tip. World matrices are refreshed first. */
  endEffectorWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.tool.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.tool.matrixWorld);
  }
}

/**
 * Closed-form 2-bone IK in a plane (shoulder/elbow, hip/knee).
 * Returns `pitch1` (parent joint pitch) and `pitch2` (child joint pitch),
 * such that placing the child l1 below the parent and l2 below the child
 * lands the tool at `target` relative to the parent's world origin.
 *
 * `axis` is the bend axis in the parent's local frame — both joints rotate
 * about the same axis (the limb plane normal). `forwardSign` flips elbow chirality
 * (set -1 for human elbow that bends backwards relative to shoulder).
 *
 * The "swing" angle (the in-plane direction toward target) is returned as `swing`,
 * which the caller can apply to whichever ancestor controls limb yaw.
 */
export function solveTwoBoneIK(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  forwardSign: 1 | -1 = 1,
): { swing: number; pitch1: number; pitch2: number; reach: number } {
  TMP_VEC.copy(target).sub(origin);
  const dist = clamp(TMP_VEC.length(), 1e-6, l1 + l2 - 1e-4);

  // Law of cosines for the elbow.
  const cosElbow = clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1);
  const elbow = Math.PI - Math.acos(cosElbow);   // 0 = straight, +π = fully folded

  // Shoulder pitch: angle between the bone-from-shoulder direction
  // and the line to the target. Combined with the heading toward the target.
  const cosShoulder = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const shoulderToTarget = Math.acos(cosShoulder);

  // Direction to target in the parent frame: yaw around Y, pitch from horizon.
  const horiz = Math.hypot(TMP_VEC.x, TMP_VEC.z);
  const swing = Math.atan2(TMP_VEC.x, TMP_VEC.z);
  const pitchToTarget = Math.atan2(-TMP_VEC.y, horiz);

  return {
    swing,
    pitch1: pitchToTarget - forwardSign * shoulderToTarget,
    pitch2: forwardSign * elbow,
    reach: dist / (l1 + l2),
  };
}

/**
 * Cyclic Coordinate Descent IK for arbitrary chains (n-DOF, including 6-axis robots).
 * Iterates from the tool back to the base, rotating each joint about its local axis
 * to bring the tool closer to `target`. Respects per-joint limits.
 *
 * Returns the residual error (world-space distance) after the final iteration.
 */
export function solveCCD(
  chain: FKChain,
  target: THREE.Vector3,
  options: { iterations?: number; tolerance?: number } = {},
): number {
  const iterations = options.iterations ?? 12;
  const tolerance = options.tolerance ?? 1e-3;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = chain.joints.length - 1; i >= 0; i--) {
      const j = chain.joints[i];

      j.group.updateWorldMatrix(true, false);
      chain.tool.updateWorldMatrix(true, false);

      const jointWorld = TMP_VEC.setFromMatrixPosition(j.group.matrixWorld);
      const toolWorld = TMP_VEC2.setFromMatrixPosition(chain.tool.matrixWorld);

      // Convert tool and target into the joint's local frame so we rotate
      // about the joint's actual axis correctly.
      const inv = j.group.matrixWorld.clone().invert();
      const toolLocal = toolWorld.clone().sub(jointWorld).applyMatrix4(
        new THREE.Matrix4().extractRotation(inv),
      );
      const targetLocal = target.clone().sub(jointWorld).applyMatrix4(
        new THREE.Matrix4().extractRotation(inv),
      );

      // Project both onto the plane perpendicular to the joint axis.
      TMP_AXIS.set(j.axis === 'x' ? 1 : 0, j.axis === 'y' ? 1 : 0, j.axis === 'z' ? 1 : 0);
      const toolProj = toolLocal.clone().projectOnPlane(TMP_AXIS);
      const targetProj = targetLocal.clone().projectOnPlane(TMP_AXIS);
      if (toolProj.lengthSq() < 1e-8 || targetProj.lengthSq() < 1e-8) continue;
      toolProj.normalize();
      targetProj.normalize();

      const cosTheta = clamp(toolProj.dot(targetProj), -1, 1);
      const cross = toolProj.clone().cross(targetProj);
      const sign = Math.sign(cross.dot(TMP_AXIS)) || 1;
      const delta = sign * Math.acos(cosTheta);

      const next = applyLimits(j, j.group.rotation[j.axis] + delta);
      j.group.rotation[j.axis] = next;
    }

    chain.tool.updateWorldMatrix(true, false);
    TMP_VEC.setFromMatrixPosition(chain.tool.matrixWorld);
    if (TMP_VEC.distanceTo(target) < tolerance) {
      return TMP_VEC.distanceTo(target);
    }
  }

  chain.tool.updateWorldMatrix(true, false);
  TMP_VEC.setFromMatrixPosition(chain.tool.matrixWorld);
  return TMP_VEC.distanceTo(target);
}

/** Smooth-step a chain toward a goal pose at a bounded angular rate. */
export function driveChain(chain: FKChain, goal: number[], maxRate: number, dt: number): void {
  const step = maxRate * dt;
  for (let i = 0; i < chain.joints.length; i++) {
    const cur = chain.getAngle(i);
    const target = goal[i] ?? cur;
    const diff = target - cur;
    const moved = Math.abs(diff) <= step ? target : cur + Math.sign(diff) * step;
    chain.setAngle(i, moved);
  }
}

// Suppress "unused" complaint when only some helpers are imported elsewhere.
void TMP_QUAT;
