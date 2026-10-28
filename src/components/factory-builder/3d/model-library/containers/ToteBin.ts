import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildToteBin(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const plasticBlue = mat(0x1a5599, 0.15, 0.55);
  const plasticBlueDark = mat(0x144477, 0.15, 0.6);
  const plasticRim = mat(0x1a6099, 0.2, 0.5);
  const labelHolder = mat(0xcccccc, 0.1, 0.7);
  const labelWhite = mat(0xf0f0f0, 0.0, 0.9);
  const labelText = mat(0x222222, 0.0, 0.9);
  const partMetal = mat(0x888888, 0.6, 0.4);
  const partBlack = mat(0x333333, 0.1, 0.7);
  const partBrass = mat(0xbb9944, 0.7, 0.3);

  // ── Tote Dimensions ──
  // Typical: 24x15x12 inch ~ 0.60 x 0.38 x 0.30 m (scaled down)
  const tW = 0.40;    // width (X) at top
  const tD = 0.28;    // depth (Z) at top
  const tH = 0.22;    // height (Y)
  const wallT = 0.008; // wall thickness
  const draft = 0.015; // draft angle offset (narrower at bottom)

  const bW = tW - draft * 2;  // bottom width
  const bD = tD - draft * 2;  // bottom depth

  // ── Bottom Panel ──
  g.add(box(bW - 0.01, wallT, bD - 0.01, plasticBlue, 0, wallT / 2, 0));
  // Bottom reinforcement ribs
  for (let i = 0; i < 5; i++) {
    const rz = -bD / 2 + 0.04 + i * (bD / 5);
    g.add(box(bW - 0.02, 0.004, 0.006, plasticBlueDark, 0, wallT + 0.002, rz));
  }
  for (let i = 0; i < 3; i++) {
    const rx = -bW / 2 + 0.06 + i * (bW / 3);
    g.add(box(0.006, 0.004, bD - 0.02, plasticBlueDark, rx, wallT + 0.002, 0));
  }

  // ── Side Walls (4 walls with draft angle) ──
  // Front wall (Z negative)
  {
    const midW = (tW + bW) / 2;
    const midZ = -(tD + bD) / 4;
    g.add(box(midW, tH, wallT, plasticBlue, 0, tH / 2, midZ));

    // Horizontal ribs on front wall
    for (let i = 0; i < 6; i++) {
      const ry = 0.03 + i * (tH / 7);
      const ribW = bW + (tW - bW) * (ry / tH);
      g.add(box(ribW - 0.02, 0.004, 0.003, plasticBlueDark,
        0, ry, midZ - wallT / 2 - 0.001));
    }
  }

  // Back wall (Z positive)
  {
    const midW = (tW + bW) / 2;
    const midZ = (tD + bD) / 4;
    g.add(box(midW, tH, wallT, plasticBlue, 0, tH / 2, midZ));

    // Horizontal ribs on back wall
    for (let i = 0; i < 6; i++) {
      const ry = 0.03 + i * (tH / 7);
      const ribW = bW + (tW - bW) * (ry / tH);
      g.add(box(ribW - 0.02, 0.004, 0.003, plasticBlueDark,
        0, ry, midZ + wallT / 2 + 0.001));
    }
  }

  // Left wall (X negative)
  {
    const midD = (tD + bD) / 2;
    const midX = -(tW + bW) / 4;
    g.add(box(wallT, tH, midD, plasticBlue, midX, tH / 2, 0));

    // Horizontal ribs on left wall
    for (let i = 0; i < 6; i++) {
      const ry = 0.03 + i * (tH / 7);
      g.add(box(0.003, 0.004, midD - 0.02, plasticBlueDark,
        midX - wallT / 2 - 0.001, ry, 0));
    }
  }

  // Right wall (X positive)
  {
    const midD = (tD + bD) / 2;
    const midX = (tW + bW) / 4;
    g.add(box(wallT, tH, midD, plasticBlue, midX, tH / 2, 0));

    // Horizontal ribs on right wall
    for (let i = 0; i < 6; i++) {
      const ry = 0.03 + i * (tH / 7);
      g.add(box(0.003, 0.004, midD - 0.02, plasticBlueDark,
        midX + wallT / 2 + 0.001, ry, 0));
    }
  }

  // ── Reinforced Rim (top edge all around) ──
  const rimH = 0.012;
  const rimW = 0.015;
  // Front rim
  g.add(box(tW + rimW * 2, rimH, rimW, plasticRim, 0, tH + rimH / 2, -tD / 2));
  // Back rim
  g.add(box(tW + rimW * 2, rimH, rimW, plasticRim, 0, tH + rimH / 2, tD / 2));
  // Left rim
  g.add(box(rimW, rimH, tD, plasticRim, -tW / 2 - rimW / 2, tH + rimH / 2, 0));
  // Right rim
  g.add(box(rimW, rimH, tD, plasticRim, tW / 2 + rimW / 2, tH + rimH / 2, 0));

  // Rim inner lip (rolled edge)
  g.add(box(tW - 0.01, 0.006, 0.006, plasticRim, 0, tH + 0.003, -tD / 2 + 0.006));
  g.add(box(tW - 0.01, 0.006, 0.006, plasticRim, 0, tH + 0.003, tD / 2 - 0.006));
  g.add(box(0.006, 0.006, tD - 0.02, plasticRim, -tW / 2 + 0.006, tH + 0.003, 0));
  g.add(box(0.006, 0.006, tD - 0.02, plasticRim, tW / 2 - 0.006, tH + 0.003, 0));

  // ── Stacking Lugs (4 corner posts that extend above rim) ──
  const lugH = 0.025;
  const lugW = 0.025;
  const cornerOffsets: [number, number][] = [
    [-tW / 2 - 0.002, -tD / 2 - 0.002],
    [tW / 2 + 0.002, -tD / 2 - 0.002],
    [-tW / 2 - 0.002, tD / 2 + 0.002],
    [tW / 2 + 0.002, tD / 2 + 0.002],
  ];
  for (const [cx, cz] of cornerOffsets) {
    g.add(box(lugW, lugH, lugW, plasticRim, cx, tH + rimH + lugH / 2, cz));
    // Inner notch in lug (for nesting)
    g.add(box(lugW * 0.6, lugH, lugW * 0.6, plasticBlueDark,
      cx * 0.95, tH + rimH + lugH / 2, cz * 0.95));
  }

  // ── Handhold Cutouts (on short ends / Z-facing walls) ──
  const handW = 0.10;
  const handH = 0.035;
  // Front handhold (cut as dark recess)
  g.add(box(handW, handH, wallT + 0.006, plasticBlueDark,
    0, tH - 0.04, -(tD + bD) / 4));
  // Handhold reinforcement lip (top edge of cutout)
  g.add(box(handW + 0.01, 0.005, wallT + 0.008, plasticRim,
    0, tH - 0.04 + handH / 2 + 0.002, -(tD + bD) / 4));

  // Back handhold
  g.add(box(handW, handH, wallT + 0.006, plasticBlueDark,
    0, tH - 0.04, (tD + bD) / 4));
  g.add(box(handW + 0.01, 0.005, wallT + 0.008, plasticRim,
    0, tH - 0.04 + handH / 2 + 0.002, (tD + bD) / 4));

  // ── Label Holder (front face) ──
  const lhW = 0.10;
  const lhH = 0.04;
  const lhZ = -(tD + bD) / 4 - wallT / 2 - 0.003;
  // Frame
  g.add(box(lhW, lhH, 0.003, labelHolder, 0, tH * 0.35, lhZ));
  // Clear window cover
  g.add(box(lhW - 0.006, lhH - 0.006, 0.002, mat(0xaabbcc, 0.0, 0.1, {
    transparent: true, opacity: 0.3,
  }), 0, tH * 0.35, lhZ - 0.002));
  // Label card inside
  g.add(box(lhW - 0.010, lhH - 0.010, 0.001, labelWhite, 0, tH * 0.35, lhZ + 0.001));
  // Label text
  g.add(box(0.06, 0.006, 0.002, labelText, 0, tH * 0.35 + 0.008, lhZ));
  g.add(box(0.04, 0.005, 0.002, labelText, -0.01, tH * 0.35 - 0.005, lhZ));
  // Barcode on label
  for (let i = 0; i < 6; i++) {
    g.add(box((i % 2 === 0) ? 0.003 : 0.002, 0.012, 0.002, labelText,
      -0.025 + i * 0.005, tH * 0.35 - 0.015, lhZ));
  }

  // ── Parts Visible Inside Bin ──
  // Small random mechanical parts
  g.add(cyl(0.015, 0.015, 0.008, 8, partMetal, -0.08, wallT + 0.012, -0.04));
  g.add(cyl(0.015, 0.015, 0.008, 8, partMetal, -0.06, wallT + 0.012, -0.02));
  g.add(cyl(0.012, 0.012, 0.010, 8, partMetal, 0.02, wallT + 0.013, 0.05));
  g.add(box(0.025, 0.012, 0.012, partBlack, 0.08, wallT + 0.014, -0.06));
  g.add(box(0.020, 0.010, 0.015, partBlack, -0.04, wallT + 0.013, 0.08));
  g.add(sph(0.010, partBrass, 0.06, wallT + 0.018, 0.02));
  g.add(sph(0.008, partBrass, -0.10, wallT + 0.016, -0.05));
  g.add(box(0.030, 0.008, 0.008, partMetal, 0.10, wallT + 0.012, 0.06));
  g.add(cyl(0.008, 0.008, 0.020, 6, partBrass, -0.12, wallT + 0.018, 0.03));
  g.add(box(0.015, 0.015, 0.015, partMetal, 0.00, wallT + 0.016, -0.08));
  // Loose washer shapes
  g.add(cyl(0.010, 0.010, 0.003, 12, partMetal, 0.05, wallT + 0.009, -0.03));
  g.add(cyl(0.010, 0.010, 0.003, 12, partMetal, -0.02, wallT + 0.009, 0.06));

  return g;
}
