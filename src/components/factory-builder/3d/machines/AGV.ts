import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Autonomous Guided Vehicle (AGV) — flat low-profile transport robot
 * with LiDAR dome, guide sensors, and cargo platform.
 */
export function buildAGV(): THREE.Group {
  const g = new THREE.Group();

  const agvBlue = mat(0x1e3a5f, 0.5, 0.4);
  const agvAccent = mat(0x00aaff, 0.3, 0.3, { emissive: 0x003366, emissiveIntensity: 0.4 });
  const sensorGreen = mat(0x00ff66, 0.1, 0.3, { emissive: 0x00ff44, emissiveIntensity: 1.5 });

  // ── Chassis (flat, rounded profile) ──
  // Main body — low profile rectangular
  g.add(box(0.7, 0.08, 0.5, agvBlue, 0, 0.10, 0));
  // Top plate — slightly smaller, lighter
  g.add(box(0.64, 0.02, 0.46, M.darkChrome, 0, 0.15, 0));

  // ── Bumper strips (safety) ──
  const bumperMat = mat(0xff6600, 0.0, 0.7);
  g.add(box(0.72, 0.03, 0.02, bumperMat, 0, 0.08, 0.26));   // front bumper
  g.add(box(0.72, 0.03, 0.02, bumperMat, 0, 0.08, -0.26));  // rear bumper
  g.add(box(0.02, 0.03, 0.5, bumperMat, 0.36, 0.08, 0));    // right bumper
  g.add(box(0.02, 0.03, 0.5, bumperMat, -0.36, 0.08, 0));   // left bumper

  // ── Wheels (4 drive wheels + 2 caster swivels) ──
  const wheelMat = M.rubber;
  // Main drive wheels (larger, center sides)
  g.add(cyl(0.06, 0.06, 0.03, 12, wheelMat, 0.34, 0.06, 0.15, 0, 0, Math.PI / 2));
  g.add(cyl(0.06, 0.06, 0.03, 12, wheelMat, -0.34, 0.06, 0.15, 0, 0, Math.PI / 2));
  g.add(cyl(0.06, 0.06, 0.03, 12, wheelMat, 0.34, 0.06, -0.15, 0, 0, Math.PI / 2));
  g.add(cyl(0.06, 0.06, 0.03, 12, wheelMat, -0.34, 0.06, -0.15, 0, 0, Math.PI / 2));

  // Caster wheels (small, front/rear center)
  g.add(cyl(0.03, 0.03, 0.02, 8, M.chrome, 0, 0.03, 0.22, 0, 0, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.02, 8, M.chrome, 0, 0.03, -0.22, 0, 0, Math.PI / 2));

  // ── LiDAR Dome (top center) ──
  const lidarBase = cyl(0.06, 0.06, 0.03, 16, M.bodyDark, 0, 0.175, 0);
  g.add(lidarBase);
  const lidarDome = sph(0.05, mat(0x222222, 0.6, 0.2, { transparent: true, opacity: 0.7 }), 0, 0.21, 0);
  g.add(lidarDome);
  // LiDAR scanning ring (emissive blue)
  g.add(cyl(0.055, 0.055, 0.008, 16, agvAccent, 0, 0.195, 0));

  // ── Guide Sensors (front, small) ──
  g.add(sph(0.015, sensorGreen, -0.15, 0.08, 0.26));
  g.add(sph(0.015, sensorGreen, 0.15, 0.08, 0.26));
  // Rear sensor
  g.add(sph(0.012, mat(0xff0000, 0.1, 0.3, { emissive: 0xff0000, emissiveIntensity: 1.0 }), 0, 0.08, -0.26));

  // ── Cargo Platform (raised surface for parts) ──
  // Platform rails
  g.add(box(0.5, 0.015, 0.04, M.chrome, 0, 0.17, 0.12));
  g.add(box(0.5, 0.015, 0.04, M.chrome, 0, 0.17, -0.12));
  // Platform surface (mesh grate look)
  g.add(box(0.5, 0.005, 0.28, mat(0x4a5060, 0.6, 0.4, { transparent: true, opacity: 0.7 }), 0, 0.18, 0));

  // ── LED strip indicators (side glow) ──
  const ledStrip = mat(0x00ccff, 0.0, 0.3, { emissive: 0x0088ff, emissiveIntensity: 1.0 });
  g.add(box(0.6, 0.008, 0.01, ledStrip, 0, 0.14, 0.24));
  g.add(box(0.6, 0.008, 0.01, ledStrip, 0, 0.14, -0.24));

  // ── Control panel (small screen on top-front) ──
  g.add(box(0.1, 0.04, 0.01, M.screen, 0, 0.19, 0.2));

  // ── Status light ──
  g.add(createStatusLight(0.25, 0.16, 0));

  return g;
}
