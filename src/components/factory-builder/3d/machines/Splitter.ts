import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Flow Diverter / Splitter
 * Wide, low junction with input pipe, two angled output pipes, diverter gate.
 * Footprint: ~1.2w x ~0.5h x ~0.6d
 */
export function buildSplitter(): THREE.Group {
  const g = new THREE.Group();

  // ── Wide octagonal base platform ──
  g.add(cyl(0.5, 0.5, 0.15, 8, M.bodyDark, 0, 0.075, 0));

  // ── Junction housing on top ──
  g.add(cyl(0.35, 0.35, 0.2, 8, M.bodyGray, 0, 0.25, 0));

  // ── Input port stub (left side, horizontal pipe) ──
  g.add(cyl(0.06, 0.06, 0.25, 8, M.pipe, -0.5, 0.25, 0, 0, 0, Math.PI / 2));
  // Input flange
  g.add(cyl(0.08, 0.08, 0.03, 8, M.darkChrome, -0.62, 0.25, 0, 0, 0, Math.PI / 2));

  // ── Two output port stubs (right side, angled) ──
  g.add(cyl(0.05, 0.05, 0.25, 8, M.pipe, 0.45, 0.25, 0.2, 0, 0, Math.PI / 2));
  g.add(cyl(0.05, 0.05, 0.25, 8, M.pipe, 0.45, 0.25, -0.2, 0, 0, Math.PI / 2));
  // Output flanges
  g.add(cyl(0.07, 0.07, 0.03, 8, M.darkChrome, 0.57, 0.25, 0.2, 0, 0, Math.PI / 2));
  g.add(cyl(0.07, 0.07, 0.03, 8, M.darkChrome, 0.57, 0.25, -0.2, 0, 0, Math.PI / 2));

  // ── Diverter gate inside junction (thin rotatable plate) ──
  g.add(box(0.2, 0.12, 0.015, M.chrome, 0.1, 0.25, 0, 0, 0.4, 0));

  // ── Active route indicator (green emissive sphere on one output) ──
  const routeIndicator = sph(0.035, mat(0x00ff66, 0.1, 0.3, { emissive: 0x00ff66, emissiveIntensity: 1.0 }), 0.57, 0.25, 0.2);
  routeIndicator.name = 'routeIndicator';
  g.add(routeIndicator);

  // ── Pneumatic actuator on top of junction ──
  g.add(cyl(0.04, 0.04, 0.12, 8, M.chrome, 0, 0.41, 0));
  // Actuator mounting ring
  g.add(cyl(0.06, 0.06, 0.02, 8, M.darkChrome, 0, 0.36, 0));

  // ── Status light ──
  const statusLight = createStatusLight(0.35, 0.35, -0.3);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
