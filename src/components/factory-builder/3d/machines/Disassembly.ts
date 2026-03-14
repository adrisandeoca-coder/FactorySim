import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Disassembly / Teardown Station
 * ~1.6w x ~1.5h x ~1.2d
 */
export function buildDisassembly(): THREE.Group {
  const g = new THREE.Group();

  // ── Heavy workbench ──
  // Table top
  const tableMat = M.table;
  g.add(box(1.2, 0.05, 0.8, tableMat, 0, 0.45, 0));

  // 4 sturdy legs
  const legMat = M.darkChrome;
  const legPos: [number, number][] = [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]];
  for (const [lx, lz] of legPos) {
    g.add(box(0.06, 0.42, 0.06, legMat, lx, 0.21, lz));
    g.add(cyl(0.05, 0.055, 0.02, 8, M.rubber, lx, 0.01, lz));
  }

  // Lower shelf
  g.add(box(1.1, 0.03, 0.7, mat(0x3a3e48, 0.5, 0.6), 0, 0.15, 0));

  // ── Workpiece in clamp on table ──
  // Vise/clamp
  g.add(box(0.2, 0.08, 0.06, M.bodyGray, -0.1, 0.52, -0.1));
  g.add(box(0.2, 0.08, 0.05, M.bodyGray, -0.1, 0.52, 0.06));
  // Clamp screw
  g.add(cyl(0.01, 0.01, 0.1, 8, M.chrome, -0.1, 0.53, 0.12, Math.PI / 2, 0, 0));
  // Workpiece (partially disassembled component)
  g.add(box(0.14, 0.08, 0.1, mat(0x7788aa, 0.7, 0.35), -0.1, 0.54, -0.02));

  // ── Parts spread on table surface (scattered small items) ──
  const partMat = mat(0x8899aa, 0.8, 0.3);
  const scatterPos: [number, number, number, number, number][] = [
    [0.2, 0.49, -0.15, 0.04, 0.03],
    [0.3, 0.49, -0.05, 0.03, 0.02],
    [0.15, 0.49, 0.1, 0.05, 0.025],
    [0.35, 0.49, 0.15, 0.025, 0.04],
    [0.25, 0.49, 0.22, 0.03, 0.03],
  ];
  for (const [sx, sy, sz, sw, sd] of scatterPos) {
    g.add(box(sw, 0.015, sd, partMat, sx, sy, sz));
  }
  // Small bolts/screws
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.008, 0.008, 0.02, 6, M.chrome, 0.4 - i * 0.05, 0.49, -0.2));
  }

  // ── Multiple output bins (8 small bins in a row, front of table) ──
  const binColors = [
    mat(0x2255aa, 0.15, 0.7),
    mat(0x2266bb, 0.15, 0.7),
    mat(0x3377cc, 0.15, 0.7),
    mat(0x2255aa, 0.15, 0.7),
    mat(0x44aa44, 0.15, 0.7),
    mat(0x44aa44, 0.15, 0.7),
    mat(0xaa5522, 0.15, 0.7),
    mat(0xaa5522, 0.15, 0.7),
  ];
  for (let i = 0; i < 8; i++) {
    const bx = -0.5 + i * 0.14;
    const binMat = binColors[i];
    // Bin body (open top)
    g.add(box(0.12, 0.01, 0.12, binMat, bx, 0.48, 0.46));   // bottom
    g.add(box(0.12, 0.08, 0.01, binMat, bx, 0.52, 0.4));     // back
    g.add(box(0.12, 0.06, 0.01, binMat, bx, 0.51, 0.52));    // front (shorter)
    g.add(box(0.01, 0.08, 0.12, binMat, bx - 0.055, 0.52, 0.46)); // left
  }

  // ── Overhead boom arm (pivoting arm for tool hanger) ──
  // Vertical post (back left)
  g.add(cyl(0.04, 0.04, 1.1, 10, M.bodyGray, -0.65, 0.55, -0.35));
  // Pivot joint
  g.add(cyl(0.05, 0.05, 0.04, 12, M.darkChrome, -0.65, 1.12, -0.35));
  // Horizontal boom arm
  g.add(box(0.04, 0.04, 0.6, M.bodyGray, -0.65, 1.15, -0.05));
  // Arm end bracket
  g.add(box(0.06, 0.03, 0.06, M.darkChrome, -0.65, 1.13, 0.22));

  // ── Pneumatic tool balancer (cylinder hanging from arm) ──
  g.add(cyl(0.04, 0.04, 0.15, 10, M.darkChrome, -0.65, 1.05, 0.22));
  // Retractor cable
  g.add(cyl(0.006, 0.006, 0.2, 6, M.wire, -0.65, 0.93, 0.22));
  // Tool at end of cable (impact driver shape)
  g.add(cyl(0.025, 0.02, 0.1, 8, mat(0x445566, 0.6, 0.4), -0.65, 0.78, 0.22));
  // Tool bit
  g.add(cyl(0.008, 0.008, 0.05, 6, M.chrome, -0.65, 0.72, 0.22));

  // ── Waste bin beside table ──
  const wasteMat = mat(0x2a2a2a, 0.1, 0.85);
  g.add(cyl(0.12, 0.1, 0.35, 12, wasteMat, 0.7, 0.175, 0.1));
  // Bin rim
  g.add(cyl(0.13, 0.12, 0.02, 12, wasteMat, 0.7, 0.36, 0.1));
  // Some scrap inside
  g.add(box(0.06, 0.02, 0.04, partMat, 0.7, 0.3, 0.1));

  // ── Air hose coil on table edge ──
  g.add(cyl(0.06, 0.06, 0.03, 12, M.rubber, -0.45, 0.49, -0.3, Math.PI / 2, 0, 0));

  // ── Status light ──
  const statusLight = createStatusLight(0.55, 1.0, -0.35);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
