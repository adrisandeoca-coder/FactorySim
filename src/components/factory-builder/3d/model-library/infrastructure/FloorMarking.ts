import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildFloorMarking(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const concrete = mat(0x999590, 0.05, 0.92);
  const yellowPaint = mat(0xddbb00, 0.0, 0.7, { emissive: 0x332200, emissiveIntensity: 0.1 });
  const whitePaint = mat(0xeeeeee, 0.0, 0.7);
  const redPaint = mat(0xcc2222, 0.0, 0.65, { emissive: 0x220000, emissiveIntensity: 0.1 });
  const bluePaint = mat(0x2255aa, 0.0, 0.7);
  const greenPaint = mat(0x228844, 0.0, 0.7);
  const orangePaint = mat(0xdd7722, 0.0, 0.7);

  // ── Dimensions ──
  const floorW = 6.0;
  const floorD = 5.0;
  const paintThick = 0.003;  // paint is nearly flush with floor
  const lineW = 0.08;        // standard line width
  const wideLineW = 0.12;    // forklift lane width
  const floorY = 0.0;
  const paintY = floorY + paintThick / 2 + 0.001;

  // ── Floor slab ──
  g.add(box(floorW, 0.04, floorD, concrete, 0, -0.02, 0));

  // Floor surface texture (control joints)
  for (let ix = -floorW / 2 + 1.0; ix < floorW / 2; ix += 1.5) {
    g.add(box(0.005, 0.002, floorD, mat(0x888480, 0.05, 0.95), ix, 0.001, 0));
  }
  for (let iz = -floorD / 2 + 1.0; iz < floorD / 2; iz += 1.5) {
    g.add(box(floorW, 0.002, 0.005, mat(0x888480, 0.05, 0.95), 0, 0.001, iz));
  }

  // ── Yellow Pedestrian Walkway Lines ──
  // Two parallel dashed lines forming a pedestrian walkway along X axis
  const walkZ = -floorD / 2 + 1.0;
  const walkWidth = 1.0;
  // Left boundary line (dashed)
  for (let ix = -floorW / 2 + 0.2; ix < floorW / 2 - 0.2; ix += 0.4) {
    g.add(box(0.25, paintThick, lineW, yellowPaint, ix, paintY, walkZ - walkWidth / 2));
  }
  // Right boundary line (dashed)
  for (let ix = -floorW / 2 + 0.2; ix < floorW / 2 - 0.2; ix += 0.4) {
    g.add(box(0.25, paintThick, lineW, yellowPaint, ix, paintY, walkZ + walkWidth / 2));
  }

  // ── Forklift Lane Markings (wider solid lines) ──
  const forkZ = floorD / 2 - 1.2;
  // Left solid border
  g.add(box(floorW - 0.4, paintThick, wideLineW, yellowPaint, 0, paintY, forkZ - 0.7));
  // Right solid border
  g.add(box(floorW - 0.4, paintThick, wideLineW, yellowPaint, 0, paintY, forkZ + 0.7));
  // Center dashed line
  for (let ix = -floorW / 2 + 0.3; ix < floorW / 2 - 0.3; ix += 0.6) {
    g.add(box(0.35, paintThick, lineW * 0.7, whitePaint, ix, paintY, forkZ));
  }

  // ── Crosshatch Safety Zone (danger area, red/white) ──
  const hazX = -floorW / 2 + 1.2;
  const hazZ = 0.0;
  const hazW = 1.5;
  const hazD = 1.2;
  // Outer red border
  g.add(box(hazW, paintThick, lineW, redPaint, hazX, paintY, hazZ - hazD / 2));
  g.add(box(hazW, paintThick, lineW, redPaint, hazX, paintY, hazZ + hazD / 2));
  g.add(box(lineW, paintThick, hazD, redPaint, hazX - hazW / 2, paintY, hazZ));
  g.add(box(lineW, paintThick, hazD, redPaint, hazX + hazW / 2, paintY, hazZ));
  // Diagonal stripes (crosshatch)
  for (let i = -4; i <= 4; i++) {
    const stripLen = Math.min(hazW, hazD) * 0.85;
    g.add(box(stripLen, paintThick, 0.04, redPaint, hazX + i * 0.15, paintY + 0.0005, hazZ, 0, Math.PI / 4, 0));
    g.add(box(stripLen, paintThick, 0.04, whitePaint, hazX + i * 0.15 + 0.075, paintY + 0.0005, hazZ, 0, Math.PI / 4, 0));
  }
  // Opposite diagonal set
  for (let i = -4; i <= 4; i++) {
    const stripLen = Math.min(hazW, hazD) * 0.85;
    g.add(box(stripLen, paintThick, 0.04, redPaint, hazX + i * 0.15, paintY + 0.001, hazZ, 0, -Math.PI / 4, 0));
  }

  // ── Arrow Direction Markings ──
  // Arrow 1 - pointing right along walkway
  const arrowX1 = 0.0;
  const arrowZ1 = walkZ;
  // Arrow shaft
  g.add(box(0.5, paintThick, 0.06, whitePaint, arrowX1, paintY + 0.001, arrowZ1));
  // Arrow head (two angled bars forming a chevron)
  g.add(box(0.22, paintThick, 0.06, whitePaint, arrowX1 + 0.3, paintY + 0.001, arrowZ1 - 0.1, 0, Math.PI / 6, 0));
  g.add(box(0.22, paintThick, 0.06, whitePaint, arrowX1 + 0.3, paintY + 0.001, arrowZ1 + 0.1, 0, -Math.PI / 6, 0));

  // Arrow 2 - pointing left in forklift lane
  const arrowX2 = 1.0;
  const arrowZ2 = forkZ;
  g.add(box(0.6, paintThick, 0.08, yellowPaint, arrowX2, paintY + 0.001, arrowZ2));
  g.add(box(0.25, paintThick, 0.08, yellowPaint, arrowX2 - 0.35, paintY + 0.001, arrowZ2 - 0.12, 0, -Math.PI / 6, 0));
  g.add(box(0.25, paintThick, 0.08, yellowPaint, arrowX2 - 0.35, paintY + 0.001, arrowZ2 + 0.12, 0, Math.PI / 6, 0));

  // ── "KEEP CLEAR" Text Area ──
  const kcX = hazX;
  const kcZ = hazZ;
  // Background rectangle
  g.add(box(1.0, paintThick, 0.25, yellowPaint, kcX, paintY + 0.002, kcZ));
  // Simplified text bars (representing "KEEP CLEAR")
  g.add(box(0.35, paintThick, 0.08, mat(0x111111, 0.0, 0.9), kcX - 0.15, paintY + 0.003, kcZ + 0.03));
  g.add(box(0.35, paintThick, 0.08, mat(0x111111, 0.0, 0.9), kcX + 0.15, paintY + 0.003, kcZ - 0.03));

  // ── Aisle Number Marking ──
  const aisleX = floorW / 2 - 1.0;
  const aisleZ = -floorD / 2 + 0.3;
  // Blue circle background
  g.add(cyl(0.2, 0.2, paintThick, 16, bluePaint, aisleX, paintY, aisleZ));
  // Number "3" approximation (two horizontal bars + vertical connector)
  g.add(box(0.12, paintThick, 0.03, whitePaint, aisleX + 0.02, paintY + 0.001, aisleZ - 0.08));
  g.add(box(0.12, paintThick, 0.03, whitePaint, aisleX + 0.02, paintY + 0.001, aisleZ));
  g.add(box(0.12, paintThick, 0.03, whitePaint, aisleX + 0.02, paintY + 0.001, aisleZ + 0.08));
  g.add(box(0.03, paintThick, 0.19, whitePaint, aisleX + 0.08, paintY + 0.001, aisleZ));

  // ── Stop Line (red) ──
  const stopZ = walkZ + walkWidth / 2 + 0.15;
  g.add(box(1.2, paintThick, wideLineW, redPaint, 0, paintY, stopZ));
  // "STOP" text bar
  g.add(box(0.5, paintThick, 0.06, whitePaint, 0, paintY + 0.001, stopZ));

  // ── Additional: Green assembly zone marking ──
  const greenX = floorW / 2 - 1.5;
  const greenZ = 0.3;
  // Green bordered rectangle
  g.add(box(1.2, paintThick, lineW, greenPaint, greenX, paintY, greenZ - 0.5));
  g.add(box(1.2, paintThick, lineW, greenPaint, greenX, paintY, greenZ + 0.5));
  g.add(box(lineW, paintThick, 1.0, greenPaint, greenX - 0.6, paintY, greenZ));
  g.add(box(lineW, paintThick, 1.0, greenPaint, greenX + 0.6, paintY, greenZ));
  // Corner dots
  for (const [dx, dz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]] as [number, number][]) {
    g.add(cyl(0.04, 0.04, paintThick, 8, greenPaint, greenX + dx, paintY, greenZ + dz));
  }

  // ── Equipment placement outline (orange dashed) ──
  const eqX = -floorW / 2 + 3.5;
  const eqZ = floorD / 2 - 2.5;
  for (let ix = -0.5; ix <= 0.5; ix += 0.25) {
    g.add(box(0.15, paintThick, lineW * 0.6, orangePaint, eqX + ix, paintY, eqZ - 0.4));
    g.add(box(0.15, paintThick, lineW * 0.6, orangePaint, eqX + ix, paintY, eqZ + 0.4));
  }
  for (let iz = -0.3; iz <= 0.3; iz += 0.25) {
    g.add(box(lineW * 0.6, paintThick, 0.15, orangePaint, eqX - 0.6, paintY, eqZ + iz));
    g.add(box(lineW * 0.6, paintThick, 0.15, orangePaint, eqX + 0.6, paintY, eqZ + iz));
  }

  return g;
}
