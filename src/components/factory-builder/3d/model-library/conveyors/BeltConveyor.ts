import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Belt Conveyor Section
 * Steel truss frame with head/tail pulleys, flat belt surface,
 * belt return underneath, drive motor with gear reducer, tension
 * adjustment, side skirt boards, support legs, tracking guides, status light.
 * Footprint: ~2.0 x 0.6 units, height ~0.55 units
 */
export function buildBeltConveyor(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame    = mat(0x3a4050, 0.65, 0.45);   // steel frame
  const mBelt     = mat(0x1a1a1a, 0.00, 0.85);   // belt surface (dark rubber)
  const mPulley   = mat(0x555d68, 0.80, 0.25);   // pulleys
  const mMotor    = mat(0x2c3040, 0.60, 0.50);   // motor housing
  const mReducer  = mat(0x3a4050, 0.65, 0.45);   // gear reducer
  const mSkirt    = mat(0x404a58, 0.60, 0.50);   // skirt boards
  const mFoot     = mat(0x404550, 0.65, 0.50);   // leveling feet
  const mTension  = mat(0x606878, 0.80, 0.25);   // tension mechanism

  // Dimensions
  const convL     = 2.0;
  const convW     = 0.5;    // belt width
  const frameH    = 0.06;
  const baseY     = 0.32;   // belt surface height
  const legH      = 0.24;

  // === Main Frame / Truss Structure ===
  // Side stringers (left and right)
  g.add(box(convL, frameH, 0.03, mFrame, 0, baseY - 0.04, -convW / 2 - 0.02));
  g.add(box(convL, frameH, 0.03, mFrame, 0, baseY - 0.04, convW / 2 + 0.02));

  // Cross members (7 evenly spaced)
  for (let i = 0; i < 7; i++) {
    const cx = -convL / 2 + 0.15 + (convL - 0.30) / 6 * i;
    g.add(box(0.015, 0.03, convW + 0.06, mFrame, cx, baseY - 0.06, 0));
  }

  // Bottom stringers for belt return path
  g.add(box(convL - 0.10, 0.02, 0.025, mFrame, 0, baseY - 0.13, -convW / 2 + 0.05));
  g.add(box(convL - 0.10, 0.02, 0.025, mFrame, 0, baseY - 0.13, convW / 2 - 0.05));

  // Diagonal braces on sides (4 per side)
  for (let i = 0; i < 4; i++) {
    const bx = -convL / 2 + 0.25 + (convL - 0.50) / 3 * i;
    g.add(box(0.22, 0.012, 0.012, mFrame,
      bx, baseY - 0.085, -convW / 2 - 0.02, 0, 0, 0.4));
    g.add(box(0.22, 0.012, 0.012, mFrame,
      bx, baseY - 0.085, convW / 2 + 0.02, 0, 0, -0.4));
  }

  // === Head Pulley (drive end, +X) ===
  g.add(cyl(0.04, 0.04, convW + 0.02, 14, mPulley,
    convL / 2 - 0.04, baseY - 0.01, 0, Math.PI / 2, 0, 0));
  // Pulley shaft
  g.add(cyl(0.012, 0.012, convW + 0.10, 8, M.chrome,
    convL / 2 - 0.04, baseY - 0.01, 0, Math.PI / 2, 0, 0));
  // Shaft bearing blocks
  g.add(box(0.04, 0.035, 0.03, mTension,
    convL / 2 - 0.04, baseY - 0.01, -convW / 2 - 0.04));
  g.add(box(0.04, 0.035, 0.03, mTension,
    convL / 2 - 0.04, baseY - 0.01, convW / 2 + 0.04));
  // Lagging (rubber coating on head pulley)
  g.add(cyl(0.043, 0.043, convW - 0.02, 14, M.rubber,
    convL / 2 - 0.04, baseY - 0.01, 0, Math.PI / 2, 0, 0));

  // === Tail Pulley (-X) ===
  g.add(cyl(0.035, 0.035, convW + 0.02, 14, mPulley,
    -convL / 2 + 0.04, baseY - 0.01, 0, Math.PI / 2, 0, 0));
  // Tail pulley shaft
  g.add(cyl(0.010, 0.010, convW + 0.10, 8, M.chrome,
    -convL / 2 + 0.04, baseY - 0.01, 0, Math.PI / 2, 0, 0));
  // Tail bearing blocks (with slots for tension adjustment)
  g.add(box(0.06, 0.035, 0.03, mTension,
    -convL / 2 + 0.04, baseY - 0.01, -convW / 2 - 0.04));
  g.add(box(0.06, 0.035, 0.03, mTension,
    -convL / 2 + 0.04, baseY - 0.01, convW / 2 + 0.04));

  // === Belt Tension Adjustment at Tail ===
  // Tension screw rods (both sides)
  g.add(cyl(0.006, 0.006, 0.08, 6, M.chrome,
    -convL / 2 + 0.02, baseY - 0.01, -convW / 2 - 0.04));
  g.add(cyl(0.006, 0.006, 0.08, 6, M.chrome,
    -convL / 2 + 0.02, baseY - 0.01, convW / 2 + 0.04));
  // Tension lock nuts
  g.add(cyl(0.012, 0.012, 0.01, 6, M.darkChrome,
    -convL / 2 + 0.01, baseY - 0.01, -convW / 2 - 0.04));
  g.add(cyl(0.012, 0.012, 0.01, 6, M.darkChrome,
    -convL / 2 + 0.01, baseY - 0.01, convW / 2 + 0.04));

  // === Flat Belt Surface (top run) ===
  g.add(box(convL - 0.10, 0.006, convW, mBelt, 0, baseY + 0.02, 0));

  // === Belt Return (underneath, with visible sag) ===
  // Belt return - straight sections
  g.add(box(convL * 0.30, 0.005, convW - 0.02, mBelt,
    -convL * 0.28, baseY - 0.12, 0));
  g.add(box(convL * 0.30, 0.005, convW - 0.02, mBelt,
    convL * 0.28, baseY - 0.12, 0));
  // Belt return - sagging middle section (slightly lower)
  g.add(box(convL * 0.30, 0.005, convW - 0.02, mBelt,
    0, baseY - 0.14, 0));

  // Support rollers for belt return (3 rollers)
  for (let i = 0; i < 3; i++) {
    const srx = -convL / 2 + 0.35 + (convL - 0.70) / 2 * i;
    g.add(cyl(0.015, 0.015, convW - 0.04, 8, mPulley,
      srx, baseY - 0.11, 0, Math.PI / 2, 0, 0));
  }

  // === Slider Bed (support plate under top belt) ===
  g.add(box(convL - 0.12, 0.004, convW - 0.02, mFrame, 0, baseY + 0.015, 0));

  // === Drive Motor with Gear Reducer on Head Pulley ===
  const motorZ = convW / 2 + 0.10;
  const motorX = convL / 2 - 0.04;
  // Gear reducer housing
  g.add(box(0.08, 0.07, 0.07, mReducer, motorX, baseY - 0.01, motorZ));
  // Motor body
  g.add(cyl(0.05, 0.05, 0.16, 12, mMotor, motorX, baseY - 0.01, motorZ + 0.12,
    Math.PI / 2, 0, 0));
  // Motor end cap
  g.add(cyl(0.053, 0.053, 0.01, 12, mFrame, motorX, baseY - 0.01, motorZ + 0.20,
    Math.PI / 2, 0, 0));
  // Motor fan cover
  g.add(cyl(0.052, 0.052, 0.03, 12, mat(0x333338, 0.5, 0.6),
    motorX, baseY - 0.01, motorZ + 0.19, Math.PI / 2, 0, 0));
  // Motor junction box
  g.add(box(0.035, 0.03, 0.03, mMotor, motorX + 0.04, baseY + 0.02, motorZ + 0.12));
  // Motor mounting bolts (4)
  for (let dx = -1; dx <= 1; dx += 2) {
    for (let dy = -1; dy <= 1; dy += 2) {
      g.add(cyl(0.005, 0.005, 0.015, 6, M.chrome,
        motorX + dx * 0.03, baseY - 0.01 + dy * 0.03, motorZ + 0.03,
        Math.PI / 2, 0, 0));
    }
  }

  // === Side Skirt Boards ===
  g.add(box(convL - 0.20, 0.05, 0.006, mSkirt, 0, baseY + 0.045, -convW / 2 + 0.003));
  g.add(box(convL - 0.20, 0.05, 0.006, mSkirt, 0, baseY + 0.045, convW / 2 - 0.003));
  // Skirt rubber seal (bottom edge touching belt)
  g.add(box(convL - 0.22, 0.008, 0.004, M.rubber, 0, baseY + 0.022, -convW / 2 + 0.005));
  g.add(box(convL - 0.22, 0.008, 0.004, M.rubber, 0, baseY + 0.022, convW / 2 - 0.005));
  // Skirt clamp bolts (8 per side)
  for (let i = 0; i < 8; i++) {
    const sx = -convL / 2 + 0.15 + (convL - 0.30) / 7 * i;
    g.add(cyl(0.004, 0.004, 0.012, 6, M.chrome, sx, baseY + 0.05, -convW / 2 + 0.008));
    g.add(cyl(0.004, 0.004, 0.012, 6, M.chrome, sx, baseY + 0.05, convW / 2 - 0.008));
  }

  // === Belt Tracking Guides (V-return idlers) ===
  // Two angled idlers near the center
  g.add(cyl(0.012, 0.012, convW * 0.4, 6, mPulley,
    -0.3, baseY - 0.11, -convW * 0.15, Math.PI / 2, 0, 0.15));
  g.add(cyl(0.012, 0.012, convW * 0.4, 6, mPulley,
    -0.3, baseY - 0.11, convW * 0.15, Math.PI / 2, 0, -0.15));

  // === Support Legs with Adjustable Feet ===
  const legPositions: [number, number][] = [
    [-convL / 2 + 0.12, -convW / 2 - 0.02],
    [-convL / 2 + 0.12,  convW / 2 + 0.02],
    [ convL / 2 - 0.12, -convW / 2 - 0.02],
    [ convL / 2 - 0.12,  convW / 2 + 0.02],
  ];
  for (const [lx, lz] of legPositions) {
    // Leg tube (square profile)
    g.add(box(0.03, legH, 0.03, mFrame, lx, legH / 2, lz));
    // Gusset plate at top
    g.add(box(0.05, 0.05, 0.005, mFrame, lx, legH + 0.02, lz));
    // Adjustable foot pad
    g.add(cyl(0.025, 0.028, 0.012, 8, mFoot, lx, 0.006, lz));
    // Foot bolt thread
    g.add(cyl(0.008, 0.008, 0.03, 6, M.chrome, lx, 0.022, lz));
    // Lock nut
    g.add(cyl(0.013, 0.013, 0.01, 6, M.darkChrome, lx, 0.035, lz));
  }

  // Cross braces between legs
  g.add(box(0.012, 0.012, convW + 0.06, mFrame, -convL / 2 + 0.12, 0.10, 0));
  g.add(box(0.012, 0.012, convW + 0.06, mFrame, convL / 2 - 0.12, 0.10, 0));
  // Longitudinal brace
  g.add(box(convL - 0.24, 0.012, 0.012, mFrame, 0, 0.10, 0));

  // === Status Light ===
  g.add(createStatusLight(-convL / 2 + 0.10, baseY + 0.03, -convW / 2 - 0.06));

  return g;
}
