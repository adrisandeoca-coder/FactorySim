import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { mat } from '../../shared/materials';
import { FKChain, type Joint } from '../../shared/Kinematics';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * Collaborative Robot (Cobot) — 6-DOF rigged hierarchy.
 *
 * Joints are nested parent->child so rotating any joint correctly moves every
 * downstream link, like in Visual Components / Unity. The chain is exposed via
 * `group.userData.fkChain` (FKChain) for IK or scripted control. Joint names
 * match the conventions expected by RobotArmAnimationManager (`robotShoulder`,
 * `robotUpperArm`, `robotForearm`, `robotWrist`, `robotGripper`) so the existing
 * animation manager picks the rig up automatically.
 *
 * Visual style: Universal Robots-inspired, blue/white, soft-touch 2-finger gripper.
 */
export function buildCobot(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mWhite    = mat(0xeaeef2, 0.35, 0.45);
  const mBlue     = mat(0x2870c8, 0.30, 0.48);
  const mLightBlue = mat(0x5a9ae8, 0.25, 0.50);
  const mJoint    = mat(0x1e2228, 0.65, 0.40);
  const mBase     = mat(0x3a3e48, 0.70, 0.40);
  const mGripper  = mat(0x4a5060, 0.60, 0.35);
  const mSoft     = mat(0x555555, 0.0, 0.90);
  const mTablet   = mat(0x222222, 0.50, 0.50);
  const mScreen   = mat(0x0a2030, 0.0, 0.9, { emissive: 0x004488, emissiveIntensity: 1.0 });
  const mArmMount = mat(0x666666, 0.5, 0.4);
  const mLed      = mat(0x44aaff, 0.1, 0.3, { emissive: 0x2266cc, emissiveIntensity: 0.6 });

  // ─────────────────────────────────────────────────────────
  // STATIC BASE (does not move)
  // ─────────────────────────────────────────────────────────
  g.add(cyl(0.10, 0.11, 0.02, 24, mBase, 0, 0.01, 0));
  g.add(cyl(0.11, 0.115, 0.008, 24, mBlue, 0, 0.025, 0));
  g.add(cyl(0.09, 0.10, 0.06, 24, mWhite, 0, 0.06, 0));
  g.add(cyl(0.085, 0.085, 0.015, 24, mJoint, 0, 0.098, 0));
  g.add(cyl(0.088, 0.088, 0.008, 24, mBlue, 0, 0.085, 0));
  g.add(cyl(0.012, 0.012, 0.02, 8, mJoint, -0.09, 0.05, 0, 0, 0, Math.PI / 2));
  for (let a = 0; a < 4; a++) {
    const angle = (a / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(cyl(0.010, 0.010, 0.025, 6, mBase, Math.cos(angle) * 0.08, 0.012, Math.sin(angle) * 0.08));
  }
  // Floor footprint
  g.add(cyl(0.12, 0.12, 0.002, 24, mat(0x2870c8, 0.1, 0.8, { transparent: true, opacity: 0.3 }), 0, 0.001, 0));
  // Cable connector panel
  g.add(box(0.04, 0.03, 0.01, mJoint, 0, 0.06, -0.095));
  g.add(box(0.012, 0.010, 0.005, mBase, -0.01, 0.065, -0.10));
  g.add(box(0.010, 0.006, 0.005, mBase, 0.01, 0.065, -0.10));
  g.add(cyl(0.008, 0.008, 0.008, 8, mJoint, 0, 0.05, -0.10));
  // Nameplate
  g.add(box(0.04, 0.015, 0.003, mat(0xffffff, 0.1, 0.6), 0.08, 0.06, 0.095));

  // ─────────────────────────────────────────────────────────
  // J1 — base yaw (rotates about Y)
  // ─────────────────────────────────────────────────────────
  const j1 = new THREE.Group();
  j1.name = 'robotShoulder';
  j1.position.set(0, 0.105, 0);
  g.add(j1);

  // J1 housing + LED ring (children of j1, so they yaw with it)
  j1.add(cyl(0.055, 0.055, 0.08, 16, mBlue, 0, 0.04, 0));
  j1.add(sph(0.055, mBlue, 0, 0.08, 0));
  j1.add(cyl(0.058, 0.058, 0.008, 16, mLightBlue, 0, 0.04, 0));
  j1.add(cyl(0.057, 0.057, 0.004, 16, mLed, 0, 0.06, 0));

  // ─────────────────────────────────────────────────────────
  // J2 — shoulder pitch (rotates about Z, lifts upper arm)
  // ─────────────────────────────────────────────────────────
  const j2 = new THREE.Group();
  j2.name = 'robotUpperArm';
  j2.position.set(0, 0.09, 0);  // top of J1 housing
  j1.add(j2);

  // J2 pivot housing (sits AT j2 origin)
  j2.add(cyl(0.05, 0.05, 0.07, 16, mBlue, 0, 0, 0, Math.PI / 2, 0, 0));
  j2.add(sph(0.05, mBlue, 0, 0, -0.035));
  j2.add(sph(0.05, mBlue, 0, 0, 0.035));
  j2.add(cyl(0.052, 0.052, 0.004, 16, mLed, 0, 0, 0, Math.PI / 2, 0, 0));

  // Link 2 (upper arm tube) — child of j2, extends upward in j2's local frame
  const link2Len = 0.24;
  j2.add(cyl(0.035, 0.035, link2Len, 14, mWhite, 0, link2Len / 2, 0));
  j2.add(box(0.003, link2Len * 0.8, 0.037, mBlue, 0, link2Len / 2, 0));
  // Also keep the original "link 1" stub between j1 and j2 — it belongs to j2 visually
  // because the j2 housing sits at its top. Add a short segment beneath j2's pivot.

  // ─────────────────────────────────────────────────────────
  // J3 — elbow pitch (rotates about Z)
  // ─────────────────────────────────────────────────────────
  const j3 = new THREE.Group();
  j3.name = 'robotForearm';
  j3.position.set(0, link2Len, 0);
  j2.add(j3);

  j3.add(cyl(0.045, 0.045, 0.065, 16, mBlue, 0, 0, 0, Math.PI / 2, 0, 0));
  j3.add(sph(0.045, mBlue, 0, 0, -0.033));
  j3.add(sph(0.045, mBlue, 0, 0, 0.033));
  j3.add(cyl(0.047, 0.047, 0.004, 16, mLed, 0, 0, 0, Math.PI / 2, 0, 0));

  // Link 3 (forearm)
  const link3Len = 0.18;
  j3.add(cyl(0.032, 0.032, link3Len, 14, mWhite, 0, link3Len / 2, 0));
  j3.add(box(0.003, link3Len * 0.75, 0.034, mBlue, 0, link3Len / 2, 0));

  // ─────────────────────────────────────────────────────────
  // J4 — wrist roll (rotates about Y)
  // ─────────────────────────────────────────────────────────
  const j4 = new THREE.Group();
  j4.name = 'robotWrist';
  j4.position.set(0, link3Len, 0);
  j3.add(j4);

  j4.add(cyl(0.035, 0.035, 0.05, 14, mBlue, 0, 0.025, 0));
  j4.add(sph(0.035, mBlue, 0, 0.05, 0));
  j4.add(cyl(0.037, 0.037, 0.004, 14, mLed, 0, 0.025, 0));

  // Link 4 (short wrist link)
  const link4Len = 0.06;
  j4.add(cyl(0.028, 0.028, link4Len, 12, mWhite, 0, 0.05 + link4Len / 2, 0));

  // ─────────────────────────────────────────────────────────
  // J5 — wrist pitch (rotates about Z)
  // ─────────────────────────────────────────────────────────
  const j5 = new THREE.Group();
  j5.name = 'robotWristPitch';
  j5.position.set(0, 0.05 + link4Len, 0);
  j4.add(j5);

  j5.add(cyl(0.032, 0.032, 0.045, 14, mBlue, 0, 0, 0, Math.PI / 2, 0, 0));
  j5.add(sph(0.032, mBlue, 0, 0, -0.023));
  j5.add(sph(0.032, mBlue, 0, 0, 0.023));

  // ─────────────────────────────────────────────────────────
  // J6 — tool flange roll (rotates about Y)
  // ─────────────────────────────────────────────────────────
  const j6 = new THREE.Group();
  j6.name = 'toolFlange';
  j6.position.set(0, 0.03, 0);
  j5.add(j6);

  j6.add(cyl(0.028, 0.028, 0.04, 14, mBlue, 0, 0.02, 0));
  j6.add(cyl(0.032, 0.032, 0.008, 16, mJoint, 0, 0.044, 0));
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    j6.add(cyl(0.003, 0.003, 0.005, 6, mBase, Math.cos(angle) * 0.022, 0.048, Math.sin(angle) * 0.022));
  }

  // ─────────────────────────────────────────────────────────
  // GRIPPER — child of J6 so it follows the tool roll
  // ─────────────────────────────────────────────────────────
  const gripper = new THREE.Group();
  gripper.name = 'robotGripper';
  gripper.position.set(0, 0.05, 0);
  j6.add(gripper);

  gripper.add(cyl(0.025, 0.025, 0.025, 12, mGripper, 0, 0.012, 0));
  gripper.add(box(0.06, 0.01, 0.02, mGripper, 0, 0.03, 0));
  // Left finger (parented to a sub-group so it can be slid by the animator)
  const fingerL = new THREE.Group();
  fingerL.name = 'gripperFingerL';
  fingerL.position.set(-0.02, 0, 0);
  gripper.add(fingerL);
  fingerL.add(box(0.008, 0.04, 0.015, mGripper, 0, 0.05, 0));
  fingerL.add(sph(0.008, mSoft, 0, 0.073, 0));
  fingerL.add(box(0.004, 0.025, 0.014, mSoft, 0.004, 0.055, 0));
  // Right finger
  const fingerR = new THREE.Group();
  fingerR.name = 'gripperFingerR';
  fingerR.position.set(0.02, 0, 0);
  gripper.add(fingerR);
  fingerR.add(box(0.008, 0.04, 0.015, mGripper, 0, 0.05, 0));
  fingerR.add(sph(0.008, mSoft, 0, 0.073, 0));
  fingerR.add(box(0.004, 0.025, 0.014, mSoft, -0.004, 0.055, 0));

  // Tool tip — leaf used as end-effector for IK
  const toolTip = new THREE.Object3D();
  toolTip.name = 'toolTip';
  toolTip.position.set(0, 0.085, 0);
  gripper.add(toolTip);

  // ─────────────────────────────────────────────────────────
  // STATIC TABLET / HMI ON FLEXIBLE ARM (does not move with the robot)
  // ─────────────────────────────────────────────────────────
  const tabX = 0.25, tabZ = 0.15;
  g.add(cyl(0.015, 0.018, 0.25, 8, mArmMount, tabX - 0.10, 0.125, tabZ));
  g.add(box(0.04, 0.01, 0.04, mBase, tabX - 0.10, 0.005, tabZ));
  g.add(cyl(0.012, 0.012, 0.12, 8, mArmMount, tabX - 0.10, 0.31, tabZ));
  g.add(sph(0.016, mJoint, tabX - 0.10, 0.37, tabZ));
  g.add(cyl(0.010, 0.010, 0.10, 8, mArmMount, tabX - 0.05, 0.40, tabZ, 0, 0, 0.5));
  g.add(sph(0.014, mJoint, tabX - 0.01, 0.42, tabZ));

  const tabletGeo = new THREE.BoxGeometry(0.14, 0.09, 0.012);
  const tabletMesh = new THREE.Mesh(tabletGeo, mTablet);
  tabletMesh.position.set(tabX + 0.04, 0.42, tabZ);
  g.add(tabletMesh);
  const tabletEdges = new THREE.EdgesGeometry(tabletGeo);
  const tabletLines = new THREE.LineSegments(tabletEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  tabletLines.position.copy(tabletMesh.position);
  g.add(tabletLines);
  g.add(box(0.12, 0.075, 0.003, mScreen, tabX + 0.04, 0.42, tabZ + 0.007));
  g.add(box(0.13, 0.082, 0.002, mJoint, tabX + 0.04, 0.42, tabZ + 0.006));
  g.add(cyl(0.006, 0.006, 0.003, 8, mJoint, tabX + 0.04, 0.37, tabZ + 0.007));
  g.add(box(0.003, 0.015, 0.005, mJoint, tabX + 0.112, 0.44, tabZ));
  g.add(cyl(0.003, 0.003, 0.003, 6, mJoint, tabX + 0.04, 0.465, tabZ + 0.007));

  // Status light
  g.add(createStatusLight(tabX - 0.10, 0.25, tabZ));

  // ─────────────────────────────────────────────────────────
  // Apply joint rest poses & expose FK chain
  // ─────────────────────────────────────────────────────────
  // Slight initial pose so the cobot doesn't look fully extended at spawn.
  j2.rotation.z = -0.30;
  j3.rotation.z = 0.60;
  j5.rotation.z = -0.20;

  const joints: Joint[] = [
    { group: j1, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0      },
    { group: j2, axis: 'z', min: -Math.PI / 2,    max: Math.PI / 2,    rest: -0.30  },
    { group: j3, axis: 'z', min: -Math.PI * 0.9,  max: Math.PI * 0.9,  rest: 0.60   },
    { group: j4, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0      },
    { group: j5, axis: 'z', min: -Math.PI / 2,    max: Math.PI / 2,    rest: -0.20  },
    { group: j6, axis: 'y', min: -Math.PI,        max: Math.PI,        rest: 0      },
  ];
  const fkChain = new FKChain(joints, toolTip);
  g.userData.fkChain = fkChain;
  g.userData.kinematics = {
    joints,
    toolTip,
    fingerL,
    fingerR,
    type: 'cobot-6dof',
  };

  attachOverrideAPI(g);
  return g;
}
