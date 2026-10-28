import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Slat / Chain Conveyor
 * Heavy steel frame with two parallel chains, slat flights,
 * drive/idler sprockets, chain guides, drive motor with guard,
 * support cross braces, chain tensioner, status light.
 * Footprint: ~2.0 x 0.7 units, height ~0.45 units
 */
export function buildChainConveyor(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame    = mat(0x3e4855, 0.75, 0.35);   // heavy steel frame
  const mChain    = mat(0x3a3a3a, 0.70, 0.40);   // chain links
  const mSlat     = mat(0x4a5565, 0.65, 0.45);   // slat plates
  const mSprocket = mat(0x505868, 0.80, 0.25);   // sprockets
  const mMotor    = mat(0x2c3040, 0.60, 0.50);   // motor housing
  const mGuard    = mat(0xddaa00, 0.20, 0.55);   // safety guard yellow
  const mTrack    = mat(0x555d68, 0.75, 0.30);   // chain track/guide
  const mFoot     = mat(0x404550, 0.65, 0.50);   // feet

  // Dimensions
  const convL     = 2.0;
  const convW     = 0.55;   // width between chain tracks
  const frameH    = 0.08;
  const baseY     = 0.28;   // slat surface height
  const slatCount = 18;     // number of slat flights

  // === Heavy Steel Frame (side channels) ===
  // Left side channel
  g.add(box(convL, frameH, 0.05, mFrame, 0, baseY - 0.06, -convW / 2 - 0.025));
  g.add(box(convL, 0.015, 0.04, mFrame, 0, baseY - 0.015, -convW / 2 - 0.02));
  // Right side channel
  g.add(box(convL, frameH, 0.05, mFrame, 0, baseY - 0.06, convW / 2 + 0.025));
  g.add(box(convL, 0.015, 0.04, mFrame, 0, baseY - 0.015, convW / 2 + 0.02));

  // Bottom plate connecting the channels
  g.add(box(convL, 0.008, convW + 0.10, mFrame, 0, baseY - 0.10, 0));

  // === Chain Guide Tracks (UHMW plastic wear strips) ===
  // Upper run guides (where slats ride)
  g.add(box(convL - 0.08, 0.012, 0.025, mTrack, 0, baseY - 0.02, -convW / 2 + 0.015));
  g.add(box(convL - 0.08, 0.012, 0.025, mTrack, 0, baseY - 0.02, convW / 2 - 0.015));
  // Lower return guides
  g.add(box(convL - 0.08, 0.012, 0.025, mTrack, 0, baseY - 0.09, -convW / 2 + 0.015));
  g.add(box(convL - 0.08, 0.012, 0.025, mTrack, 0, baseY - 0.09, convW / 2 - 0.015));

  // === Two Parallel Chains (top run) ===
  // Simulated with segmented boxes for chain appearance
  const chainSegCount = 28;
  for (let i = 0; i < chainSegCount; i++) {
    const cx = -convL / 2 + 0.05 + (convL - 0.10) / (chainSegCount - 1) * i;
    // Left chain link
    g.add(box(0.02, 0.015, 0.018, mChain, cx, baseY - 0.008, -convW / 2 + 0.015));
    // Right chain link
    g.add(box(0.02, 0.015, 0.018, mChain, cx, baseY - 0.008, convW / 2 - 0.015));
  }

  // Chain return (underneath)
  for (let i = 0; i < chainSegCount; i++) {
    const cx = -convL / 2 + 0.05 + (convL - 0.10) / (chainSegCount - 1) * i;
    g.add(box(0.02, 0.015, 0.018, mChain, cx, baseY - 0.085, -convW / 2 + 0.015));
    g.add(box(0.02, 0.015, 0.018, mChain, cx, baseY - 0.085, convW / 2 - 0.015));
  }

  // === Slats / Flights Across the Chains ===
  const slatSpacing = (convL - 0.10) / (slatCount - 1);
  for (let i = 0; i < slatCount; i++) {
    const sx = -convL / 2 + 0.05 + slatSpacing * i;
    // Slat plate
    g.add(box(0.04, 0.005, convW - 0.01, mSlat, sx, baseY + 0.003, 0));
    // Slat attachment pins (connecting to chains)
    g.add(cyl(0.005, 0.005, 0.015, 6, M.chrome,
      sx, baseY - 0.004, -convW / 2 + 0.015));
    g.add(cyl(0.005, 0.005, 0.015, 6, M.chrome,
      sx, baseY - 0.004, convW / 2 - 0.015));
  }

  // === Drive Sprockets (output end, +X) ===
  // Left drive sprocket
  g.add(cyl(0.05, 0.05, 0.025, 16, mSprocket,
    convL / 2 - 0.04, baseY - 0.045, -convW / 2 + 0.015, Math.PI / 2, 0, 0));
  // Sprocket teeth bumps
  for (let t = 0; t < 10; t++) {
    const angle = (t / 10) * Math.PI * 2;
    const ty = Math.cos(angle) * 0.05;
    const tx = Math.sin(angle) * 0.05;
    g.add(box(0.008, 0.008, 0.008, mSprocket,
      convL / 2 - 0.04 + tx, baseY - 0.045 + ty, -convW / 2 + 0.015));
  }
  // Right drive sprocket
  g.add(cyl(0.05, 0.05, 0.025, 16, mSprocket,
    convL / 2 - 0.04, baseY - 0.045, convW / 2 - 0.015, Math.PI / 2, 0, 0));
  for (let t = 0; t < 10; t++) {
    const angle = (t / 10) * Math.PI * 2;
    const ty = Math.cos(angle) * 0.05;
    const tx = Math.sin(angle) * 0.05;
    g.add(box(0.008, 0.008, 0.008, mSprocket,
      convL / 2 - 0.04 + tx, baseY - 0.045 + ty, convW / 2 - 0.015));
  }
  // Drive shaft connecting sprockets
  g.add(cyl(0.015, 0.015, convW + 0.06, 8, M.chrome,
    convL / 2 - 0.04, baseY - 0.045, 0, Math.PI / 2, 0, 0));
  // Shaft bearing pillow blocks
  g.add(box(0.05, 0.04, 0.04, mTrack,
    convL / 2 - 0.04, baseY - 0.045, -convW / 2 - 0.045));
  g.add(box(0.05, 0.04, 0.04, mTrack,
    convL / 2 - 0.04, baseY - 0.045, convW / 2 + 0.045));

  // === Idler Sprockets (input end, -X) ===
  g.add(cyl(0.04, 0.04, 0.022, 14, mSprocket,
    -convL / 2 + 0.04, baseY - 0.045, -convW / 2 + 0.015, Math.PI / 2, 0, 0));
  g.add(cyl(0.04, 0.04, 0.022, 14, mSprocket,
    -convL / 2 + 0.04, baseY - 0.045, convW / 2 - 0.015, Math.PI / 2, 0, 0));
  // Idler shaft
  g.add(cyl(0.012, 0.012, convW + 0.06, 8, M.chrome,
    -convL / 2 + 0.04, baseY - 0.045, 0, Math.PI / 2, 0, 0));

  // === Chain Tensioner Mechanism (at idler end) ===
  // Tensioner slide blocks
  g.add(box(0.06, 0.04, 0.03, mTrack,
    -convL / 2 + 0.04, baseY - 0.045, -convW / 2 - 0.045));
  g.add(box(0.06, 0.04, 0.03, mTrack,
    -convL / 2 + 0.04, baseY - 0.045, convW / 2 + 0.045));
  // Tension screw rods
  g.add(cyl(0.006, 0.006, 0.07, 6, M.chrome,
    -convL / 2 + 0.01, baseY - 0.045, -convW / 2 - 0.045));
  g.add(cyl(0.006, 0.006, 0.07, 6, M.chrome,
    -convL / 2 + 0.01, baseY - 0.045, convW / 2 + 0.045));
  // Lock nuts
  g.add(cyl(0.012, 0.012, 0.01, 6, M.darkChrome,
    -convL / 2 + 0.005, baseY - 0.045, -convW / 2 - 0.045));
  g.add(cyl(0.012, 0.012, 0.01, 6, M.darkChrome,
    -convL / 2 + 0.005, baseY - 0.045, convW / 2 + 0.045));
  // Tension spring
  g.add(cyl(0.01, 0.01, 0.04, 8, mat(0x888888, 0.8, 0.2),
    -convL / 2 + 0.03, baseY - 0.045, -convW / 2 - 0.045));

  // === Drive Motor with Guard ===
  const motorZ = convW / 2 + 0.12;
  const motorX = convL / 2 - 0.04;
  // Motor body
  g.add(cyl(0.06, 0.06, 0.16, 12, mMotor,
    motorX, baseY - 0.045, motorZ, Math.PI / 2, 0, 0));
  // Motor end cap
  g.add(cyl(0.063, 0.063, 0.01, 12, mFrame,
    motorX, baseY - 0.045, motorZ + 0.085, Math.PI / 2, 0, 0));
  // Motor fan shroud
  g.add(cyl(0.058, 0.058, 0.03, 12, mat(0x333338, 0.5, 0.6),
    motorX, baseY - 0.045, motorZ + 0.08, Math.PI / 2, 0, 0));
  // Gear reducer
  g.add(box(0.09, 0.08, 0.08, mat(0x3a4050, 0.65, 0.45),
    motorX, baseY - 0.045, convW / 2 + 0.06));
  // Motor junction box
  g.add(box(0.04, 0.035, 0.035, mMotor,
    motorX + 0.045, baseY - 0.01, motorZ));
  // Conduit
  g.add(cyl(0.008, 0.008, 0.10, 6, M.wire,
    motorX + 0.045, baseY - 0.01, motorZ + 0.07, Math.PI / 2, 0, 0));

  // Motor guard (mesh cover)
  g.add(box(0.14, 0.14, 0.003, mGuard,
    motorX, baseY - 0.045, convW / 2 + 0.04));
  g.add(box(0.003, 0.14, 0.12, mGuard,
    motorX + 0.07, baseY - 0.045, convW / 2 + 0.10));
  g.add(box(0.003, 0.14, 0.12, mGuard,
    motorX - 0.07, baseY - 0.045, convW / 2 + 0.10));
  g.add(box(0.14, 0.003, 0.12, mGuard,
    motorX, baseY + 0.025, convW / 2 + 0.10));

  // === Support Structure with Cross Braces ===
  // 4 support legs
  const legPositions: [number, number][] = [
    [-convL / 2 + 0.12, -convW / 2 - 0.025],
    [-convL / 2 + 0.12,  convW / 2 + 0.025],
    [ convL / 2 - 0.12, -convW / 2 - 0.025],
    [ convL / 2 - 0.12,  convW / 2 + 0.025],
  ];
  for (const [lx, lz] of legPositions) {
    // Leg (square tube)
    g.add(box(0.035, baseY - 0.10, 0.035, mFrame, lx, (baseY - 0.10) / 2, lz));
    // Mounting plate
    g.add(box(0.055, 0.008, 0.055, mFrame, lx, baseY - 0.10, lz));
    // Foot pad
    g.add(cyl(0.025, 0.028, 0.012, 8, mFoot, lx, 0.006, lz));
    // Foot bolt
    g.add(cyl(0.008, 0.008, 0.025, 6, M.chrome, lx, 0.02, lz));
  }

  // Cross braces (X pattern on each side)
  g.add(box(convL - 0.24, 0.015, 0.015, mFrame, 0, 0.06, -convW / 2 - 0.025,
    0, 0, 0.06));
  g.add(box(convL - 0.24, 0.015, 0.015, mFrame, 0, 0.06, -convW / 2 - 0.025,
    0, 0, -0.06));
  g.add(box(convL - 0.24, 0.015, 0.015, mFrame, 0, 0.06, convW / 2 + 0.025,
    0, 0, 0.06));
  g.add(box(convL - 0.24, 0.015, 0.015, mFrame, 0, 0.06, convW / 2 + 0.025,
    0, 0, -0.06));
  // Transverse cross braces
  g.add(box(0.015, 0.015, convW + 0.05, mFrame, 0, 0.06, 0));

  // === Status Light ===
  g.add(createStatusLight(convL / 2 - 0.15, baseY, -convW / 2 - 0.06));

  return g;
}
