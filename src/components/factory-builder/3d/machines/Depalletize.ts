import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Depalletizer / Pallet Unstacker
 * ~1.4w x ~1.7h x ~1.2d
 */
export function buildDepalletize(): THREE.Group {
  const g = new THREE.Group();

  // ── Base floor plate ──
  g.add(box(1.4, 0.04, 1.2, M.bodyDark, 0, 0.02, 0));

  // ── Loaded pallet with stacked boxes (center) ──
  // Pallet boards
  const palletMat = M.pallet;
  for (let i = 0; i < 5; i++) {
    const px = -0.28 + i * 0.14;
    g.add(box(0.1, 0.02, 0.5, palletMat, px, 0.06, 0));
  }
  // Pallet stringers
  for (const sz of [-0.18, 0, 0.18]) {
    g.add(box(0.6, 0.05, 0.05, palletMat, 0, 0.035, sz));
  }

  // Box stack (4 layers, 2 boxes per layer)
  const cbMat = M.cardboard;
  for (let layer = 0; layer < 4; layer++) {
    const ly = 0.14 + layer * 0.14;
    g.add(box(0.26, 0.12, 0.22, cbMat, -0.14, ly, 0));
    g.add(box(0.26, 0.12, 0.22, cbMat, 0.14, ly, 0));
  }

  // ── Vertical lift columns (2 tall posts) ──
  const colMat = M.bodyGray;
  g.add(box(0.08, 1.5, 0.08, colMat, -0.55, 0.75, 0));
  g.add(box(0.08, 1.5, 0.08, colMat, 0.55, 0.75, 0));

  // Crossbeam at top
  g.add(box(1.1, 0.06, 0.08, M.darkChrome, 0, 1.52, 0));

  // ── Linear rail guides on posts ──
  g.add(box(0.03, 1.3, 0.03, M.chrome, -0.55, 0.7, 0.06));
  g.add(box(0.03, 1.3, 0.03, M.chrome, 0.55, 0.7, 0.06));

  // ── Elevation carriage (rail slider blocks) ──
  g.add(box(0.1, 0.08, 0.06, M.darkChrome, -0.55, 1.1, 0.06));
  g.add(box(0.1, 0.08, 0.06, M.darkChrome, 0.55, 1.1, 0.06));
  // Carriage crossbar
  g.add(box(1.0, 0.04, 0.06, M.bodyGray, 0, 1.1, 0.06));

  // ── Vacuum picker head ──
  // Flat plate
  g.add(box(0.55, 0.03, 0.35, M.darkChrome, 0, 1.05, 0));
  // Suction cups (small cylinders underneath, 3x2 grid)
  const cupMat = M.rubber;
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz += 2) {
      g.add(cyl(0.03, 0.04, 0.03, 8, cupMat, cx * 0.18, 1.02, cz * 0.1));
    }
  }
  // Vacuum hose connection on top
  g.add(cyl(0.025, 0.025, 0.06, 8, M.rubber, 0, 1.1, 0));
  g.add(cyl(0.015, 0.015, 0.2, 8, mat(0x333344, 0.1, 0.7), 0, 1.22, 0, 0.3, 0, 0));

  // ── Drive motor on column ──
  g.add(cyl(0.06, 0.06, 0.1, 12, M.darkChrome, -0.55, 1.45, -0.08));
  g.add(box(0.05, 0.05, 0.05, M.bodyDark, -0.55, 1.42, -0.06));

  // ── Empty pallet exit area (side) ──
  // Smaller pallet on right side
  for (let i = 0; i < 4; i++) {
    g.add(box(0.08, 0.02, 0.4, palletMat, 0.85 + i * 0.1, 0.06, -0.4));
  }
  for (const sz of [-0.55, -0.4, -0.25]) {
    g.add(box(0.4, 0.04, 0.04, palletMat, 0.95, 0.035, sz));
  }

  // ── Safety light curtain posts ──
  const curtainMat = mat(0xcc4400, 0.1, 0.6);
  // Left post
  g.add(cyl(0.02, 0.02, 1.3, 8, curtainMat, -0.65, 0.65, 0.55));
  g.add(cyl(0.025, 0.025, 0.04, 8, M.yellow, -0.65, 1.32, 0.55));
  // Right post
  g.add(cyl(0.02, 0.02, 1.3, 8, curtainMat, 0.65, 0.65, 0.55));
  g.add(cyl(0.025, 0.025, 0.04, 8, M.yellow, 0.65, 1.32, 0.55));
  // Emitter/receiver heads
  g.add(box(0.03, 0.15, 0.03, M.red, -0.65, 0.7, 0.55));
  g.add(box(0.03, 0.15, 0.03, M.bodyDark, 0.65, 0.7, 0.55));

  // ── Status light ──
  const statusLight = createStatusLight(0.55, 1.52, -0.45);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
