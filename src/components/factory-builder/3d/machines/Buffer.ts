import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Industrial Steel WIP Rack
 * Steel gray frame with roller lanes, WIP containers, shelf brackets,
 * safety netting, and dynamic fill group.
 * Footprint: ~1.6w x 1.1h x 0.6d
 */
export function buildBuffer(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame   = mat(0x2a2e38, 0.7, 0.4);   // steel gray uprights
  const mCross   = mat(0x323640, 0.7, 0.45);   // cross-braces
  const mRoller  = M.chrome;                     // chrome rollers
  const mBracket = M.darkChrome;                 // shelf brackets
  const mNet     = mat(0x808080, 0.6, 0.3, {
    transparent: true, opacity: 0.15, side: THREE.DoubleSide,
  });

  // Bin colors
  const mBinBlue   = mat(0x2277cc, 0.15, 0.6);
  const mBinAmber  = mat(0xcc8822, 0.15, 0.6);
  const mBinGreen  = mat(0x22aa55, 0.15, 0.6);

  const W = 1.6;
  const D = 0.6;
  const H = 1.0;
  const postW = 0.04;

  // --- 4 upright posts (steel gray) ---
  const postPositions: [number, number][] = [
    [-W / 2 + postW / 2, -D / 2 + postW / 2],
    [ W / 2 - postW / 2, -D / 2 + postW / 2],
    [-W / 2 + postW / 2,  D / 2 - postW / 2],
    [ W / 2 - postW / 2,  D / 2 - postW / 2],
  ];
  for (const [px, pz] of postPositions) {
    g.add(box(postW, H, postW, mFrame, px, H / 2, pz));
  }

  // --- Slot holes on uprights (small dark insets for adjustability) ---
  const slotMat = mat(0x111118, 0.5, 0.8);
  for (const [px, pz] of postPositions.slice(0, 2)) {
    for (let sy = 0.1; sy < H; sy += 0.06) {
      g.add(box(postW + 0.002, 0.015, 0.01, slotMat, px, sy, pz - postW / 2 - 0.001));
    }
  }

  // --- 3 shelf levels ---
  const shelfHeights = [0.15, 0.45, 0.75];

  for (const sy of shelfHeights) {
    // Front and back crossbeams
    g.add(box(W - postW * 2, 0.025, 0.025, mCross, 0, sy, -D / 2 + postW / 2));
    g.add(box(W - postW * 2, 0.025, 0.025, mCross, 0, sy,  D / 2 - postW / 2));

    // Side crossbeams
    g.add(box(0.025, 0.025, D - postW * 2, mCross, -W / 2 + postW / 2, sy, 0));
    g.add(box(0.025, 0.025, D - postW * 2, mCross,  W / 2 - postW / 2, sy, 0));

    // Shelf brackets (L-shapes at each post, front side)
    for (const [px] of postPositions.slice(0, 2)) {
      // Vertical part of bracket
      g.add(box(0.015, 0.05, 0.015, mBracket, px, sy + 0.025, -D / 2 + postW + 0.01));
      // Horizontal part of bracket
      g.add(box(0.04, 0.008, 0.015, mBracket, px, sy + 0.004, -D / 2 + postW + 0.025));
    }

    // Diagonal cross-brace on back (X pattern suggested by one diagonal per shelf)
    const braceLen = Math.sqrt((W - postW * 4) ** 2 + 0.25 ** 2);
    const braceAngle = Math.atan2(0.25, W - postW * 4);
    g.add(box(braceLen, 0.012, 0.012, mCross,
      0, sy + 0.125, D / 2 - postW / 2,
      0, 0, braceAngle,
    ));

    // Gravity roller lanes: 3 lanes across width
    const laneCount = 3;
    const laneSpacing = (W - postW * 4) / laneCount;
    const rollerRadius = 0.012;
    const rollersPerLane = 8;
    const laneDepth = D - postW * 4;

    for (let lane = 0; lane < laneCount; lane++) {
      const lx = -W / 2 + postW * 2 + laneSpacing * (lane + 0.5);

      for (let r = 0; r < rollersPerLane; r++) {
        const rz = -laneDepth / 2 + (laneDepth / (rollersPerLane - 1)) * r;
        g.add(cyl(
          rollerRadius, rollerRadius, laneSpacing * 0.7, 8,
          mRoller, lx, sy + rollerRadius + 0.015, rz,
          0, 0, Math.PI / 2,
        ));
      }
    }
  }

  // --- Fill group: WIP containers on shelves (named for dynamic updates) ---
  const fillGroup = new THREE.Group();
  fillGroup.name = 'fillGroup';

  const binColors = [mBinBlue, mBinAmber, mBinGreen];
  const binW = 0.18;
  const binH = 0.10;
  const binD = 0.14;
  let binIndex = 0;

  for (let si = 0; si < shelfHeights.length; si++) {
    const sy = shelfHeights[si];
    const binsOnLevel = si === 1 ? 4 : 3;

    for (let bi = 0; bi < binsOnLevel; bi++) {
      const bx = -W / 2 + postW * 2 + ((W - postW * 4) / (binsOnLevel + 1)) * (bi + 1);
      const bz = (bi % 2 === 0) ? -0.05 : 0.08;
      const bMat = binColors[binIndex % binColors.length];

      const binMesh = box(binW, binH, binD, bMat, bx, sy + 0.025 + binH / 2, bz);
      binMesh.name = `bin_${binIndex}`;
      fillGroup.add(binMesh);
      binIndex++;
    }
  }
  g.add(fillGroup);

  // --- Safety netting on back (thin horizontal wires) ---
  const wireCount = 12;
  for (let i = 0; i < wireCount; i++) {
    const wy = 0.06 + (H - 0.12) * (i / (wireCount - 1));
    g.add(box(W - postW * 2, 0.004, 0.004, mNet, 0, wy, D / 2 - postW));
  }
  // A few vertical wires
  for (let i = 0; i < 5; i++) {
    const wx = -W / 2 + postW * 2 + ((W - postW * 4) / 4) * i;
    g.add(box(0.004, H - 0.08, 0.004, mNet, wx, H / 2, D / 2 - postW));
  }

  // --- Base crossbeams (floor level) ---
  g.add(box(W, 0.03, 0.05, mFrame, 0, 0.015, -D / 2 + postW / 2));
  g.add(box(W, 0.03, 0.05, mFrame, 0, 0.015,  D / 2 - postW / 2));

  // --- Status light on top of right-front upright ---
  const statusLightGroup = createStatusLight(W / 2 - 0.1, H, 0);
  g.add(statusLightGroup);

  return g;
}
