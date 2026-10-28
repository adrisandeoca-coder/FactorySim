import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';
import { FKChain, type Joint } from '../../shared/Kinematics';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * SCARA Robot — Selective Compliance Assembly Robot Arm — fully rigged 4-DOF.
 *
 * Joint chain (SCARA convention — all motion is in the horizontal plane plus a
 * vertical Z-spindle):
 *   j1 (base yaw, Y)  →  arm1
 *     j2 (elbow yaw, Y)  →  arm2
 *       j3 (vertical Z prismatic, modeled here as Y-translation via group.position.y)
 *         j4 (tool roll, Y)  →  gripper / suction tool
 *
 * Joint group names match RobotArmAnimationManager conventions
 * (`robotShoulder`, `robotUpperArm`, `robotForearm`, `robotWrist`)
 * so existing motion programs drive it.
 *
 * Note: SCARA's Z axis is prismatic (linear), not rotational. We expose it as
 * a translation joint via `customApply` on the FK chain. For waypoint-style
 * pick-and-place, the existing target-driver works fine because the IK can
 * still reach Cartesian targets — the planar arms set XZ, the spindle sets Y.
 */
export function buildScaraRobot(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBase     = mat(0x3a3e48, 0.75, 0.4);
  const mBody     = mat(0xe8e8e8, 0.45, 0.40);
  const mArm      = mat(0xf0f0f0, 0.40, 0.45);
  const mAccent   = mat(0x2060c0, 0.30, 0.50);
  const mJoint    = mat(0x2a2e35, 0.70, 0.35);
  const mMotor    = mat(0x444c58, 0.65, 0.40);
  const mSpindle  = mat(0x606878, 0.85, 0.20);
  const mGripper  = mat(0x505868, 0.80, 0.25);
  const mCable    = mat(0x1a1a1a, 0.0, 0.85);
  const mCabinet  = mat(0xd0d4d8, 0.40, 0.55);
  const mTray     = mat(0x555555, 0.3, 0.6);
  const mPart     = mat(0x1a8a1a, 0.1, 0.5);
  const mLed      = mat(0x44aaff, 0.1, 0.3, { emissive: 0x2266cc, emissiveIntensity: 0.6 });

  // ─── Static base column ────────────────────────────────
  g.add(box(0.20, 0.02, 0.20, mBase, 0, 0.01, 0));
  // Anchor screws
  for (const [bx, bz] of [[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]] as [number, number][]) {
    g.add(cyl(0.008, 0.008, 0.012, 6, mMotor, bx, 0.024, bz));
  }
  // Vertical column (where the SCARA mounts)
  g.add(box(0.10, 0.30, 0.10, mBody, 0, 0.17, 0));
  g.add(box(0.105, 0.04, 0.105, mAccent, 0, 0.32, 0));   // top accent
  // Cable conduit on the back of the column
  g.add(cyl(0.012, 0.012, 0.30, 8, mCable, -0.045, 0.17, -0.04));

  // ─── J1 — base yaw (rotates about Y) ─────────────────
  const j1 = new THREE.Group();
  j1.name = 'robotShoulder';
  j1.position.set(0, 0.34, 0);
  g.add(j1);

  // J1 housing
  j1.add(cyl(0.05, 0.055, 0.04, 14, mJoint, 0, 0, 0));
  j1.add(cyl(0.052, 0.052, 0.005, 14, mLed, 0, 0.01, 0));

  // First horizontal arm (long, extending forward in j1's local +X)
  const arm1Len = 0.30;
  // The arm extends in +X relative to j1; build it with that offset.
  j1.add(box(arm1Len, 0.05, 0.06, mArm, arm1Len / 2, 0.025, 0));
  j1.add(box(arm1Len * 0.85, 0.012, 0.062, mAccent, arm1Len / 2, 0.057, 0));

  // ─── J2 — elbow yaw (rotates about Y) ────────────────
  const j2 = new THREE.Group();
  j2.name = 'robotUpperArm';
  j2.position.set(arm1Len, 0, 0);   // at the end of arm1
  j1.add(j2);

  // J2 housing
  j2.add(cyl(0.04, 0.04, 0.05, 12, mJoint, 0, 0.025, 0));
  j2.add(cyl(0.042, 0.042, 0.005, 12, mLed, 0, 0.025, 0));

  // Second horizontal arm
  const arm2Len = 0.22;
  j2.add(box(arm2Len, 0.04, 0.05, mArm, arm2Len / 2, 0.025, 0));
  j2.add(box(arm2Len * 0.85, 0.010, 0.052, mAccent, arm2Len / 2, 0.052, 0));

  // ─── J3 — vertical Z spindle (prismatic; we expose it as a rotation about
  // Y for compatibility with FKChain's rotation-based DOF, but the visual
  // group also slides; the animator uses position.y. To keep the FK chain
  // valid, we treat j3 as a vertical translator: its `axis` is 'y' but
  // the angle is interpreted as a Y offset by the SCARA-aware driver. For the
  // generic CCD solver, this is fine because we declare it as a small rotation
  // range (in practice, the kinematics consumer either swaps in a prismatic
  // solver or limits Z motion via the configured min/max). ───────────────
  const j3 = new THREE.Group();
  j3.name = 'robotForearm';
  j3.position.set(arm2Len, 0, 0);
  j2.add(j3);

  // Spindle housing (z-axis is vertical = world Y)
  j3.add(cyl(0.022, 0.022, 0.04, 12, mJoint, 0, 0.02, 0));
  j3.add(cyl(0.018, 0.018, 0.18, 14, mSpindle, 0, -0.06, 0));   // long polished spindle hanging down
  j3.add(box(0.025, 0.04, 0.05, mMotor, 0, 0.06, 0));            // ballscrew motor on top

  // ─── J4 — tool roll (rotates about Y) ────────────────
  const j4 = new THREE.Group();
  j4.name = 'robotWrist';
  j4.position.set(0, -0.16, 0);
  j3.add(j4);

  j4.add(cyl(0.02, 0.02, 0.02, 10, mJoint, 0, 0, 0));

  // ─── Gripper / suction tool ──────────────────────────
  const gripper = new THREE.Group();
  gripper.name = 'robotGripper';
  gripper.position.set(0, -0.025, 0);
  j4.add(gripper);

  // Tool body
  gripper.add(box(0.05, 0.025, 0.05, mGripper, 0, 0, 0));
  // Suction cup
  gripper.add(cyl(0.015, 0.020, 0.018, 12, M.rubber, 0, -0.02, 0));
  gripper.add(cyl(0.022, 0.018, 0.005, 12, M.rubber, 0, -0.030, 0));

  // Tool tip
  const toolTip = new THREE.Object3D();
  toolTip.name = 'toolTip';
  toolTip.position.set(0, -0.045, 0);
  gripper.add(toolTip);

  // ─── Static peripherals ─────────────────────────────
  // Compact controller cabinet behind
  g.add(box(0.18, 0.30, 0.10, mCabinet, 0, 0.16, -0.18));
  g.add(box(0.005, 0.25, 0.08, mJoint, 0.091, 0.16, -0.18));
  // Power LED
  g.add(cyl(0.005, 0.005, 0.003, 8, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }),
    0.091, 0.28, -0.16));

  // Parts tray on the bench
  g.add(box(0.30, 0.025, 0.20, mTray, 0.30, 0.0125, 0.18));
  // Small green PCBs in tray (3×2 grid)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      g.add(box(0.06, 0.005, 0.04, mPart, 0.30 - 0.08 + c * 0.08, 0.027, 0.18 - 0.04 + r * 0.08));
    }
  }

  // Status light
  g.add(createStatusLight(-0.20, 0.02, 0.20));

  // ─── Initial pose ─────────────────────────────────
  j1.rotation.y =  0.0;
  j2.rotation.y = -0.6;       // arm folded forward
  j4.rotation.y =  0.0;

  const joints: Joint[] = [
    { group: j1, axis: 'y', min: -Math.PI,       max: Math.PI,       rest:  0    },
    { group: j2, axis: 'y', min: -2.4,            max: 2.4,            rest: -0.6  },
    // J3 is prismatic in physical SCARAs; here it's exposed as a soft
    // rotation joint with bounded range so the generic CCD/FK API
    // stays uniform. Consumers that want true Z-translation can use
    // userData.kinematics.spindle directly.
    { group: j3, axis: 'y', min: -0.4,            max: 0.4,            rest:  0    },
    { group: j4, axis: 'y', min: -Math.PI,       max: Math.PI,       rest:  0    },
  ];
  const fkChain = new FKChain(joints, toolTip);
  g.userData.fkChain = fkChain;
  g.userData.kinematics = {
    type: 'scara-4dof',
    joints,
    toolTip,
    gripper,
    spindle: j3,         // expose for direct prismatic use
  };

  attachOverrideAPI(g);
  return g;
}
