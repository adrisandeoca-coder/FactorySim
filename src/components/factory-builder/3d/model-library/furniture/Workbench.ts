import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildWorkbench(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const steelLight = mat(0x6a7080, 0.7, 0.35);
  const woodMaple = mat(0xc89860, 0.0, 0.75);
  const pegboardMat = mat(0xc0a870, 0.0, 0.85);
  const binBlue = mat(0x2255aa, 0.1, 0.6);
  const binGreen = mat(0x228844, 0.1, 0.6);
  const binRed = mat(0xaa2222, 0.1, 0.6);
  const esdMat = mat(0x2a6a4a, 0.0, 0.7);
  const drawerFront = mat(0x505560, 0.6, 0.45);
  const handleMat = mat(0x888888, 0.8, 0.25);
  const viseMat = mat(0x555555, 0.7, 0.4);
  const toolOutline = mat(0x666666, 0.3, 0.6);
  const lightHousing = mat(0xcccccc, 0.5, 0.4);
  const lampGlow = mat(0xffffff, 0.0, 0.3, { emissive: 0xffffdd, emissiveIntensity: 1.5 });

  // ── Dimensions ──
  const benchW = 1.5;
  const benchD = 0.6;
  const benchH = 0.9;
  const topThick = 0.05;
  const legSize = 0.05;

  // ═══════════════════════════════════
  // ── Work Surface (maple top) ──
  // ═══════════════════════════════════
  g.add(box(benchW, topThick, benchD, woodMaple, 0, benchH, 0));

  // ── ESD mat on surface ──
  g.add(box(0.6, 0.004, 0.4, esdMat, 0.1, benchH + topThick / 2 + 0.002, 0));
  // ESD mat grounding snap
  g.add(cyl(0.008, 0.008, 0.006, 8, handleMat, 0.42, benchH + topThick / 2 + 0.005, -0.15));
  // Grounding wire
  g.add(cyl(0.003, 0.003, 0.15, 6, mat(0x00aa00, 0.0, 0.7), 0.45, benchH - 0.05, -0.15, 0.3, 0, Math.PI / 6));

  // ═══════════════════════════════════
  // ── Steel Frame Legs ──
  // ═══════════════════════════════════
  const legPositions: [number, number][] = [
    [-benchW / 2 + 0.05, -benchD / 2 + 0.05],
    [benchW / 2 - 0.05, -benchD / 2 + 0.05],
    [-benchW / 2 + 0.05, benchD / 2 - 0.05],
    [benchW / 2 - 0.05, benchD / 2 - 0.05],
  ];
  for (const [lx, lz] of legPositions) {
    g.add(box(legSize, benchH - topThick, legSize, steelFrame, lx, (benchH - topThick) / 2, lz));
    // Adjustable foot pad
    g.add(cyl(0.025, 0.03, 0.015, 8, steelFrame, lx, 0.008, lz));
  }

  // ── Cross braces (H-frame) ──
  const braceY = benchH * 0.25;
  // Front and back horizontal
  g.add(box(benchW - 0.1, 0.04, 0.03, steelFrame, 0, braceY, -benchD / 2 + 0.05));
  g.add(box(benchW - 0.1, 0.04, 0.03, steelFrame, 0, braceY, benchD / 2 - 0.05));
  // Side braces
  g.add(box(0.03, 0.04, benchD - 0.1, steelFrame, -benchW / 2 + 0.05, braceY, 0));
  g.add(box(0.03, 0.04, benchD - 0.1, steelFrame, benchW / 2 - 0.05, braceY, 0));

  // ═══════════════════════════════════
  // ── Lower Shelf ──
  // ═══════════════════════════════════
  const shelfY = braceY + 0.03;
  g.add(box(benchW - 0.12, 0.02, benchD - 0.12, steelLight, 0, shelfY, 0));

  // ── Parts bins on lower shelf ──
  for (let i = 0; i < 3; i++) {
    const binMats = [binBlue, binGreen, binRed];
    const bx = -0.35 + i * 0.25;
    g.add(box(0.18, 0.10, 0.12, binMats[i], bx, shelfY + 0.07, 0));
    // Bin interior
    g.add(box(0.16, 0.08, 0.10, mat(0x111122, 0.1, 0.8), bx, shelfY + 0.08, 0));
    // Label on front
    g.add(box(0.12, 0.04, 0.002, mat(0xfafafa, 0, 0.9), bx, shelfY + 0.07, -0.061));
  }

  // ═══════════════════════════════════
  // ── Pegboard Back Panel ──
  // ═══════════════════════════════════
  const pbH = 0.6;
  const pbY = benchH + topThick / 2 + pbH / 2;
  g.add(box(benchW - 0.1, pbH, 0.015, pegboardMat, 0, pbY, benchD / 2 - 0.02));

  // Pegboard holes (grid pattern)
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 18; col++) {
      const hx = -0.60 + col * 0.07;
      const hy = pbY - 0.24 + row * 0.07;
      g.add(cyl(0.004, 0.004, 0.016, 6, mat(0x333333, 0, 0.9), hx, hy, benchD / 2 - 0.02));
    }
  }

  // ── Tool outlines / hooks on pegboard ──
  // Wrench outline
  g.add(box(0.03, 0.15, 0.008, toolOutline, -0.5, pbY, benchD / 2 - 0.03));
  g.add(box(0.05, 0.03, 0.008, toolOutline, -0.5, pbY + 0.06, benchD / 2 - 0.03));
  // Hook for wrench
  g.add(cyl(0.006, 0.006, 0.03, 6, steelFrame, -0.5, pbY + 0.08, benchD / 2 - 0.04, Math.PI / 2, 0, 0));

  // Hammer outline
  g.add(box(0.025, 0.18, 0.008, toolOutline, -0.35, pbY - 0.02, benchD / 2 - 0.03));
  g.add(box(0.07, 0.035, 0.008, toolOutline, -0.35, pbY + 0.08, benchD / 2 - 0.03));
  // Hook for hammer
  g.add(cyl(0.006, 0.006, 0.03, 6, steelFrame, -0.35, pbY + 0.10, benchD / 2 - 0.04, Math.PI / 2, 0, 0));

  // Pliers outline
  g.add(box(0.04, 0.14, 0.008, toolOutline, -0.2, pbY - 0.02, benchD / 2 - 0.03));
  g.add(cyl(0.006, 0.006, 0.03, 6, steelFrame, -0.2, pbY + 0.06, benchD / 2 - 0.04, Math.PI / 2, 0, 0));

  // Screwdriver hooks (set of 3)
  for (let i = 0; i < 3; i++) {
    const sx = 0.05 + i * 0.06;
    g.add(box(0.015, 0.12, 0.008, toolOutline, sx, pbY - 0.02, benchD / 2 - 0.03));
    g.add(cyl(0.006, 0.006, 0.025, 6, steelFrame, sx, pbY + 0.04, benchD / 2 - 0.04, Math.PI / 2, 0, 0));
  }

  // ── Pegboard frame ──
  g.add(box(benchW - 0.08, 0.025, 0.02, steelFrame, 0, pbY + pbH / 2, benchD / 2 - 0.02));
  g.add(box(benchW - 0.08, 0.025, 0.02, steelFrame, 0, pbY - pbH / 2, benchD / 2 - 0.02));
  g.add(box(0.025, pbH, 0.02, steelFrame, -benchW / 2 + 0.07, pbY, benchD / 2 - 0.02));
  g.add(box(0.025, pbH, 0.02, steelFrame, benchW / 2 - 0.07, pbY, benchD / 2 - 0.02));

  // ═══════════════════════════════════
  // ── Drawer Unit (right side) ──
  // ═══════════════════════════════════
  const drwX = benchW / 2 - 0.18;
  const drwW = 0.30;
  const drwD = benchD - 0.08;
  const drwTotalH = benchH - topThick - 0.06;

  // Drawer housing
  g.add(box(drwW, drwTotalH, drwD, steelLight, drwX, drwTotalH / 2 + 0.03, 0));

  // Drawer fronts (4 drawers)
  const drawerH = drwTotalH / 4 - 0.01;
  for (let i = 0; i < 4; i++) {
    const dy = 0.03 + drawerH / 2 + i * (drawerH + 0.01);
    // Drawer face
    g.add(box(drwW + 0.01, drawerH - 0.005, 0.005, drawerFront, drwX, dy, -drwD / 2 + 0.005));
    // Handle
    g.add(box(0.08, 0.012, 0.015, handleMat, drwX, dy, -drwD / 2 - 0.005));
    // Label holder
    g.add(box(0.04, 0.02, 0.003, handleMat, drwX + 0.08, dy + drawerH / 2 - 0.03, -drwD / 2 - 0.002));
  }

  // ═══════════════════════════════════
  // ── Bench Vise (left corner) ──
  // ═══════════════════════════════════
  const viseX = -benchW / 2 + 0.12;
  const viseY = benchH + topThick / 2;

  // Vise fixed jaw
  g.add(box(0.08, 0.08, 0.04, viseMat, viseX, viseY + 0.04, -benchD / 2 + 0.06));
  // Vise movable jaw
  g.add(box(0.08, 0.06, 0.03, viseMat, viseX, viseY + 0.035, -benchD / 2 + 0.12));
  // Vise base
  g.add(box(0.10, 0.03, 0.10, viseMat, viseX, viseY + 0.015, -benchD / 2 + 0.09));
  // Vise screw handle
  g.add(cyl(0.008, 0.008, 0.10, 6, handleMat, viseX, viseY + 0.04, -benchD / 2 + 0.15, Math.PI / 2, 0, 0));
  // Screw handle bar
  g.add(cyl(0.006, 0.006, 0.06, 6, handleMat, viseX, viseY + 0.04, -benchD / 2 + 0.20, 0, 0, 0));
  // Vise mounting bolts
  for (const [bx, bz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]] as [number, number][]) {
    g.add(cyl(0.006, 0.006, 0.01, 6, handleMat, viseX + bx, viseY + 0.005, -benchD / 2 + 0.09 + bz));
  }

  // ═══════════════════════════════════
  // ── Task Light on Flexible Arm ──
  // ═══════════════════════════════════
  const lightBaseX = benchW / 2 - 0.08;
  const lightBaseZ = benchD / 2 - 0.05;

  // Clamp base
  g.add(box(0.05, 0.04, 0.05, steelFrame, lightBaseX, benchH + topThick / 2 + 0.02, lightBaseZ));

  // Lower arm segment (vertical)
  g.add(cyl(0.012, 0.012, 0.30, 8, lightHousing, lightBaseX, benchH + 0.22, lightBaseZ));
  // Joint 1
  g.add(sph(0.018, steelFrame, lightBaseX, benchH + 0.37, lightBaseZ));
  // Upper arm segment (angled forward)
  g.add(cyl(0.012, 0.012, 0.30, 8, lightHousing, lightBaseX - 0.08, benchH + 0.50, lightBaseZ - 0.08, -0.4, 0.3, 0));
  // Joint 2
  g.add(sph(0.018, steelFrame, lightBaseX - 0.16, benchH + 0.60, lightBaseZ - 0.16));

  // Light head
  g.add(box(0.18, 0.03, 0.06, lightHousing, lightBaseX - 0.20, benchH + 0.58, lightBaseZ - 0.20));
  // Light surface (emissive)
  g.add(box(0.16, 0.005, 0.05, lampGlow, lightBaseX - 0.20, benchH + 0.565, lightBaseZ - 0.20));
  // Light reflector
  g.add(box(0.17, 0.01, 0.055, steelLight, lightBaseX - 0.20, benchH + 0.59, lightBaseZ - 0.20));

  return g;
}
