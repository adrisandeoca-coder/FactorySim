import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Indoor Overhead Bridge Crane
 * Runway beams supported by building columns, bridge girder,
 * end trucks, trolley with hoist, wire rope drum, hook block,
 * pendant control, power feed conductor bars, limit switches.
 * Footprint: ~3.0 x 2.6 units, height ~3.2 units
 */
export function buildBridgeCrane(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mSteel    = mat(0x4a5565, 0.75, 0.3);     // structural steel
  const mGirder   = mat(0x556575, 0.7, 0.3);       // bridge girder
  const mRail     = mat(0x707888, 0.85, 0.2);      // runway rail
  const mMotor    = mat(0x2c3545, 0.6, 0.5);       // motor housing
  const mTrolley  = mat(0x3a4555, 0.65, 0.4);      // trolley frame
  const mCable    = mat(0x555555, 0.3, 0.6);        // wire rope
  const mHook     = mat(0xb0bcc8, 0.85, 0.15);     // polished hook
  const mPendant  = mat(0xddaa00, 0.3, 0.5);       // pendant box
  const mColumn   = mat(0x606a78, 0.6, 0.45);      // building columns
  const mConduct  = mat(0xcc6620, 0.7, 0.3);       // conductor bars (copper)

  // Dimensions
  const spanW = 2.6;     // bridge span (Z)
  const runwayLen = 3.0; // runway length (X)
  const runwayH = 2.8;   // runway height (Y)
  const colH = runwayH;

  // === Building Columns (4 columns supporting runways) ===
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const cx = xSign * (runwayLen / 2 - 0.15);
      const cz = zSign * (spanW / 2 + 0.1);

      // H-beam column
      g.add(box(0.15, colH, 0.15, mColumn, cx, colH / 2, cz));
      // Column flanges
      g.add(box(0.2, colH, 0.02, mColumn, cx, colH / 2, cz - 0.065));
      g.add(box(0.2, colH, 0.02, mColumn, cx, colH / 2, cz + 0.065));
      // Column base plate
      g.add(box(0.3, 0.03, 0.3, mSteel, cx, 0.015, cz));
      // Anchor bolts
      for (const ax of [-0.1, 0.1]) {
        for (const az of [-0.1, 0.1]) {
          g.add(cyl(0.012, 0.012, 0.04, 6, M.chrome, cx + ax, 0.05, cz + az));
        }
      }
      // Corbel / bracket supporting runway
      g.add(box(0.2, 0.08, 0.15, mSteel, cx, runwayH - 0.04, cz - zSign * 0.1));
    }
  }

  // === Runway Beams (two long beams overhead) ===
  for (const zSign of [-1, 1]) {
    const rz = zSign * (spanW / 2);

    // Main runway beam (I-beam)
    // Top flange
    g.add(box(runwayLen, 0.025, 0.14, mSteel, 0, runwayH + 0.06, rz));
    // Web
    g.add(box(runwayLen, 0.1, 0.02, mSteel, 0, runwayH, rz));
    // Bottom flange
    g.add(box(runwayLen, 0.025, 0.14, mSteel, 0, runwayH - 0.06, rz));
    // Rail on top of runway
    g.add(box(runwayLen, 0.02, 0.05, mRail, 0, runwayH + 0.085, rz));

    // Runway stiffeners
    for (let i = -4; i <= 4; i++) {
      g.add(box(0.015, 0.08, 0.01, mSteel, i * 0.3, runwayH, rz + zSign * 0.015));
    }
  }

  // === End Trucks (ride on runways) ===
  for (const xSign of [-1, 1]) {
    const etX = xSign * 0.5;
    const etY = runwayH + 0.12;

    // End truck frame
    g.add(box(0.2, 0.08, spanW + 0.06, mSteel, etX, etY, 0));

    // End truck wheels (2 per side)
    for (const zSign of [-1, 1]) {
      const wz = zSign * (spanW / 2);
      g.add(cyl(0.04, 0.04, 0.06, 12, M.darkChrome, etX, runwayH + 0.09, wz, Math.PI / 2, 0, 0));
      // Wheel bearing housing
      g.add(box(0.06, 0.06, 0.08, mMotor, etX, runwayH + 0.09, wz));
    }

    // End truck drive motor (one per end truck)
    g.add(box(0.1, 0.08, 0.1, mMotor, etX, etY + 0.08, spanW / 2 - 0.2));
    g.add(cyl(0.025, 0.025, 0.04, 8, M.chrome, etX, etY + 0.08, spanW / 2 - 0.12, Math.PI / 2, 0, 0));
  }

  // === Bridge Girder ===
  const girderY = runwayH + 0.18;
  // Main box girder
  g.add(box(1.2, 0.18, spanW - 0.2, mGirder, 0, girderY, 0));
  // Top plate
  g.add(box(1.2, 0.015, spanW - 0.15, mSteel, 0, girderY + 0.1, 0));
  // Bottom plate
  g.add(box(1.2, 0.015, spanW - 0.15, mSteel, 0, girderY - 0.1, 0));

  // Bridge stiffeners
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.015, 0.16, 0.015, mSteel, i * 0.22, girderY, (spanW - 0.2) / 2 - 0.01));
    g.add(box(0.015, 0.16, 0.015, mSteel, i * 0.22, girderY, -(spanW - 0.2) / 2 + 0.01));
  }

  // Trolley rails on bridge girder top
  g.add(box(1.1, 0.02, 0.04, mRail, 0, girderY + 0.12, -0.3));
  g.add(box(1.1, 0.02, 0.04, mRail, 0, girderY + 0.12, 0.3));

  // === Trolley with Hoist ===
  const trolleyX = 0.15;
  const trolleyY = girderY + 0.18;

  // Trolley frame
  g.add(box(0.35, 0.04, 0.7, mTrolley, trolleyX, trolleyY, 0));

  // Trolley wheels (4)
  for (const xOff of [-0.1, 0.1]) {
    for (const zOff of [-0.3, 0.3]) {
      g.add(cyl(0.025, 0.025, 0.04, 10, M.darkChrome,
        trolleyX + xOff, girderY + 0.13, zOff, Math.PI / 2, 0, 0));
    }
  }

  // Hoist motor
  g.add(box(0.2, 0.14, 0.2, mMotor, trolleyX, trolleyY + 0.11, 0));
  // Motor fan cover
  g.add(cyl(0.055, 0.055, 0.03, 12, mSteel, trolleyX + 0.115, trolleyY + 0.11, 0, 0, 0, Math.PI / 2));
  // Motor junction box
  g.add(box(0.06, 0.06, 0.08, mMotor, trolleyX - 0.08, trolleyY + 0.18, 0.05));

  // Wire rope drum
  g.add(cyl(0.055, 0.055, 0.22, 12, M.chrome, trolleyX, trolleyY, 0.2, Math.PI / 2, 0, 0));
  // Drum end plates
  g.add(cyl(0.07, 0.07, 0.01, 12, mSteel, trolleyX, trolleyY, 0.32));
  g.add(cyl(0.07, 0.07, 0.01, 12, mSteel, trolleyX, trolleyY, 0.08));

  // Trolley travel motor
  g.add(box(0.08, 0.08, 0.1, mMotor, trolleyX - 0.12, trolleyY + 0.02, -0.25));

  // === Wire Ropes ===
  const ropeTop = trolleyY - 0.02;
  const ropeBottom = 0.8;
  const ropeH = ropeTop - ropeBottom;
  g.add(cyl(0.006, 0.006, ropeH, 6, mCable, trolleyX - 0.02, ropeBottom + ropeH / 2, 0.2));
  g.add(cyl(0.006, 0.006, ropeH, 6, mCable, trolleyX + 0.02, ropeBottom + ropeH / 2, 0.2));

  // === Hook Block ===
  const hookY = ropeBottom;
  // Upper block (housing)
  g.add(box(0.1, 0.07, 0.08, mSteel, trolleyX, hookY, 0.2));
  // Sheave pulley
  g.add(cyl(0.04, 0.04, 0.02, 16, M.chrome, trolleyX, hookY + 0.02, 0.2, Math.PI / 2, 0, 0));
  // Lower block
  g.add(box(0.06, 0.04, 0.06, mSteel, trolleyX, hookY - 0.055, 0.2));
  // Swivel
  g.add(cyl(0.015, 0.015, 0.03, 8, M.chrome, trolleyX, hookY - 0.09, 0.2));
  // Hook shank
  g.add(cyl(0.012, 0.01, 0.12, 8, mHook, trolleyX, hookY - 0.165, 0.2));
  // Hook curve
  g.add(sph(0.025, mHook, trolleyX, hookY - 0.23, 0.2));
  g.add(cyl(0.01, 0.01, 0.05, 8, mHook, trolleyX + 0.025, hookY - 0.22, 0.2, 0, 0, Math.PI / 2));
  // Safety latch
  g.add(box(0.004, 0.035, 0.025, M.red, trolleyX - 0.015, hookY - 0.21, 0.2));

  // === Pendant Control Station ===
  const pendantX = trolleyX + 0.35;
  const pendantCableTop = trolleyY;
  const pendantY = 1.2;

  // Pendant cable
  g.add(cyl(0.008, 0.008, pendantCableTop - pendantY, 6, mCable,
    pendantX, pendantY + (pendantCableTop - pendantY) / 2, 0));
  // Pendant box
  g.add(box(0.08, 0.18, 0.06, mPendant, pendantX, pendantY - 0.05, 0));
  // Buttons on pendant (6 buttons)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const btnColor = r === 2 ? M.red : mat(0x222222, 0.1, 0.7);
      g.add(cyl(0.01, 0.01, 0.005, 8, btnColor,
        pendantX + (c - 0.5) * 0.025, pendantY - 0.01 + r * 0.04, 0.033));
    }
  }
  // E-stop mushroom button at bottom
  g.add(cyl(0.018, 0.018, 0.01, 10, M.red, pendantX, pendantY - 0.12, 0.033));

  // === Power Feed - Conductor Bars along runway ===
  const conductY = runwayH - 0.15;
  for (let i = 0; i < 3; i++) {
    // Conductor bar
    g.add(box(runwayLen - 0.2, 0.02, 0.01, mConduct,
      0, conductY - i * 0.04, spanW / 2 + 0.05));
    // Insulating brackets
    for (let b = -2; b <= 2; b++) {
      g.add(box(0.02, 0.02, 0.03, mat(0x888888, 0.1, 0.8),
        b * 0.5, conductY - i * 0.04, spanW / 2 + 0.06));
    }
  }
  // Current collector arm from end truck
  g.add(box(0.04, 0.12, 0.04, mSteel, 0.5, conductY - 0.04, spanW / 2 + 0.05));

  // === Limit Switches at runway ends ===
  for (const xSign of [-1, 1]) {
    const lsX = xSign * (runwayLen / 2 - 0.05);
    // Limit switch body
    g.add(box(0.04, 0.03, 0.04, M.red, lsX, runwayH + 0.1, spanW / 2));
    // Switch lever
    g.add(cyl(0.003, 0.003, 0.06, 6, M.chrome, lsX, runwayH + 0.1, spanW / 2 - 0.04,
      0, 0, Math.PI / 4 * xSign));
    // Rubber bumper
    g.add(box(0.06, 0.08, spanW * 0.3, M.rubber, lsX, runwayH + 0.1, 0));
  }

  // === Warning labels / stripes on bridge ends ===
  for (const xSign of [-1, 1]) {
    for (let s = 0; s < 4; s++) {
      const stripeMat = s % 2 === 0 ? mat(0xddaa00, 0.2, 0.6) : mat(0x222222, 0.1, 0.8);
      g.add(box(0.015, 0.04, spanW - 0.3, stripeMat,
        xSign * 0.58 + xSign * s * 0.015, girderY - 0.06, 0));
    }
  }

  // === Status Light ===
  g.add(createStatusLight(trolleyX - 0.2, trolleyY + 0.2, -0.3));

  return g;
}
