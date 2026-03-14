import * as THREE from 'three';
import { box, cyl, tor, createStatusLight } from '../shared/helpers';
import { M } from '../shared/materials';

/**
 * Filling Station with vertical tank
 * Tall narrow silhouette dominated by vertical tank, ~0.6w x ~1.5h x ~0.5d
 */
export function buildFilling(): THREE.Group {
  const g = new THREE.Group();

  // ── Base station body ──
  g.add(box(0.6, 0.4, 0.5, M.bodyGray, 0, 0.2, 0));

  // ── Tall vertical cylinder tank on top ──
  const tank = cyl(0.2, 0.2, 0.8, 20, M.pipe, 0, 0.8, 0);
  tank.name = 'tank';
  g.add(tank);

  // ── Tank cap (dark chrome disc on top) ──
  g.add(cyl(0.22, 0.22, 0.03, 20, M.darkChrome, 0, 1.22, 0));
  g.add(cyl(0.06, 0.06, 0.04, 12, M.chrome, 0, 1.25, 0));

  // ── Tank bottom cap ──
  g.add(cyl(0.22, 0.22, 0.03, 20, M.darkChrome, 0, 0.38, 0));

  // ── Fill level sight glass on tank side (glass material, thin vertical strip) ──
  g.add(box(0.03, 0.5, 0.02, M.glass, 0.2, 0.8, 0));
  // Sight glass mounting brackets
  g.add(box(0.04, 0.04, 0.02, M.darkChrome, 0.2, 1.05, 0));
  g.add(box(0.04, 0.04, 0.02, M.darkChrome, 0.2, 0.55, 0));

  // ── Dispensing nozzle below tank (chrome, pointing down) ──
  g.add(cyl(0.03, 0.02, 0.12, 10, M.chrome, 0, 0.28, 0.15));
  // Nozzle tip
  g.add(cyl(0.015, 0.01, 0.04, 8, M.chrome, 0, 0.22, 0.15));

  // ── Drip tray at base ──
  g.add(box(0.25, 0.02, 0.2, M.darkChrome, 0, 0.01, 0.15));
  // Tray rim
  g.add(box(0.25, 0.03, 0.01, M.darkChrome, 0, 0.025, 0.25));

  // ── Control valve wheel (torus) ──
  g.add(tor(0.06, 0.012, M.chrome, -0.2, 0.65, 0.08, Math.PI / 2, 0, 0));
  // Valve stem
  g.add(cyl(0.01, 0.01, 0.06, 8, M.darkChrome, -0.2, 0.65, 0.14));

  // ── Hose connection (rubber small cylinder) ──
  g.add(cyl(0.025, 0.025, 0.08, 10, M.rubber, -0.2, 0.5, 0.2));

  // ── Pressure gauge on tank ──
  g.add(cyl(0.04, 0.04, 0.015, 12, M.chrome, 0.15, 1.0, 0.15));
  g.add(cyl(0.035, 0.035, 0.005, 12, M.glass, 0.15, 1.01, 0.15));

  // ── Status light beside tank ──
  const statusLight = createStatusLight(0.3, 0.4, -0.2);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
