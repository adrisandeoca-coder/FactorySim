import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Vertical Reciprocating Conveyor / Lift (Elevator)
 * Steel frame with 4 vertical columns, lifting platform/carriage,
 * guide rails, chain/belt drive, motor drive at top,
 * safety gates (mesh panels), limit switches, cable tray,
 * warning labels, status light.
 * Footprint: ~1.0 x 0.8 units, height ~2.2 units
 */
export function buildElevator(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame    = mat(0x4a5060, 0.75, 0.35);    // structural steel
  const mColumn   = mat(0x556070, 0.7, 0.3);       // vertical columns
  const mPlatform = mat(0x505868, 0.65, 0.4);      // lift platform
  const mRail     = mat(0x707888, 0.85, 0.2);      // guide rails
  const mMotor    = mat(0x2c3040, 0.6, 0.5);       // motor housing
  const mChain    = mat(0x606060, 0.7, 0.35);      // chain drive
  const mGate     = mat(0x555555, 0.4, 0.5, { transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const mGateFrame = mat(0x4a5060, 0.7, 0.4);      // gate frame
  const mCableTray = mat(0x444a54, 0.5, 0.5);      // cable tray
  const mBumper   = mat(0xddaa00, 0.2, 0.6);       // limit switch bumpers
  const mWarning  = mat(0xdd0000, 0.1, 0.5);       // warning labels

  // Dimensions
  const frameW = 0.9;    // width (X)
  const frameD = 0.7;    // depth (Z)
  const frameH = 2.2;    // total height (Y)
  const colSize = 0.06;  // column cross-section
  const platW = 0.7;     // platform width
  const platD = 0.55;    // platform depth
  const platY = 0.6;     // platform current position

  // === Base Frame ===
  // Bottom frame rails
  g.add(box(frameW, 0.04, 0.05, mFrame, 0, 0.02, -frameD / 2));
  g.add(box(frameW, 0.04, 0.05, mFrame, 0, 0.02, frameD / 2));
  g.add(box(0.05, 0.04, frameD, mFrame, -frameW / 2, 0.02, 0));
  g.add(box(0.05, 0.04, frameD, mFrame, frameW / 2, 0.02, 0));
  // Leveling feet
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      g.add(cyl(0.03, 0.03, 0.01, 8, M.darkChrome,
        xSign * (frameW / 2 - 0.05), 0.005, zSign * (frameD / 2 - 0.05)));
    }
  }

  // === 4 Vertical Columns ===
  const colPositions: [number, number][] = [
    [-frameW / 2, -frameD / 2],
    [frameW / 2, -frameD / 2],
    [-frameW / 2, frameD / 2],
    [frameW / 2, frameD / 2],
  ];
  for (const [cx, cz] of colPositions) {
    // Main column
    g.add(box(colSize, frameH, colSize, mColumn, cx, frameH / 2, cz));
    // Column base gusset plates
    g.add(box(colSize + 0.04, 0.12, 0.02, mFrame, cx, 0.1, cz));
    g.add(box(0.02, 0.12, colSize + 0.04, mFrame, cx, 0.1, cz));
  }

  // === Horizontal Cross Braces ===
  // Top frame
  g.add(box(frameW, 0.04, 0.05, mFrame, 0, frameH - 0.02, -frameD / 2));
  g.add(box(frameW, 0.04, 0.05, mFrame, 0, frameH - 0.02, frameD / 2));
  g.add(box(0.05, 0.04, frameD, mFrame, -frameW / 2, frameH - 0.02, 0));
  g.add(box(0.05, 0.04, frameD, mFrame, frameW / 2, frameH - 0.02, 0));

  // Mid-height braces (back and sides)
  const midH = frameH * 0.55;
  g.add(box(frameW, 0.03, 0.04, mFrame, 0, midH, -frameD / 2));
  g.add(box(0.04, 0.03, frameD, mFrame, -frameW / 2, midH, 0));
  g.add(box(0.04, 0.03, frameD, mFrame, frameW / 2, midH, 0));

  // X-bracing on back panel
  g.add(box(0.025, frameH * 0.48, 0.02, mFrame,
    -frameW / 4, frameH * 0.25, -frameD / 2, 0, 0, 0.25));
  g.add(box(0.025, frameH * 0.48, 0.02, mFrame,
    frameW / 4, frameH * 0.25, -frameD / 2, 0, 0, -0.25));
  g.add(box(0.025, frameH * 0.48, 0.02, mFrame,
    -frameW / 4, frameH * 0.75, -frameD / 2, 0, 0, -0.25));
  g.add(box(0.025, frameH * 0.48, 0.02, mFrame,
    frameW / 4, frameH * 0.75, -frameD / 2, 0, 0, 0.25));

  // === Guide Rails on Columns (inner face) ===
  // Machined guide rails for carriage
  for (const [cx, cz] of colPositions) {
    const railOffX = cx > 0 ? -0.04 : 0.04;
    const railOffZ = cz > 0 ? -0.04 : 0.04;
    g.add(box(0.015, frameH - 0.2, 0.02, mRail, cx + railOffX, frameH / 2, cz));
    g.add(box(0.02, frameH - 0.2, 0.015, mRail, cx, frameH / 2, cz + railOffZ));
  }

  // === Lifting Platform / Carriage ===
  // Platform base plate
  g.add(box(platW, 0.035, platD, mPlatform, 0, platY, 0));
  // Platform ribs (underneath)
  g.add(box(platW, 0.02, 0.03, mFrame, 0, platY - 0.025, -platD / 4));
  g.add(box(platW, 0.02, 0.03, mFrame, 0, platY - 0.025, platD / 4));
  g.add(box(0.03, 0.02, platD, mFrame, -platW / 4, platY - 0.025, 0));
  g.add(box(0.03, 0.02, platD, mFrame, platW / 4, platY - 0.025, 0));

  // Diamond plate surface texture (decorative strips)
  for (let i = 0; i < 7; i++) {
    g.add(box(platW - 0.05, 0.003, 0.01, mat(0x666666, 0.6, 0.4),
      0, platY + 0.02, -platD / 2 + 0.06 + i * 0.08));
  }

  // Carriage guide shoes (ride on rails, 4 corners)
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      g.add(box(0.04, 0.08, 0.04, mFrame,
        xSign * (platW / 2 + 0.02), platY, zSign * (platD / 2 + 0.02)));
    }
  }

  // Safety lip / edge on platform
  g.add(box(platW, 0.03, 0.01, mBumper, 0, platY + 0.03, platD / 2));
  g.add(box(platW, 0.03, 0.01, mBumper, 0, platY + 0.03, -platD / 2));

  // === Chain Drive Mechanism (one side) ===
  // Drive chain (vertical run)
  const chainX = frameW / 2 - 0.02;
  const chainZ = 0;
  g.add(cyl(0.01, 0.01, frameH - 0.3, 4, mChain, chainX, frameH / 2, chainZ));
  // Chain return (second run)
  g.add(cyl(0.01, 0.01, frameH - 0.3, 4, mChain, chainX - 0.04, frameH / 2, chainZ));

  // Upper sprocket
  g.add(cyl(0.04, 0.04, 0.025, 12, M.darkChrome,
    chainX - 0.02, frameH - 0.12, chainZ, Math.PI / 2, 0, 0));
  // Lower sprocket
  g.add(cyl(0.035, 0.035, 0.025, 12, M.darkChrome,
    chainX - 0.02, 0.12, chainZ, Math.PI / 2, 0, 0));
  // Sprocket teeth (decorative)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    g.add(sph(0.006, M.darkChrome,
      chainX - 0.02 + Math.cos(angle) * 0.04,
      frameH - 0.12 + Math.sin(angle) * 0.04,
      chainZ));
  }

  // Chain guard cover
  g.add(box(0.08, frameH - 0.4, 0.04, mat(0x444a54, 0.5, 0.5, { transparent: true, opacity: 0.5 }),
    chainX - 0.02, frameH / 2, chainZ + 0.03));

  // Chain attachment bracket on platform
  g.add(box(0.04, 0.06, 0.03, mFrame, platW / 2 + 0.01, platY, 0));

  // === Motor Drive Unit at Top ===
  // Motor housing
  g.add(box(0.2, 0.15, 0.18, mMotor, chainX - 0.1, frameH + 0.07, chainZ));
  // Motor shaft
  g.add(cyl(0.02, 0.02, 0.06, 8, M.chrome,
    chainX - 0.02, frameH + 0.07, chainZ, Math.PI / 2, 0, 0));
  // Motor fan end
  g.add(cyl(0.05, 0.05, 0.03, 12, mFrame, chainX - 0.22, frameH + 0.07, chainZ, 0, 0, Math.PI / 2));
  // Motor terminal box
  g.add(box(0.06, 0.06, 0.05, mMotor, chainX - 0.1, frameH + 0.17, chainZ + 0.05));
  // Motor mounting plate
  g.add(box(0.25, 0.02, 0.2, mFrame, chainX - 0.1, frameH - 0.01, chainZ));
  // Gear reducer
  g.add(box(0.08, 0.1, 0.1, mMotor, chainX - 0.02, frameH + 0.02, chainZ));

  // === Safety Gates (front entry/exit) ===
  // Lower gate (at floor level)
  const gateW = frameW - colSize * 2 - 0.04;
  const gateH = 0.5;
  // Gate frame
  g.add(box(gateW, 0.02, 0.02, mGateFrame, 0, gateH, frameD / 2));
  g.add(box(gateW, 0.02, 0.02, mGateFrame, 0, 0.06, frameD / 2));
  g.add(box(0.02, gateH - 0.06, 0.02, mGateFrame, -gateW / 2, gateH / 2 + 0.03, frameD / 2));
  g.add(box(0.02, gateH - 0.06, 0.02, mGateFrame, gateW / 2, gateH / 2 + 0.03, frameD / 2));
  // Mesh panel
  g.add(box(gateW - 0.04, gateH - 0.08, 0.005, mGate, 0, gateH / 2 + 0.02, frameD / 2));

  // Upper gate (at upper level)
  const upperGateY = 1.5;
  g.add(box(gateW, 0.02, 0.02, mGateFrame, 0, upperGateY + gateH, frameD / 2));
  g.add(box(gateW, 0.02, 0.02, mGateFrame, 0, upperGateY, frameD / 2));
  g.add(box(0.02, gateH, 0.02, mGateFrame, -gateW / 2, upperGateY + gateH / 2, frameD / 2));
  g.add(box(0.02, gateH, 0.02, mGateFrame, gateW / 2, upperGateY + gateH / 2, frameD / 2));
  g.add(box(gateW - 0.04, gateH - 0.04, 0.005, mGate, 0, upperGateY + gateH / 2, frameD / 2));

  // Gate hinges
  for (const gy of [0.15, gateH - 0.05]) {
    g.add(cyl(0.008, 0.008, 0.03, 6, M.chrome,
      -gateW / 2 - 0.01, gy, frameD / 2, Math.PI / 2, 0, 0));
  }

  // Side panels (mesh) on both sides
  for (const xSign of [-1, 1]) {
    g.add(box(0.005, frameH - 0.2, frameD - colSize * 2, mGate,
      xSign * frameW / 2, frameH / 2, 0));
  }
  // Back panel (mesh)
  g.add(box(frameW - colSize * 2, frameH - 0.2, 0.005, mGate,
    0, frameH / 2, -frameD / 2));

  // === Limit Switch Bumpers (top and bottom) ===
  // Bottom bumper
  g.add(box(0.15, 0.04, 0.12, mBumper, 0, 0.06, 0));
  g.add(box(0.1, 0.02, 0.08, M.rubber, 0, 0.085, 0));
  // Top limit switch
  g.add(box(0.04, 0.04, 0.04, mWarning, chainX - 0.15, frameH - 0.08, -frameD / 2 + 0.05));
  g.add(cyl(0.003, 0.003, 0.04, 6, M.chrome,
    chainX - 0.15, frameH - 0.06, -frameD / 2 + 0.08, Math.PI / 2, 0, 0));
  // Bottom limit switch
  g.add(box(0.04, 0.04, 0.04, mWarning, chainX - 0.15, 0.08, -frameD / 2 + 0.05));
  g.add(cyl(0.003, 0.003, 0.04, 6, M.chrome,
    chainX - 0.15, 0.1, -frameD / 2 + 0.08, Math.PI / 2, 0, 0));

  // === Cable Tray on Side ===
  const trayX = -frameW / 2 - 0.04;
  g.add(box(0.06, frameH * 0.7, 0.005, mCableTray, trayX, frameH * 0.45, -frameD / 4));
  g.add(box(0.005, frameH * 0.7, 0.05, mCableTray, trayX - 0.03, frameH * 0.45, -frameD / 4));
  g.add(box(0.005, frameH * 0.7, 0.05, mCableTray, trayX + 0.03, frameH * 0.45, -frameD / 4));
  // Cables in tray
  g.add(cyl(0.008, 0.008, frameH * 0.65, 4, M.wire, trayX - 0.01, frameH * 0.45, -frameD / 4));
  g.add(cyl(0.008, 0.008, frameH * 0.65, 4, mat(0x224488, 0.1, 0.7),
    trayX + 0.01, frameH * 0.45, -frameD / 4));
  // Tray mounting brackets
  for (let i = 0; i < 4; i++) {
    g.add(box(0.04, 0.02, 0.04, mFrame, trayX, 0.3 + i * 0.45, -frameD / 4));
  }

  // === Warning Labels ===
  // "DANGER" label on front columns
  g.add(box(0.08, 0.04, 0.005, mWarning, -frameW / 2, 1.0, frameD / 2 + 0.003));
  g.add(box(0.08, 0.04, 0.005, mWarning, frameW / 2, 1.0, frameD / 2 + 0.003));
  // Caution stripes at entry
  for (let s = 0; s < 4; s++) {
    const stripeMat = s % 2 === 0 ? mBumper : mat(0x222222, 0.1, 0.8);
    g.add(box(0.015, 0.04, colSize + 0.01, stripeMat,
      -frameW / 2, 0.5 + s * 0.04, frameD / 2));
    g.add(box(0.015, 0.04, colSize + 0.01, stripeMat,
      frameW / 2, 0.5 + s * 0.04, frameD / 2));
  }

  // === Status Light ===
  g.add(createStatusLight(frameW / 2 + 0.05, frameH - 0.3, frameD / 2));

  return g;
}
