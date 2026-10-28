import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildColdStorage(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const panelWhite = mat(0xe8eaec, 0.3, 0.5);
  const panelSilver = mat(0xb0b8c0, 0.55, 0.35);
  const gasketBlack = mat(0x1a1a1a, 0.0, 0.85);
  const doorMat = mat(0xd0d4d8, 0.35, 0.45);
  const handleChrome = mat(0xc0c8d0, 0.85, 0.15);
  const condenserMat = mat(0x505868, 0.6, 0.4);
  const fanBlade = mat(0x2a2e36, 0.3, 0.6);
  const stripCurtain = mat(0xc8dde8, 0.0, 0.1, { transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const frostMat = mat(0xd8efff, 0.0, 0.3, { transparent: true, opacity: 0.4 });
  const interiorLight = mat(0xffffee, 0.0, 0.5, { emissive: 0xffffaa, emissiveIntensity: 0.8 });
  const warningYellow = mat(0xffcc00, 0.0, 0.6);
  const warningMat = mat(0xdddddd, 0.0, 0.7);
  const pipeMat = mat(0x607080, 0.65, 0.3);
  const displayMat = mat(0x001818, 0.0, 0.9, { emissive: 0x00aacc, emissiveIntensity: 1.0 });

  // ── Dimensions ──
  const roomW = 1.2;   // width (X)
  const roomD = 0.8;   // depth (Z)
  const roomH = 0.9;   // height
  const wallT = 0.04;  // wall thickness (insulated panels)
  const doorW = 0.35;
  const doorH = 0.7;

  // ── Insulated Panel Walls ──
  // Back wall
  g.add(box(roomW, roomH, wallT, panelWhite, 0, roomH / 2, roomD / 2));
  // Left wall
  g.add(box(wallT, roomH, roomD, panelWhite, -roomW / 2, roomH / 2, 0));
  // Right wall
  g.add(box(wallT, roomH, roomD, panelWhite, roomW / 2, roomH / 2, 0));
  // Ceiling
  g.add(box(roomW, wallT, roomD, panelSilver, 0, roomH, 0));
  // Floor (slightly raised for insulation)
  g.add(box(roomW, wallT / 2, roomD, panelSilver, 0, wallT / 4, 0));

  // Front wall (with door opening)
  // Left section
  g.add(box((roomW - doorW) / 2, roomH, wallT, panelWhite,
    -(roomW / 2 - (roomW - doorW) / 4), roomH / 2, -roomD / 2));
  // Right section
  g.add(box((roomW - doorW) / 2, roomH, wallT, panelWhite,
    (roomW / 2 - (roomW - doorW) / 4), roomH / 2, -roomD / 2));
  // Top section above door
  g.add(box(doorW, roomH - doorH, wallT, panelWhite, 0, roomH - (roomH - doorH) / 2, -roomD / 2));

  // Panel seam lines (visual detail)
  for (let h = 0.3; h < roomH; h += 0.3) {
    g.add(box(roomW + 0.002, 0.003, wallT + 0.002, panelSilver, 0, h, roomD / 2));
    g.add(box(roomW + 0.002, 0.003, wallT + 0.002, panelSilver, 0, h, -roomD / 2));
  }
  // Vertical seams
  for (let x = -0.3; x <= 0.3; x += 0.3) {
    g.add(box(0.003, roomH, wallT + 0.002, panelSilver, x, roomH / 2, roomD / 2));
  }

  // Panel corner trims
  for (const sx of [-1, 1]) {
    g.add(box(0.01, roomH, 0.01, panelSilver, sx * roomW / 2, roomH / 2, -roomD / 2));
    g.add(box(0.01, roomH, 0.01, panelSilver, sx * roomW / 2, roomH / 2, roomD / 2));
  }

  // ── Heavy-Duty Hinged Door ──
  // Door panel (slightly ajar)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(-doorW / 2, 0, -roomD / 2);
  doorGroup.rotation.y = 0.3; // slightly open

  const doorPanel = box(doorW, doorH, wallT * 0.8, doorMat, doorW / 2, doorH / 2, 0);
  doorGroup.add(doorPanel);

  // Door gasket (rubber seal around edge)
  doorGroup.add(box(doorW + 0.01, 0.015, 0.008, gasketBlack, doorW / 2, doorH, 0));
  doorGroup.add(box(doorW + 0.01, 0.015, 0.008, gasketBlack, doorW / 2, 0.005, 0));
  doorGroup.add(box(0.015, doorH, 0.008, gasketBlack, 0, doorH / 2, 0));
  doorGroup.add(box(0.015, doorH, 0.008, gasketBlack, doorW, doorH / 2, 0));

  // Door handle (large lever type)
  doorGroup.add(box(0.02, 0.08, 0.04, handleChrome, doorW - 0.06, doorH * 0.5, -wallT * 0.5));
  doorGroup.add(box(0.06, 0.02, 0.04, handleChrome, doorW - 0.06, doorH * 0.5 + 0.04, -wallT * 0.5));
  // Handle mounting plate
  doorGroup.add(box(0.08, 0.12, 0.005, panelSilver, doorW - 0.06, doorH * 0.5, -wallT * 0.45));
  // Lock mechanism
  doorGroup.add(cyl(0.012, 0.012, 0.02, 8, handleChrome, doorW - 0.06, doorH * 0.38, -wallT * 0.5));

  // Hinges (3 heavy-duty)
  for (const hy of [0.1, doorH / 2, doorH - 0.1]) {
    doorGroup.add(box(0.03, 0.06, 0.015, M.darkChrome, 0.01, hy, wallT * 0.3));
    doorGroup.add(cyl(0.008, 0.008, 0.07, 8, M.chrome, 0.01, hy, wallT * 0.3));
  }

  g.add(doorGroup);

  // Door frame
  g.add(box(0.02, doorH, 0.05, panelSilver, -doorW / 2 - 0.01, doorH / 2, -roomD / 2));
  g.add(box(0.02, doorH, 0.05, panelSilver, doorW / 2 + 0.01, doorH / 2, -roomD / 2));
  g.add(box(doorW + 0.04, 0.02, 0.05, panelSilver, 0, doorH + 0.01, -roomD / 2));

  // ── Strip Curtain at Door ──
  const stripCount = 8;
  for (let i = 0; i < stripCount; i++) {
    const sx = -doorW / 2 + 0.03 + i * (doorW - 0.06) / (stripCount - 1);
    // Each strip hangs slightly differently
    const swayAngle = (Math.sin(i * 1.3) * 0.05);
    g.add(box(0.025, doorH - 0.05, 0.004, stripCurtain, sx, doorH / 2 - 0.02, -roomD / 2 - 0.02, swayAngle, 0, 0));
  }
  // Strip curtain mounting bar
  g.add(box(doorW + 0.02, 0.015, 0.02, panelSilver, 0, doorH - 0.01, -roomD / 2 - 0.02));

  // ── Refrigeration Unit on Top ──
  // Condenser housing
  g.add(box(0.5, 0.2, 0.35, condenserMat, 0.15, roomH + 0.12, 0.1));
  // Condenser fins (side detail)
  for (let i = 0; i < 10; i++) {
    const fz = -0.05 + i * 0.03;
    g.add(box(0.48, 0.16, 0.003, mat(0x607080, 0.5, 0.4), 0.15, roomH + 0.12, fz));
  }
  // Fan housing (circular)
  g.add(cyl(0.1, 0.1, 0.06, 16, condenserMat, 0.15, roomH + 0.22, -0.08));
  // Fan guard grille
  g.add(cyl(0.095, 0.095, 0.005, 16, mat(0x505060, 0.5, 0.4, { transparent: true, opacity: 0.5 }), 0.15, roomH + 0.255, -0.08));
  // Fan blades
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    g.add(box(0.08, 0.005, 0.025, fanBlade, 0.15 + Math.cos(angle) * 0.04, roomH + 0.24, -0.08 + Math.sin(angle) * 0.04, 0, angle, 0));
  }
  // Fan motor hub
  g.add(cyl(0.02, 0.02, 0.04, 8, M.bodyDark, 0.15, roomH + 0.24, -0.08));

  // Refrigerant pipes
  g.add(cyl(0.015, 0.015, 0.15, 8, pipeMat, -0.15, roomH + 0.08, 0.2, Math.PI / 2, 0, 0));
  g.add(cyl(0.012, 0.012, 0.15, 8, pipeMat, -0.15, roomH + 0.05, 0.2, Math.PI / 2, 0, 0));
  // Pipe insulation wrap
  g.add(cyl(0.02, 0.02, 0.12, 8, mat(0x222222, 0, 0.9), -0.15, roomH + 0.08, 0.28, Math.PI / 2, 0, 0));

  // Electrical box on condenser
  g.add(box(0.08, 0.06, 0.04, M.bodyDark, 0.35, roomH + 0.08, -0.05));

  // ── Temperature Display Panel ──
  const dispX = doorW / 2 + 0.12;
  const dispY = doorH * 0.7;
  const dispZ = -roomD / 2 - 0.005;
  g.add(box(0.12, 0.08, 0.02, condenserMat, dispX, dispY, dispZ));
  g.add(box(0.08, 0.04, 0.005, displayMat, dispX, dispY + 0.01, dispZ - 0.01));
  // Temperature digits (visual bars)
  g.add(box(0.015, 0.025, 0.003, mat(0x00ccff, 0, 0.5, { emissive: 0x00ccff, emissiveIntensity: 1.2 }), dispX - 0.02, dispY + 0.01, dispZ - 0.014));
  g.add(box(0.015, 0.025, 0.003, mat(0x00ccff, 0, 0.5, { emissive: 0x00ccff, emissiveIntensity: 1.2 }), dispX, dispY + 0.01, dispZ - 0.014));
  // Degree symbol
  g.add(sph(0.004, mat(0x00ccff, 0, 0.5, { emissive: 0x00ccff, emissiveIntensity: 1.0 }), dispX + 0.015, dispY + 0.025, dispZ - 0.014));
  // Buttons below display
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.006, 0.006, 0.008, 8, M.bodyDark, dispX - 0.025 + i * 0.025, dispY - 0.025, dispZ - 0.008));
  }

  // ── Frost/Ice Effect on Edges ──
  // Frost on door frame edges
  g.add(box(doorW + 0.06, 0.008, 0.008, frostMat, 0, doorH + 0.02, -roomD / 2 - 0.005));
  g.add(box(0.008, doorH * 0.3, 0.008, frostMat, -doorW / 2 - 0.02, doorH * 0.85, -roomD / 2 - 0.005));
  g.add(box(0.008, doorH * 0.3, 0.008, frostMat, doorW / 2 + 0.02, doorH * 0.85, -roomD / 2 - 0.005));
  // Frost on ceiling edge
  g.add(box(roomW + 0.01, 0.01, 0.01, frostMat, 0, roomH + 0.005, -roomD / 2));
  // Ice buildup near condenser pipes
  g.add(sph(0.02, frostMat, -0.15, roomH + 0.06, 0.1));
  g.add(sph(0.015, frostMat, -0.12, roomH + 0.04, 0.12));

  // ── Interior Light (visible through door gap) ──
  g.add(box(0.1, 0.01, 0.06, interiorLight, 0, roomH - wallT - 0.01, -roomD / 4));
  // Light glow on floor through door
  g.add(box(doorW * 0.8, 0.002, 0.15, mat(0xffffdd, 0, 1, { transparent: true, opacity: 0.15 }), 0, 0.02, -roomD / 2 - 0.08));

  // ── Drainage Pipe at Base ──
  g.add(cyl(0.012, 0.012, 0.2, 8, pipeMat, roomW / 2 + 0.03, 0.05, 0.2, 0, 0, Math.PI / 6));
  g.add(cyl(0.015, 0.015, 0.03, 8, pipeMat, roomW / 2 + 0.01, 0.05, 0.1, Math.PI / 2, 0, 0));
  // Drain pan
  g.add(box(0.06, 0.01, 0.06, pipeMat, roomW / 2 + 0.1, 0.01, 0.28));

  // ── Warning Signage ──
  // "Cold storage" warning sign
  g.add(box(0.12, 0.08, 0.003, warningMat, -0.3, doorH * 0.65, -roomD / 2 - wallT / 2 - 0.002));
  g.add(box(0.1, 0.06, 0.003, warningYellow, -0.3, doorH * 0.65, -roomD / 2 - wallT / 2 - 0.003));
  // Warning icon (triangle)
  g.add(box(0.03, 0.025, 0.004, M.bodyDark, -0.3, doorH * 0.67, -roomD / 2 - wallT / 2 - 0.004));
  // Text line
  g.add(box(0.06, 0.008, 0.004, M.bodyDark, -0.3, doorH * 0.62, -roomD / 2 - wallT / 2 - 0.004));

  // PPE required sign
  g.add(box(0.06, 0.06, 0.003, M.blue, -0.3, doorH * 0.5, -roomD / 2 - wallT / 2 - 0.002));
  g.add(cyl(0.02, 0.02, 0.004, 12, warningMat, -0.3, doorH * 0.5, -roomD / 2 - wallT / 2 - 0.003));

  // ── Thermometer Indicator (vertical gauge on wall) ──
  const thermoX = roomW / 2 + 0.005;
  g.add(box(0.015, 0.15, 0.015, panelSilver, thermoX, 0.4, -0.15));
  // Mercury/alcohol column
  g.add(box(0.005, 0.08, 0.005, mat(0x2244cc, 0, 0.5), thermoX, 0.36, -0.15));
  // Bulb at bottom
  g.add(sph(0.008, mat(0x2244cc, 0, 0.5), thermoX, 0.31, -0.15));
  // Scale markings
  for (let i = 0; i < 6; i++) {
    g.add(box(0.012, 0.001, 0.002, M.bodyDark, thermoX, 0.32 + i * 0.02, -0.14));
  }

  // ── Status Light ──
  g.add(createStatusLight(roomW / 2 + 0.05, roomH, -roomD / 2 + 0.1));

  return g;
}
