import * as THREE from 'three';
import { box, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Part Synchronizer / Match Buffer — two-sided rack with matching pairs.
 * Left side: blue bins, Right side: orange bins, center divider.
 * Footprint: ~1.4w x ~1.4h x ~0.7d
 */
export function buildMatchBuffer(): THREE.Group {
  const g = new THREE.Group();

  const W = 1.4;
  const D = 0.7;
  const H = 1.3;
  const postW = 0.04;

  // ── Steel frame (bodyDark uprights) ──
  const postPositions: [number, number][] = [
    [-W / 2 + postW / 2, -D / 2 + postW / 2],
    [ W / 2 - postW / 2, -D / 2 + postW / 2],
    [-W / 2 + postW / 2,  D / 2 - postW / 2],
    [ W / 2 - postW / 2,  D / 2 - postW / 2],
  ];
  for (const [px, pz] of postPositions) {
    g.add(box(postW, H, postW, M.bodyDark, px, H / 2, pz));
  }

  // ── Cross-braces (bodyDark) at 3 shelf levels + top ──
  const shelfHeights = [0.2, 0.55, 0.9];
  for (const sy of shelfHeights) {
    // Front and back rails
    g.add(box(W - postW * 2, 0.025, 0.025, M.bodyDark, 0, sy, -D / 2 + postW / 2));
    g.add(box(W - postW * 2, 0.025, 0.025, M.bodyDark, 0, sy,  D / 2 - postW / 2));
    // Side rails
    g.add(box(0.025, 0.025, D - postW * 2, M.bodyDark, -W / 2 + postW / 2, sy, 0));
    g.add(box(0.025, 0.025, D - postW * 2, M.bodyDark,  W / 2 - postW / 2, sy, 0));
  }

  // ── Top crossbar (chrome) connecting both sides ──
  g.add(box(W, 0.03, 0.03, M.chrome, 0, H, 0));

  // ── Center divider panel (bodyGray, tall thin box front-to-back) ──
  g.add(box(0.03, H - 0.05, D - postW * 4, M.bodyGray, 0, H / 2, 0));

  // ── "SYNC" indicator panel on front ──
  g.add(box(0.12, 0.06, 0.005, M.screen, 0, H - 0.15, -D / 2 + postW / 2 - 0.005));

  // ── Fill group with bins ──
  const fillGroup = new THREE.Group();
  fillGroup.name = 'fillGroup';

  const blueBin  = mat(0x3b82f6, 0.1, 0.7);
  const orangeBin = mat(0xf97316, 0.1, 0.7);
  const binW = 0.22;
  const binH = 0.1;
  const binD = 0.2;

  let binIndex = 0;
  for (let level = 0; level < 3; level++) {
    const by = shelfHeights[level] + 0.025 + binH / 2;

    // Left side bin (blue)
    const leftBin = box(binW, binH, binD, blueBin, -W / 4, by, 0);
    leftBin.name = `bin_${binIndex}`;
    fillGroup.add(leftBin);
    binIndex++;

    // Right side bin (orange)
    const rightBin = box(binW, binH, binD, orangeBin, W / 4, by, 0);
    rightBin.name = `bin_${binIndex}`;
    fillGroup.add(rightBin);
    binIndex++;
  }
  g.add(fillGroup);

  // ── Matching indicator lights between shelves ──
  const matchLit = mat(0x00dd44, 0.1, 0.4, { emissive: 0x00dd44, emissiveIntensity: 0.8 });
  for (let level = 0; level < 3; level++) {
    const iy = shelfHeights[level] + 0.025 + binH / 2;
    // One sphere on each side of the divider
    g.add(sph(0.02, matchLit, -0.05, iy, -D / 2 + postW + 0.02));
    g.add(sph(0.02, matchLit,  0.05, iy, -D / 2 + postW + 0.02));
  }

  // ── Status light centered on top crossbar ──
  g.add(createStatusLight(0, H, 0));

  return g;
}
