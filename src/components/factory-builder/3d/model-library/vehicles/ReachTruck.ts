import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Narrow-Aisle Reach Truck
 * Straddle legs, double-stage mast, fork carriage, standing operator
 * compartment, overhead guard, battery counterweight, reach pantograph.
 * Footprint: ~1.2 x 0.7 units, height ~2.2 (mast extended)
 */
export function buildReachTruck(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBody    = mat(0xcc4400, 0.3, 0.5);      // orange body
  const mBodyDk  = mat(0x993300, 0.35, 0.55);     // darker accent
  const mFrame   = mat(0x3a4050, 0.75, 0.35);     // structural steel
  const mMast    = mat(0x556070, 0.7, 0.3);       // mast channel steel
  const mFork    = mat(0x606878, 0.8, 0.25);      // fork steel
  const mBatt    = mat(0x1a1a1a, 0.2, 0.7);       // battery
  const mGuard   = mat(0x444c58, 0.65, 0.4);      // overhead guard
  const mSeat    = mat(0x222222, 0.0, 0.85);       // operator pad
  const mDash    = mat(0x333333, 0.2, 0.7);        // dashboard
  const mHydro   = mat(0xb0b8c0, 0.85, 0.15);     // hydraulic
  const mWarn    = mat(0xffcc00, 0.0, 0.3, { emissive: 0xffaa00, emissiveIntensity: 1.2 });

  // Faces +X (forks forward)

  // ============ STRADDLE LEGS (extending forward) ============
  const legLen = 0.6;
  const legW = 0.06;
  const legH = 0.07;
  const legSpacing = 0.28;

  // Left straddle leg
  g.add(box(legLen, legH, legW, mFrame, 0.15, 0.035, legSpacing));
  g.add(box(legLen, 0.005, legW + 0.01, mBodyDk, 0.15, legH + 0.002, legSpacing));

  // Right straddle leg
  g.add(box(legLen, legH, legW, mFrame, 0.15, 0.035, -legSpacing));
  g.add(box(legLen, 0.005, legW + 0.01, mBodyDk, 0.15, legH + 0.002, -legSpacing));

  // Leg cross brace
  g.add(box(0.04, 0.05, legSpacing * 2, mFrame, -0.12, 0.045, 0));

  // ============ STRADDLE LEG WHEELS ============
  const legWheelR = 0.03;
  // Front left
  g.add(cyl(legWheelR, legWheelR, 0.04, 10, M.rubber, 0.4, 0.03, legSpacing, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.03, 8, M.darkChrome, 0.4, 0.03, legSpacing, Math.PI / 2, 0, 0));
  // Front right
  g.add(cyl(legWheelR, legWheelR, 0.04, 10, M.rubber, 0.4, 0.03, -legSpacing, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.03, 8, M.darkChrome, 0.4, 0.03, -legSpacing, Math.PI / 2, 0, 0));

  // ============ DRIVE WHEELS (front, larger) ============
  const driveR = 0.06;
  g.add(cyl(driveR, driveR, 0.05, 14, M.rubber, -0.08, 0.06, 0.25, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.035, 10, M.darkChrome, -0.08, 0.06, 0.25, Math.PI / 2, 0, 0));
  g.add(cyl(driveR, driveR, 0.05, 14, M.rubber, -0.08, 0.06, -0.25, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.035, 10, M.darkChrome, -0.08, 0.06, -0.25, Math.PI / 2, 0, 0));

  // ============ REAR STEER WHEEL ============
  const rearR = 0.045;
  g.add(cyl(rearR, rearR, 0.04, 12, M.rubber, -0.42, 0.045, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.025, 0.025, 0.03, 8, M.darkChrome, -0.42, 0.045, 0, Math.PI / 2, 0, 0));
  // Steer pivot
  g.add(cyl(0.015, 0.015, 0.06, 8, mFrame, -0.42, 0.08, 0));

  // ============ BATTERY COMPARTMENT (rear counterweight) ============
  g.add(box(0.25, 0.2, 0.42, mBatt, -0.35, 0.17, 0));
  g.add(box(0.26, 0.01, 0.43, mFrame, -0.35, 0.275, 0));
  // Battery terminals
  g.add(cyl(0.01, 0.01, 0.015, 8, M.chrome, -0.28, 0.285, 0.1));
  g.add(cyl(0.01, 0.01, 0.015, 8, M.chrome, -0.28, 0.285, -0.1));
  // Battery cables
  g.add(cyl(0.006, 0.006, 0.06, 6, M.red, -0.28, 0.3, 0.08, 0.4, 0, 0));
  g.add(cyl(0.006, 0.006, 0.06, 6, M.wire, -0.28, 0.3, -0.08, 0.4, 0, 0));
  // Battery label plates
  g.add(box(0.08, 0.05, 0.005, mat(0x992200, 0.1, 0.6), -0.35, 0.17, 0.215));
  g.add(box(0.08, 0.05, 0.005, mat(0x992200, 0.1, 0.6), -0.35, 0.17, -0.215));

  // ============ OPERATOR COMPARTMENT (standing position) ============
  // Floor plate
  g.add(box(0.3, 0.015, 0.4, mat(0x444444, 0.5, 0.5), -0.15, 0.28, 0));
  // Floor texture ridges
  for (let x = -0.26; x <= -0.04; x += 0.04) {
    g.add(box(0.03, 0.003, 0.36, mat(0x555555, 0.4, 0.5), x, 0.29, 0));
  }
  // Back pad / lean pad
  g.add(box(0.03, 0.3, 0.3, mSeat, -0.46, 0.43, 0));
  // Side hip pads
  g.add(box(0.15, 0.15, 0.02, mSeat, -0.2, 0.38, 0.2));
  g.add(box(0.15, 0.15, 0.02, mSeat, -0.2, 0.38, -0.2));

  // ============ BODY PANELS ============
  // Main body sides
  g.add(box(0.35, 0.15, 0.02, mBody, -0.15, 0.2, 0.22));
  g.add(box(0.35, 0.15, 0.02, mBody, -0.15, 0.2, -0.22));
  // Front cowl
  g.add(box(0.05, 0.18, 0.44, mBody, -0.02, 0.2, 0));
  // Rear panel
  g.add(box(0.02, 0.2, 0.44, mBodyDk, -0.47, 0.2, 0));

  // ============ DASHBOARD / CONTROLS ============
  g.add(box(0.08, 0.06, 0.2, mDash, -0.0, 0.34, 0));
  // Screen
  g.add(box(0.005, 0.035, 0.06, M.screen, 0.04, 0.35, 0));
  // Joystick controls (2)
  g.add(cyl(0.008, 0.008, 0.05, 6, mFrame, 0.02, 0.39, 0.06));
  g.add(sph(0.012, M.rubber, 0.02, 0.42, 0.06));
  g.add(cyl(0.008, 0.008, 0.05, 6, mFrame, 0.02, 0.39, -0.06));
  g.add(sph(0.012, M.rubber, 0.02, 0.42, -0.06));
  // Indicator LEDs
  g.add(sph(0.005, mat(0x00ff00, 0.0, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }), 0.042, 0.36, -0.04));
  g.add(sph(0.005, mat(0xff8800, 0.0, 0.3, { emissive: 0xff6600, emissiveIntensity: 0.5 }), 0.042, 0.36, 0.04));

  // ============ STEERING TILLER ============
  g.add(cyl(0.01, 0.01, 0.12, 8, mFrame, -0.05, 0.4, -0.12, 0.5, 0, 0));
  g.add(cyl(0.035, 0.035, 0.01, 12, M.rubber, -0.08, 0.47, -0.12, 0.5, 0, 0));

  // ============ MAST ASSEMBLY (double stage) ============
  const mastBaseY = 0.08;
  const mastH1 = 1.0;  // outer stage
  const mastH2 = 0.8;  // inner stage
  const mastX = 0.2;

  // Outer mast channels (left/right)
  g.add(box(0.04, mastH1, 0.04, mMast, mastX, mastBaseY + mastH1 / 2, 0.15));
  g.add(box(0.04, mastH1, 0.04, mMast, mastX, mastBaseY + mastH1 / 2, -0.15));
  // Outer mast cross braces
  g.add(box(0.02, 0.03, 0.3, mFrame, mastX, mastBaseY + 0.1, 0));
  g.add(box(0.02, 0.03, 0.3, mFrame, mastX, mastBaseY + mastH1 - 0.05, 0));

  // Inner mast channels
  g.add(box(0.03, mastH2, 0.03, mHydro, mastX, mastBaseY + mastH1 / 2 + 0.2, 0.12));
  g.add(box(0.03, mastH2, 0.03, mHydro, mastX, mastBaseY + mastH1 / 2 + 0.2, -0.12));

  // Mast hydraulic cylinder (center)
  g.add(cyl(0.02, 0.02, mastH1 * 0.7, 10, mHydro, mastX, mastBaseY + mastH1 * 0.4, 0));
  g.add(cyl(0.012, 0.012, mastH1 * 0.4, 8, M.chrome, mastX, mastBaseY + mastH1 * 0.7, 0));

  // Hydraulic hose on mast
  g.add(cyl(0.006, 0.006, mastH1, 6, M.wire, mastX + 0.025, mastBaseY + mastH1 / 2, 0.15));

  // ============ FORK CARRIAGE ============
  const carrY = mastBaseY + 0.4;
  // Carriage plate
  g.add(box(0.03, 0.2, 0.28, mFrame, mastX, carrY, 0));
  // Carriage rollers (4)
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, mastX, carrY + 0.08, 0.13, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, mastX, carrY - 0.08, 0.13, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, mastX, carrY + 0.08, -0.13, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, mastX, carrY - 0.08, -0.13, Math.PI / 2, 0, 0));

  // Forks
  const fkLen = 0.5;
  g.add(box(fkLen, 0.025, 0.06, mFork, mastX + fkLen / 2 + 0.02, carrY - 0.11, 0.1));
  g.add(box(fkLen, 0.025, 0.06, mFork, mastX + fkLen / 2 + 0.02, carrY - 0.11, -0.1));
  // Fork hooks (vertical part)
  g.add(box(0.025, 0.1, 0.06, mFork, mastX + 0.03, carrY - 0.05, 0.1));
  g.add(box(0.025, 0.1, 0.06, mFork, mastX + 0.03, carrY - 0.05, -0.1));

  // ============ REACH MECHANISM (pantograph) ============
  // Pantograph arms (X-pattern linkage)
  const pantoY = 0.08;
  g.add(box(0.15, 0.02, 0.02, mFrame, 0.08, pantoY + 0.03, 0.18, 0, 0, 0.2));
  g.add(box(0.15, 0.02, 0.02, mFrame, 0.08, pantoY + 0.03, -0.18, 0, 0, 0.2));
  g.add(box(0.15, 0.02, 0.02, mFrame, 0.08, pantoY + 0.07, 0.18, 0, 0, -0.2));
  g.add(box(0.15, 0.02, 0.02, mFrame, 0.08, pantoY + 0.07, -0.18, 0, 0, -0.2));
  // Pantograph pivot pins
  g.add(cyl(0.006, 0.006, 0.03, 6, M.chrome, 0.08, pantoY + 0.05, 0.18, Math.PI / 2, 0, 0));
  g.add(cyl(0.006, 0.006, 0.03, 6, M.chrome, 0.08, pantoY + 0.05, -0.18, Math.PI / 2, 0, 0));

  // ============ OVERHEAD GUARD ============
  // Vertical posts (4)
  g.add(cyl(0.015, 0.015, 0.5, 8, mGuard, -0.02, 0.55, 0.2));
  g.add(cyl(0.015, 0.015, 0.5, 8, mGuard, -0.02, 0.55, -0.2));
  g.add(cyl(0.015, 0.015, 0.5, 8, mGuard, -0.35, 0.55, 0.2));
  g.add(cyl(0.015, 0.015, 0.5, 8, mGuard, -0.35, 0.55, -0.2));
  // Roof bars
  g.add(box(0.33, 0.015, 0.015, mGuard, -0.18, 0.8, 0.2));
  g.add(box(0.33, 0.015, 0.015, mGuard, -0.18, 0.8, -0.2));
  g.add(box(0.015, 0.015, 0.4, mGuard, -0.02, 0.8, 0));
  g.add(box(0.015, 0.015, 0.4, mGuard, -0.35, 0.8, 0));
  // Roof mesh bars
  for (let x = -0.3; x <= 0.0; x += 0.08) {
    g.add(box(0.01, 0.008, 0.38, mGuard, x, 0.8, 0));
  }

  // ============ WARNING LIGHTS ============
  // Front warning light
  g.add(cyl(0.02, 0.02, 0.01, 10, mWarn, 0.0, 0.28, 0.23));
  // Rear warning light
  g.add(cyl(0.02, 0.02, 0.01, 10, mat(0xff2200, 0.0, 0.3, { emissive: 0xff1100, emissiveIntensity: 0.7 }), -0.47, 0.35, 0));
  // Beacon on guard
  g.add(sph(0.02, mWarn, -0.18, 0.83, 0));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(-0.35, 0.82, 0));

  return g;
}
