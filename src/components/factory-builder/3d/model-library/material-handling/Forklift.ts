import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Counterbalance Forklift Truck
 * Body/chassis, overhead guard (ROPS), triple-stage mast,
 * fork carriage with forks, counterweight, 4 wheels,
 * steering wheel, seat, LPG tank, lights, warning beacon,
 * hydraulic cylinders, status light.
 * Footprint: ~1.4 x 0.7 units, height ~1.4 units
 */
export function buildForklift(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBody     = mat(0xd4760a, 0.4, 0.5);      // orange forklift body
  const mFrame    = mat(0x3a3e48, 0.75, 0.4);      // steel frame
  const mMast     = mat(0x4a5060, 0.8, 0.3);       // mast rails
  const mFork     = mat(0x505868, 0.8, 0.25);      // fork tines
  const mWeight   = mat(0x333840, 0.7, 0.5);       // counterweight
  const mSeat     = mat(0x1a1a1a, 0.0, 0.9);       // seat vinyl
  const mTank     = mat(0x888888, 0.6, 0.4);       // LPG tank
  const mHydro    = mat(0x606878, 0.85, 0.2);      // hydraulic cylinder
  const mLens     = mat(0xffee88, 0.1, 0.3, { emissive: 0x332200, emissiveIntensity: 0.3 });
  const mTailLens = mat(0xff2222, 0.1, 0.3, { emissive: 0x330000, emissiveIntensity: 0.3 });
  const mDash     = mat(0x2a2e35, 0.3, 0.7);       // dashboard
  const mChain    = mat(0x707070, 0.7, 0.3);        // lift chain

  // === Chassis / Body ===
  // Main body block
  g.add(box(0.6, 0.2, 0.6, mBody, -0.05, 0.3, 0));
  // Engine compartment (rear)
  g.add(box(0.35, 0.25, 0.55, mBody, -0.35, 0.35, 0));
  // Engine hood top (sloped slightly)
  g.add(box(0.35, 0.02, 0.56, mBody, -0.35, 0.48, 0));
  // Engine grille (rear)
  g.add(box(0.02, 0.15, 0.4, mat(0x222222, 0.3, 0.6), -0.53, 0.35, 0));
  // Engine grille slats
  for (let i = 0; i < 5; i++) {
    g.add(box(0.015, 0.008, 0.38, mFrame, -0.535, 0.29 + i * 0.03, 0));
  }
  // Floor plate
  g.add(box(0.7, 0.03, 0.62, mFrame, -0.05, 0.19, 0));

  // === Counterweight (rear, heavy casting) ===
  g.add(box(0.2, 0.25, 0.6, mWeight, -0.52, 0.33, 0));
  // Counterweight curved profile (approx with cylinder)
  g.add(cyl(0.3, 0.3, 0.25, 8, mWeight, -0.52, 0.33, 0, 0, 0, 0));

  // === Overhead Guard / ROPS ===
  const roofH = 1.3;
  // 4 pillars
  const pillarPositions: [number, number][] = [
    [0.15, 0.28], [0.15, -0.28], [-0.3, 0.28], [-0.3, -0.28]
  ];
  for (const [px, pz] of pillarPositions) {
    g.add(box(0.035, roofH - 0.42, 0.035, mFrame, px, 0.42 + (roofH - 0.42) / 2, pz));
  }
  // Roof frame (top)
  g.add(box(0.5, 0.025, 0.6, mFrame, -0.07, roofH, 0));
  // Roof cross members
  g.add(box(0.5, 0.02, 0.03, mFrame, -0.07, roofH - 0.015, 0.15));
  g.add(box(0.5, 0.02, 0.03, mFrame, -0.07, roofH - 0.015, -0.15));
  g.add(box(0.03, 0.02, 0.6, mFrame, 0.1, roofH - 0.015, 0));
  g.add(box(0.03, 0.02, 0.6, mFrame, -0.2, roofH - 0.015, 0));
  // Roof mesh/grate (semi-transparent)
  g.add(box(0.48, 0.005, 0.58, mat(0x555555, 0.5, 0.4, { transparent: true, opacity: 0.4 }),
    -0.07, roofH - 0.01, 0));

  // === Mast (triple-stage) ===
  const mastX = 0.3;
  const mastH = 1.2;
  // Outer mast rails
  g.add(box(0.04, mastH, 0.04, mMast, mastX, mastH / 2 + 0.05, -0.2));
  g.add(box(0.04, mastH, 0.04, mMast, mastX, mastH / 2 + 0.05, 0.2));
  // Inner mast rails (slightly shorter, nested)
  g.add(box(0.03, mastH * 0.85, 0.03, mHydro, mastX, mastH * 0.85 / 2 + 0.1, -0.18));
  g.add(box(0.03, mastH * 0.85, 0.03, mHydro, mastX, mastH * 0.85 / 2 + 0.1, 0.18));
  // Third stage (innermost)
  g.add(box(0.025, mastH * 0.7, 0.025, mHydro, mastX, mastH * 0.7 / 2 + 0.15, -0.16));
  g.add(box(0.025, mastH * 0.7, 0.025, mHydro, mastX, mastH * 0.7 / 2 + 0.15, 0.16));

  // Mast cross braces
  for (let i = 0; i < 4; i++) {
    g.add(box(0.02, 0.02, 0.38, mMast, mastX, 0.2 + i * 0.3, 0));
  }

  // Hydraulic lift cylinders (2, on mast)
  g.add(cyl(0.025, 0.025, mastH * 0.8, 8, mHydro, mastX - 0.01, mastH * 0.4 + 0.1, -0.1));
  g.add(cyl(0.025, 0.025, mastH * 0.8, 8, mHydro, mastX - 0.01, mastH * 0.4 + 0.1, 0.1));
  // Cylinder rods (inner, chrome)
  g.add(cyl(0.012, 0.012, mastH * 0.4, 6, M.chrome, mastX - 0.01, mastH * 0.7, -0.1));
  g.add(cyl(0.012, 0.012, mastH * 0.4, 6, M.chrome, mastX - 0.01, mastH * 0.7, 0.1));

  // Tilt cylinder (connects body to mast base)
  g.add(cyl(0.02, 0.02, 0.2, 8, mHydro, 0.2, 0.25, -0.22, 0, 0, 0.3));
  g.add(cyl(0.02, 0.02, 0.2, 8, mHydro, 0.2, 0.25, 0.22, 0, 0, 0.3));

  // Lift chains
  g.add(cyl(0.006, 0.006, mastH * 0.6, 4, mChain, mastX + 0.02, mastH * 0.35 + 0.15, -0.15));
  g.add(cyl(0.006, 0.006, mastH * 0.6, 4, mChain, mastX + 0.02, mastH * 0.35 + 0.15, 0.15));

  // === Fork Carriage ===
  const carriageY = 0.25;
  // Carriage plate
  g.add(box(0.04, 0.3, 0.42, mFrame, mastX + 0.02, carriageY + 0.15, 0));

  // Forks (2 tines)
  const forkLen = 0.6;
  for (const fz of [-0.12, 0.12]) {
    // Vertical heel
    g.add(box(0.04, 0.2, 0.05, mFork, mastX + 0.03, carriageY + 0.1, fz));
    // Horizontal tine
    g.add(box(forkLen, 0.025, 0.08, mFork, mastX + 0.03 + forkLen / 2, carriageY - 0.005, fz));
    // Fork tip taper
    g.add(box(0.06, 0.015, 0.08, mFork, mastX + 0.03 + forkLen + 0.02, carriageY - 0.01, fz));
  }

  // === Wheels ===
  // Front drive wheels (larger)
  const frontWheelR = 0.1;
  g.add(cyl(frontWheelR, frontWheelR, 0.08, 16, M.rubber, 0.15, frontWheelR, 0.32, Math.PI / 2, 0, 0));
  g.add(cyl(frontWheelR, frontWheelR, 0.08, 16, M.rubber, 0.15, frontWheelR, -0.32, Math.PI / 2, 0, 0));
  // Wheel hubs
  g.add(cyl(0.04, 0.04, 0.02, 8, M.chrome, 0.15, frontWheelR, 0.36, Math.PI / 2, 0, 0));
  g.add(cyl(0.04, 0.04, 0.02, 8, M.chrome, 0.15, frontWheelR, -0.36, Math.PI / 2, 0, 0));
  // Lug nuts
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    const nx = Math.cos(angle) * 0.025;
    const ny = Math.sin(angle) * 0.025;
    g.add(cyl(0.005, 0.005, 0.01, 6, M.chrome,
      0.15 + nx, frontWheelR + ny, 0.37, Math.PI / 2, 0, 0));
    g.add(cyl(0.005, 0.005, 0.01, 6, M.chrome,
      0.15 + nx, frontWheelR + ny, -0.37, Math.PI / 2, 0, 0));
  }

  // Rear steer wheels (smaller)
  const rearWheelR = 0.07;
  g.add(cyl(rearWheelR, rearWheelR, 0.06, 12, M.rubber, -0.4, rearWheelR, 0.25, Math.PI / 2, 0, 0));
  g.add(cyl(rearWheelR, rearWheelR, 0.06, 12, M.rubber, -0.4, rearWheelR, -0.25, Math.PI / 2, 0, 0));
  // Rear hubs
  g.add(cyl(0.03, 0.03, 0.02, 8, M.chrome, -0.4, rearWheelR, 0.28, Math.PI / 2, 0, 0));
  g.add(cyl(0.03, 0.03, 0.02, 8, M.chrome, -0.4, rearWheelR, -0.28, Math.PI / 2, 0, 0));

  // === Operator Area ===
  // Seat
  g.add(box(0.2, 0.04, 0.2, mSeat, -0.15, 0.46, 0));        // seat base
  g.add(box(0.2, 0.2, 0.04, mSeat, -0.15, 0.58, -0.08));    // backrest
  // Seat armrests
  g.add(box(0.15, 0.02, 0.03, mFrame, -0.15, 0.52, 0.1));
  g.add(box(0.15, 0.02, 0.03, mFrame, -0.15, 0.52, -0.1));

  // Dashboard
  g.add(box(0.15, 0.12, 0.4, mDash, 0.08, 0.48, 0));
  // Instrument cluster
  g.add(box(0.08, 0.06, 0.15, M.screen, 0.1, 0.56, 0));
  // Steering column
  g.add(cyl(0.015, 0.015, 0.18, 8, mFrame, 0.05, 0.55, 0.12, -0.5, 0, 0));
  // Steering wheel
  g.add(cyl(0.06, 0.06, 0.01, 16, mSeat, 0.02, 0.64, 0.18, -0.5, 0, 0));
  g.add(cyl(0.04, 0.04, 0.012, 16, mat(0x333333, 0.1, 0.8), 0.02, 0.64, 0.18, -0.5, 0, 0));

  // Pedals
  g.add(box(0.06, 0.005, 0.05, mFrame, 0.12, 0.2, -0.05));
  g.add(box(0.06, 0.005, 0.05, mFrame, 0.12, 0.2, 0.05));

  // Hydraulic control levers
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.008, 0.008, 0.12, 6, mFrame, 0.12, 0.52 + i * 0.002, -0.1 - i * 0.035));
    g.add(sph(0.012, mat(0x222222, 0.1, 0.8), 0.12, 0.58, -0.1 - i * 0.035));
  }

  // === LPG Tank (rear) ===
  g.add(cyl(0.08, 0.08, 0.3, 12, mTank, -0.38, 0.55, 0, 0, 0, Math.PI / 2));
  // Tank valve
  g.add(cyl(0.015, 0.015, 0.03, 6, M.chrome, -0.38, 0.64, 0));
  // Tank mounting bracket
  g.add(box(0.04, 0.06, 0.18, mFrame, -0.38, 0.47, 0));

  // === Headlights ===
  g.add(cyl(0.025, 0.025, 0.015, 8, mLens, 0.2, 0.55, 0.25));
  g.add(cyl(0.025, 0.025, 0.015, 8, mLens, 0.2, 0.55, -0.25));
  // Headlight bezels
  g.add(cyl(0.03, 0.03, 0.005, 8, mFrame, 0.2, 0.55, 0.258));
  g.add(cyl(0.03, 0.03, 0.005, 8, mFrame, 0.2, 0.55, -0.258));

  // Tail lights
  g.add(cyl(0.02, 0.02, 0.01, 8, mTailLens, -0.54, 0.45, 0.2));
  g.add(cyl(0.02, 0.02, 0.01, 8, mTailLens, -0.54, 0.45, -0.2));

  // Reverse light
  g.add(box(0.01, 0.03, 0.04, mat(0xffffff, 0.1, 0.3), -0.54, 0.4, 0));

  // === Warning Beacon (on ROPS roof) ===
  g.add(cyl(0.03, 0.02, 0.04, 10, M.orange, -0.07, roofH + 0.03, 0));
  g.add(sph(0.03, mat(0xff8800, 0.1, 0.3, { emissive: 0xff6600, emissiveIntensity: 0.6 }),
    -0.07, roofH + 0.06, 0));

  // === Nameplate / Label ===
  g.add(box(0.12, 0.04, 0.005, mat(0xffffff, 0.1, 0.6), -0.2, 0.42, 0.31));

  // === Exhaust pipe ===
  g.add(cyl(0.015, 0.015, 0.15, 8, mFrame, -0.45, 0.55, -0.22));
  g.add(cyl(0.018, 0.012, 0.02, 8, mFrame, -0.45, 0.63, -0.22));

  // === Status Light ===
  g.add(createStatusLight(-0.07, roofH + 0.1, 0.2));

  return g;
}
