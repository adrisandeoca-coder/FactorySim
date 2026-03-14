import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * CNC Vertical Machining Center
 * Tall column + glass enclosure, ~1.5w x ~2.0h x ~1.2d
 */
export function buildCNCMill(): THREE.Group {
  const g = new THREE.Group();

  const bodyWidth = 1.5;
  const bodyDepth = 1.0;
  const glassMat = mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.15, side: THREE.DoubleSide });

  // ── Chip tray at base (slightly wider than body) ──
  g.add(box(bodyWidth + 0.1, 0.06, bodyDepth + 0.05, M.darkChrome, 0, 0.03, 0));

  // ── Heavy base (wide, short) ──
  g.add(box(bodyWidth, 0.2, bodyDepth, M.bodyDark, 0, 0.16, 0));

  // ── Main enclosure body ──
  const enclosureHeight = 0.8;
  const enclosureY = 0.26 + enclosureHeight / 2;
  g.add(box(bodyWidth, enclosureHeight, bodyDepth, M.bodyDark, 0, enclosureY, 0));

  // ── Glass enclosure panels on 3 sides (inset from body edges) ──
  const glassHeight = enclosureHeight - 0.1;
  const glassY = enclosureY + 0.02;
  const inset = 0.04;
  // Left
  g.add(box(0.02, glassHeight, bodyDepth - inset * 2, glassMat, -(bodyWidth / 2 - inset), glassY, 0));
  // Right
  g.add(box(0.02, glassHeight, bodyDepth - inset * 2, glassMat, (bodyWidth / 2 - inset), glassY, 0));
  // Front
  g.add(box(bodyWidth - inset * 2, glassHeight, 0.02, glassMat, 0, glassY, bodyDepth / 2 - inset));

  // ── Interior PointLight (blue-white work light) ──
  const interiorLight = new THREE.PointLight(0x80d0ff, 1.2, 2.5);
  interiorLight.position.set(0, enclosureY, 0);
  interiorLight.name = 'interiorLight';
  g.add(interiorLight);

  // ── Column profile sitting ON TOP of main body ──
  const columnWidth = 0.35;
  const columnHeight = 0.6;
  const columnTop = 0.26 + enclosureHeight + columnHeight;
  const column = box(columnWidth, columnHeight, 0.45, M.bodyGray, 0, 0.26 + enclosureHeight + columnHeight / 2, -0.25);
  column.name = 'column';
  g.add(column);

  // ── T-slot table at working height ──
  const table = box(0.8, 0.05, 0.5, M.chrome, 0, 0.45, 0.05);
  table.name = 'table';
  g.add(table);

  // T-slot grooves
  const slotMat = mat(0x1a1e24, 0.5, 0.7);
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.74, 0.005, 0.015, slotMat, 0, 0.48, 0.05 + i * 0.1));
  }

  // ── Spindle head hanging from column ──
  const spindle = new THREE.Group();
  spindle.name = 'spindle';
  // Housing
  spindle.add(box(0.18, 0.2, 0.18, M.bodyGray, 0, 0, 0));
  // Motor cylinder on top
  spindle.add(cyl(0.06, 0.06, 0.12, 16, M.darkChrome, 0, 0.12, 0));
  // Spindle nose below
  spindle.add(cyl(0.04, 0.03, 0.08, 12, M.chrome, 0, -0.14, 0));
  // Tool holder
  spindle.add(cyl(0.025, 0.015, 0.06, 10, M.darkChrome, 0, -0.21, 0));
  // End mill
  spindle.add(cyl(0.012, 0.012, 0.1, 8, M.chrome, 0, -0.31, 0));
  spindle.position.set(0, columnTop - 0.15, -0.1);
  g.add(spindle);

  // Z-axis rails on column face
  g.add(box(0.03, columnHeight * 0.8, 0.03, M.chrome, -0.1, columnTop - columnHeight / 2, -0.01));
  g.add(box(0.03, columnHeight * 0.8, 0.03, M.chrome, 0.1, columnTop - columnHeight / 2, -0.01));

  // ── Control panel on right side ──
  const panel = new THREE.Group();
  panel.position.set(0.72, 0.7, 0.25);
  panel.add(box(0.04, 0.35, 0.3, M.bodyGray, 0, 0, 0));
  panel.add(box(0.005, 0.18, 0.2, M.screen, 0.025, 0.04, 0));
  panel.add(box(0.008, 0.2, 0.22, M.bodyDark, 0.022, 0.04, 0));
  g.add(panel);

  // ── Coolant nozzle (small chrome cylinder angled toward table) ──
  g.add(cyl(0.012, 0.008, 0.1, 8, M.chrome, 0.15, 0.8, -0.15, 0.5, 0, -0.3));

  // ── Status light on top of column ──
  const statusLight = createStatusLight(0, columnTop + 0.05, -0.25);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
