import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildPaintBooth(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const boothWall = mat(0xe8e0d8, 0.1, 0.7);
  const boothCeiling = mat(0xd8d4cc, 0.15, 0.65);
  const filterWhite = mat(0xccccbb, 0.0, 0.95);
  const filterFrame = mat(0x667080, 0.6, 0.4);
  const ductMetal = mat(0x667078, 0.6, 0.35);
  const floorGrate = mat(0x445058, 0.7, 0.4);
  const paintPotRed = mat(0xcc3333, 0.3, 0.5);
  const hoseYellow = mat(0xccaa22, 0.1, 0.6);
  const warningRed = mat(0xdd2222, 0.1, 0.5);
  const lightFixture = mat(0xffffff, 0.0, 0.5, {
    emissive: 0xfff8ee, emissiveIntensity: 1.2,
  });
  const stainless = mat(0x889098, 0.85, 0.2);

  // ====== BOOTH FLOOR / BASE ======
  g.add(box(3.0, 0.1, 2.4, M.bodyDark, 0, 0.05, 0));
  // Floor grate (overspray collection)
  g.add(box(2.6, 0.04, 2.0, floorGrate, 0, 0.12, 0));
  // Grate slats
  for (let x = -1.2; x <= 1.2; x += 0.1) {
    g.add(box(0.015, 0.04, 1.8, M.darkChrome, x, 0.14, 0));
  }
  // Overspray collection trough
  g.add(box(2.6, 0.06, 0.04, M.bodyDark, 0, 0.03, -0.98));
  g.add(box(2.6, 0.06, 0.04, M.bodyDark, 0, 0.03, 0.98));
  g.add(box(0.04, 0.06, 2.0, M.bodyDark, -1.3, 0.03, 0));
  g.add(box(0.04, 0.06, 2.0, M.bodyDark, 1.3, 0.03, 0));
  // Drain at bottom center
  g.add(cyl(0.06, 0.06, 0.05, 12, M.darkChrome, 0, 0.02, 0));
  g.add(cyl(0.03, 0.03, 0.06, 8, M.pipe, 0, -0.02, 0));

  // ====== BOOTH WALLS ======
  const wallH = 2.2;
  const wallY = 0.1 + wallH / 2;
  // Left wall
  g.add(box(0.06, wallH, 2.4, boothWall, -1.47, wallY, 0));
  // Right wall
  g.add(box(0.06, wallH, 2.4, boothWall, 1.47, wallY, 0));
  // Back wall (with filter plenum recess)
  g.add(box(3.0, wallH, 0.06, boothWall, 0, wallY, -1.17));
  // Ceiling
  g.add(box(3.0, 0.06, 2.4, boothCeiling, 0, 0.1 + wallH + 0.03, 0));

  // ====== FRONT OPENING (NO WALL) ======
  // Door frame / header beam
  g.add(box(3.0, 0.12, 0.06, M.bodyDark, 0, 0.1 + wallH - 0.06, 1.17));
  // Side pillars for opening
  g.add(box(0.08, wallH, 0.08, M.bodyDark, -1.44, wallY, 1.17));
  g.add(box(0.08, wallH, 0.08, M.bodyDark, 1.44, wallY, 1.17));
  // Threshold strip
  g.add(box(2.8, 0.03, 0.08, M.yellow, 0, 0.11, 1.17));

  // ====== EXHAUST PLENUM AT REAR (FILTER WALL) ======
  // Filter bank frame
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const fx = -0.8 + col * 0.8;
      const fy = 0.4 + row * 0.6;
      // Filter pad (white)
      g.add(box(0.7, 0.5, 0.06, filterWhite, fx, fy, -1.1));
      // Filter frame border
      g.add(box(0.72, 0.02, 0.07, filterFrame, fx, fy - 0.26, -1.1));
      g.add(box(0.72, 0.02, 0.07, filterFrame, fx, fy + 0.26, -1.1));
      g.add(box(0.02, 0.5, 0.07, filterFrame, fx - 0.36, fy, -1.1));
      g.add(box(0.02, 0.5, 0.07, filterFrame, fx + 0.36, fy, -1.1));
    }
  }

  // ====== LIGHTING FIXTURES INSIDE ======
  for (let x = -0.8; x <= 0.8; x += 0.8) {
    // Fixture housing
    g.add(box(0.6, 0.04, 0.15, M.bodyGray, x, wallH + 0.05, 0));
    // Light panel
    g.add(box(0.5, 0.01, 0.1, lightFixture, x, wallH + 0.02, 0));
  }
  // Wall-mounted lights (left and right)
  for (const sx of [-1, 1]) {
    g.add(box(0.04, 0.8, 0.06, M.bodyGray, sx * 1.4, 1.5, 0));
    g.add(box(0.01, 0.7, 0.04, lightFixture, sx * 1.38, 1.5, 0));
  }

  // ====== EXHAUST FAN / STACK ON TOP ======
  // Fan housing
  g.add(box(0.7, 0.4, 0.7, ductMetal, 0, wallH + 0.36, -0.5));
  // Fan intake grille
  g.add(cyl(0.25, 0.25, 0.04, 16, M.darkChrome, 0, wallH + 0.56, -0.5));
  // Fan blades hint
  for (let a = 0; a < 6; a++) {
    const angle = (a * Math.PI) / 3;
    g.add(box(0.18, 0.03, 0.015, M.chrome,
      Math.cos(angle) * 0.1, wallH + 0.56 + Math.sin(angle) * 0.1, -0.5));
  }
  // Exhaust stack
  g.add(cyl(0.18, 0.18, 0.6, 12, ductMetal, 0, wallH + 0.86, -0.5));
  // Rain cap
  g.add(cyl(0.22, 0.22, 0.03, 12, ductMetal, 0, wallH + 1.18, -0.5));
  g.add(cyl(0.03, 0.03, 0.08, 8, M.chrome, 0, wallH + 1.22, -0.5));

  // ====== AIR INTAKE FILTERS ON SIDES ======
  for (const sx of [-1, 1]) {
    for (let z = -0.5; z <= 0.5; z += 0.5) {
      g.add(box(0.08, 0.4, 0.35, filterWhite, sx * 1.52, 1.2, z));
      g.add(box(0.09, 0.42, 0.02, filterFrame, sx * 1.52, 1.2, z - 0.18));
      g.add(box(0.09, 0.42, 0.02, filterFrame, sx * 1.52, 1.2, z + 0.18));
    }
  }

  // ====== PAINT SUPPLY UNIT (PRESSURE POT ON STAND) ======
  const ppX = 1.8;
  const ppZ = 0.2;
  // Stand legs
  g.add(cyl(0.02, 0.02, 0.5, 6, M.darkChrome, ppX - 0.1, 0.3, ppZ - 0.1));
  g.add(cyl(0.02, 0.02, 0.5, 6, M.darkChrome, ppX + 0.1, 0.3, ppZ - 0.1));
  g.add(cyl(0.02, 0.02, 0.5, 6, M.darkChrome, ppX, 0.3, ppZ + 0.1));
  // Stand platform
  g.add(cyl(0.15, 0.15, 0.03, 12, M.darkChrome, ppX, 0.56, ppZ));
  // Pressure pot
  g.add(cyl(0.12, 0.12, 0.25, 16, paintPotRed, ppX, 0.72, ppZ));
  // Pot lid
  g.add(cyl(0.13, 0.13, 0.02, 16, stainless, ppX, 0.86, ppZ));
  // Pressure gauge
  g.add(cyl(0.03, 0.03, 0.015, 12, M.chrome, ppX + 0.08, 0.88, ppZ));
  g.add(cyl(0.025, 0.025, 0.005, 12, M.screen, ppX + 0.08, 0.89, ppZ));
  // Clamp bolts
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 2;
    g.add(cyl(0.015, 0.015, 0.03, 6, M.chrome,
      ppX + Math.cos(angle) * 0.11, 0.86, ppZ + Math.sin(angle) * 0.11));
  }
  // Air regulator
  g.add(box(0.04, 0.06, 0.04, M.chrome, ppX - 0.12, 0.8, ppZ));
  // Air hose to pot
  g.add(cyl(0.012, 0.012, 0.3, 6, M.blue, ppX - 0.2, 0.8, ppZ, 0, 0, Math.PI / 2));

  // ====== SPRAY GUN HANGING INSIDE ======
  // Hook on wall
  g.add(box(0.03, 0.05, 0.04, M.chrome, 1.3, 1.6, -0.2));
  // Gun body
  g.add(box(0.04, 0.12, 0.04, stainless, 1.3, 1.48, -0.2));
  // Gun handle
  g.add(box(0.03, 0.1, 0.03, M.rubber, 1.3, 1.38, -0.18, 0.3, 0, 0));
  // Nozzle
  g.add(cyl(0.015, 0.008, 0.05, 8, stainless, 1.3, 1.55, -0.2));
  // Paint cup (gravity feed)
  g.add(cyl(0.04, 0.03, 0.08, 12, stainless, 1.3, 1.43, -0.24));
  // Paint hose from pot to gun area
  g.add(cyl(0.01, 0.01, 1.0, 6, hoseYellow, 1.5, 1.2, 0, 0.2, 0.4, 0));

  // ====== TURNTABLE / LAZY SUSAN ======
  g.add(cyl(0.35, 0.35, 0.05, 24, M.darkChrome, 0, 0.17, 0.1));
  g.add(cyl(0.32, 0.32, 0.03, 24, stainless, 0, 0.2, 0.1));
  // Rotation motor housing underneath
  g.add(cyl(0.1, 0.1, 0.08, 12, M.bodyDark, 0, 0.08, 0.1));

  // ====== FIRE SUPPRESSION NOZZLES ======
  for (let x = -0.8; x <= 0.8; x += 0.8) {
    g.add(cyl(0.015, 0.015, 0.06, 8, M.chrome, x, wallH - 0.02, -0.3));
    g.add(sph(0.02, warningRed, x, wallH - 0.06, -0.3));
  }
  // Suppression pipe
  g.add(cyl(0.015, 0.015, 2.0, 8, M.pipe, 0, wallH - 0.02, -0.3, 0, 0, Math.PI / 2));

  // ====== WARNING PLACARDS (FLAMMABLE) ======
  // Front left
  g.add(box(0.18, 0.18, 0.005, warningRed, -1.2, 1.2, 1.2));
  g.add(box(0.12, 0.12, 0.006, M.yellow, -1.2, 1.2, 1.202));
  // Front right
  g.add(box(0.18, 0.18, 0.005, warningRed, 1.2, 1.2, 1.2));
  g.add(box(0.12, 0.12, 0.006, M.yellow, 1.2, 1.2, 1.202));
  // "No Smoking" sign
  g.add(box(0.12, 0.12, 0.005, mat(0xffffff, 0, 0.8), 0, 2.0, 1.2));
  g.add(cyl(0.04, 0.04, 0.006, 12, warningRed, 0, 2.0, 1.202));

  // ====== CONTROL BOX OUTSIDE ======
  const cbX = 1.7;
  g.add(box(0.3, 0.4, 0.12, M.bodyGray, cbX, 1.0, 0.8));
  // Buttons
  g.add(cyl(0.025, 0.025, 0.015, 10, mat(0x00aa44, 0.2, 0.5), cbX - 0.05, 1.1, 0.865));
  g.add(cyl(0.025, 0.025, 0.015, 10, M.red, cbX + 0.05, 1.1, 0.865));
  // Timer display
  g.add(box(0.12, 0.04, 0.005, M.screenActive, cbX, 1.0, 0.865));
  // Fan speed knob
  g.add(cyl(0.02, 0.02, 0.02, 10, M.chrome, cbX, 0.9, 0.865));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(1.55, wallH + 0.1, 1.0));

  return g;
}
