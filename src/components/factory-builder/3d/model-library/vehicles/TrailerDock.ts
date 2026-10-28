import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildTrailerDock(): THREE.Group {
  const g = new THREE.Group();

  // --- Color palette ---
  const trailerWhite = mat(0xdddddd, 0.3, 0.6);
  const trailerFrame = mat(0x222222, 0.6, 0.5);
  const dockConcrete = mat(0x999999, 0.1, 0.85);
  const dockWall = mat(0xaaaaaa, 0.1, 0.8);
  const dockPlate = mat(0x777777, 0.6, 0.4);
  const reflectiveTape = mat(0xff8800, 0.0, 0.4, { emissive: 0xff6600, emissiveIntensity: 0.6 });
  const warningYellow = mat(0xeecc00, 0.1, 0.5, { emissive: 0xccaa00, emissiveIntensity: 0.3 });
  const warningStripe = mat(0x111111, 0.1, 0.6);
  const sealMat = mat(0x222222, 0.0, 0.9);
  const sealFabric = mat(0x333344, 0.0, 0.85);
  const interiorDark = mat(0x333333, 0.1, 0.8);
  const dockLightMat = mat(0xffeecc, 0.0, 0.3, { emissive: 0xffddaa, emissiveIntensity: 1.2 });
  const chockMat = mat(0xdd6600, 0.1, 0.7);
  const bumperRubber = mat(0x1a1a1a, 0.0, 0.92);
  const metalBright = mat(0xbbbbbb, 0.7, 0.3);

  // Layout: trailer extends in -X direction from dock at +X side
  // Dock wall is at approx x = 0.6

  // ============ DOCK WALL / PLATFORM ============
  // Dock wall (building face)
  g.add(box(0.15, 0.7, 1.0, dockWall, 0.68, 0.35, 0));

  // Dock platform/floor
  g.add(box(0.5, 0.04, 0.9, dockConcrete, 0.85, 0.38, 0));

  // Dock edge (raised lip)
  g.add(box(0.04, 0.06, 0.8, dockConcrete, 0.62, 0.39, 0));

  // ============ WARNING STRIPES on dock edge ============
  for (let i = -0.35; i <= 0.35; i += 0.1) {
    g.add(box(0.035, 0.015, 0.04, warningYellow, 0.62, 0.42, i));
    g.add(box(0.035, 0.015, 0.04, warningStripe, 0.62, 0.42, i + 0.05));
  }

  // ============ DOCK BUMPERS (rubber pads on wall) ============
  g.add(box(0.04, 0.2, 0.12, bumperRubber, 0.6, 0.28, 0.22));
  g.add(box(0.04, 0.2, 0.12, bumperRubber, 0.6, 0.28, -0.22));
  // Bumper mounting plates
  g.add(box(0.01, 0.22, 0.14, metalBright, 0.62, 0.28, 0.22));
  g.add(box(0.01, 0.22, 0.14, metalBright, 0.62, 0.28, -0.22));

  // ============ DOCK SHELTER / SEAL ============
  // Top pad
  g.add(box(0.08, 0.06, 0.7, sealFabric, 0.58, 0.66, 0));
  // Side pads (left and right)
  g.add(box(0.08, 0.42, 0.06, sealFabric, 0.58, 0.42, 0.38));
  g.add(box(0.08, 0.42, 0.06, sealFabric, 0.58, 0.42, -0.38));

  // Shelter frame (metal surround)
  g.add(box(0.02, 0.02, 0.76, sealMat, 0.61, 0.69, 0));
  g.add(box(0.02, 0.48, 0.02, sealMat, 0.61, 0.44, 0.41));
  g.add(box(0.02, 0.48, 0.02, sealMat, 0.61, 0.44, -0.41));

  // Inner foam blocks
  g.add(box(0.06, 0.04, 0.65, sealMat, 0.56, 0.64, 0));
  g.add(box(0.06, 0.38, 0.04, sealMat, 0.56, 0.42, 0.36));
  g.add(box(0.06, 0.38, 0.04, sealMat, 0.56, 0.42, -0.36));

  // ============ DOCK LEVELER / BRIDGE PLATE ============
  // Leveler plate (angled slightly)
  g.add(box(0.3, 0.02, 0.6, dockPlate, 0.46, 0.38, 0, -0.03, 0, 0));
  // Leveler lip (end that rests on trailer floor)
  g.add(box(0.08, 0.015, 0.58, dockPlate, 0.3, 0.37, 0, -0.05, 0, 0));
  // Leveler hinge area
  g.add(box(0.04, 0.04, 0.62, trailerFrame, 0.61, 0.38, 0));
  // Diamond plate texture strips
  for (let z = -0.25; z <= 0.25; z += 0.12) {
    g.add(box(0.28, 0.005, 0.06, metalBright, 0.46, 0.395, z));
  }

  // ============ DOCK LIGHT ============
  // Light fixture arm
  g.add(box(0.15, 0.02, 0.02, trailerFrame, 0.68, 0.62, 0.0));
  g.add(cyl(0.015, 0.015, 0.12, 8, trailerFrame, 0.6, 0.62, 0, 0, 0, Math.PI / 2));
  // Light housing
  g.add(box(0.06, 0.03, 0.1, trailerFrame, 0.56, 0.61, 0));
  // Light lens
  g.add(box(0.06, 0.005, 0.09, dockLightMat, 0.56, 0.595, 0));

  // ============ TRAILER BODY ============
  const trailerFront = 0.28;
  const trailerBack = -0.95;
  const trailerLength = trailerFront - trailerBack;
  const trailerCX = (trailerFront + trailerBack) / 2;
  const trailerBottom = 0.18;
  const trailerHeight = 0.48;
  const trailerCY = trailerBottom + trailerHeight / 2;
  const trailerHalfW = 0.33;

  // Floor
  g.add(box(trailerLength, 0.025, trailerHalfW * 2, trailerWhite, trailerCX, trailerBottom, 0));

  // Roof
  g.add(box(trailerLength, 0.02, trailerHalfW * 2 + 0.02, trailerWhite, trailerCX, trailerBottom + trailerHeight, 0));

  // Left wall
  g.add(box(trailerLength, trailerHeight, 0.02, trailerWhite, trailerCX, trailerCY, trailerHalfW));

  // Right wall
  g.add(box(trailerLength, trailerHeight, 0.02, trailerWhite, trailerCX, trailerCY, -trailerHalfW));

  // Front wall (nose of trailer)
  g.add(box(0.02, trailerHeight, trailerHalfW * 2, trailerWhite, trailerBack, trailerCY, 0));

  // Open rear (dark interior visible through opening)
  g.add(box(0.01, trailerHeight - 0.04, trailerHalfW * 2 - 0.04, interiorDark, trailerFront + 0.005, trailerCY, 0));

  // ============ TRAILER STRUCTURAL DETAILS ============
  // Bottom rails (I-beam profile)
  g.add(box(trailerLength, 0.03, 0.04, trailerFrame, trailerCX, trailerBottom - 0.02, trailerHalfW - 0.02));
  g.add(box(trailerLength, 0.03, 0.04, trailerFrame, trailerCX, trailerBottom - 0.02, -trailerHalfW + 0.02));

  // Cross members under floor
  for (let x = trailerBack + 0.1; x < trailerFront; x += 0.2) {
    g.add(box(0.02, 0.025, trailerHalfW * 2 - 0.04, trailerFrame, x, trailerBottom - 0.025, 0));
  }

  // Corner posts
  g.add(box(0.02, trailerHeight, 0.02, trailerFrame, trailerBack + 0.01, trailerCY, trailerHalfW - 0.01));
  g.add(box(0.02, trailerHeight, 0.02, trailerFrame, trailerBack + 0.01, trailerCY, -trailerHalfW + 0.01));
  g.add(box(0.02, trailerHeight, 0.02, trailerFrame, trailerFront - 0.01, trailerCY, trailerHalfW - 0.01));
  g.add(box(0.02, trailerHeight, 0.02, trailerFrame, trailerFront - 0.01, trailerCY, -trailerHalfW + 0.01));

  // Side posts (vertical ribs)
  for (let x = trailerBack + 0.2; x < trailerFront - 0.1; x += 0.25) {
    g.add(box(0.015, trailerHeight, 0.008, trailerFrame, x, trailerCY, trailerHalfW + 0.005));
    g.add(box(0.015, trailerHeight, 0.008, trailerFrame, x, trailerCY, -trailerHalfW - 0.005));
  }

  // Rub rail (mid-height)
  g.add(box(trailerLength, 0.02, 0.008, trailerFrame, trailerCX, trailerCY - 0.05, trailerHalfW + 0.01));
  g.add(box(trailerLength, 0.02, 0.008, trailerFrame, trailerCX, trailerCY - 0.05, -trailerHalfW - 0.01));

  // ============ REFLECTIVE TAPE on trailer sides ============
  const tapeY = trailerBottom + 0.04;
  for (let i = 0; i < 5; i++) {
    const tx = trailerBack + 0.15 + i * 0.22;
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, tapeY, trailerHalfW + 0.015));
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, tapeY, -trailerHalfW - 0.015));
  }
  // Upper reflective tape
  for (let i = 0; i < 5; i++) {
    const tx = trailerBack + 0.15 + i * 0.22;
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, trailerBottom + trailerHeight - 0.04, trailerHalfW + 0.015));
    g.add(box(0.12, 0.015, 0.005, reflectiveTape, tx, trailerBottom + trailerHeight - 0.04, -trailerHalfW - 0.015));
  }

  // ============ TRAILER REAR LIGHTS ============
  // Tail lights
  g.add(box(0.005, 0.05, 0.04, mat(0xff2200, 0.0, 0.3, { emissive: 0xff1100, emissiveIntensity: 0.6 }), trailerBack - 0.01, 0.3, trailerHalfW - 0.03));
  g.add(box(0.005, 0.05, 0.04, mat(0xff2200, 0.0, 0.3, { emissive: 0xff1100, emissiveIntensity: 0.6 }), trailerBack - 0.01, 0.3, -trailerHalfW + 0.03));

  // ============ LANDING GEAR (deployed crank legs) ============
  const lgX = -0.2;
  // Left leg
  g.add(box(0.03, 0.18, 0.03, trailerFrame, lgX, 0.09, 0.26));
  g.add(box(0.05, 0.02, 0.05, trailerFrame, lgX, 0.0, 0.26)); // foot pad
  g.add(cyl(0.015, 0.015, 0.04, 8, trailerFrame, lgX, 0.18, 0.26, Math.PI / 2, 0, 0)); // cross bar top
  // Crank handle
  g.add(cyl(0.008, 0.008, 0.06, 6, metalBright, lgX + 0.04, 0.14, 0.26, 0, 0, Math.PI / 4));
  g.add(cyl(0.005, 0.005, 0.03, 6, M.rubber, lgX + 0.065, 0.12, 0.26, 0, 0, 0));

  // Right leg
  g.add(box(0.03, 0.18, 0.03, trailerFrame, lgX, 0.09, -0.26));
  g.add(box(0.05, 0.02, 0.05, trailerFrame, lgX, 0.0, -0.26)); // foot pad
  g.add(cyl(0.015, 0.015, 0.04, 8, trailerFrame, lgX, 0.18, -0.26, Math.PI / 2, 0, 0));
  // Crank handle
  g.add(cyl(0.008, 0.008, 0.06, 6, metalBright, lgX + 0.04, 0.14, -0.26, 0, 0, Math.PI / 4));
  g.add(cyl(0.005, 0.005, 0.03, 6, M.rubber, lgX + 0.065, 0.12, -0.26, 0, 0, 0));

  // Cross brace between legs
  g.add(box(0.02, 0.02, 0.48, trailerFrame, lgX, 0.06, 0));

  // ============ TRAILER WHEELS (4 at rear - dual axle) ============
  const wheelY = 0.09;
  const tireRadius = 0.09;

  function addWheel(x: number, z: number) {
    g.add(cyl(tireRadius, tireRadius, 0.06, 16, M.rubber, x, wheelY, z, Math.PI / 2, 0, 0));
    g.add(cyl(0.06, 0.06, 0.04, 12, M.darkChrome, x, wheelY, z, Math.PI / 2, 0, 0));
    g.add(cyl(0.035, 0.035, 0.005, 10, M.chrome, x, wheelY, z > 0 ? z + 0.032 : z - 0.032, Math.PI / 2, 0, 0));
  }

  addWheel(-0.65, 0.28);
  addWheel(-0.65, 0.38);
  addWheel(-0.65, -0.28);
  addWheel(-0.65, -0.38);

  // Axle
  g.add(cyl(0.02, 0.02, 0.8, 8, trailerFrame, -0.65, wheelY, 0, Math.PI / 2, 0, 0));

  // Fenders over wheels
  g.add(box(0.16, 0.02, 0.14, trailerWhite, -0.65, 0.19, 0.33));
  g.add(box(0.16, 0.02, 0.14, trailerWhite, -0.65, 0.19, -0.33));

  // Mud flaps behind wheels
  g.add(box(0.005, 0.08, 0.12, mat(0x111111, 0.0, 0.95), -0.74, 0.06, 0.33));
  g.add(box(0.005, 0.08, 0.12, mat(0x111111, 0.0, 0.95), -0.74, 0.06, -0.33));

  // ============ WHEEL CHOCKS ============
  // Orange rubber wedges in front and behind one pair of wheels
  g.add(box(0.04, 0.04, 0.08, chockMat, -0.58, 0.02, 0.33));
  g.add(box(0.04, 0.04, 0.08, chockMat, -0.72, 0.02, 0.33));
  g.add(box(0.04, 0.04, 0.08, chockMat, -0.58, 0.02, -0.33));
  g.add(box(0.04, 0.04, 0.08, chockMat, -0.72, 0.02, -0.33));

  // ============ INTERIOR DETAILS (visible through open rear) ============
  // E-track rails along walls
  g.add(box(trailerLength * 0.8, 0.015, 0.005, metalBright, trailerCX + 0.05, trailerCY - 0.08, trailerHalfW - 0.02));
  g.add(box(trailerLength * 0.8, 0.015, 0.005, metalBright, trailerCX + 0.05, trailerCY + 0.08, trailerHalfW - 0.02));
  g.add(box(trailerLength * 0.8, 0.015, 0.005, metalBright, trailerCX + 0.05, trailerCY - 0.08, -trailerHalfW + 0.02));
  g.add(box(trailerLength * 0.8, 0.015, 0.005, metalBright, trailerCX + 0.05, trailerCY + 0.08, -trailerHalfW + 0.02));

  // Pallet inside trailer
  g.add(box(0.15, 0.02, 0.15, M.pallet, trailerCX + 0.2, trailerBottom + 0.03, 0));
  // Boxes on pallet
  g.add(box(0.13, 0.1, 0.13, M.cardboard, trailerCX + 0.2, trailerBottom + 0.09, 0));
  g.add(box(0.12, 0.08, 0.12, M.cardboard, trailerCX + 0.2, trailerBottom + 0.18, 0));

  // ============ TRAILER ICC BAR (rear underride guard) ============
  g.add(box(0.03, 0.04, 0.6, trailerFrame, trailerBack - 0.02, 0.07, 0));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(0.75, 0.38, 0.42));

  return g;
}
