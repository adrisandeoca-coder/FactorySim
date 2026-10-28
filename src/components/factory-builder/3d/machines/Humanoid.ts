import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';
import { FKChain, type Joint } from '../shared/Kinematics';
import { attachOverrideAPI } from '../shared/Overrides';

/**
 * Humanoid Robot — bipedal robot with a properly rigged skeleton.
 *
 * Hierarchy (Visual Components / Unity convention):
 *   figure
 *   ├─ pelvis
 *   │   ├─ hipL → thighL → kneeL → shinL → footL
 *   │   └─ hipR → thighR → kneeR → shinR → footR
 *   └─ spine → torso
 *       ├─ head (named "head" for OperatorAnimationManager head-tracking)
 *       └─ arms
 *           ├─ armLeft  → elbowLeft  → handLeft
 *           └─ armRight → elbowRight → handRight
 *
 * Group names match the conventions expected by OperatorAnimationManager
 * (`figure`, `head`, `armLeft`, `armRight`, `legL`, `legR`, `torso`) so the
 * existing animator picks the rig up automatically. Arm and leg IK chains are
 * exposed via `group.userData.kinematics`.
 */
export function buildHumanoid(): THREE.Group {
  const g = new THREE.Group();

  const bodyWhite = mat(0xe8e8e8, 0.5, 0.3);
  const bodyPanel = mat(0xcccccc, 0.6, 0.25);
  const jointDark = mat(0x333333, 0.7, 0.3);
  const ledBlue = mat(0x00aaff, 0.0, 0.3, { emissive: 0x0066ff, emissiveIntensity: 1.2 });
  const visor = mat(0x112244, 0.8, 0.1, { emissive: 0x0044aa, emissiveIntensity: 0.6 });

  // Wrap in figure group for breathing scale + ground translation.
  const figure = new THREE.Group();
  figure.name = 'figure';
  g.add(figure);

  // ─── Pelvis (root of the lower body, ground-up coordinates) ─────────
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.46, 0);   // hip joint height ≈ 0.46
  figure.add(pelvis);

  // Pelvis shell (drawn at pelvis-local origin)
  pelvis.add(box(0.22, 0.06, 0.08, bodyPanel, 0, -0.02, 0));
  // Hip joint caps
  pelvis.add(cyl(0.03, 0.03, 0.04, 8, jointDark, -0.08, -0.02, 0, 0, 0, Math.PI / 2));
  pelvis.add(cyl(0.03, 0.03, 0.04, 8, jointDark, 0.08, -0.02, 0, 0, 0, Math.PI / 2));

  // ─── LEFT LEG: hipL → thighL → kneeL → shinL → footL ────────────────
  const hipL = new THREE.Group();
  hipL.name = 'legL';                // OperatorAnimationManager looks for 'legL'
  hipL.position.set(-0.06, -0.02, 0);
  pelvis.add(hipL);
  // Upper leg (thigh)
  hipL.add(box(0.06, 0.18, 0.065, bodyWhite, 0, -0.10, 0));
  // Knee pivot (child of hip; rotating shin about this would be cleaner —
  // we expose it as a separate group so two-bone IK can drive it)
  const kneeL = new THREE.Group();
  kneeL.name = 'kneeL';
  kneeL.position.set(0, -0.20, 0);
  hipL.add(kneeL);
  kneeL.add(cyl(0.035, 0.035, 0.06, 10, jointDark, 0, 0, 0, 0, 0, Math.PI / 2));
  kneeL.add(cyl(0.037, 0.037, 0.008, 10, ledBlue, 0, 0, 0));
  // Shin
  kneeL.add(box(0.055, 0.20, 0.06, bodyWhite, 0, -0.11, 0));
  // Foot
  const footL = new THREE.Group();
  footL.name = 'footL';
  footL.position.set(0, -0.22, 0.01);
  kneeL.add(footL);
  footL.add(box(0.08, 0.03, 0.14, jointDark, 0, 0, 0));
  footL.add(box(0.08, 0.005, 0.14, M.rubber, 0, -0.012, 0));

  // ─── RIGHT LEG: mirror of left ──────────────────────────────────────
  const hipR = new THREE.Group();
  hipR.name = 'legR';
  hipR.position.set(0.06, -0.02, 0);
  pelvis.add(hipR);
  hipR.add(box(0.06, 0.18, 0.065, bodyWhite, 0, -0.10, 0));
  const kneeR = new THREE.Group();
  kneeR.name = 'kneeR';
  kneeR.position.set(0, -0.20, 0);
  hipR.add(kneeR);
  kneeR.add(cyl(0.035, 0.035, 0.06, 10, jointDark, 0, 0, 0, 0, 0, Math.PI / 2));
  kneeR.add(cyl(0.037, 0.037, 0.008, 10, ledBlue, 0, 0, 0));
  kneeR.add(box(0.055, 0.20, 0.06, bodyWhite, 0, -0.11, 0));
  const footR = new THREE.Group();
  footR.name = 'footR';
  footR.position.set(0, -0.22, 0.01);
  kneeR.add(footR);
  footR.add(box(0.08, 0.03, 0.14, jointDark, 0, 0, 0));
  footR.add(box(0.08, 0.005, 0.14, M.rubber, 0, -0.012, 0));

  // ─── Spine → Torso (named 'torso' for breathing scale animation) ────
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.04, 0);
  pelvis.add(spine);

  const torso = new THREE.Group();
  torso.name = 'torso';
  spine.add(torso);
  // Lower torso block
  torso.add(box(0.20, 0.10, 0.10, bodyWhite, 0, 0.04, 0));
  // Upper chest panel
  torso.add(box(0.24, 0.14, 0.10, bodyPanel, 0, 0.15, 0));
  // Arc reactor LED
  torso.add(cyl(0.025, 0.025, 0.01, 12, ledBlue, 0, 0.16, 0.055));
  // Side vents
  torso.add(box(0.01, 0.06, 0.06, jointDark, -0.125, 0.14, 0));
  torso.add(box(0.01, 0.06, 0.06, jointDark, 0.125, 0.14, 0));
  // Backpack (battery/controller)
  torso.add(box(0.16, 0.12, 0.04, jointDark, 0, 0.12, -0.07));
  for (let i = 0; i < 4; i++) {
    torso.add(box(0.12, 0.008, 0.005, M.chrome, 0, 0.08 + i * 0.025, -0.092));
  }
  torso.add(sph(0.008, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }), -0.05, 0.15, -0.092));
  torso.add(sph(0.008, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }), -0.02, 0.15, -0.092));
  torso.add(sph(0.008, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }), 0.01, 0.15, -0.092));
  torso.add(sph(0.008, mat(0xffcc00, 0.1, 0.3, { emissive: 0xffcc00, emissiveIntensity: 0.8 }), 0.04, 0.15, -0.092));
  // Shoulder caps (attached to torso so they yaw with the body)
  torso.add(sph(0.04, jointDark, -0.15, 0.20, 0));
  torso.add(sph(0.04, jointDark, 0.15, 0.20, 0));

  // ─── Neck + Head ────────────────────────────────────────────────────
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.25, 0);
  torso.add(neck);
  neck.add(cyl(0.03, 0.04, 0.05, 8, jointDark, 0, 0, 0));

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.07, 0);
  neck.add(head);
  head.add(box(0.12, 0.10, 0.10, bodyPanel, 0, 0, 0));
  head.add(cyl(0.06, 0.06, 0.04, 12, bodyPanel, 0, 0.06, 0));
  head.add(box(0.11, 0.03, 0.01, visor, 0, 0, 0.055));
  head.add(box(0.12, 0.005, 0.01, jointDark, 0, 0.015, 0.054));
  head.add(box(0.12, 0.005, 0.01, jointDark, 0, -0.015, 0.054));
  head.add(cyl(0.015, 0.015, 0.02, 8, ledBlue, -0.07, 0, 0));
  head.add(cyl(0.015, 0.015, 0.02, 8, ledBlue, 0.07, 0, 0));

  // ─── ARMS ───────────────────────────────────────────────────────────
  // Note: OperatorAnimationManager looks specifically for `armLeft`/`armRight`
  // groups whose `rotation.x` is the shoulder pitch.
  const armsGroup = new THREE.Group();
  armsGroup.name = 'arms';
  torso.add(armsGroup);

  function buildArm(side: 'L' | 'R'): {
    shoulder: THREE.Group;
    elbow: THREE.Group;
    hand: THREE.Group;
  } {
    const sx = side === 'L' ? -0.15 : 0.15;
    const shoulder = new THREE.Group();
    shoulder.name = side === 'L' ? 'armLeft' : 'armRight';
    shoulder.position.set(sx, 0.20, 0);
    armsGroup.add(shoulder);
    // Upper arm hangs DOWN in the shoulder's local frame, so rotation.x
    // around the shoulder lifts it forward/back like a real shoulder pitch.
    shoulder.add(box(0.05, 0.16, 0.05, bodyWhite, 0, -0.08, 0));

    const elbow = new THREE.Group();
    elbow.name = side === 'L' ? 'elbowLeft' : 'elbowRight';
    elbow.position.set(0, -0.16, 0);
    shoulder.add(elbow);
    elbow.add(cyl(0.03, 0.03, 0.05, 8, jointDark, 0, 0, 0));
    elbow.add(cyl(0.031, 0.031, 0.008, 8, ledBlue, 0, 0, 0));
    elbow.add(box(0.045, 0.14, 0.045, bodyWhite, 0, -0.08, 0));

    const hand = new THREE.Group();
    hand.name = side === 'L' ? 'handLeft' : 'handRight';
    hand.position.set(0, -0.16, 0);
    elbow.add(hand);
    hand.add(box(0.04, 0.05, 0.03, jointDark, 0, -0.025, 0));
    hand.add(box(0.035, 0.03, 0.008, M.chrome, 0, -0.05, 0.01));
    hand.add(box(0.035, 0.03, 0.008, M.chrome, 0, -0.05, -0.01));

    return { shoulder, elbow, hand };
  }
  const leftArm = buildArm('L');
  const rightArm = buildArm('R');

  // Status light (outside figure)
  g.add(createStatusLight(0.25, 0, 0));

  // ─── Initial pose (small bend so it doesn't look like a board) ──────
  leftArm.shoulder.rotation.x = -0.1;
  rightArm.shoulder.rotation.x = -0.1;
  leftArm.elbow.rotation.x = 0.1;
  rightArm.elbow.rotation.x = 0.1;

  // ─── Expose FK chains for IK (arms + legs) ──────────────────────────
  const armJoints = (s: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group }): Joint[] => [
    { group: s.shoulder, axis: 'x', min: -Math.PI / 2, max: Math.PI / 2, rest: -0.1 },
    { group: s.shoulder, axis: 'z', min: -Math.PI / 3, max: Math.PI / 3, rest: 0    },
    { group: s.elbow,    axis: 'x', min: 0,             max: Math.PI * 0.9, rest: 0.1 },
  ];
  const legJoints = (hip: THREE.Group, knee: THREE.Group): Joint[] => [
    { group: hip,  axis: 'x', min: -Math.PI / 2, max: Math.PI / 2, rest: 0 },
    { group: hip,  axis: 'z', min: -Math.PI / 6, max: Math.PI / 6, rest: 0 },
    { group: knee, axis: 'x', min: -Math.PI * 0.9, max: 0,         rest: 0 },
  ];

  g.userData.kinematics = {
    type: 'humanoid',
    figure,
    pelvis,
    spine,
    torso,
    head,
    leftArm: {
      chain: new FKChain(armJoints(leftArm), leftArm.hand),
      shoulder: leftArm.shoulder,
      elbow: leftArm.elbow,
      hand: leftArm.hand,
    },
    rightArm: {
      chain: new FKChain(armJoints(rightArm), rightArm.hand),
      shoulder: rightArm.shoulder,
      elbow: rightArm.elbow,
      hand: rightArm.hand,
    },
    leftLeg: {
      chain: new FKChain(legJoints(hipL, kneeL), footL),
      hip: hipL, knee: kneeL, foot: footL,
    },
    rightLeg: {
      chain: new FKChain(legJoints(hipR, kneeR), footR),
      hip: hipR, knee: kneeR, foot: footR,
    },
  };

  attachOverrideAPI(g);
  return g;
}
