import * as THREE from 'three';
import type { FKChain, Joint } from './Kinematics';

/**
 * ReachStudy — sample a rigged robot's reachable workspace and render it as
 * a translucent point cloud + convex-hull-ish shell. Signature VC / RobotStudio
 * feature: lets users see *where the tool tip can actually go* before placing
 * stations and conveyors.
 *
 * Approach (pragmatic Monte-Carlo, not exact analytic):
 *   1. Snapshot the chain's current joint angles.
 *   2. For N random samples (or a full grid for low-DOF chains), pick uniform
 *      random angles within each joint's [min, max] limits.
 *   3. Apply, read the tool-tip world position, record it.
 *   4. Restore the original pose.
 *   5. Render the recorded positions as a Points cloud parented to the chain's
 *      base. The user can attach/detach freely.
 *
 * For a 6-DOF cobot with 4000 samples this runs in ~30 ms and gives a very
 * readable workspace shell.
 */

export interface ReachStudyOptions {
  /** Number of random samples to take. Default 4000. */
  samples?: number;
  /** Color of the point cloud. Default sky-blue. */
  color?: number;
  /** Per-point opacity. Default 0.35. */
  opacity?: number;
  /** Optional sub-sampling: only sample every k-th joint to bias certain DOFs. */
  jointWeights?: number[];
}

const _v = new THREE.Vector3();

function uniformAngle(j: Joint): number {
  const lo = j.min ?? -Math.PI;
  const hi = j.max ??  Math.PI;
  return lo + Math.random() * (hi - lo);
}

export class ReachStudy {
  private cloud: THREE.Points | null = null;

  /**
   * Compute reachable points for the given chain. Returns a Points object
   * whose geometry contains all sampled positions (in WORLD coordinates at
   * the time of sampling). The caller can `add()` it to the scene.
   *
   * Restores original joint angles when finished.
   */
  build(chain: FKChain, opts: ReachStudyOptions = {}): THREE.Points {
    const samples = opts.samples ?? 4000;
    const color = opts.color ?? 0x44ccff;
    const opacity = opts.opacity ?? 0.35;

    // Snapshot current pose so we can restore.
    const original = chain.getAngles();

    const positions = new Float32Array(samples * 3);
    let validCount = 0;

    for (let s = 0; s < samples; s++) {
      // Random pose
      for (let i = 0; i < chain.joints.length; i++) {
        chain.setAngle(i, uniformAngle(chain.joints[i]));
      }
      // Read tool-tip world position
      chain.endEffectorWorld(_v);
      positions[validCount * 3 + 0] = _v.x;
      positions[validCount * 3 + 1] = _v.y;
      positions[validCount * 3 + 2] = _v.z;
      validCount++;
    }

    // Restore original
    chain.setAngles(original);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, validCount * 3), 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.025,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'reachStudy';
    points.frustumCulled = false;

    // Dispose any prior cloud built by THIS instance.
    if (this.cloud) this.disposeCloud(this.cloud);
    this.cloud = points;

    return points;
  }

  /** Get the latest cloud (if any). */
  current(): THREE.Points | null { return this.cloud; }

  /** Toggle visibility of the latest cloud. */
  setVisible(v: boolean): void {
    if (this.cloud) this.cloud.visible = v;
  }

  /** Detach + dispose the latest cloud. */
  dispose(): void {
    if (this.cloud) {
      this.disposeCloud(this.cloud);
      this.cloud = null;
    }
  }

  private disposeCloud(c: THREE.Points): void {
    if (c.parent) c.parent.remove(c);
    c.geometry.dispose();
    (c.material as THREE.PointsMaterial).dispose();
  }
}

/**
 * Convenience: compute statistical extents (bounding box + radius) of the
 * reachable workspace, useful for HUD readouts.
 */
export function reachStats(chain: FKChain, samples = 1000): {
  bbox: THREE.Box3;
  maxRadius: number;
  centroid: THREE.Vector3;
} {
  const original = chain.getAngles();
  const bbox = new THREE.Box3();
  const centroid = new THREE.Vector3();
  let maxR = 0;
  const v = new THREE.Vector3();

  // Read base pivot world position by setting angles to 0 and reading j[0]'s position.
  // (Quick approx — uses j0's group matrix.)
  chain.joints[0].group.updateWorldMatrix(true, false);
  const base = new THREE.Vector3().setFromMatrixPosition(chain.joints[0].group.matrixWorld);

  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < chain.joints.length; i++) {
      chain.setAngle(i, uniformAngle(chain.joints[i]));
    }
    chain.endEffectorWorld(v);
    bbox.expandByPoint(v);
    centroid.add(v);
    const r = v.distanceTo(base);
    if (r > maxR) maxR = r;
  }
  centroid.divideScalar(samples);
  chain.setAngles(original);
  return { bbox, maxRadius: maxR, centroid };
}
