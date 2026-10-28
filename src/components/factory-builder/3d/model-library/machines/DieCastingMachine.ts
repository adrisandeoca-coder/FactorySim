import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildDieCastingMachine(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const heavyFrame = mat(0x3a4250, 0.7, 0.4);
  const platenSteel = mat(0x556070, 0.75, 0.3);
  const tieBarChrome = mat(0x8898a8, 0.85, 0.2);
  const dieMetal = mat(0x505868, 0.8, 0.25);
  const hydraulicGray = mat(0x444c58, 0.6, 0.45);
  const shotSleeve = mat(0x606878, 0.7, 0.35);
  const safetyYellow = mat(0xddaa00, 0.1, 0.6);
  const safetyPanel = mat(0x3a4250, 0.5, 0.5, { transparent: true, opacity: 0.3 });
  const controlCabinet = mat(0xd0d4d8, 0.3, 0.5);
  const accumulatorGreen = mat(0x336644, 0.5, 0.5);
  const ladleMetal = mat(0x778090, 0.7, 0.3);
  const sprayNozzle = mat(0xcc6633, 0.3, 0.5);
  const chuteSteel = mat(0x667080, 0.6, 0.4);

  // ====== MACHINE BASE ======
  const baseW = 3.8;
  const baseD = 1.4;
  const baseH = 0.6;
  g.add(box(baseW, baseH, baseD, heavyFrame, 0, baseH / 2, 0));
  // Leveling pads
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.08, 0.1, 0.05, 8, M.rubber, sx * 1.7, 0.025, sz * 0.55));
      g.add(cyl(0.05, 0.05, 0.04, 8, M.darkChrome, sx * 1.7, 0.06, sz * 0.55));
    }
  }
  // Base reinforcement ribs
  for (let x = -1.2; x <= 1.2; x += 0.6) {
    g.add(box(0.08, baseH - 0.1, 0.06, heavyFrame, x, baseH / 2, baseD / 2));
    g.add(box(0.08, baseH - 0.1, 0.06, heavyFrame, x, baseH / 2, -baseD / 2));
  }

  // ====== FIXED PLATEN (shot side) ======
  const fixedX = -0.6;
  const platenY = baseH + 0.65;
  const platenH = 1.3;
  g.add(box(0.22, platenH, 1.1, platenSteel, fixedX, platenY, 0));
  // Platen face bolt pattern
  for (let r = -2; r <= 2; r++) {
    for (let c = -1; c <= 1; c++) {
      g.add(cyl(0.018, 0.018, 0.012, 6, M.darkChrome, fixedX + 0.12, platenY + r * 0.2, c * 0.3));
    }
  }
  // Locating ring
  g.add(cyl(0.1, 0.1, 0.04, 16, M.darkChrome, fixedX - 0.12, platenY, 0));
  // Shot hole
  g.add(cyl(0.04, 0.04, 0.24, 12, M.bodyDark, fixedX, platenY, 0, 0, 0, Math.PI / 2));

  // ====== MOVING PLATEN ======
  const movingX = 0.6;
  g.add(box(0.2, platenH - 0.1, 1.05, platenSteel, movingX, platenY, 0));
  // Ejector box on back
  g.add(box(0.15, 0.5, 0.5, M.darkChrome, movingX + 0.15, platenY, 0));
  // Ejector hydraulic cylinder
  g.add(cyl(0.06, 0.06, 0.2, 12, hydraulicGray, movingX + 0.25, platenY, 0, 0, 0, Math.PI / 2));

  // ====== TIE BARS (4) ======
  const tieLen = 2.4;
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ty = platenY + sy * 0.45;
      const tz = sz * 0.4;
      g.add(cyl(0.05, 0.05, tieLen, 12, tieBarChrome,
        (fixedX + movingX) / 2 + 0.35, ty, tz, 0, 0, Math.PI / 2));
      // Nuts at fixed platen
      g.add(cyl(0.065, 0.065, 0.04, 6, M.darkChrome, fixedX - 0.14, ty, tz));
      // Nuts at toggle end
      g.add(cyl(0.065, 0.065, 0.04, 6, M.darkChrome, movingX + 0.95, ty, tz));
    }
  }

  // ====== TOGGLE CLAMPING UNIT ======
  const toggleX = movingX + 0.5;
  // Toggle housing / rear platen
  g.add(box(0.2, platenH - 0.2, 1.0, heavyFrame, toggleX + 0.7, platenY, 0));
  // Toggle links (4 pairs - upper/lower, left/right)
  for (const sz of [-1, 1]) {
    // Main upper links
    g.add(box(0.06, 0.5, 0.06, M.darkChrome, toggleX + 0.2, platenY + 0.35, sz * 0.32, 0.35, 0, 0));
    // Main lower links
    g.add(box(0.06, 0.5, 0.06, M.darkChrome, toggleX + 0.2, platenY - 0.35, sz * 0.32, -0.35, 0, 0));
    // Crosshead links
    g.add(box(0.06, 0.35, 0.06, M.darkChrome, toggleX + 0.45, platenY + 0.15, sz * 0.32));
    g.add(box(0.06, 0.35, 0.06, M.darkChrome, toggleX + 0.45, platenY - 0.15, sz * 0.32));
    // Link pins (pivots)
    g.add(cyl(0.03, 0.03, 0.12, 8, M.chrome, toggleX + 0.2, platenY, sz * 0.32, Math.PI / 2, 0, 0));
    g.add(cyl(0.03, 0.03, 0.12, 8, M.chrome, toggleX + 0.45, platenY + 0.35, sz * 0.32, Math.PI / 2, 0, 0));
    g.add(cyl(0.03, 0.03, 0.12, 8, M.chrome, toggleX + 0.45, platenY - 0.35, sz * 0.32, Math.PI / 2, 0, 0));
  }
  // Crosshead
  g.add(box(0.12, 0.6, 0.8, platenSteel, toggleX + 0.55, platenY, 0));
  // Main clamping cylinder
  g.add(cyl(0.18, 0.18, 0.5, 16, hydraulicGray, toggleX + 0.55, platenY, 0, 0, 0, Math.PI / 2));

  // ====== DIE HALVES (between platens) ======
  const dieX = (fixedX + movingX) / 2;
  // Fixed die half
  g.add(box(0.12, 0.7, 0.6, dieMetal, dieX - 0.07, platenY, 0));
  // Moving die half
  g.add(box(0.12, 0.7, 0.6, dieMetal, dieX + 0.07, platenY, 0));
  // Parting line
  g.add(box(0.005, 0.72, 0.62, mat(0x333333, 0.3, 0.5), dieX, platenY, 0));
  // Die cooling lines
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.012, 0.012, 0.08, 6, M.pipe, dieX, platenY + sy * 0.25, sz * 0.25 + 0.32, Math.PI / 2, 0, 0));
    }
  }

  // ====== SHOT SLEEVE / INJECTION CYLINDER ======
  const shotX = fixedX - 0.35;
  // Shot sleeve
  g.add(cyl(0.08, 0.08, 0.5, 16, shotSleeve, shotX, platenY, 0, 0, 0, Math.PI / 2));
  // Pouring hole on top
  g.add(cyl(0.04, 0.04, 0.04, 12, M.bodyDark, shotX + 0.1, platenY + 0.08, 0));
  // Injection plunger cylinder
  g.add(cyl(0.12, 0.12, 0.4, 16, hydraulicGray, shotX - 0.5, platenY, 0, 0, 0, Math.PI / 2));
  // Plunger rod
  g.add(cyl(0.05, 0.05, 0.3, 12, M.chrome, shotX - 0.25, platenY, 0, 0, 0, Math.PI / 2));
  // Shot cylinder mounting
  g.add(box(0.25, 0.3, 0.3, heavyFrame, shotX - 0.7, platenY, 0));
  // Intensifier cylinder
  g.add(cyl(0.15, 0.15, 0.35, 16, hydraulicGray, shotX - 0.95, platenY, 0, 0, 0, Math.PI / 2));

  // ====== HYDRAULIC ACCUMULATOR ======
  const accX = toggleX + 0.9;
  // Accumulator bottles (2)
  g.add(cyl(0.12, 0.12, 0.8, 16, accumulatorGreen, accX + 0.3, platenY + 0.1, -0.35));
  g.add(cyl(0.12, 0.12, 0.8, 16, accumulatorGreen, accX + 0.3, platenY + 0.1, 0.35));
  // Accumulator top caps
  g.add(sph(0.12, accumulatorGreen, accX + 0.3, platenY + 0.52, -0.35));
  g.add(sph(0.12, accumulatorGreen, accX + 0.3, platenY + 0.52, 0.35));
  // Accumulator valve blocks
  g.add(box(0.1, 0.1, 0.1, M.darkChrome, accX + 0.3, platenY - 0.35, -0.35));
  g.add(box(0.1, 0.1, 0.1, M.darkChrome, accX + 0.3, platenY - 0.35, 0.35));
  // Hydraulic lines
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, accX + 0.15, platenY - 0.2, -0.35, 0, 0, 0.5));
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, accX + 0.15, platenY - 0.2, 0.35, 0, 0, 0.5));

  // ====== LADLE / POURING SYSTEM ======
  const ladleX = shotX + 0.1;
  const ladleY = platenY + 0.6;
  // Ladle arm pivot
  g.add(cyl(0.03, 0.03, 0.08, 8, M.darkChrome, ladleX, ladleY, 0.4));
  // Ladle arm
  g.add(box(0.04, 0.04, 0.4, M.darkChrome, ladleX, ladleY, 0.6));
  // Ladle cup
  g.add(cyl(0.06, 0.05, 0.08, 12, ladleMetal, ladleX, ladleY - 0.04, 0.8));
  // Ladle motor
  g.add(cyl(0.04, 0.04, 0.06, 8, M.bodyGray, ladleX, ladleY + 0.04, 0.4));
  // Metal holding pot (small furnace)
  g.add(cyl(0.15, 0.18, 0.25, 16, mat(0x885533, 0.4, 0.5), ladleX, baseH + 0.25, 0.8));
  g.add(cyl(0.16, 0.16, 0.03, 16, M.darkChrome, ladleX, baseH + 0.38, 0.8));
  // Thermocouple
  g.add(cyl(0.005, 0.005, 0.15, 4, M.wire, ladleX + 0.1, baseH + 0.4, 0.8, -0.3, 0, 0));

  // ====== DIE SPRAY / LUBRICATION NOZZLES ======
  // Spray arm (reciprocating type between platens)
  g.add(cyl(0.015, 0.015, 0.6, 6, sprayNozzle, dieX, platenY + 0.5, 0, 0, 0, Math.PI / 2));
  // Nozzle manifold
  g.add(box(0.08, 0.04, 0.25, sprayNozzle, dieX, platenY + 0.5, 0));
  // Individual nozzle tips
  for (let i = -2; i <= 2; i++) {
    g.add(cyl(0.006, 0.004, 0.03, 6, M.chrome, dieX, platenY + 0.47, i * 0.05));
  }
  // Spray supply hose
  g.add(cyl(0.012, 0.012, 0.4, 6, M.rubber, dieX + 0.3, platenY + 0.65, 0, 0, 0, 0.5));

  // ====== PART EXTRACTION CHUTE ======
  g.add(box(0.5, 0.03, 0.5, chuteSteel, dieX, baseH + 0.12, 0.55, -0.35, 0, 0));
  // Chute sides
  g.add(box(0.03, 0.06, 0.5, chuteSteel, dieX - 0.25, baseH + 0.14, 0.55, -0.35, 0, 0));
  g.add(box(0.03, 0.06, 0.5, chuteSteel, dieX + 0.25, baseH + 0.14, 0.55, -0.35, 0, 0));
  // Collection bin
  g.add(box(0.6, 0.35, 0.4, mat(0x3355aa, 0.2, 0.6), dieX, 0.18, 1.0));

  // ====== LARGE HYDRAULIC POWER UNIT ======
  const hpuX = -1.5;
  g.add(box(0.7, 0.7, 0.9, hydraulicGray, hpuX, 0.55, 0));
  // Main pump motor
  g.add(cyl(0.16, 0.16, 0.35, 12, M.bodyGray, hpuX, 0.95, 0));
  // Fan shroud
  g.add(cyl(0.17, 0.17, 0.04, 16, M.darkChrome, hpuX, 0.95, -0.2));
  // Oil filter assembly
  g.add(cyl(0.06, 0.06, 0.2, 12, mat(0x667788, 0.5, 0.4), hpuX + 0.3, 0.7, 0.4));
  // Heat exchanger
  g.add(box(0.25, 0.4, 0.08, mat(0x556070, 0.6, 0.4), hpuX - 0.3, 0.5, 0.5));
  // Pressure gauges (2)
  g.add(cyl(0.035, 0.035, 0.012, 16, mat(0xeeeeee, 0, 0.8), hpuX + 0.36, 0.9, 0.15));
  g.add(cyl(0.035, 0.035, 0.012, 16, mat(0xeeeeee, 0, 0.8), hpuX + 0.36, 0.9, -0.15));
  // Oil level sight glass
  g.add(cyl(0.025, 0.025, 0.01, 12, mat(0xddcc44, 0, 0.3, {
    transparent: true, opacity: 0.5,
  }), hpuX + 0.36, 0.55, 0));
  // Main supply hoses
  g.add(cyl(0.025, 0.025, 0.6, 6, M.rubber, hpuX + 0.35, 0.9, 0.3, 0, 0, 0.5));
  g.add(cyl(0.025, 0.025, 0.6, 6, M.rubber, hpuX + 0.35, 0.9, -0.3, 0, 0, 0.5));

  // ====== SAFETY ENCLOSURE PANELS ======
  for (const sz of [-1, 1]) {
    const panelZ = sz * (baseD / 2 + 0.06);
    // Main safety panel frame
    g.add(box(2.0, 1.4, 0.04, safetyYellow, dieX, baseH + 0.7, panelZ));
    // Mesh infill
    g.add(box(1.9, 1.3, 0.02, safetyPanel, dieX, baseH + 0.7, panelZ + sz * 0.02));
    // Panel posts
    g.add(box(0.05, 1.5, 0.05, safetyYellow, dieX - 1.0, baseH + 0.75, panelZ));
    g.add(box(0.05, 1.5, 0.05, safetyYellow, dieX + 1.0, baseH + 0.75, panelZ));
    // Safety interlock switch
    g.add(box(0.04, 0.06, 0.03, safetyYellow, dieX + 1.0, baseH + 1.2, panelZ));
    g.add(sph(0.012, mat(0xff0000, 0.1, 0.3, { emissive: 0xff0000, emissiveIntensity: 0.8 }),
      dieX + 1.0, baseH + 1.25, panelZ + sz * 0.03));
  }

  // ====== CONTROL CABINET ======
  const cabX = -1.0;
  const cabZ = -baseD / 2 - 0.35;
  // Cabinet body
  g.add(box(0.6, 1.6, 0.5, controlCabinet, cabX, baseH + 0.8, cabZ));
  // Cabinet door
  g.add(box(0.62, 1.55, 0.02, mat(0xbbc0c8, 0.4, 0.4), cabX, baseH + 0.8, cabZ + 0.26));
  // Door handle
  g.add(box(0.03, 0.12, 0.025, M.chrome, cabX + 0.25, baseH + 0.8, cabZ + 0.28));
  // Main HMI screen
  g.add(box(0.015, 0.3, 0.25, M.screenActive, cabX, baseH + 1.2, cabZ + 0.27));
  // Screen bezel
  g.add(box(0.01, 0.33, 0.28, M.bodyDark, cabX, baseH + 1.2, cabZ + 0.265));
  // Indicator lights row
  for (let i = 0; i < 4; i++) {
    const color = [M.green, M.blue, M.yellow, M.red][i];
    g.add(cyl(0.012, 0.012, 0.01, 8, color, cabX - 0.15 + i * 0.1, baseH + 1.45, cabZ + 0.28));
  }
  // E-stop on cabinet
  g.add(cyl(0.03, 0.03, 0.025, 12, M.red, cabX + 0.2, baseH + 0.5, cabZ + 0.28));
  // Cable entry glands at bottom
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.02, 0.02, 0.04, 8, M.darkChrome, cabX - 0.15 + i * 0.15, baseH + 0.05, cabZ));
  }
  // Ventilation grille
  g.add(box(0.2, 0.15, 0.02, M.darkChrome, cabX, baseH + 0.15, cabZ + 0.27));
  for (let i = 0; i < 5; i++) {
    g.add(box(0.18, 0.005, 0.015, M.bodyDark, cabX, baseH + 0.1 + i * 0.025, cabZ + 0.28));
  }

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(cabX, baseH + 1.65, cabZ + 0.15));

  return g;
}
