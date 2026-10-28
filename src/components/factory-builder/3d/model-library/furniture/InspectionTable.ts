import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildInspectionTable(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const graniteSurface = mat(0x2a2a2a, 0.1, 0.75);
  const graniteEdge = mat(0x353535, 0.1, 0.7);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const steelLight = mat(0x6a7080, 0.7, 0.35);
  const rubberPad = mat(0x1a1c20, 0.0, 0.9);
  const chromeMat = mat(0xc8d0d8, 0.86, 0.15);
  const darkChrome = mat(0x606878, 0.80, 0.25);
  const lightHousing = mat(0xcccccc, 0.5, 0.4);
  const lampGlow = mat(0xffffff, 0.0, 0.3, { emissive: 0xffffdd, emissiveIntensity: 1.5 });
  const lensMat = mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const lensRim = mat(0x111111, 0.3, 0.5);
  const partMetal = mat(0x999999, 0.7, 0.3);
  const partBrass = mat(0xb89030, 0.6, 0.3);
  const caseGreen = mat(0x1a4a2a, 0.2, 0.7);
  const caseLid = mat(0x2a5a3a, 0.2, 0.65);
  const scaleMat = mat(0xdddddd, 0.5, 0.4);
  const rulerMat = mat(0xc0c0c0, 0.7, 0.3);

  // ── Dimensions ──
  const plateW = 0.9;
  const plateD = 0.6;
  const plateThick = 0.1;
  const standH = 0.78;

  // ═══════════════════════════════════
  // ── Granite Surface Plate ──
  // ═══════════════════════════════════
  const plateY = standH + plateThick / 2;
  g.add(box(plateW, plateThick, plateD, graniteSurface, 0, plateY, 0));
  // Chamfered edge appearance (thin border)
  g.add(box(plateW + 0.005, 0.008, plateD + 0.005, graniteEdge, 0, plateY - plateThick / 2 + 0.004, 0));
  g.add(box(plateW + 0.005, 0.008, plateD + 0.005, graniteEdge, 0, plateY + plateThick / 2 - 0.004, 0));

  // ═══════════════════════════════════
  // ── Heavy Base / Stand ──
  // ═══════════════════════════════════
  // Four legs
  const legInset = 0.06;
  const legPositions: [number, number][] = [
    [-plateW / 2 + legInset, -plateD / 2 + legInset],
    [plateW / 2 - legInset, -plateD / 2 + legInset],
    [-plateW / 2 + legInset, plateD / 2 - legInset],
    [plateW / 2 - legInset, plateD / 2 - legInset],
  ];
  for (const [lx, lz] of legPositions) {
    // Box-section steel legs
    g.add(box(0.05, standH, 0.05, steelFrame, lx, standH / 2, lz));
    // Gusset reinforcements at top
    g.add(box(0.06, 0.06, 0.06, steelFrame, lx, standH - 0.03, lz));
  }

  // ── Leveling feet ──
  for (const [lx, lz] of legPositions) {
    // Anti-vibration rubber mount pad
    g.add(cyl(0.035, 0.035, 0.015, 12, rubberPad, lx, 0.008, lz));
    // Leveling screw
    g.add(cyl(0.015, 0.015, 0.02, 8, chromeMat, lx, 0.025, lz));
    // Lock nut
    g.add(cyl(0.02, 0.02, 0.008, 8, steelFrame, lx, 0.035, lz));
  }

  // ── Cross braces ──
  const braceY = standH * 0.35;
  g.add(box(plateW - 0.12, 0.035, 0.03, steelFrame, 0, braceY, -plateD / 2 + legInset));
  g.add(box(plateW - 0.12, 0.035, 0.03, steelFrame, 0, braceY, plateD / 2 - legInset));
  g.add(box(0.03, 0.035, plateD - 0.12, steelFrame, -plateW / 2 + legInset, braceY, 0));
  g.add(box(0.03, 0.035, plateD - 0.12, steelFrame, plateW / 2 - legInset, braceY, 0));
  // Diagonal X-brace (back)
  g.add(box(0.02, 0.02, 0.55, steelLight, 0, braceY + 0.15, plateD / 2 - legInset, 0.5, 0.3, 0));
  g.add(box(0.02, 0.02, 0.55, steelLight, 0, braceY + 0.15, plateD / 2 - legInset, 0.5, -0.3, 0));

  // ── Lower shelf ──
  const shelfY = braceY + 0.025;
  g.add(box(plateW - 0.14, 0.015, plateD - 0.14, steelLight, 0, shelfY, 0));

  // ═══════════════════════════════════
  // ── Height Gauge ──
  // ═══════════════════════════════════
  const hgX = -plateW / 2 + 0.15;
  const hgZ = 0.05;
  const surfY = plateY + plateThick / 2;

  // Base block
  g.add(box(0.08, 0.04, 0.06, steelFrame, hgX, surfY + 0.02, hgZ));
  // Vertical column
  g.add(cyl(0.012, 0.012, 0.35, 8, chromeMat, hgX, surfY + 0.20, hgZ));
  // Slider block on column
  g.add(box(0.03, 0.04, 0.03, darkChrome, hgX, surfY + 0.22, hgZ));
  // Measuring arm (horizontal)
  g.add(box(0.08, 0.005, 0.015, chromeMat, hgX + 0.05, surfY + 0.22, hgZ));
  // Scribing tip
  g.add(cyl(0.002, 0.001, 0.02, 6, chromeMat, hgX + 0.09, surfY + 0.21, hgZ));
  // Scale on column
  g.add(box(0.008, 0.30, 0.002, scaleMat, hgX + 0.015, surfY + 0.18, hgZ - 0.008));
  // Tick marks on scale
  for (let i = 0; i < 15; i++) {
    g.add(box(0.005, 0.001, 0.002, mat(0x111111, 0, 0.9), hgX + 0.015, surfY + 0.04 + i * 0.02, hgZ - 0.009));
  }
  // Fine adjustment wheel
  g.add(cyl(0.015, 0.015, 0.008, 8, darkChrome, hgX - 0.02, surfY + 0.22, hgZ, 0, 0, Math.PI / 2));

  // ═══════════════════════════════════
  // ── Small Parts for Inspection ──
  // ═══════════════════════════════════
  // Cylindrical part
  g.add(cyl(0.015, 0.015, 0.04, 10, partMetal, 0.05, surfY + 0.02, -0.08));
  // Rectangular block
  g.add(box(0.035, 0.015, 0.025, partMetal, 0.12, surfY + 0.0075, -0.05));
  // Ring / washer
  g.add(cyl(0.018, 0.018, 0.005, 12, partBrass, 0.0, surfY + 0.0025, -0.12));
  g.add(cyl(0.008, 0.008, 0.006, 12, graniteSurface, 0.0, surfY + 0.003, -0.12));
  // Small shaft
  g.add(cyl(0.006, 0.006, 0.06, 8, partMetal, -0.08, surfY + 0.003, -0.10, 0, 0, Math.PI / 2));
  // Small gear-like disc
  g.add(cyl(0.02, 0.02, 0.006, 16, partBrass, 0.15, surfY + 0.003, -0.12));

  // ═══════════════════════════════════
  // ── Magnifying Lamp on Articulated Arm ──
  // ═══════════════════════════════════
  const lampBaseX = plateW / 2 - 0.08;
  const lampBaseZ = plateD / 2 - 0.05;

  // Clamp mount
  g.add(box(0.05, 0.04, 0.05, steelFrame, lampBaseX, surfY + 0.02, lampBaseZ));
  // Clamp screw
  g.add(cyl(0.008, 0.008, 0.04, 6, chromeMat, lampBaseX, surfY + 0.01, lampBaseZ + 0.035, Math.PI / 2, 0, 0));

  // Lower arm
  g.add(cyl(0.01, 0.01, 0.28, 8, lightHousing, lampBaseX, surfY + 0.18, lampBaseZ));
  // Joint 1
  g.add(sph(0.015, darkChrome, lampBaseX, surfY + 0.32, lampBaseZ));
  // Middle arm (angled)
  g.add(cyl(0.01, 0.01, 0.25, 8, lightHousing, lampBaseX - 0.06, surfY + 0.43, lampBaseZ - 0.06, -0.3, 0.3, 0));
  // Joint 2
  g.add(sph(0.015, darkChrome, lampBaseX - 0.12, surfY + 0.54, lampBaseZ - 0.12));
  // Upper arm (reaching over plate)
  g.add(cyl(0.01, 0.01, 0.22, 8, lightHousing, lampBaseX - 0.20, surfY + 0.60, lampBaseZ - 0.18, -0.6, 0.2, 0));

  // Lamp head (ring light with magnifier)
  const headX = lampBaseX - 0.28;
  const headY = surfY + 0.58;
  const headZ = lampBaseZ - 0.28;
  // Ring housing
  g.add(cyl(0.06, 0.06, 0.025, 16, lensRim, headX, headY, headZ, Math.PI / 4, 0, 0));
  g.add(cyl(0.055, 0.055, 0.026, 16, mat(0x222222, 0.2, 0.7), headX, headY, headZ, Math.PI / 4, 0, 0));
  // LED ring (emissive)
  g.add(cyl(0.058, 0.058, 0.008, 16, lampGlow, headX, headY, headZ, Math.PI / 4, 0, 0));
  // Magnifying lens
  g.add(cyl(0.05, 0.05, 0.005, 16, lensMat, headX, headY, headZ, Math.PI / 4, 0, 0));

  // ═══════════════════════════════════
  // ── Gauge Block Set (small wooden case) ──
  // ═══════════════════════════════════
  const gbX = 0.25;
  const gbZ = 0.12;
  // Case
  g.add(box(0.10, 0.03, 0.06, caseGreen, gbX, surfY + 0.015, gbZ));
  // Case lid (open, angled)
  g.add(box(0.10, 0.03, 0.005, caseLid, gbX, surfY + 0.045, gbZ + 0.035, -0.8, 0, 0));
  // Gauge blocks inside (row of small shiny blocks)
  for (let i = 0; i < 5; i++) {
    g.add(box(0.015, 0.018, 0.04, chromeMat, gbX - 0.035 + i * 0.018, surfY + 0.015, gbZ - 0.005));
  }
  // Case lining
  g.add(box(0.088, 0.003, 0.048, mat(0x880000, 0, 0.9), gbX, surfY + 0.003, gbZ));
  // Case hinge
  g.add(cyl(0.003, 0.003, 0.06, 6, chromeMat, gbX, surfY + 0.03, gbZ + 0.028, 0, 0, Math.PI / 2));

  // ═══════════════════════════════════
  // ── Caliper (simplified on surface) ──
  // ═══════════════════════════════════
  const calX = -0.15;
  const calZ = 0.15;
  // Main beam
  g.add(box(0.18, 0.005, 0.02, rulerMat, calX, surfY + 0.0025, calZ));
  // Fixed jaw
  g.add(box(0.005, 0.02, 0.04, rulerMat, calX - 0.09, surfY + 0.01, calZ));
  // Movable jaw
  g.add(box(0.005, 0.02, 0.04, steelLight, calX - 0.02, surfY + 0.01, calZ));
  // Depth rod (thin bar extending from end)
  g.add(box(0.06, 0.003, 0.003, rulerMat, calX + 0.12, surfY + 0.002, calZ));
  // Thumb roller
  g.add(cyl(0.008, 0.008, 0.005, 8, darkChrome, calX, surfY + 0.005, calZ - 0.015));
  // Digital readout (small screen)
  g.add(box(0.03, 0.012, 0.015, mat(0x1a2a1a, 0, 0.8), calX - 0.02, surfY + 0.01, calZ - 0.008));
  g.add(box(0.025, 0.008, 0.002, mat(0x003300, 0, 0.5, { emissive: 0x00aa00, emissiveIntensity: 0.8 }), calX - 0.02, surfY + 0.011, calZ - 0.016));
  // Scale markings
  for (let i = 0; i < 12; i++) {
    g.add(box(0.001, 0.003, 0.008, mat(0x111111, 0, 0.9), calX - 0.075 + i * 0.013, surfY + 0.005, calZ + 0.005));
  }

  // ═══════════════════════════════════
  // ── Overhead Task Lighting ──
  // ═══════════════════════════════════
  // Ceiling mount bracket (represents overhead fixture)
  const lightY = surfY + 0.65;
  // Support pole
  g.add(cyl(0.015, 0.015, 0.55, 8, steelFrame, 0, lightY - 0.25, plateD / 2 - 0.02));
  // Horizontal arm
  g.add(box(0.5, 0.025, 0.025, steelFrame, 0, lightY, plateD / 2 - 0.02));
  // Light fixture housing
  g.add(box(0.45, 0.035, 0.10, lightHousing, 0, lightY - 0.03, plateD / 2 - 0.08));
  // Light diffuser (emissive)
  g.add(box(0.42, 0.005, 0.08, lampGlow, 0, lightY - 0.05, plateD / 2 - 0.08));
  // End caps
  g.add(box(0.025, 0.04, 0.105, steelLight, -0.24, lightY - 0.03, plateD / 2 - 0.08));
  g.add(box(0.025, 0.04, 0.105, steelLight, 0.24, lightY - 0.03, plateD / 2 - 0.08));

  // ── Anti-vibration mount pads (under plate at corners) ──
  for (const [px, pz] of [[-plateW / 2 + 0.08, -plateD / 2 + 0.08], [plateW / 2 - 0.08, -plateD / 2 + 0.08], [-plateW / 2 + 0.08, plateD / 2 - 0.08], [plateW / 2 - 0.08, plateD / 2 - 0.08]] as [number, number][]) {
    g.add(cyl(0.03, 0.03, 0.01, 10, rubberPad, px, standH + 0.005, pz));
  }

  return g;
}
