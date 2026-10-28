import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildToolCabinet(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const cabinetRed = mat(0x8b1a1a, 0.4, 0.5);
  const cabinetRedDark = mat(0x6a1515, 0.45, 0.5);
  const drawerFace = mat(0x991818, 0.35, 0.55);
  const handleChrome = mat(0xc8d0d8, 0.86, 0.15);
  const lockMat = mat(0x888888, 0.8, 0.2);
  const casterMat = mat(0x333333, 0.3, 0.6);
  const rubberWheel = mat(0x1a1a1a, 0.0, 0.9);
  const labelPlate = mat(0xcccccc, 0.7, 0.25);
  const topSurface = mat(0x2a2a2a, 0.2, 0.7);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const trimChrome = mat(0xaabbcc, 0.8, 0.2);

  // ── Dimensions ──
  const cabW = 0.7;
  const cabD = 0.5;
  const lowerH = 0.85;
  const upperH = 0.40;
  const casterH = 0.06;
  const totalH = casterH + lowerH + upperH;
  const wallThick = 0.02;

  // ═══════════════════════════════════
  // ── Casters / Wheels (4 corners) ──
  // ═══════════════════════════════════
  for (const [cx, cz] of [[-cabW / 2 + 0.06, -cabD / 2 + 0.06], [cabW / 2 - 0.06, -cabD / 2 + 0.06], [-cabW / 2 + 0.06, cabD / 2 - 0.06], [cabW / 2 - 0.06, cabD / 2 - 0.06]] as [number, number][]) {
    // Caster fork
    g.add(box(0.03, 0.03, 0.04, casterMat, cx, 0.035, cz));
    // Caster swivel plate
    g.add(cyl(0.02, 0.02, 0.01, 8, casterMat, cx, 0.055, cz));
    // Wheel
    g.add(cyl(0.025, 0.025, 0.02, 12, rubberWheel, cx, 0.018, cz, 0, 0, Math.PI / 2));
    // Wheel axle
    g.add(cyl(0.005, 0.005, 0.035, 6, handleChrome, cx, 0.018, cz, 0, 0, Math.PI / 2));
  }

  // ═══════════════════════════════════
  // ── Lower Cabinet Body ──
  // ═══════════════════════════════════
  const lowerY = casterH + lowerH / 2;

  // Main body shell
  g.add(box(cabW, lowerH, cabD, cabinetRed, 0, lowerY, 0));
  // Back panel (darker)
  g.add(box(cabW - 0.01, lowerH - 0.01, wallThick, cabinetRedDark, 0, lowerY, cabD / 2 - wallThick / 2));
  // Side panels
  g.add(box(wallThick, lowerH - 0.01, cabD - 0.01, cabinetRedDark, -cabW / 2 + wallThick / 2, lowerY, 0));
  g.add(box(wallThick, lowerH - 0.01, cabD - 0.01, cabinetRedDark, cabW / 2 - wallThick / 2, lowerY, 0));

  // ── Corner trim (chrome strips) ──
  for (const [tx, tz] of [[-cabW / 2, -cabD / 2], [cabW / 2, -cabD / 2], [-cabW / 2, cabD / 2], [cabW / 2, cabD / 2]] as [number, number][]) {
    g.add(box(0.008, lowerH, 0.008, trimChrome, tx, lowerY, tz));
  }

  // ── Lower Drawer Fronts (6 drawers, varying heights) ──
  const drawerGap = 0.008;
  const drawerHeights = [0.08, 0.08, 0.10, 0.12, 0.12, 0.18]; // bottom to top
  let currentY = casterH + 0.02;

  for (let i = 0; i < drawerHeights.length; i++) {
    const dh = drawerHeights[i];
    const dy = currentY + dh / 2;

    // Drawer face
    g.add(box(cabW - 0.03, dh - drawerGap, 0.008, drawerFace, 0, dy, -cabD / 2 + 0.004));

    // Drawer handle (chrome bar)
    g.add(box(0.20, 0.012, 0.015, handleChrome, 0, dy, -cabD / 2 - 0.005));
    // Handle end caps
    g.add(cyl(0.008, 0.008, 0.015, 8, handleChrome, -0.10, dy, -cabD / 2 - 0.005, 0, 0, Math.PI / 2));
    g.add(cyl(0.008, 0.008, 0.015, 8, handleChrome, 0.10, dy, -cabD / 2 - 0.005, 0, 0, Math.PI / 2));

    // Handle mounting brackets
    g.add(box(0.02, 0.02, 0.01, steelFrame, -0.10, dy, -cabD / 2 + 0.002));
    g.add(box(0.02, 0.02, 0.01, steelFrame, 0.10, dy, -cabD / 2 + 0.002));

    // Drawer divider line
    if (i < drawerHeights.length - 1) {
      g.add(box(cabW - 0.02, 0.003, cabD - 0.04, steelFrame, 0, currentY + dh, 0));
    }

    currentY += dh;
  }

  // ═══════════════════════════════════
  // ── Upper Chest Section ──
  // ═══════════════════════════════════
  const upperBaseY = casterH + lowerH;
  const upperY = upperBaseY + upperH / 2;

  // Upper body shell
  g.add(box(cabW, upperH, cabD, cabinetRed, 0, upperY, 0));
  // Upper back panel
  g.add(box(cabW - 0.01, upperH - 0.01, wallThick, cabinetRedDark, 0, upperY, cabD / 2 - wallThick / 2));

  // ── Upper corner trim ──
  for (const [tx, tz] of [[-cabW / 2, -cabD / 2], [cabW / 2, -cabD / 2], [-cabW / 2, cabD / 2], [cabW / 2, cabD / 2]] as [number, number][]) {
    g.add(box(0.008, upperH, 0.008, trimChrome, tx, upperY, tz));
  }

  // ── Upper Drawer Fronts (2 drawers) ──
  const upperDrawerHeights = [0.14, 0.18];
  let upperCurrentY = upperBaseY + 0.02;

  for (let i = 0; i < upperDrawerHeights.length; i++) {
    const dh = upperDrawerHeights[i];
    const dy = upperCurrentY + dh / 2;

    // Drawer face
    g.add(box(cabW - 0.03, dh - drawerGap, 0.008, drawerFace, 0, dy, -cabD / 2 + 0.004));

    // Handle
    g.add(box(0.20, 0.012, 0.015, handleChrome, 0, dy, -cabD / 2 - 0.005));
    g.add(cyl(0.008, 0.008, 0.015, 8, handleChrome, -0.10, dy, -cabD / 2 - 0.005, 0, 0, Math.PI / 2));
    g.add(cyl(0.008, 0.008, 0.015, 8, handleChrome, 0.10, dy, -cabD / 2 - 0.005, 0, 0, Math.PI / 2));

    // Mounting brackets
    g.add(box(0.02, 0.02, 0.01, steelFrame, -0.10, dy, -cabD / 2 + 0.002));
    g.add(box(0.02, 0.02, 0.01, steelFrame, 0.10, dy, -cabD / 2 + 0.002));

    upperCurrentY += dh;
  }

  // ── Divider between upper drawers ──
  g.add(box(cabW - 0.02, 0.003, cabD - 0.04, steelFrame, 0, upperBaseY + 0.02 + upperDrawerHeights[0], 0));

  // ═══════════════════════════════════
  // ── Top Work Surface ──
  // ═══════════════════════════════════
  g.add(box(cabW + 0.02, 0.025, cabD + 0.01, topSurface, 0, totalH + 0.0125, 0));
  // Rubber top edge lip
  g.add(box(cabW + 0.03, 0.008, 0.008, mat(0x333333, 0, 0.9), 0, totalH + 0.028, -cabD / 2 - 0.005));
  g.add(box(cabW + 0.03, 0.008, 0.008, mat(0x333333, 0, 0.9), 0, totalH + 0.028, cabD / 2 + 0.005));

  // ═══════════════════════════════════
  // ── Lock Mechanism ──
  // ═══════════════════════════════════
  // Lock cylinder (top drawer area)
  g.add(cyl(0.012, 0.012, 0.015, 8, lockMat, cabW / 2 - 0.05, upperBaseY + 0.06, -cabD / 2 - 0.005));
  // Lock keyhole
  g.add(box(0.004, 0.01, 0.005, mat(0x222222, 0.5, 0.4), cabW / 2 - 0.05, upperBaseY + 0.06, -cabD / 2 - 0.013));

  // ── Lower lock ──
  g.add(cyl(0.012, 0.012, 0.015, 8, lockMat, cabW / 2 - 0.05, casterH + 0.06, -cabD / 2 - 0.005));
  g.add(box(0.004, 0.01, 0.005, mat(0x222222, 0.5, 0.4), cabW / 2 - 0.05, casterH + 0.06, -cabD / 2 - 0.013));

  // ═══════════════════════════════════
  // ── Side Handle (for pushing) ──
  // ═══════════════════════════════════
  // Handle bracket (left side)
  g.add(box(0.015, 0.03, 0.04, steelFrame, -cabW / 2 - 0.01, lowerY + lowerH / 2 - 0.08, 0.12));
  g.add(box(0.015, 0.03, 0.04, steelFrame, -cabW / 2 - 0.01, lowerY + lowerH / 2 - 0.08, -0.12));
  // Handle bar
  g.add(cyl(0.012, 0.012, 0.28, 8, handleChrome, -cabW / 2 - 0.02, lowerY + lowerH / 2 - 0.08, 0, 0, 0, Math.PI / 2));

  // ═══════════════════════════════════
  // ── Brand Label Plate ──
  // ═══════════════════════════════════
  // Nameplate on upper chest front
  g.add(box(0.12, 0.03, 0.003, labelPlate, 0, upperY + upperH / 2 - 0.04, -cabD / 2 - 0.003));
  // Engraved text representation (small dark rectangle)
  g.add(box(0.08, 0.012, 0.004, mat(0x333333, 0.5, 0.4), 0, upperY + upperH / 2 - 0.04, -cabD / 2 - 0.005));

  // ── Separation line between upper and lower ──
  g.add(box(cabW + 0.01, 0.008, cabD + 0.005, trimChrome, 0, upperBaseY, 0));

  return g;
}
