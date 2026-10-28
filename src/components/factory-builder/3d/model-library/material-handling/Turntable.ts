import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Conveyor Transfer Turntable / Rotary Table
 * Circular base platform with bearing ring, roller conveyor on top,
 * drive motor underneath, guide pins, floor mounting plate,
 * safety guard ring, position sensors, cable entry gland, status light.
 * Footprint: ~1.2 x 1.2 units (circular), height ~0.55 units
 */
export function buildTurntable(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBase     = mat(0x3a4050, 0.7, 0.4);      // base platform steel
  const mBearing  = mat(0x707888, 0.85, 0.2);      // bearing ring
  const mRoller   = mat(0x555d68, 0.8, 0.25);      // conveyor rollers
  const mFrame    = mat(0x4a5060, 0.75, 0.35);     // frame steel
  const mMotor    = mat(0x2c3040, 0.6, 0.5);       // motor housing
  const mGuard    = mat(0xddaa00, 0.2, 0.55);      // safety guard yellow
  const mSensor   = mat(0x0066cc, 0.3, 0.4);       // sensor housing blue
  const mMount    = mat(0x404550, 0.65, 0.5);      // mounting plate
  const mGland    = mat(0x333333, 0.4, 0.6);       // cable gland

  // Dimensions
  const baseR = 0.55;    // base radius
  const rollerCount = 9;  // number of rollers on top
  const conveyorW = 0.5;  // roller conveyor width
  const conveyorL = 0.9;  // roller conveyor length

  // === Floor Mounting Plate ===
  g.add(cyl(baseR + 0.08, baseR + 0.08, 0.025, 32, mMount, 0, 0.012, 0));
  // Mounting bolt holes (8 around perimeter)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const bx = Math.cos(angle) * (baseR + 0.04);
    const bz = Math.sin(angle) * (baseR + 0.04);
    g.add(cyl(0.012, 0.012, 0.03, 6, M.chrome, bx, 0.04, bz));
    // Washer
    g.add(cyl(0.018, 0.018, 0.005, 8, M.darkChrome, bx, 0.025, bz));
  }

  // === Base Structure (fixed lower section) ===
  // Lower base cylinder
  g.add(cyl(baseR, baseR, 0.1, 32, mBase, 0, 0.08, 0));
  // Base support ribs (radial)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const rx = Math.cos(angle);
    const rz = Math.sin(angle);
    g.add(box(baseR * 0.8, 0.06, 0.02, mFrame,
      rx * baseR * 0.4, 0.06, rz * baseR * 0.4,
      0, angle, 0));
  }
  // Center pedestal
  g.add(cyl(0.12, 0.15, 0.12, 16, mFrame, 0, 0.19, 0));

  // === Bearing Ring ===
  // Outer bearing race
  g.add(cyl(baseR - 0.02, baseR - 0.02, 0.03, 32, mBearing, 0, 0.15, 0));
  g.add(cyl(baseR - 0.06, baseR - 0.06, 0.035, 32, mat(0x888888, 0.9, 0.1), 0, 0.15, 0));
  // Inner bearing race
  g.add(cyl(baseR - 0.1, baseR - 0.1, 0.03, 32, mBearing, 0, 0.15, 0));
  // Ball bearings visible (decorative ring of spheres)
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const bx = Math.cos(angle) * (baseR - 0.08);
    const bz = Math.sin(angle) * (baseR - 0.08);
    g.add(sph(0.012, M.chrome, bx, 0.15, bz));
  }

  // === Rotating Platform (upper disc) ===
  g.add(cyl(baseR - 0.03, baseR - 0.03, 0.04, 32, mFrame, 0, 0.19, 0));
  // Platform top plate
  g.add(cyl(baseR - 0.04, baseR - 0.04, 0.015, 32, mBase, 0, 0.22, 0));

  // === Roller Conveyor Section on Top ===
  // Side rails
  g.add(box(conveyorL, 0.05, 0.03, mFrame, 0, 0.26, -conveyorW / 2));
  g.add(box(conveyorL, 0.05, 0.03, mFrame, 0, 0.26, conveyorW / 2));
  // Bottom channel of side rails
  g.add(box(conveyorL, 0.01, 0.03, mFrame, 0, 0.235, -conveyorW / 2));
  g.add(box(conveyorL, 0.01, 0.03, mFrame, 0, 0.235, conveyorW / 2));

  // Rollers
  for (let i = 0; i < rollerCount; i++) {
    const rx = -conveyorL / 2 + 0.06 + (conveyorL - 0.12) / (rollerCount - 1) * i;
    // Roller body
    g.add(cyl(0.02, 0.02, conveyorW - 0.06, 10, mRoller,
      rx, 0.29, 0, Math.PI / 2, 0, 0));
    // Roller shaft ends (hex)
    g.add(cyl(0.008, 0.008, 0.015, 6, M.chrome, rx, 0.29, -conveyorW / 2 + 0.02, Math.PI / 2, 0, 0));
    g.add(cyl(0.008, 0.008, 0.015, 6, M.chrome, rx, 0.29, conveyorW / 2 - 0.02, Math.PI / 2, 0, 0));
  }

  // End roller (drive roller, larger)
  g.add(cyl(0.025, 0.025, conveyorW - 0.04, 12, M.darkChrome,
    conveyorL / 2 - 0.02, 0.29, 0, Math.PI / 2, 0, 0));

  // Guide rails on conveyor (thin raised edges)
  g.add(box(conveyorL - 0.1, 0.025, 0.006, mFrame, 0, 0.30, -conveyorW / 2 + 0.04));
  g.add(box(conveyorL - 0.1, 0.025, 0.006, mFrame, 0, 0.30, conveyorW / 2 - 0.04));

  // === Drive Motor (underneath platform) ===
  // Motor housing
  g.add(cyl(0.06, 0.06, 0.12, 12, mMotor, 0.2, 0.06, 0.2));
  // Motor shaft
  g.add(cyl(0.015, 0.015, 0.05, 8, M.chrome, 0.2, 0.13, 0.2));
  // Motor end cap
  g.add(cyl(0.065, 0.065, 0.01, 12, M.yellow, 0.2, 0.0, 0.2));
  // Motor junction box
  g.add(box(0.04, 0.04, 0.04, mMotor, 0.2, 0.08, 0.27));
  // Gear reducer
  g.add(box(0.08, 0.06, 0.06, mMotor, 0.2, 0.15, 0.15));
  // Drive pinion (gear engaging ring gear)
  g.add(cyl(0.025, 0.025, 0.02, 12, M.darkChrome, 0.15, 0.15, 0.15));

  // Ring gear on underside of platform (visible at edge)
  g.add(cyl(baseR - 0.07, baseR - 0.07, 0.015, 48, mat(0x555555, 0.8, 0.3), 0, 0.17, 0));

  // === Guide Pins / Alignment Features ===
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(angle) * (baseR - 0.15);
    const pz = Math.sin(angle) * (baseR - 0.15);
    // Alignment pin
    g.add(cyl(0.01, 0.01, 0.04, 6, M.chrome, px, 0.24, pz));
    // Pin base
    g.add(cyl(0.018, 0.018, 0.01, 8, mFrame, px, 0.22, pz));
  }

  // === Safety Guard Ring (around perimeter) ===
  // Guard posts (8 vertical posts)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const gx = Math.cos(angle) * (baseR + 0.06);
    const gz = Math.sin(angle) * (baseR + 0.06);
    g.add(cyl(0.01, 0.01, 0.2, 6, mGuard, gx, 0.22, gz));
  }
  // Guard ring (top rail) - approximated with segments
  for (let i = 0; i < 16; i++) {
    const angle1 = (i / 16) * Math.PI * 2;
    const angle2 = ((i + 1) / 16) * Math.PI * 2;
    const midAngle = (angle1 + angle2) / 2;
    const segLen = 2 * (baseR + 0.06) * Math.sin(Math.PI / 16);
    g.add(cyl(0.008, 0.008, segLen, 4, mGuard,
      Math.cos(midAngle) * (baseR + 0.06), 0.32,
      Math.sin(midAngle) * (baseR + 0.06),
      Math.PI / 2, midAngle + Math.PI / 2, 0));
  }
  // Warning stripe segments on guard
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const sx = Math.cos(angle) * (baseR + 0.06);
    const sz = Math.sin(angle) * (baseR + 0.06);
    g.add(box(0.04, 0.04, 0.005, mat(0x222222, 0.1, 0.8),
      sx, 0.26, sz, 0, angle, 0));
  }

  // === Position Sensors ===
  // Proximity sensors (3 positions at 90-degree intervals)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const sx = Math.cos(angle) * (baseR - 0.02);
    const sz = Math.sin(angle) * (baseR - 0.02);
    // Sensor body
    g.add(cyl(0.012, 0.012, 0.03, 8, mSensor, sx, 0.13, sz));
    // Sensor face (LED indicator)
    g.add(cyl(0.008, 0.008, 0.003, 6,
      mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }),
      sx, 0.147, sz));
  }
  // Rotary encoder on center shaft
  g.add(cyl(0.03, 0.03, 0.04, 12, mSensor, 0, 0.06, 0));

  // === Cable Entry Gland ===
  g.add(cyl(0.02, 0.02, 0.04, 8, mGland, -0.35, 0.05, -0.35));
  g.add(cyl(0.025, 0.025, 0.01, 8, mGland, -0.35, 0.035, -0.35));
  // Cable coming out
  g.add(cyl(0.008, 0.008, 0.15, 6, M.wire, -0.35, 0.0, -0.42, 0.3, 0, 0));

  // === Junction Box on base ===
  g.add(box(0.08, 0.06, 0.06, mMotor, -0.3, 0.06, 0.35));
  // Conduit from junction box
  g.add(cyl(0.01, 0.01, 0.1, 6, M.pipe, -0.3, 0.06, 0.4, Math.PI / 2, 0, 0));

  // === Status Light ===
  g.add(createStatusLight(0, 0.3, -baseR + 0.05));

  return g;
}
