import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Scissor Lift Platform (elevated position)
 * Base frame with wheels/casters, 2-stage scissor X-pattern arms,
 * flat work platform, safety railings, hydraulic cylinder,
 * control panel, outrigger/stabilizer pads, yellow/black markings.
 * Footprint: ~0.8 x 0.5 units, height ~1.5 (elevated)
 */
export function buildScissorLift(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBase    = mat(0x3a4050, 0.7, 0.35);      // base frame steel
  const mScissor = mat(0x556070, 0.75, 0.3);      // scissor arms
  const mPlatfrm = mat(0x606878, 0.65, 0.35);     // platform deck
  const mRail    = mat(0xddaa00, 0.2, 0.5);       // safety rail yellow
  const mRailDk  = mat(0x998800, 0.25, 0.55);     // darker yellow
  const mHydro   = mat(0xb0b8c0, 0.85, 0.15);     // hydraulic cylinder
  const mMotor   = mat(0x2c3040, 0.6, 0.5);       // motor/pump
  const mCtrl    = mat(0xddaa00, 0.2, 0.5);       // control panel
  const mStripeY = mat(0xddaa00, 0.2, 0.6);       // warning yellow
  const mStripeB = mat(0x222222, 0.1, 0.8);       // warning black
  const mOutrig  = mat(0x444444, 0.5, 0.5);       // outrigger
  const mPad     = mat(0x333333, 0.1, 0.8);       // stabilizer pad

  // Faces +X direction
  const baseL = 0.7;
  const baseW = 0.45;
  const baseH = 0.08;

  // ============ BASE FRAME ============
  g.add(box(baseL, baseH, baseW, mBase, 0, baseH / 2, 0));
  // Frame cross members underneath
  g.add(box(0.04, 0.04, baseW - 0.04, mBase, -0.2, 0.02, 0));
  g.add(box(0.04, 0.04, baseW - 0.04, mBase, 0.2, 0.02, 0));
  // Frame side rails
  g.add(box(baseL, 0.04, 0.03, mBase, 0, 0.06, baseW / 2));
  g.add(box(baseL, 0.04, 0.03, mBase, 0, 0.06, -baseW / 2));

  // ============ BASE WHEELS / CASTERS ============
  const casterR = 0.03;
  const casterPositions = [
    { x: -0.28, z: 0.18 }, { x: -0.28, z: -0.18 },
    { x: 0.28, z: 0.18 }, { x: 0.28, z: -0.18 },
  ];
  for (const cp of casterPositions) {
    // Caster fork
    g.add(box(0.02, 0.04, 0.03, mBase, cp.x, 0.02, cp.z));
    // Swivel pin
    g.add(cyl(0.008, 0.008, 0.02, 8, M.chrome, cp.x, 0.04, cp.z));
    // Wheel
    g.add(cyl(casterR, casterR, 0.02, 12, M.rubber, cp.x, casterR, cp.z, Math.PI / 2, 0, 0));
    g.add(cyl(0.015, 0.015, 0.015, 8, M.darkChrome, cp.x, casterR, cp.z, Math.PI / 2, 0, 0));
  }

  // ============ SAFETY STRIPES ON BASE ============
  for (let i = 0; i < 8; i++) {
    const stripeMat = i % 2 === 0 ? mStripeY : mStripeB;
    g.add(box(0.04, 0.01, 0.04, stripeMat, baseL / 2 - 0.02, baseH + 0.005, -baseW / 2 + 0.04 + i * 0.05));
  }
  for (let i = 0; i < 8; i++) {
    const stripeMat = i % 2 === 0 ? mStripeY : mStripeB;
    g.add(box(0.04, 0.01, 0.04, stripeMat, -baseL / 2 + 0.02, baseH + 0.005, -baseW / 2 + 0.04 + i * 0.05));
  }

  // ============ OUTRIGGER / STABILIZER PADS ============
  const outrigPositions = [
    { x: -0.35, z: 0.3 }, { x: -0.35, z: -0.3 },
    { x: 0.35, z: 0.3 }, { x: 0.35, z: -0.3 },
  ];
  for (const op of outrigPositions) {
    // Outrigger arm
    g.add(box(0.06, 0.02, 0.08, mOutrig, op.x, 0.03, op.z));
    // Stabilizer pad
    g.add(box(0.08, 0.01, 0.08, mPad, op.x, 0.005, op.z));
    // Jack screw
    g.add(cyl(0.01, 0.01, 0.04, 8, M.chrome, op.x, 0.02, op.z));
  }

  // ============ SCISSOR MECHANISM (2 stages, X-pattern) ============
  const scissorW = 0.35;
  const armThick = 0.02;
  const armDepth = 0.03;

  // --- Stage 1 (lower) ---
  const s1BotY = baseH + 0.02;
  const s1TopY = 0.55;
  const s1Len = 0.6;

  // Left pair
  // Arm A (bottom-left to top-right)
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s1BotY + s1TopY) / 2, scissorW / 2, 0, 0, 0.55));
  // Arm B (bottom-right to top-left)
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s1BotY + s1TopY) / 2, scissorW / 2, 0, 0, -0.55));

  // Right pair
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s1BotY + s1TopY) / 2, -scissorW / 2, 0, 0, 0.55));
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s1BotY + s1TopY) / 2, -scissorW / 2, 0, 0, -0.55));

  // Center pivot pins - stage 1
  g.add(cyl(0.01, 0.01, scissorW + 0.06, 8, M.chrome, 0, (s1BotY + s1TopY) / 2, 0, Math.PI / 2, 0, 0));

  // --- Stage 2 (upper) ---
  const s2BotY = s1TopY;
  const s2TopY = 1.0;

  // Left pair
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s2BotY + s2TopY) / 2, scissorW / 2, 0, 0, 0.55));
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s2BotY + s2TopY) / 2, scissorW / 2, 0, 0, -0.55));

  // Right pair
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s2BotY + s2TopY) / 2, -scissorW / 2, 0, 0, 0.55));
  g.add(box(s1Len, armThick, armDepth, mScissor, 0, (s2BotY + s2TopY) / 2, -scissorW / 2, 0, 0, -0.55));

  // Center pivot pins - stage 2
  g.add(cyl(0.01, 0.01, scissorW + 0.06, 8, M.chrome, 0, (s2BotY + s2TopY) / 2, 0, Math.PI / 2, 0, 0));

  // Transition pivot between stages
  g.add(cyl(0.01, 0.01, scissorW + 0.06, 8, M.chrome, 0, s1TopY, 0, Math.PI / 2, 0, 0));

  // Slider tracks on base and platform
  g.add(box(baseL - 0.1, 0.015, 0.025, mBase, 0, baseH + 0.005, scissorW / 2));
  g.add(box(baseL - 0.1, 0.015, 0.025, mBase, 0, baseH + 0.005, -scissorW / 2));

  // ============ HYDRAULIC CYLINDER (driving scissors) ============
  const hydY1 = baseH + 0.04;
  const hydY2 = s1TopY - 0.1;
  const hydLen = hydY2 - hydY1;
  // Cylinder body
  g.add(cyl(0.025, 0.025, hydLen * 0.6, 10, mHydro, 0.15, hydY1 + hydLen * 0.3, 0, 0.3, 0, 0));
  // Cylinder rod
  g.add(cyl(0.015, 0.015, hydLen * 0.4, 8, M.chrome, 0.08, hydY1 + hydLen * 0.65, 0, 0.3, 0, 0));
  // Cylinder end caps
  g.add(cyl(0.03, 0.03, 0.015, 10, mBase, 0.18, hydY1 + hydLen * 0.1, 0, 0.3, 0, 0));
  // Hydraulic hoses
  g.add(cyl(0.006, 0.006, 0.2, 6, M.wire, 0.2, hydY1 + 0.05, 0.06, 0.5, 0.3, 0));
  g.add(cyl(0.006, 0.006, 0.2, 6, M.wire, 0.2, hydY1 + 0.05, -0.06, 0.5, -0.3, 0));

  // ============ HYDRAULIC PUMP / POWER UNIT ============
  g.add(box(0.1, 0.06, 0.1, mMotor, 0.25, 0.06, 0));
  // Pump motor
  g.add(cyl(0.03, 0.03, 0.06, 10, mMotor, 0.25, 0.06, 0.08, Math.PI / 2, 0, 0));
  // Oil reservoir
  g.add(box(0.06, 0.04, 0.08, mat(0x444444, 0.3, 0.6), 0.3, 0.04, 0.12));

  // ============ WORK PLATFORM (elevated) ============
  const platY = s2TopY + 0.02;
  const platL = 0.75;
  const platW = 0.5;
  g.add(box(platL, 0.015, platW, mPlatfrm, 0, platY, 0));
  // Platform deck texture
  for (let x = -0.3; x <= 0.3; x += 0.06) {
    g.add(box(0.04, 0.003, platW - 0.04, mat(0x6a7080, 0.6, 0.35), x, platY + 0.01, 0));
  }

  // Platform toe board (kick plate around edge)
  g.add(box(platL, 0.04, 0.008, mStripeY, 0, platY + 0.03, platW / 2));
  g.add(box(platL, 0.04, 0.008, mStripeY, 0, platY + 0.03, -platW / 2));
  g.add(box(0.008, 0.04, platW, mStripeY, platL / 2, platY + 0.03, 0));
  g.add(box(0.008, 0.04, platW, mStripeY, -platL / 2, platY + 0.03, 0));

  // ============ SAFETY RAILINGS ============
  const railH = 0.35;
  const midRailH = 0.18;

  // Corner posts
  const railPosts = [
    { x: platL / 2, z: platW / 2 }, { x: platL / 2, z: -platW / 2 },
    { x: -platL / 2, z: platW / 2 }, { x: -platL / 2, z: -platW / 2 },
  ];
  for (const rp of railPosts) {
    g.add(cyl(0.012, 0.012, railH, 8, mRail, rp.x, platY + railH / 2, rp.z));
  }

  // Mid posts (on long sides)
  g.add(cyl(0.01, 0.01, railH, 8, mRailDk, 0, platY + railH / 2, platW / 2));
  g.add(cyl(0.01, 0.01, railH, 8, mRailDk, 0, platY + railH / 2, -platW / 2));

  // Top rails
  g.add(box(platL, 0.015, 0.015, mRail, 0, platY + railH, platW / 2));
  g.add(box(platL, 0.015, 0.015, mRail, 0, platY + railH, -platW / 2));
  g.add(box(0.015, 0.015, platW, mRail, platL / 2, platY + railH, 0));
  g.add(box(0.015, 0.015, platW, mRail, -platL / 2, platY + railH, 0));

  // Mid rails
  g.add(box(platL, 0.012, 0.012, mRailDk, 0, platY + midRailH, platW / 2));
  g.add(box(platL, 0.012, 0.012, mRailDk, 0, platY + midRailH, -platW / 2));
  g.add(box(0.012, 0.012, platW, mRailDk, platL / 2, platY + midRailH, 0));
  g.add(box(0.012, 0.012, platW, mRailDk, -platL / 2, platY + midRailH, 0));

  // ============ CONTROL PANEL ON PLATFORM ============
  g.add(box(0.04, 0.08, 0.06, mCtrl, platL / 2 - 0.02, platY + 0.12, -platW / 2 + 0.04));
  // Buttons
  g.add(sph(0.008, mat(0x00aa00, 0.1, 0.5), platL / 2 + 0.0, platY + 0.14, -platW / 2 + 0.03));
  g.add(sph(0.008, mat(0xdd0000, 0.1, 0.5), platL / 2 + 0.0, platY + 0.12, -platW / 2 + 0.03));
  // Joystick
  g.add(cyl(0.006, 0.006, 0.03, 6, mBase, platL / 2 + 0.0, platY + 0.17, -platW / 2 + 0.05));
  g.add(sph(0.01, M.rubber, platL / 2 + 0.0, platY + 0.19, -platW / 2 + 0.05));

  // ============ GROUND CONTROL PANEL ============
  g.add(box(0.05, 0.06, 0.04, mCtrl, baseL / 2 + 0.02, 0.07, 0));
  g.add(sph(0.007, mat(0x00aa00, 0.1, 0.5), baseL / 2 + 0.045, 0.08, 0.01));
  g.add(sph(0.007, mat(0xdd0000, 0.1, 0.5), baseL / 2 + 0.045, 0.065, 0.01));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(-platL / 2, platY + railH, 0));

  return g;
}
