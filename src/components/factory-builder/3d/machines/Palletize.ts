import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M } from '../shared/materials';

/**
 * Palletizer
 * ~1.6w x ~1.5h x ~1.4d
 */
export function buildPalletize(): THREE.Group {
  const g = new THREE.Group();

  // ── Base platform ──
  g.add(box(1.6, 0.06, 1.4, M.bodyDark, 0, 0.03, 0));

  // ── Short infeed conveyor section (right side) ──
  // Side rails
  g.add(box(0.03, 0.12, 0.5, M.darkChrome, 0.55, 0.12, -0.45));
  g.add(box(0.03, 0.12, 0.5, M.darkChrome, 0.75, 0.12, -0.45));
  // Belt surface
  g.add(box(0.18, 0.02, 0.5, M.conveyor, 0.65, 0.17, -0.45));
  // Rollers
  for (let i = 0; i < 4; i++) {
    const rz = -0.65 + i * 0.12;
    g.add(cyl(0.025, 0.025, 0.18, 8, M.chrome, 0.65, 0.1, rz, 0, 0, Math.PI / 2));
  }
  // Box on conveyor
  g.add(box(0.14, 0.1, 0.12, M.cardboard, 0.65, 0.24, -0.5));

  // ── Layer-forming table (elevated platform) ──
  g.add(box(0.6, 0.04, 0.5, M.table, 0.15, 0.25, -0.45));
  // Table legs
  for (const [lx, lz] of [[- 0.1, -0.65], [0.4, -0.65], [-0.1, -0.25], [0.4, -0.25]] as [number, number][]) {
    g.add(box(0.04, 0.2, 0.04, M.darkChrome, lx, 0.13, lz));
  }

  // ── Push bar mechanism ──
  // Rail
  g.add(box(0.6, 0.03, 0.03, M.chrome, 0.15, 0.35, -0.7));
  // Push bar
  g.add(box(0.5, 0.06, 0.02, M.bodyGray, 0.15, 0.32, -0.55));
  // Push bar guide blocks
  g.add(box(0.06, 0.04, 0.04, M.darkChrome, -0.08, 0.35, -0.55));
  g.add(box(0.06, 0.04, 0.04, M.darkChrome, 0.38, 0.35, -0.55));

  // ── Active pallet on floor ──
  const palletMat = M.pallet;
  // Pallet boards (top)
  for (let i = 0; i < 5; i++) {
    const px = -0.32 + i * 0.16;
    g.add(box(0.12, 0.02, 0.6, palletMat, px, 0.08, 0.3));
  }
  // Pallet stringers (3 bottom runners)
  for (const sz of [-0.2, 0.3, 0.55]) {
    g.add(box(0.7, 0.06, 0.06, palletMat, 0, 0.04, sz));
  }

  // ── Boxes stacked on pallet (2 layers) ──
  const cbMat = M.cardboard;
  // Layer 1 (4 boxes)
  for (const [bx, bz] of [[-0.2, 0.15], [0.15, 0.15], [-0.2, 0.45], [0.15, 0.45]] as [number, number][]) {
    g.add(box(0.28, 0.14, 0.24, cbMat, bx, 0.17, bz));
  }
  // Layer 2 (3 boxes, offset)
  for (const [bx, bz] of [[-0.1, 0.2], [0.2, 0.2], [0.05, 0.45]] as [number, number][]) {
    g.add(box(0.28, 0.14, 0.24, cbMat, bx, 0.31, bz));
  }

  // ── Safety fence posts at corners (yellow) ──
  const fencePos: [number, number][] = [[-0.75, -0.65], [0.75, -0.65], [-0.75, 0.65], [0.75, 0.65]];
  for (const [fx, fz] of fencePos) {
    g.add(cyl(0.025, 0.025, 1.2, 8, M.yellow, fx, 0.6, fz));
    // Top cap
    g.add(cyl(0.035, 0.035, 0.03, 8, M.yellow, fx, 1.21, fz));
  }
  // Fence wire between posts (horizontal)
  for (const fy of [0.5, 0.9]) {
    g.add(box(1.5, 0.01, 0.01, M.yellow, 0, fy, -0.65));
    g.add(box(1.5, 0.01, 0.01, M.yellow, 0, fy, 0.65));
    g.add(box(0.01, 0.01, 1.3, M.yellow, -0.75, fy, 0));
    g.add(box(0.01, 0.01, 1.3, M.yellow, 0.75, fy, 0));
  }

  // ── HMI panel on post ──
  g.add(cyl(0.02, 0.02, 0.8, 8, M.darkChrome, -0.75, 0.8, -0.65));
  g.add(box(0.02, 0.15, 0.12, M.bodyDark, -0.74, 1.1, -0.65));
  g.add(box(0.005, 0.1, 0.08, M.screen, -0.732, 1.12, -0.65));

  // ── Status light ──
  const statusLight = createStatusLight(0.7, 1.2, -0.6);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
