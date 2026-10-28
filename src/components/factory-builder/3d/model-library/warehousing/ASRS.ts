import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildASRS(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const rackSteel = mat(0x4a5565, 0.7, 0.35);
  const beamBlue = mat(0x3060a0, 0.3, 0.5);
  const mastSteel = mat(0x556070, 0.75, 0.3);
  const carriageMat = mat(0xf07020, 0.3, 0.45);
  const railSteel = mat(0x606878, 0.8, 0.2);
  const binBlue = mat(0x2060c0, 0.15, 0.6);
  const binGray = mat(0x708090, 0.15, 0.6);
  const binGreen = mat(0x308040, 0.15, 0.6);
  const cabinetMat = mat(0x505868, 0.5, 0.45);
  const curtainRed = mat(0xcc2222, 0.0, 0.6, { transparent: true, opacity: 0.5 });

  // ── Dimensions ──
  const rackW = 1.6;    // width along aisle (X)
  const rackD = 0.3;    // depth of each side rack (Z)
  const aisleW = 0.35;  // aisle width
  const levels = 5;
  const levelH = 0.25;
  const totalH = levels * levelH + 0.1;
  const uprightW = 0.03;

  // ── Racking - Left and Right sides ──
  for (const side of [-1, 1]) {
    const rz = side * (aisleW / 2 + rackD / 2);

    // Vertical uprights
    for (let i = 0; i <= 6; i++) {
      const rx = -rackW / 2 + i * (rackW / 6);
      g.add(box(uprightW, totalH, uprightW, rackSteel, rx, totalH / 2, rz - side * rackD / 2 + side * uprightW / 2));
      g.add(box(uprightW, totalH, uprightW, rackSteel, rx, totalH / 2, rz + side * rackD / 2 - side * uprightW / 2));

      // Diagonal bracing between uprights (every other bay)
      if (i < 6 && i % 2 === 0) {
        const bLen = Math.sqrt((rackW / 6) ** 2 + levelH ** 2);
        for (let lv = 0; lv < levels; lv++) {
          const midY = (lv + 0.5) * levelH + 0.1;
          const ang = Math.atan2(levelH, rackW / 6);
          g.add(box(0.008, bLen, 0.008, rackSteel, rx + rackW / 12, midY, rz, 0, 0, ang));
        }
      }
    }

    // Horizontal beams at each level
    for (let lv = 1; lv <= levels; lv++) {
      const by = lv * levelH + 0.02;
      // Front and back horizontal beams
      g.add(box(rackW, 0.025, 0.02, beamBlue, 0, by, rz - side * rackD / 2 + side * 0.02));
      g.add(box(rackW, 0.025, 0.02, beamBlue, 0, by, rz + side * rackD / 2 - side * 0.02));
      // Shelf surface
      g.add(box(rackW - 0.02, 0.006, rackD - 0.04, rackSteel, 0, by + 0.015, rz));
    }

    // ── Stored bins/totes on shelves ──
    const binMats = [binBlue, binGray, binGreen, binBlue, binGray];
    for (let lv = 1; lv <= levels; lv++) {
      const by = lv * levelH + 0.04;
      const numBins = lv === 3 ? 4 : 5; // some levels less full
      for (let b = 0; b < numBins; b++) {
        const bx = -rackW / 2 + 0.12 + b * (rackW / 6);
        const binMat = binMats[(lv + b) % binMats.length];
        // Bin body
        g.add(box(0.18, 0.12, rackD - 0.08, binMat, bx, by + 0.06, rz));
        // Bin lip
        g.add(box(0.19, 0.008, rackD - 0.06, binMat, bx, by + 0.124, rz));
        // Label on front
        g.add(box(0.06, 0.03, 0.003, mat(0xffffff, 0, 0.9), bx, by + 0.08, rz - side * rackD / 2 + side * 0.04));
      }
    }
  }

  // ── Floor Rail ──
  g.add(box(rackW + 0.3, 0.02, 0.06, railSteel, 0, 0.01, 0));
  // Rail profile (I-beam flanges)
  g.add(box(rackW + 0.3, 0.008, 0.08, railSteel, 0, 0.004, 0));
  g.add(box(rackW + 0.3, 0.008, 0.08, railSteel, 0, 0.022, 0));
  // Rail mounting bolts
  for (let i = 0; i < 8; i++) {
    const bx = -rackW / 2 - 0.05 + i * (rackW + 0.1) / 7;
    g.add(cyl(0.006, 0.006, 0.01, 6, M.darkChrome, bx, 0.027, -0.03));
    g.add(cyl(0.006, 0.006, 0.01, 6, M.darkChrome, bx, 0.027, 0.03));
  }

  // ── Top Guide Rail ──
  g.add(box(rackW + 0.2, 0.03, 0.04, railSteel, 0, totalH + 0.03, 0));
  // Rail brackets mounting to rack
  for (let i = 0; i < 4; i++) {
    const bx = -rackW / 2 + 0.2 + i * (rackW - 0.4) / 3;
    g.add(box(0.02, 0.06, 0.15, rackSteel, bx, totalH + 0.01, 0));
  }

  // ── Storage/Retrieval Machine (Crane/Stacker) ──
  const craneX = 0.1; // positioned somewhere along aisle
  const craneGroup = new THREE.Group();
  craneGroup.position.set(craneX, 0, 0);

  // Base carriage (travels on floor rail)
  craneGroup.add(box(0.25, 0.04, aisleW - 0.04, mastSteel, 0, 0.05, 0));
  // Wheels on rail
  for (const wx of [-0.08, 0.08]) {
    craneGroup.add(cyl(0.02, 0.02, 0.03, 12, M.darkChrome, wx, 0.035, 0, Math.PI / 2, 0, 0));
    craneGroup.add(cyl(0.02, 0.02, 0.03, 12, M.darkChrome, wx, 0.035, 0, Math.PI / 2, 0, 0));
  }

  // Vertical mast
  craneGroup.add(box(0.06, totalH, 0.06, mastSteel, 0, totalH / 2 + 0.04, 0));
  // Mast reinforcement plates
  for (let h = 0.15; h < totalH; h += 0.3) {
    craneGroup.add(box(0.08, 0.02, 0.08, mastSteel, 0, h, 0));
  }
  // Top guide wheel housing
  craneGroup.add(box(0.08, 0.05, 0.06, mastSteel, 0, totalH + 0.015, 0));
  craneGroup.add(cyl(0.015, 0.015, 0.07, 8, M.darkChrome, 0, totalH + 0.02, 0, 0, 0, Math.PI / 2));

  // ── Shuttle Carriage with telescoping forks ──
  const carriageY = 2 * levelH + 0.08;
  // Carriage body
  craneGroup.add(box(0.12, 0.06, aisleW - 0.06, carriageMat, 0, carriageY, 0));
  // Carriage guide rollers on mast
  for (const dy of [-0.02, 0.02]) {
    craneGroup.add(cyl(0.01, 0.01, 0.07, 8, M.darkChrome, 0, carriageY + dy, 0, 0, 0, Math.PI / 2));
  }
  // Telescoping fork arms (extended to one side)
  const forkZ = aisleW / 2 + 0.03;
  for (const fx of [-0.03, 0.03]) {
    // Inner section
    craneGroup.add(box(0.015, 0.015, 0.15, M.chrome, fx, carriageY - 0.02, forkZ * 0.5));
    // Outer section (extended)
    craneGroup.add(box(0.012, 0.012, 0.12, M.chrome, fx, carriageY - 0.02, forkZ * 0.8));
  }
  // Fork platform
  craneGroup.add(box(0.1, 0.008, 0.08, carriageMat, 0, carriageY - 0.028, forkZ * 0.9));

  // Drive motor housing on base
  craneGroup.add(box(0.08, 0.06, 0.1, M.bodyDark, -0.06, 0.1, 0));
  // Hoist motor at top of mast
  craneGroup.add(box(0.07, 0.06, 0.07, M.bodyDark, 0, totalH - 0.08, 0));
  // Cable from hoist to carriage
  craneGroup.add(cyl(0.004, 0.004, totalH - carriageY - 0.12, 6, M.wire, 0.02, (totalH + carriageY) / 2 - 0.03, 0));

  g.add(craneGroup);

  // ── Pick Station at End (small conveyor segment) ──
  const pickX = rackW / 2 + 0.25;
  // Conveyor frame
  g.add(box(0.3, 0.02, 0.25, M.bodyGray, pickX, 0.32, 0));
  // Side rails
  g.add(box(0.3, 0.05, 0.015, M.bodyGray, pickX, 0.34, -0.12));
  g.add(box(0.3, 0.05, 0.015, M.bodyGray, pickX, 0.34, 0.12));
  // Rollers
  for (let i = 0; i < 7; i++) {
    const rx = pickX - 0.12 + i * 0.04;
    g.add(cyl(0.012, 0.012, 0.22, 8, M.chrome, rx, 0.33, 0, Math.PI / 2, 0, 0));
  }
  // Conveyor legs
  for (const [lx, lz] of [[-0.1, -0.1], [-0.1, 0.1], [0.1, -0.1], [0.1, 0.1]]) {
    g.add(box(0.02, 0.31, 0.02, M.bodyGray, pickX + lx, 0.155, lz));
    g.add(box(0.04, 0.01, 0.04, M.bodyDark, pickX + lx, 0.005, lz));
  }
  // A bin on the pick station
  g.add(box(0.18, 0.12, 0.2, binBlue, pickX, 0.41, 0));

  // ── Control Cabinet on Side ──
  const cabX = rackW / 2 + 0.15;
  const cabZ = aisleW / 2 + rackD + 0.15;
  g.add(box(0.2, 0.5, 0.15, cabinetMat, cabX, 0.25, cabZ));
  // Cabinet door
  g.add(box(0.18, 0.46, 0.005, mat(0x5a6478, 0.55, 0.4), cabX, 0.25, cabZ - 0.076));
  // Door handle
  g.add(box(0.015, 0.06, 0.01, M.chrome, cabX + 0.06, 0.28, cabZ - 0.08));
  // Door lock
  g.add(cyl(0.008, 0.008, 0.01, 8, M.chrome, cabX + 0.06, 0.2, cabZ - 0.08));
  // Screen on door
  g.add(box(0.08, 0.06, 0.006, M.screen, cabX - 0.02, 0.38, cabZ - 0.079));
  // Status LEDs on cabinet
  for (let i = 0; i < 3; i++) {
    g.add(sph(0.006, [M.statusGreen, M.statusYellow, M.statusOff][i], cabX - 0.04 + i * 0.025, 0.45, cabZ - 0.079));
  }
  // Cable conduit from cabinet to rail
  g.add(box(0.02, 0.02, cabZ - 0.08, M.wire, cabX - 0.08, 0.02, cabZ / 2 - 0.04));
  // Ventilation grilles on cabinet sides
  for (let i = 0; i < 5; i++) {
    g.add(box(0.005, 0.03, 0.12, cabinetMat, cabX + 0.101, 0.15 + i * 0.06, cabZ));
  }

  // ── Safety Light Curtain at Entrance ──
  const lcX = rackW / 2 + 0.05;
  // Emitter post
  g.add(box(0.025, 0.5, 0.025, M.bodyDark, lcX, 0.25, aisleW / 2 + 0.02));
  g.add(box(0.018, 0.35, 0.018, curtainRed, lcX, 0.25, aisleW / 2 + 0.02));
  // Receiver post
  g.add(box(0.025, 0.5, 0.025, M.bodyDark, lcX, 0.25, -aisleW / 2 - 0.02));
  g.add(box(0.018, 0.35, 0.018, curtainRed, lcX, 0.25, -aisleW / 2 - 0.02));
  // Light curtain beam indicators
  for (let i = 0; i < 8; i++) {
    const ly = 0.08 + i * 0.05;
    g.add(sph(0.004, M.statusRed, lcX, ly, aisleW / 2 + 0.02));
    g.add(sph(0.004, M.statusRed, lcX, ly, -aisleW / 2 - 0.02));
  }

  // ── Status Light ──
  g.add(createStatusLight(cabX, 0.5, cabZ));

  return g;
}
