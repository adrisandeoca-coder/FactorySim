import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Rail-Mounted Transfer Cart
 * Flat steel platform, steel frame, 4 flanged wheels on 2 rails,
 * short rail track section, drive motor, cable reel, bumpers,
 * control pendant, tie-down points, safety stripes, status light.
 * Footprint: ~1.6 x 0.8 units (including rails), height ~0.4
 */
export function buildTransferCart(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mDeck    = mat(0x606878, 0.75, 0.3);      // deck plate steel
  const mFrame   = mat(0x4a5060, 0.7, 0.35);      // frame structural
  const mRail    = mat(0x556070, 0.85, 0.2);       // rail steel
  const mRailH   = mat(0xb0b8c0, 0.85, 0.15);     // rail running surface
  const mMotor   = mat(0x2c3040, 0.6, 0.5);       // motor housing
  const mBumper  = mat(0xccaa00, 0.2, 0.6);       // bumper yellow
  const mStripeY = mat(0xddaa00, 0.2, 0.6);       // warning yellow
  const mStripeB = mat(0x222222, 0.1, 0.8);       // warning black
  const mCable   = mat(0x333333, 0.3, 0.6);       // cable
  const mPend    = mat(0xddaa00, 0.2, 0.5);       // pendant control
  const mReel    = mat(0x3a4050, 0.65, 0.4);      // cable reel
  const mTiedown = mat(0x888888, 0.7, 0.3);       // tie-down

  // Faces along +X axis
  const deckL = 1.0;
  const deckW = 0.7;
  const deckH = 0.015;
  const railLen = 1.6;
  const railSpacing = 0.35;
  const deckY = 0.22;

  // ============ RAIL TRACK (2 I-beams on ground) ============
  for (const zSign of [-1, 1]) {
    const rz = zSign * railSpacing;
    // Bottom flange
    g.add(box(railLen, 0.015, 0.1, mRail, 0, 0.008, rz));
    // Web
    g.add(box(railLen, 0.04, 0.015, mRail, 0, 0.03, rz));
    // Top flange
    g.add(box(railLen, 0.015, 0.08, mRail, 0, 0.055, rz));
    // Running surface
    g.add(box(railLen, 0.008, 0.04, mRailH, 0, 0.063, rz));
    // Rail clips (every 0.3 units)
    for (let i = -2; i <= 2; i++) {
      g.add(box(0.03, 0.015, 0.1, mFrame, i * 0.35, 0.0, rz));
    }
    // Rail ties/sleepers
    for (let i = -2; i <= 2; i++) {
      g.add(box(0.05, 0.01, railSpacing * 2 + 0.12, mat(0x555555, 0.3, 0.7), i * 0.35, 0.0, 0));
    }
  }

  // ============ FLANGED WHEELS (4 wheels, 2 per rail) ============
  const wheelR = 0.04;
  const flangeR = 0.05;
  for (const zSign of [-1, 1]) {
    const wz = zSign * railSpacing;
    for (const xOff of [-0.3, 0.3]) {
      // Wheel body
      g.add(cyl(wheelR, wheelR, 0.04, 14, M.darkChrome, xOff, 0.07, wz, Math.PI / 2, 0, 0));
      // Flange (wider rim)
      g.add(cyl(flangeR, flangeR, 0.008, 14, M.darkChrome, xOff, 0.07, wz + zSign * 0.022, Math.PI / 2, 0, 0));
      // Axle hub
      g.add(cyl(0.015, 0.015, 0.05, 8, M.chrome, xOff, 0.07, wz, Math.PI / 2, 0, 0));
    }
  }

  // Axles
  g.add(cyl(0.012, 0.012, railSpacing * 2 + 0.08, 8, mFrame, -0.3, 0.07, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.012, 0.012, railSpacing * 2 + 0.08, 8, mFrame, 0.3, 0.07, 0, Math.PI / 2, 0, 0));

  // ============ STEEL FRAME (under deck) ============
  // Main longitudinal beams
  g.add(box(deckL, 0.06, 0.05, mFrame, 0, 0.14, 0.2));
  g.add(box(deckL, 0.06, 0.05, mFrame, 0, 0.14, -0.2));
  // Cross members
  g.add(box(0.04, 0.05, 0.4, mFrame, -0.35, 0.14, 0));
  g.add(box(0.04, 0.05, 0.4, mFrame, 0, 0.14, 0));
  g.add(box(0.04, 0.05, 0.4, mFrame, 0.35, 0.14, 0));
  // Diagonal bracing
  g.add(box(0.3, 0.02, 0.02, mFrame, 0.15, 0.13, 0.15, 0, 0.4, 0));
  g.add(box(0.3, 0.02, 0.02, mFrame, -0.15, 0.13, -0.15, 0, 0.4, 0));

  // ============ FLAT DECK PLATFORM ============
  g.add(box(deckL, deckH, deckW, mDeck, 0, deckY, 0));
  // Deck texture (diamond plate pattern)
  for (let x = -0.4; x <= 0.4; x += 0.08) {
    g.add(box(0.05, 0.003, deckW - 0.04, mat(0x6a7080, 0.6, 0.35), x, deckY + 0.01, 0));
  }

  // ============ SAFETY STRIPES (on deck edges) ============
  // Front edge
  for (let i = 0; i < 7; i++) {
    const stripeMat = i % 2 === 0 ? mStripeY : mStripeB;
    g.add(box(0.04, 0.008, 0.04, stripeMat, deckL / 2 - 0.02, deckY + 0.008, -deckW / 2 + 0.04 + i * 0.05));
  }
  // Rear edge
  for (let i = 0; i < 7; i++) {
    const stripeMat = i % 2 === 0 ? mStripeY : mStripeB;
    g.add(box(0.04, 0.008, 0.04, stripeMat, -deckL / 2 + 0.02, deckY + 0.008, -deckW / 2 + 0.04 + i * 0.05));
  }

  // ============ LOAD TIE-DOWN POINTS (on deck) ============
  const tiePositions = [
    { x: -0.35, z: 0.28 }, { x: 0.35, z: 0.28 },
    { x: -0.35, z: -0.28 }, { x: 0.35, z: -0.28 },
    { x: 0, z: 0.28 }, { x: 0, z: -0.28 },
  ];
  for (const tp of tiePositions) {
    // D-ring base plate
    g.add(box(0.025, 0.005, 0.025, mTiedown, tp.x, deckY + 0.01, tp.z));
    // D-ring (approximated with small cyl)
    g.add(cyl(0.01, 0.01, 0.015, 8, mTiedown, tp.x, deckY + 0.02, tp.z));
  }

  // ============ DRIVE MOTOR HOUSING (underneath) ============
  g.add(box(0.15, 0.08, 0.12, mMotor, 0.3, 0.12, 0));
  // Motor end cap
  g.add(cyl(0.04, 0.04, 0.03, 12, M.darkChrome, 0.3, 0.12, 0.075, Math.PI / 2, 0, 0));
  // Motor cooling fins
  for (let i = 0; i < 4; i++) {
    g.add(box(0.01, 0.07, 0.13, mFrame, 0.25 + i * 0.03, 0.12, 0));
  }
  // Gearbox
  g.add(box(0.08, 0.06, 0.08, mMotor, 0.3, 0.1, -0.08));
  // Drive chain cover
  g.add(box(0.06, 0.04, 0.04, mFrame, 0.3, 0.08, -0.16));

  // ============ CABLE REEL / FESTOON SYSTEM ============
  // Reel drum
  g.add(cyl(0.06, 0.06, 0.08, 12, mReel, -0.38, 0.16, 0.28, Math.PI / 2, 0, 0));
  // Reel flanges
  g.add(cyl(0.08, 0.08, 0.01, 12, mFrame, -0.38, 0.16, 0.32, Math.PI / 2, 0, 0));
  g.add(cyl(0.08, 0.08, 0.01, 12, mFrame, -0.38, 0.16, 0.24, Math.PI / 2, 0, 0));
  // Reel mounting bracket
  g.add(box(0.04, 0.1, 0.03, mFrame, -0.38, 0.2, 0.22));
  // Cable coming off reel
  g.add(cyl(0.008, 0.008, 0.2, 6, mCable, -0.38, 0.25, 0.35, 0.6, 0, 0));

  // ============ BUMPERS (both ends) ============
  // Front bumper
  g.add(box(0.04, 0.06, deckW + 0.04, mBumper, deckL / 2 + 0.02, deckY - 0.02, 0));
  g.add(box(0.02, 0.04, deckW + 0.04, M.rubber, deckL / 2 + 0.04, deckY - 0.02, 0));
  // Rear bumper
  g.add(box(0.04, 0.06, deckW + 0.04, mBumper, -deckL / 2 - 0.02, deckY - 0.02, 0));
  g.add(box(0.02, 0.04, deckW + 0.04, M.rubber, -deckL / 2 - 0.04, deckY - 0.02, 0));

  // ============ CONTROL PENDANT (hanging on cable) ============
  const pendX = 0.3;
  const pendZ = -0.35;
  // Cable from deck edge
  g.add(cyl(0.005, 0.005, 0.25, 6, mCable, pendX, deckY - 0.12, pendZ));
  // Pendant box
  g.add(box(0.04, 0.08, 0.03, mPend, pendX, deckY - 0.28, pendZ));
  // Pendant buttons (3)
  g.add(sph(0.008, mat(0x00aa00, 0.1, 0.5), pendX + 0.015, deckY - 0.24, pendZ - 0.016));
  g.add(sph(0.008, mat(0xdd0000, 0.1, 0.5), pendX + 0.015, deckY - 0.26, pendZ - 0.016));
  g.add(sph(0.008, mat(0xdddd00, 0.1, 0.5), pendX + 0.015, deckY - 0.28, pendZ - 0.016));
  // Pendant cable strain relief
  g.add(cyl(0.008, 0.005, 0.02, 8, M.rubber, pendX, deckY - 0.04, pendZ));

  // ============ EDGE GUARDS / SIDE RAILS ============
  g.add(box(deckL, 0.03, 0.015, mFrame, 0, deckY + 0.025, deckW / 2));
  g.add(box(deckL, 0.03, 0.015, mFrame, 0, deckY + 0.025, -deckW / 2));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(-0.4, deckY + 0.01, -0.28));

  return g;
}
