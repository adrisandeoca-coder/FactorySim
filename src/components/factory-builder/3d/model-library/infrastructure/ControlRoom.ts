import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildControlRoom(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const steelLight = mat(0x6a7080, 0.7, 0.35);
  const wallPanel = mat(0xd0d0d0, 0.1, 0.7);
  const floorPanel = mat(0x555560, 0.3, 0.6);
  const handrailMat = mat(0x888888, 0.7, 0.3);
  const stairTread = mat(0x505560, 0.6, 0.5);
  const doorFrame = mat(0x555555, 0.6, 0.4);
  const handleMat = mat(0x999999, 0.8, 0.2);
  const deskMat = mat(0x5a5a6a, 0.3, 0.6);
  const whiteboardMat = mat(0xeeeeee, 0.05, 0.7);
  const conduitGray = mat(0x666666, 0.5, 0.5);
  const acUnit = mat(0xcccccc, 0.3, 0.5);
  const fluorescent = mat(0xffffff, 0.0, 0.3, { emissive: 0xeeeeff, emissiveIntensity: 1.8 });
  const extinguisherRed = mat(0xcc0000, 0.15, 0.5);

  // ── Dimensions ──
  const roomW = 3.0;
  const roomD = 2.5;
  const roomH = 2.8;
  const elevH = 1.5; // elevated platform height
  const wallThick = 0.06;
  const frameSize = 0.06;

  // ── Elevated Platform / Floor ──
  g.add(box(roomW, 0.1, roomD, floorPanel, 0, elevH, 0));
  // Floor underside support beams (I-beams)
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.06, 0.15, roomD, steelFrame, i * 0.7, elevH - 0.12, 0));
    g.add(box(0.15, 0.02, roomD, steelFrame, i * 0.7, elevH - 0.19, 0));
    g.add(box(0.15, 0.02, roomD, steelFrame, i * 0.7, elevH - 0.05, 0));
  }
  // Cross beams
  for (let j = -2; j <= 2; j++) {
    g.add(box(roomW, 0.05, 0.04, steelFrame, 0, elevH - 0.12, j * 0.55));
  }
  // Support columns (4 corners + 2 mid)
  const colPositions = [
    [-roomW / 2 + 0.06, -roomD / 2 + 0.06],
    [roomW / 2 - 0.06, -roomD / 2 + 0.06],
    [-roomW / 2 + 0.06, roomD / 2 - 0.06],
    [roomW / 2 - 0.06, roomD / 2 - 0.06],
    [0, -roomD / 2 + 0.06],
    [0, roomD / 2 - 0.06],
  ];
  for (const [cx, cz] of colPositions) {
    g.add(box(0.08, elevH, 0.08, steelFrame, cx, elevH / 2, cz));
    // Column base plate
    g.add(box(0.14, 0.01, 0.14, steelFrame, cx, 0.005, cz));
  }

  // ── Steel Frame (room skeleton) ──
  // Vertical corner posts
  const corners = [
    [-roomW / 2, -roomD / 2],
    [roomW / 2, -roomD / 2],
    [-roomW / 2, roomD / 2],
    [roomW / 2, roomD / 2],
  ];
  for (const [cx, cz] of corners) {
    g.add(box(frameSize, roomH, frameSize, steelFrame, cx, elevH + roomH / 2, cz));
  }
  // Top horizontal frame
  for (const cz of [-roomD / 2, roomD / 2]) {
    g.add(box(roomW, frameSize, frameSize, steelFrame, 0, elevH + roomH, cz));
  }
  for (const cx of [-roomW / 2, roomW / 2]) {
    g.add(box(frameSize, frameSize, roomD, steelFrame, cx, elevH + roomH, 0));
  }
  // Mid-height horizontal frame (window divider)
  const windowDivY = elevH + roomH * 0.45;
  for (const cz of [-roomD / 2, roomD / 2]) {
    g.add(box(roomW, 0.04, 0.04, steelLight, 0, windowDivY, cz));
  }
  for (const cx of [-roomW / 2, roomW / 2]) {
    g.add(box(0.04, 0.04, roomD, steelLight, cx, windowDivY, 0));
  }

  // ── Glass Panels (all 4 sides with steel mullions) ──
  const glassH_upper = roomH - roomH * 0.45 - frameSize;
  const glassH_lower = roomH * 0.45 - frameSize - 0.3;
  // Front wall (Z negative) - large windows
  const frontPanelCount = 5;
  const panelW = (roomW - frameSize * 2) / frontPanelCount;
  for (let i = 0; i < frontPanelCount; i++) {
    const px = -roomW / 2 + frameSize + panelW / 2 + i * panelW;
    // Upper glass
    g.add(box(panelW - 0.02, glassH_upper, 0.008, M.glass, px, windowDivY + glassH_upper / 2 + 0.02, -roomD / 2));
    // Lower glass
    g.add(box(panelW - 0.02, glassH_lower, 0.008, M.glass, px, elevH + 0.3 + glassH_lower / 2, -roomD / 2));
    // Vertical mullion
    if (i > 0) {
      g.add(box(0.025, roomH - 0.1, 0.03, steelLight, px - panelW / 2, elevH + roomH / 2, -roomD / 2));
    }
  }
  // Lower solid kick panel (front)
  g.add(box(roomW - frameSize * 2, 0.3, wallThick, wallPanel, 0, elevH + 0.15, -roomD / 2));

  // Back wall
  for (let i = 0; i < frontPanelCount; i++) {
    const px = -roomW / 2 + frameSize + panelW / 2 + i * panelW;
    g.add(box(panelW - 0.02, glassH_upper, 0.008, M.glass, px, windowDivY + glassH_upper / 2 + 0.02, roomD / 2));
    g.add(box(panelW - 0.02, glassH_lower, 0.008, M.glass, px, elevH + 0.3 + glassH_lower / 2, roomD / 2));
    if (i > 0) {
      g.add(box(0.025, roomH - 0.1, 0.03, steelLight, px - panelW / 2, elevH + roomH / 2, roomD / 2));
    }
  }
  g.add(box(roomW - frameSize * 2, 0.3, wallThick, wallPanel, 0, elevH + 0.15, roomD / 2));

  // Side walls (left and right)
  const sidePanelCount = 4;
  const sidePanelD = (roomD - frameSize * 2) / sidePanelCount;
  for (const sx of [-roomW / 2, roomW / 2]) {
    for (let i = 0; i < sidePanelCount; i++) {
      const pz = -roomD / 2 + frameSize + sidePanelD / 2 + i * sidePanelD;
      g.add(box(0.008, glassH_upper, sidePanelD - 0.02, M.glass, sx, windowDivY + glassH_upper / 2 + 0.02, pz));
      g.add(box(0.008, glassH_lower, sidePanelD - 0.02, M.glass, sx, elevH + 0.3 + glassH_lower / 2, pz));
      if (i > 0) {
        g.add(box(0.03, roomH - 0.1, 0.025, steelLight, sx, elevH + roomH / 2, pz - sidePanelD / 2));
      }
    }
    g.add(box(wallThick, 0.3, roomD - frameSize * 2, wallPanel, sx, elevH + 0.15, 0));
  }

  // ── Door (front wall, right side) ──
  const doorX = roomW / 2 - 0.5;
  const doorY = elevH + 0.05;
  const doorWd = 0.8;
  const doorHt = 2.1;
  // Door frame
  g.add(box(0.04, doorHt, 0.07, doorFrame, doorX - doorWd / 2, doorY + doorHt / 2, -roomD / 2));
  g.add(box(0.04, doorHt, 0.07, doorFrame, doorX + doorWd / 2, doorY + doorHt / 2, -roomD / 2));
  g.add(box(doorWd + 0.04, 0.04, 0.07, doorFrame, doorX, doorY + doorHt, -roomD / 2));
  // Door panel
  g.add(box(doorWd - 0.04, doorHt - 0.06, 0.04, steelLight, doorX, doorY + doorHt / 2, -roomD / 2));
  // Door glass insert (upper portion)
  g.add(box(doorWd - 0.15, doorHt * 0.35, 0.005, M.glass, doorX, doorY + doorHt * 0.7, -roomD / 2 - 0.025));
  // Door handle
  g.add(cyl(0.01, 0.01, 0.12, 8, handleMat, doorX - 0.25, doorY + doorHt * 0.45, -roomD / 2 - 0.05));
  g.add(cyl(0.015, 0.015, 0.03, 8, handleMat, doorX - 0.25, doorY + doorHt * 0.45, -roomD / 2 - 0.035, Math.PI / 2, 0, 0));
  g.add(cyl(0.015, 0.015, 0.03, 8, handleMat, doorX - 0.25, doorY + doorHt * 0.45, -roomD / 2 - 0.065, Math.PI / 2, 0, 0));

  // ── Steel Staircase with Handrail ──
  const stairW = 0.9;
  const stairRise = elevH;
  const stairRun = 2.0;
  const stairX = roomW / 2 + 0.1;
  const stepCount = 8;
  const stepH = stairRise / stepCount;
  const stepD = stairRun / stepCount;

  // Stair stringers (side beams)
  const stairLen = Math.sqrt(stairRise * stairRise + stairRun * stairRun);
  const stairAngle = Math.atan2(stairRise, stairRun);
  for (const sz of [-stairW / 2, stairW / 2]) {
    g.add(box(0.04, stairLen, 0.08, steelFrame,
      stairX + stairRun / 2, stairRise / 2, -roomD / 2 + sz,
      -stairAngle, 0, 0));
  }

  // Steps (treads)
  for (let s = 0; s < stepCount; s++) {
    const sy = (s + 1) * stepH;
    const sz = -roomD / 2;
    const sx = stairX + stairRun - s * stepD;
    // Tread (diamond plate)
    g.add(box(stairW - 0.06, 0.025, stepD - 0.02, stairTread, sx - stepD / 2, sy - 0.01, sz));
    // Nosing
    g.add(box(stairW - 0.06, 0.01, 0.02, M.yellow, sx - stepD + 0.01, sy, sz));
  }

  // Handrails
  for (const sz of [-stairW / 2, stairW / 2]) {
    // Rail posts
    for (let s = 0; s <= stepCount; s += 2) {
      const sy = s * stepH;
      const sx = stairX + stairRun - s * stepD;
      g.add(cyl(0.015, 0.015, 1.0, 8, handrailMat, sx, sy + 0.5, -roomD / 2 + sz));
    }
    // Top rail
    g.add(cyl(0.02, 0.02, stairLen + 0.2, 8, handrailMat,
      stairX + stairRun / 2, stairRise / 2 + 0.95, -roomD / 2 + sz,
      -stairAngle, 0, 0));
    // Mid rail
    g.add(cyl(0.015, 0.015, stairLen + 0.1, 8, handrailMat,
      stairX + stairRun / 2, stairRise / 2 + 0.5, -roomD / 2 + sz,
      -stairAngle, 0, 0));
  }

  // Landing platform at top
  g.add(box(1.0, 0.08, stairW + 0.1, steelFrame, stairX + 0.1, elevH - 0.04, -roomD / 2));

  // ── Desk inside (visible through glass) ──
  const deskX = -0.5;
  const deskZ = 0.3;
  const deskY = elevH + 0.75;
  g.add(box(1.4, 0.04, 0.65, deskMat, deskX, deskY, deskZ));
  // Desk legs
  for (const [dx, dz] of [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]] as [number, number][]) {
    g.add(box(0.04, 0.7, 0.04, steelFrame, deskX + dx, elevH + 0.39, deskZ + dz));
  }
  // Desk modesty panel
  g.add(box(1.3, 0.45, 0.02, steelLight, deskX, elevH + 0.5, deskZ - 0.27));
  // Cable tray under desk
  g.add(box(0.8, 0.04, 0.08, steelFrame, deskX, elevH + 0.15, deskZ));

  // ── Multiple Monitors on desk ──
  for (let mi = -1; mi <= 1; mi++) {
    const mx = deskX + mi * 0.38;
    // Screen
    g.add(box(0.32, 0.2, 0.015, M.bodyDark, mx, deskY + 0.2, deskZ - 0.15));
    // Screen face (emissive)
    g.add(box(0.28, 0.17, 0.005, M.screenActive, mx, deskY + 0.2, deskZ - 0.16));
    // Stand neck
    g.add(box(0.03, 0.08, 0.03, M.darkChrome, mx, deskY + 0.06, deskZ - 0.15));
    // Stand base
    g.add(box(0.12, 0.01, 0.08, M.darkChrome, mx, deskY + 0.01, deskZ - 0.15));
  }

  // Keyboard
  g.add(box(0.3, 0.01, 0.1, M.bodyDark, deskX, deskY + 0.02, deskZ + 0.05));
  // Mouse
  g.add(box(0.05, 0.015, 0.08, M.bodyDark, deskX + 0.4, deskY + 0.02, deskZ + 0.05));
  // Mouse pad
  g.add(box(0.2, 0.003, 0.18, mat(0x222233, 0, 0.9), deskX + 0.4, deskY + 0.005, deskZ + 0.05));

  // Office chair (simplified)
  const chairX = deskX;
  const chairZ = deskZ + 0.55;
  g.add(box(0.4, 0.04, 0.4, mat(0x2a2a3a, 0, 0.8), chairX, elevH + 0.48, chairZ));
  g.add(box(0.38, 0.4, 0.04, mat(0x2a2a3a, 0, 0.8), chairX, elevH + 0.7, chairZ + 0.18, -0.1, 0, 0));
  g.add(cyl(0.02, 0.02, 0.35, 6, M.darkChrome, chairX, elevH + 0.28, chairZ));
  // Chair base (star pattern)
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    g.add(box(0.22, 0.02, 0.03, M.darkChrome, chairX + Math.cos(angle) * 0.12, elevH + 0.09, chairZ + Math.sin(angle) * 0.12, 0, angle, 0));
    // Caster
    g.add(sph(0.02, M.rubber, chairX + Math.cos(angle) * 0.22, elevH + 0.06, chairZ + Math.sin(angle) * 0.22));
  }

  // ── Air Conditioning Unit on roof ──
  const acX = 0.5;
  const acZ = 0;
  const acY = elevH + roomH + 0.05;
  g.add(box(0.6, 0.25, 0.4, acUnit, acX, acY + 0.125, acZ));
  // AC fan grille
  g.add(cyl(0.12, 0.12, 0.01, 16, mat(0x999999, 0.5, 0.4), acX, acY + 0.26, acZ));
  // Fan blades (visible through grille)
  for (let b = 0; b < 4; b++) {
    const angle = (b / 4) * Math.PI * 2;
    g.add(box(0.08, 0.005, 0.02, steelLight, acX + Math.cos(angle) * 0.05, acY + 0.27, acZ + Math.sin(angle) * 0.05, 0, angle, 0));
  }
  // AC conduit / refrigerant lines
  g.add(cyl(0.02, 0.02, 0.3, 8, conduitGray, acX - 0.2, acY - 0.05, acZ, 0, 0, Math.PI / 2));

  // ── Cable Entry Conduit going down ──
  const condX = -roomW / 2 - 0.04;
  for (let ci = 0; ci < 3; ci++) {
    const cz = -0.4 + ci * 0.3;
    g.add(cyl(0.025, 0.025, elevH + roomH * 0.3, 8, conduitGray, condX, (elevH + roomH * 0.3) / 2, cz));
    // Conduit clamps
    for (let ch = 0.3; ch < elevH; ch += 0.4) {
      g.add(cyl(0.03, 0.03, 0.02, 8, steelFrame, condX, ch, cz));
    }
  }
  // Conduit junction box
  g.add(box(0.15, 0.1, 0.3, steelLight, condX, elevH + 0.3, -0.1));

  // ── Interior Fluorescent Light (emissive strip) ──
  for (const lz of [-0.4, 0.4]) {
    g.add(box(1.8, 0.02, 0.12, fluorescent, 0, elevH + roomH - 0.08, lz));
    // Light fixture housing
    g.add(box(1.85, 0.04, 0.14, steelLight, 0, elevH + roomH - 0.06, lz));
  }

  // ── Whiteboard on back wall (inside) ──
  g.add(box(0.8, 0.5, 0.02, whiteboardMat, -0.6, elevH + roomH * 0.55, roomD / 2 - 0.04));
  // Whiteboard frame
  g.add(box(0.82, 0.02, 0.025, steelLight, -0.6, elevH + roomH * 0.55 + 0.26, roomD / 2 - 0.04));
  g.add(box(0.82, 0.02, 0.025, steelLight, -0.6, elevH + roomH * 0.55 - 0.26, roomD / 2 - 0.04));
  g.add(box(0.02, 0.5, 0.025, steelLight, -0.6 - 0.41, elevH + roomH * 0.55, roomD / 2 - 0.04));
  g.add(box(0.02, 0.5, 0.025, steelLight, -0.6 + 0.41, elevH + roomH * 0.55, roomD / 2 - 0.04));
  // Marker tray
  g.add(box(0.4, 0.015, 0.04, steelLight, -0.6, elevH + roomH * 0.55 - 0.28, roomD / 2 - 0.05));
  // Markers
  for (let mk = 0; mk < 3; mk++) {
    g.add(cyl(0.006, 0.006, 0.08, 6,
      mk === 0 ? M.red : mk === 1 ? M.blue : M.bodyDark,
      -0.7 + mk * 0.05, elevH + roomH * 0.55 - 0.27, roomD / 2 - 0.05, 0, 0, Math.PI / 2));
  }

  // ── Fire Extinguisher by door ──
  const feX = doorX + doorWd / 2 + 0.15;
  const feY = elevH + 0.9;
  // Wall bracket
  g.add(box(0.04, 0.08, 0.03, steelFrame, feX, feY + 0.25, -roomD / 2 + 0.04));
  // Extinguisher body
  g.add(cyl(0.04, 0.04, 0.35, 10, extinguisherRed, feX, feY, -roomD / 2 + 0.06));
  // Extinguisher top valve
  g.add(cyl(0.02, 0.03, 0.04, 8, M.darkChrome, feX, feY + 0.19, -roomD / 2 + 0.06));
  // Handle
  g.add(box(0.015, 0.06, 0.04, M.darkChrome, feX + 0.02, feY + 0.2, -roomD / 2 + 0.06));
  // Hose
  g.add(cyl(0.008, 0.008, 0.15, 6, M.rubber, feX + 0.04, feY + 0.12, -roomD / 2 + 0.06, 0.5, 0, 0));
  // Nozzle
  g.add(cyl(0.005, 0.01, 0.04, 6, M.darkChrome, feX + 0.06, feY + 0.05, -roomD / 2 + 0.06));
  // Label
  g.add(box(0.04, 0.06, 0.003, mat(0xeeeeee, 0, 0.8), feX, feY, -roomD / 2 + 0.02));

  // ── Roof Panel ──
  g.add(box(roomW + 0.1, 0.04, roomD + 0.1, steelLight, 0, elevH + roomH + 0.02, 0));

  return g;
}
