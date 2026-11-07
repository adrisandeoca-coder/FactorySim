import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildWireMeshCage(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelFrame = mat(0x606878, 0.7, 0.35);
  const steelDark = mat(0x4a5060, 0.65, 0.4);
  const wireMat = mat(0x8090a0, 0.6, 0.4);
  const palletWood = mat(0x8B5E3C, 0.0, 0.9);
  const palletWoodDark = mat(0x6B4428, 0.0, 0.92);
  const hingeSteel = mat(0x555555, 0.7, 0.3);
  const labelHolder = mat(0xcccccc, 0.1, 0.7);
  const labelWhite = mat(0xf0f0f0, 0.0, 0.9);
  const labelText = mat(0x222222, 0.0, 0.9);
  const contentBox = mat(0xC4934A, 0.0, 0.95);
  const contentBlue = mat(0x2266AA, 0.1, 0.6);
  const stackFoot = mat(0x505050, 0.7, 0.4);

  // ── Cage Dimensions (Gitterbox: 1200x800x970mm, scaled) ──
  const cW = 0.60;    // width (X)
  const cD = 0.40;    // depth (Z)
  const cH = 0.48;    // height (Y) of wire panels
  const baseH = 0.08; // pallet base height
  const postW = 0.02; // corner post width
  const wireD = 0.004; // wire diameter
  const wireSpacing = 0.025; // mesh grid spacing

  // ═══════════════════════════════════════
  // ── Steel Pallet Base ──
  // ═══════════════════════════════════════

  // Base frame rails (2 long sides)
  g.add(box(cW, 0.025, 0.04, steelFrame, 0, 0.0125, -cD / 2 + 0.02));
  g.add(box(cW, 0.025, 0.04, steelFrame, 0, 0.0125, cD / 2 - 0.02));

  // Base frame rails (2 short sides)
  g.add(box(0.04, 0.025, cD, steelFrame, -cW / 2 + 0.02, 0.0125, 0));
  g.add(box(0.04, 0.025, cD, steelFrame, cW / 2 - 0.02, 0.0125, 0));

  // Center support rail
  g.add(box(cW, 0.025, 0.03, steelFrame, 0, 0.0125, 0));

  // Cross members under deck (for forklift entry from 2 sides)
  for (let i = 0; i < 5; i++) {
    const cx = -cW / 2 + 0.08 + i * (cW / 5);
    g.add(box(0.025, 0.025, cD - 0.08, steelDark, cx, 0.0125, 0));
  }

  // Deck boards (wooden planks on top of steel base)
  const deckBoardCount = 8;
  for (let i = 0; i < deckBoardCount; i++) {
    const bz = -cD / 2 + 0.03 + i * ((cD - 0.06) / (deckBoardCount - 1));
    const woodMat = (i % 2 === 0) ? palletWood : palletWoodDark;
    g.add(box(cW - 0.04, 0.012, 0.035, woodMat, 0, 0.031, bz));
  }

  // Forklift entry pockets (open from 2 short sides)
  for (const fz of [-cD / 6, cD / 6]) {
    // The gap is implied by lack of cross members, but add dark recesses
    g.add(box(0.008, 0.02, 0.10, steelDark, -cW / 2 - 0.001, 0.015, fz));
    g.add(box(0.008, 0.02, 0.10, steelDark, cW / 2 + 0.001, 0.015, fz));
  }

  // ═══════════════════════════════════════
  // ── Corner Posts (4 vertical angle-iron posts) ──
  // ═══════════════════════════════════════

  const postPositions: [number, number][] = [
    [-cW / 2 + postW / 2, -cD / 2 + postW / 2],
    [cW / 2 - postW / 2, -cD / 2 + postW / 2],
    [-cW / 2 + postW / 2, cD / 2 - postW / 2],
    [cW / 2 - postW / 2, cD / 2 - postW / 2],
  ];

  for (const [px, pz] of postPositions) {
    // Main post
    g.add(box(postW, cH, postW, steelFrame, px, baseH + cH / 2, pz));
    // Angle iron L-shape detail
    g.add(box(postW + 0.006, cH, 0.004, steelDark,
      px + (px > 0 ? 0.004 : -0.004), baseH + cH / 2, pz));
    g.add(box(0.004, cH, postW + 0.006, steelDark,
      px, baseH + cH / 2, pz + (pz > 0 ? 0.004 : -0.004)));
  }

  // ═══════════════════════════════════════
  // ── Wire Mesh Side Panels ──
  // ═══════════════════════════════════════

  function addWireMeshPanel(
    startX: number, startZ: number,
    endX: number, endZ: number,
    panelH: number, yBase: number
  ) {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const panelLen = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    const cx = (startX + endX) / 2;
    const cz = (startZ + endZ) / 2;

    // Frame top rail
    g.add(box(panelLen, 0.012, 0.012, steelFrame,
      cx, yBase + panelH, cz, 0, angle, 0));
    // Frame bottom rail
    g.add(box(panelLen, 0.012, 0.012, steelFrame,
      cx, yBase + 0.01, cz, 0, angle, 0));

    // Horizontal wires
    const hWireCount = Math.floor(panelH / wireSpacing);
    for (let i = 1; i < hWireCount; i++) {
      const wy = yBase + i * wireSpacing;
      g.add(box(panelLen - 0.02, wireD, wireD, wireMat,
        cx, wy, cz, 0, angle, 0));
    }

    // Vertical wires
    const vWireCount = Math.floor(panelLen / wireSpacing);
    for (let i = 1; i < vWireCount; i++) {
      const t = i / vWireCount;
      const wx = startX + dx * t;
      const wz = startZ + dz * t;
      g.add(box(wireD, panelH - 0.02, wireD, wireMat,
        wx, yBase + panelH / 2, wz));
    }
  }

  // Back panel (full height)
  addWireMeshPanel(-cW / 2 + postW, -cD / 2 + postW / 2,
    cW / 2 - postW, -cD / 2 + postW / 2, cH, baseH);

  // Left panel (full height)
  addWireMeshPanel(-cW / 2 + postW / 2, -cD / 2 + postW,
    -cW / 2 + postW / 2, cD / 2 - postW, cH, baseH);

  // Right panel (full height)
  addWireMeshPanel(cW / 2 - postW / 2, -cD / 2 + postW,
    cW / 2 - postW / 2, cD / 2 - postW, cH, baseH);

  // ═══════════════════════════════════════
  // ── Front Half-Drop Gate (partially open) ──
  // ═══════════════════════════════════════

  const gateH = cH / 2; // half-height gate
  const gateAngle = 0.5; // partially open (radians, tilted outward)

  // Gate pivot at top of bottom half
  const gatePivotY = baseH + gateH;

  // Gate group positioned at hinge point
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, gatePivotY, cD / 2 - postW / 2);
  gateGroup.rotation.x = gateAngle; // tilted open

  // Gate frame
  gateGroup.add(box(cW - postW * 2, 0.012, 0.012, steelFrame, 0, 0, 0));       // top rail
  gateGroup.add(box(cW - postW * 2, 0.012, 0.012, steelFrame, 0, -gateH + 0.01, 0)); // bottom rail
  gateGroup.add(box(0.012, gateH, 0.012, steelFrame, -cW / 2 + postW + 0.006, -gateH / 2, 0)); // left
  gateGroup.add(box(0.012, gateH, 0.012, steelFrame, cW / 2 - postW - 0.006, -gateH / 2, 0));  // right

  // Gate mesh wires - horizontal
  const gateHWires = Math.floor(gateH / wireSpacing);
  for (let i = 1; i < gateHWires; i++) {
    gateGroup.add(box(cW - postW * 2 - 0.02, wireD, wireD, wireMat,
      0, -i * wireSpacing, 0));
  }
  // Gate mesh wires - vertical
  const gateVWires = Math.floor((cW - postW * 2) / wireSpacing);
  for (let i = 1; i < gateVWires; i++) {
    const wx = -cW / 2 + postW + i * wireSpacing;
    gateGroup.add(box(wireD, gateH - 0.02, wireD, wireMat,
      wx, -gateH / 2, 0));
  }

  g.add(gateGroup);

  // Upper front panel (fixed, above gate)
  addWireMeshPanel(-cW / 2 + postW, cD / 2 - postW / 2,
    cW / 2 - postW, cD / 2 - postW / 2, cH / 2, baseH + gateH);

  // ── Gate Hinge Mechanism ──
  for (const hx of [-cW / 2 + postW + 0.02, cW / 2 - postW - 0.02]) {
    // Hinge barrel
    g.add(cyl(0.006, 0.006, 0.02, 8, hingeSteel,
      hx, gatePivotY, cD / 2 - postW / 2, 0, 0, Math.PI / 2));
    // Hinge plate on post
    g.add(box(0.02, 0.03, 0.008, hingeSteel,
      hx, gatePivotY, cD / 2 - postW / 2 + 0.008));
    // Hinge plate on gate
    g.add(box(0.02, 0.03, 0.008, hingeSteel,
      hx, gatePivotY - 0.02, cD / 2 - postW / 2 + 0.015));
  }

  // ── Gate latch (simple pin latch) ──
  g.add(cyl(0.005, 0.005, 0.04, 6, steelFrame,
    cW / 2 - postW - 0.04, baseH + gateH - 0.02, cD / 2 + 0.01));
  g.add(box(0.02, 0.015, 0.008, steelFrame,
    cW / 2 - postW - 0.04, baseH + gateH - 0.02, cD / 2 + 0.015));

  // ═══════════════════════════════════════
  // ── Stacking Feet (4 on top corners) ──
  // ═══════════════════════════════════════

  for (const [px, pz] of postPositions) {
    // Conical stacking foot
    g.add(cyl(0.015, 0.020, 0.025, 8, stackFoot,
      px, baseH + cH + 0.0125, pz));
    // Base plate
    g.add(box(0.035, 0.005, 0.035, steelFrame,
      px, baseH + cH + 0.0025, pz));
  }

  // ═══════════════════════════════════════
  // ── Name Plate / Label Holder ──
  // ═══════════════════════════════════════

  g.add(box(0.10, 0.05, 0.003, labelHolder,
    0.10, baseH + cH * 0.3, cD / 2 + 0.003));
  g.add(box(0.085, 0.035, 0.002, labelWhite,
    0.10, baseH + cH * 0.3, cD / 2 + 0.005));
  // Text lines
  g.add(box(0.06, 0.005, 0.003, labelText,
    0.10, baseH + cH * 0.3 + 0.008, cD / 2 + 0.006));
  g.add(box(0.05, 0.004, 0.003, labelText,
    0.10, baseH + cH * 0.3 - 0.003, cD / 2 + 0.006));
  // Barcode
  for (let i = 0; i < 7; i++) {
    g.add(box((i % 2 === 0) ? 0.003 : 0.002, 0.010, 0.003, labelText,
      0.08 + i * 0.005, baseH + cH * 0.3 - 0.015, cD / 2 + 0.006));
  }

  // ═══════════════════════════════════════
  // ── Contents Visible Through Mesh ──
  // ═══════════════════════════════════════

  // Cardboard boxes inside
  g.add(box(0.16, 0.10, 0.14, contentBox, -0.10, baseH + 0.09, -0.05));
  g.add(box(0.14, 0.12, 0.12, contentBox, 0.10, baseH + 0.10, -0.06));
  g.add(box(0.18, 0.08, 0.16, contentBox, 0.02, baseH + 0.08, 0.08));
  // Small blue container on top
  g.add(box(0.10, 0.06, 0.10, contentBlue, -0.08, baseH + 0.19, -0.03));
  // Another box stacked
  g.add(box(0.12, 0.10, 0.10, contentBox, 0.12, baseH + 0.17, 0.06));

  // ── Tape details on boxes ──
  g.add(box(0.01, 0.10, 0.002, mat(0x997744, 0, 0.8),
    -0.10, baseH + 0.09, -0.121));
  g.add(box(0.01, 0.12, 0.002, mat(0x997744, 0, 0.8),
    0.10, baseH + 0.10, -0.121));

  // ═══════════════════════════════════════
  // ── Folding Hinge Mechanism (on side panels) ──
  // ═══════════════════════════════════════

  // Hinge points on left and right panels at midheight
  for (const side of [-1, 1]) {
    const hx = side * (cW / 2 - postW / 2);
    const hingeY = baseH + cH * 0.5;
    // Hinge barrel
    g.add(cyl(0.005, 0.005, cD * 0.15, 8, hingeSteel,
      hx, hingeY, -cD / 4, Math.PI / 2, 0, 0));
    g.add(cyl(0.005, 0.005, cD * 0.15, 8, hingeSteel,
      hx, hingeY, cD / 4, Math.PI / 2, 0, 0));
    // Hinge brackets
    g.add(box(0.012, 0.025, 0.012, hingeSteel, hx, hingeY, -cD / 4));
    g.add(box(0.012, 0.025, 0.012, hingeSteel, hx, hingeY, cD / 4));
  }

  return g;
}
