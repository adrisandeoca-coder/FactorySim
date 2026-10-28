import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Sorting System
 * Main belt conveyor spine, 3 divert pushers at angles, 3 outfeed chutes
 * with collection bins, photo-eye sensors, barcode scanner on gantry,
 * drive motor, control panel, products on belt, status light.
 * Footprint: ~2.0 x 1.8 units, height ~1.0
 */
export function buildSortingSystem(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame   = mat(0x4a5060, 0.75, 0.35);     // frame steel
  const mBelt    = mat(0x1a1e22, 0.1, 0.9);        // conveyor belt
  const mSlat    = mat(0x2a2e36, 0.4, 0.7);        // belt slats
  const mGuard   = mat(0x556070, 0.7, 0.3);        // side guards
  const mDivert  = mat(0x3a4a5a, 0.5, 0.5);       // divert pusher
  const mPiston  = mat(0xb0b8c0, 0.85, 0.15);     // pneumatic piston
  const mChute   = mat(0x606878, 0.65, 0.35);     // chute steel
  const mBin     = mat(0x2266aa, 0.15, 0.6);      // collection bin
  const mSensor  = mat(0x222222, 0.3, 0.6);       // sensor housing
  const mLaser   = mat(0xff0000, 0.0, 0.2, { emissive: 0xff0000, emissiveIntensity: 2.0 });
  const mScanner = mat(0x333333, 0.3, 0.5);       // scanner housing
  const mMotor   = mat(0x2c3040, 0.6, 0.5);       // motor
  const mCtrl    = mat(0xdddddd, 0.2, 0.5);       // control panel
  const mProduct = mat(0xC4934A, 0.0, 0.95);      // cardboard boxes
  const mGantry  = mat(0x4a5060, 0.7, 0.35);      // scanner gantry

  const mLED     = mat(0x00ff44, 0.0, 0.3, { emissive: 0x00dd33, emissiveIntensity: 1.0 });

  // Main conveyor runs along +X axis
  const beltLen = 1.8;
  const beltW = 0.3;
  const beltY = 0.45;  // belt surface height
  const frameH = 0.4;

  // ============ MAIN BELT CONVEYOR FRAME ============
  // Side rails
  g.add(box(beltLen, frameH, 0.03, mFrame, 0, beltY - frameH / 2 + 0.02, beltW / 2 + 0.015));
  g.add(box(beltLen, frameH, 0.03, mFrame, 0, beltY - frameH / 2 + 0.02, -beltW / 2 - 0.015));

  // Legs (6 pairs)
  for (let i = 0; i < 6; i++) {
    const lx = -beltLen / 2 + 0.2 + i * (beltLen - 0.4) / 5;
    g.add(box(0.03, frameH, 0.03, mFrame, lx, beltY - frameH / 2, beltW / 2 + 0.015));
    g.add(box(0.03, frameH, 0.03, mFrame, lx, beltY - frameH / 2, -beltW / 2 - 0.015));
    // Cross braces
    g.add(box(0.02, 0.02, beltW + 0.05, mFrame, lx, beltY - frameH + 0.05, 0));
  }

  // Floor cross braces
  for (let i = 0; i < 3; i++) {
    const bx = -beltLen / 2 + 0.4 + i * 0.6;
    g.add(box(0.3, 0.02, 0.02, mFrame, bx, 0.06, beltW / 2 + 0.015));
    g.add(box(0.3, 0.02, 0.02, mFrame, bx, 0.06, -beltW / 2 - 0.015));
  }

  // ============ BELT SURFACE ============
  g.add(box(beltLen - 0.04, 0.01, beltW, mBelt, 0, beltY, 0));
  // Belt slats
  for (let x = -beltLen / 2 + 0.1; x < beltLen / 2; x += 0.06) {
    g.add(box(0.03, 0.005, beltW - 0.01, mSlat, x, beltY + 0.005, 0));
  }

  // Belt side guards
  g.add(box(beltLen, 0.04, 0.005, mGuard, 0, beltY + 0.03, beltW / 2 + 0.003));
  g.add(box(beltLen, 0.04, 0.005, mGuard, 0, beltY + 0.03, -beltW / 2 - 0.003));

  // Head/tail rollers
  g.add(cyl(0.03, 0.03, beltW + 0.04, 12, M.darkChrome, beltLen / 2 - 0.02, beltY - 0.01, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.03, 0.03, beltW + 0.04, 12, M.darkChrome, -beltLen / 2 + 0.02, beltY - 0.01, 0, Math.PI / 2, 0, 0));

  // ============ MAIN DRIVE MOTOR ============
  g.add(box(0.12, 0.1, 0.1, mMotor, -beltLen / 2 + 0.08, beltY - 0.15, -beltW / 2 - 0.08));
  g.add(cyl(0.035, 0.035, 0.04, 12, M.darkChrome, -beltLen / 2 + 0.08, beltY - 0.15, -beltW / 2 - 0.14, Math.PI / 2, 0, 0));
  // Drive belt/chain cover
  g.add(box(0.04, 0.06, 0.04, mFrame, -beltLen / 2 + 0.03, beltY - 0.08, -beltW / 2 - 0.04));

  // ============ DIVERT ARMS / PUSHERS (3, angled to one side) ============
  const divertPositions = [
    { x: -0.4, angle: 0.5 },
    { x: 0.1, angle: 0.5 },
    { x: 0.6, angle: 0.5 },
  ];

  for (let d = 0; d < 3; d++) {
    const dp = divertPositions[d];

    // Pusher plate (angled)
    g.add(box(0.25, 0.06, 0.02, mDivert, dp.x, beltY + 0.04, -beltW / 2 + 0.04, 0, dp.angle, 0));

    // Pneumatic cylinder body
    g.add(cyl(0.02, 0.02, 0.15, 10, mPiston, dp.x - 0.08, beltY + 0.04, -beltW / 2 - 0.06, Math.PI / 2, dp.angle, 0));
    // Piston rod
    g.add(cyl(0.01, 0.01, 0.1, 8, M.chrome, dp.x + 0.02, beltY + 0.04, -beltW / 2 - 0.01, Math.PI / 2, dp.angle, 0));
    // Cylinder mounting bracket
    g.add(box(0.04, 0.04, 0.03, mFrame, dp.x - 0.14, beltY + 0.04, -beltW / 2 - 0.08));
    // Air line fittings
    g.add(cyl(0.005, 0.005, 0.02, 6, M.chrome, dp.x - 0.14, beltY + 0.06, -beltW / 2 - 0.06));
  }

  // ============ OUTFEED CHUTES (3, extending to the right side) ============
  const chuteLen = 0.4;
  const chuteW = 0.2;

  for (let c = 0; c < 3; c++) {
    const cx = divertPositions[c].x + 0.15;
    const cz = beltW / 2 + 0.05;

    // Chute bottom plate (angled slightly down)
    g.add(box(chuteLen, 0.008, chuteW, mChute, cx, beltY - 0.04, cz + chuteLen / 2, 0.15, 0, 0));

    // Chute side walls
    g.add(box(chuteLen, 0.06, 0.008, mGuard, cx, beltY - 0.02, cz + chuteLen / 2 - chuteW / 2, 0.15, 0, 0));
    g.add(box(chuteLen, 0.06, 0.008, mGuard, cx, beltY - 0.02, cz + chuteLen / 2 + chuteW / 2, 0.15, 0, 0));

    // Chute end lip
    g.add(box(0.008, 0.04, chuteW, mGuard, cx + chuteLen / 2 - 0.02, beltY - 0.08, cz + chuteLen / 2));

    // ============ COLLECTION BIN at chute end ============
    const binX = cx;
    const binZ = cz + chuteLen + 0.1;
    const binH = 0.3;
    const binW2 = 0.22;
    const binD = 0.25;

    // Bin walls
    g.add(box(binD, binH, 0.008, mBin, binX, binH / 2, binZ - binW2 / 2));
    g.add(box(binD, binH, 0.008, mBin, binX, binH / 2, binZ + binW2 / 2));
    g.add(box(0.008, binH, binW2, mBin, binX + binD / 2, binH / 2, binZ));
    g.add(box(0.008, binH, binW2, mBin, binX - binD / 2, binH / 2, binZ));
    // Bin bottom
    g.add(box(binD, 0.008, binW2, mBin, binX, 0.004, binZ));
    // Bin label
    g.add(box(0.08, 0.05, 0.005, mat(0xffffff, 0.0, 0.8), binX, binH * 0.7, binZ + binW2 / 2 + 0.005));

    // Small product in bin
    g.add(box(0.06, 0.04, 0.05, mProduct, binX + 0.03, 0.04, binZ));
  }

  // ============ PHOTO-EYE SENSORS (before each divert) ============
  for (let s = 0; s < 3; s++) {
    const sx = divertPositions[s].x - 0.15;

    // Emitter (one side)
    g.add(box(0.02, 0.025, 0.02, mSensor, sx, beltY + 0.04, beltW / 2 + 0.025));
    g.add(sph(0.005, mLaser, sx, beltY + 0.04, beltW / 2 + 0.015));
    // Emitter mounting bracket
    g.add(cyl(0.005, 0.005, 0.03, 6, mFrame, sx, beltY + 0.04, beltW / 2 + 0.035));

    // Receiver (other side)
    g.add(box(0.02, 0.025, 0.02, mSensor, sx, beltY + 0.04, -beltW / 2 - 0.025));
    g.add(sph(0.005, mLED, sx, beltY + 0.04, -beltW / 2 - 0.015));
    g.add(cyl(0.005, 0.005, 0.03, 6, mFrame, sx, beltY + 0.04, -beltW / 2 - 0.035));

    // Sensor indicator LED
    g.add(sph(0.004, mLED, sx, beltY + 0.055, beltW / 2 + 0.025));
  }

  // ============ BARCODE SCANNER GANTRY (overhead) ============
  const scanX = -0.6;
  const scanY = beltY + 0.35;

  // Gantry uprights
  g.add(cyl(0.015, 0.015, 0.35, 8, mGantry, scanX, beltY + 0.18, beltW / 2 + 0.06));
  g.add(cyl(0.015, 0.015, 0.35, 8, mGantry, scanX, beltY + 0.18, -beltW / 2 - 0.06));

  // Gantry crossbar
  g.add(box(0.03, 0.03, beltW + 0.15, mGantry, scanX, scanY, 0));

  // Gantry upright base plates
  g.add(box(0.06, 0.01, 0.04, mFrame, scanX, beltY - frameH + 0.04, beltW / 2 + 0.06));
  g.add(box(0.06, 0.01, 0.04, mFrame, scanX, beltY - frameH + 0.04, -beltW / 2 - 0.06));

  // Scanner housing (hanging from gantry)
  g.add(box(0.08, 0.04, 0.12, mScanner, scanX, scanY - 0.04, 0));
  // Scanner window (bottom face)
  g.add(box(0.06, 0.005, 0.08, mat(0x333366, 0.1, 0.2, { transparent: true, opacity: 0.5 }), scanX, scanY - 0.065, 0));
  // Scanner laser line (visible)
  g.add(box(0.002, 0.005, 0.1, mLaser, scanX, scanY - 0.07, 0));
  // Scanner cable
  g.add(cyl(0.006, 0.006, 0.1, 6, M.wire, scanX, scanY + 0.03, 0.08, 0.4, 0, 0));
  // Scanner indicator LEDs
  g.add(sph(0.005, mLED, scanX + 0.04, scanY - 0.02, 0.065));
  g.add(sph(0.005, mat(0xff8800, 0.0, 0.3, { emissive: 0xff6600, emissiveIntensity: 0.8 }), scanX + 0.04, scanY - 0.02, 0.05));

  // ============ PRODUCTS ON BELT (small boxes) ============
  const products = [
    { x: -0.65, z: 0.02 },
    { x: -0.35, z: -0.03 },
    { x: 0.0, z: 0.04 },
    { x: 0.25, z: -0.02 },
    { x: 0.55, z: 0.01 },
  ];
  for (const p of products) {
    g.add(box(0.06, 0.04, 0.05, mProduct, p.x, beltY + 0.025, p.z));
    // Box tape stripe
    g.add(box(0.062, 0.005, 0.015, mat(0x996633, 0.0, 0.8), p.x, beltY + 0.045, p.z));
  }

  // ============ CONTROL PANEL ============
  const cpX = -beltLen / 2 + 0.15;
  const cpZ = -beltW / 2 - 0.12;

  // Panel enclosure
  g.add(box(0.15, 0.25, 0.06, mCtrl, cpX, 0.35, cpZ));
  // Panel door
  g.add(box(0.13, 0.22, 0.005, mat(0xcccccc, 0.15, 0.5), cpX, 0.35, cpZ + 0.033));
  // Door handle
  g.add(box(0.01, 0.03, 0.01, M.chrome, cpX + 0.05, 0.35, cpZ + 0.04));
  // Panel stand/legs
  g.add(box(0.03, 0.2, 0.03, mFrame, cpX - 0.05, 0.1, cpZ));
  g.add(box(0.03, 0.2, 0.03, mFrame, cpX + 0.05, 0.1, cpZ));
  // Indicator lights on panel
  g.add(sph(0.006, mat(0x00ff00, 0.0, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }), cpX - 0.03, 0.46, cpZ + 0.035));
  g.add(sph(0.006, mLaser, cpX, 0.46, cpZ + 0.035));
  g.add(sph(0.006, mat(0xffcc00, 0.0, 0.3, { emissive: 0xffaa00, emissiveIntensity: 0.8 }), cpX + 0.03, 0.46, cpZ + 0.035));
  // Screen
  g.add(box(0.005, 0.04, 0.06, M.screen, cpX, 0.4, cpZ + 0.034));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(cpX, 0.48, cpZ));

  return g;
}
