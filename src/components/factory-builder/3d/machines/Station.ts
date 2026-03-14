import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * CNC Vertical Machining Center
 * ~1.6w x ~1.8h x ~1.2d (footprint fits within 2x2 units)
 */
export function buildStation(): THREE.Group {
  const g = new THREE.Group();

  // ── Base cabinet (heavy cast-iron) ──
  const base = box(1.6, 0.3, 1.2, M.bodyDark, 0, 0.15, 0);
  base.name = 'base';
  g.add(base);

  // ── 4 adjustable leveling feet ──
  const legMat = M.darkChrome;
  const legOffsets: [number, number][] = [[-0.65, -0.45], [0.65, -0.45], [-0.65, 0.45], [0.65, 0.45]];
  for (const [lx, lz] of legOffsets) {
    // Foot pad
    g.add(cyl(0.06, 0.07, 0.02, 12, M.rubber, lx, 0.01, lz));
    // Adjustable leg cylinder
    g.add(cyl(0.035, 0.035, 0.06, 8, legMat, lx, 0.04, lz));
  }

  // ── Column / upright on back ──
  const column = box(0.35, 1.2, 0.3, M.bodyGray, 0, 0.9, -0.45);
  column.name = 'column';
  g.add(column);

  // Column reinforcement ribs (2 triangular-ish fins)
  g.add(box(0.04, 0.5, 0.2, M.bodyDark, -0.12, 0.55, -0.35));
  g.add(box(0.04, 0.5, 0.2, M.bodyDark, 0.12, 0.55, -0.35));

  // ── Spindle head assembly (named 'spindle' for rotation) ──
  const spindle = new THREE.Group();
  spindle.name = 'spindle';

  // Spindle housing block
  spindle.add(box(0.22, 0.25, 0.22, M.bodyGray, 0, 0, 0));
  // Spindle motor top cylinder
  spindle.add(cyl(0.08, 0.08, 0.14, 16, M.darkChrome, 0, 0.14, 0));
  // Motor cap
  spindle.add(cyl(0.06, 0.06, 0.03, 16, M.chrome, 0, 0.22, 0));
  // Spindle nose (lower cylinder, rotating part)
  spindle.add(cyl(0.06, 0.05, 0.1, 16, M.chrome, 0, -0.175, 0));
  // Tool holder (collet)
  spindle.add(cyl(0.04, 0.025, 0.08, 12, M.darkChrome, 0, -0.26, 0));
  // End mill tool
  spindle.add(cyl(0.015, 0.015, 0.12, 8, M.chrome, 0, -0.36, 0));
  // End mill flutes (slightly wider section)
  spindle.add(cyl(0.02, 0.018, 0.04, 6, mat(0xb0b8c0, 0.9, 0.15), 0, -0.39, 0));

  spindle.position.set(0, 1.25, -0.3);
  g.add(spindle);

  // ── Z-axis rail on column face ──
  g.add(box(0.04, 0.8, 0.04, M.chrome, -0.1, 0.9, -0.28));
  g.add(box(0.04, 0.8, 0.04, M.chrome, 0.1, 0.9, -0.28));

  // ── T-slot work table ──
  const table = box(1.0, 0.06, 0.7, M.table, 0, 0.33, 0.05);
  table.name = 'table';
  g.add(table);

  // T-slot grooves (5 dark strips)
  const slotMat = mat(0x1a1e24, 0.5, 0.7);
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.94, 0.005, 0.02, slotMat, 0, 0.365, 0.05 + i * 0.13));
  }

  // ── Vise on table ──
  const viseMat = M.bodyGray;
  // Fixed jaw
  g.add(box(0.3, 0.1, 0.08, viseMat, 0, 0.41, -0.1));
  // Movable jaw
  g.add(box(0.3, 0.1, 0.06, viseMat, 0, 0.41, 0.08));
  // Vise screw handle
  g.add(cyl(0.01, 0.01, 0.15, 8, M.chrome, 0, 0.43, 0.14, Math.PI / 2, 0, 0));
  // Workpiece in vise
  g.add(box(0.12, 0.06, 0.1, mat(0x8899aa, 0.8, 0.3), 0, 0.42, -0.01));

  // ── Glass enclosure panels ──
  // Left panel
  g.add(box(0.02, 0.9, 1.1, M.glass, -0.79, 0.78, -0.05));
  // Right panel
  g.add(box(0.02, 0.9, 1.1, M.glass, 0.79, 0.78, -0.05));
  // Back panel (above column area)
  g.add(box(1.56, 0.9, 0.02, M.glass, 0, 0.78, -0.59));

  // ── Steel frame for enclosure ──
  const frameMat = M.darkChrome;
  // Vertical corner posts
  const framePosts: [number, number][] = [[-0.78, -0.58], [0.78, -0.58], [-0.78, 0.48], [0.78, 0.48]];
  for (const [fx, fz] of framePosts) {
    g.add(box(0.03, 0.9, 0.03, frameMat, fx, 0.78, fz));
  }
  // Top horizontal rails
  g.add(box(1.56, 0.03, 0.03, frameMat, 0, 1.22, -0.58));
  g.add(box(1.56, 0.03, 0.03, frameMat, 0, 1.22, 0.48));
  g.add(box(0.03, 0.03, 1.06, frameMat, -0.78, 1.22, -0.05));
  g.add(box(0.03, 0.03, 1.06, frameMat, 0.78, 1.22, -0.05));

  // ── Control panel on right side ──
  const panelGroup = new THREE.Group();
  panelGroup.position.set(0.82, 0.75, 0.2);

  // Panel backing
  panelGroup.add(box(0.04, 0.45, 0.35, M.bodyGray, 0, 0, 0));
  // Screen
  panelGroup.add(box(0.005, 0.2, 0.25, M.screen, 0.025, 0.06, 0));
  // Screen bezel
  panelGroup.add(box(0.008, 0.22, 0.27, M.bodyDark, 0.022, 0.06, 0));

  // Buttons row (5 small buttons)
  const btnColors = [M.green, M.blue, M.yellow, M.blue, M.green];
  for (let i = 0; i < 5; i++) {
    panelGroup.add(sph(0.015, btnColors[i], 0.03, -0.14, -0.1 + i * 0.05));
  }

  // E-stop button (red mushroom)
  panelGroup.add(cyl(0.03, 0.03, 0.02, 12, M.red, 0.03, -0.18, 0.1));
  panelGroup.add(cyl(0.02, 0.02, 0.015, 12, M.yellow, 0.04, -0.18, 0.1));

  // Keyswitch
  panelGroup.add(cyl(0.012, 0.012, 0.015, 8, M.chrome, 0.03, -0.14, 0.12));

  g.add(panelGroup);

  // ── Coolant nozzles (2 aimed at work zone) ──
  const nozzleMat = mat(0x556570, 0.6, 0.4);
  // Left nozzle
  g.add(cyl(0.015, 0.01, 0.12, 8, nozzleMat, -0.2, 0.85, -0.22, 0.5, 0, 0.3));
  // Right nozzle
  g.add(cyl(0.015, 0.01, 0.12, 8, nozzleMat, 0.2, 0.85, -0.22, 0.5, 0, -0.3));
  // Coolant hose connections
  g.add(cyl(0.02, 0.02, 0.04, 8, M.rubber, -0.25, 0.9, -0.28));
  g.add(cyl(0.02, 0.02, 0.04, 8, M.rubber, 0.25, 0.9, -0.28));

  // ── Chip tray at base front ──
  const trayMat = mat(0x4a4e58, 0.5, 0.6);
  g.add(box(0.8, 0.04, 0.15, trayMat, 0, 0.32, 0.52));
  // Tray lip
  g.add(box(0.8, 0.06, 0.02, trayMat, 0, 0.34, 0.59));
  // Simulated chips in tray
  const chipMat = mat(0x889098, 0.7, 0.4);
  for (let i = 0; i < 6; i++) {
    const cx = -0.25 + Math.sin(i * 1.7) * 0.25;
    const cz = 0.5 + Math.cos(i * 2.1) * 0.04;
    g.add(box(0.04, 0.01, 0.02, chipMat, cx, 0.35, cz));
  }

  // ── Way covers (accordion bellows on X-axis) ──
  const bellowsMat = mat(0x2a2e34, 0.1, 0.8);
  g.add(box(0.25, 0.06, 0.65, bellowsMat, -0.5, 0.33, -0.05));
  g.add(box(0.25, 0.06, 0.65, bellowsMat, 0.5, 0.33, -0.05));

  // ── Status light on top of column ──
  const statusLight = createStatusLight(0, 1.5, -0.45);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
