import * as THREE from 'three';
import { box, cyl, tor } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildPipeRack(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelGray = mat(0x707880, 0.75, 0.3);
  const steelDark = mat(0x505860, 0.7, 0.35);
  const basePlateMat = mat(0x606060, 0.7, 0.35);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const pipeBlue = mat(0x2266aa, 0.5, 0.4);
  const pipeGreen = mat(0x228844, 0.5, 0.4);
  const pipeOrange = mat(0xdd6622, 0.4, 0.45);
  const pipeSilver = mat(0xaab0b8, 0.7, 0.25);
  const insulationMat = mat(0xccccbb, 0.0, 0.85);
  const insulationWrap = mat(0xbbbbaa, 0.0, 0.9);
  const clampMat = mat(0x666e78, 0.7, 0.35);
  const valveBody = mat(0x556070, 0.7, 0.3);
  const valveWheel = mat(0xcc2222, 0.2, 0.5);
  const cableTrayMat = mat(0x505860, 0.65, 0.4);
  const labelMat = mat(0xeeeeee, 0.0, 0.85);
  const labelText = mat(0x111111, 0.0, 0.9);
  const braceMat = mat(0x606870, 0.7, 0.35);

  // ── Dimensions ──
  const rackH = 3.2;
  const rackW = 2.0;     // span between columns (X)
  const colW = 0.1;
  const beamH = 0.08;
  const pipeY = rackH - 0.1;

  // ── Vertical Support Columns (2) ──
  for (const side of [-1, 1]) {
    const cx = side * rackW / 2;

    // Column web
    g.add(box(0.006, rackH, colW, steelGray, cx, rackH / 2, 0));
    // Column flanges
    g.add(box(colW, rackH, 0.006, steelGray, cx, rackH / 2, -colW / 2 + 0.003));
    g.add(box(colW, rackH, 0.006, steelGray, cx, rackH / 2, colW / 2 - 0.003));

    // Base plate
    g.add(box(0.22, 0.012, 0.22, basePlateMat, cx, 0.006, 0));

    // Anchor bolts (4 per base)
    for (const [dx, dz] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]] as [number, number][]) {
      g.add(cyl(0.006, 0.006, 0.025, 6, boltMat, cx + dx, 0.024, dz));
      g.add(cyl(0.01, 0.01, 0.006, 6, boltMat, cx + dx, 0.015, dz));
    }

    // Column base gussets
    for (const dz of [-0.04, 0.04]) {
      g.add(box(0.004, 0.15, 0.06, steelDark, cx, 0.09, dz));
    }
  }

  // ── Horizontal Cross Beam at top ──
  g.add(box(rackW + colW, beamH, 0.006, steelGray, 0, rackH - beamH / 2, 0));
  g.add(box(0.006, beamH, colW, steelGray, 0, rackH - beamH / 2, 0));
  // Bottom flange of beam
  g.add(box(rackW + colW, 0.006, colW * 0.7, steelGray, 0, rackH - beamH, 0));
  // Top flange
  g.add(box(rackW + colW, 0.006, colW * 0.7, steelGray, 0, rackH, 0));

  // ── Support Bracing (diagonal) ──
  const braceLen = Math.sqrt(rackW ** 2 + (rackH * 0.5) ** 2);
  const braceAngle = Math.atan2(rackH * 0.5, rackW);
  // X-brace in front plane
  g.add(box(braceLen, 0.03, 0.005, braceMat, 0, rackH * 0.25 + rackH * 0.25, 0.04, 0, 0, braceAngle));
  g.add(box(braceLen, 0.03, 0.005, braceMat, 0, rackH * 0.25 + rackH * 0.25, 0.04, 0, 0, -braceAngle));
  // Horizontal strut at mid-height
  g.add(box(rackW, 0.04, 0.005, braceMat, 0, rackH * 0.5, -0.04));

  // ── Pipes running along rack (Z direction through rack) ──
  const pipeLength = 2.4;
  const pipes: { r: number; x: number; y: number; mat: THREE.Material; label: string }[] = [
    { r: 0.04, x: -0.55, y: pipeY, mat: pipeBlue, label: 'CW' },
    { r: 0.05, x: -0.15, y: pipeY, mat: pipeGreen, label: 'CA' },
    { r: 0.03, x: 0.2, y: pipeY, mat: pipeOrange, label: 'HW' },
    { r: 0.06, x: 0.55, y: pipeY - 0.02, mat: pipeSilver, label: 'ST' },
  ];

  for (const p of pipes) {
    // Main pipe body
    g.add(cyl(p.r, p.r, pipeLength, 16, p.mat, p.x, p.y, 0, Math.PI / 2, 0, 0));

    // Pipe supports/clamps (U-bolts) at regular intervals
    for (const cz of [-0.8, 0, 0.8]) {
      // Clamp base plate on beam
      g.add(box(p.r * 2 + 0.03, 0.006, 0.04, clampMat, p.x, p.y - p.r - 0.003, cz));
      // U-clamp arms
      g.add(box(0.005, p.r * 2, 0.02, clampMat, p.x - p.r - 0.005, p.y, cz));
      g.add(box(0.005, p.r * 2, 0.02, clampMat, p.x + p.r + 0.005, p.y, cz));
      // Clamp top bar
      g.add(box(p.r * 2 + 0.02, 0.005, 0.02, clampMat, p.x, p.y + p.r + 0.005, cz));
      // Clamp bolts
      g.add(cyl(0.004, 0.004, 0.015, 6, boltMat, p.x - p.r - 0.005, p.y + p.r + 0.01, cz));
      g.add(cyl(0.004, 0.004, 0.015, 6, boltMat, p.x + p.r + 0.005, p.y + p.r + 0.01, cz));
    }

    // Pipe label/tag
    g.add(box(0.06, 0.03, 0.002, labelMat, p.x, p.y + p.r + 0.018, 0.5));
    g.add(box(0.04, 0.015, 0.002, labelText, p.x, p.y + p.r + 0.018, 0.501));
  }

  // ── Pipe insulation on steam pipe (last pipe, wrapped appearance) ──
  const steamPipe = pipes[3];
  const insR = steamPipe.r + 0.025;
  // Insulation jacket
  g.add(cyl(insR, insR, pipeLength - 0.2, 16, insulationMat, steamPipe.x, steamPipe.y, 0, Math.PI / 2, 0, 0));
  // Insulation wrap bands
  for (let wz = -pipeLength / 2 + 0.15; wz < pipeLength / 2 - 0.1; wz += 0.2) {
    g.add(cyl(insR + 0.003, insR + 0.003, 0.015, 12, insulationWrap, steamPipe.x, steamPipe.y, wz));
  }

  // ── Valve on cold water pipe ──
  const vPipe = pipes[0];
  const vz = -0.3;
  // Valve body
  g.add(box(0.08, 0.08, 0.06, valveBody, vPipe.x, vPipe.y, vz));
  // Valve bonnet (top cylinder)
  g.add(cyl(0.025, 0.025, 0.06, 10, valveBody, vPipe.x, vPipe.y + 0.07, vz));
  // Valve stem
  g.add(cyl(0.006, 0.006, 0.08, 8, boltMat, vPipe.x, vPipe.y + 0.12, vz));
  // Handwheel
  g.add(tor(0.04, 0.006, valveWheel, vPipe.x, vPipe.y + 0.16, vz));
  // Handwheel spokes
  g.add(box(0.08, 0.005, 0.005, valveWheel, vPipe.x, vPipe.y + 0.16, vz));
  g.add(box(0.005, 0.005, 0.08, valveWheel, vPipe.x, vPipe.y + 0.16, vz));
  // Handwheel hub
  g.add(cyl(0.01, 0.01, 0.012, 8, boltMat, vPipe.x, vPipe.y + 0.16, vz));
  // Valve flange bolts
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    const bx2 = vPipe.x + Math.cos(a) * 0.035;
    const by2 = vPipe.y + Math.sin(a) * 0.035;
    g.add(cyl(0.004, 0.004, 0.065, 6, boltMat, bx2, by2, vz - 0.03));
    g.add(cyl(0.004, 0.004, 0.065, 6, boltMat, bx2, by2, vz + 0.03));
  }

  // ── Cable Tray running alongside ──
  const trayY = pipeY - 0.25;
  const trayW = 0.3;
  // Tray bottom
  g.add(box(trayW, 0.003, pipeLength, cableTrayMat, -rackW / 2 + trayW / 2 + 0.05, trayY, 0));
  // Tray sides
  g.add(box(0.003, 0.06, pipeLength, cableTrayMat, -rackW / 2 + 0.05, trayY + 0.03, 0));
  g.add(box(0.003, 0.06, pipeLength, cableTrayMat, -rackW / 2 + trayW + 0.05, trayY + 0.03, 0));
  // Tray rungs
  for (let tz = -pipeLength / 2 + 0.1; tz < pipeLength / 2; tz += 0.15) {
    g.add(box(trayW, 0.003, 0.008, cableTrayMat, -rackW / 2 + trayW / 2 + 0.05, trayY, tz));
  }
  // Cables in tray (3 bundles)
  for (const [dx, col] of [[0.0, 0x222222], [0.08, 0x333366], [-0.08, 0x336633]] as [number, number][]) {
    g.add(cyl(0.015, 0.015, pipeLength - 0.1, 8, mat(col, 0.1, 0.8),
      -rackW / 2 + trayW / 2 + 0.05 + dx, trayY + 0.02, 0, Math.PI / 2, 0, 0));
  }

  // Tray support brackets
  for (const bz of [-0.7, 0, 0.7]) {
    g.add(box(0.15, 0.004, 0.04, steelDark, -rackW / 2 + 0.12, trayY - 0.002, bz));
    g.add(box(0.004, 0.08, 0.04, steelDark, -rackW / 2 + 0.05, trayY - 0.04, bz));
  }

  return g;
}
