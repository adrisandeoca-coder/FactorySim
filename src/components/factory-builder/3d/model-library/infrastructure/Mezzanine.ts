import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildMezzanine(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelGray = mat(0x707880, 0.75, 0.3);
  const steelDark = mat(0x505860, 0.7, 0.35);
  const gratingMat = mat(0x5a6268, 0.65, 0.4);
  const basePlateMat = mat(0x606060, 0.7, 0.35);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const railYellow = mat(0xddaa00, 0.25, 0.45);
  const kickPlate = mat(0xccaa00, 0.2, 0.5);
  const stairYellow = mat(0xeebb00, 0.15, 0.4);
  const treadMat = mat(0x656d75, 0.6, 0.45);
  const handrailMat = mat(0xddaa00, 0.25, 0.5);
  const gateMat = mat(0xcc9900, 0.3, 0.45);
  const hingeMat = mat(0x555555, 0.7, 0.35);

  // ── Dimensions ──
  const platformW = 3.0;   // X width
  const platformD = 2.4;   // Z depth
  const platformH = 2.8;   // height to top of platform
  const colSize = 0.08;    // H-beam flange width
  const railH = 1.05;      // handrail height above platform
  const railR = 0.02;
  const postR = 0.022;

  // ── Column positions (4 corners) ──
  const cols: [number, number][] = [
    [-platformW / 2 + 0.15, -platformD / 2 + 0.15],
    [platformW / 2 - 0.15, -platformD / 2 + 0.15],
    [-platformW / 2 + 0.15, platformD / 2 - 0.15],
    [platformW / 2 - 0.15, platformD / 2 - 0.15],
  ];

  // ── Steel Columns (H-beam profile) ──
  for (const [cx, cz] of cols) {
    // Web (vertical plate)
    g.add(box(0.005, platformH, colSize, steelGray, cx, platformH / 2, cz));
    // Flanges (two wide plates)
    g.add(box(colSize, platformH, 0.005, steelGray, cx, platformH / 2, cz - colSize / 2 + 0.0025));
    g.add(box(colSize, platformH, 0.005, steelGray, cx, platformH / 2, cz + colSize / 2 - 0.0025));

    // ── Column Base Plates ──
    g.add(box(0.18, 0.012, 0.18, basePlateMat, cx, 0.006, cz));

    // Anchor bolts (4 per base)
    for (const [dx, dz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]] as [number, number][]) {
      g.add(cyl(0.006, 0.006, 0.025, 6, boltMat, cx + dx, 0.024, cz + dz));
      g.add(cyl(0.01, 0.01, 0.006, 6, boltMat, cx + dx, 0.015, cz + dz));
    }

    // Gusset stiffeners at base (4 per column)
    for (const [dx, dz, ry] of [[0.04, 0, 0], [-0.04, 0, 0], [0, 0.04, Math.PI / 2], [0, -0.04, Math.PI / 2]] as [number, number, number][]) {
      g.add(box(0.004, 0.12, 0.05, steelDark, cx + dx, 0.072, cz + dz, 0, ry, 0));
    }
  }

  // ── Cross Bracing between columns ──
  // Front face (Z = -platformD/2 + 0.15)
  const fz = -platformD / 2 + 0.15;
  const bz = platformD / 2 - 0.15;
  const lx = -platformW / 2 + 0.15;
  const rx = platformW / 2 - 0.15;
  const braceLen = Math.sqrt((rx - lx) ** 2 + platformH ** 2);
  const braceAngle = Math.atan2(platformH, rx - lx);

  // Front X-brace
  g.add(box(braceLen, 0.04, 0.005, steelDark, 0, platformH / 2, fz, 0, 0, braceAngle));
  g.add(box(braceLen, 0.04, 0.005, steelDark, 0, platformH / 2, fz, 0, 0, -braceAngle));

  // Back X-brace
  g.add(box(braceLen, 0.04, 0.005, steelDark, 0, platformH / 2, bz, 0, 0, braceAngle));
  g.add(box(braceLen, 0.04, 0.005, steelDark, 0, platformH / 2, bz, 0, 0, -braceAngle));

  // Side bracing (left side)
  const sideBraceLen = Math.sqrt((bz - fz) ** 2 + platformH ** 2);
  const sideBraceAngle = Math.atan2(platformH, bz - fz);
  g.add(box(0.005, 0.04, sideBraceLen, steelDark, lx, platformH / 2, 0, sideBraceAngle, 0, 0));
  g.add(box(0.005, 0.04, sideBraceLen, steelDark, lx, platformH / 2, 0, -sideBraceAngle, 0, 0));

  // ── Horizontal beams under platform (edge beams) ──
  const beamY = platformH - 0.04;
  // Front and back beams
  g.add(box(platformW, 0.08, 0.005, steelGray, 0, beamY, -platformD / 2));
  g.add(box(platformW, 0.08, 0.005, steelGray, 0, beamY, platformD / 2));
  // Side beams
  g.add(box(0.005, 0.08, platformD, steelGray, -platformW / 2, beamY, 0));
  g.add(box(0.005, 0.08, platformD, steelGray, platformW / 2, beamY, 0));
  // Center support beam
  g.add(box(0.005, 0.08, platformD, steelGray, 0, beamY, 0));

  // ── Platform deck (steel grating) ──
  g.add(box(platformW, 0.015, platformD, gratingMat, 0, platformH, 0));

  // ── Floor Grating Cross-Hatch Pattern ──
  // Longitudinal bars (X direction)
  for (let iz = -platformD / 2 + 0.1; iz <= platformD / 2 - 0.1; iz += 0.12) {
    g.add(box(platformW - 0.1, 0.004, 0.003, steelDark, 0, platformH + 0.01, iz));
  }
  // Transverse bars (Z direction)
  for (let ix = -platformW / 2 + 0.1; ix <= platformW / 2 - 0.1; ix += 0.12) {
    g.add(box(0.003, 0.004, platformD - 0.1, steelDark, ix, platformH + 0.01, 0));
  }

  // ── Safety Handrails around perimeter ──
  const rTop = platformH + railH;
  const rMid = platformH + railH * 0.5;
  const gateOpeningStart = platformW / 2 - 0.9;
  const gateOpeningEnd = platformW / 2;

  // Handrail posts
  const postPositions: [number, number][] = [];
  // Front edge (skip gate opening area on right side)
  for (let ix = -platformW / 2; ix <= platformW / 2; ix += 0.6) {
    if (ix >= gateOpeningStart && ix <= gateOpeningEnd) continue;
    postPositions.push([ix, -platformD / 2]);
  }
  // Back edge
  for (let ix = -platformW / 2; ix <= platformW / 2; ix += 0.6) {
    postPositions.push([ix, platformD / 2]);
  }
  // Left side
  for (let iz = -platformD / 2 + 0.6; iz < platformD / 2; iz += 0.6) {
    postPositions.push([-platformW / 2, iz]);
  }
  // Right side (skip stair area)
  for (let iz = -platformD / 2 + 0.6; iz < platformD / 2; iz += 0.6) {
    postPositions.push([platformW / 2, iz]);
  }

  for (const [px, pz] of postPositions) {
    // Post
    g.add(cyl(postR, postR, railH, 10, railYellow, px, platformH + railH / 2, pz));
    // Post cap
    g.add(sph(postR + 0.003, handrailMat, px, rTop + 0.005, pz));
  }

  // Top rails
  // Front
  g.add(cyl(railR, railR, gateOpeningStart + platformW / 2, 10, handrailMat,
    (-platformW / 2 + gateOpeningStart) / 2, rTop, -platformD / 2, 0, 0, Math.PI / 2));
  // Back
  g.add(cyl(railR, railR, platformW, 10, handrailMat, 0, rTop, platformD / 2, 0, 0, Math.PI / 2));
  // Left
  g.add(cyl(railR, railR, platformD, 10, handrailMat, -platformW / 2, rTop, 0, Math.PI / 2, 0, 0));
  // Right
  g.add(cyl(railR, railR, platformD, 10, handrailMat, platformW / 2, rTop, 0, Math.PI / 2, 0, 0));

  // Mid rails
  g.add(cyl(railR, railR, gateOpeningStart + platformW / 2, 10, handrailMat,
    (-platformW / 2 + gateOpeningStart) / 2, rMid, -platformD / 2, 0, 0, Math.PI / 2));
  g.add(cyl(railR, railR, platformW, 10, handrailMat, 0, rMid, platformD / 2, 0, 0, Math.PI / 2));
  g.add(cyl(railR, railR, platformD, 10, handrailMat, -platformW / 2, rMid, 0, Math.PI / 2, 0, 0));
  g.add(cyl(railR, railR, platformD, 10, handrailMat, platformW / 2, rMid, 0, Math.PI / 2, 0, 0));

  // Kick plates (bottom rail solid strip)
  g.add(box(gateOpeningStart + platformW / 2, 0.1, 0.003, kickPlate,
    (-platformW / 2 + gateOpeningStart) / 2, platformH + 0.05, -platformD / 2));
  g.add(box(platformW, 0.1, 0.003, kickPlate, 0, platformH + 0.05, platformD / 2));
  g.add(box(0.003, 0.1, platformD, kickPlate, -platformW / 2, platformH + 0.05, 0));
  g.add(box(0.003, 0.1, platformD, kickPlate, platformW / 2, platformH + 0.05, 0));

  // ── Swing Gate for material access ──
  const gateX = (gateOpeningStart + gateOpeningEnd) / 2;
  const gateW = gateOpeningEnd - gateOpeningStart - 0.05;
  // Gate top rail
  g.add(cyl(railR, railR, gateW, 10, gateMat, gateX, rTop, -platformD / 2, 0, 0, Math.PI / 2));
  // Gate mid rail
  g.add(cyl(railR, railR, gateW, 10, gateMat, gateX, rMid, -platformD / 2, 0, 0, Math.PI / 2));
  // Gate posts (2 short verticals)
  g.add(cyl(postR, postR, railH, 10, gateMat, gateOpeningStart, platformH + railH / 2, -platformD / 2));
  g.add(cyl(postR, postR, railH, 10, gateMat, gateOpeningEnd - 0.02, platformH + railH / 2, -platformD / 2));
  // Gate hinges
  for (const hy of [rTop - 0.06, rMid + 0.06]) {
    g.add(cyl(0.008, 0.008, 0.03, 8, hingeMat, gateOpeningStart + 0.01, hy, -platformD / 2 + 0.025));
    g.add(box(0.03, 0.02, 0.004, hingeMat, gateOpeningStart + 0.025, hy, -platformD / 2 + 0.025));
  }
  // Gate latch
  g.add(box(0.03, 0.03, 0.02, hingeMat, gateOpeningEnd - 0.04, rTop - 0.15, -platformD / 2));

  // ── Staircase (right side, going up along Z axis) ──
  const stairW = 0.9;
  const numSteps = 14;
  const stepRise = platformH / numSteps;
  const stepRun = 0.25;
  const stairStartX = platformW / 2 + 0.05;
  const stairStartZ = -platformD / 2;
  const stringerH = 0.12;

  // Stair stringers (2 side channels)
  const stairLen = Math.sqrt((numSteps * stepRun) ** 2 + platformH ** 2);
  const stairAngle = Math.atan2(platformH, numSteps * stepRun);
  const stairCenterX = stairStartX + stairW / 2;
  const stairCenterZ = stairStartZ + (numSteps * stepRun) / 2;
  const stairCenterY = platformH / 2;

  g.add(box(0.005, stringerH, stairLen, steelGray,
    stairCenterX - stairW / 2 + 0.02, stairCenterY, stairCenterZ, stairAngle, 0, 0));
  g.add(box(0.005, stringerH, stairLen, steelGray,
    stairCenterX + stairW / 2 - 0.02, stairCenterY, stairCenterZ, stairAngle, 0, 0));

  // Steps (treads)
  for (let i = 0; i < numSteps; i++) {
    const sy = (i + 1) * stepRise;
    const sz = stairStartZ + (i + 0.5) * stepRun;
    // Tread (diamond plate)
    g.add(box(stairW - 0.06, 0.008, stepRun - 0.02, treadMat, stairCenterX, sy, sz));
    // Yellow non-slip nosing on front edge
    g.add(box(stairW - 0.06, 0.01, 0.02, stairYellow, stairCenterX, sy + 0.001, sz - stepRun / 2 + 0.01));
  }

  // Stair handrails
  for (const side of [-1, 1]) {
    const hx = stairCenterX + side * (stairW / 2 - 0.01);
    // Handrail posts along staircase
    for (let i = 0; i <= numSteps; i += 3) {
      const py = (i + 1) * stepRise;
      const pz = stairStartZ + i * stepRun;
      g.add(cyl(postR * 0.8, postR * 0.8, railH * 0.9, 8, handrailMat, hx, py + railH * 0.45, pz));
    }
    // Handrail top rail (angled)
    g.add(cyl(railR, railR, stairLen, 8, handrailMat,
      hx, stairCenterY + railH * 0.9, stairCenterZ, stairAngle, 0, 0));
    // Mid rail
    g.add(cyl(railR * 0.8, railR * 0.8, stairLen, 8, handrailMat,
      hx, stairCenterY + railH * 0.45, stairCenterZ, stairAngle, 0, 0));
  }

  // Stair kick plates (side closure)
  g.add(box(0.003, 0.12, stairLen, steelDark,
    stairCenterX - stairW / 2 + 0.015, stairCenterY - 0.02, stairCenterZ, stairAngle, 0, 0));
  g.add(box(0.003, 0.12, stairLen, steelDark,
    stairCenterX + stairW / 2 - 0.015, stairCenterY - 0.02, stairCenterZ, stairAngle, 0, 0));

  return g;
}
