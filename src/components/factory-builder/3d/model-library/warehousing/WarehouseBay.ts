import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildWarehouseBay(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelFrame = mat(0x2f5f9f, 0.35, 0.45); // pallet-rack blue uprights
  const beamOrange = mat(0xf07020, 0.25, 0.5);
  const basePlate = mat(0x505868, 0.7, 0.4);
  const wireMesh = mat(0x8090a0, 0.6, 0.4, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const bollardYellow = mat(0xeecc00, 0.15, 0.55);
  const labelPlate = mat(0xeeeeee, 0.0, 0.9);
  const nettingMat = mat(0x8c949e, 0.0, 0.8, { transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const spacerMat = mat(0x606878, 0.6, 0.4);

  // ── Dimensions ──
  const bayW = 1.5;   // width (X)
  const bayD = 0.6;   // depth (Z)
  const levelH = 0.45; // height per level
  const levels = 3;
  const uprightW = 0.04;
  const uprightD = 0.04;
  const totalH = levels * levelH + 0.12;

  // ── Upright Frames (2 pairs of vertical columns) ──
  const uprightPositions = [
    [-bayW / 2, -bayD / 2],
    [-bayW / 2, bayD / 2],
    [bayW / 2, -bayD / 2],
    [bayW / 2, bayD / 2],
  ];

  for (const [px, pz] of uprightPositions) {
    // Main upright column
    g.add(box(uprightW, totalH, uprightD, steelFrame, px, totalH / 2, pz));
    // Perforation holes (detail slots along upright)
    for (let h = 0.08; h < totalH - 0.05; h += 0.06) {
      g.add(box(uprightW + 0.002, 0.015, 0.012, M.bodyDark, px, h, pz));
    }
    // Base plate
    g.add(box(0.08, 0.01, 0.08, basePlate, px, 0.005, pz));
    // Anchor bolts (4 per base plate)
    for (const [dx, dz] of [[-0.025, -0.025], [0.025, -0.025], [-0.025, 0.025], [0.025, 0.025]]) {
      g.add(cyl(0.005, 0.005, 0.015, 6, M.darkChrome, px + dx, 0.017, pz + dz));
      g.add(cyl(0.008, 0.008, 0.004, 6, M.darkChrome, px + dx, 0.012, pz + dz));
    }
  }

  // ── X-Bracing on each upright frame (left side and right side) ──
  const framePairsX = [-bayW / 2, bayW / 2];
  for (const fx of framePairsX) {
    // Diagonal braces between front and back uprights
    for (let lv = 0; lv < levels; lv++) {
      const y0 = lv * levelH + 0.06;
      const y1 = (lv + 1) * levelH + 0.02;
      const midY = (y0 + y1) / 2;
      const braceLen = Math.sqrt(bayD * bayD + (y1 - y0) * (y1 - y0));
      const angle = Math.atan2(y1 - y0, bayD);
      // Brace 1 (bottom-front to top-back)
      g.add(box(0.012, braceLen, 0.008, steelFrame, fx, midY, 0, 0, 0, angle));
      // Brace 2 (bottom-back to top-front)
      g.add(box(0.012, braceLen, 0.008, steelFrame, fx, midY, 0, 0, 0, -angle));
    }
  }

  // ── Horizontal Load Beams & Decking at each level ──
  for (let lv = 1; lv <= levels; lv++) {
    const beamY = lv * levelH + 0.02;

    // Front and back beams (orange safety)
    for (const bz of [-bayD / 2, bayD / 2]) {
      // Main beam (box-shape)
      g.add(box(bayW - uprightW, 0.05, 0.025, beamOrange, 0, beamY, bz));
      // Beam connector tabs at each end
      for (const side of [-1, 1]) {
        g.add(box(0.015, 0.06, 0.03, beamOrange, side * (bayW / 2 - uprightW / 2), beamY, bz));
        // Connector pins
        g.add(cyl(0.004, 0.004, 0.035, 6, M.darkChrome, side * (bayW / 2 - uprightW / 2), beamY - 0.015, bz));
        g.add(cyl(0.004, 0.004, 0.035, 6, M.darkChrome, side * (bayW / 2 - uprightW / 2), beamY + 0.015, bz));
      }
    }

    // Wire mesh decking
    g.add(box(bayW - uprightW * 2, 0.005, bayD - uprightD * 2, wireMesh, 0, beamY + 0.027, 0));
    // Wire mesh cross-wires (visual detail)
    const wireCount = 6;
    for (let i = 0; i < wireCount; i++) {
      const t = (i / (wireCount - 1)) * (bayD - uprightD * 3) - (bayD - uprightD * 3) / 2;
      g.add(box(bayW - uprightW * 3, 0.003, 0.003, spacerMat, 0, beamY + 0.03, t));
    }
    for (let i = 0; i < 10; i++) {
      const t = (i / 9) * (bayW - uprightW * 3) - (bayW - uprightW * 3) / 2;
      g.add(box(0.003, 0.003, bayD - uprightD * 3, spacerMat, t, beamY + 0.03, 0));
    }

    // Side beam supports (cross members)
    g.add(box(0.02, 0.03, bayD - uprightD, steelFrame, -bayW / 2 + 0.02, beamY, 0));
    g.add(box(0.02, 0.03, bayD - uprightD, steelFrame, bayW / 2 - 0.02, beamY, 0));
  }

  // ── Pallets with boxes on shelves ──
  const palletW = 0.35;
  const palletD = 0.28;
  const palletH = 0.02;

  // Level 1 - two pallets with boxes
  for (const px of [-0.3, 0.3]) {
    const py = levelH + 0.055;
    g.add(box(palletW, palletH, palletD, M.pallet, px, py, 0));
    // Pallet slats
    for (const sz of [-0.08, 0, 0.08]) {
      g.add(box(palletW, 0.005, 0.04, M.pallet, px, py - 0.008, sz));
    }
    // Stacked boxes
    g.add(box(0.14, 0.1, 0.12, M.cardboard, px - 0.06, py + 0.07, -0.04));
    g.add(box(0.14, 0.1, 0.12, M.cardboard, px + 0.06, py + 0.07, 0.04));
    g.add(box(0.12, 0.08, 0.1, M.cardboard, px, py + 0.14, 0));
  }

  // Level 2 - one pallet
  {
    const py = 2 * levelH + 0.055;
    g.add(box(palletW, palletH, palletD, M.pallet, 0.1, py, 0));
    for (const sz of [-0.08, 0, 0.08]) {
      g.add(box(palletW, 0.005, 0.04, M.pallet, 0.1, py - 0.008, sz));
    }
    g.add(box(0.3, 0.12, 0.22, M.cardboard, 0.1, py + 0.08, 0));
    // Tape strips on box
    g.add(box(0.01, 0.12, 0.23, mat(0x997744, 0, 0.8), 0.1, py + 0.08, 0));
  }

  // Level 3 - one pallet with tall boxes
  {
    const py = 3 * levelH + 0.055;
    g.add(box(palletW, palletH, palletD, M.pallet, -0.2, py, 0));
    g.add(box(0.15, 0.15, 0.12, M.cardboard, -0.2, py + 0.095, -0.04));
    g.add(box(0.12, 0.15, 0.12, M.cardboard, -0.15, py + 0.095, 0.06));
  }

  // ── Column Protectors (yellow bollards at base corners) ──
  for (const [px, pz] of [[-bayW / 2, -bayD / 2], [-bayW / 2, bayD / 2], [bayW / 2, -bayD / 2], [bayW / 2, bayD / 2]]) {
    // Bollard
    g.add(cyl(0.035, 0.04, 0.12, 8, bollardYellow, px + (px > 0 ? 0.06 : -0.06), 0.06, pz));
    // Bollard base plate
    g.add(cyl(0.05, 0.05, 0.008, 8, basePlate, px + (px > 0 ? 0.06 : -0.06), 0.004, pz));
    // Black stripe on bollard
    g.add(cyl(0.036, 0.041, 0.015, 8, M.bodyDark, px + (px > 0 ? 0.06 : -0.06), 0.08, pz));
  }

  // ── Bay Identification Labels ──
  for (const side of [-1, 1]) {
    g.add(box(0.08, 0.04, 0.003, labelPlate, side * bayW / 2, totalH - 0.06, -bayD / 2 - 0.002));
    // Label text (dark bar representing text)
    g.add(box(0.05, 0.012, 0.004, M.bodyDark, side * bayW / 2, totalH - 0.06, -bayD / 2 - 0.003));
    g.add(box(0.04, 0.008, 0.004, M.blue, side * bayW / 2, totalH - 0.05, -bayD / 2 - 0.003));
  }

  // ── Rack End Safety Netting (front and back) ──
  for (const bz of [-bayD / 2 - 0.005, bayD / 2 + 0.005]) {
    g.add(box(bayW, totalH - 0.1, 0.003, nettingMat, 0, totalH / 2, bz));
  }

  // ── Row Spacers between uprights (horizontal ties at top) ──
  for (const fx of [-bayW / 2, bayW / 2]) {
    g.add(box(0.015, 0.015, bayD, spacerMat, fx, totalH - 0.02, 0));
    g.add(box(0.015, 0.015, bayD, spacerMat, fx, totalH * 0.5, 0));
  }

  // ── Top frame cap rails ──
  g.add(box(bayW, 0.01, 0.02, steelFrame, 0, totalH + 0.005, -bayD / 2));
  g.add(box(bayW, 0.01, 0.02, steelFrame, 0, totalH + 0.005, bayD / 2));

  return g;
}
