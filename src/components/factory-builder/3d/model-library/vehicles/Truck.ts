import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildTruck(): THREE.Group {
  const g = new THREE.Group();

  // --- Color palette ---
  const white = mat(0xe8e8e8, 0.3, 0.6);
  const cabBlue = mat(0x2a4a7a, 0.4, 0.5);
  const cabBlueDark = mat(0x1e3660, 0.4, 0.55);
  const frameMat = mat(0x1a1a1a, 0.6, 0.5);
  const bumperMat = mat(0x888888, 0.7, 0.3);
  const headlightMat = mat(0xffffcc, 0.0, 0.2, { emissive: 0xffffaa, emissiveIntensity: 0.8 });
  const taillightMat = mat(0xff2200, 0.0, 0.3, { emissive: 0xff1100, emissiveIntensity: 0.9 });
  const reflectiveTape = mat(0xff8800, 0.0, 0.4, { emissive: 0xff6600, emissiveIntensity: 0.6 });
  const doorHandle = mat(0x999999, 0.8, 0.2);
  const interiorDark = mat(0x222222, 0.1, 0.8);
  const dashMat = mat(0x333333, 0.2, 0.7);
  const mirrorMat = mat(0xcccccc, 0.9, 0.1);
  const plateMat = mat(0xeeeeee, 0.1, 0.6);
  const exhaustMat = mat(0x555555, 0.7, 0.4);
  const fuelTankMat = mat(0x444444, 0.6, 0.4);
  const stepMat = mat(0x666666, 0.5, 0.5);
  const mudFlapMat = mat(0x111111, 0.0, 0.95);

  // Overall dimensions: ~2.0 x 0.7 (length x width)
  // Truck faces +X direction

  // ============ CHASSIS FRAME ============
  // Frame rails (2 parallel beams under entire truck)
  g.add(box(1.85, 0.04, 0.06, frameMat, 0.0, 0.1, 0.18));
  g.add(box(1.85, 0.04, 0.06, frameMat, 0.0, 0.1, -0.18));

  // Cross members
  for (let i = -0.7; i <= 0.7; i += 0.35) {
    g.add(box(0.03, 0.03, 0.3, frameMat, i, 0.1, 0));
  }

  // ============ WHEELS (6 total: 2 front, 4 rear dual) ============
  const wheelY = 0.09;
  const tireRadius = 0.09;
  const tireWidth = 0.06;

  function addWheel(x: number, z: number) {
    // Tire
    g.add(cyl(tireRadius, tireRadius, tireWidth, 16, M.rubber, x, wheelY, z, Math.PI / 2, 0, 0));
    // Hub cap
    g.add(cyl(0.04, 0.04, 0.005, 12, M.chrome, x, wheelY, z > 0 ? z + tireWidth / 2 + 0.003 : z - tireWidth / 2 - 0.003, Math.PI / 2, 0, 0));
    // Rim
    g.add(cyl(0.06, 0.06, tireWidth - 0.02, 12, M.darkChrome, x, wheelY, z, Math.PI / 2, 0, 0));
  }

  // Front axle wheels
  addWheel(0.62, 0.32);
  addWheel(0.62, -0.32);

  // Rear axle 1 (dual)
  addWheel(-0.5, 0.28);
  addWheel(-0.5, 0.38);
  addWheel(-0.5, -0.28);
  addWheel(-0.5, -0.38);

  // Rear axle 2 (dual)
  addWheel(-0.7, 0.28);
  addWheel(-0.7, 0.38);
  addWheel(-0.7, -0.28);
  addWheel(-0.7, -0.38);

  // Axles
  g.add(cyl(0.02, 0.02, 0.7, 8, frameMat, 0.62, wheelY, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.8, 8, frameMat, -0.5, wheelY, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.8, 8, frameMat, -0.7, wheelY, 0, Math.PI / 2, 0, 0));

  // ============ CAB SECTION ============
  const cabFront = 0.95;
  const cabBack = 0.4;
  const cabBottom = 0.18;
  const cabTop = 0.55;

  // Main cab body
  g.add(box(cabFront - cabBack, cabTop - cabBottom, 0.64, cabBlue, (cabFront + cabBack) / 2, (cabTop + cabBottom) / 2, 0));

  // Cab roof
  g.add(box(cabFront - cabBack + 0.02, 0.02, 0.66, cabBlueDark, (cabFront + cabBack) / 2, cabTop + 0.01, 0));

  // Windshield (front)
  g.add(box(0.01, 0.2, 0.54, M.glass, cabFront + 0.01, 0.42, 0));

  // Windshield frame (top)
  g.add(box(0.01, 0.02, 0.58, cabBlueDark, cabFront + 0.01, 0.53, 0));
  // Windshield frame (bottom)
  g.add(box(0.01, 0.02, 0.58, cabBlueDark, cabFront + 0.01, 0.31, 0));
  // Windshield divider
  g.add(box(0.01, 0.2, 0.02, cabBlueDark, cabFront + 0.012, 0.42, 0));

  // Side windows (left and right)
  g.add(box(0.35, 0.14, 0.01, M.glass, 0.68, 0.44, 0.325));
  g.add(box(0.35, 0.14, 0.01, M.glass, 0.68, 0.44, -0.325));

  // Door panels (left and right)
  g.add(box(0.3, 0.18, 0.015, cabBlueDark, 0.65, 0.3, 0.327));
  g.add(box(0.3, 0.18, 0.015, cabBlueDark, 0.65, 0.3, -0.327));

  // Door handles
  g.add(box(0.04, 0.015, 0.01, doorHandle, 0.72, 0.32, 0.34));
  g.add(box(0.04, 0.015, 0.01, doorHandle, 0.72, 0.32, -0.34));

  // Door hinges (2 per side)
  g.add(box(0.01, 0.03, 0.01, frameMat, 0.52, 0.4, 0.335));
  g.add(box(0.01, 0.03, 0.01, frameMat, 0.52, 0.26, 0.335));
  g.add(box(0.01, 0.03, 0.01, frameMat, 0.52, 0.4, -0.335));
  g.add(box(0.01, 0.03, 0.01, frameMat, 0.52, 0.26, -0.335));

  // Rear window of cab
  g.add(box(0.01, 0.15, 0.5, M.glass, cabBack - 0.01, 0.44, 0));

  // Interior seat (visible through windows)
  g.add(box(0.15, 0.12, 0.5, interiorDark, 0.55, 0.24, 0));
  // Dashboard
  g.add(box(0.12, 0.1, 0.55, dashMat, 0.88, 0.28, 0));
  // Steering wheel
  g.add(cyl(0.04, 0.04, 0.01, 12, M.bodyDark, 0.82, 0.35, 0.12, 0.3, 0, 0));

  // ============ HEADLIGHTS ============
  g.add(box(0.02, 0.06, 0.1, headlightMat, cabFront + 0.02, 0.28, 0.22));
  g.add(box(0.02, 0.06, 0.1, headlightMat, cabFront + 0.02, 0.28, -0.22));

  // Turn signals (smaller, orange)
  g.add(box(0.02, 0.03, 0.05, reflectiveTape, cabFront + 0.02, 0.22, 0.28));
  g.add(box(0.02, 0.03, 0.05, reflectiveTape, cabFront + 0.02, 0.22, -0.28));

  // ============ FRONT BUMPER ============
  g.add(box(0.04, 0.08, 0.7, bumperMat, cabFront + 0.04, 0.16, 0));
  // Bumper detail strip
  g.add(box(0.01, 0.02, 0.68, M.rubber, cabFront + 0.06, 0.16, 0));

  // ============ GRILLE ============
  g.add(box(0.01, 0.12, 0.4, M.darkChrome, cabFront + 0.02, 0.28, 0));
  // Grille slats
  for (let i = -0.15; i <= 0.15; i += 0.03) {
    g.add(box(0.012, 0.008, 0.38, M.chrome, cabFront + 0.022, 0.24 + i, 0));
  }

  // ============ SIDE MIRRORS ============
  // Mirror arm
  g.add(box(0.02, 0.02, 0.12, M.bodyDark, cabFront - 0.05, 0.48, 0.4));
  g.add(box(0.02, 0.02, 0.12, M.bodyDark, cabFront - 0.05, 0.48, -0.4));
  // Mirror glass
  g.add(box(0.06, 0.08, 0.01, mirrorMat, cabFront - 0.05, 0.47, 0.46));
  g.add(box(0.06, 0.08, 0.01, mirrorMat, cabFront - 0.05, 0.47, -0.46));
  // Mirror housing
  g.add(box(0.07, 0.09, 0.02, M.bodyDark, cabFront - 0.05, 0.47, 0.45));
  g.add(box(0.07, 0.09, 0.02, M.bodyDark, cabFront - 0.05, 0.47, -0.45));

  // ============ STEP / RUNNING BOARD ============
  g.add(box(0.2, 0.02, 0.08, stepMat, 0.65, 0.15, 0.36));
  g.add(box(0.2, 0.02, 0.08, stepMat, 0.65, 0.15, -0.36));
  // Step support brackets
  g.add(box(0.02, 0.04, 0.02, frameMat, 0.58, 0.13, 0.36));
  g.add(box(0.02, 0.04, 0.02, frameMat, 0.72, 0.13, 0.36));
  g.add(box(0.02, 0.04, 0.02, frameMat, 0.58, 0.13, -0.36));
  g.add(box(0.02, 0.04, 0.02, frameMat, 0.72, 0.13, -0.36));

  // ============ FUEL TANK ============
  g.add(cyl(0.06, 0.06, 0.2, 12, fuelTankMat, 0.3, 0.12, 0.3, 0, 0, Math.PI / 2));
  // Fuel tank straps
  g.add(box(0.01, 0.13, 0.01, M.chrome, 0.24, 0.12, 0.3));
  g.add(box(0.01, 0.13, 0.01, M.chrome, 0.36, 0.12, 0.3));
  // Fuel cap
  g.add(cyl(0.02, 0.02, 0.01, 8, M.chrome, 0.3, 0.18, 0.3));

  // ============ EXHAUST PIPE ============
  g.add(cyl(0.025, 0.025, 0.35, 8, exhaustMat, 0.35, 0.3, -0.34, 0, 0, 0));
  g.add(cyl(0.028, 0.025, 0.04, 8, M.darkChrome, 0.35, 0.49, -0.34));

  // ============ CARGO BOX BODY ============
  const boxFront = 0.38;
  const boxBack = -0.92;
  const boxLength = boxFront - boxBack;
  const boxCenterX = (boxFront + boxBack) / 2;
  const boxBottom = 0.18;
  const boxHeight = 0.45;
  const boxCenterY = boxBottom + boxHeight / 2;

  // Cargo box walls
  // Floor
  g.add(box(boxLength, 0.02, 0.64, white, boxCenterX, boxBottom, 0));
  // Roof
  g.add(box(boxLength, 0.02, 0.66, white, boxCenterX, boxBottom + boxHeight, 0));
  // Left wall
  g.add(box(boxLength, boxHeight, 0.02, white, boxCenterX, boxCenterY, 0.33));
  // Right wall
  g.add(box(boxLength, boxHeight, 0.02, white, boxCenterX, boxCenterY, -0.33));
  // Front wall (behind cab)
  g.add(box(0.02, boxHeight, 0.64, white, boxFront, boxCenterY, 0));

  // ============ REAR ROLL-UP DOOR (partially open) ============
  // Door opening (dark interior visible)
  g.add(box(0.01, boxHeight, 0.6, interiorDark, boxBack + 0.01, boxCenterY, 0));
  // Roll-up door (partially raised)
  const doorOpenHeight = 0.2;
  g.add(box(0.02, boxHeight - doorOpenHeight, 0.6, white, boxBack, boxBottom + boxHeight - (boxHeight - doorOpenHeight) / 2, 0));
  // Door roll (cylinder at top)
  g.add(cyl(0.03, 0.03, 0.58, 12, M.darkChrome, boxBack, boxBottom + doorOpenHeight + 0.02, 0, 0, 0, Math.PI / 2));
  // Door guide rails
  g.add(box(0.02, boxHeight, 0.02, M.darkChrome, boxBack, boxCenterY, 0.31));
  g.add(box(0.02, boxHeight, 0.02, M.darkChrome, boxBack, boxCenterY, -0.31));

  // Interior floor visible through door
  g.add(box(0.3, 0.01, 0.58, mat(0x555555, 0.1, 0.8), boxBack + 0.16, boxBottom + 0.01, 0));

  // Some cargo boxes visible inside
  g.add(box(0.15, 0.1, 0.15, M.cardboard, boxBack + 0.12, boxBottom + 0.07, 0.12));
  g.add(box(0.12, 0.12, 0.14, M.cardboard, boxBack + 0.12, boxBottom + 0.08, -0.1));
  g.add(box(0.1, 0.08, 0.12, M.cardboard, boxBack + 0.14, boxBottom + 0.18, 0.13));

  // ============ BOX BODY DETAILS ============
  // Bottom rail / rub rail on sides
  g.add(box(boxLength, 0.02, 0.005, M.darkChrome, boxCenterX, boxBottom + 0.06, 0.34));
  g.add(box(boxLength, 0.02, 0.005, M.darkChrome, boxCenterX, boxBottom + 0.06, -0.34));

  // Upper edge trim
  g.add(box(boxLength, 0.015, 0.005, M.darkChrome, boxCenterX, boxBottom + boxHeight - 0.01, 0.34));
  g.add(box(boxLength, 0.015, 0.005, M.darkChrome, boxCenterX, boxBottom + boxHeight - 0.01, -0.34));

  // Corner posts (vertical)
  g.add(box(0.015, boxHeight, 0.015, M.darkChrome, boxFront - 0.01, boxCenterY, 0.325));
  g.add(box(0.015, boxHeight, 0.015, M.darkChrome, boxFront - 0.01, boxCenterY, -0.325));
  g.add(box(0.015, boxHeight, 0.015, M.darkChrome, boxBack + 0.01, boxCenterY, 0.325));
  g.add(box(0.015, boxHeight, 0.015, M.darkChrome, boxBack + 0.01, boxCenterY, -0.325));

  // ============ DOT REFLECTIVE TAPE (orange emissive strips) ============
  const tapeY = boxBottom + 0.04;
  for (let i = 0; i < 5; i++) {
    const tx = boxBack + 0.15 + i * 0.22;
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, tapeY, 0.342));
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, tapeY, -0.342));
  }

  // ============ TAIL LIGHTS ============
  g.add(box(0.015, 0.06, 0.06, taillightMat, boxBack - 0.01, 0.3, 0.3));
  g.add(box(0.015, 0.06, 0.06, taillightMat, boxBack - 0.01, 0.3, -0.3));
  // Reverse lights (white)
  g.add(box(0.015, 0.04, 0.04, headlightMat, boxBack - 0.01, 0.24, 0.3));
  g.add(box(0.015, 0.04, 0.04, headlightMat, boxBack - 0.01, 0.24, -0.3));

  // ============ REAR BUMPER ============
  g.add(box(0.04, 0.06, 0.68, bumperMat, boxBack - 0.03, 0.13, 0));
  // ICC bar (underride guard)
  g.add(box(0.03, 0.04, 0.6, frameMat, boxBack - 0.04, 0.08, 0));

  // ============ MUD FLAPS (behind rear wheels) ============
  g.add(box(0.005, 0.08, 0.1, mudFlapMat, -0.78, 0.06, 0.33));
  g.add(box(0.005, 0.08, 0.1, mudFlapMat, -0.78, 0.06, -0.33));

  // ============ LICENSE PLATE ============
  g.add(box(0.005, 0.04, 0.08, plateMat, boxBack - 0.02, 0.18, 0));
  // Plate frame
  g.add(box(0.003, 0.045, 0.085, frameMat, boxBack - 0.022, 0.18, 0));

  // ============ MARKER LIGHTS on cab roof ============
  for (let z = -0.2; z <= 0.2; z += 0.1) {
    g.add(box(0.02, 0.015, 0.03, reflectiveTape, cabFront - 0.1, cabTop + 0.025, z));
  }

  // ============ FENDER over front wheels ============
  g.add(box(0.2, 0.02, 0.08, cabBlueDark, 0.62, 0.19, 0.36));
  g.add(box(0.2, 0.02, 0.08, cabBlueDark, 0.62, 0.19, -0.36));

  return g;
}
