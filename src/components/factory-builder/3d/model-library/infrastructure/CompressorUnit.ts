import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildCompressorUnit(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const housingGray = mat(0x5a6270, 0.55, 0.5);
  const housingDark = mat(0x3a4050, 0.6, 0.5);
  const grilleMat = mat(0x4a5060, 0.5, 0.5, { transparent: true, opacity: 0.7 });
  const tankMat = mat(0x4080aa, 0.5, 0.45);
  const tankEndCap = mat(0x3a7098, 0.55, 0.4);
  const pipeMat = mat(0x607080, 0.7, 0.3);
  const pipeCopper = mat(0xbb7733, 0.7, 0.3);
  const gaugeFace = mat(0xeeeeee, 0.05, 0.7);
  const gaugeNeedle = mat(0xdd0000, 0.2, 0.5);
  const gaugeRim = mat(0x888888, 0.75, 0.25);
  const dryerBox = mat(0x6a7888, 0.5, 0.5);
  const motorMat = mat(0x3a4050, 0.6, 0.45);
  const motorCopper = mat(0xcc8844, 0.6, 0.35);
  const rubberMount = mat(0x1a1c20, 0.0, 0.92);
  const valveMat = mat(0x777777, 0.65, 0.35);
  const valveRed = mat(0xcc2222, 0.2, 0.5);
  const filterMat = mat(0x889098, 0.4, 0.5);
  const controlPanel = mat(0x2a3040, 0.5, 0.55);
  const displayGreen = mat(0x00cc44, 0.1, 0.3, { emissive: 0x00cc44, emissiveIntensity: 1.0 });
  const boltMat = mat(0x888888, 0.8, 0.2);
  const labelWhite = mat(0xeeeeee, 0.0, 0.8);

  // ── Dimensions ──
  const housingW = 1.0;
  const housingH = 0.9;
  const housingD = 0.7;
  const tankR = 0.22;
  const tankLen = 1.2;

  // ── Vibration Isolation Mounts (rubber feet) ──
  const footPositions = [
    [-housingW / 2 + 0.1, -housingD / 2 + 0.1],
    [housingW / 2 - 0.1, -housingD / 2 + 0.1],
    [-housingW / 2 + 0.1, housingD / 2 - 0.1],
    [housingW / 2 - 0.1, housingD / 2 - 0.1],
    // Tank feet
    [housingW + 0.15, -0.15],
    [housingW + 0.15, 0.15],
    [housingW + tankLen - 0.15, -0.15],
    [housingW + tankLen - 0.15, 0.15],
  ];
  for (const [fx, fz] of footPositions) {
    // Rubber isolator
    g.add(cyl(0.04, 0.05, 0.04, 10, rubberMount, fx, 0.02, fz));
    // Steel washer top
    g.add(cyl(0.035, 0.035, 0.008, 10, boltMat, fx, 0.044, fz));
    // Bolt
    g.add(cyl(0.006, 0.006, 0.06, 6, boltMat, fx, 0.02, fz));
    // Floor plate
    g.add(box(0.08, 0.005, 0.08, boltMat, fx, 0.002, fz));
  }

  // ── Compressor Housing / Enclosure ──
  const houseY = 0.05;
  // Main body panels
  g.add(box(housingW, housingH, 0.03, housingGray, 0, houseY + housingH / 2, -housingD / 2 + 0.015)); // front
  g.add(box(housingW, housingH, 0.03, housingGray, 0, houseY + housingH / 2, housingD / 2 - 0.015));  // back
  g.add(box(0.03, housingH, housingD, housingGray, -housingW / 2 + 0.015, houseY + housingH / 2, 0)); // left
  g.add(box(0.03, housingH, housingD, housingGray, housingW / 2 - 0.015, houseY + housingH / 2, 0));  // right
  g.add(box(housingW, 0.03, housingD, housingGray, 0, houseY + housingH - 0.015, 0)); // top
  // Bottom frame rails
  g.add(box(housingW, 0.04, 0.05, housingDark, 0, houseY + 0.02, -housingD / 2 + 0.025));
  g.add(box(housingW, 0.04, 0.05, housingDark, 0, houseY + 0.02, housingD / 2 - 0.025));

  // ── Ventilation Grilles (front and sides) ──
  // Front grille
  const grilleY = houseY + housingH * 0.3;
  const grilleH = housingH * 0.5;
  g.add(box(housingW * 0.7, grilleH, 0.01, grilleMat, 0, grilleY + grilleH / 2, -housingD / 2 + 0.003));
  // Horizontal grille slats
  const slotCount = 12;
  for (let s = 0; s < slotCount; s++) {
    const sy = grilleY + (s + 0.5) * (grilleH / slotCount);
    g.add(box(housingW * 0.68, 0.008, 0.015, housingDark, 0, sy, -housingD / 2 + 0.005, 0.3, 0, 0));
  }
  // Grille frame
  g.add(box(housingW * 0.72, 0.015, 0.02, housingDark, 0, grilleY, -housingD / 2 + 0.005));
  g.add(box(housingW * 0.72, 0.015, 0.02, housingDark, 0, grilleY + grilleH, -housingD / 2 + 0.005));
  g.add(box(0.015, grilleH, 0.02, housingDark, -housingW * 0.35, grilleY + grilleH / 2, -housingD / 2 + 0.005));
  g.add(box(0.015, grilleH, 0.02, housingDark, housingW * 0.35, grilleY + grilleH / 2, -housingD / 2 + 0.005));

  // Side grilles (smaller)
  for (const sx of [-housingW / 2, housingW / 2]) {
    const sDir = sx > 0 ? 1 : -1;
    g.add(box(0.01, grilleH * 0.6, housingD * 0.5, grilleMat, sx + sDir * 0.003, grilleY + grilleH * 0.3, 0));
    for (let s = 0; s < 8; s++) {
      const sy = grilleY + grilleH * 0.1 + s * (grilleH * 0.55 / 8);
      g.add(box(0.015, 0.008, housingD * 0.48, housingDark, sx + sDir * 0.005, sy, 0, 0, 0, 0));
    }
  }

  // ── Electric Motor (visible through grille) ──
  const motorY = houseY + housingH * 0.35;
  // Motor body
  g.add(cyl(0.12, 0.12, 0.3, 16, motorMat, 0, motorY, 0, 0, 0, Math.PI / 2));
  // Motor cooling fins
  for (let f = 0; f < 12; f++) {
    const angle = (f / 12) * Math.PI * 2;
    g.add(box(0.005, 0.13, 0.28, motorMat, Math.cos(angle) * 0.12, motorY + Math.sin(angle) * 0.12, 0));
  }
  // Motor end bell (front)
  g.add(cyl(0.1, 0.13, 0.03, 16, motorMat, 0, motorY, -0.16));
  // Motor end bell (back)
  g.add(cyl(0.1, 0.13, 0.03, 16, motorMat, 0, motorY, 0.16));
  // Motor shaft
  g.add(cyl(0.015, 0.015, 0.08, 8, M.chrome, 0, motorY, -0.2));
  // Motor nameplate
  g.add(box(0.08, 0.04, 0.003, labelWhite, 0.1, motorY + 0.05, -0.05));
  // Motor junction box
  g.add(box(0.06, 0.04, 0.05, motorMat, 0, motorY + 0.14, 0));
  // Motor winding visible (copper)
  g.add(cyl(0.08, 0.08, 0.05, 12, motorCopper, 0, motorY, 0.08));

  // Compressor pump head (on top of motor shaft side)
  g.add(cyl(0.1, 0.08, 0.15, 12, housingDark, 0, motorY + 0.05, -0.25));
  // Cylinder heads
  g.add(cyl(0.06, 0.06, 0.08, 10, pipeMat, -0.07, motorY + 0.12, -0.25));
  g.add(cyl(0.06, 0.06, 0.08, 10, pipeMat, 0.07, motorY + 0.12, -0.25));
  // Cooling fins on cylinders
  for (const cx of [-0.07, 0.07]) {
    for (let f = 0; f < 4; f++) {
      g.add(cyl(0.07, 0.07, 0.005, 10, pipeMat, cx, motorY + 0.1 + f * 0.02, -0.25));
    }
  }

  // ── Air Receiver Tank (horizontal cylinder) ──
  const tankX = housingW / 2 + 0.1 + tankLen / 2;
  const tankY = tankR + 0.05;
  // Main tank body
  g.add(cyl(tankR, tankR, tankLen, 20, tankMat, tankX, tankY, 0, 0, 0, Math.PI / 2));
  // End caps (hemispheres approximated with spheres)
  g.add(sph(tankR, tankEndCap, tankX - tankLen / 2, tankY, 0));
  g.add(sph(tankR, tankEndCap, tankX + tankLen / 2, tankY, 0));
  // Tank weld seams
  for (const wx of [-0.2, 0, 0.2]) {
    g.add(cyl(tankR + 0.003, tankR + 0.003, 0.008, 20, pipeMat, tankX + wx, tankY, 0));
  }
  // Tank support saddles
  for (const sx of [tankX - tankLen * 0.3, tankX + tankLen * 0.3]) {
    g.add(box(0.04, tankR + 0.05, 0.25, housingDark, sx, (tankR + 0.05) / 2 + 0.05, 0));
    // Saddle strap
    g.add(cyl(tankR + 0.01, tankR + 0.01, 0.02, 16, pipeMat, sx, tankY, 0));
  }
  // Tank nameplate
  g.add(box(0.1, 0.06, 0.003, labelWhite, tankX, tankY + tankR + 0.002, 0.05, -Math.PI / 2 + 0.1, 0, 0));

  // ── Pressure Gauges (2 on tank, 1 on compressor) ──
  const gaugePositions = [
    [tankX - 0.2, tankY + tankR, 0, -Math.PI / 2, 0, 0],
    [tankX + 0.3, tankY + tankR, 0, -Math.PI / 2, 0, 0],
    [0, houseY + housingH, 0.1, -Math.PI / 2, 0, 0],
  ];
  for (const [gx, gy, gz, grx, gry, grz] of gaugePositions) {
    // Gauge body
    g.add(cyl(0.03, 0.03, 0.02, 16, gaugeRim, gx, gy + 0.01, gz, grx, gry, grz));
    // Gauge face
    g.add(cyl(0.025, 0.025, 0.005, 16, gaugeFace, gx, gy + 0.02, gz, grx, gry, grz));
    // Gauge glass
    g.add(cyl(0.028, 0.028, 0.003, 16, M.glass, gx, gy + 0.025, gz, grx, gry, grz));
    // Needle
    g.add(box(0.02, 0.003, 0.003, gaugeNeedle, gx + 0.005, gy + 0.022, gz, grx, gry, grz + 0.5));
    // Center pin
    g.add(cyl(0.003, 0.003, 0.004, 6, boltMat, gx, gy + 0.022, gz, grx, gry, grz));
    // Pipe stub underneath
    g.add(cyl(0.008, 0.008, 0.03, 6, pipeMat, gx, gy - 0.01, gz));
  }

  // ── Pressure Relief Valve on tank ──
  const prvX = tankX + 0.1;
  const prvY = tankY + tankR;
  g.add(cyl(0.015, 0.015, 0.05, 8, valveMat, prvX, prvY + 0.025, -0.12));
  g.add(cyl(0.02, 0.02, 0.01, 8, valveMat, prvX, prvY + 0.05, -0.12));
  // Relief valve cap
  g.add(sph(0.012, valveRed, prvX, prvY + 0.06, -0.12));
  // Discharge pipe (bent down)
  g.add(cyl(0.008, 0.008, 0.08, 6, pipeMat, prvX + 0.015, prvY + 0.01, -0.12, 0, 0, Math.PI / 4));

  // ── Condensate Drain Valve ──
  const drainX = tankX;
  const drainY = tankY - tankR;
  g.add(cyl(0.01, 0.01, 0.04, 8, valveMat, drainX, drainY - 0.02, 0));
  // Drain handle (ball valve)
  g.add(box(0.04, 0.008, 0.008, valveRed, drainX, drainY - 0.04, 0));
  // Drain pipe stub
  g.add(cyl(0.008, 0.008, 0.03, 6, pipeMat, drainX, drainY - 0.055, 0));

  // ── Air Dryer Unit (smaller box beside) ──
  const dryerX = housingW / 2 + 0.1 + tankLen + 0.2;
  const dryerW = 0.35;
  const dryerH = 0.6;
  const dryerD = 0.3;
  const dryerY = 0.05;
  g.add(box(dryerW, dryerH, dryerD, dryerBox, dryerX, dryerY + dryerH / 2, 0));
  // Dryer top panel
  g.add(box(dryerW + 0.01, 0.01, dryerD + 0.01, housingDark, dryerX, dryerY + dryerH, 0));
  // Dryer ventilation slots
  for (let vs = 0; vs < 6; vs++) {
    g.add(box(dryerW * 0.6, 0.008, 0.004, housingDark, dryerX, dryerY + 0.15 + vs * 0.06, -dryerD / 2 - 0.002));
  }
  // Dryer inlet/outlet ports
  g.add(cyl(0.015, 0.015, 0.04, 8, pipeMat, dryerX - dryerW / 2, dryerY + dryerH * 0.7, 0, 0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, 0.04, 8, pipeMat, dryerX + dryerW / 2, dryerY + dryerH * 0.7, 0, 0, 0, Math.PI / 2));
  // Dryer condensate drain
  g.add(cyl(0.008, 0.008, 0.03, 6, valveMat, dryerX, dryerY - 0.015, 0));
  // Dryer nameplate
  g.add(box(0.06, 0.03, 0.003, labelWhite, dryerX, dryerY + dryerH * 0.85, -dryerD / 2 - 0.002));
  // Dryer rubber feet
  for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]] as [number, number][]) {
    g.add(cyl(0.025, 0.03, 0.03, 8, rubberMount, dryerX + dx, 0.02, dz));
  }

  // ── Piping Connections (inlet/outlet manifold) ──
  // Main compressed air outlet from tank to dryer
  g.add(cyl(0.02, 0.02, 0.4, 8, pipeCopper, tankX + tankLen / 2 + 0.2, tankY, 0, 0, 0, Math.PI / 2));
  // Pipe from compressor to tank
  g.add(cyl(0.018, 0.018, 0.3, 8, pipeCopper, housingW / 2 + 0.15, houseY + housingH * 0.6, 0, 0, 0, Math.PI / 2));
  // Vertical drop pipe
  g.add(cyl(0.018, 0.018, 0.25, 8, pipeCopper, housingW / 2 + 0.3, houseY + housingH * 0.45, 0));
  // Elbow fittings (simplified as spheres)
  g.add(sph(0.025, pipeMat, housingW / 2 + 0.3, houseY + housingH * 0.6, 0));
  g.add(sph(0.025, pipeMat, housingW / 2 + 0.3, tankY, 0));
  // Output manifold after dryer
  g.add(cyl(0.015, 0.015, 0.2, 8, pipeCopper, dryerX + dryerW / 2 + 0.1, dryerY + dryerH * 0.7, 0, 0, 0, Math.PI / 2));
  // Shut-off valve
  g.add(cyl(0.02, 0.02, 0.04, 8, valveMat, dryerX + dryerW / 2 + 0.12, dryerY + dryerH * 0.7, 0, 0, 0, Math.PI / 2));
  g.add(box(0.03, 0.008, 0.008, valveRed, dryerX + dryerW / 2 + 0.12, dryerY + dryerH * 0.7 + 0.02, 0));

  // ── Filter/Regulator Assembly ──
  const frX = dryerX + dryerW / 2 + 0.25;
  const frY = dryerY + dryerH * 0.7;
  // Filter bowl
  g.add(cyl(0.025, 0.02, 0.08, 12, filterMat, frX, frY - 0.04, 0));
  // Filter bowl (transparent lower part)
  g.add(cyl(0.02, 0.018, 0.04, 12, mat(0xaabbcc, 0.1, 0.2, { transparent: true, opacity: 0.35 }), frX, frY - 0.08, 0));
  // Filter head
  g.add(cyl(0.03, 0.03, 0.025, 10, filterMat, frX, frY + 0.01, 0));
  // Regulator knob
  g.add(cyl(0.02, 0.02, 0.015, 10, M.rubber, frX, frY + 0.03, 0));
  // Small pressure gauge on regulator
  g.add(cyl(0.015, 0.015, 0.01, 12, gaugeRim, frX + 0.02, frY + 0.02, -0.02, 0, 0.5, 0));
  g.add(cyl(0.012, 0.012, 0.003, 12, gaugeFace, frX + 0.025, frY + 0.02, -0.025, 0, 0.5, 0));
  // Filter drain
  g.add(cyl(0.008, 0.008, 0.015, 6, valveMat, frX, frY - 0.1, 0));

  // ── Control Panel with pressure display ──
  const cpX = -housingW / 2 + 0.005;
  const cpY = houseY + housingH * 0.55;
  const cpW = 0.005;
  const cpH2 = 0.25;
  const cpD2 = 0.25;
  // Panel face (mounted on left side of housing)
  g.add(box(cpW, cpH2, cpD2, controlPanel, cpX - 0.005, cpY, 0));
  // Panel bezel
  g.add(box(cpW + 0.003, cpH2 + 0.01, cpD2 + 0.01, housingDark, cpX - 0.003, cpY, 0));
  // Digital pressure display
  g.add(box(0.003, 0.04, 0.1, displayGreen, cpX - 0.01, cpY + 0.06, 0));
  // Start button (green)
  g.add(cyl(0.012, 0.012, 0.01, 10, mat(0x00aa00, 0.2, 0.5), cpX - 0.015, cpY - 0.02, -0.06, 0, 0, Math.PI / 2));
  // Stop button (red)
  g.add(cyl(0.012, 0.012, 0.01, 10, mat(0xaa0000, 0.2, 0.5), cpX - 0.015, cpY - 0.02, 0.06, 0, 0, Math.PI / 2));
  // Mode selector switch
  g.add(cyl(0.008, 0.008, 0.015, 8, boltMat, cpX - 0.015, cpY - 0.06, 0, 0, 0, Math.PI / 2));
  g.add(box(0.008, 0.02, 0.005, boltMat, cpX - 0.02, cpY - 0.06, 0.01));
  // Indicator lights on panel
  for (let li = 0; li < 3; li++) {
    g.add(cyl(0.006, 0.006, 0.005, 8,
      li === 0 ? mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }) :
      li === 1 ? mat(0xffcc00, 0.1, 0.3, { emissive: 0x665500, emissiveIntensity: 0.3 }) :
               mat(0xff0000, 0.1, 0.3, { emissive: 0x440000, emissiveIntensity: 0.2 }),
      cpX - 0.012, cpY + 0.1, -0.06 + li * 0.06, 0, 0, Math.PI / 2));
  }
  // Panel label
  g.add(box(0.003, 0.015, 0.08, labelWhite, cpX - 0.01, cpY - 0.1, 0));

  // ── Status Light ──
  g.add(createStatusLight(-housingW / 2 - 0.05, houseY + housingH, -housingD / 2 + 0.05));

  return g;
}
