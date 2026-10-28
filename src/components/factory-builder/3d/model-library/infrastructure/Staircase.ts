import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildStaircase(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelGray = mat(0x707880, 0.75, 0.3);
  const steelDark = mat(0x505860, 0.7, 0.35);
  const treadMat = mat(0x656d75, 0.6, 0.45);
  const nosingYellow = mat(0xeebb00, 0.15, 0.4);
  const handrailMat = mat(0xddaa00, 0.25, 0.45);
  const postMat = mat(0xccaa00, 0.25, 0.5);
  const basePlateMat = mat(0x606060, 0.7, 0.35);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const kickPlateMat = mat(0x5a6268, 0.65, 0.4);
  const landingMat = mat(0x656d75, 0.6, 0.45);
  const diamondMat = mat(0x6a7278, 0.55, 0.5);

  // ── Dimensions ──
  const numSteps = 12;
  const stepRise = 0.2;
  const stepRun = 0.27;
  const stairW = 1.0;
  const totalH = numSteps * stepRise;
  const totalRun = numSteps * stepRun;
  const stringerH = 0.15;
  const stringerT = 0.008;
  const railH = 1.05;
  const railR = 0.02;
  const postR = 0.02;
  const balusterR = 0.008;

  // Staircase climbs along +Z direction, starting at Z=0

  // ── Steel Stringers (2 side channels) ──
  const stairLen = Math.sqrt(totalRun ** 2 + totalH ** 2);
  const stairAngle = Math.atan2(totalH, totalRun);
  const centerZ = totalRun / 2;
  const centerY = totalH / 2;

  for (const side of [-1, 1]) {
    const sx = side * (stairW / 2);
    // Stringer web (vertical plate along stair)
    g.add(box(stringerT, stringerH, stairLen, steelGray, sx, centerY, centerZ, stairAngle, 0, 0));
    // Stringer top flange
    g.add(box(0.04, stringerT, stairLen, steelGray, sx, centerY + stringerH / 2 - stringerT / 2, centerZ, stairAngle, 0, 0));
    // Stringer bottom flange
    g.add(box(0.04, stringerT, stairLen, steelGray, sx, centerY - stringerH / 2 + stringerT / 2, centerZ, stairAngle, 0, 0));
  }

  // ── Diamond Plate Treads ──
  for (let i = 0; i < numSteps; i++) {
    const ty = (i + 1) * stepRise;
    const tz = (i + 0.5) * stepRun;

    // Tread plate
    g.add(box(stairW - 0.03, 0.006, stepRun - 0.015, treadMat, 0, ty, tz));

    // Diamond plate texture pattern (raised diamonds)
    for (let dx = -stairW / 2 + 0.08; dx < stairW / 2 - 0.05; dx += 0.08) {
      for (let dz = -stepRun / 2 + 0.04; dz < stepRun / 2 - 0.02; dz += 0.06) {
        g.add(box(0.02, 0.003, 0.02, diamondMat, dx, ty + 0.004, tz + dz, 0, Math.PI / 4, 0));
      }
    }

    // Non-slip nosing (yellow edge at front of each tread)
    g.add(box(stairW - 0.03, 0.01, 0.025, nosingYellow, 0, ty + 0.002, tz - stepRun / 2 + 0.015));

    // Riser plate (vertical face of step)
    g.add(box(stairW - 0.03, stepRise - 0.01, 0.004, steelDark, 0, ty - stepRise / 2, tz - stepRun / 2 + 0.002));
  }

  // ── Kick Plates on sides ──
  for (const side of [-1, 1]) {
    const kx = side * (stairW / 2 - 0.005);
    g.add(box(0.003, stringerH * 0.6, stairLen, kickPlateMat, kx, centerY - 0.02, centerZ, stairAngle, 0, 0));
  }

  // ── Pipe Handrails on both sides ──
  for (const side of [-1, 1]) {
    const hx = side * (stairW / 2 + 0.01);

    // Vertical balusters
    for (let i = 0; i <= numSteps; i += 2) {
      const by = (i + 0.5) * stepRise;
      const bz = i * stepRun;
      const balH = railH;
      g.add(cyl(balusterR, balusterR, balH, 8, postMat, hx, by + balH / 2, bz));
      // Baluster base collar
      g.add(cyl(balusterR + 0.004, balusterR + 0.004, 0.012, 8, steelDark, hx, by + 0.006, bz));
    }

    // Top handrail (angled, following stair slope)
    g.add(cyl(railR, railR, stairLen + 0.1, 10, handrailMat,
      hx, centerY + railH, centerZ, stairAngle, 0, 0));

    // Mid rail
    g.add(cyl(railR * 0.85, railR * 0.85, stairLen + 0.1, 10, handrailMat,
      hx, centerY + railH * 0.5, centerZ, stairAngle, 0, 0));

    // Bottom newel post (at base)
    g.add(cyl(postR + 0.005, postR + 0.005, railH + 0.1, 10, postMat, hx, railH / 2 + 0.05, -0.05));
    g.add(sph(postR + 0.008, handrailMat, hx, railH + 0.11, -0.05));

    // Top newel post (at landing)
    g.add(cyl(postR + 0.005, postR + 0.005, railH + 0.1, 10, postMat, hx, totalH + railH / 2 + 0.05, totalRun + 0.05));
    g.add(sph(postR + 0.008, handrailMat, hx, totalH + railH + 0.11, totalRun + 0.05));
  }

  // ── Top Landing Platform ──
  const landW = stairW + 0.1;
  const landD = 0.8;
  const landZ = totalRun + landD / 2;
  // Landing deck plate
  g.add(box(landW, 0.012, landD, landingMat, 0, totalH, landZ));

  // Diamond plate pattern on landing
  for (let dx = -landW / 2 + 0.08; dx < landW / 2 - 0.05; dx += 0.1) {
    for (let dz = -landD / 2 + 0.08; dz < landD / 2 - 0.05; dz += 0.1) {
      g.add(box(0.025, 0.003, 0.025, diamondMat, dx, totalH + 0.007, landZ + dz, 0, Math.PI / 4, 0));
    }
  }

  // Landing support beams
  g.add(box(landW, 0.06, 0.006, steelGray, 0, totalH - 0.03, totalRun + 0.003));
  g.add(box(landW, 0.06, 0.006, steelGray, 0, totalH - 0.03, totalRun + landD));
  g.add(box(0.006, 0.06, landD, steelGray, -landW / 2, totalH - 0.03, landZ));
  g.add(box(0.006, 0.06, landD, steelGray, landW / 2, totalH - 0.03, landZ));

  // Landing handrails (3 sides: left, right, back)
  const landRailY = totalH + railH;
  const landMidY = totalH + railH * 0.5;
  // Posts on landing
  for (const [px, pz] of [
    [-landW / 2, totalRun], [landW / 2, totalRun],
    [-landW / 2, totalRun + landD], [landW / 2, totalRun + landD],
  ] as [number, number][]) {
    g.add(cyl(postR, postR, railH, 10, postMat, px, totalH + railH / 2, pz));
    g.add(sph(postR + 0.003, handrailMat, px, landRailY + 0.005, pz));
  }
  // Back rail
  g.add(cyl(railR, railR, landW, 10, handrailMat, 0, landRailY, totalRun + landD, 0, 0, Math.PI / 2));
  g.add(cyl(railR * 0.85, railR * 0.85, landW, 10, handrailMat, 0, landMidY, totalRun + landD, 0, 0, Math.PI / 2));
  // Side rails on landing
  for (const side of [-1, 1]) {
    const lx = side * landW / 2;
    g.add(cyl(railR, railR, landD, 10, handrailMat, lx, landRailY, landZ, Math.PI / 2, 0, 0));
    g.add(cyl(railR * 0.85, railR * 0.85, landD, 10, handrailMat, lx, landMidY, landZ, Math.PI / 2, 0, 0));
  }
  // Kick plate on landing back
  g.add(box(landW, 0.1, 0.003, kickPlateMat, 0, totalH + 0.05, totalRun + landD));

  // ── Bottom Landing Pad ──
  g.add(box(stairW + 0.2, 0.015, 0.6, landingMat, 0, -0.0075, -0.3));
  // Anti-slip edge
  g.add(box(stairW + 0.2, 0.018, 0.025, nosingYellow, 0, -0.005, 0.005));

  // ── Base Mounting Plates ──
  for (const side of [-1, 1]) {
    const mx = side * (stairW / 2);
    g.add(box(0.15, 0.012, 0.15, basePlateMat, mx, 0.006, -0.1));
    // Anchor bolts
    for (const [dx, dz] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]] as [number, number][]) {
      g.add(cyl(0.005, 0.005, 0.02, 6, boltMat, mx + dx, 0.022, -0.1 + dz));
      g.add(cyl(0.009, 0.009, 0.005, 6, boltMat, mx + dx, 0.015, -0.1 + dz));
    }
  }

  return g;
}
