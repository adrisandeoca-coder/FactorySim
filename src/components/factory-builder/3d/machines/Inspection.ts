import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * CMM / Quality Inspection Station
 * ~1.4w x ~1.6h x ~1.0d
 */
export function buildInspection(): THREE.Group {
  const g = new THREE.Group();

  // ── Anti-vibration pads at 4 corners ──
  const padOffsets: [number, number][] = [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]];
  for (const [px, pz] of padOffsets) {
    g.add(cyl(0.06, 0.07, 0.02, 12, M.rubber, px, 0.01, pz));
    g.add(cyl(0.04, 0.04, 0.03, 8, M.darkChrome, px, 0.035, pz));
  }

  // ── Granite surface plate base ──
  const graniteMat = M.granite;
  const plate = box(1.2, 0.1, 0.8, graniteMat, 0, 0.1, 0);
  plate.name = 'surfacePlate';
  g.add(plate);

  // Granite surface detail (polished top strip)
  g.add(box(1.14, 0.005, 0.74, mat(0x505050, 0.15, 0.6), 0, 0.155, 0));

  // ── CMM bridge gantry ──
  const bridgeMat = M.bodyGray;
  // Left upright
  g.add(box(0.08, 0.7, 0.08, bridgeMat, -0.5, 0.5, 0));
  // Right upright
  g.add(box(0.08, 0.7, 0.08, bridgeMat, 0.5, 0.5, 0));
  // Crossbeam
  g.add(box(1.08, 0.08, 0.08, bridgeMat, 0, 0.88, 0));

  // Linear bearing covers on uprights
  g.add(box(0.1, 0.15, 0.06, M.bodyDark, -0.5, 0.4, 0));
  g.add(box(0.1, 0.15, 0.06, M.bodyDark, 0.5, 0.4, 0));

  // ── X-axis beam (horizontal slider on bridge) ──
  const xBeam = box(0.12, 0.06, 0.55, M.darkChrome, 0.1, 0.82, 0);
  xBeam.name = 'xBeam';
  g.add(xBeam);

  // X-axis linear rails
  g.add(box(0.9, 0.02, 0.03, M.chrome, 0, 0.85, -0.18));
  g.add(box(0.9, 0.02, 0.03, M.chrome, 0, 0.85, 0.18));

  // ── Z-axis quill (vertical probe arm) ──
  const quill = cyl(0.025, 0.025, 0.35, 12, M.chrome, 0.1, 0.62, 0.1);
  quill.name = 'quill';
  g.add(quill);

  // Quill housing
  g.add(box(0.08, 0.1, 0.08, M.bodyGray, 0.1, 0.76, 0.1));

  // ── Ruby probe tip ──
  const probeShaft = cyl(0.008, 0.008, 0.08, 8, M.chrome, 0.1, 0.41, 0.1);
  g.add(probeShaft);
  const rubyTip = sph(0.02, mat(0xcc2244, 0.1, 0.3, { emissive: 0x330011, emissiveIntensity: 0.3 }), 0.1, 0.37, 0.1);
  rubyTip.name = 'probeRuby';
  g.add(rubyTip);

  // ── Part on table being measured ──
  g.add(box(0.12, 0.06, 0.1, mat(0x8899aa, 0.8, 0.3), 0.1, 0.19, 0.1));
  // Part fixture clamps
  g.add(box(0.03, 0.04, 0.14, M.darkChrome, -0.02, 0.17, 0.1));
  g.add(box(0.03, 0.04, 0.14, M.darkChrome, 0.22, 0.17, 0.1));

  // ── PC monitor on side arm ──
  // Monitor arm post
  g.add(cyl(0.02, 0.02, 0.5, 8, M.darkChrome, -0.7, 0.4, -0.25));
  // Monitor arm horizontal
  g.add(box(0.2, 0.02, 0.02, M.darkChrome, -0.7, 0.65, -0.15));
  // Monitor bezel
  g.add(box(0.02, 0.25, 0.2, M.bodyDark, -0.7, 0.75, -0.1));
  // Screen
  g.add(box(0.005, 0.2, 0.16, M.screen, -0.688, 0.76, -0.1));

  // ── Keyboard on small shelf ──
  g.add(box(0.15, 0.01, 0.06, mat(0x2a2a2a, 0.1, 0.8), -0.7, 0.16, 0.15));

  // ── Cable bundle on back ──
  g.add(cyl(0.02, 0.02, 0.6, 8, M.wire, 0, 0.5, -0.42, 0, 0, 0.15));

  // ── Status light ──
  const statusLight = createStatusLight(0.55, 0.88, -0.35);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
