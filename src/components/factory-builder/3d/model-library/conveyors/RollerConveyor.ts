import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Straight Roller Conveyor Section
 * Steel side frame C-channels with 14 rollers, bearings, drive motor,
 * chain guard, guide rails, leveling feet, end stop, status light.
 * Footprint: ~2.0 x 0.6 units, height ~0.55 units
 */
export function buildRollerConveyor(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame    = mat(0x4a5060, 0.75, 0.35);   // steel frame
  const mRoller   = mat(0x555d68, 0.80, 0.25);   // roller body
  const mBearing  = mat(0x707888, 0.85, 0.20);   // bearing caps
  const mMotor    = mat(0x2c3040, 0.60, 0.50);   // motor housing
  const mGuard    = mat(0xddaa00, 0.20, 0.55);   // safety guard yellow
  const mChain    = mat(0x3a3a3a, 0.70, 0.40);   // drive chain
  const mBumper   = mat(0xcc2222, 0.15, 0.60);   // end stop bumper
  const mFoot     = mat(0x404550, 0.65, 0.50);   // leveling feet

  // Dimensions
  const convL     = 2.0;   // conveyor length (X)
  const convW     = 0.5;   // width between frames (Z)
  const frameH    = 0.08;  // frame height
  const frameW    = 0.04;  // frame thickness (Z)
  const baseY     = 0.30;  // height of roller centerline
  const rollerCount = 14;

  // === Side Frame Channels (C-channels) ===
  // Left frame - vertical web
  g.add(box(convL, frameH, frameW, mFrame, 0, baseY, -convW / 2));
  // Left frame - bottom flange
  g.add(box(convL, 0.012, 0.035, mFrame, 0, baseY - frameH / 2 + 0.006, -convW / 2 + 0.015));
  // Left frame - top flange
  g.add(box(convL, 0.012, 0.035, mFrame, 0, baseY + frameH / 2 - 0.006, -convW / 2 + 0.015));

  // Right frame - vertical web
  g.add(box(convL, frameH, frameW, mFrame, 0, baseY, convW / 2));
  // Right frame - bottom flange
  g.add(box(convL, 0.012, 0.035, mFrame, 0, baseY - frameH / 2 + 0.006, convW / 2 - 0.015));
  // Right frame - top flange
  g.add(box(convL, 0.012, 0.035, mFrame, 0, baseY + frameH / 2 - 0.006, convW / 2 - 0.015));

  // === Rollers with Bearings ===
  const rollerSpacing = (convL - 0.12) / (rollerCount - 1);
  for (let i = 0; i < rollerCount; i++) {
    const rx = -convL / 2 + 0.06 + rollerSpacing * i;

    // Roller body (galvanized steel tube)
    g.add(cyl(0.022, 0.022, convW - 0.06, 10, mRoller,
      rx, baseY + 0.05, 0, Math.PI / 2, 0, 0));

    // Bearing end caps (left)
    g.add(cyl(0.016, 0.016, 0.018, 8, mBearing,
      rx, baseY + 0.05, -convW / 2 + 0.025, Math.PI / 2, 0, 0));
    // Bearing housing block (left)
    g.add(box(0.03, 0.025, 0.015, mBearing,
      rx, baseY + 0.05, -convW / 2 + 0.015));

    // Bearing end caps (right)
    g.add(cyl(0.016, 0.016, 0.018, 8, mBearing,
      rx, baseY + 0.05, convW / 2 - 0.025, Math.PI / 2, 0, 0));
    // Bearing housing block (right)
    g.add(box(0.03, 0.025, 0.015, mBearing,
      rx, baseY + 0.05, convW / 2 - 0.015));

    // Roller shaft hex ends
    g.add(cyl(0.007, 0.007, 0.012, 6, M.chrome,
      rx, baseY + 0.05, -convW / 2 + 0.01, Math.PI / 2, 0, 0));
    g.add(cyl(0.007, 0.007, 0.012, 6, M.chrome,
      rx, baseY + 0.05, convW / 2 - 0.01, Math.PI / 2, 0, 0));

    // Drive sprocket on each roller (underneath, left side)
    g.add(cyl(0.014, 0.014, 0.008, 8, mChain,
      rx, baseY + 0.05, -convW / 2 + 0.035, Math.PI / 2, 0, 0));
  }

  // === Guide Rails on Top of Side Frames ===
  g.add(box(convL - 0.08, 0.025, 0.008, mFrame,
    0, baseY + frameH / 2 + 0.012, -convW / 2 + 0.005));
  g.add(box(convL - 0.08, 0.025, 0.008, mFrame,
    0, baseY + frameH / 2 + 0.012, convW / 2 - 0.005));
  // Guide rail mounting brackets (6 per side)
  for (let i = 0; i < 6; i++) {
    const bx = -convL / 2 + 0.2 + (convL - 0.4) / 5 * i;
    g.add(box(0.015, 0.03, 0.02, mFrame, bx, baseY + frameH / 2 + 0.005, -convW / 2 + 0.01));
    g.add(box(0.015, 0.03, 0.02, mFrame, bx, baseY + frameH / 2 + 0.005, convW / 2 - 0.01));
  }

  // === Drive Chain/Belt Underneath (connecting rollers) ===
  // Chain run along the left side
  g.add(box(convL - 0.15, 0.008, 0.012, mChain,
    0, baseY + 0.02, -convW / 2 + 0.035));
  // Chain return (lower)
  g.add(box(convL - 0.15, 0.008, 0.012, mChain,
    0, baseY - 0.01, -convW / 2 + 0.035));
  // Chain tensioner idler sprocket
  g.add(cyl(0.018, 0.018, 0.012, 8, M.darkChrome,
    -convL / 2 + 0.08, baseY + 0.005, -convW / 2 + 0.035, Math.PI / 2, 0, 0));

  // === Drive Motor (output end, right side) ===
  const motorX = convL / 2 - 0.12;
  const motorZ = convW / 2 + 0.08;
  // Motor body
  g.add(cyl(0.055, 0.055, 0.14, 12, mMotor, motorX, baseY - 0.02, motorZ));
  // Motor shaft
  g.add(cyl(0.012, 0.012, 0.04, 8, M.chrome, motorX, baseY + 0.05, motorZ));
  // Motor end cap
  g.add(cyl(0.06, 0.06, 0.01, 12, mFrame, motorX, baseY - 0.095, motorZ));
  // Motor fan cover
  g.add(cyl(0.058, 0.058, 0.025, 12, mat(0x333338, 0.5, 0.6), motorX, baseY - 0.08, motorZ));
  // Motor junction box
  g.add(box(0.04, 0.035, 0.035, mMotor, motorX, baseY + 0.01, motorZ + 0.06));
  // Conduit from junction box
  g.add(cyl(0.008, 0.008, 0.12, 6, M.wire, motorX, baseY + 0.01, motorZ + 0.14, Math.PI / 2, 0, 0));
  // Gear reducer box
  g.add(box(0.07, 0.06, 0.06, mMotor, motorX, baseY + 0.06, motorZ - 0.02));
  // Drive sprocket (connects to chain)
  g.add(cyl(0.022, 0.022, 0.015, 10, M.darkChrome,
    motorX, baseY + 0.05, convW / 2 + 0.01, Math.PI / 2, 0, 0));

  // === Chain/Belt Guard Cover ===
  g.add(box(convL - 0.10, 0.04, 0.002, mGuard,
    0, baseY + 0.04, -convW / 2 + 0.02));
  g.add(box(convL - 0.10, 0.002, 0.03, mGuard,
    0, baseY + 0.06, -convW / 2 + 0.035));

  // === Support Legs with Adjustable Leveling Feet (4 corners) ===
  const legPositions = [
    [-convL / 2 + 0.10, -convW / 2],
    [-convL / 2 + 0.10,  convW / 2],
    [ convL / 2 - 0.10, -convW / 2],
    [ convL / 2 - 0.10,  convW / 2],
  ];
  for (const [lx, lz] of legPositions) {
    // Leg tube
    g.add(cyl(0.018, 0.018, baseY - frameH / 2, 8, mFrame,
      lx, (baseY - frameH / 2) / 2, lz));
    // Mounting plate at top
    g.add(box(0.05, 0.008, 0.05, mFrame, lx, baseY - frameH / 2, lz));
    // Adjustable foot pad
    g.add(cyl(0.025, 0.03, 0.015, 8, mFoot, lx, 0.008, lz));
    // Foot bolt thread
    g.add(cyl(0.008, 0.008, 0.03, 6, M.chrome, lx, 0.025, lz));
    // Lock nut
    g.add(cyl(0.014, 0.014, 0.01, 6, M.darkChrome, lx, 0.04, lz));
  }

  // Cross braces between legs
  g.add(box(0.015, 0.015, convW, mFrame, -convL / 2 + 0.10, 0.12, 0));
  g.add(box(0.015, 0.015, convW, mFrame,  convL / 2 - 0.10, 0.12, 0));
  // Longitudinal brace
  g.add(box(convL - 0.20, 0.015, 0.015, mFrame, 0, 0.12, 0));

  // === End Stop / Bumper (output end) ===
  g.add(box(0.015, 0.06, convW - 0.04, mBumper,
    convL / 2 - 0.01, baseY + 0.05, 0));
  // Bumper rubber pad
  g.add(box(0.008, 0.04, convW - 0.08, M.rubber,
    convL / 2 - 0.005, baseY + 0.05, 0));
  // Bumper mounting bolts
  g.add(cyl(0.006, 0.006, 0.02, 6, M.chrome,
    convL / 2 - 0.02, baseY + 0.07, -convW / 4));
  g.add(cyl(0.006, 0.006, 0.02, 6, M.chrome,
    convL / 2 - 0.02, baseY + 0.07, convW / 4));

  // === Status Light ===
  g.add(createStatusLight(convL / 2 - 0.15, baseY + frameH / 2, -convW / 2 - 0.04));

  return g;
}
