import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Surface / Cylindrical Grinder
 * Low, wide silhouette with prominent wheel guard, ~1.0w x ~0.7h x ~0.6d
 */
export function buildGrinder(): THREE.Group {
  const g = new THREE.Group();

  // ── Wide low base ──
  g.add(box(1.0, 0.4, 0.6, M.bodyGray, 0, 0.2, 0));

  // ── Wheel guard (half-dome shape using sphere segments) ──
  // Outer guard housing (large cylinder, partial cover)
  const guard = cyl(0.3, 0.3, 0.12, 24, M.bodyDark, -0.35, 0.55, 0);
  guard.name = 'wheelGuard';
  g.add(guard);
  // Guard cap on top
  g.add(cyl(0.28, 0.24, 0.04, 24, M.bodyDark, -0.35, 0.62, 0));

  // ── Grinding wheel inside guard (partially visible) ──
  const spindle = cyl(0.22, 0.22, 0.08, 24, M.chrome, -0.35, 0.55, 0);
  spindle.name = 'spindle';
  g.add(spindle);

  // Wheel arbor (axle)
  g.add(cyl(0.03, 0.03, 0.16, 12, M.darkChrome, -0.35, 0.55, 0));

  // ── Magnetic chuck table (chrome flat surface) ──
  const chuck = box(0.5, 0.04, 0.35, M.chrome, 0.15, 0.42, 0);
  chuck.name = 'chuck';
  g.add(chuck);

  // Chuck surface detail lines
  const lineMat = mat(0x8890a0, 0.85, 0.15);
  for (let i = -3; i <= 3; i++) {
    g.add(box(0.44, 0.003, 0.01, lineMat, 0.15, 0.445, i * 0.04));
  }

  // ── Coolant splash guard (glass panel) ──
  g.add(box(0.3, 0.2, 0.02, M.glass, 0.15, 0.55, 0.18));

  // ── Control pendant on flexible arm ──
  // Arm post
  g.add(cyl(0.015, 0.015, 0.25, 8, M.darkChrome, 0.45, 0.53, 0.2));
  // Arm horizontal
  g.add(box(0.12, 0.015, 0.015, M.darkChrome, 0.39, 0.66, 0.2));
  // Pendant box
  g.add(box(0.1, 0.08, 0.06, M.bodyGray, 0.35, 0.71, 0.2));
  // Pendant screen
  g.add(box(0.005, 0.05, 0.04, M.screen, 0.305, 0.72, 0.2));

  // ── Dresser tool on side ──
  g.add(box(0.04, 0.06, 0.04, M.darkChrome, -0.1, 0.45, -0.22));
  g.add(cyl(0.006, 0.006, 0.04, 6, M.chrome, -0.1, 0.49, -0.22));

  // ── Status light ──
  const statusLight = createStatusLight(0.42, 0.4, -0.25);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
