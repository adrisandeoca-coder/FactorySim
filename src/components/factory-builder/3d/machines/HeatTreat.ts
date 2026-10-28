import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Heat Treatment Furnace / Oven
 * Wide squat body with exhaust stack and orange door glow, ~1.0w x ~1.1h x ~0.8d
 */
export function buildHeatTreat(): THREE.Group {
  const g = new THREE.Group();

  // ── Wide squat furnace body ──
  g.add(box(1.0, 0.6, 0.8, M.bodyDark, 0, 0.3, 0));

  // ── Exhaust stack on top ──
  const stack = cyl(0.08, 0.08, 0.5, 12, M.pipe, 0.25, 0.85, -0.15);
  stack.name = 'exhaustStack';
  g.add(stack);
  // Stack cap / rain guard
  g.add(cyl(0.1, 0.1, 0.02, 12, M.darkChrome, 0.25, 1.12, -0.15));
  g.add(cyl(0.1, 0.06, 0.04, 12, M.darkChrome, 0.25, 1.15, -0.15));

  // ── Front door ──
  g.add(box(0.6, 0.4, 0.02, M.bodyGray, 0, 0.32, 0.41));

  // Orange glow effect inside door
  const glowMat = mat(0xff6600, 0.0, 0.5, { emissive: 0xff4400, emissiveIntensity: 1.5 });
  g.add(box(0.5, 0.3, 0.01, glowMat, 0, 0.32, 0.39));

  // ── Insulation trim around door edges (rubber) ──
  // Top
  g.add(box(0.64, 0.03, 0.03, M.rubber, 0, 0.54, 0.41));
  // Bottom
  g.add(box(0.64, 0.03, 0.03, M.rubber, 0, 0.1, 0.41));
  // Left
  g.add(box(0.03, 0.44, 0.03, M.rubber, -0.32, 0.32, 0.41));
  // Right
  g.add(box(0.03, 0.44, 0.03, M.rubber, 0.32, 0.32, 0.41));

  // ── Heavy-duty hinges on door side ──
  g.add(cyl(0.02, 0.02, 0.06, 8, M.chrome, -0.32, 0.45, 0.42));
  g.add(cyl(0.02, 0.02, 0.06, 8, M.chrome, -0.32, 0.2, 0.42));

  // ── Door handle ──
  g.add(box(0.04, 0.08, 0.04, M.chrome, 0.28, 0.32, 0.44));

  // ── Temperature display panel on side ──
  g.add(box(0.02, 0.15, 0.12, M.bodyGray, 0.51, 0.4, 0.1));
  g.add(box(0.005, 0.1, 0.08, M.screen, 0.525, 0.42, 0.1));

  // ── Feet / supports ──
  const footOffsets: [number, number][] = [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]];
  for (const [fx, fz] of footOffsets) {
    g.add(box(0.08, 0.04, 0.08, M.darkChrome, fx, 0.02, fz));
  }

  // ── Status light on top of exhaust stack ──
  const statusLight = createStatusLight(0.25, 1.17, -0.15);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
