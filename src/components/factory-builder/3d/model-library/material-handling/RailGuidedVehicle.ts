import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Rail-Guided Vehicle (RGV) for AS/RS or shuttle systems
 * Low flat body on rails, two parallel floor rails (I-beam),
 * wheels on rails, roller top conveyor, drive motor housing,
 * sensor array, cable drag chain, bumpers, LED indicators, status light.
 * Footprint: ~1.6 x 0.6 units, height ~0.35 units
 */
export function buildRailGuidedVehicle(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBody     = mat(0x2a3a55, 0.55, 0.4);     // vehicle body blue-steel
  const mFrame    = mat(0x3a4050, 0.7, 0.4);       // steel frame
  const mRail     = mat(0x606878, 0.85, 0.2);      // rail steel
  const mRailBase = mat(0x505560, 0.6, 0.5);       // rail base
  const mMotor    = mat(0x2c3040, 0.6, 0.5);       // motor housing
  const mRoller   = mat(0x555d68, 0.8, 0.25);      // conveyor rollers
  const mSensor   = mat(0x005599, 0.3, 0.4);       // sensor housing
  const mChain    = mat(0x333333, 0.4, 0.6);       // drag chain
  const mBumper   = mat(0xff6600, 0.1, 0.6);       // safety bumper orange
  const mLED      = mat(0x00ccff, 0.1, 0.3, { emissive: 0x0088ff, emissiveIntensity: 1.2 });
  const mLEDAmber = mat(0xffaa00, 0.1, 0.3, { emissive: 0xff8800, emissiveIntensity: 0.8 });
  const mCover    = mat(0x3a4555, 0.5, 0.45);      // cover plates

  // Dimensions
  const bodyL = 1.2;     // body length (X)
  const bodyW = 0.5;     // body width (Z)
  const bodyH = 0.08;    // body thickness
  const railLen = 1.6;   // rail length (X)
  const railSpacing = 0.55; // distance between rail centers (Z)
  const baseY = 0.06;    // base of body (Y)

  // === Floor Rails (2 parallel I-beams) ===
  for (const zSign of [-1, 1]) {
    const rz = zSign * (railSpacing / 2);

    // Top flange (running surface)
    g.add(box(railLen, 0.015, 0.06, mRail, 0, 0.035, rz));
    // Web
    g.add(box(railLen, 0.035, 0.012, mRail, 0, 0.015, rz));
    // Bottom flange
    g.add(box(railLen, 0.012, 0.08, mRailBase, 0, -0.003, rz));

    // Rail clips / fasteners (every 0.25 units)
    for (let i = -3; i <= 3; i++) {
      g.add(box(0.03, 0.012, 0.09, mFrame, i * 0.22, 0.0, rz));
    }

    // Rail end stops
    g.add(box(0.03, 0.04, 0.08, M.red, railLen / 2 - 0.01, 0.02, rz));
    g.add(box(0.03, 0.04, 0.08, M.red, -railLen / 2 + 0.01, 0.02, rz));
  }

  // Rail ties / cross ties
  for (let i = -3; i <= 3; i++) {
    g.add(box(0.04, 0.01, railSpacing + 0.1, mRailBase, i * 0.22, -0.008, 0));
  }

  // === Vehicle Body / Chassis ===
  // Main body plate
  g.add(box(bodyL, bodyH, bodyW, mBody, 0, baseY + bodyH / 2, 0));
  // Top cover plate (slightly inset)
  g.add(box(bodyL - 0.04, 0.01, bodyW - 0.04, mCover, 0, baseY + bodyH + 0.005, 0));
  // Bottom frame rails
  g.add(box(bodyL, 0.02, 0.03, mFrame, 0, baseY - 0.01, -bodyW / 2 + 0.02));
  g.add(box(bodyL, 0.02, 0.03, mFrame, 0, baseY - 0.01, bodyW / 2 - 0.02));
  // Cross members under body
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.02, 0.015, bodyW - 0.04, mFrame, i * 0.22, baseY - 0.01, 0));
  }

  // === Wheels on Rails (4 wheels, 2 per side) ===
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const wx = xSign * (bodyL / 2 - 0.12);
      const wz = zSign * (railSpacing / 2);
      // Wheel
      g.add(cyl(0.03, 0.03, 0.04, 12, M.darkChrome,
        wx, 0.04, wz, Math.PI / 2, 0, 0));
      // Wheel flange (slightly larger, to grip rail)
      g.add(cyl(0.035, 0.035, 0.008, 12, M.chrome,
        wx, 0.04, wz + zSign * 0.02, Math.PI / 2, 0, 0));
      // Axle bearing housing
      g.add(box(0.05, 0.04, 0.03, mFrame, wx, 0.05, wz - zSign * 0.01));
    }
  }

  // Drive axle
  g.add(cyl(0.01, 0.01, railSpacing + 0.06, 6, M.chrome,
    bodyL / 2 - 0.12, 0.04, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.01, 0.01, railSpacing + 0.06, 6, M.chrome,
    -bodyL / 2 + 0.12, 0.04, 0, Math.PI / 2, 0, 0));

  // === Roller Top Conveyor Section ===
  const conveyorL = 0.8;
  const conveyorW = 0.4;
  const conveyorY = baseY + bodyH + 0.01;

  // Conveyor side rails
  g.add(box(conveyorL, 0.035, 0.02, mFrame, 0, conveyorY + 0.018, -conveyorW / 2));
  g.add(box(conveyorL, 0.035, 0.02, mFrame, 0, conveyorY + 0.018, conveyorW / 2));

  // Rollers (10 rollers)
  const rollerCount = 10;
  for (let i = 0; i < rollerCount; i++) {
    const rx = -conveyorL / 2 + 0.05 + (conveyorL - 0.1) / (rollerCount - 1) * i;
    g.add(cyl(0.015, 0.015, conveyorW - 0.04, 8, mRoller,
      rx, conveyorY + 0.035, 0, Math.PI / 2, 0, 0));
    // Shaft ends
    g.add(cyl(0.006, 0.006, 0.01, 6, M.chrome,
      rx, conveyorY + 0.035, -conveyorW / 2 + 0.01, Math.PI / 2, 0, 0));
    g.add(cyl(0.006, 0.006, 0.01, 6, M.chrome,
      rx, conveyorY + 0.035, conveyorW / 2 - 0.01, Math.PI / 2, 0, 0));
  }

  // Conveyor drive motor (small, under conveyor)
  g.add(box(0.06, 0.04, 0.05, mMotor, conveyorL / 2 - 0.05, baseY + 0.04, conveyorW / 2 + 0.04));
  g.add(cyl(0.01, 0.01, 0.03, 6, M.chrome,
    conveyorL / 2 - 0.05, conveyorY + 0.02, conveyorW / 2 + 0.015, Math.PI / 2, 0, 0));

  // Guide rails on conveyor
  g.add(box(conveyorL - 0.06, 0.02, 0.005, mFrame, 0, conveyorY + 0.045, -conveyorW / 2 + 0.03));
  g.add(box(conveyorL - 0.06, 0.02, 0.005, mFrame, 0, conveyorY + 0.045, conveyorW / 2 - 0.03));

  // === Drive Motor Housing (main travel drive) ===
  g.add(box(0.12, 0.06, 0.1, mMotor, -bodyL / 2 + 0.15, baseY + 0.01, -bodyW / 2 + 0.08));
  // Motor shaft to wheel
  g.add(cyl(0.012, 0.012, 0.05, 6, M.chrome,
    -bodyL / 2 + 0.12, 0.04, -railSpacing / 2 + 0.04, Math.PI / 2, 0, 0));
  // Motor end cap
  g.add(cyl(0.03, 0.03, 0.01, 8, M.yellow,
    -bodyL / 2 + 0.15, baseY + 0.04, -bodyW / 2 + 0.025));
  // Motor terminal box
  g.add(box(0.04, 0.03, 0.03, mMotor, -bodyL / 2 + 0.15, baseY + 0.07, -bodyW / 2 + 0.08));

  // === Sensor Arrays (front and rear) ===
  for (const xSign of [-1, 1]) {
    const sx = xSign * (bodyL / 2 + 0.01);
    // Sensor bracket plate
    g.add(box(0.02, 0.04, bodyW - 0.1, mFrame, sx, baseY + bodyH / 2, 0));

    // Proximity sensor (center)
    g.add(cyl(0.015, 0.015, 0.025, 8, mSensor,
      sx + xSign * 0.015, baseY + bodyH / 2, 0, 0, 0, Math.PI / 2));
    // Sensor LED
    g.add(cyl(0.008, 0.008, 0.003, 6, mLED,
      sx + xSign * 0.028, baseY + bodyH / 2, 0, 0, 0, Math.PI / 2));

    // Photo-eye sensors (left/right pair)
    g.add(cyl(0.01, 0.01, 0.02, 6, mSensor,
      sx + xSign * 0.012, baseY + bodyH / 2, -0.12, 0, 0, Math.PI / 2));
    g.add(cyl(0.01, 0.01, 0.02, 6, mSensor,
      sx + xSign * 0.012, baseY + bodyH / 2, 0.12, 0, 0, Math.PI / 2));

    // Barcode / QR reader (one end)
    if (xSign === 1) {
      g.add(box(0.02, 0.025, 0.04, mat(0x111111, 0.3, 0.6),
        sx + 0.01, baseY - 0.01, 0));
      // Reader window
      g.add(box(0.005, 0.015, 0.025,
        mat(0x880000, 0.1, 0.3, { emissive: 0xff0000, emissiveIntensity: 0.5 }),
        sx + 0.022, baseY - 0.01, 0));
    }
  }

  // === Cable Drag Chain ===
  const chainStartX = -bodyL / 2 + 0.1;
  const chainEndX = -bodyL / 2 - 0.3;
  const chainY = baseY - 0.02;
  const chainSegments = 8;
  for (let i = 0; i < chainSegments; i++) {
    const cx = chainStartX + (chainEndX - chainStartX) * (i / chainSegments);
    // Chain link
    g.add(box(0.04, 0.02, 0.04, mChain, cx, chainY, -bodyW / 2 - 0.03));
    // Link side plates
    g.add(box(0.005, 0.025, 0.045, mChain, cx - 0.018, chainY, -bodyW / 2 - 0.03));
    g.add(box(0.005, 0.025, 0.045, mChain, cx + 0.018, chainY, -bodyW / 2 - 0.03));
  }
  // Drag chain trough
  g.add(box(0.5, 0.005, 0.05, mFrame, chainStartX - 0.15, chainY - 0.015, -bodyW / 2 - 0.03));
  // Cable bundle visible in chain
  g.add(cyl(0.008, 0.008, 0.35, 4, M.wire,
    (chainStartX + chainEndX) / 2, chainY, -bodyW / 2 - 0.03, 0, 0, Math.PI / 2));
  g.add(cyl(0.006, 0.006, 0.35, 4, mat(0x224488, 0.1, 0.7),
    (chainStartX + chainEndX) / 2, chainY + 0.005, -bodyW / 2 - 0.025, 0, 0, Math.PI / 2));

  // === Bumpers at Both Ends ===
  for (const xSign of [-1, 1]) {
    const bx = xSign * (bodyL / 2 + 0.025);
    // Bumper body
    g.add(box(0.04, 0.06, bodyW + 0.02, mBumper, bx, baseY + bodyH / 2, 0));
    // Rubber cushion
    g.add(box(0.015, 0.05, bodyW - 0.02, M.rubber, bx + xSign * 0.025, baseY + bodyH / 2, 0));
    // Bumper mounting bolts
    g.add(cyl(0.006, 0.006, 0.01, 6, M.chrome, bx - xSign * 0.01, baseY + 0.08, bodyW / 4));
    g.add(cyl(0.006, 0.006, 0.01, 6, M.chrome, bx - xSign * 0.01, baseY + 0.08, -bodyW / 4));
  }

  // === LED Indicator Strips (both sides) ===
  for (const zSign of [-1, 1]) {
    const lz = zSign * (bodyW / 2 + 0.005);
    // Main LED strip
    g.add(box(bodyL - 0.15, 0.008, 0.006, mLED, 0, baseY + bodyH, lz));
    // Individual LED dots along strip
    for (let i = 0; i < 8; i++) {
      const lx = -bodyL / 2 + 0.12 + i * (bodyL - 0.24) / 7;
      g.add(sph(0.005, mLED, lx, baseY + bodyH + 0.006, lz));
    }
  }
  // Front/rear status LEDs
  for (const xSign of [-1, 1]) {
    g.add(sph(0.008, mLEDAmber, xSign * (bodyL / 2 - 0.03), baseY + bodyH + 0.01, 0));
  }

  // === Control Electronics Box ===
  g.add(box(0.1, 0.04, 0.08, mCover, bodyL / 4, baseY + bodyH + 0.02, bodyW / 2 - 0.08));
  // Connector ports
  g.add(cyl(0.008, 0.008, 0.005, 6, M.chrome, bodyL / 4 - 0.02, baseY + bodyH + 0.04, bodyW / 2 - 0.04));
  g.add(cyl(0.008, 0.008, 0.005, 6, M.chrome, bodyL / 4 + 0.02, baseY + bodyH + 0.04, bodyW / 2 - 0.04));

  // === Battery / Power Unit ===
  g.add(box(0.15, 0.05, 0.12, mMotor, bodyL / 4, baseY + 0.015, 0));
  // Battery vent
  g.add(box(0.08, 0.005, 0.08, mat(0x444444, 0.3, 0.7), bodyL / 4, baseY + 0.043, 0));

  // === Nameplate ===
  g.add(box(0.06, 0.02, 0.005, mat(0xcccccc, 0.5, 0.4), 0, baseY + bodyH + 0.01, bodyW / 2 + 0.005));

  // === Status Light ===
  g.add(createStatusLight(0, baseY + bodyH + 0.01, -bodyW / 2 + 0.05));

  return g;
}
