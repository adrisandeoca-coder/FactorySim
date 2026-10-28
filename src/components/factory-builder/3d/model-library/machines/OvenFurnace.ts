import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildOvenFurnace(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const outerShell = mat(0x4a5060, 0.6, 0.5);
  const innerShell = mat(0x3a3e46, 0.5, 0.6);
  const insulation = mat(0xccbb88, 0.0, 0.9);
  const interiorDark = mat(0x1a1210, 0.2, 0.7);
  const orangeGlow = mat(0xff6622, 0.0, 0.3, { emissive: 0xff4400, emissiveIntensity: 1.8 });
  const heaterElement = mat(0xcc4411, 0.2, 0.4, { emissive: 0xff3300, emissiveIntensity: 1.2 });
  const doorMetal = mat(0x505868, 0.65, 0.45);
  const hingeSteel = mat(0x606878, 0.7, 0.35);
  const handleChrome = mat(0x8898a8, 0.85, 0.2);
  const controlPanel = mat(0xd0d4d8, 0.3, 0.5);
  const ventMetal = mat(0x556070, 0.6, 0.4);
  const wireMesh = mat(0x777788, 0.6, 0.4, { transparent: true, opacity: 0.5 });
  const casterMat = mat(0x333333, 0.3, 0.7);

  // ====== WHEELS / CASTERS ======
  const casterY = 0.06;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Caster housing
      g.add(box(0.06, 0.06, 0.06, casterMat, sx * 0.55, casterY, sz * 0.45));
      // Wheel
      g.add(cyl(0.04, 0.04, 0.03, 12, M.rubber, sx * 0.55, 0.04, sz * 0.45, Math.PI / 2, 0, 0));
      // Caster swivel
      g.add(cyl(0.02, 0.02, 0.03, 8, M.darkChrome, sx * 0.55, 0.09, sz * 0.45));
    }
  }

  // ====== OVEN BODY (insulated box) ======
  const bodyW = 1.3;
  const bodyD = 1.0;
  const bodyH = 1.4;
  const bodyY = casterY * 2 + bodyH / 2 + 0.05;
  // Outer shell edges overlay (full body bounding box for seam/edge detail)
  const ovenBodyGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
  const ovenBodyEdges = new THREE.EdgesGeometry(ovenBodyGeo);
  const ovenBodyLines = new THREE.LineSegments(ovenBodyEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  ovenBodyLines.position.set(0, bodyY, 0);
  g.add(ovenBodyLines);
  // Outer shell
  // Back
  g.add(box(bodyW, bodyH, 0.06, outerShell, 0, bodyY, -bodyD / 2));
  // Left
  g.add(box(0.06, bodyH, bodyD, outerShell, -bodyW / 2, bodyY, 0));
  // Right
  g.add(box(0.06, bodyH, bodyD, outerShell, bodyW / 2, bodyY, 0));
  // Top
  g.add(box(bodyW, 0.06, bodyD, outerShell, 0, bodyY + bodyH / 2, 0));
  // Bottom
  g.add(box(bodyW, 0.06, bodyD, outerShell, 0, bodyY - bodyH / 2, 0));

  // ====== INTERIOR (visible through open door) ======
  const intW = bodyW - 0.2;
  const intD = bodyD - 0.2;
  const intH = bodyH - 0.2;
  // Interior back wall (dark)
  g.add(box(intW, intH, 0.02, interiorDark, 0, bodyY, -intD / 2 - 0.04));
  // Interior floor
  g.add(box(intW, 0.02, intD, interiorDark, 0, bodyY - intH / 2 + 0.02, 0));
  // Interior ceiling
  g.add(box(intW, 0.02, intD, interiorDark, 0, bodyY + intH / 2 - 0.02, 0));
  // Interior side walls
  g.add(box(0.02, intH, intD, interiorDark, -intW / 2, bodyY, 0));
  g.add(box(0.02, intH, intD, interiorDark, intW / 2, bodyY, 0));
  // Orange glow on interior surfaces
  g.add(box(intW - 0.05, 0.01, intD - 0.05, orangeGlow, 0, bodyY - intH / 2 + 0.04, 0));
  g.add(box(intW - 0.05, 0.01, intD - 0.05, orangeGlow, 0, bodyY + intH / 2 - 0.04, 0));

  // ====== HEATING ELEMENTS (glowing) ======
  // Top elements
  for (let i = -1; i <= 1; i++) {
    g.add(cyl(0.012, 0.012, intW - 0.1, 6, heaterElement,
      0, bodyY + intH / 2 - 0.08, i * 0.2, 0, 0, Math.PI / 2));
  }
  // Bottom elements
  for (let i = -1; i <= 1; i++) {
    g.add(cyl(0.012, 0.012, intW - 0.1, 6, heaterElement,
      0, bodyY - intH / 2 + 0.08, i * 0.2, 0, 0, Math.PI / 2));
  }

  // ====== WIRE MESH SHELVES / RACKS (3 levels) ======
  for (let shelf = 0; shelf < 3; shelf++) {
    const shelfY = bodyY - intH / 3 + shelf * (intH / 3);
    // Shelf surface
    g.add(box(intW - 0.06, 0.01, intD - 0.06, wireMesh, 0, shelfY, 0));
    // Shelf rails (support rods)
    g.add(cyl(0.008, 0.008, intW - 0.06, 6, M.chrome, 0, shelfY, -intD / 4, 0, 0, Math.PI / 2));
    g.add(cyl(0.008, 0.008, intW - 0.06, 6, M.chrome, 0, shelfY, intD / 4, 0, 0, Math.PI / 2));
    // Shelf bracket tabs
    for (const sx of [-1, 1]) {
      g.add(box(0.02, 0.03, 0.02, M.darkChrome, sx * (intW / 2 - 0.03), shelfY, -intD / 4));
      g.add(box(0.02, 0.03, 0.02, M.darkChrome, sx * (intW / 2 - 0.03), shelfY, intD / 4));
    }
  }

  // ====== DOOR (partially open, front-loading) ======
  const doorW = bodyW - 0.08;
  const doorH = bodyH - 0.08;
  // Door panel (rotated open ~25 degrees)
  const doorPivotZ = bodyD / 2;
  const doorOpenAngle = 0.4;
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, bodyY, doorPivotZ);
  doorGroup.rotation.x = doorOpenAngle;
  // Outer door surface
  doorGroup.add(box(doorW, doorH, 0.05, doorMetal, 0, 0, 0.025));
  // Door outer panel edge detail
  const doorPanelGeo = new THREE.BoxGeometry(doorW, doorH, 0.05);
  const doorPanelEdges = new THREE.EdgesGeometry(doorPanelGeo);
  const doorPanelLines = new THREE.LineSegments(doorPanelEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  doorPanelLines.position.set(0, 0, 0.025);
  doorGroup.add(doorPanelLines);
  // Door frame inset rectangle (simulates recessed door panel / frame seam)
  doorGroup.add(box(doorW - 0.1, doorH - 0.1, 0.008, mat(0x404850, 0.65, 0.45), 0, 0, 0.053));
  // Door insulation (visible at edge)
  doorGroup.add(box(doorW - 0.04, doorH - 0.04, 0.04, insulation, 0, 0, -0.005));
  // Inner door surface
  doorGroup.add(box(doorW - 0.06, doorH - 0.06, 0.01, innerShell, 0, 0, -0.03));
  // Viewing window in door
  doorGroup.add(box(0.35, 0.35, 0.03, mat(0x886644, 0, 0.15, {
    transparent: true, opacity: 0.25,
  }), 0, 0.15, 0.04));
  g.add(doorGroup);

  // ====== HEAVY-DUTY HINGES ======
  for (const sy of [-1, 1]) {
    // Hinge barrels
    g.add(cyl(0.02, 0.02, 0.06, 8, hingeSteel,
      -doorW / 2 + 0.05, bodyY + sy * (doorH / 2 - 0.1), doorPivotZ + 0.03, Math.PI / 2, 0, 0));
    // Hinge plates
    g.add(box(0.1, 0.06, 0.025, hingeSteel,
      -doorW / 2 + 0.1, bodyY + sy * (doorH / 2 - 0.1), doorPivotZ - 0.01));
    g.add(box(0.1, 0.06, 0.025, hingeSteel,
      -doorW / 2 + 0.1, bodyY + sy * (doorH / 2 - 0.1), doorPivotZ + 0.07));
  }

  // ====== DOOR HANDLE WITH LATCH ======
  // Handle bar
  g.add(box(0.03, 0.2, 0.04, handleChrome, doorW / 2 - 0.1, bodyY + 0.05, doorPivotZ + 0.08));
  // Latch mechanism
  g.add(box(0.06, 0.06, 0.03, M.darkChrome, doorW / 2 - 0.1, bodyY + 0.15, doorPivotZ + 0.06));
  // Latch catch on body
  g.add(box(0.04, 0.04, 0.02, M.darkChrome, doorW / 2 - 0.1, bodyY + 0.15, doorPivotZ - 0.02));

  // ====== TEMPERATURE CONTROLLER PANEL (side) ======
  const panelX = bodyW / 2 + 0.04;
  const panelY = bodyY + 0.2;
  // Panel housing
  g.add(box(0.06, 0.5, 0.4, controlPanel, panelX, panelY, -0.1));
  // Digital temperature display
  g.add(box(0.015, 0.08, 0.15, M.screen, panelX + 0.035, panelY + 0.12, -0.1));
  // Display bezel
  g.add(box(0.01, 0.1, 0.17, M.bodyDark, panelX + 0.03, panelY + 0.12, -0.1));
  // Temperature setpoint display
  g.add(box(0.015, 0.05, 0.1, mat(0x001a00, 0, 0.9, { emissive: 0x00ff00, emissiveIntensity: 0.5 }),
    panelX + 0.035, panelY + 0.0, -0.1));
  // Control buttons
  for (let i = 0; i < 4; i++) {
    g.add(box(0.012, 0.025, 0.025, M.bodyGray, panelX + 0.04, panelY - 0.08 - i * 0.04, -0.1));
  }
  // Timer knob
  g.add(cyl(0.02, 0.02, 0.015, 12, M.chrome, panelX + 0.04, panelY - 0.0, -0.22));
  // Power indicator LED
  g.add(sph(0.008, mat(0x00ff00, 0, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.5 }),
    panelX + 0.04, panelY + 0.22, -0.05));
  // Power switch
  g.add(box(0.015, 0.03, 0.015, M.red, panelX + 0.04, panelY + 0.22, -0.15));

  // ====== EXHAUST VENT / CHIMNEY (top) ======
  const topY = bodyY + bodyH / 2;
  // Chimney base
  g.add(cyl(0.08, 0.1, 0.06, 12, ventMetal, 0, topY + 0.03, -0.15));
  // Chimney pipe
  g.add(cyl(0.07, 0.07, 0.3, 12, ventMetal, 0, topY + 0.2, -0.15));
  // Rain cap
  g.add(cyl(0.1, 0.1, 0.02, 12, ventMetal, 0, topY + 0.37, -0.15));
  // Cap supports
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    g.add(cyl(0.008, 0.008, 0.04, 4, M.darkChrome,
      Math.cos(a) * 0.06, topY + 0.37, -0.15 + Math.sin(a) * 0.06));
  }
  // Small vent grille on back
  g.add(box(0.2, 0.15, 0.02, ventMetal, 0, bodyY + bodyH / 4, -bodyD / 2 - 0.01));
  for (let i = 0; i < 5; i++) {
    g.add(box(0.18, 0.005, 0.015, M.bodyDark, 0, bodyY + bodyH / 4 - 0.05 + i * 0.025, -bodyD / 2 - 0.02));
  }

  // ====== INSULATION VISIBLE AT DOOR EDGE ======
  // Top edge insulation
  g.add(box(doorW - 0.02, 0.06, 0.05, insulation, 0, bodyY + doorH / 2 - 0.02, doorPivotZ));
  // Bottom edge insulation
  g.add(box(doorW - 0.02, 0.06, 0.05, insulation, 0, bodyY - doorH / 2 + 0.02, doorPivotZ));
  // Side edge insulation
  g.add(box(0.05, doorH - 0.1, 0.05, insulation, doorW / 2 - 0.02, bodyY, doorPivotZ));

  // ====== THERMOCOUPLE PROBE (side) ======
  g.add(cyl(0.008, 0.008, 0.15, 6, M.chrome, -bodyW / 2 - 0.02, bodyY + 0.1, 0, 0, 0, Math.PI / 2));
  g.add(cyl(0.012, 0.012, 0.03, 8, M.darkChrome, -bodyW / 2 - 0.07, bodyY + 0.1, 0, 0, 0, Math.PI / 2));
  // Thermocouple wire
  g.add(cyl(0.004, 0.004, 0.12, 4, M.wire, -bodyW / 2 - 0.1, bodyY + 0.05, 0, 0.4, 0, 0));

  // ====== OVEN NAMEPLATE ======
  g.add(box(0.12, 0.06, 0.005, mat(0xaaaaaa, 0.8, 0.2), 0, bodyY + bodyH / 2 - 0.15, bodyD / 2 + 0.03));

  // ====== WIRING CONDUIT (rear) ======
  g.add(cyl(0.015, 0.015, 0.8, 6, mat(0x555555, 0.3, 0.6), bodyW / 2 - 0.1, bodyY, -bodyD / 2 - 0.04, 0, 0, 0));
  g.add(box(0.04, 0.04, 0.03, M.darkChrome, bodyW / 2 - 0.1, bodyY + 0.4, -bodyD / 2 - 0.04));
  g.add(box(0.04, 0.04, 0.03, M.darkChrome, bodyW / 2 - 0.1, bodyY - 0.4, -bodyD / 2 - 0.04));

  // ====== DOOR SEAL GASKET ======
  // Perimeter gasket around door opening
  g.add(box(doorW + 0.02, 0.02, 0.02, M.rubber, 0, bodyY + doorH / 2 + 0.01, doorPivotZ - 0.02));
  g.add(box(doorW + 0.02, 0.02, 0.02, M.rubber, 0, bodyY - doorH / 2 - 0.01, doorPivotZ - 0.02));
  g.add(box(0.02, doorH, 0.02, M.rubber, doorW / 2 + 0.01, bodyY, doorPivotZ - 0.02));
  g.add(box(0.02, doorH, 0.02, M.rubber, -doorW / 2 - 0.01, bodyY, doorPivotZ - 0.02));

  // ====== STATUS LIGHT ON TOP ======
  g.add(createStatusLight(bodyW / 2 - 0.15, topY + 0.02, 0.2));

  return g;
}
