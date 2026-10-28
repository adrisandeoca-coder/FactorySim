import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Vertical Spiral / Helix Conveyor
 * Central column with spiral belt track going up ~2 turns,
 * inner/outer guide rails, drive unit at bottom, entry/exit points,
 * support frame/base, safety guards, status light on top.
 * Footprint: ~1.4 x 1.4 units, height ~1.6 units
 */
export function buildSpiralConveyor(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mColumn   = mat(0x3e4855, 0.75, 0.35);   // central column steel
  const mBelt     = mat(0x1a1e22, 0.10, 0.85);   // belt surface
  const mFrame    = mat(0x4a5060, 0.75, 0.35);   // frame steel
  const mRail     = mat(0xddaa00, 0.20, 0.55);   // guide rails (safety yellow)
  const mMotor    = mat(0x2c3040, 0.60, 0.50);   // motor housing

  const mBase     = mat(0x3a4050, 0.70, 0.40);   // base plate
  const mFoot     = mat(0x404550, 0.65, 0.50);   // feet

  // Dimensions
  const columnR   = 0.08;   // central column radius
  const innerR    = 0.18;   // inner edge of belt track
  const outerR    = 0.50;   // outer edge of belt track
  const totalH    = 1.30;   // total spiral height (rise)
  const turns     = 2;      // number of full turns
  const segments  = 48;     // segments per turn (smoothness)
  const totalSegs = segments * turns;
  const beltW     = outerR - innerR; // belt width
  const baseY     = 0.12;   // height of base platform

  // === Base Frame / Support Structure ===
  // Base plate
  g.add(box(1.2, 0.03, 1.2, mBase, 0, 0.015, 0));
  // Reinforcement ribs on base
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(box(1.0, 0.025, 0.03, mBase,
      Math.cos(angle) * 0.25, 0.04, Math.sin(angle) * 0.25,
      0, angle, 0));
  }

  // Adjustable feet (4 corners)
  const footPositions: [number, number][] = [
    [-0.50, -0.50], [-0.50, 0.50], [0.50, -0.50], [0.50, 0.50]
  ];
  for (const [fx, fz] of footPositions) {
    g.add(cyl(0.025, 0.03, 0.012, 8, mFoot, fx, 0.006, fz));
    g.add(cyl(0.008, 0.008, 0.025, 6, M.chrome, fx, 0.02, fz));
  }

  // === Central Column / Support Structure ===
  g.add(cyl(columnR, columnR, totalH + baseY + 0.10, 16, mColumn,
    0, (totalH + baseY + 0.10) / 2, 0));
  // Column flange at base
  g.add(cyl(columnR + 0.04, columnR + 0.04, 0.02, 16, mFrame, 0, baseY, 0));
  // Column flange at top
  g.add(cyl(columnR + 0.03, columnR + 0.03, 0.02, 16, mFrame,
    0, totalH + baseY + 0.05, 0));
  // Column bolts at base (8)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    g.add(cyl(0.006, 0.006, 0.015, 6, M.chrome,
      Math.cos(angle) * (columnR + 0.025), baseY + 0.01,
      Math.sin(angle) * (columnR + 0.025)));
  }

  // === Spiral Belt Track (built from segments) ===
  for (let i = 0; i < totalSegs; i++) {
    const angle = (i / totalSegs) * Math.PI * 2 * turns;
    const nextAngle = ((i + 1) / totalSegs) * Math.PI * 2 * turns;
    const midAngle = (angle + nextAngle) / 2;
    const y = baseY + 0.06 + (i / totalSegs) * totalH;

    const midR = (innerR + outerR) / 2;
    const cx = Math.cos(midAngle) * midR;
    const cz = Math.sin(midAngle) * midR;

    // Belt segment (flat slat)
    const segLen = 2 * midR * Math.sin(Math.PI / totalSegs) * 1.05;
    g.add(box(segLen, 0.006, beltW, mBelt,
      cx, y, cz, 0, midAngle + Math.PI / 2, 0));

    // Support bracket underneath belt (every 4th segment)
    if (i % 4 === 0) {
      // Radial support arm from column to track
      g.add(box(outerR - columnR - 0.02, 0.015, 0.02, mFrame,
        Math.cos(midAngle) * ((innerR + columnR) / 2 + 0.05), y - 0.015,
        Math.sin(midAngle) * ((innerR + columnR) / 2 + 0.05),
        0, midAngle + Math.PI / 2, 0));
    }

    // Outer edge lip (every 2nd segment)
    if (i % 2 === 0) {
      const ox = Math.cos(midAngle) * (outerR - 0.01);
      const oz = Math.sin(midAngle) * (outerR - 0.01);
      g.add(box(segLen * 0.9, 0.02, 0.005, mFrame,
        ox, y + 0.01, oz, 0, midAngle + Math.PI / 2, 0));
    }
  }

  // === Inner Guide Rail (along spiral) ===
  for (let i = 0; i < totalSegs; i += 3) {
    const angle = (i / totalSegs) * Math.PI * 2 * turns;
    const nextAngle = ((i + 3) / totalSegs) * Math.PI * 2 * turns;
    const midAngle = (angle + nextAngle) / 2;
    const y = baseY + 0.06 + (i / totalSegs) * totalH;

    const ix = Math.cos(midAngle) * (innerR + 0.01);
    const iz = Math.sin(midAngle) * (innerR + 0.01);
    const segLen = 2 * (innerR + 0.01) * Math.sin(1.5 * Math.PI / totalSegs) * 1.1;

    // Inner rail
    g.add(cyl(0.008, 0.008, segLen, 4, mRail,
      ix, y + 0.035, iz, Math.PI / 2, midAngle + Math.PI / 2, 0));
  }

  // === Outer Guide Rail (along spiral) ===
  for (let i = 0; i < totalSegs; i += 3) {
    const angle = (i / totalSegs) * Math.PI * 2 * turns;
    const nextAngle = ((i + 3) / totalSegs) * Math.PI * 2 * turns;
    const midAngle = (angle + nextAngle) / 2;
    const y = baseY + 0.06 + (i / totalSegs) * totalH;

    const ox = Math.cos(midAngle) * (outerR - 0.01);
    const oz = Math.sin(midAngle) * (outerR - 0.01);
    const segLen = 2 * (outerR - 0.01) * Math.sin(1.5 * Math.PI / totalSegs) * 1.1;

    // Outer rail
    g.add(cyl(0.008, 0.008, segLen, 4, mRail,
      ox, y + 0.035, oz, Math.PI / 2, midAngle + Math.PI / 2, 0));
  }

  // === Outer Rail Vertical Posts (support for outer rail) ===
  for (let i = 0; i < totalSegs; i += 8) {
    const angle = (i / totalSegs) * Math.PI * 2 * turns;
    const y = baseY + 0.06 + (i / totalSegs) * totalH;
    const ox = Math.cos(angle) * (outerR + 0.01);
    const oz = Math.sin(angle) * (outerR + 0.01);
    g.add(cyl(0.008, 0.008, 0.06, 6, mRail, ox, y + 0.01, oz));
  }

  // === Drive Unit at Bottom ===
  // Drive drum (at entry, angle 0)
  g.add(cyl(0.04, 0.04, beltW, 12, M.darkChrome,
    (innerR + outerR) / 2, baseY + 0.06, 0, 0, 0, Math.PI / 2));

  // Motor housing
  g.add(cyl(0.07, 0.07, 0.18, 12, mMotor,
    outerR + 0.12, 0.09, 0));
  // Motor shaft
  g.add(cyl(0.015, 0.015, 0.05, 8, M.chrome,
    outerR + 0.12, 0.19, 0));
  // Motor end cap
  g.add(cyl(0.073, 0.073, 0.01, 12, mFrame,
    outerR + 0.12, 0.005, 0));
  // Motor fan shroud
  g.add(cyl(0.068, 0.068, 0.03, 12, mat(0x333338, 0.5, 0.6),
    outerR + 0.12, 0.015, 0));
  // Gear reducer
  g.add(box(0.10, 0.08, 0.08, mMotor,
    outerR + 0.04, 0.09, 0));
  // Drive coupling
  g.add(cyl(0.03, 0.03, 0.04, 10, M.darkChrome,
    outerR - 0.01, 0.09, 0, 0, 0, Math.PI / 2));
  // Motor junction box
  g.add(box(0.04, 0.035, 0.04, mMotor,
    outerR + 0.17, 0.12, 0));
  // Power cable
  g.add(cyl(0.008, 0.008, 0.20, 6, M.wire,
    outerR + 0.17, 0.12, -0.12, Math.PI / 2, 0, 0));

  // === Entry Point (bottom, tangential) ===
  // Short infeed section
  g.add(box(0.30, 0.006, beltW, mBelt,
    outerR / 2 + 0.30, baseY + 0.06, 0));
  // Infeed side rails
  g.add(cyl(0.006, 0.006, 0.30, 4, mRail,
    outerR / 2 + 0.30, baseY + 0.10, -beltW / 2 - 0.01));
  g.add(cyl(0.006, 0.006, 0.30, 4, mRail,
    outerR / 2 + 0.30, baseY + 0.10, beltW / 2 + 0.01));

  // === Exit Point (top, tangential) ===
  const exitY = baseY + 0.06 + totalH;
  const exitAngle = Math.PI * 2 * turns;
  const exitX = Math.cos(exitAngle) * (innerR + outerR) / 2;
  const exitZ = Math.sin(exitAngle) * (innerR + outerR) / 2;
  // Short outfeed section
  g.add(box(0.30, 0.006, beltW, mBelt,
    exitX + 0.20, exitY, exitZ));
  // Outfeed side rails
  g.add(cyl(0.006, 0.006, 0.30, 4, mRail,
    exitX + 0.20, exitY + 0.04, exitZ - beltW / 2 - 0.01));
  g.add(cyl(0.006, 0.006, 0.30, 4, mRail,
    exitX + 0.20, exitY + 0.04, exitZ + beltW / 2 + 0.01));

  // === Safety Guards (outer perimeter mesh panels) ===
  // Vertical guard posts around the outside
  const guardR = outerR + 0.06;
  const guardPosts = 12;
  for (let i = 0; i < guardPosts; i++) {
    const angle = (i / guardPosts) * Math.PI * 2;
    const gx = Math.cos(angle) * guardR;
    const gz = Math.sin(angle) * guardR;
    g.add(cyl(0.01, 0.01, totalH + baseY + 0.15, 6, mFrame,
      gx, (totalH + baseY + 0.15) / 2, gz));
  }
  // Guard horizontal rings (3 levels)
  for (let level = 0; level < 3; level++) {
    const ry = 0.15 + level * (totalH + baseY) / 2.5;
    for (let i = 0; i < 24; i++) {
      const angle1 = (i / 24) * Math.PI * 2;
      const angle2 = ((i + 1) / 24) * Math.PI * 2;
      const midA = (angle1 + angle2) / 2;
      const segLen = 2 * guardR * Math.sin(Math.PI / 24);
      g.add(cyl(0.006, 0.006, segLen, 4, mFrame,
        Math.cos(midA) * guardR, ry,
        Math.sin(midA) * guardR,
        Math.PI / 2, midA + Math.PI / 2, 0));
    }
  }

  // Guard mesh panels (simplified as semi-transparent boxes)
  const meshMat = mat(0x888888, 0.4, 0.5, { transparent: true, opacity: 0.15, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const midAngle = angle + Math.PI / 12;
    const gx = Math.cos(midAngle) * guardR;
    const gz = Math.sin(midAngle) * guardR;
    const panelW = 2 * guardR * Math.sin(Math.PI / 12);
    g.add(box(panelW, totalH + baseY, 0.003, meshMat,
      gx, (totalH + baseY) / 2 + 0.08, gz, 0, midAngle + Math.PI / 2, 0));
  }

  // === Status Light on Top ===
  g.add(createStatusLight(0, totalH + baseY + 0.10, 0));

  return g;
}
