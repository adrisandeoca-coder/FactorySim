import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildPalletStack(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const palletWood = mat(0x8B5E3C, 0.0, 0.9);
  const palletWoodDark = mat(0x6B4428, 0.0, 0.92);
  const nailHead = mat(0x888888, 0.7, 0.3);
  const cardboardLight = mat(0xD4A55A, 0.0, 0.95);
  const cardboardDark = mat(0xB08040, 0.0, 0.95);
  const stretchWrap = mat(0xeeeeee, 0.0, 0.3, { transparent: true, opacity: 0.12, side: THREE.DoubleSide });
  const tape = mat(0x997744, 0.0, 0.7);
  const labelWhite = mat(0xf0f0f0, 0.0, 0.9);
  const labelText = mat(0x222222, 0.0, 0.9);
  const barcode = mat(0x111111, 0.0, 0.9);

  // ── Pallet Dimensions (standard 48x40 inch ~ 1.2 x 1.0 m, scaled down) ──
  const pW = 0.60;  // width (X)
  const pD = 0.50;  // depth (Z)
  const deckH = 0.012;  // deck board thickness
  const stringerH = 0.08; // stringer height
  const palletTotalH = deckH + stringerH + deckH; // top deck + stringer + bottom deck

  function buildPallet(yBase: number) {
    const pg = new THREE.Group();
    pg.position.y = yBase;

    // ── Top Deck Boards (7 boards across width) ──
    const topBoardCount = 7;
    const boardW = pW / topBoardCount - 0.005;
    for (let i = 0; i < topBoardCount; i++) {
      const bx = -pW / 2 + boardW / 2 + i * (pW / topBoardCount) + 0.0025;
      pg.add(box(boardW, deckH, pD, (i % 2 === 0) ? palletWood : palletWoodDark,
        bx, stringerH + deckH + deckH / 2, 0));
    }

    // ── 3 Stringers (longitudinal beams with notches for 4-way entry) ──
    const stringerPositions = [-pD / 2 + 0.05, 0, pD / 2 - 0.05];
    for (const sz of stringerPositions) {
      // Left block
      pg.add(box(0.08, stringerH, 0.08, palletWood, -pW / 2 + 0.06, deckH + stringerH / 2, sz));
      // Center block
      pg.add(box(0.08, stringerH, 0.08, palletWood, 0, deckH + stringerH / 2, sz));
      // Right block
      pg.add(box(0.08, stringerH, 0.08, palletWood, pW / 2 - 0.06, deckH + stringerH / 2, sz));

      // Connecting stringer boards between blocks (top part, above notch)
      pg.add(box(pW * 0.28, stringerH * 0.4, 0.08, palletWood,
        -pW / 4, deckH + stringerH * 0.8, sz));
      pg.add(box(pW * 0.28, stringerH * 0.4, 0.08, palletWood,
        pW / 4, deckH + stringerH * 0.8, sz));
    }

    // ── Bottom Deck Boards (3 boards for support) ──
    const bottomPositions = [-pW / 2 + 0.06, 0, pW / 2 - 0.06];
    for (const bx of bottomPositions) {
      pg.add(box(0.09, deckH, pD, palletWoodDark, bx, deckH / 2, 0));
    }

    // ── Nail Heads on top deck ──
    for (let i = 0; i < topBoardCount; i++) {
      const bx = -pW / 2 + boardW / 2 + i * (pW / topBoardCount) + 0.0025;
      for (const sz of stringerPositions) {
        pg.add(cyl(0.003, 0.003, 0.002, 6, nailHead,
          bx - 0.01, stringerH + deckH * 2 + 0.001, sz));
        pg.add(cyl(0.003, 0.003, 0.002, 6, nailHead,
          bx + 0.01, stringerH + deckH * 2 + 0.001, sz));
      }
    }

    // ── Nail heads on bottom boards ──
    for (const bx of bottomPositions) {
      for (const sz of stringerPositions) {
        pg.add(cyl(0.003, 0.003, 0.002, 6, nailHead, bx, deckH + 0.001, sz));
      }
    }

    return pg;
  }

  // ── Stack 3 pallets ──
  const p1 = buildPallet(0);
  g.add(p1);

  const p2 = buildPallet(palletTotalH + 0.002);
  g.add(p2);

  const p3 = buildPallet(2 * (palletTotalH + 0.002));
  g.add(p3);

  const boxBaseY = 3 * (palletTotalH + 0.002) - 0.002;

  // ── Cardboard Boxes on top pallet ──
  // Bottom layer: 4 boxes
  const bh1 = 0.14;
  g.add(box(0.22, bh1, 0.20, M.cardboard, -0.13, boxBaseY + bh1 / 2, -0.10));
  g.add(box(0.22, bh1, 0.20, cardboardLight, 0.13, boxBaseY + bh1 / 2, -0.10));
  g.add(box(0.22, bh1, 0.20, cardboardDark, -0.13, boxBaseY + bh1 / 2, 0.12));
  g.add(box(0.22, bh1, 0.20, M.cardboard, 0.13, boxBaseY + bh1 / 2, 0.12));

  // Tape on bottom boxes
  for (const bx of [-0.13, 0.13]) {
    for (const bz of [-0.10, 0.12]) {
      g.add(box(0.015, bh1 + 0.001, 0.002, tape, bx, boxBaseY + bh1 / 2, bz - 0.101));
      g.add(box(0.015, 0.002, 0.20, tape, bx, boxBaseY + bh1 + 0.001, bz));
    }
  }

  // Top layer: 2 boxes
  const bh2 = 0.12;
  g.add(box(0.20, bh2, 0.18, cardboardLight, -0.10, boxBaseY + bh1 + bh2 / 2, 0));
  g.add(box(0.20, bh2, 0.18, cardboardDark, 0.12, boxBaseY + bh1 + bh2 / 2, 0.02));

  // Tape on top boxes
  g.add(box(0.015, bh2 + 0.001, 0.002, tape, -0.10, boxBaseY + bh1 + bh2 / 2, -0.091));
  g.add(box(0.015, 0.002, 0.18, tape, -0.10, boxBaseY + bh1 + bh2 + 0.001, 0));
  g.add(box(0.015, bh2 + 0.001, 0.002, tape, 0.12, boxBaseY + bh1 + bh2 / 2, -0.071));
  g.add(box(0.015, 0.002, 0.18, tape, 0.12, boxBaseY + bh1 + bh2 + 0.001, 0.02));

  // ── Shipping Label on front box ──
  const labelY = boxBaseY + bh1 / 2;
  g.add(box(0.08, 0.06, 0.002, labelWhite, -0.13, labelY, -0.202));
  // "Address" lines
  for (let i = 0; i < 4; i++) {
    g.add(box(0.06, 0.004, 0.003, labelText, -0.13, labelY + 0.015 - i * 0.01, -0.203));
  }
  // Barcode
  for (let i = 0; i < 8; i++) {
    const bw = (i % 2 === 0) ? 0.004 : 0.002;
    g.add(box(bw, 0.015, 0.003, barcode,
      -0.155 + i * 0.006, labelY - 0.02, -0.203));
  }

  // ── Stretch Wrap around boxes ──
  const wrapH = bh1 + bh2 + 0.01;
  const wrapY = boxBaseY + wrapH / 2;
  // Front face
  g.add(box(0.50, wrapH, 0.001, stretchWrap, 0, wrapY, -0.22));
  // Back face
  g.add(box(0.50, wrapH, 0.001, stretchWrap, 0, wrapY, 0.24));
  // Left face
  g.add(box(0.001, wrapH, 0.46, stretchWrap, -0.25, wrapY, 0));
  // Right face
  g.add(box(0.001, wrapH, 0.46, stretchWrap, 0.25, wrapY, 0));
  // Top face
  g.add(box(0.50, 0.001, 0.46, stretchWrap, 0, boxBaseY + wrapH, 0));

  // Stretch wrap wrinkles (horizontal bands)
  for (let i = 0; i < 5; i++) {
    const wy = boxBaseY + 0.03 + i * (wrapH / 5);
    g.add(box(0.502, 0.008, 0.002, stretchWrap, 0, wy, -0.221));
    g.add(box(0.502, 0.008, 0.002, stretchWrap, 0, wy, 0.241));
    g.add(box(0.002, 0.008, 0.462, stretchWrap, -0.251, wy, 0));
    g.add(box(0.002, 0.008, 0.462, stretchWrap, 0.251, wy, 0));
  }

  return g;
}
