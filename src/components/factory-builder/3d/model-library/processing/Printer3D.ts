import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildPrinter3D(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const cabinetWhite = mat(0xd8dce0, 0.3, 0.55);
  const cabinetDark = mat(0x2a2e36, 0.5, 0.5);
  const chamberGlass = mat(0x88aacc, 0.0, 0.08, {
    transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  });
  const buildPlate = mat(0x556070, 0.8, 0.3);
  const heatedBed = mat(0x443322, 0.6, 0.4);
  const extruderMetal = mat(0x889098, 0.85, 0.2);
  const hepaFilter = mat(0xccccbb, 0.0, 0.9);
  const ledBlue = mat(0x4488ff, 0.0, 0.3, {
    emissive: 0x2266ff, emissiveIntensity: 1.5,
  });
  const ledWhite = mat(0xffffff, 0.0, 0.3, {
    emissive: 0xeeeeff, emissiveIntensity: 1.0,
  });
  const filamentOrange = mat(0xee7722, 0.1, 0.5);
  const ptfeTube = mat(0xddddcc, 0.0, 0.6);

  // ====== MAIN CABINET BODY ======
  const cabW = 1.2;
  const cabH = 1.4;
  const cabD = 1.0;
  const baseY = 0.3;
  // Base stand / legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.06, baseY, 0.06, cabinetDark,
        sx * (cabW / 2 - 0.06), baseY / 2, sz * (cabD / 2 - 0.06)));
      g.add(cyl(0.04, 0.04, 0.03, 8, M.rubber,
        sx * (cabW / 2 - 0.06), 0.015, sz * (cabD / 2 - 0.06)));
    }
  }
  // Lower shelf/crossbar
  g.add(box(cabW - 0.12, 0.03, cabD - 0.12, cabinetDark, 0, 0.12, 0));

  // Cabinet panels
  // Back
  g.add(box(cabW, cabH, 0.04, cabinetWhite, 0, baseY + cabH / 2, -cabD / 2));
  // Left
  g.add(box(0.04, cabH, cabD, cabinetWhite, -cabW / 2, baseY + cabH / 2, 0));
  // Right
  g.add(box(0.04, cabH, cabD, cabinetWhite, cabW / 2, baseY + cabH / 2, 0));
  // Top
  g.add(box(cabW, 0.04, cabD, cabinetWhite, 0, baseY + cabH, 0));
  // Bottom of chamber
  g.add(box(cabW, 0.04, cabD, cabinetDark, 0, baseY, 0));
  // Front panel bottom section
  g.add(box(cabW, 0.35, 0.04, cabinetWhite, 0, baseY + 0.175, cabD / 2));
  // Front panel top section
  g.add(box(cabW, 0.2, 0.04, cabinetWhite, 0, baseY + cabH - 0.1, cabD / 2));

  // ====== GLASS FRONT PANEL ======
  const glassH = cabH - 0.55;
  const glassY = baseY + 0.35 + glassH / 2;
  g.add(box(cabW - 0.08, glassH, 0.02, chamberGlass, 0, glassY, cabD / 2 + 0.01));
  // Glass frame
  g.add(box(cabW - 0.06, 0.03, 0.05, M.darkChrome, 0, baseY + 0.35, cabD / 2));
  g.add(box(cabW - 0.06, 0.03, 0.05, M.darkChrome, 0, baseY + cabH - 0.2, cabD / 2));
  g.add(box(0.03, glassH, 0.05, M.darkChrome, -cabW / 2 + 0.04, glassY, cabD / 2));
  g.add(box(0.03, glassH, 0.05, M.darkChrome, cabW / 2 - 0.04, glassY, cabD / 2));
  // Door handle (subtle indent)
  g.add(box(0.15, 0.02, 0.02, M.chrome, 0, baseY + 0.38, cabD / 2 + 0.02));

  // ====== BUILD PLATFORM (LOWERED PARTWAY) ======
  const platY = baseY + 0.4;
  g.add(box(0.6, 0.04, 0.6, buildPlate, 0, platY, 0));
  // Heated bed surface
  g.add(box(0.55, 0.01, 0.55, heatedBed, 0, platY + 0.025, 0));
  // Z-axis lead screw
  g.add(cyl(0.015, 0.015, 0.5, 8, M.chrome, 0, baseY + 0.2, 0));
  // Z-axis guide rods
  g.add(cyl(0.01, 0.01, 0.5, 6, M.chrome, -0.25, baseY + 0.2, -0.25));
  g.add(cyl(0.01, 0.01, 0.5, 6, M.chrome, 0.25, baseY + 0.2, -0.25));
  // Z-motor at bottom
  g.add(box(0.06, 0.06, 0.06, M.bodyDark, 0, baseY + 0.03, 0));
  // Linear bearings
  g.add(cyl(0.02, 0.02, 0.04, 8, M.darkChrome, -0.25, platY - 0.02, -0.25));
  g.add(cyl(0.02, 0.02, 0.04, 8, M.darkChrome, 0.25, platY - 0.02, -0.25));

  // Partially printed object on bed
  g.add(box(0.12, 0.08, 0.1, mat(0xee7722, 0.1, 0.6), 0.05, platY + 0.065, 0.05));
  g.add(box(0.08, 0.04, 0.06, mat(0xee7722, 0.1, 0.6), -0.1, platY + 0.045, -0.08));

  // ====== BUILD PLATE LEVELING KNOBS ======
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.025, 0.025, 0.02, 12, M.red,
        sx * 0.24, platY - 0.04, sz * 0.24));
    }
  }

  // ====== PRINT HEAD / EXTRUDER ON X-Y GANTRY ======
  const gantryY = baseY + cabH - 0.35;
  // X-axis rail
  g.add(box(0.8, 0.04, 0.04, M.chrome, 0, gantryY, 0.1));
  // Y-axis rails (left and right)
  g.add(box(0.04, 0.04, 0.7, M.chrome, -0.4, gantryY, -0.05));
  g.add(box(0.04, 0.04, 0.7, M.chrome, 0.4, gantryY, -0.05));
  // X-carriage blocks
  g.add(box(0.08, 0.06, 0.06, M.darkChrome, -0.4, gantryY, 0.1));
  g.add(box(0.08, 0.06, 0.06, M.darkChrome, 0.4, gantryY, 0.1));
  // Y-carriage on X rail
  g.add(box(0.1, 0.06, 0.08, M.bodyDark, 0.15, gantryY, 0.1));

  // Extruder / hot end assembly
  const exY = gantryY - 0.08;
  g.add(box(0.08, 0.06, 0.06, M.bodyDark, 0.15, exY, 0.1));
  // Heat sink fins
  for (let dy = 0; dy < 4; dy++) {
    g.add(box(0.1, 0.005, 0.08, extruderMetal,
      0.15, exY - 0.02 - dy * 0.015, 0.1));
  }
  // Heat block
  g.add(box(0.04, 0.03, 0.04, extruderMetal, 0.15, exY - 0.1, 0.1));
  // Nozzle
  g.add(cyl(0.008, 0.003, 0.015, 6, mat(0xbb8833, 0.8, 0.2),
    0.15, exY - 0.125, 0.1));
  // Part cooling fan
  g.add(box(0.04, 0.04, 0.015, M.bodyDark, 0.2, exY - 0.06, 0.12));
  // Fan duct
  g.add(box(0.02, 0.03, 0.02, M.bodyDark, 0.19, exY - 0.1, 0.12));

  // Belt on X axis
  g.add(box(0.6, 0.005, 0.01, M.rubber, 0, gantryY - 0.025, 0.12));
  // Belt on Y axes
  g.add(box(0.005, 0.005, 0.5, M.rubber, -0.42, gantryY - 0.025, -0.05));
  g.add(box(0.005, 0.005, 0.5, M.rubber, 0.42, gantryY - 0.025, -0.05));

  // Stepper motors
  g.add(box(0.06, 0.06, 0.06, M.bodyDark, -0.42, gantryY, -0.35));
  g.add(box(0.06, 0.06, 0.06, M.bodyDark, 0.42, gantryY, -0.35));
  // Motor pulleys
  g.add(cyl(0.01, 0.01, 0.02, 8, M.chrome, -0.42, gantryY, -0.32));
  g.add(cyl(0.01, 0.01, 0.02, 8, M.chrome, 0.42, gantryY, -0.32));

  // ====== FILAMENT SUPPLY SYSTEM ON SIDE ======
  const fsX = cabW / 2 + 0.25;
  // Spool holder bracket
  g.add(box(0.06, 0.25, 0.06, cabinetDark, fsX, baseY + cabH - 0.2, 0));
  g.add(cyl(0.02, 0.02, 0.12, 8, M.chrome, fsX, baseY + cabH - 0.05, 0,
    0, 0, Math.PI / 2));
  // Filament spool
  g.add(cyl(0.1, 0.1, 0.07, 16, filamentOrange, fsX + 0.08, baseY + cabH - 0.05, 0));
  g.add(cyl(0.04, 0.04, 0.08, 12, cabinetDark, fsX + 0.08, baseY + cabH - 0.05, 0));
  // PTFE tube from spool to extruder
  g.add(cyl(0.006, 0.006, 0.5, 6, ptfeTube,
    fsX - 0.05, baseY + cabH - 0.2, 0, 0.5, 0.3, 0));
  // Filament runout sensor
  g.add(box(0.04, 0.03, 0.03, M.bodyDark, fsX - 0.05, baseY + cabH - 0.1, 0));

  // ====== TOUCHSCREEN HMI ON FRONT ======
  const hmiY = baseY + 0.17;
  g.add(box(0.25, 0.15, 0.02, cabinetDark, 0.3, hmiY, cabD / 2 + 0.03));
  g.add(box(0.22, 0.12, 0.005, M.screenActive, 0.3, hmiY, cabD / 2 + 0.045));
  // Power button
  g.add(cyl(0.012, 0.012, 0.01, 8, M.chrome, 0.45, hmiY, cabD / 2 + 0.045));
  // USB port
  g.add(box(0.02, 0.008, 0.01, M.bodyDark, 0.15, hmiY - 0.04, cabD / 2 + 0.045));
  // SD card slot
  g.add(box(0.025, 0.003, 0.015, M.bodyDark, 0.15, hmiY + 0.04, cabD / 2 + 0.045));

  // ====== HEPA FILTER UNIT ON TOP ======
  g.add(box(0.4, 0.1, 0.3, cabinetDark, 0.2, baseY + cabH + 0.07, -0.2));
  g.add(box(0.35, 0.06, 0.25, hepaFilter, 0.2, baseY + cabH + 0.04, -0.2));
  // Fan grille
  g.add(cyl(0.08, 0.08, 0.02, 12, M.darkChrome, 0.2, baseY + cabH + 0.13, -0.2));
  // Filter indicator light
  g.add(sph(0.01, mat(0x00ff00, 0, 0.3, {
    emissive: 0x00ff00, emissiveIntensity: 1.2,
  }), 0.38, baseY + cabH + 0.1, -0.2));

  // ====== UV CURING LAMP (RESIN DETAIL) ======
  g.add(box(0.2, 0.04, 0.06, mat(0x4422aa, 0.3, 0.5), -0.3, baseY + cabH - 0.22, 0.3));
  g.add(box(0.16, 0.02, 0.04, mat(0x6644cc, 0.0, 0.3, {
    emissive: 0x4422cc, emissiveIntensity: 1.0,
  }), -0.3, baseY + cabH - 0.24, 0.3));

  // ====== MATERIAL FEED TUBE ======
  g.add(cyl(0.015, 0.015, 0.3, 8, ptfeTube,
    cabW / 2 - 0.1, gantryY + 0.05, 0.1, 0, 0, -0.5));

  // ====== POWER SUPPLY HOUSING AT REAR ======
  g.add(box(0.4, 0.2, 0.12, cabinetDark, 0, baseY + 0.1, -cabD / 2 - 0.08));
  // Cooling fan on PSU
  g.add(cyl(0.04, 0.04, 0.02, 10, M.darkChrome,
    0, baseY + 0.1, -cabD / 2 - 0.15));
  // Power socket
  g.add(box(0.05, 0.04, 0.02, M.bodyDark, 0.15, baseY + 0.1, -cabD / 2 - 0.15));
  // Power switch
  g.add(box(0.03, 0.02, 0.01, M.red, 0.15, baseY + 0.15, -cabD / 2 - 0.15));

  // ====== LED INTERIOR LIGHTING ======
  // Top LED strip (blue/white)
  g.add(box(0.8, 0.01, 0.01, ledBlue, 0, baseY + cabH - 0.05, cabD / 2 - 0.1));
  g.add(box(0.01, 0.01, 0.7, ledBlue, -cabW / 2 + 0.05, baseY + cabH - 0.05, -0.05));
  g.add(box(0.01, 0.01, 0.7, ledBlue, cabW / 2 - 0.05, baseY + cabH - 0.05, -0.05));
  // White downlights
  g.add(box(0.8, 0.01, 0.01, ledWhite, 0, baseY + cabH - 0.05, -0.2));

  // ====== BRANDING / LOGO ======
  g.add(box(0.2, 0.04, 0.005, M.chrome, -0.3, baseY + 0.17, cabD / 2 + 0.045));

  // ====== CABLE MANAGEMENT (REAR) ======
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.008, 0.008, 0.3, 6, M.wire,
      -0.15 + i * 0.08, baseY + 0.5, -cabD / 2 - 0.03));
  }

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(-cabW / 2 + 0.1, baseY + cabH + 0.04, cabD / 2 - 0.1));

  return g;
}
