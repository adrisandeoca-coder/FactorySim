import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildLaserCutter(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const panelGray = mat(0x404854, 0.6, 0.45);
  const panelDark = mat(0x2a2e36, 0.65, 0.4);
  const frameMetal = mat(0x505868, 0.75, 0.3);
  const tintedGlass = mat(0x225544, 0.0, 0.1, {
    transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    emissive: 0x113322, emissiveIntensity: 0.3,
  });
  const innerGlow = mat(0xff6600, 0.0, 0.5, {
    emissive: 0xff4400, emissiveIntensity: 1.5,
  });
  const stainless = mat(0x889098, 0.85, 0.2);
  const warningYellow = mat(0xddaa00, 0.1, 0.6);
  const ductMetal = mat(0x667078, 0.6, 0.35);
  const grillDark = mat(0x1a1e22, 0.5, 0.6);
  // ====== HEAVY BASE / BED FRAME ======
  // Main base slab
  g.add(box(2.8, 0.15, 1.8, frameMetal, 0, 0.075, 0));
  // Leveling feet (4 corners)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.06, 0.08, 0.06, 12, M.rubber, sx * 1.25, 0.03, sz * 0.75));
      g.add(cyl(0.04, 0.04, 0.04, 8, M.chrome, sx * 1.25, 0.06, sz * 0.75));
    }
  }
  // Reinforcement ribs under base
  for (let x = -1.0; x <= 1.0; x += 0.5) {
    g.add(box(0.06, 0.1, 1.6, frameMetal, x, 0.05, 0));
  }

  // ====== ENCLOSED CUTTING AREA (MAIN BODY) ======
  const bodyH = 1.1;
  const bodyY = 0.15 + bodyH / 2;
  // Back panel
  g.add(box(2.8, bodyH, 0.05, panelGray, 0, bodyY, -0.875));
  // Left side panel
  g.add(box(0.05, bodyH, 1.75, panelGray, -1.375, bodyY, 0));
  // Right side panel
  g.add(box(0.05, bodyH, 1.75, panelGray, 1.375, bodyY, 0));
  // Top panel
  g.add(box(2.8, 0.05, 1.8, panelGray, 0, 0.15 + bodyH + 0.025, 0));
  // Front lower panel (below window)
  g.add(box(2.8, 0.3, 0.05, panelGray, 0, 0.3, 0.875));
  // Front upper panel (above window)
  g.add(box(2.8, 0.2, 0.05, panelGray, 0, 0.15 + bodyH - 0.1, 0.875));

  // Front panel frame around window
  g.add(box(0.08, bodyH, 0.06, panelDark, -1.1, bodyY, 0.88));
  g.add(box(0.08, bodyH, 0.06, panelDark, 1.1, bodyY, 0.88));

  // ====== LARGE GLASS VIEWING WINDOW ======
  g.add(box(2.1, 0.55, 0.02, tintedGlass, 0, bodyY, 0.89));
  // Window frame trim
  g.add(box(2.15, 0.03, 0.04, M.darkChrome, 0, bodyY - 0.28, 0.89));
  g.add(box(2.15, 0.03, 0.04, M.darkChrome, 0, bodyY + 0.28, 0.89));
  g.add(box(0.03, 0.55, 0.04, M.darkChrome, -1.075, bodyY, 0.89));
  g.add(box(0.03, 0.55, 0.04, M.darkChrome, 1.075, bodyY, 0.89));

  // Inner orange glow source (visible through glass)
  g.add(box(0.15, 0.02, 0.15, innerGlow, 0, 0.2, 0));

  // ====== GANTRY SYSTEM INSIDE ======
  // X-axis rails (left and right)
  g.add(box(2.4, 0.06, 0.06, stainless, 0, 0.9, -0.5));
  g.add(box(2.4, 0.06, 0.06, stainless, 0, 0.9, 0.5));
  // Y-axis bridge (cross beam)
  g.add(box(0.08, 0.08, 1.0, stainless, 0.3, 0.92, 0));
  // Gantry carriage blocks
  g.add(box(0.14, 0.06, 0.1, M.darkChrome, 0.3, 0.9, -0.5));
  g.add(box(0.14, 0.06, 0.1, M.darkChrome, 0.3, 0.9, 0.5));
  // Linear guides on bridge
  g.add(box(0.04, 0.04, 0.8, M.chrome, 0.3, 0.96, 0));

  // ====== LASER HEAD ======
  // Head carriage
  g.add(box(0.12, 0.08, 0.12, M.bodyDark, 0.3, 0.98, 0.1));
  // Laser nozzle body
  g.add(cyl(0.04, 0.03, 0.2, 12, M.chrome, 0.3, 0.86, 0.1));
  // Nozzle tip
  g.add(cyl(0.025, 0.015, 0.06, 10, mat(0xbb6600, 0.7, 0.2), 0.3, 0.75, 0.1));
  // Focus lens housing
  g.add(cyl(0.05, 0.05, 0.04, 12, M.darkChrome, 0.3, 0.93, 0.1));
  // Beam delivery tube
  g.add(cyl(0.02, 0.02, 0.15, 8, stainless, 0.3, 1.05, 0.1));

  // ====== CUTTING BED (honeycomb/slat table) ======
  g.add(box(2.2, 0.03, 1.4, mat(0x333840, 0.6, 0.5), 0, 0.18, 0));
  // Slat lines
  for (let x = -1.0; x <= 1.0; x += 0.1) {
    g.add(box(0.01, 0.05, 1.3, mat(0x445060, 0.7, 0.4), x, 0.2, 0));
  }

  // ====== FUME EXTRACTION DUCT ON TOP ======
  g.add(cyl(0.12, 0.12, 0.3, 12, ductMetal, 0.5, 1.45, -0.3));
  g.add(cyl(0.12, 0.12, 0.4, 12, ductMetal, 0.5, 1.45, -0.3, 0, 0, Math.PI / 6));
  // Duct elbow
  g.add(sph(0.13, ductMetal, 0.5, 1.55, -0.3));
  // Vertical riser
  g.add(cyl(0.11, 0.11, 0.5, 12, ductMetal, 0.5, 1.8, -0.3));
  // Duct flange
  g.add(cyl(0.15, 0.15, 0.03, 12, M.darkChrome, 0.5, 1.3, -0.3));

  // ====== CONTROL PANEL / HMI ON ARTICULATED ARM ======
  // Arm mount on right side
  g.add(cyl(0.04, 0.04, 0.15, 8, M.darkChrome, 1.4, 1.0, 0.4));
  // Arm horizontal segment
  g.add(box(0.04, 0.04, 0.35, M.darkChrome, 1.55, 1.05, 0.55));
  // Arm joint
  g.add(sph(0.04, M.chrome, 1.4, 1.05, 0.4));
  // Monitor housing
  g.add(box(0.35, 0.25, 0.04, M.bodyDark, 1.6, 1.05, 0.72));
  // Screen
  g.add(box(0.3, 0.2, 0.01, M.screenActive, 1.6, 1.06, 0.745));
  // Screen bezel
  g.add(box(0.34, 0.02, 0.05, M.bodyDark, 1.6, 1.18, 0.72));
  g.add(box(0.34, 0.02, 0.05, M.bodyDark, 1.6, 0.92, 0.72));
  // Buttons below screen
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.015, 0.015, 0.015, 8, M.chrome, 1.48 + i * 0.08, 0.88, 0.74));
  }
  // Emergency stop on panel
  g.add(cyl(0.03, 0.03, 0.02, 12, M.red, 1.75, 0.88, 0.74));
  g.add(cyl(0.035, 0.035, 0.005, 12, warningYellow, 1.75, 0.87, 0.74));

  // ====== CHILLER UNIT ON SIDE ======
  const chX = -1.55;
  g.add(box(0.5, 0.65, 0.7, panelGray, chX, 0.475, -0.35));
  // Fan grille (front)
  g.add(cyl(0.12, 0.12, 0.02, 16, grillDark, chX, 0.55, -0.005));
  g.add(cyl(0.1, 0.1, 0.025, 16, mat(0x334455, 0.3, 0.5), chX, 0.55, -0.002));
  // Fan blades hint
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 2;
    g.add(box(0.08, 0.015, 0.015, M.darkChrome,
      chX + Math.cos(angle) * 0.06, 0.55 + Math.sin(angle) * 0.06, 0.0));
  }
  // Chiller pipes
  g.add(cyl(0.02, 0.02, 0.3, 8, M.pipe, chX + 0.2, 0.6, -0.2, 0, 0, Math.PI / 2));
  g.add(cyl(0.02, 0.02, 0.3, 8, M.pipe, chX + 0.2, 0.5, -0.2, 0, 0, Math.PI / 2));
  // Chiller label
  g.add(box(0.15, 0.06, 0.005, M.blue, chX, 0.35, 0.0));

  // ====== SHEET LOADING / SHUTTLE TABLE ======
  const stX = 0;
  const stZ = 1.2;
  // Table frame
  g.add(box(2.4, 0.06, 0.6, frameMetal, stX, 0.6, stZ));
  // Table legs
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.6, 0.06, frameMetal, sx * 1.1, 0.3, stZ - 0.2));
    g.add(box(0.06, 0.6, 0.06, frameMetal, sx * 1.1, 0.3, stZ + 0.2));
  }
  // Roller balls on shuttle table
  for (let x = -1.0; x <= 1.0; x += 0.25) {
    for (let z = -0.15; z <= 0.15; z += 0.15) {
      g.add(sph(0.02, M.chrome, x, 0.65, stZ + z));
    }
  }
  // Sheet metal on table
  g.add(box(2.0, 0.015, 0.5, stainless, 0, 0.66, stZ));

  // ====== ELECTRICAL CABINET AT REAR ======
  const ecZ = -1.15;
  g.add(box(0.8, 1.2, 0.4, panelDark, 0, 0.6, ecZ));
  // Cabinet door line
  g.add(box(0.005, 1.0, 0.01, M.darkChrome, 0.0, 0.6, ecZ + 0.205));
  // Door handle
  g.add(box(0.04, 0.12, 0.02, M.chrome, 0.05, 0.7, ecZ + 0.21));
  // Ventilation slots
  for (let y = 0.25; y < 1.1; y += 0.08) {
    g.add(box(0.5, 0.015, 0.01, grillDark, 0, y, ecZ + 0.205));
  }
  // Cable entry glands at bottom
  for (let x = -0.25; x <= 0.25; x += 0.12) {
    g.add(cyl(0.02, 0.02, 0.05, 8, M.rubber, x, 0.05, ecZ + 0.2));
  }
  // Warning high voltage sticker
  g.add(box(0.1, 0.1, 0.005, warningYellow, 0.25, 0.9, ecZ + 0.205));
  g.add(box(0.06, 0.06, 0.006, mat(0x111111, 0, 0.9), 0.25, 0.9, ecZ + 0.207));

  // ====== WARNING LASER SAFETY SIGNAGE ======
  // On front panel
  g.add(box(0.2, 0.1, 0.005, warningYellow, -0.7, 0.25, 0.88));
  g.add(box(0.14, 0.06, 0.006, mat(0x111111, 0, 0.9), -0.7, 0.25, 0.882));
  // Laser class label on side
  g.add(box(0.12, 0.08, 0.005, M.red, -1.38, 0.5, 0.3));

  // ====== COMPRESSED AIR CONNECTION ======
  // Quick disconnect fitting on rear
  g.add(cyl(0.025, 0.025, 0.08, 8, mat(0xbbcc00, 0.5, 0.3), -0.6, 0.35, -0.93));
  g.add(cyl(0.015, 0.015, 0.12, 8, M.pipe, -0.6, 0.35, -1.0, Math.PI / 2, 0, 0));
  // Air hose
  g.add(cyl(0.018, 0.018, 0.3, 8, M.blue, -0.6, 0.35, -1.15, Math.PI / 2, 0, 0));

  // ====== CABLE TRUNKING / ENERGY CHAIN ======
  for (let i = 0; i < 8; i++) {
    g.add(box(0.04, 0.03, 0.035, M.bodyDark,
      -0.5 + i * 0.06, 1.15, -0.5));
  }

  // ====== BRAND PLATE / LOGO AREA ======
  g.add(box(0.3, 0.05, 0.005, M.chrome, 0.8, 1.2, 0.88));

  // ====== INTERNAL LIGHTING (VISIBLE THROUGH GLASS) ======
  // LED strips inside top
  g.add(box(2.0, 0.02, 0.02, mat(0xffffff, 0, 0.5, {
    emissive: 0xffeedd, emissiveIntensity: 0.8,
  }), 0, 1.2, 0.6));
  g.add(box(2.0, 0.02, 0.02, mat(0xffffff, 0, 0.5, {
    emissive: 0xffeedd, emissiveIntensity: 0.8,
  }), 0, 1.2, -0.4));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(1.3, 1.28, -0.6));

  return g;
}
