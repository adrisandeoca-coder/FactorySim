import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildWorkerAtBench(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const skinMat = M.skin;
  const vestYellow = mat(0xccdd00, 0.0, 0.7);
  const vestStripe = mat(0xdddddd, 0.1, 0.6);
  const pantsMat = mat(0x2a3050, 0.0, 0.85);
  const bootMat = mat(0x1a1a1a, 0.1, 0.9);
  const hardHatYellow = mat(0xf0d000, 0.1, 0.5);
  const glassesMat = mat(0x222222, 0.3, 0.4);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const woodTop = mat(0xb08050, 0.0, 0.8);
  const binBlue = mat(0x2255aa, 0.1, 0.6);
  const toolMetal = mat(0x888888, 0.8, 0.25);
  const rubberMat = mat(0x333333, 0.0, 0.95);
  const lightHousing = mat(0xcccccc, 0.5, 0.4);
  const lampGlow = mat(0xffffff, 0.0, 0.3, { emissive: 0xffffdd, emissiveIntensity: 1.5 });

  // ── Person positioning ──
  const pX = 0;
  const pZ = 0.3;

  // ── Legs ──
  const legH = 0.45;
  const legR = 0.045;
  g.add(cyl(legR, legR, legH, 8, pantsMat, pX - 0.08, legH / 2, pZ));
  g.add(cyl(legR, legR, legH, 8, pantsMat, pX + 0.08, legH / 2, pZ));

  // ── Boots ──
  g.add(box(0.09, 0.06, 0.14, bootMat, pX - 0.08, 0.03, pZ + 0.02));
  g.add(box(0.09, 0.06, 0.14, bootMat, pX + 0.08, 0.03, pZ + 0.02));
  // Steel toe caps
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX - 0.08, 0.04, pZ + 0.08));
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX + 0.08, 0.04, pZ + 0.08));

  // ── Torso ──
  const torsoY = legH + 0.2;
  g.add(box(0.28, 0.36, 0.16, pantsMat, pX, torsoY, pZ));

  // ── Hi-vis vest overlay ──
  g.add(box(0.30, 0.30, 0.17, vestYellow, pX, torsoY + 0.03, pZ));
  // Reflective stripes on vest
  g.add(box(0.31, 0.02, 0.175, vestStripe, pX, torsoY + 0.1, pZ));
  g.add(box(0.31, 0.02, 0.175, vestStripe, pX, torsoY - 0.05, pZ));
  // Vertical vest stripes (front)
  g.add(box(0.02, 0.30, 0.005, vestStripe, pX - 0.08, torsoY + 0.03, pZ - 0.088));
  g.add(box(0.02, 0.30, 0.005, vestStripe, pX + 0.08, torsoY + 0.03, pZ - 0.088));

  // ── Arms ──
  const armLen = 0.32;
  const armR = 0.035;
  // Left arm hanging down
  g.add(cyl(armR, armR, armLen, 8, skinMat, pX - 0.18, torsoY - 0.02, pZ, 0.1, 0, 0));
  // Right arm reaching forward toward bench
  g.add(cyl(armR, armR, armLen, 8, skinMat, pX + 0.18, torsoY + 0.02, pZ - 0.12, 0.9, 0, 0));
  // Right hand (sphere at end of reaching arm)
  g.add(sph(0.03, skinMat, pX + 0.18, torsoY - 0.08, pZ - 0.28));

  // ── Head ──
  const headY = torsoY + 0.3;
  g.add(sph(0.09, skinMat, pX, headY, pZ));

  // ── Neck ──
  g.add(cyl(0.035, 0.035, 0.06, 8, skinMat, pX, torsoY + 0.2, pZ));

  // ── Safety glasses ──
  g.add(box(0.14, 0.02, 0.04, glassesMat, pX, headY + 0.01, pZ - 0.08));
  // Lens tint
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX - 0.03, headY + 0.01, pZ - 0.1));
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX + 0.03, headY + 0.01, pZ - 0.1));

  // ── Hard hat ──
  g.add(cyl(0.10, 0.10, 0.04, 12, hardHatYellow, pX, headY + 0.09, pZ));
  g.add(cyl(0.11, 0.09, 0.06, 12, hardHatYellow, pX, headY + 0.11, pZ));
  // Hat brim
  g.add(cyl(0.12, 0.12, 0.01, 16, hardHatYellow, pX, headY + 0.08, pZ));

  // ═══════════════════════════════════
  // ── Workbench ──
  // ═══════════════════════════════════
  const benchX = 0;
  const benchZ = -0.3;
  const benchW = 1.2;
  const benchD = 0.5;
  const benchH = 0.85;

  // Work surface
  g.add(box(benchW, 0.04, benchD, woodTop, benchX, benchH, benchZ));

  // Bench legs (4)
  for (const [lx, lz] of [[-benchW / 2 + 0.05, -benchD / 2 + 0.05], [benchW / 2 - 0.05, -benchD / 2 + 0.05], [-benchW / 2 + 0.05, benchD / 2 - 0.05], [benchW / 2 - 0.05, benchD / 2 - 0.05]] as [number, number][]) {
    g.add(box(0.05, benchH - 0.04, 0.05, steelFrame, benchX + lx, (benchH - 0.04) / 2, benchZ + lz));
  }

  // Cross braces (front and back)
  g.add(box(benchW - 0.1, 0.04, 0.04, steelFrame, benchX, benchH * 0.3, benchZ - benchD / 2 + 0.05));
  g.add(box(benchW - 0.1, 0.04, 0.04, steelFrame, benchX, benchH * 0.3, benchZ + benchD / 2 - 0.05));
  // Side cross braces
  g.add(box(0.04, 0.04, benchD - 0.1, steelFrame, benchX - benchW / 2 + 0.05, benchH * 0.3, benchZ));
  g.add(box(0.04, 0.04, benchD - 0.1, steelFrame, benchX + benchW / 2 - 0.05, benchH * 0.3, benchZ));

  // ── Parts bin on bench ──
  const binX = benchX - 0.4;
  const binZ = benchZ - 0.1;
  g.add(box(0.15, 0.08, 0.10, binBlue, binX, benchH + 0.06, binZ));
  // Bin interior (dark)
  g.add(box(0.13, 0.06, 0.08, mat(0x112244, 0.1, 0.7), binX, benchH + 0.07, binZ));
  // Small parts in bin
  g.add(box(0.02, 0.02, 0.02, toolMetal, binX - 0.03, benchH + 0.05, binZ));
  g.add(box(0.02, 0.02, 0.02, toolMetal, binX + 0.02, benchH + 0.05, binZ + 0.01));
  g.add(cyl(0.01, 0.01, 0.03, 6, toolMetal, binX + 0.01, benchH + 0.05, binZ - 0.02));

  // ── Tools on bench ──
  // Wrench (flat box with head)
  const wrenchX = benchX + 0.1;
  g.add(box(0.02, 0.008, 0.18, toolMetal, wrenchX, benchH + 0.026, benchZ + 0.05, 0, 0.2, 0));
  g.add(box(0.04, 0.008, 0.03, toolMetal, wrenchX - 0.01, benchH + 0.026, benchZ + 0.14, 0, 0.2, 0));
  // Screwdriver
  const sdX = benchX + 0.25;
  g.add(cyl(0.008, 0.008, 0.12, 6, toolMetal, sdX, benchH + 0.03, benchZ, 0, 0, Math.PI / 2));
  g.add(cyl(0.012, 0.012, 0.06, 8, mat(0xcc4400, 0.0, 0.7), sdX, benchH + 0.03, benchZ + 0.09, 0, 0, Math.PI / 2));

  // ── Anti-fatigue mat on floor ──
  g.add(box(0.8, 0.015, 0.5, rubberMat, pX, 0.0075, pZ));
  // Mat edges (beveled appearance)
  g.add(box(0.82, 0.005, 0.52, mat(0x2a2a2a, 0.0, 0.9), pX, 0.002, pZ));

  // ── Overhead task light ──
  // Mounting arm (vertical)
  g.add(cyl(0.015, 0.015, 0.5, 8, lightHousing, benchX + 0.45, benchH + 0.5, benchZ - benchD / 2 + 0.05));
  // Arm horizontal section
  g.add(box(0.4, 0.02, 0.02, lightHousing, benchX + 0.25, benchH + 0.75, benchZ - benchD / 2 + 0.05));
  // Joint
  g.add(sph(0.02, lightHousing, benchX + 0.45, benchH + 0.75, benchZ - benchD / 2 + 0.05));
  // Light head housing
  g.add(box(0.2, 0.03, 0.08, lightHousing, benchX + 0.05, benchH + 0.72, benchZ - benchD / 2 + 0.05));
  // Light surface (emissive)
  g.add(box(0.18, 0.005, 0.06, lampGlow, benchX + 0.05, benchH + 0.70, benchZ - benchD / 2 + 0.05));

  return g;
}
