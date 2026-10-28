import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildShippingContainer(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steel = mat(0x2266AA, 0.6, 0.45);       // Container body blue
  const steelDark = mat(0x1a4e88, 0.6, 0.5);     // Darker corrugation
  const steelFloor = mat(0x3a3a3a, 0.5, 0.6);    // Floor
  const casting = mat(0x505050, 0.7, 0.35);       // Corner castings
  const doorSteel = mat(0x1e5a96, 0.6, 0.45);     // Door panels
  const handle = mat(0x606060, 0.75, 0.3);        // Handles
  const gasket = mat(0x1a1a1a, 0.0, 0.9);         // Door seal
  const plateWhite = mat(0xeeeeee, 0.0, 0.9);     // CSC plate
  const plateText = mat(0x222222, 0.0, 0.9);      // Text on plate
  const ventGray = mat(0x444444, 0.5, 0.5);       // Ventilation
  const woodFloor = mat(0x6B4428, 0.0, 0.85);     // Plywood floor

  // ── Container Dimensions (20ft ISO: ~6.06 x 2.59 x 2.44m, scaled) ──
  const cL = 3.0;   // length (Z) - scaled
  const cW = 1.2;   // width (X)
  const cH = 1.2;   // height (Y)
  const wallT = 0.015; // wall thickness

  // ── Floor ──
  g.add(box(cW, 0.03, cL, woodFloor, 0, 0.015, 0));

  // ── Floor Cross Members (underneath) ──
  for (let i = 0; i < 12; i++) {
    const fz = -cL / 2 + 0.15 + i * (cL / 12);
    g.add(box(cW - 0.05, 0.04, 0.03, steelFloor, 0, -0.02, fz));
  }

  // ── Bottom Rails (2 longitudinal) ──
  g.add(box(0.06, 0.06, cL, steelFloor, -cW / 2 + 0.03, -0.02, 0));
  g.add(box(0.06, 0.06, cL, steelFloor, cW / 2 - 0.03, -0.02, 0));

  // ── Forklift Pockets (2 tunnels) ──
  for (const fz of [-cL / 4, cL / 4]) {
    g.add(box(cW - 0.1, 0.06, 0.14, steelFloor, 0, -0.02, fz));
    // Pocket openings (dark recesses on sides)
    g.add(box(0.005, 0.05, 0.12, gasket, -cW / 2 + 0.005, -0.02, fz));
    g.add(box(0.005, 0.05, 0.12, gasket, cW / 2 - 0.005, -0.02, fz));
  }

  // ── Roof ──
  g.add(box(cW, wallT, cL, steel, 0, cH - wallT / 2, 0));

  // ── Side Walls with Corrugation ──
  const corrCount = 36;
  const corrSpacing = cL / corrCount;
  for (const side of [-1, 1]) {
    const wx = side * (cW / 2 - wallT / 2);
    // Base wall panel
    g.add(box(wallT, cH, cL, steel, wx, cH / 2, 0));
    // Corrugation ridges
    for (let i = 0; i < corrCount; i++) {
      const cz = -cL / 2 + corrSpacing / 2 + i * corrSpacing;
      if (i % 2 === 0) {
        g.add(box(0.008, cH - 0.08, 0.012, steelDark,
          wx + side * 0.01, cH / 2, cz));
      }
    }
  }

  // ── Back Wall (closed end) with corrugation ──
  g.add(box(cW, cH, wallT, steel, 0, cH / 2, -cL / 2 + wallT / 2));
  for (let i = 0; i < 14; i++) {
    const cx = -cW / 2 + 0.05 + i * (cW / 14);
    if (i % 2 === 0) {
      g.add(box(0.012, cH - 0.08, 0.008, steelDark,
        cx, cH / 2, -cL / 2 - 0.003));
    }
  }

  // ── Front End: Double Doors ──
  const doorW = cW / 2 - 0.04;
  const doorH = cH - 0.06;
  const doorZ = cL / 2;

  // Left door
  g.add(box(doorW, doorH, wallT, doorSteel, -doorW / 2 - 0.005, doorH / 2 + 0.03, doorZ));
  // Right door
  g.add(box(doorW, doorH, wallT, doorSteel, doorW / 2 + 0.005, doorH / 2 + 0.03, doorZ));

  // Door corrugation
  for (const doorSide of [-1, 1]) {
    const dCenter = doorSide * (doorW / 2 + 0.005);
    for (let i = 0; i < 6; i++) {
      const cx = dCenter - doorW / 2 + 0.04 + i * (doorW / 6);
      if (i % 2 === 0) {
        g.add(box(0.012, doorH - 0.06, 0.008, steelDark,
          cx, doorH / 2 + 0.03, doorZ + 0.009));
      }
    }
  }

  // ── Door Gasket Seal (rubber strip around door frame) ──
  g.add(box(cW - 0.04, 0.02, 0.005, gasket, 0, cH - 0.01, doorZ - 0.01));  // top
  g.add(box(cW - 0.04, 0.02, 0.005, gasket, 0, 0.04, doorZ - 0.01));       // bottom
  g.add(box(0.02, doorH, 0.005, gasket, -cW / 2 + 0.03, doorH / 2 + 0.03, doorZ - 0.01)); // left
  g.add(box(0.02, doorH, 0.005, gasket, cW / 2 - 0.03, doorH / 2 + 0.03, doorZ - 0.01)); // right
  g.add(box(0.02, doorH, 0.005, gasket, 0, doorH / 2 + 0.03, doorZ - 0.01)); // center seal

  // ── Door Locking Bars (2 per door, vertical) ──
  for (const doorSide of [-1, 1]) {
    const barX1 = doorSide * 0.12;
    const barX2 = doorSide * 0.35;
    for (const barX of [barX1, barX2]) {
      // Vertical bar
      g.add(cyl(0.012, 0.012, doorH * 0.85, 8, handle, barX, doorH / 2 + 0.03, doorZ + 0.02));
      // Cam keeper brackets (3 per bar)
      for (const camY of [0.15, doorH / 2 + 0.03, doorH - 0.12]) {
        g.add(box(0.03, 0.04, 0.015, handle, barX, camY, doorZ + 0.025));
      }
      // Handle at center
      g.add(box(0.06, 0.04, 0.02, handle, barX, doorH / 2 + 0.03, doorZ + 0.035));
    }
  }

  // ── Door Handle Grips ──
  for (const doorSide of [-1, 1]) {
    g.add(cyl(0.008, 0.008, 0.06, 8, M.chrome,
      doorSide * 0.05, cH * 0.55, doorZ + 0.04, 0, 0, Math.PI / 2));
  }

  // ── 8 Corner Castings ──
  const castSize = 0.07;
  const castH = 0.06;
  const corners = [
    [-cW / 2, 0, -cL / 2], [cW / 2, 0, -cL / 2],
    [-cW / 2, 0, cL / 2], [cW / 2, 0, cL / 2],
    [-cW / 2, cH, -cL / 2], [cW / 2, cH, -cL / 2],
    [-cW / 2, cH, cL / 2], [cW / 2, cH, cL / 2],
  ];
  for (const [cx, cy, cz] of corners) {
    g.add(box(castSize, castH, castSize, casting, cx, cy + (cy === 0 ? castH / 2 - 0.03 : -castH / 2 + 0.03), cz));
    // Casting aperture (dark slot)
    g.add(box(castSize * 0.5, castH * 0.3, castSize + 0.005, gasket,
      cx, cy + (cy === 0 ? castH / 2 - 0.03 : -castH / 2 + 0.03), cz));
  }

  // ── Top Side Rails ──
  g.add(box(0.04, 0.04, cL, steel, -cW / 2 + 0.02, cH - 0.02, 0));
  g.add(box(0.04, 0.04, cL, steel, cW / 2 - 0.02, cH - 0.02, 0));

  // ── Header (top cross beam at door end) ──
  g.add(box(cW, 0.05, 0.04, steel, 0, cH - 0.025, doorZ - 0.02));

  // ── CSC Safety Approval Plate (left side, near door end) ──
  g.add(box(0.15, 0.10, 0.003, plateWhite, -cW / 2 - 0.002, cH * 0.4, cL / 2 - 0.3));
  // Plate text lines
  for (let i = 0; i < 5; i++) {
    g.add(box(0.12, 0.006, 0.004, plateText,
      -cW / 2 - 0.003, cH * 0.4 + 0.03 - i * 0.014, cL / 2 - 0.3));
  }
  // "CSC" header
  g.add(box(0.04, 0.012, 0.004, plateText, -cW / 2 - 0.003, cH * 0.4 + 0.04, cL / 2 - 0.3));

  // ── Container Number Plate (right side) ──
  g.add(box(0.20, 0.06, 0.003, plateWhite, cW / 2 + 0.002, cH * 0.75, -cL / 2 + 0.4));
  // Large "number" representation
  g.add(box(0.16, 0.02, 0.004, plateText, cW / 2 + 0.003, cH * 0.75 + 0.01, -cL / 2 + 0.4));
  g.add(box(0.10, 0.012, 0.004, plateText, cW / 2 + 0.003, cH * 0.75 - 0.015, -cL / 2 + 0.4));

  // ── Ventilation Grilles (2, on side walls near top at closed end) ──
  for (const side of [-1, 1]) {
    const vx = side * (cW / 2 + (side > 0 ? 0.002 : -0.002));
    // Grille frame
    g.add(box(0.005, 0.08, 0.12, ventGray, vx, cH - 0.12, -cL / 2 + 0.2));
    // Louver slats
    for (let s = 0; s < 5; s++) {
      g.add(box(0.006, 0.005, 0.10, ventGray,
        vx, cH - 0.16 + s * 0.016, -cL / 2 + 0.2));
    }
  }

  return g;
}
