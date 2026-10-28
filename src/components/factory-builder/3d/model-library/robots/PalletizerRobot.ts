import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';
import { FKChain, type Joint } from '../../shared/Kinematics';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * Large Palletizing Robot (4-DOF rigged) with vacuum gripper head.
 *
 * Joint chain: turret (yaw) → shoulder (pitch) → elbow (pitch) → wrist (counter-pitch
 * keeps the gripper plate level). Joint group names match the conventions used by
 * RobotArmAnimationManager so existing motion programs can drive it. The chain is
 * exposed via `group.userData.fkChain` for IK / RobotTargetDriver use.
 *
 * Visual style preserved from the original flat model: orange body, heavy steel
 * base, vacuum manifold + 12 suction cups, vacuum hose along the arm, partial
 * pallet of boxes on the floor and a small infeed conveyor for context.
 */
export function buildPalletizerRobot(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBase     = mat(0x3a3e48, 0.75, 0.4);
  const mBody     = mat(0xe85d10, 0.30, 0.48);
  const mArm      = mat(0xd85820, 0.28, 0.50);
  const mJoint    = mat(0x2a2e35, 0.70, 0.35);
  const mMotor    = mat(0x444c58, 0.65, 0.40);
  const mGripper  = mat(0x505868, 0.80, 0.25);
  const mSuction  = mat(0x333333, 0.0, 0.90);
  const mHose     = mat(0x222222, 0.0, 0.80);
  const mCabinet  = mat(0xd0d4d8, 0.40, 0.55);
  const mPalletW  = mat(0x8B5E3C, 0.0, 0.90);
  const mBox      = mat(0xC4934A, 0.0, 0.95);
  const mConveyor = mat(0x3a4050, 0.60, 0.50);
  const mRoller   = mat(0x505868, 0.70, 0.30);
  const mFloorMark = mat(0xffcc00, 0.1, 0.7);
  const mLight    = mat(0xff8833, 0.1, 0.3, { emissive: 0xff5500, emissiveIntensity: 0.6 });

  // ─────────────────────────────────────────────────────────
  // STATIC BASE (does not rotate)
  // ─────────────────────────────────────────────────────────
  g.add(box(0.60, 0.05, 0.60, mBase, 0, 0.025, 0));
  g.add(cyl(0.22, 0.25, 0.10, 20, mBase, 0, 0.10, 0));
  g.add(cyl(0.26, 0.26, 0.02, 24, mJoint, 0, 0.06, 0));
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    const bx = Math.cos(angle) * 0.24;
    const bz = Math.sin(angle) * 0.24;
    g.add(cyl(0.015, 0.015, 0.06, 6, mMotor, bx, 0.03, bz));
    g.add(cyl(0.022, 0.022, 0.01, 6, mMotor, bx, 0.065, bz));
  }
  // Static floor markings (under the swing area)
  g.add(box(0.85, 0.005, 0.85, mFloorMark, 0, 0.001, 0));
  g.add(box(0.81, 0.006, 0.81, mBase, 0, 0.0015, 0));

  // ─────────────────────────────────────────────────────────
  // J1 — TURRET (base yaw, rotates about Y)
  // ─────────────────────────────────────────────────────────
  const j1 = new THREE.Group();
  j1.name = 'robotShoulder';
  j1.position.set(0, 0.15, 0);
  g.add(j1);

  // Turret housing
  j1.add(cyl(0.20, 0.22, 0.18, 20, mBody, 0, 0.09, 0));
  j1.add(cyl(0.19, 0.19, 0.03, 20, mJoint, 0, 0.19, 0));
  j1.add(cyl(0.07, 0.07, 0.10, 12, mMotor, -0.18, 0.09, 0, 0, 0, Math.PI / 2));

  // ─────────────────────────────────────────────────────────
  // J2 — SHOULDER (pitch, rotates about Z)
  // ─────────────────────────────────────────────────────────
  const j2 = new THREE.Group();
  j2.name = 'robotUpperArm';
  j2.position.set(0, 0.20, 0);
  j1.add(j2);

  // Shoulder pivot housing (sits AT j2 origin)
  j2.add(cyl(0.12, 0.12, 0.18, 16, mJoint, 0, 0, 0, Math.PI / 2, 0, 0));
  j2.add(sph(0.12, mJoint, 0, 0, -0.09));
  j2.add(sph(0.12, mJoint, 0, 0, 0.09));
  j2.add(cyl(0.065, 0.065, 0.10, 12, mMotor, 0, 0, -0.14));
  // Shoulder LED ring
  j2.add(cyl(0.122, 0.122, 0.005, 16, mLight, 0, 0, 0, Math.PI / 2, 0, 0));

  // Lower arm — child of j2, extends UP in j2's local frame.
  const lowerArmLen = 0.60;
  j2.add(box(0.12, lowerArmLen, 0.08, mArm, 0, lowerArmLen / 2, 0));
  // I-beam side flanges
  j2.add(box(0.14, lowerArmLen * 0.9, 0.02, mBody, 0, lowerArmLen / 2, 0.04));
  j2.add(box(0.14, lowerArmLen * 0.9, 0.02, mBody, 0, lowerArmLen / 2, -0.04));
  // Reinforcement ribs
  for (let i = 0; i < 4; i++) {
    j2.add(box(0.15, 0.015, 0.10, mBody, 0, 0.10 + i * 0.15, 0));
  }
  // Vacuum hose along lower arm
  j2.add(cyl(0.025, 0.025, lowerArmLen * 0.9, 8, mHose, -0.09, lowerArmLen * 0.45, 0));

  // ─────────────────────────────────────────────────────────
  // J3 — ELBOW (pitch, rotates about Z)
  // ─────────────────────────────────────────────────────────
  const j3 = new THREE.Group();
  j3.name = 'robotForearm';
  j3.position.set(0, lowerArmLen, 0);
  j2.add(j3);

  // Elbow pivot
  j3.add(cyl(0.09, 0.09, 0.14, 14, mJoint, 0, 0, 0, Math.PI / 2, 0, 0));
  j3.add(sph(0.09, mJoint, 0, 0, -0.07));
  j3.add(sph(0.09, mJoint, 0, 0, 0.07));
  j3.add(cyl(0.05, 0.05, 0.08, 10, mMotor, 0, 0, 0.12));

  // Upper arm — child of j3
  const upperArmLen = 0.45;
  j3.add(box(0.10, upperArmLen, 0.07, mArm, 0, upperArmLen / 2, 0));
  j3.add(box(0.12, upperArmLen * 0.85, 0.02, mBody, 0, upperArmLen / 2, 0.035));
  j3.add(box(0.12, upperArmLen * 0.85, 0.02, mBody, 0, upperArmLen / 2, -0.035));
  // Vacuum hose along upper arm
  j3.add(cyl(0.025, 0.025, upperArmLen * 0.9, 8, mHose, -0.08, upperArmLen * 0.5, 0));

  // ─────────────────────────────────────────────────────────
  // J4 — WRIST COUNTER-PITCH (rotates about Z, keeps gripper level in physics; here it's free DOF)
  // ─────────────────────────────────────────────────────────
  const j4 = new THREE.Group();
  j4.name = 'robotWrist';
  j4.position.set(0, upperArmLen, 0);
  j3.add(j4);

  // Wrist housing
  j4.add(cyl(0.06, 0.06, 0.08, 12, mJoint, 0, 0.04, 0));
  j4.add(cyl(0.035, 0.035, 0.04, 8, mMotor, 0.07, 0.04, 0, 0, 0, Math.PI / 2));
  // Tool flange
  j4.add(cyl(0.07, 0.07, 0.015, 16, mBase, 0, 0.085, 0));
  // Bolt circle on flange
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    j4.add(cyl(0.004, 0.004, 0.006, 6, mMotor,
      Math.cos(angle) * 0.05, 0.092, Math.sin(angle) * 0.05));
  }

  // ─────────────────────────────────────────────────────────
  // VACUUM GRIPPER (child of j4 so it follows the wrist)
  // ─────────────────────────────────────────────────────────
  const gripper = new THREE.Group();
  gripper.name = 'robotGripper';
  gripper.position.set(0, 0.10, 0);
  j4.add(gripper);

  // Main gripper plate
  gripper.add(box(0.40, 0.025, 0.30, mGripper, 0, 0, 0));
  // Cross bracing underneath
  gripper.add(box(0.38, 0.015, 0.03, mBase, 0, -0.02, -0.10));
  gripper.add(box(0.38, 0.015, 0.03, mBase, 0, -0.02, 0.10));
  gripper.add(box(0.03, 0.015, 0.28, mBase, -0.12, -0.02, 0));
  gripper.add(box(0.03, 0.015, 0.28, mBase, 0.12, -0.02, 0));

  // Suction cups (4×3 grid, hanging down off the plate)
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const sx = -0.14 + ix * 0.093;
      const sz = -0.08 + iz * 0.08;
      gripper.add(cyl(0.022, 0.028, 0.025, 10, mSuction, sx, -0.035, sz));
      gripper.add(cyl(0.030, 0.022, 0.008, 10, mSuction, sx, -0.050, sz));
      gripper.add(cyl(0.008, 0.008, 0.015, 6, mMotor, sx, 0.02, sz));
    }
  }
  // Vacuum manifold + gauge
  gripper.add(box(0.30, 0.03, 0.04, mMotor, 0, 0.03, 0));
  gripper.add(cyl(0.015, 0.015, 0.008, 10, M.chrome, 0.12, 0.05, 0));

  // Tool tip (the working point under the suction cup grid) — used by IK + pick-and-place
  const toolTip = new THREE.Object3D();
  toolTip.name = 'toolTip';
  toolTip.position.set(0, -0.08, 0);
  gripper.add(toolTip);

  // ─────────────────────────────────────────────────────────
  // STATIC PERIPHERALS (do not move with the robot)
  // ─────────────────────────────────────────────────────────
  // Pallet on floor with partial stack of boxes
  const palletX = 0.85, palletZ = 0;
  // Pallet wood
  g.add(box(0.55, 0.04, 0.55, mPalletW, palletX, 0.02, palletZ));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.55, 0.025, 0.05, mPalletW, palletX, 0.04, palletZ - 0.20 + i * 0.20));
  }
  // 4 stacked boxes (partial pallet)
  for (let i = 0; i < 4; i++) {
    const bx = palletX - 0.13 + (i % 2) * 0.26;
    const bz = palletZ - 0.13 + Math.floor(i / 2) * 0.26;
    g.add(box(0.22, 0.20, 0.22, mBox, bx, 0.14, bz));
  }

  // Small infeed roller conveyor on the opposite side
  const convX = -0.85;
  g.add(box(0.40, 0.20, 0.50, mConveyor, convX, 0.10, 0));
  for (let i = 0; i < 6; i++) {
    g.add(cyl(0.025, 0.025, 0.36, 12, mRoller, convX, 0.21, -0.20 + i * 0.08, 0, 0, Math.PI / 2));
  }

  // Controller cabinet behind the robot
  g.add(box(0.30, 0.65, 0.30, mCabinet, 0, 0.325, -0.55));
  g.add(box(0.005, 0.55, 0.25, mJoint, 0.151, 0.325, -0.55));
  g.add(sph(0.012, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }),
    0.151, 0.55, -0.51));

  // Status light
  g.add(createStatusLight(0.42, 0.02, 0.42));

  // ─────────────────────────────────────────────────────────
  // Initial pose — arm angled forward toward the pallet
  // ─────────────────────────────────────────────────────────
  j2.rotation.z = -0.55;   // shoulder lifted forward
  j3.rotation.z =  1.10;   // elbow folded
  j4.rotation.z = -0.55;   // wrist counter-rotates (parallelogram-style level gripper)

  const joints: Joint[] = [
    { group: j1, axis: 'y', min: -Math.PI,       max: Math.PI,       rest:  0     },
    { group: j2, axis: 'z', min: -1.4,           max: 1.4,           rest: -0.55  },
    { group: j3, axis: 'z', min: -2.4,           max: 2.4,           rest:  1.10  },
    { group: j4, axis: 'z', min: -1.4,           max: 1.4,           rest: -0.55  },
  ];
  const fkChain = new FKChain(joints, toolTip);
  g.userData.fkChain = fkChain;
  g.userData.kinematics = {
    type: 'palletizer-4dof',
    joints,
    toolTip,
    gripper,
  };

  attachOverrideAPI(g);
  return g;
}
