import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildGrindingMachine(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const castIron = mat(0x353a42, 0.6, 0.55);
  const bodyGreen = mat(0x2a5040, 0.5, 0.55);
  const tableMetal = mat(0x5a6878, 0.8, 0.3);
  const wheelGuard = mat(0x4a5060, 0.6, 0.45);
  const grindWheel = mat(0x888890, 0.2, 0.7);
  const magneticChuck = mat(0x6a7888, 0.75, 0.3);
  const handwheelMat = mat(0x333840, 0.6, 0.5);
  const coolantNozzle = mat(0xcc6633, 0.3, 0.5);
  const sparkGuard = mat(0x88aa44, 0.1, 0.5, { transparent: true, opacity: 0.35 });
  const dustHood = mat(0x556070, 0.5, 0.5);
  const droDisplay = mat(0x0a1520, 0.0, 0.9, { emissive: 0x003366, emissiveIntensity: 1.0 });
  const droBody = mat(0x333a44, 0.4, 0.5);

  // ====== MACHINE BASE / BED ======
  const baseW = 1.8;
  const baseD = 1.0;
  const baseH = 0.6;
  g.add(box(baseW, baseH, baseD, castIron, 0, baseH / 2, 0));
  // Leveling feet
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.05, 0.06, 0.04, 8, M.rubber, sx * 0.75, 0.02, sz * 0.4));
    }
  }
  // Base front apron
  g.add(box(baseW - 0.1, 0.15, 0.04, bodyGreen, 0, baseH - 0.08, baseD / 2));
  // Coolant trough around base
  g.add(box(baseW + 0.06, 0.05, 0.06, castIron, 0, baseH + 0.02, baseD / 2 + 0.03));
  g.add(box(baseW + 0.06, 0.05, 0.06, castIron, 0, baseH + 0.02, -baseD / 2 - 0.03));

  // ====== CROSS-SLIDE (Y-axis table) ======
  const crossY = baseH + 0.08;
  g.add(box(1.0, 0.08, baseD - 0.1, castIron, 0, crossY, 0));
  // Cross-slide ways
  g.add(box(0.04, 0.04, baseD - 0.15, M.chrome, -0.45, crossY - 0.02, 0));
  g.add(box(0.04, 0.04, baseD - 0.15, M.chrome, 0.45, crossY - 0.02, 0));
  // Cross-slide gibs
  g.add(box(0.06, 0.03, 0.2, M.darkChrome, -0.45, crossY + 0.04, 0));
  g.add(box(0.06, 0.03, 0.2, M.darkChrome, 0.45, crossY + 0.04, 0));

  // ====== WORK TABLE (X-axis, longitudinal) ======
  const tableY = crossY + 0.12;
  const tableW = 1.4;
  const tableD = 0.5;
  g.add(box(tableW, 0.06, tableD, tableMetal, 0, tableY, 0));
  // Table ways (X-axis)
  g.add(box(tableW + 0.1, 0.03, 0.04, M.chrome, 0, tableY - 0.04, -tableD / 2 + 0.05));
  g.add(box(tableW + 0.1, 0.03, 0.04, M.chrome, 0, tableY - 0.04, tableD / 2 - 0.05));

  // ====== MAGNETIC CHUCK ======
  const chuckY = tableY + 0.04;
  g.add(box(0.8, 0.04, 0.35, magneticChuck, 0, chuckY, 0));
  // Chuck power switch
  g.add(cyl(0.03, 0.03, 0.04, 8, M.darkChrome, 0.42, chuckY + 0.02, 0));
  // Chuck top surface lines (pole pattern)
  for (let i = -3; i <= 3; i++) {
    g.add(box(0.78, 0.002, 0.005, M.bodyDark, 0, chuckY + 0.022, i * 0.045));
  }
  // Workpiece on chuck
  g.add(box(0.3, 0.04, 0.2, mat(0x88aacc, 0.8, 0.3), 0, chuckY + 0.04, 0));

  // ====== COLUMN (rear upright for wheel head) ======
  const colX = 0;
  const colZ = -baseD / 2 + 0.15;
  g.add(box(0.35, 1.2, 0.3, castIron, colX, baseH + 0.6, colZ));
  // Column vertical ways
  g.add(box(0.04, 1.0, 0.04, M.chrome, colX - 0.12, baseH + 0.6, colZ + 0.16));
  g.add(box(0.04, 1.0, 0.04, M.chrome, colX + 0.12, baseH + 0.6, colZ + 0.16));

  // ====== WHEEL HEAD / SPINDLE ======
  const wheelHeadY = baseH + 1.0;
  // Wheel head housing
  g.add(box(0.3, 0.25, 0.25, bodyGreen, colX, wheelHeadY, colZ + 0.25));
  // Spindle
  g.add(cyl(0.04, 0.04, 0.2, 12, M.chrome, colX, wheelHeadY, colZ + 0.42, Math.PI / 2, 0, 0));

  // ====== GRINDING WHEEL WITH GUARD ======
  const wheelZ = colZ + 0.5;
  // Grinding wheel
  g.add(cyl(0.18, 0.18, 0.04, 24, grindWheel, colX, wheelHeadY, wheelZ, Math.PI / 2, 0, 0));
  // Wheel flanges
  g.add(cyl(0.06, 0.06, 0.02, 16, M.darkChrome, colX, wheelHeadY, wheelZ - 0.03, Math.PI / 2, 0, 0));
  g.add(cyl(0.06, 0.06, 0.02, 16, M.darkChrome, colX, wheelHeadY, wheelZ + 0.03, Math.PI / 2, 0, 0));
  // Wheel guard (semi-circular housing)
  g.add(cyl(0.22, 0.22, 0.08, 24, wheelGuard, colX, wheelHeadY, wheelZ, Math.PI / 2, 0, 0));
  // Guard is open at bottom - simulate with plates
  g.add(box(0.04, 0.22, 0.08, wheelGuard, colX - 0.2, wheelHeadY + 0.05, wheelZ));
  g.add(box(0.04, 0.22, 0.08, wheelGuard, colX + 0.2, wheelHeadY + 0.05, wheelZ));
  g.add(box(0.44, 0.04, 0.08, wheelGuard, colX, wheelHeadY + 0.2, wheelZ));
  // Guard adjustment bolt
  g.add(cyl(0.015, 0.015, 0.04, 6, M.chrome, colX + 0.22, wheelHeadY + 0.1, wheelZ));

  // ====== WHEEL DRESSER ======
  const dresserX = 0.4;
  // Dresser arm base
  g.add(box(0.06, 0.04, 0.06, M.darkChrome, dresserX, tableY + 0.05, 0));
  // Dresser arm
  g.add(box(0.15, 0.025, 0.025, M.darkChrome, dresserX, tableY + 0.08, 0));
  // Diamond tip
  g.add(cyl(0.008, 0.003, 0.02, 6, mat(0xccddee, 0.9, 0.1), dresserX + 0.09, tableY + 0.08, 0));
  // Dresser lock knob
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, dresserX - 0.05, tableY + 0.1, 0));

  // ====== COOLANT NOZZLE ======
  // Flexible nozzle arm
  g.add(cyl(0.01, 0.01, 0.15, 6, coolantNozzle, colX + 0.15, wheelHeadY - 0.08, wheelZ, 0.3, 0, 0.4));
  // Nozzle tip
  g.add(cyl(0.005, 0.008, 0.025, 6, M.chrome, colX + 0.2, wheelHeadY - 0.18, wheelZ + 0.04, 0.3, 0, 0.4));
  // Coolant supply line
  g.add(cyl(0.012, 0.012, 0.3, 6, M.rubber, colX + 0.2, wheelHeadY + 0.05, wheelZ - 0.1, 0, 0, 0.3));

  // ====== SPARK GUARD (transparent shield) ======
  g.add(box(0.3, 0.25, 0.02, sparkGuard, colX, wheelHeadY - 0.15, wheelZ + 0.12));
  // Spark guard bracket
  g.add(box(0.04, 0.04, 0.06, M.darkChrome, colX + 0.14, wheelHeadY - 0.05, wheelZ + 0.08));

  // ====== TABLE FEED HANDWHEEL (X-axis) ======
  const hwX = -baseW / 2 - 0.08;
  g.add(cyl(0.08, 0.08, 0.02, 16, handwheelMat, hwX, tableY, 0, 0, 0, Math.PI / 2));
  g.add(cyl(0.06, 0.06, 0.025, 16, M.darkChrome, hwX - 0.01, tableY, 0, 0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, 0.03, 8, M.chrome, hwX - 0.02, tableY, 0, 0, 0, Math.PI / 2));
  // Handwheel handle
  g.add(cyl(0.01, 0.01, 0.04, 6, M.chrome, hwX - 0.015, tableY + 0.065, 0));
  // Handwheel dial
  g.add(cyl(0.035, 0.035, 0.01, 16, mat(0xeeeeee, 0, 0.8), hwX + 0.02, tableY, 0, 0, 0, Math.PI / 2));

  // ====== CROSS-SLIDE HANDWHEEL (Y-axis) ======
  const csHwZ = baseD / 2 + 0.08;
  g.add(cyl(0.07, 0.07, 0.02, 16, handwheelMat, 0, crossY, csHwZ, Math.PI / 2, 0, 0));
  g.add(cyl(0.05, 0.05, 0.025, 16, M.darkChrome, 0, crossY, csHwZ + 0.01, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.03, 8, M.chrome, 0, crossY, csHwZ + 0.02, Math.PI / 2, 0, 0));
  // Handle
  g.add(cyl(0.01, 0.01, 0.035, 6, M.chrome, 0.055, crossY, csHwZ + 0.015));

  // ====== VERTICAL FEED HANDWHEEL (Z-axis on column) ======
  const vHwX = colX + 0.2;
  g.add(cyl(0.06, 0.06, 0.02, 16, handwheelMat, vHwX, wheelHeadY - 0.3, colZ, 0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, 0.03, 8, M.chrome, vHwX + 0.015, wheelHeadY - 0.3, colZ, 0, 0, Math.PI / 2));

  // ====== DUST COLLECTION HOOD ======
  const hoodZ = wheelZ - 0.15;
  g.add(box(0.3, 0.25, 0.1, dustHood, colX, wheelHeadY + 0.3, hoodZ));
  // Hood intake slot
  g.add(box(0.25, 0.03, 0.08, M.bodyDark, colX, wheelHeadY + 0.2, hoodZ + 0.02));
  // Duct connection
  g.add(cyl(0.06, 0.06, 0.12, 12, dustHood, colX, wheelHeadY + 0.42, hoodZ));
  // Flexible duct
  g.add(cyl(0.055, 0.055, 0.3, 8, mat(0x555555, 0.2, 0.7), colX, wheelHeadY + 0.6, hoodZ - 0.1, 0.3, 0, 0));

  // ====== DRO (Digital Readout) DISPLAY ======
  const droX = baseW / 2 + 0.05;
  const droY = baseH + 0.8;
  // DRO mounting arm
  g.add(cyl(0.02, 0.02, 0.2, 8, M.darkChrome, droX - 0.08, droY, 0.2, 0, 0, 0.4));
  // DRO body
  g.add(box(0.06, 0.2, 0.3, droBody, droX, droY, 0.3));
  // DRO screens (3 axes: X, Y, Z)
  for (let i = 0; i < 3; i++) {
    g.add(box(0.015, 0.035, 0.18, droDisplay, droX + 0.035, droY + 0.06 - i * 0.06, 0.3));
  }
  // Axis labels
  for (let i = 0; i < 3; i++) {
    g.add(box(0.012, 0.02, 0.02, ['X', 'Y', 'Z'][i] === 'X' ? M.red :
      ['X', 'Y', 'Z'][i] === 'Y' ? M.green : M.blue,
      droX + 0.035, droY + 0.06 - i * 0.06, 0.2));
  }
  // DRO buttons
  for (let i = 0; i < 3; i++) {
    g.add(box(0.012, 0.015, 0.015, M.bodyGray, droX + 0.04, droY + 0.06 - i * 0.06, 0.42));
  }

  // ====== SPINDLE MOTOR (behind column) ======
  g.add(cyl(0.12, 0.12, 0.25, 12, M.bodyGray, colX, wheelHeadY, colZ - 0.25));
  // Motor fan cover
  g.add(cyl(0.13, 0.13, 0.03, 12, M.darkChrome, colX, wheelHeadY, colZ - 0.38));
  // Belt guard
  g.add(box(0.2, 0.15, 0.08, bodyGreen, colX, wheelHeadY, colZ - 0.08));

  // ====== COOLANT TANK (inside base) ======
  // Tank visible from side
  g.add(box(0.5, 0.3, 0.04, mat(0x556070, 0.5, 0.5, { transparent: true, opacity: 0.4 }),
    -0.5, 0.25, baseD / 2));
  // Coolant pump
  g.add(cyl(0.04, 0.04, 0.08, 8, M.bodyGray, -0.5, 0.45, baseD / 2 - 0.05));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(colX + 0.2, baseH + 1.25, colZ - 0.1));

  return g;
}
