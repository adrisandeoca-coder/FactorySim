import * as THREE from 'three';
import type { ScenarioAnimator } from './ScenarioAnimator';
import type { ProductFlowAnimator } from './ProductFlowAnimator';
import { reparent } from './WorkObject';
import type { ScenarioRenderResult } from './ScenarioRenderer';

/**
 * PickAndPlaceCoordinator — the "looks like Visual Components" moment.
 *
 * When a robot's RobotTargetDriver fires its 'close' tool action mid-program,
 * find the nearest product on a nearby conveyor belt, reparent it onto the
 * robot's gripper (preserving world position via WorkObject.reparent), and
 * carry it through the next move. On the 'open' action, drop it back to the
 * scene root at the current world position so it stays where the robot
 * placed it.
 *
 * This is what unifies ScenarioAnimator + ProductFlowAnimator into the
 * familiar pick-and-place demo seen in VC / RobotStudio / FlexSim.
 */

interface RigInfo {
  entityId: string;
  gripper: THREE.Object3D;        // where products attach (under the tool flange)
  toolTip: THREE.Object3D;
  robotPos: THREE.Vector3;        // world position for proximity search
  held: THREE.Object3D | null;    // currently-held product, if any
}

const _v = new THREE.Vector3();

export class PickAndPlaceCoordinator {
  private rigs: RigInfo[] = [];
  private flow: ProductFlowAnimator | null = null;
  private sceneRoot: THREE.Object3D | null = null;

  /**
   * Wire up rigs and product flow. Call after both animators have `.attach()`-ed
   * the same scenario. The coordinator hooks into each robot's driver callbacks.
   */
  attach(
    result: ScenarioRenderResult,
    animator: ScenarioAnimator,
    flow: ProductFlowAnimator,
  ): void {
    this.dispose();
    this.flow = flow;
    this.sceneRoot = result.root;

    // Pull every rigged robot out of the result and replace its driver's
    // onWaypoint callback with one that performs pick/place reparenting.
    const animatorRobots = (animator as unknown as { robots: Array<{
      entityId: string;
      driver: { setOnWaypoint?: (cb: (idx: number, wp: { toolAction?: 'open' | 'close' | null }) => void) => void;
                opts?: { onWaypoint?: (idx: number, wp: unknown) => void } } & {
        // We re-use the driver's options reference; see RobotTargetDriver.
      };
      detailed: THREE.Group;
    }> }).robots;

    for (const r of animatorRobots) {
      const detailed = r.detailed;
      const kin = detailed.userData.kinematics;
      const gripper: THREE.Object3D | undefined = kin?.gripper ?? kin?.toolTip;
      const toolTip: THREE.Object3D | undefined = kin?.toolTip;
      if (!gripper || !toolTip) continue;

      // The wrapper group's world position is the robot's footprint center.
      const wrapper = detailed.parent;
      const robotPos = new THREE.Vector3();
      (wrapper ?? detailed).getWorldPosition(robotPos);

      const rec: RigInfo = {
        entityId: r.entityId,
        gripper,
        toolTip,
        robotPos,
        held: null,
      };
      this.rigs.push(rec);

      // Inject our hook by extending the driver's options.onWaypoint.
      // We don't use a setter — RobotTargetDriver accesses opts.onWaypoint
      // directly inside completeWaypoint, so swapping the reference works.
      const opts = (r.driver as unknown as { opts: { onWaypoint?: (idx: number, wp: { toolAction?: 'open' | 'close' | null }) => void } }).opts;
      const prev = opts.onWaypoint;
      opts.onWaypoint = (idx, wp) => {
        if (wp.toolAction === 'close') this.tryPick(rec);
        else if (wp.toolAction === 'open') this.tryPlace(rec);
        prev?.(idx, wp);
      };
    }
  }

  private tryPick(rec: RigInfo): void {
    if (rec.held || !this.flow) return;
    // Find the nearest unreserved product on any belt within 1.0 m of the tool tip.
    rec.toolTip.getWorldPosition(_v);

    const belts = (this.flow as unknown as { belts: Array<{
      products: Array<{ group: THREE.Group; t: number }>;
    }> }).belts;

    let bestProduct: THREE.Group | null = null;
    let bestDist = 2.5;   // pick-up radius (meters); generous so demo scenes work
    let bestBeltIdx = -1;
    let bestProductIdx = -1;

    for (let i = 0; i < belts.length; i++) {
      const belt = belts[i];
      for (let j = 0; j < belt.products.length; j++) {
        const p = belt.products[j];
        const dist = p.group.position.distanceTo(_v);
        if (dist < bestDist) {
          bestDist = dist;
          bestProduct = p.group;
          bestBeltIdx = i;
          bestProductIdx = j;
        }
      }
    }

    if (!bestProduct) return;

    // Remove from belt's tracking list so the flow animator stops moving it.
    belts[bestBeltIdx].products.splice(bestProductIdx, 1);

    // Reparent onto gripper at a small local offset so it sits between fingers.
    reparent(bestProduct, rec.gripper);
    bestProduct.position.set(0, 0.06, 0);
    rec.held = bestProduct;
  }

  private tryPlace(rec: RigInfo): void {
    if (!rec.held || !this.sceneRoot) return;
    // Drop back to world at the current pose (preserves world position).
    reparent(rec.held, this.sceneRoot);
    rec.held = null;
  }

  /** Status snapshot for UI badges. */
  count(): { robots: number; holding: number } {
    return {
      robots: this.rigs.length,
      holding: this.rigs.filter(r => r.held !== null).length,
    };
  }

  dispose(): void {
    this.rigs = [];
    this.flow = null;
    this.sceneRoot = null;
  }
}
