import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildInjectionMolder(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const heavyFrame = mat(0x3a4250, 0.7, 0.4);
  const platenSteel = mat(0x556070, 0.75, 0.3);
  const tieBarChrome = mat(0x8898a8, 0.85, 0.2);
  const moldSteel = mat(0x505868, 0.8, 0.25);
  const barrelMetal = mat(0x606878, 0.7, 0.35);
  const heaterBand = mat(0x886644, 0.4, 0.5);
  const heaterGlow = mat(0xcc5522, 0.1, 0.4, { emissive: 0xff4400, emissiveIntensity: 0.4 });
  const hopperMetal = mat(0x778090, 0.7, 0.3);
  const hydraulicGray = mat(0x444c58, 0.6, 0.45);
  const safetyYellow = mat(0xddaa00, 0.1, 0.6);
  const controlWhite = mat(0xd0d4d8, 0.3, 0.5);
  const chuteSteel = mat(0x667080, 0.6, 0.4);
  const toggleLink = mat(0x4a5868, 0.7, 0.4);

  // ====== MACHINE BED / BASE ======
  const bedW = 3.6;
  const bedD = 1.2;
  const bedH = 0.5;
  const mainBodyGeo = new THREE.BoxGeometry(bedW, bedH, bedD);
  const mainBodyMesh = new THREE.Mesh(mainBodyGeo, heavyFrame);
  mainBodyMesh.position.set(0, bedH / 2, 0);
  g.add(mainBodyMesh);
  // Edge detail overlay on main bed
  const mainBodyEdges = new THREE.EdgesGeometry(mainBodyGeo);
  const mainBodyLines = new THREE.LineSegments(mainBodyEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  mainBodyLines.position.copy(mainBodyMesh.position);
  g.add(mainBodyLines);
  // Leveling pads
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.07, 0.09, 0.04, 8, M.rubber, sx * 1.6, 0.02, sz * 0.45));
    }
  }

  // ====== FIXED PLATEN (operator side) ======
  const fixedX = -0.5;
  const platenY = bedH + 0.55;
  g.add(box(0.2, 1.1, 1.0, platenSteel, fixedX, platenY, 0));
  // Platen face bolt pattern
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      g.add(cyl(0.02, 0.02, 0.015, 6, M.darkChrome, fixedX + 0.11, platenY + r * 0.3, c * 0.3));
    }
  }
  // Locating ring
  g.add(cyl(0.12, 0.12, 0.04, 16, M.darkChrome, fixedX + 0.12, platenY, 0));
  // Sprue bushing hole
  g.add(cyl(0.03, 0.03, 0.06, 12, M.bodyDark, fixedX + 0.12, platenY, 0));

  // ====== MOVING PLATEN ======
  const movingX = 0.5;
  g.add(box(0.18, 1.0, 0.95, platenSteel, movingX, platenY, 0));
  // Ejector pattern on back
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      g.add(cyl(0.015, 0.015, 0.012, 6, M.darkChrome, movingX - 0.1, platenY + r * 0.25, c * 0.25));
    }
  }

  // ====== TIE BARS (4 rods connecting platens) ======
  const tieBarLen = 2.0;
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ty = platenY + sy * 0.4;
      const tz = sz * 0.38;
      // Bar
      g.add(cyl(0.04, 0.04, tieBarLen, 12, tieBarChrome,
        (fixedX + movingX) / 2 + 0.4, ty, tz, 0, 0, Math.PI / 2));
      // Nuts at fixed platen
      g.add(cyl(0.055, 0.055, 0.04, 6, M.darkChrome, fixedX - 0.12, ty, tz));
      // Nuts at tail
      g.add(cyl(0.055, 0.055, 0.04, 6, M.darkChrome, movingX + 0.9, ty, tz));
    }
  }

  // ====== CLAMPING UNIT (toggle mechanism) ======
  const toggleX = movingX + 0.5;
  // Toggle housing
  g.add(box(0.6, 0.8, 0.9, toggleLink, toggleX + 0.3, platenY, 0));
  // Toggle links (visible diagonal bars)
  for (const sz of [-1, 1]) {
    // Upper links
    g.add(box(0.06, 0.4, 0.06, M.darkChrome, toggleX + 0.15, platenY + 0.3, sz * 0.3, 0.4, 0, 0));
    // Lower links
    g.add(box(0.06, 0.4, 0.06, M.darkChrome, toggleX + 0.15, platenY - 0.3, sz * 0.3, -0.4, 0, 0));
    // Crosshead links
    g.add(box(0.06, 0.3, 0.06, M.darkChrome, toggleX + 0.4, platenY, sz * 0.3));
    // Link pins
    g.add(cyl(0.025, 0.025, 0.1, 8, M.chrome, toggleX + 0.15, platenY, sz * 0.3, Math.PI / 2, 0, 0));
    g.add(cyl(0.025, 0.025, 0.1, 8, M.chrome, toggleX + 0.4, platenY + 0.3, sz * 0.3, Math.PI / 2, 0, 0));
    g.add(cyl(0.025, 0.025, 0.1, 8, M.chrome, toggleX + 0.4, platenY - 0.3, sz * 0.3, Math.PI / 2, 0, 0));
  }
  // Crosshead
  g.add(box(0.15, 0.5, 0.7, platenSteel, toggleX + 0.6, platenY, 0));
  // Clamping cylinder
  g.add(cyl(0.15, 0.15, 0.4, 16, hydraulicGray, toggleX + 0.8, platenY, 0, 0, 0, Math.PI / 2));
  // Piston rod
  g.add(cyl(0.06, 0.06, 0.3, 12, M.chrome, toggleX + 0.65, platenY, 0, 0, 0, Math.PI / 2));

  // ====== MOLD (between platens) ======
  const moldX = (fixedX + movingX) / 2;
  // Fixed half
  g.add(box(0.12, 0.6, 0.5, moldSteel, moldX - 0.07, platenY, 0));
  // Moving half
  g.add(box(0.12, 0.6, 0.5, moldSteel, moldX + 0.07, platenY, 0));
  // Parting line
  g.add(box(0.005, 0.62, 0.52, mat(0x333333, 0.3, 0.5), moldX, platenY, 0));
  // Cooling line connections
  for (const sy of [-1, 1]) {
    g.add(cyl(0.015, 0.015, 0.06, 8, M.chrome, moldX, platenY + sy * 0.22, 0.28));
    g.add(cyl(0.01, 0.01, 0.1, 6, mat(0x3366aa, 0.1, 0.6), moldX, platenY + sy * 0.22, 0.34, 0.3, 0, 0));
  }

  // ====== EJECTOR MECHANISM ======
  g.add(cyl(0.08, 0.08, 0.12, 12, M.darkChrome, movingX - 0.15, platenY, 0, 0, 0, Math.PI / 2));
  // Ejector rods (4)
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.012, 0.012, 0.15, 6, M.chrome,
        movingX - 0.12, platenY + sy * 0.15, sz * 0.15, 0, 0, Math.PI / 2));
    }
  }

  // ====== INJECTION UNIT ======
  const injX = fixedX - 0.6;
  // Barrel
  g.add(cyl(0.1, 0.1, 0.9, 16, barrelMetal, injX - 0.3, platenY, 0, 0, 0, Math.PI / 2));
  // Barrel nozzle tip
  g.add(cyl(0.05, 0.02, 0.12, 12, M.chrome, fixedX - 0.12, platenY, 0, 0, 0, Math.PI / 2));
  // Heater bands
  for (let i = 0; i < 5; i++) {
    g.add(cyl(0.11, 0.11, 0.04, 16, heaterBand, injX - 0.05 - i * 0.15, platenY, 0, 0, 0, Math.PI / 2));
    // Glow between bands
    if (i < 4) {
      g.add(cyl(0.105, 0.105, 0.02, 16, heaterGlow, injX - 0.12 - i * 0.15, platenY, 0, 0, 0, Math.PI / 2));
    }
  }
  // Thermocouple wires
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.005, 0.005, 0.08, 4, M.wire, injX - 0.1 - i * 0.2, platenY + 0.11, 0));
  }

  // ====== HOPPER ======
  const hopperX = injX - 0.5;
  // Hopper body (tapered)
  g.add(cyl(0.2, 0.1, 0.35, 8, hopperMetal, hopperX, platenY + 0.5, 0));
  // Hopper top rim
  g.add(cyl(0.21, 0.21, 0.03, 12, M.darkChrome, hopperX, platenY + 0.68, 0));
  // Hopper lid
  g.add(cyl(0.19, 0.19, 0.02, 12, hopperMetal, hopperX, platenY + 0.7, 0));
  // Hopper throat
  g.add(cyl(0.08, 0.08, 0.1, 12, hopperMetal, hopperX, platenY + 0.3, 0));
  // Hopper sight glass
  g.add(box(0.02, 0.15, 0.04, mat(0x88bbdd, 0, 0.1, { transparent: true, opacity: 0.35 }),
    hopperX + 0.18, platenY + 0.5, 0));
  // Pellets visible inside (rough approximation)
  g.add(sph(0.06, mat(0xddddcc, 0, 0.8), hopperX, platenY + 0.45, 0));

  // ====== INJECTION DRIVE ======
  const driveX = injX - 0.9;
  g.add(box(0.4, 0.5, 0.5, hydraulicGray, driveX, platenY, 0));
  // Injection cylinder
  g.add(cyl(0.12, 0.12, 0.35, 16, hydraulicGray, driveX + 0.15, platenY, 0, 0, 0, Math.PI / 2));
  // Motor
  g.add(cyl(0.1, 0.1, 0.2, 12, M.bodyGray, driveX - 0.1, platenY + 0.15, 0, 0, 0, Math.PI / 2));

  // ====== HYDRAULIC POWER UNIT (rear) ======
  const hpuX = toggleX + 0.9;
  g.add(box(0.6, 0.7, 0.8, hydraulicGray, hpuX, 0.55, 0));
  // Hydraulic motor
  g.add(cyl(0.14, 0.14, 0.3, 12, M.bodyGray, hpuX, 0.95, 0, 0, 0, Math.PI / 2));
  // Oil filter
  g.add(cyl(0.06, 0.06, 0.15, 12, mat(0x667788, 0.5, 0.4), hpuX + 0.25, 0.7, 0.35));
  // Pressure gauge
  g.add(cyl(0.04, 0.04, 0.015, 16, mat(0xeeeeee, 0, 0.8), hpuX + 0.32, 0.85, 0));
  g.add(cyl(0.042, 0.042, 0.01, 16, M.chrome, hpuX + 0.32, 0.85, 0.01));
  // Hoses
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, hpuX - 0.2, 0.9, 0.3, 0, 0, 0.4));
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, hpuX - 0.2, 0.9, -0.3, 0, 0, 0.4));

  // ====== PART COLLECTION CHUTE ======
  g.add(box(0.4, 0.03, 0.5, chuteSteel, moldX, bedH + 0.1, 0.5, -0.3, 0, 0));
  g.add(box(0.03, 0.06, 0.5, chuteSteel, moldX - 0.2, bedH + 0.12, 0.5, -0.3, 0, 0));
  g.add(box(0.03, 0.06, 0.5, chuteSteel, moldX + 0.2, bedH + 0.12, 0.5, -0.3, 0, 0));
  // Collection bin
  g.add(box(0.5, 0.3, 0.35, mat(0x3355aa, 0.2, 0.6), moldX, 0.15, 0.9));

  // ====== SAFETY GATES (both sides) ======
  for (const sz of [-1, 1]) {
    const gateZ = sz * (bedD / 2 + 0.05);
    // Gate frame
    g.add(box(1.0, 1.2, 0.04, safetyYellow, moldX, bedH + 0.6, gateZ));
    // Safety mesh panel
    g.add(box(0.9, 1.0, 0.02, mat(0xaaaa44, 0.1, 0.5, { transparent: true, opacity: 0.3 }),
      moldX, bedH + 0.6, gateZ + sz * 0.02));
    // Gate hinges
    g.add(cyl(0.015, 0.015, 0.06, 6, M.darkChrome, moldX - 0.48, bedH + 0.9, gateZ));
    g.add(cyl(0.015, 0.015, 0.06, 6, M.darkChrome, moldX - 0.48, bedH + 0.3, gateZ));
    // Safety interlock switch
    g.add(box(0.04, 0.06, 0.03, safetyYellow, moldX + 0.48, bedH + 0.9, gateZ));
  }

  // ====== CONTROL PANEL ON ARTICULATED ARM ======
  const cpX = -0.8;
  const cpZ = bedD / 2 + 0.4;
  // Arm base on machine
  g.add(cyl(0.04, 0.05, 0.06, 12, M.darkChrome, cpX, bedH + 1.2, bedD / 2));
  // Arm segment 1
  g.add(cyl(0.025, 0.025, 0.35, 8, M.darkChrome, cpX, bedH + 1.2, bedD / 2 + 0.15, Math.PI / 2.5, 0, 0));
  // Arm segment 2
  g.add(cyl(0.025, 0.025, 0.2, 8, M.darkChrome, cpX, bedH + 1.1, cpZ - 0.1, Math.PI / 4, 0, 0));
  // Control box
  const ctrlBoxGeo = new THREE.BoxGeometry(0.4, 0.5, 0.08);
  const ctrlBoxMesh = new THREE.Mesh(ctrlBoxGeo, controlWhite);
  ctrlBoxMesh.position.set(cpX, bedH + 0.85, cpZ);
  g.add(ctrlBoxMesh);
  // Control box edge detail
  const ctrlBoxEdges = new THREE.EdgesGeometry(ctrlBoxGeo);
  const ctrlBoxLines = new THREE.LineSegments(ctrlBoxEdges, new THREE.LineBasicMaterial({ color: 0x1a1e24, transparent: true, opacity: 0.45 }));
  ctrlBoxLines.position.copy(ctrlBoxMesh.position);
  g.add(ctrlBoxLines);
  // Control box panel inset (simulates housing cover seam)
  g.add(box(0.32, 0.38, 0.01, mat(0xc5c9cd, 0.3, 0.5), cpX, bedH + 0.88, cpZ + 0.04));
  // Screen
  g.add(box(0.3, 0.25, 0.015, M.screenActive, cpX, bedH + 0.95, cpZ + 0.05));
  // Screen bezel
  g.add(box(0.33, 0.28, 0.01, M.bodyDark, cpX, bedH + 0.95, cpZ + 0.045));
  // Button area
  g.add(box(0.25, 0.1, 0.02, mat(0x888890, 0.3, 0.5), cpX, bedH + 0.72, cpZ + 0.05));
  // Buttons
  for (let i = 0; i < 5; i++) {
    g.add(cyl(0.012, 0.012, 0.01, 8, M.bodyGray, cpX - 0.1 + i * 0.05, bedH + 0.72, cpZ + 0.065));
  }
  // E-stop
  g.add(cyl(0.025, 0.025, 0.02, 12, M.red, cpX + 0.15, bedH + 0.72, cpZ + 0.065));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(fixedX - 0.3, bedH + 1.2, -bedD / 2 + 0.1));

  return g;
}
