import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildSafetyBarrier(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const postYellow = mat(0xddaa00, 0.25, 0.45);
  const railYellow = mat(0xccaa00, 0.25, 0.5);
  const basePlate = mat(0x606060, 0.7, 0.35);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const reflectiveTape = mat(0xffff44, 0.1, 0.3, { emissive: 0x444400, emissiveIntensity: 0.3 });
  const reflectiveRed = mat(0xff3333, 0.1, 0.3, { emissive: 0x330000, emissiveIntensity: 0.3 });
  const endCapMat = mat(0xbbbb00, 0.3, 0.5);
  const signWhite = mat(0xeeeeee, 0.0, 0.85);
  const signText = mat(0x111111, 0.0, 0.9);
  const hingeMat = mat(0x555555, 0.7, 0.35);
  const gateLatcMat = mat(0x777777, 0.75, 0.3);

  // ── Dimensions ──
  const sectionLen = 1.2;
  const postH = 1.05;
  const postR = 0.025;
  const topRailY = 1.0;
  const midRailY = 0.5;
  const railR = 0.02;

  // ── Post positions: Left fixed post, right gate post ──
  const postXs = [-sectionLen / 2, sectionLen / 2];

  for (const px of postXs) {
    // Main upright post (yellow powder-coated steel tube)
    g.add(cyl(postR, postR, postH, 12, postYellow, px, postH / 2, 0));

    // Post cap (dome top)
    g.add(sph(postR + 0.003, endCapMat, px, postH + 0.005, 0));

    // Internal reinforcement ring at top rail
    g.add(cyl(postR + 0.005, postR + 0.005, 0.015, 12, postYellow, px, topRailY, 0));

    // Internal reinforcement ring at mid rail
    g.add(cyl(postR + 0.005, postR + 0.005, 0.015, 12, postYellow, px, midRailY, 0));

    // ── Base Plate ──
    g.add(box(0.12, 0.008, 0.12, basePlate, px, 0.004, 0));

    // Base plate gusset triangles (4 small triangular supports)
    for (const [dx, dz] of [[0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]] as [number, number][]) {
      g.add(box(0.004, 0.06, 0.025, postYellow, px + dx, 0.04, dz));
    }

    // ── Floor Anchor Bolts (4 per base plate) ──
    for (const [dx, dz] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]] as [number, number][]) {
      // Bolt shaft (in floor)
      g.add(cyl(0.005, 0.005, 0.02, 6, boltMat, px + dx, 0.018, dz));
      // Bolt head (hex nut)
      g.add(cyl(0.009, 0.009, 0.006, 6, boltMat, px + dx, 0.012, dz));
      // Washer
      g.add(cyl(0.012, 0.012, 0.002, 8, boltMat, px + dx, 0.009, dz));
    }
  }

  // ── Top Rail ──
  g.add(cyl(railR, railR, sectionLen - postR * 2, 10, railYellow, 0, topRailY, 0, 0, 0, Math.PI / 2));

  // ── Mid Rail ──
  g.add(cyl(railR, railR, sectionLen - postR * 2, 10, railYellow, 0, midRailY, 0, 0, 0, Math.PI / 2));

  // ── Reflective Tape Strips on top rail ──
  for (let i = -3; i <= 3; i++) {
    const tx = i * 0.14;
    // Alternating yellow and red reflective strips
    const tapeMat = i % 2 === 0 ? reflectiveTape : reflectiveRed;
    g.add(box(0.06, 0.025, railR * 2 + 0.004, tapeMat, tx, topRailY, 0));
  }

  // ── Reflective Tape Strips on mid rail ──
  for (let i = -2; i <= 2; i++) {
    const tx = i * 0.2;
    g.add(box(0.06, 0.02, railR * 2 + 0.004, reflectiveTape, tx, midRailY, 0));
  }

  // ── End Caps on rail ends ──
  for (const side of [-1, 1]) {
    const ex = side * (sectionLen / 2 - postR);
    // Top rail end cap
    g.add(sph(railR + 0.003, endCapMat, ex, topRailY, 0));
    // Mid rail end cap
    g.add(sph(railR + 0.003, endCapMat, ex, midRailY, 0));
  }

  // ── Black Rubber Bumper Strip along lower rail ──
  g.add(box(sectionLen - postR * 4, 0.06, 0.015, M.rubber, 0, midRailY, railR + 0.008));
  g.add(box(sectionLen - postR * 4, 0.06, 0.015, M.rubber, 0, midRailY, -(railR + 0.008)));

  // Bumper mounting bolts
  for (let i = -3; i <= 3; i++) {
    const bx = i * 0.15;
    g.add(cyl(0.004, 0.004, 0.005, 6, boltMat, bx, midRailY, railR + 0.016));
    g.add(cyl(0.004, 0.004, 0.005, 6, boltMat, bx, midRailY, -(railR + 0.016)));
  }

  // ── Kickplate / Toe Board (bottom rail) ──
  g.add(box(sectionLen - postR * 4, 0.1, 0.003, postYellow, 0, 0.06, 0));

  // ── Gate Section (right half swings) ──
  // Gate hinge on the right post
  const hingeX = sectionLen / 2 - 0.005;
  for (const hy of [topRailY - 0.05, topRailY + 0.05, midRailY - 0.05, midRailY + 0.05]) {
    // Hinge barrel
    g.add(cyl(0.008, 0.008, 0.03, 8, hingeMat, hingeX, hy, 0.03));
    // Hinge pin
    g.add(cyl(0.003, 0.003, 0.04, 6, boltMat, hingeX, hy, 0.03));
    // Hinge plate
    g.add(box(0.03, 0.025, 0.004, hingeMat, hingeX - 0.015, hy, 0.03));
  }

  // Gate latch on left post area
  const latchX = -sectionLen / 2 + 0.04;
  // Latch receiver bracket
  g.add(box(0.04, 0.04, 0.025, gateLatcMat, latchX, topRailY - 0.1, 0));
  // Latch slide bar
  g.add(cyl(0.006, 0.006, 0.06, 6, boltMat, latchX, topRailY - 0.1, -0.02, Math.PI / 2, 0, 0));
  // Latch handle
  g.add(box(0.02, 0.015, 0.01, M.rubber, latchX, topRailY - 0.1, -0.05));
  // Latch catch plate
  g.add(box(0.05, 0.06, 0.004, gateLatcMat, latchX, topRailY - 0.1, 0.015));

  // ── Warning Signage Plate ──
  // Sign plate on front of top rail center
  g.add(box(0.16, 0.1, 0.003, signWhite, 0, topRailY + 0.12, 0.025));
  // Sign border
  g.add(box(0.17, 0.002, 0.004, M.red, 0, topRailY + 0.17, 0.026));
  g.add(box(0.17, 0.002, 0.004, M.red, 0, topRailY + 0.07, 0.026));
  g.add(box(0.002, 0.1, 0.004, M.red, -0.085, topRailY + 0.12, 0.026));
  g.add(box(0.002, 0.1, 0.004, M.red, 0.085, topRailY + 0.12, 0.026));
  // Warning triangle symbol
  g.add(box(0.04, 0.003, 0.004, postYellow, 0, topRailY + 0.14, 0.027));
  g.add(box(0.003, 0.035, 0.004, postYellow, -0.02, topRailY + 0.14, 0.027, 0, 0, 0.3));
  g.add(box(0.003, 0.035, 0.004, postYellow, 0.02, topRailY + 0.14, 0.027, 0, 0, -0.3));
  // Exclamation mark
  g.add(box(0.005, 0.015, 0.004, signText, 0, topRailY + 0.14, 0.028));
  g.add(box(0.005, 0.005, 0.004, signText, 0, topRailY + 0.12, 0.028));
  // "CAUTION" text bars
  g.add(box(0.1, 0.006, 0.004, signText, 0, topRailY + 0.1, 0.027));
  g.add(box(0.06, 0.005, 0.004, signText, 0, topRailY + 0.09, 0.027));

  // ── Diagonal knee braces (post to base reinforcement) ──
  for (const px of postXs) {
    g.add(box(0.015, 0.15, 0.004, postYellow, px + (px > 0 ? -0.04 : 0.04), 0.1, 0, 0, 0, px > 0 ? 0.5 : -0.5));
  }

  // ── Post height markings (horizontal lines) ──
  for (const px of postXs) {
    for (let h = 0.2; h < postH; h += 0.2) {
      g.add(cyl(postR + 0.001, postR + 0.001, 0.003, 12, signText, px, h, 0));
    }
  }

  return g;
}
