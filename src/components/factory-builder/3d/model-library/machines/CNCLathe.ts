import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildCNCLathe(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const sheetMetal = mat(0x4a5868, 0.65, 0.45);
  const castIron = mat(0x353a42, 0.6, 0.55);
  const doorFrame = mat(0x505a68, 0.7, 0.35);
  const chuckSteel = mat(0x8090a0, 0.85, 0.2);
  const coolantBlue = mat(0x225588, 0.1, 0.5, { transparent: true, opacity: 0.6 });
  const chipConveyor = mat(0x556070, 0.6, 0.5);
  const controlGray = mat(0x444c58, 0.5, 0.5);
  const buttonGreen = mat(0x00aa44, 0.2, 0.5);
  const bellowsBlack = mat(0x1a1c20, 0.05, 0.85);

  // ====== SLANT-BED MACHINE BODY ======
  const baseW = 2.2;
  const baseD = 1.4;
  const baseH = 0.6;
  // Main base casting
  const mainBodyGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
  const mainBodyMesh = new THREE.Mesh(mainBodyGeo, castIron);
  mainBodyMesh.position.set(0, baseH / 2, 0);
  g.add(mainBodyMesh);
  // Edge detail overlay on main body
  const mainBodyEdges = new THREE.EdgesGeometry(mainBodyGeo);
  const mainBodyLines = new THREE.LineSegments(mainBodyEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  mainBodyLines.position.copy(mainBodyMesh.position);
  g.add(mainBodyLines);
  // Slant bed section (angled top)
  const bedGeo = new THREE.BoxGeometry(1.8, 0.15, 1.2);
  const bedMesh = new THREE.Mesh(bedGeo, castIron);
  bedMesh.position.set(-0.1, baseH + 0.07, 0);
  bedMesh.rotation.set(0.25, 0, 0);
  g.add(bedMesh);
  // Edge detail on slant bed
  const bedEdges = new THREE.EdgesGeometry(bedGeo);
  const bedLines = new THREE.LineSegments(bedEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  bedLines.position.copy(bedMesh.position);
  bedLines.rotation.copy(bedMesh.rotation);
  g.add(bedLines);
  // Leveling pads
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.06, 0.08, 0.04, 8, M.rubber, sx * 0.9, 0.02, sz * 0.55));
    }
  }

  // ====== SHEET METAL ENCLOSURE ======
  const encH = 1.6;
  const encY = baseH + encH / 2;
  // Back panel
  g.add(box(baseW, encH, 0.04, sheetMetal, 0, encY, -baseD / 2));
  // Left panel
  g.add(box(0.04, encH, baseD, sheetMetal, -baseW / 2, encY, 0));
  // Right panel
  g.add(box(0.04, encH, baseD, sheetMetal, baseW / 2, encY, 0));
  // Top panel
  g.add(box(baseW, 0.04, baseD, sheetMetal, 0, baseH + encH, 0));
  // Front lower panel (below door)
  g.add(box(baseW, 0.3, 0.04, sheetMetal, 0, baseH + 0.15, baseD / 2));

  // ====== SLIDING DOOR (partially open) ======
  // Door frame
  g.add(box(1.2, encH - 0.3, 0.03, doorFrame, -0.2, encY + 0.15, baseD / 2 + 0.02));
  // Door frame edge detail
  const doorFrameGeo = new THREE.BoxGeometry(1.2, encH - 0.3, 0.03);
  const doorFrameEdges = new THREE.EdgesGeometry(doorFrameGeo);
  const doorFrameLines = new THREE.LineSegments(doorFrameEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  doorFrameLines.position.set(-0.2, encY + 0.15, baseD / 2 + 0.02);
  g.add(doorFrameLines);
  // Sliding door panel (shifted right = partially open)
  g.add(box(0.8, encH - 0.4, 0.025, sheetMetal, 0.5, encY + 0.15, baseD / 2 + 0.04));
  // Door panel inset (recessed panel detail)
  g.add(box(0.6, encH - 0.7, 0.008, mat(0x3a4855, 0.6, 0.5), 0.5, encY + 0.25, baseD / 2 + 0.058));
  // Viewing window in door
  g.add(box(0.5, 0.5, 0.015, M.glass, 0.5, encY + 0.3, baseD / 2 + 0.05));
  // Door handle
  g.add(box(0.12, 0.03, 0.03, M.chrome, 0.15, encY + 0.1, baseD / 2 + 0.06));
  // Door rail (top)
  g.add(cyl(0.015, 0.015, 1.4, 8, M.chrome, 0, baseH + encH - 0.1, baseD / 2 + 0.03, 0, 0, Math.PI / 2));

  // ====== HEADSTOCK / SPINDLE / CHUCK ======
  const headX = -0.7;
  const spindleY = baseH + 0.6;
  // Headstock housing
  g.add(box(0.5, 0.6, 0.6, castIron, headX, spindleY, 0));
  // Spindle nose
  g.add(cyl(0.2, 0.2, 0.12, 24, chuckSteel, headX + 0.31, spindleY, 0, 0, 0, Math.PI / 2));
  // Chuck body
  g.add(cyl(0.22, 0.22, 0.1, 24, chuckSteel, headX + 0.38, spindleY, 0, 0, 0, Math.PI / 2));
  // Chuck face
  g.add(cyl(0.24, 0.24, 0.03, 24, mat(0x8898a8, 0.8, 0.2), headX + 0.44, spindleY, 0, 0, 0, Math.PI / 2));
  // Chuck jaws (3)
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const jr = 0.15;
    g.add(box(0.05, 0.08, 0.04, M.darkChrome,
      headX + 0.46, spindleY + Math.sin(a) * jr, Math.cos(a) * jr));
  }
  // Spindle bore
  g.add(cyl(0.04, 0.04, 0.15, 12, M.bodyDark, headX + 0.4, spindleY, 0, 0, 0, Math.PI / 2));
  // Spindle motor cover (rear)
  g.add(cyl(0.18, 0.18, 0.3, 16, castIron, headX - 0.4, spindleY, 0, 0, 0, Math.PI / 2));

  // ====== TAILSTOCK ======
  const tailX = 0.6;
  // Tailstock body
  g.add(box(0.3, 0.35, 0.35, castIron, tailX, spindleY - 0.1, 0));
  // Tailstock quill
  g.add(cyl(0.04, 0.04, 0.2, 12, M.chrome, tailX - 0.2, spindleY - 0.1, 0, 0, 0, Math.PI / 2));
  // Tailstock center point
  g.add(cyl(0.025, 0.005, 0.06, 12, M.chrome, tailX - 0.33, spindleY - 0.1, 0, 0, 0, Math.PI / 2));
  // Tailstock lock lever
  g.add(cyl(0.015, 0.015, 0.12, 6, M.darkChrome, tailX + 0.1, spindleY + 0.1, 0.18, 0.5, 0, 0));
  // Handwheel
  g.add(cyl(0.06, 0.06, 0.02, 16, M.darkChrome, tailX + 0.17, spindleY - 0.1, 0, 0, 0, Math.PI / 2));

  // ====== TURRET TOOL HOLDER ======
  const turretX = 0.1;
  const turretY = spindleY + 0.05;
  // Turret base/slide
  g.add(box(0.3, 0.15, 0.35, castIron, turretX, turretY - 0.25, 0));
  // Turret disc
  g.add(cyl(0.2, 0.2, 0.12, 12, M.darkChrome, turretX, turretY, 0));
  // Tool positions (8 positions around turret)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    const tr = 0.15;
    g.add(box(0.04, 0.08, 0.04, chuckSteel,
      turretX + Math.cos(a) * tr, turretY + 0.1, Math.sin(a) * tr));
    // Tool holder bolts
    g.add(cyl(0.012, 0.012, 0.015, 6, M.chrome,
      turretX + Math.cos(a) * tr, turretY + 0.15, Math.sin(a) * tr));
  }
  // Turret center cap
  g.add(cyl(0.05, 0.05, 0.14, 12, M.chrome, turretX, turretY, 0));

  // ====== WAY COVERS / BELLOWS ======
  // X-axis bellows (left of turret)
  for (let i = 0; i < 5; i++) {
    g.add(box(0.04, 0.12, 0.5, bellowsBlack, turretX - 0.25 - i * 0.045, spindleY - 0.3, 0));
  }
  // X-axis bellows (right of turret)
  for (let i = 0; i < 4; i++) {
    g.add(box(0.04, 0.12, 0.5, bellowsBlack, turretX + 0.25 + i * 0.045, spindleY - 0.3, 0));
  }

  // ====== CHIP CONVEYOR AT BASE ======
  const convY = 0.12;
  g.add(box(1.8, 0.1, 0.35, chipConveyor, 0, convY, baseD / 2 + 0.2));
  // Conveyor auger
  g.add(cyl(0.04, 0.04, 1.6, 8, M.chrome, 0, convY + 0.05, baseD / 2 + 0.2, 0, 0, Math.PI / 2));
  // Chip exit chute
  g.add(box(0.25, 0.2, 0.15, chipConveyor, 1.0, 0.2, baseD / 2 + 0.2, -0.3, 0, 0));
  // Chip bin
  g.add(box(0.35, 0.25, 0.3, mat(0x4466aa, 0.2, 0.6), 1.2, 0.13, baseD / 2 + 0.25));

  // ====== CHIP GUARD ======
  g.add(box(0.6, 0.4, 0.03, mat(0x4a5060, 0.5, 0.5, { transparent: true, opacity: 0.4 }),
    headX + 0.5, spindleY + 0.3, 0.3));

  // ====== COOLANT TANK / PUMP ======
  const tankX = baseW / 2 + 0.25;
  // Tank body
  g.add(box(0.35, 0.45, 0.5, coolantBlue, tankX, 0.25, -0.2));
  // Tank walls (opaque)
  g.add(box(0.37, 0.47, 0.03, sheetMetal, tankX, 0.25, -0.45));
  g.add(box(0.37, 0.47, 0.03, sheetMetal, tankX, 0.25, 0.05));
  // Pump motor
  g.add(cyl(0.07, 0.07, 0.15, 12, M.bodyGray, tankX, 0.55, -0.2, 0, 0, Math.PI / 2));
  // Coolant hose
  g.add(cyl(0.015, 0.015, 0.7, 6, M.rubber, tankX - 0.2, 0.7, 0, -0.3, 0, 0.2));
  // Coolant nozzle (inside enclosure)
  g.add(cyl(0.01, 0.008, 0.08, 6, M.chrome, turretX + 0.15, spindleY + 0.15, 0.15, 0.5, 0, 0));
  // Fill cap
  g.add(cyl(0.04, 0.04, 0.02, 12, M.darkChrome, tankX, 0.5, -0.2));

  // ====== CNC CONTROL PANEL ======
  const panelX = baseW / 2 + 0.02;
  const panelY = baseH + 0.9;
  const panelZ = baseD / 2 + 0.15;
  // Panel housing
  g.add(box(0.08, 0.7, 0.5, controlGray, panelX, panelY, panelZ));
  // Screen
  g.add(box(0.015, 0.3, 0.35, M.screen, panelX + 0.05, panelY + 0.1, panelZ));
  // Screen bezel
  g.add(box(0.01, 0.34, 0.39, M.bodyDark, panelX + 0.045, panelY + 0.1, panelZ));
  // Keyboard area
  g.add(box(0.04, 0.15, 0.38, mat(0x333a44, 0.4, 0.6), panelX + 0.06, panelY - 0.22, panelZ, 0.3, 0, 0));
  // Button rows
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      g.add(box(0.015, 0.015, 0.03, M.bodyGray,
        panelX + 0.08, panelY - 0.16 - r * 0.04, panelZ - 0.12 + c * 0.05, 0.3, 0, 0));
    }
  }
  // Start button
  g.add(cyl(0.018, 0.018, 0.012, 8, buttonGreen, panelX + 0.08, panelY - 0.32, panelZ + 0.12, 0.3, 0, 0));
  // Stop button
  g.add(cyl(0.018, 0.018, 0.012, 8, M.red, panelX + 0.08, panelY - 0.32, panelZ + 0.05, 0.3, 0, 0));
  // E-stop
  g.add(cyl(0.025, 0.025, 0.02, 12, M.red, panelX + 0.08, panelY - 0.32, panelZ - 0.05, 0.3, 0, 0));
  // Feed override knob
  g.add(cyl(0.02, 0.02, 0.02, 12, M.chrome, panelX + 0.08, panelY - 0.32, panelZ - 0.14, 0.3, 0, 0));
  // Jog handwheel
  g.add(cyl(0.04, 0.04, 0.015, 16, M.darkChrome, panelX + 0.06, panelY + 0.0, panelZ + 0.2));
  // USB port
  g.add(box(0.008, 0.015, 0.02, M.bodyDark, panelX + 0.05, panelY - 0.35, panelZ + 0.18));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(0, baseH + encH + 0.02, -baseD / 2 + 0.15));

  return g;
}
