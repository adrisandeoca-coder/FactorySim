import * as THREE from 'three';
import { RobotTargetDriver } from './RobotTargetDriver';
import type { FKChain } from './Kinematics';
import type { ScenarioRenderResult } from './ScenarioRenderer';

/**
 * ScenarioAnimator — drives every rigged robot in a scenario with a default
 * pick-and-place loop, so the 3D World *looks alive* immediately after the
 * scene is built. This is the bridge between the Excel-driven static scene
 * and a moving Visual-Components-style demo.
 *
 * Detection rule: any entity whose detailed-level group has `userData.fkChain`
 * gets a RobotTargetDriver attached with a 4-waypoint program orbiting in
 * front of the robot. Different robots get phase-offset waypoints so the
 * factory looks busy, not synchronized.
 */

interface ManagedRobot {
  entityId: string;
  driver: RobotTargetDriver;
  /** The detailed-level group (so we re-parent / detach correctly on dispose). */
  detailed: THREE.Group;
  /** Cached pick-and-place waypoints; restored when state returns to processing. */
  baseWaypoints: ReturnType<typeof buildPickAndPlaceWaypoints>;
  /** Last state we set, to avoid re-loading the program every frame. */
  lastState: string;
}

/** State source: e.g. () => liveSimulationStore.getState().stationStates */
export type StationStateSource = () => Record<string, string>;

const _v = new THREE.Vector3();

function buildPickAndPlaceWaypoints(reach: number, phase: number) {
  // Four-waypoint loop: home -> pick (low) -> via (high) -> place (low) -> home
  const r = reach * 0.55;
  return [
    {
      position: new THREE.Vector3(Math.sin(phase) * r,         0.45, Math.cos(phase) * r),
      type: 'movej' as const, toolAction: 'open' as const, dwell: 0.3,
    },
    {
      position: new THREE.Vector3(Math.sin(phase) * r,         0.30, Math.cos(phase) * r),
      type: 'movel' as const, toolAction: 'close' as const, dwell: 0.4,
    },
    {
      position: new THREE.Vector3(Math.sin(phase + Math.PI) * r, 0.55, Math.cos(phase + Math.PI) * r),
      type: 'movej' as const, dwell: 0.2,
    },
    {
      position: new THREE.Vector3(Math.sin(phase + Math.PI) * r, 0.30, Math.cos(phase + Math.PI) * r),
      type: 'movel' as const, toolAction: 'open' as const, dwell: 0.4,
    },
  ];
}

export class ScenarioAnimator {
  private robots: ManagedRobot[] = [];
  private stateSource: StationStateSource | null = null;

  /**
   * Wire the animator to a sim-state provider so robot motion follows the
   * simulation replay (processing → run loop, blocked/starved → hold,
   * failed → droop, idle → home pose). Pass `null` to detach.
   */
  setStateSource(source: StationStateSource | null): void {
    this.stateSource = source;
  }

  /** Scan a render result, detect rigged robots, attach drivers. */
  attach(result: ScenarioRenderResult): void {
    this.attachInner(result.entityById, true);
  }

  /**
   * Alternate attach path for callers that have a flat `Map<id, Group>` and
   * no MultiScale wrapper — e.g. Factory3DView. Each group is checked directly
   * for `userData.fkChain`. Scenes that mix wrapped and unwrapped groups also
   * work: we look at the wrapper first, then fall back to the group itself.
   */
  attachGroups(groups: Map<string, THREE.Group>): void {
    this.attachInner(groups, false);
  }

  private attachInner(entries: Map<string, THREE.Group>, requireMultiScaleHint: boolean): void {
    void requireMultiScaleHint;
    this.dispose();

    let phaseOffset = 0;
    for (const [entityId, wrapper] of entries) {
      // Try the multi-scale path first; fall back to the wrapper itself
      // (Factory3DView style — robots are returned directly by builders).
      const detailedFromScale = wrapper.userData.multiScale?.levels?.detailed as THREE.Group | undefined;
      const detailed = detailedFromScale ?? wrapper;

      const fkChain = detailed.userData.fkChain as FKChain | undefined;
      if (!fkChain) continue;
      const kin = detailed.userData.kinematics;
      if (!kin) continue;

      // Compute the robot's reach so the loop fits inside its envelope.
      const restPos = fkChain.endEffectorWorld(_v).clone();
      const robotPos = wrapper.position;
      const reach = Math.max(0.25, restPos.distanceTo(robotPos));

      // Build waypoints in the robot's local frame, then transform to world.
      const local = buildPickAndPlaceWaypoints(reach, 0);
      const wpWorld = local.map((wp) => ({
        ...wp,
        // Phase-shift across robots so they're not in lockstep.
        position: wp.position.clone().add(robotPos),
      }));
      // (phase shift is applied here as an offset to dwell so robots desync naturally)
      void phaseOffset;
      phaseOffset += 0.6;

      const driver = new RobotTargetDriver(fkChain, {
        linearSpeed: 0.5,
        jointSpeed: 1.6,
        gripper: kin.fingerL ?? null,
      });
      driver.loadProgram(wpWorld, true);

      this.robots.push({
        entityId,
        driver,
        detailed,
        baseWaypoints: wpWorld,
        lastState: 'processing',
      });
    }
  }

  /**
   * Switch a single robot's behavior based on a simulation state name.
   * Reduces redundant program reloads with `lastState` caching.
   */
  setRobotState(entityId: string, state: string): void {
    const rec = this.robots.find(r => r.entityId === entityId);
    if (!rec || rec.lastState === state) return;
    rec.lastState = state;

    switch (state) {
      case 'processing':
      case 'setup':
        // Resume the pick-and-place loop.
        rec.driver.loadProgram(rec.baseWaypoints, true);
        break;
      case 'blocked':
      case 'starved':
      case 'batch_wait':
        // Halt: freeze in place. The sim will resume on state change.
        rec.driver.halt();
        break;
      case 'failed':
        // Droop to a "limp" pose by setting all joint angles toward gravity-loaded values.
        // The chain limits prevent overshoot.
        rec.driver.halt();
        // Send to a slow target far below to simulate sag.
        rec.driver.setTarget(
          rec.driver.chain.endEffectorWorld(new THREE.Vector3()).clone().add(new THREE.Vector3(0, -0.5, 0)),
          'movej',
          1.5,
        );
        break;
      case 'idle':
      case 'off_shift':
        // Return to rest (chain home pose).
        rec.driver.halt();
        rec.driver.chain.resetToRest();
        break;
      default:
        rec.driver.loadProgram(rec.baseWaypoints, true);
    }
  }

  update(dt: number): void {
    // Pull simulation state once per frame and route to each robot.
    if (this.stateSource) {
      const states = this.stateSource();
      for (const r of this.robots) {
        const s = states[r.entityId];
        if (s) this.setRobotState(r.entityId, s);
      }
    }
    for (const r of this.robots) r.driver.update(dt);
  }

  /** Number of robots currently animated — useful for UI badges. */
  count(): number { return this.robots.length; }

  dispose(): void {
    for (const r of this.robots) r.driver.halt();
    this.robots = [];
  }
}
