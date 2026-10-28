import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildCNCMill2(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const bodyPanel = mat(0x3a4250, 0.7, 0.4);
  const sheetMetal = mat(0x4a5868, 0.65, 0.45);
  const castIron = mat(0x353a42, 0.6, 0.55);
  const tableMetal = mat(0x5a6878, 0.8, 0.3);
  const spindleSteel = mat(0x8898a8, 0.85, 0.2);
  const viseSteel = mat(0x606878, 0.8, 0.25);
  const controlGray = mat(0x444c58, 0.5, 0.5);
  const windowTint = mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.2, side: THREE.DoubleSide });
  const coolantNozzle = mat(0xcc6633, 0.3, 0.5);
  const magazineGray = mat(0x3e4650, 0.6, 0.5);

  // ====== MACHINE BASE ======
  const baseW = 2.0;
  const baseD = 1.8;
  const baseH = 0.7;
  const mainBodyGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
  const mainBodyMesh = new THREE.Mesh(mainBodyGeo, castIron);
  mainBodyMesh.position.set(0, baseH / 2, 0);
  g.add(mainBodyMesh);
  // Edge detail overlay on main body
  const mainBodyEdges = new THREE.EdgesGeometry(mainBodyGeo);
  const mainBodyLines = new THREE.LineSegments(mainBodyEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  mainBodyLines.position.copy(mainBodyMesh.position);
  g.add(mainBodyLines);
  // Leveling feet
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.06, 0.08, 0.04, 8, M.rubber, sx * 0.85, 0.02, sz * 0.75));
      g.add(cyl(0.04, 0.04, 0.03, 8, M.chrome, sx * 0.85, 0.05, sz * 0.75));
    }
  }

  // ====== ENCLOSURE ======
  const encH = 1.5;
  const encY = baseH + encH / 2;
  // Back wall
  g.add(box(baseW, encH, 0.04, sheetMetal, 0, encY, -baseD / 2));
  // Left wall
  g.add(box(0.04, encH, baseD, sheetMetal, -baseW / 2, encY, 0));
  // Right wall
  g.add(box(0.04, encH, baseD, sheetMetal, baseW / 2, encY, 0));
  // Top
  g.add(box(baseW, 0.04, baseD, sheetMetal, 0, baseH + encH, 0));
  // Front lower panel
  g.add(box(baseW, 0.35, 0.04, sheetMetal, 0, baseH + 0.175, baseD / 2));

  // ====== SLIDING DOORS (front, showing interior) ======
  // Left door (partially open - slid left)
  g.add(box(0.6, encH - 0.4, 0.025, bodyPanel, -0.7, encY + 0.15, baseD / 2 + 0.02));
  // Left door panel inset (simulates recessed door panel detail)
  g.add(box(0.44, encH - 0.65, 0.008, mat(0x30384a, 0.6, 0.5), -0.7, encY + 0.25, baseD / 2 + 0.038));
  // Right door (partially open - slid right)
  g.add(box(0.6, encH - 0.4, 0.025, bodyPanel, 0.7, encY + 0.15, baseD / 2 + 0.02));
  // Right door panel inset
  g.add(box(0.44, encH - 0.65, 0.008, mat(0x30384a, 0.6, 0.5), 0.7, encY + 0.25, baseD / 2 + 0.038));
  // Viewing windows in doors
  g.add(box(0.4, 0.5, 0.015, windowTint, -0.7, encY + 0.3, baseD / 2 + 0.03));
  g.add(box(0.4, 0.5, 0.015, windowTint, 0.7, encY + 0.3, baseD / 2 + 0.03));
  // Door handles
  g.add(box(0.1, 0.025, 0.03, M.chrome, -0.42, encY + 0.1, baseD / 2 + 0.04));
  g.add(box(0.1, 0.025, 0.03, M.chrome, 0.42, encY + 0.1, baseD / 2 + 0.04));
  // Top rail
  g.add(cyl(0.012, 0.012, 1.8, 8, M.chrome, 0, baseH + encH - 0.08, baseD / 2 + 0.02, 0, 0, Math.PI / 2));

  // ====== COLUMN (rear upright) ======
  g.add(box(0.5, encH + 0.3, 0.6, castIron, 0, baseH + encH / 2 + 0.15, -baseD / 2 + 0.3));

  // ====== SPINDLE HEAD ======
  const spindleY = baseH + encH - 0.3;
  // Spindle housing
  g.add(box(0.35, 0.45, 0.35, castIron, 0, spindleY, -0.15));
  // Spindle nose
  g.add(cyl(0.08, 0.08, 0.15, 16, spindleSteel, 0, spindleY - 0.3, -0.15));
  // Tool holder taper
  g.add(cyl(0.04, 0.025, 0.1, 12, M.chrome, 0, spindleY - 0.42, -0.15));
  // Collet nut
  g.add(cyl(0.035, 0.035, 0.03, 12, M.darkChrome, 0, spindleY - 0.5, -0.15));
  // Tool (end mill)
  g.add(cyl(0.012, 0.012, 0.08, 8, mat(0x9aa0a8, 0.8, 0.2), 0, spindleY - 0.56, -0.15));
  // Spindle motor on top
  g.add(cyl(0.15, 0.15, 0.25, 16, M.bodyGray, 0, spindleY + 0.35, -0.15));
  // Belt cover
  g.add(box(0.2, 0.08, 0.25, sheetMetal, 0, spindleY + 0.2, -0.15));

  // ====== WORK TABLE WITH T-SLOTS ======
  const tableY = baseH + 0.3;
  g.add(box(1.2, 0.08, 0.7, tableMetal, 0, tableY, 0.05));
  // T-slots (5 parallel slots)
  for (let i = -2; i <= 2; i++) {
    g.add(box(1.15, 0.005, 0.015, M.bodyDark, 0, tableY + 0.042, 0.05 + i * 0.13));
  }
  // Table saddle (Y-axis)
  g.add(box(1.3, 0.1, 0.8, castIron, 0, tableY - 0.09, 0.05));
  // X-axis ways
  g.add(box(0.05, 0.05, 0.9, M.chrome, -0.6, tableY - 0.05, 0.05));
  g.add(box(0.05, 0.05, 0.9, M.chrome, 0.6, tableY - 0.05, 0.05));

  // ====== VISE ON TABLE ======
  const viseZ = 0.05;
  // Fixed jaw
  g.add(box(0.4, 0.12, 0.08, viseSteel, 0, tableY + 0.1, viseZ - 0.12));
  // Moving jaw
  g.add(box(0.4, 0.12, 0.08, viseSteel, 0, tableY + 0.1, viseZ + 0.12));
  // Vise base
  g.add(box(0.42, 0.04, 0.3, viseSteel, 0, tableY + 0.06, viseZ));
  // Vise screw handle
  g.add(cyl(0.015, 0.015, 0.15, 6, M.chrome, 0.25, tableY + 0.1, viseZ + 0.12, 0, 0, Math.PI / 2));
  // Workpiece in vise
  g.add(box(0.15, 0.08, 0.12, mat(0x88aacc, 0.8, 0.3), 0, tableY + 0.14, viseZ));

  // ====== TOOL MAGAZINE / CAROUSEL (side) ======
  const magX = baseW / 2 + 0.2;
  const magY = baseH + encH - 0.4;
  // Magazine housing
  g.add(box(0.3, 0.8, 0.4, magazineGray, magX, magY, -0.3));
  // Magazine door
  g.add(box(0.03, 0.6, 0.35, sheetMetal, magX + 0.16, magY, -0.3));
  // Tool pockets (visible through gap)
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const pr = 0.1;
    g.add(cyl(0.02, 0.02, 0.06, 8, M.chrome,
      magX, magY + Math.sin(a) * pr, -0.3 + Math.cos(a) * pr, Math.PI / 2, 0, 0));
  }
  // Magazine motor
  g.add(cyl(0.06, 0.06, 0.1, 12, M.bodyGray, magX, magY + 0.45, -0.3));
  // Tool change arm area
  g.add(box(0.15, 0.06, 0.15, M.darkChrome, magX - 0.2, magY - 0.15, -0.3));

  // ====== COOLANT NOZZLES ======
  // Two flexible nozzles near spindle
  g.add(cyl(0.01, 0.01, 0.12, 6, coolantNozzle, 0.12, spindleY - 0.35, -0.05, 0.4, 0, 0));
  g.add(cyl(0.01, 0.01, 0.12, 6, coolantNozzle, -0.12, spindleY - 0.35, -0.05, 0.4, 0, -0.3));
  // Nozzle tips
  g.add(cyl(0.005, 0.008, 0.02, 6, M.chrome, 0.14, spindleY - 0.42, -0.01, 0.4, 0, 0));
  g.add(cyl(0.005, 0.008, 0.02, 6, M.chrome, -0.14, spindleY - 0.42, -0.01, 0.4, 0, -0.3));

  // ====== AIR BLAST NOZZLE ======
  g.add(cyl(0.008, 0.008, 0.1, 6, M.pipe, 0.2, spindleY - 0.25, 0.1, 0.6, 0, 0.3));
  g.add(cyl(0.004, 0.006, 0.025, 6, M.chrome, 0.22, spindleY - 0.33, 0.14, 0.6, 0, 0.3));

  // ====== CHIP TRAY ======
  g.add(box(1.4, 0.06, 0.5, mat(0x556070, 0.5, 0.5), 0, baseH + 0.03, 0.4));
  // Tray sides
  g.add(box(1.4, 0.08, 0.03, mat(0x556070, 0.5, 0.5), 0, baseH + 0.07, 0.65));
  g.add(box(0.03, 0.08, 0.5, mat(0x556070, 0.5, 0.5), -0.7, baseH + 0.07, 0.4));
  g.add(box(0.03, 0.08, 0.5, mat(0x556070, 0.5, 0.5), 0.7, baseH + 0.07, 0.4));

  // ====== CNC CONTROL PENDANT ======
  const pendX = baseW / 2 + 0.05;
  const pendY = baseH + 0.8;
  const pendZ = baseD / 2 + 0.2;
  // Pendant arm
  g.add(cyl(0.025, 0.025, 0.35, 8, M.darkChrome, pendX, pendY + 0.3, pendZ - 0.1, 0, 0, 0.4));
  // Arm pivot bracket
  g.add(box(0.06, 0.06, 0.06, M.darkChrome, pendX - 0.05, pendY + 0.5, pendZ - 0.2));
  // Pendant box
  g.add(box(0.08, 0.55, 0.4, controlGray, pendX + 0.1, pendY, pendZ));
  // Screen
  g.add(box(0.015, 0.25, 0.3, M.screen, pendX + 0.145, pendY + 0.08, pendZ));
  // Screen bezel
  g.add(box(0.01, 0.28, 0.33, M.bodyDark, pendX + 0.14, pendY + 0.08, pendZ));
  // Button panel
  g.add(box(0.02, 0.12, 0.3, mat(0x333a44, 0.4, 0.6), pendX + 0.15, pendY - 0.18, pendZ));
  // Buttons (4x5 grid)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      g.add(box(0.012, 0.018, 0.025, M.bodyGray,
        pendX + 0.165, pendY - 0.13 - r * 0.035, pendZ - 0.1 + c * 0.045));
    }
  }
  // Jog handwheel
  g.add(cyl(0.04, 0.04, 0.015, 16, M.darkChrome, pendX + 0.16, pendY - 0.0, pendZ + 0.17));
  // Override knobs
  g.add(cyl(0.018, 0.018, 0.015, 12, M.chrome, pendX + 0.16, pendY + 0.28, pendZ + 0.17));
  g.add(cyl(0.018, 0.018, 0.015, 12, M.chrome, pendX + 0.16, pendY + 0.28, pendZ - 0.17));
  // E-stop on pendant
  g.add(cyl(0.025, 0.025, 0.018, 12, M.red, pendX + 0.165, pendY - 0.25, pendZ));
  // Mode selector switch
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, pendX + 0.165, pendY - 0.25, pendZ - 0.1));

  // ====== ENCLOSURE VIEWING WINDOW (fixed, top) ======
  g.add(box(0.8, 0.4, 0.02, windowTint, 0, encY + 0.35, baseD / 2 + 0.01));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(baseW / 2 - 0.15, baseH + encH + 0.02, -baseD / 2 + 0.2));

  return g;
}
