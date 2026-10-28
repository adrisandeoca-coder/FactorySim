import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { mat } from '../../shared/materials';
import { FKChain, type Joint } from '../../shared/Kinematics';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * Industrial Robot — KUKA / ABB-style 6-axis arm. Bright orange, boxy castings,
 * heavier base, no soft-touch gripper (uses a flange + servo gripper).
 *
 * Same rig conventions as Cobot:
 *   - Hierarchy: shoulder → upperArm → forearm → wrist → wristPitch → toolFlange → gripper → toolTip
 *   - Joint group names match RobotArmAnimationManager (`robotShoulder`, ...)
 *   - FK chain exposed as group.userData.fkChain; full kinematics in group.userData.kinematics.
 *
 * Footprint: ~0.9 m diameter base, reach ~0.85 m (downscaled for the renderer).
 */
export function buildIndustrialRobot(): THREE.Group {
  const g = new THREE.Group();

  // KUKA-inspired palette
  const orange  = mat(0xe6711a, 0.30, 0.55);
  const orangeD = mat(0xb84d10, 0.35, 0.50);
  const black   = mat(0x18181a, 0.65, 0.45);
  const grey    = mat(0x4d5158, 0.55, 0.55);
  const gripperMat = mat(0x6a6f78, 0.70, 0.40);
  const led     = mat(0xff8833, 0.1, 0.3, { emissive: 0xff5500, emissiveIntensity: 0.7 });

  // ─── Static base / pedestal ──────────────────────────────
  g.add(cyl(0.18, 0.20, 0.04, 24, black, 0, 0.02, 0));
  g.add(cyl(0.16, 0.16, 0.10, 24, orange, 0, 0.09, 0));
  g.add(cyl(0.14, 0.14, 0.02, 24, orangeD, 0, 0.15, 0));
  // Mounting bolts
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    g.add(cyl(0.014, 0.014, 0.02, 6, black, Math.cos(ang) * 0.165, 0.025, Math.sin(ang) * 0.165));
  }
  // Cable interface plate (rear)
  g.add(box(0.10, 0.06, 0.02, black, 0, 0.08, -0.155));

  // ─── J1 — base yaw (Y) ───────────────────────────────────
  const j1 = new THREE.Group();
  j1.name = 'robotShoulder';
  j1.position.set(0, 0.16, 0);
  g.add(j1);
  // Shoulder housing (carries the upper arm pivot offset to one side, like KUKA)
  j1.add(box(0.18, 0.16, 0.20, orange, 0, 0.08, 0));
  j1.add(box(0.20, 0.04, 0.22, orangeD, 0, 0.16, 0));   // top cap
  j1.add(cyl(0.02, 0.02, 0.04, 12, led, 0, 0.16, 0.10)); // J1 LED
  // Side bulges
  j1.add(cyl(0.06, 0.06, 0.04, 12, grey, -0.10, 0.08, 0, 0, 0, Math.PI / 2));
  j1.add(cyl(0.06, 0.06, 0.04, 12, grey, 0.10, 0.08, 0, 0, 0, Math.PI / 2));

  // ─── J2 — shoulder pitch (Z) ─────────────────────────────
  const j2 = new THREE.Group();
  j2.name = 'robotUpperArm';
  j2.position.set(0, 0.18, 0);
  j1.add(j2);
  // Pivot housing
  j2.add(cyl(0.06, 0.06, 0.16, 14, grey, 0, 0, 0, Math.PI / 2, 0, 0));
  j2.add(sph(0.06, grey, 0, 0, -0.08));
  j2.add(sph(0.06, grey, 0, 0, 0.08));
  // Upper arm casting (boxier than cobot)
  const link2Len = 0.30;
  j2.add(box(0.10, link2Len, 0.10, orange, 0, link2Len / 2, 0));
  j2.add(box(0.06, link2Len * 0.9, 0.105, orangeD, 0, link2Len / 2, 0));
  // Side cable conduit
  j2.add(cyl(0.012, 0.012, link2Len * 0.85, 8, black, 0.058, link2Len / 2, 0));

  // ─── J3 — elbow pitch (Z) ────────────────────────────────
  const j3 = new THREE.Group();
  j3.name = 'robotForearm';
  j3.position.set(0, link2Len, 0);
  j2.add(j3);
  j3.add(cyl(0.055, 0.055, 0.14, 14, grey, 0, 0, 0, Math.PI / 2, 0, 0));
  j3.add(sph(0.055, grey, 0, 0, -0.07));
  j3.add(sph(0.055, grey, 0, 0, 0.07));
  // Forearm
  const link3Len = 0.22;
  j3.add(box(0.075, link3Len, 0.075, orange, 0, link3Len / 2, 0));
  j3.add(box(0.04, link3Len * 0.85, 0.078, orangeD, 0, link3Len / 2, 0));

  // ─── J4 — wrist roll (Y) ─────────────────────────────────
  const j4 = new THREE.Group();
  j4.name = 'robotWrist';
  j4.position.set(0, link3Len, 0);
  j3.add(j4);
  j4.add(cyl(0.045, 0.045, 0.07, 14, orange, 0, 0.035, 0));
  j4.add(cyl(0.05, 0.05, 0.012, 14, orangeD, 0, 0.07, 0));

  // Short wrist link
  const link4Len = 0.07;
  j4.add(cyl(0.038, 0.038, link4Len, 12, orange, 0, 0.07 + link4Len / 2, 0));

  // ─── J5 — wrist pitch (Z) ────────────────────────────────
  const j5 = new THREE.Group();
  j5.name = 'robotWristPitch';
  j5.position.set(0, 0.07 + link4Len, 0);
  j4.add(j5);
  j5.add(cyl(0.04, 0.04, 0.06, 12, grey, 0, 0, 0, Math.PI / 2, 0, 0));
  j5.add(sph(0.04, grey, 0, 0, -0.03));
  j5.add(sph(0.04, grey, 0, 0, 0.03));

  // ─── J6 — tool flange roll (Y) ───────────────────────────
  const j6 = new THREE.Group();
  j6.name = 'toolFlange';
  j6.position.set(0, 0.04, 0);
  j5.add(j6);
  j6.add(cyl(0.035, 0.035, 0.04, 14, orange, 0, 0.02, 0));
  // Flange face with bolt circle
  j6.add(cyl(0.04, 0.04, 0.008, 16, black, 0, 0.044, 0));
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    j6.add(cyl(0.003, 0.003, 0.005, 6, grey, Math.cos(ang) * 0.028, 0.048, Math.sin(ang) * 0.028));
  }

  // ─── Servo gripper ───────────────────────────────────────
  const gripper = new THREE.Group();
  gripper.name = 'robotGripper';
  gripper.position.set(0, 0.05, 0);
  j6.add(gripper);
  gripper.add(box(0.07, 0.04, 0.05, gripperMat, 0, 0.02, 0));
  gripper.add(cyl(0.03, 0.03, 0.012, 14, black, 0, 0.005, 0));
  // Servo fingers (parallel, slide along X)
  const fingerL = new THREE.Group();
  fingerL.name = 'gripperFingerL';
  fingerL.position.set(-0.025, 0, 0);
  gripper.add(fingerL);
  fingerL.add(box(0.012, 0.06, 0.04, gripperMat, 0, 0.07, 0));
  fingerL.add(box(0.014, 0.012, 0.038, black, 0.005, 0.10, 0));
  const fingerR = new THREE.Group();
  fingerR.name = 'gripperFingerR';
  fingerR.position.set(0.025, 0, 0);
  gripper.add(fingerR);
  fingerR.add(box(0.012, 0.06, 0.04, gripperMat, 0, 0.07, 0));
  fingerR.add(box(0.014, 0.012, 0.038, black, -0.005, 0.10, 0));

  const toolTip = new THREE.Object3D();
  toolTip.name = 'toolTip';
  toolTip.position.set(0, 0.115, 0);
  gripper.add(toolTip);

  // ─── Status light ────────────────────────────────────────
  g.add(createStatusLight(0.32, 0, 0.32));

  // ─── Initial pose: typical "ready" stance ────────────────
  j2.rotation.z = -0.40;
  j3.rotation.z = 0.85;
  j5.rotation.z = -0.45;

  // ─── Expose FK chain & rig metadata ──────────────────────
  const joints: Joint[] = [
    { group: j1, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0     },
    { group: j2, axis: 'z', min: -2.0,             max: 2.0,             rest: -0.40 },
    { group: j3, axis: 'z', min: -2.4,             max: 2.4,             rest:  0.85 },
    { group: j4, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0     },
    { group: j5, axis: 'z', min: -2.0,             max: 2.0,             rest: -0.45 },
    { group: j6, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0     },
  ];
  const fkChain = new FKChain(joints, toolTip);
  g.userData.fkChain = fkChain;
  g.userData.kinematics = {
    type: 'industrial-6dof',
    joints,
    toolTip,
    gripper,
    fingerL,
    fingerR,
  };

  attachOverrideAPI(g);
  return g;
}
