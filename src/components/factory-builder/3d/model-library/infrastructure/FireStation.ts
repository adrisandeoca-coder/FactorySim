import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildFireStation(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const wallMat = mat(0xd0ccc4, 0.05, 0.9);
  const cabinetRed = mat(0xcc2222, 0.2, 0.5);
  const cabinetDarkRed = mat(0x991111, 0.25, 0.55);
  const glassMat = mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const extRed = mat(0xdd3333, 0.3, 0.45);
  const handleBlack = mat(0x1a1c20, 0.0, 0.85);
  const nozzleGray = mat(0x555555, 0.7, 0.35);
  const signRed = mat(0xdd2222, 0.1, 0.5, { emissive: 0x330000, emissiveIntensity: 0.2 });
  const signWhite = mat(0xeeeeee, 0.0, 0.85);
  const signGreen = mat(0x00aa44, 0.1, 0.4, { emissive: 0x003311, emissiveIntensity: 0.4 });
  const alarmRed = mat(0xee1111, 0.15, 0.45, { emissive: 0x440000, emissiveIntensity: 0.3 });
  const hoseMat = mat(0xcc3322, 0.05, 0.75);
  const hoseReelMat = mat(0x555555, 0.7, 0.35);
  const aedWhite = mat(0xeeeeee, 0.1, 0.6);
  const aedGreen = mat(0x22aa55, 0.15, 0.5);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const frameMat = mat(0x444444, 0.6, 0.4);

  // ── Wall background ──
  g.add(box(1.8, 2.8, 0.08, wallMat, 0, 1.4, -0.04));

  // ════════════════════════════════════════
  // ── 1. Fire Extinguisher Cabinet ──
  // ════════════════════════════════════════
  const cabX = -0.35;
  const cabY = 1.2;
  const cabW = 0.35;
  const cabH = 0.55;
  const cabD = 0.2;

  // Cabinet body (red box on wall)
  g.add(box(cabW, cabH, cabD, cabinetRed, cabX, cabY, cabD / 2));
  // Cabinet back plate
  g.add(box(cabW - 0.02, cabH - 0.02, 0.004, cabinetDarkRed, cabX, cabY, 0.01));
  // Cabinet frame edges
  g.add(box(cabW + 0.01, 0.015, cabD + 0.01, frameMat, cabX, cabY + cabH / 2, cabD / 2));
  g.add(box(cabW + 0.01, 0.015, cabD + 0.01, frameMat, cabX, cabY - cabH / 2, cabD / 2));
  g.add(box(0.015, cabH, cabD + 0.01, frameMat, cabX - cabW / 2, cabY, cabD / 2));
  g.add(box(0.015, cabH, cabD + 0.01, frameMat, cabX + cabW / 2, cabY, cabD / 2));

  // Glass front panel (transparent)
  g.add(box(cabW - 0.04, cabH - 0.06, 0.004, glassMat, cabX, cabY, cabD + 0.002));

  // Cabinet handle
  g.add(box(0.01, 0.08, 0.02, nozzleGray, cabX + cabW / 2 - 0.02, cabY, cabD + 0.01));

  // ── Fire Extinguisher inside cabinet ──
  // Main cylinder body
  g.add(cyl(0.045, 0.045, 0.34, 12, extRed, cabX, cabY - 0.05, cabD / 2));
  // Bottom dome
  g.add(sph(0.045, extRed, cabX, cabY - 0.22, cabD / 2));
  // Top shoulder taper
  g.add(cyl(0.045, 0.025, 0.04, 10, extRed, cabX, cabY + 0.14, cabD / 2));
  // Valve head
  g.add(cyl(0.02, 0.02, 0.035, 8, nozzleGray, cabX, cabY + 0.175, cabD / 2));
  // Handle/lever (squeeze lever)
  g.add(box(0.005, 0.02, 0.06, handleBlack, cabX, cabY + 0.2, cabD / 2 + 0.01));
  g.add(box(0.005, 0.02, 0.06, nozzleGray, cabX, cabY + 0.18, cabD / 2 + 0.01));
  // Nozzle/hose
  g.add(cyl(0.008, 0.008, 0.12, 8, handleBlack, cabX + 0.03, cabY + 0.19, cabD / 2, 0, 0, Math.PI / 4));
  // Nozzle tip (cone)
  g.add(cyl(0.012, 0.006, 0.03, 8, handleBlack, cabX + 0.07, cabY + 0.22, cabD / 2));
  // Pressure gauge
  g.add(cyl(0.012, 0.012, 0.008, 10, signWhite, cabX - 0.03, cabY + 0.17, cabD / 2 + 0.05, Math.PI / 2, 0, 0));
  g.add(cyl(0.013, 0.013, 0.002, 10, frameMat, cabX - 0.03, cabY + 0.17, cabD / 2 + 0.054, Math.PI / 2, 0, 0));
  // Label band on cylinder
  g.add(cyl(0.046, 0.046, 0.06, 12, signWhite, cabX, cabY, cabD / 2));

  // ════════════════════════════════════════
  // ── 2. "FIRE EXTINGUISHER" sign above ──
  // ════════════════════════════════════════
  const signY = cabY + cabH / 2 + 0.12;
  g.add(box(0.4, 0.08, 0.008, signRed, cabX, signY, 0.005));
  // Text representation (white bar)
  g.add(box(0.32, 0.03, 0.009, signWhite, cabX, signY, 0.006));
  // Sign mounting screws
  g.add(cyl(0.005, 0.005, 0.012, 6, boltMat, cabX - 0.17, signY, 0.012));
  g.add(cyl(0.005, 0.005, 0.012, 6, boltMat, cabX + 0.17, signY, 0.012));

  // ════════════════════════════════════════
  // ── 3. Fire Alarm Pull Station ──
  // ════════════════════════════════════════
  const alarmX = cabX + cabW / 2 + 0.2;
  const alarmY = 1.3;
  // Main alarm box
  g.add(box(0.1, 0.14, 0.06, alarmRed, alarmX, alarmY, 0.03));
  // Front face plate
  g.add(box(0.085, 0.12, 0.004, cabinetRed, alarmX, alarmY, 0.061));
  // T-bar pull handle
  g.add(box(0.06, 0.01, 0.015, signWhite, alarmX, alarmY - 0.02, 0.07));
  g.add(box(0.008, 0.04, 0.015, signWhite, alarmX, alarmY - 0.04, 0.07));
  // "PULL" text indicator
  g.add(box(0.04, 0.012, 0.005, signWhite, alarmX, alarmY + 0.03, 0.063));
  // Glass break rod (across front)
  g.add(box(0.07, 0.003, 0.003, glassMat, alarmX, alarmY - 0.01, 0.065));
  // LED indicator
  g.add(sph(0.006, M.statusRed, alarmX, alarmY + 0.055, 0.063));
  // Mounting plate
  g.add(box(0.12, 0.16, 0.006, frameMat, alarmX, alarmY, 0.003));

  // ════════════════════════════════════════
  // ── 4. Fire Hose Reel Cabinet ──
  // ════════════════════════════════════════
  const hoseX = -0.35;
  const hoseY = 0.45;
  const hoseW = 0.6;
  const hoseH = 0.55;
  const hoseD = 0.25;

  // Cabinet body
  g.add(box(hoseW, hoseH, hoseD, cabinetRed, hoseX, hoseY, hoseD / 2));
  // Front panel
  g.add(box(hoseW - 0.03, hoseH - 0.03, 0.004, cabinetDarkRed, hoseX, hoseY, hoseD + 0.002));
  // Glass viewing window (circular area)
  g.add(cyl(0.15, 0.15, 0.005, 16, glassMat, hoseX, hoseY, hoseD + 0.003));

  // Hose reel (visible through glass)
  // Reel drum (center hub)
  g.add(cyl(0.04, 0.04, 0.1, 12, hoseReelMat, hoseX, hoseY, hoseD / 2, Math.PI / 2, 0, 0));
  // Reel flanges (side discs)
  g.add(cyl(0.13, 0.13, 0.006, 16, hoseReelMat, hoseX, hoseY, hoseD / 2 - 0.05));
  g.add(cyl(0.13, 0.13, 0.006, 16, hoseReelMat, hoseX, hoseY, hoseD / 2 + 0.05));
  // Wound hose on reel (concentric rings representing layers)
  for (let r = 0.06; r <= 0.12; r += 0.015) {
    g.add(cyl(r, r, 0.08, 16, hoseMat, hoseX, hoseY, hoseD / 2, Math.PI / 2, 0, 0));
  }
  // Reel axle
  g.add(cyl(0.01, 0.01, 0.18, 8, boltMat, hoseX, hoseY, hoseD / 2, Math.PI / 2, 0, 0));
  // Reel spokes
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
    const sx = Math.cos(a) * 0.08;
    const sy = Math.sin(a) * 0.08;
    g.add(box(0.005, 0.005, 0.09, hoseReelMat, hoseX + sx / 2, hoseY + sy / 2, hoseD / 2));
  }

  // Cabinet handle
  g.add(cyl(0.008, 0.008, 0.1, 8, nozzleGray, hoseX + hoseW / 2 - 0.02, hoseY, hoseD + 0.02));

  // ════════════════════════════════════════
  // ── 5. Emergency Exit Sign ──
  // ════════════════════════════════════════
  const exitX = 0.55;
  const exitY = 2.3;
  // Sign body
  g.add(box(0.3, 0.12, 0.02, signGreen, exitX, exitY, 0.01));
  // Sign face glow
  g.add(box(0.27, 0.09, 0.005, mat(0x44ff88, 0.0, 0.3, { emissive: 0x00ff44, emissiveIntensity: 0.6 }),
    exitX, exitY, 0.021));
  // Running man figure (simplified)
  // Body
  g.add(box(0.005, 0.035, 0.006, signWhite, exitX - 0.04, exitY + 0.005, 0.022));
  // Head
  g.add(sph(0.01, signWhite, exitX - 0.04, exitY + 0.03, 0.022));
  // Legs (two angled bars)
  g.add(box(0.005, 0.025, 0.006, signWhite, exitX - 0.05, exitY - 0.025, 0.022, 0, 0, 0.4));
  g.add(box(0.005, 0.025, 0.006, signWhite, exitX - 0.03, exitY - 0.025, 0.022, 0, 0, -0.3));
  // Arrow (pointing right)
  g.add(box(0.06, 0.008, 0.006, signWhite, exitX + 0.04, exitY, 0.022));
  g.add(box(0.025, 0.008, 0.006, signWhite, exitX + 0.07, exitY + 0.012, 0.022, 0, 0, -0.6));
  g.add(box(0.025, 0.008, 0.006, signWhite, exitX + 0.07, exitY - 0.012, 0.022, 0, 0, 0.6));
  // Sign mounting bracket
  g.add(box(0.04, 0.02, 0.015, frameMat, exitX - 0.1, exitY + 0.06, 0.008));
  g.add(box(0.04, 0.02, 0.015, frameMat, exitX + 0.1, exitY + 0.06, 0.008));

  // ════════════════════════════════════════
  // ── 6. AED Defibrillator Box ──
  // ════════════════════════════════════════
  const aedX = 0.5;
  const aedY = 1.2;
  const aedW = 0.3;
  const aedH = 0.35;
  const aedD = 0.14;

  // AED cabinet body
  g.add(box(aedW, aedH, aedD, aedWhite, aedX, aedY, aedD / 2));
  // Green front panel
  g.add(box(aedW - 0.02, aedH - 0.02, 0.005, aedGreen, aedX, aedY, aedD + 0.003));
  // Heart/cross symbol on front
  // Heart (two overlapping circles + triangle)
  g.add(sph(0.02, signWhite, aedX - 0.015, aedY + 0.06, aedD + 0.006));
  g.add(sph(0.02, signWhite, aedX + 0.015, aedY + 0.06, aedD + 0.006));
  g.add(box(0.04, 0.03, 0.005, signWhite, aedX, aedY + 0.04, aedD + 0.006));
  // Lightning bolt (simplified as two bars)
  g.add(box(0.008, 0.04, 0.006, mat(0xffdd00, 0.1, 0.4), aedX, aedY + 0.05, aedD + 0.008, 0, 0, 0.2));
  g.add(box(0.008, 0.04, 0.006, mat(0xffdd00, 0.1, 0.4), aedX + 0.005, aedY + 0.03, aedD + 0.008, 0, 0, -0.2));
  // "AED" text bar
  g.add(box(0.08, 0.02, 0.006, signWhite, aedX, aedY - 0.04, aedD + 0.006));
  // Cabinet handle
  g.add(box(0.008, 0.06, 0.015, nozzleGray, aedX + aedW / 2 - 0.015, aedY, aedD + 0.008));
  // Mounting bracket
  g.add(box(aedW + 0.02, 0.04, 0.008, frameMat, aedX, aedY + aedH / 2 + 0.02, 0.004));
  g.add(cyl(0.005, 0.005, 0.015, 6, boltMat, aedX - aedW / 2 + 0.02, aedY + aedH / 2 + 0.02, 0.012));
  g.add(cyl(0.005, 0.005, 0.015, 6, boltMat, aedX + aedW / 2 - 0.02, aedY + aedH / 2 + 0.02, 0.012));

  return g;
}
