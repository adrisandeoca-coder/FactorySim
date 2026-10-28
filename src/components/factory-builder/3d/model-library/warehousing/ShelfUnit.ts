import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildShelfUnit(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const postChrome = mat(0xb8c0c8, 0.85, 0.15);
  const shelfMat = mat(0x7a8090, 0.6, 0.35);
  const wireShelf = mat(0x909aa8, 0.7, 0.25, { transparent: true, opacity: 0.6 });
  const clipMat = mat(0x606878, 0.7, 0.3);
  const labelHolder = mat(0xcccccc, 0.1, 0.7);
  const labelStrip = mat(0xffffff, 0.0, 0.9);
  const binRed = mat(0xcc3333, 0.1, 0.65);
  const binBlue = mat(0x2255bb, 0.1, 0.65);
  const binYellow = mat(0xccaa22, 0.1, 0.65);
  const binGreen = mat(0x339944, 0.1, 0.65);
  const binGray = mat(0x778899, 0.1, 0.65);
  const anchorMat = mat(0x707880, 0.6, 0.4);

  // ── Dimensions ──
  const unitW = 0.6;   // width (X)
  const unitD = 0.3;   // depth (Z)
  const unitH = 0.8;   // total height
  const shelfLevels = 5;
  const postR = 0.012;
  const levelSpacing = unitH / shelfLevels;

  // ── 4 Vertical Posts (chrome/steel) ──
  const postPositions: [number, number][] = [
    [-unitW / 2 + postR, -unitD / 2 + postR],
    [unitW / 2 - postR, -unitD / 2 + postR],
    [-unitW / 2 + postR, unitD / 2 - postR],
    [unitW / 2 - postR, unitD / 2 - postR],
  ];

  for (const [px, pz] of postPositions) {
    // Main post
    g.add(cyl(postR, postR, unitH, 12, postChrome, px, unitH / 2, pz));

    // Post grooves/slots (detail rings along the post)
    for (let h = 0.04; h < unitH; h += 0.025) {
      g.add(cyl(postR + 0.002, postR + 0.002, 0.003, 8, clipMat, px, h, pz));
    }

    // Leveling feet at bottom
    g.add(cyl(0.018, 0.022, 0.02, 8, M.darkChrome, px, 0.01, pz));
    g.add(cyl(0.024, 0.024, 0.004, 8, M.rubber, px, 0.0, pz));
    // Threaded rod visible above foot
    g.add(cyl(0.006, 0.006, 0.03, 6, M.darkChrome, px, 0.025, pz));
  }

  // ── Shelf Levels (wire grid shelves) ──
  for (let lv = 0; lv < shelfLevels; lv++) {
    const sy = lv * levelSpacing + 0.04;

    // Main shelf platform
    g.add(box(unitW - 0.01, 0.006, unitD - 0.01, shelfMat, 0, sy, 0));

    // Wire grid pattern on shelf
    const wireCount = 8;
    for (let i = 0; i < wireCount; i++) {
      const wz = -unitD / 2 + 0.03 + i * (unitD - 0.06) / (wireCount - 1);
      g.add(box(unitW - 0.04, 0.004, 0.003, wireShelf, 0, sy + 0.004, wz));
    }
    // Cross wires
    for (let i = 0; i < 12; i++) {
      const wx = -unitW / 2 + 0.04 + i * (unitW - 0.08) / 11;
      g.add(box(0.003, 0.004, unitD - 0.04, wireShelf, wx, sy + 0.004, 0));
    }

    // Shelf edge lip (front and back)
    g.add(box(unitW - 0.02, 0.015, 0.004, shelfMat, 0, sy + 0.01, -unitD / 2 + 0.01));
    g.add(box(unitW - 0.02, 0.015, 0.004, shelfMat, 0, sy + 0.01, unitD / 2 - 0.01));

    // ── Shelf Clips/Brackets (at each post) ──
    for (const [px, pz] of postPositions) {
      // Split sleeve clip
      g.add(cyl(postR + 0.005, postR + 0.005, 0.012, 8, clipMat, px, sy - 0.002, pz));
      // Conical taper
      g.add(cyl(postR + 0.003, postR + 0.006, 0.006, 8, clipMat, px, sy + 0.005, pz));
    }

    // ── Label Holders on front edge of each shelf ──
    g.add(box(unitW - 0.08, 0.018, 0.003, labelHolder, 0, sy + 0.018, -unitD / 2 + 0.008));
    // Label strip inside holder
    g.add(box(unitW - 0.1, 0.012, 0.002, labelStrip, 0, sy + 0.018, -unitD / 2 + 0.007));
    // Text bars on label (visual detail)
    for (let t = 0; t < 3; t++) {
      const tx = -0.12 + t * 0.12;
      g.add(box(0.06, 0.004, 0.003, M.bodyDark, tx, sy + 0.018, -unitD / 2 + 0.006));
    }
  }

  // ── Bins/Totes on Shelves ──
  const binConfigs: { level: number; bins: { x: number; w: number; h: number; d: number; mat: THREE.Material }[] }[] = [
    {
      level: 1, bins: [
        { x: -0.18, w: 0.12, h: 0.08, d: 0.15, mat: binBlue },
        { x: -0.04, w: 0.1, h: 0.08, d: 0.15, mat: binRed },
        { x: 0.1, w: 0.14, h: 0.08, d: 0.15, mat: binBlue },
      ]
    },
    {
      level: 2, bins: [
        { x: -0.15, w: 0.18, h: 0.1, d: 0.18, mat: binYellow },
        { x: 0.1, w: 0.18, h: 0.1, d: 0.18, mat: binGreen },
      ]
    },
    {
      level: 3, bins: [
        { x: -0.2, w: 0.1, h: 0.06, d: 0.12, mat: binGray },
        { x: -0.06, w: 0.1, h: 0.06, d: 0.12, mat: binRed },
        { x: 0.08, w: 0.1, h: 0.06, d: 0.12, mat: binGray },
        { x: 0.2, w: 0.1, h: 0.06, d: 0.12, mat: binBlue },
      ]
    },
    {
      level: 4, bins: [
        { x: 0, w: 0.25, h: 0.08, d: 0.2, mat: binGreen },
      ]
    },
  ];

  for (const cfg of binConfigs) {
    const sy = cfg.level * levelSpacing + 0.04;
    for (const bin of cfg.bins) {
      const by = sy + 0.006 + bin.h / 2;
      // Bin body
      g.add(box(bin.w, bin.h, bin.d, bin.mat, bin.x, by, 0));
      // Bin rim
      g.add(box(bin.w + 0.005, 0.006, bin.d + 0.005, bin.mat, bin.x, by + bin.h / 2, 0));
      // Front label area
      g.add(box(bin.w * 0.5, bin.h * 0.3, 0.003, labelStrip, bin.x, by, -bin.d / 2 - 0.001));
    }
  }

  // ── Anti-Tip Wall Anchor Bracket at Top ──
  const anchorY = unitH - 0.02;
  // L-bracket
  g.add(box(0.06, 0.04, 0.005, anchorMat, 0, anchorY, unitD / 2));
  g.add(box(0.06, 0.005, 0.04, anchorMat, 0, anchorY + 0.02, unitD / 2 + 0.02));
  // Mounting holes
  g.add(cyl(0.005, 0.005, 0.006, 6, M.bodyDark, -0.015, anchorY + 0.02, unitD / 2 + 0.038));
  g.add(cyl(0.005, 0.005, 0.006, 6, M.bodyDark, 0.015, anchorY + 0.02, unitD / 2 + 0.038));
  // Chain/strap to wall (simplified)
  g.add(box(0.008, 0.008, 0.06, M.wire, 0, anchorY + 0.02, unitD / 2 + 0.05));

  // ── Side Panels (optional cross-bracing for rigidity) ──
  for (const side of [-1, 1]) {
    const sx = side * (unitW / 2 - 0.005);
    // Diagonal brace
    const braceLen = Math.sqrt(unitD * unitD + (unitH * 0.6) ** 2);
    const braceAngle = Math.atan2(unitH * 0.6, unitD);
    g.add(box(0.008, braceLen * 0.7, 0.006, shelfMat, sx, unitH * 0.35, 0, braceAngle, 0, 0));
  }

  // ── Top Cap on Posts ──
  for (const [px, pz] of postPositions) {
    g.add(sph(postR + 0.003, postChrome, px, unitH + 0.005, pz));
  }

  return g;
}
