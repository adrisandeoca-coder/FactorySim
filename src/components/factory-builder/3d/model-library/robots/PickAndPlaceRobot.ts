import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';
import { FKChain, type Joint } from '../../shared/Kinematics';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * 6-Axis Industrial Pick-and-Place Robot — fully rigged.
 *
 * Hierarchy:
 *   base (static) → j1 yaw → j2 shoulder → j3 elbow → j4 wrist roll
 *                 → j5 wrist pitch → j6 tool flange roll → gripper → toolTip
 *
 * Joint group names match RobotArmAnimationManager conventions
 * (`robotShoulder`, `robotUpperArm`, `robotForearm`, `robotWrist`, `toolFlange`)
 * so existing motion programs drive it. The chain is exposed via
 * `userData.fkChain` for IK / RobotTargetDriver use.
 *
 * Visual style preserved from the original flat model: bright orange body,
 * heavy steel base, parallel gripper, controller cabinet, teach pendant,
 * partial safety fence, status light.
 */
export function buildPickAndPlaceRobot(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBase     = mat(0x3a3e48, 0.75, 0.4);
  const mBody     = mat(0xf97316, 0.35, 0.45);
  const mArm      = mat(0xf08020, 0.30, 0.50);
  const mJoint    = mat(0x2a2e35, 0.70, 0.35);
  const mMotor    = mat(0x444c58, 0.65, 0.40);
  const mGripper  = mat(0x505868, 0.80, 0.25);
  const mCable    = mat(0x1a1a1a, 0.0, 0.85);
  const mCabinet  = mat(0xd0d4d8, 0.40, 0.55);
  const mFence    = mat(0xcccc00, 0.20, 0.60);
  const mMesh     = mat(0x888888, 0.3, 0.5, { transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const mBolt     = mat(0x666666, 0.80, 0.30);
  const mPendant  = mat(0x222222, 0.10, 0.80);
  const mLed      = mat(0xff8833, 0.1, 0.3, { emissive: 0xff5500, emissiveIntensity: 0.6 });

  // ─── Static base ─────────────────────────────────────
  g.add(box(0.5, 0.04, 0.5, mBase, 0, 0.02, 0));
  // Anchor bolts
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(cyl(0.012, 0.012, 0.025, 6, mBolt,
      Math.cos(ang) * 0.20, 0.045, Math.sin(ang) * 0.20));
    g.add(cyl(0.018, 0.018, 0.008, 6, mBolt,
      Math.cos(ang) * 0.20, 0.062, Math.sin(ang) * 0.20));
  }
  // Pedestal
  g.add(cyl(0.16, 0.18, 0.12, 18, mBase, 0, 0.10, 0));
  g.add(cyl(0.20, 0.20, 0.018, 24, mJoint, 0, 0.05, 0));
  // Cable conduit emerging from base rear
  g.add(box(0.08, 0.05, 0.025, mCable, 0, 0.13, -0.18));

  // ─── J1 — base yaw (Y) ─────────────────────────────
  const j1 = new THREE.Group();
  j1.name = 'robotShoulder';
  j1.position.set(0, 0.16, 0);
  g.add(j1);

  // Turret
  j1.add(cyl(0.14, 0.16, 0.14, 18, mBody, 0, 0.07, 0));
  j1.add(cyl(0.13, 0.13, 0.025, 18, mJoint, 0, 0.15, 0));
  j1.add(cyl(0.05, 0.05, 0.10, 12, mMotor, -0.13, 0.07, 0, 0, 0, Math.PI / 2));
  j1.add(cyl(0.135, 0.135, 0.005, 18, mLed, 0, 0.155, 0));

  // ─── J2 — shoulder pitch (Z) ────────────────────────
  const j2 = new THREE.Group();
  j2.name = 'robotUpperArm';
  j2.position.set(0, 0.16, 0);
  j1.add(j2);

  // Pivot housing at j2 origin
  j2.add(cyl(0.075, 0.075, 0.13, 14, mJoint, 0, 0, 0, Math.PI / 2, 0, 0));
  j2.add(sph(0.075, mJoint, 0, 0, -0.065));
  j2.add(sph(0.075, mJoint, 0, 0, 0.065));
  j2.add(cyl(0.04, 0.04, 0.05, 10, mMotor, 0, 0, 0.10));

  // Lower arm — child of j2, extends UP locally
  const lowerArmLen = 0.40;
  j2.add(box(0.08, lowerArmLen, 0.10, mArm, 0, lowerArmLen / 2, 0));
  j2.add(box(0.04, lowerArmLen * 0.85, 0.105, mBody, 0, lowerArmLen / 2, 0));
  // Cable along lower arm
  j2.add(cyl(0.015, 0.015, lowerArmLen * 0.85, 8, mCable, -0.055, lowerArmLen / 2, 0));

  // ─── J3 — elbow pitch (Z) ───────────────────────────
  const j3 = new THREE.Group();
  j3.name = 'robotForearm';
  j3.position.set(0, lowerArmLen, 0);
  j2.add(j3);

  j3.add(cyl(0.06, 0.06, 0.10, 12, mJoint, 0, 0, 0, Math.PI / 2, 0, 0));
  j3.add(sph(0.06, mJoint, 0, 0, -0.05));
  j3.add(sph(0.06, mJoint, 0, 0, 0.05));
  j3.add(cyl(0.035, 0.035, 0.04, 10, mMotor, 0, 0, 0.08));

  // Forearm
  const upperArmLen = 0.30;
  j3.add(box(0.07, upperArmLen, 0.07, mArm, 0, upperArmLen / 2, 0));
  j3.add(box(0.035, upperArmLen * 0.8, 0.075, mBody, 0, upperArmLen / 2, 0));

  // ─── J4 — wrist roll (Y) ────────────────────────────
  const j4 = new THREE.Group();
  j4.name = 'robotWrist';
  j4.position.set(0, upperArmLen, 0);
  j3.add(j4);

  j4.add(cyl(0.05, 0.05, 0.06, 12, mBody, 0, 0.03, 0));
  j4.add(cyl(0.052, 0.052, 0.005, 12, mLed, 0, 0.025, 0));

  const link4Len = 0.06;
  j4.add(cyl(0.04, 0.04, link4Len, 12, mArm, 0, 0.06 + link4Len / 2, 0));

  // ─── J5 — wrist pitch (Z) ───────────────────────────
  const j5 = new THREE.Group();
  j5.name = 'robotWristPitch';
  j5.position.set(0, 0.06 + link4Len, 0);
  j4.add(j5);

  j5.add(cyl(0.038, 0.038, 0.05, 12, mJoint, 0, 0, 0, Math.PI / 2, 0, 0));
  j5.add(sph(0.038, mJoint, 0, 0, -0.025));
  j5.add(sph(0.038, mJoint, 0, 0, 0.025));

  // ─── J6 — tool flange roll (Y) ──────────────────────
  const j6 = new THREE.Group();
  j6.name = 'toolFlange';
  j6.position.set(0, 0.04, 0);
  j5.add(j6);

  j6.add(cyl(0.032, 0.032, 0.04, 12, mBody, 0, 0.02, 0));
  j6.add(cyl(0.038, 0.038, 0.008, 14, mJoint, 0, 0.044, 0));
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    j6.add(cyl(0.0035, 0.0035, 0.005, 6, mBase,
      Math.cos(ang) * 0.026, 0.048, Math.sin(ang) * 0.026));
  }

  // ─── Parallel gripper ───────────────────────────────
  const gripper = new THREE.Group();
  gripper.name = 'robotGripper';
  gripper.position.set(0, 0.05, 0);
  j6.add(gripper);

  // Gripper body
  gripper.add(box(0.08, 0.04, 0.05, mGripper, 0, 0.02, 0));
  gripper.add(cyl(0.025, 0.025, 0.012, 12, mJoint, 0, 0.005, 0));
  // Parallel rails
  gripper.add(box(0.10, 0.012, 0.022, mGripper, 0, 0.045, 0));
  // Left finger (sliding sub-group)
  const fingerL = new THREE.Group();
  fingerL.name = 'gripperFingerL';
  fingerL.position.set(-0.03, 0, 0);
  gripper.add(fingerL);
  fingerL.add(box(0.012, 0.06, 0.04, mGripper, 0, 0.07, 0));
  fingerL.add(box(0.014, 0.012, 0.038, M.rubber, 0.005, 0.10, 0));
  // Right finger
  const fingerR = new THREE.Group();
  fingerR.name = 'gripperFingerR';
  fingerR.position.set(0.03, 0, 0);
  gripper.add(fingerR);
  fingerR.add(box(0.012, 0.06, 0.04, mGripper, 0, 0.07, 0));
  fingerR.add(box(0.014, 0.012, 0.038, M.rubber, -0.005, 0.10, 0));

  // Tool tip (between fingers)
  const toolTip = new THREE.Object3D();
  toolTip.name = 'toolTip';
  toolTip.position.set(0, 0.115, 0);
  gripper.add(toolTip);

  // ─── Static peripherals ─────────────────────────────
  // Controller cabinet
  g.add(box(0.30, 0.75, 0.30, mCabinet, -0.55, 0.375, 0));
  g.add(box(0.005, 0.65, 0.25, mJoint, -0.401, 0.375, 0));
  g.add(sph(0.012, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }),
    -0.401, 0.65, 0.10));
  g.add(sph(0.012, mat(0x0088ff, 0.1, 0.3, { emissive: 0x0088ff, emissiveIntensity: 0.8 }),
    -0.401, 0.65, 0.06));

  // Teach pendant on cabinet side
  g.add(box(0.10, 0.14, 0.02, mPendant, -0.60, 0.50, 0.18));
  g.add(box(0.085, 0.06, 0.005, mat(0x004488, 0.1, 0.4, { emissive: 0x002244, emissiveIntensity: 0.4 }),
    -0.60, 0.55, 0.19));

  // Partial safety fence (one panel for context)
  g.add(box(0.04, 0.85, 0.04, mFence, 0.55, 0.425, -0.55));
  g.add(box(0.04, 0.85, 0.04, mFence, 0.55, 0.425, 0.55));
  g.add(box(0.04, 0.04, 1.10, mFence, 0.55, 0.83, 0));
  g.add(box(0.005, 0.80, 1.05, mMesh, 0.55, 0.42, 0));

  // Status light
  g.add(createStatusLight(0.30, 0.02, 0.30));

  // ─── Initial pose ─────────────────────────────────
  j2.rotation.z = -0.35;
  j3.rotation.z =  0.70;
  j5.rotation.z = -0.30;

  const joints: Joint[] = [
    { group: j1, axis: 'y', min: -Math.PI,        max: Math.PI,        rest:  0     },
    { group: j2, axis: 'z', min: -1.8,             max: 1.8,             rest: -0.35  },
    { group: j3, axis: 'z', min: -2.4,             max: 2.4,             rest:  0.70  },
    { group: j4, axis: 'y', min: -Math.PI,        max: Math.PI,        rest:  0     },
    { group: j5, axis: 'z', min: -1.8,             max: 1.8,             rest: -0.30  },
    { group: j6, axis: 'y', min: -Math.PI,        max: Math.PI,        rest:  0     },
  ];
  const fkChain = new FKChain(joints, toolTip);
  g.userData.fkChain = fkChain;
  g.userData.kinematics = {
    type: 'pick-and-place-6dof',
    joints,
    toolTip,
    gripper,
    fingerL,
    fingerR,
  };

  attachOverrideAPI(g);
  return g;
}
