import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildSilo(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const siloBody = mat(0xb0b8c4, 0.55, 0.35);
  const siloTop = mat(0xa0a8b4, 0.5, 0.4);
  const hopperMat = mat(0x909aa8, 0.55, 0.4);
  const legSteel = mat(0x606878, 0.7, 0.3);
  const ladderMat = mat(0x707880, 0.65, 0.35);
  const valveMat = mat(0x556070, 0.7, 0.3);
  const handwheelMat = mat(0xcc3333, 0.2, 0.5);
  const sightGlass = mat(0x88ccee, 0.0, 0.1, { transparent: true, opacity: 0.4 });
  const ventMat = mat(0x808890, 0.5, 0.4);
  const hatchMat = mat(0x707880, 0.6, 0.35);
  const gasketMat = mat(0x1a1a1a, 0.0, 0.85);
  const fillPortMat = mat(0x6a7080, 0.6, 0.4);

  // ── Dimensions ──
  const bodyR = 0.25;
  const bodyH = 0.9;
  const hopperH = 0.3;
  const hopperBottomR = 0.04;
  const legH = 0.35;
  const totalH = legH + hopperH + bodyH;
  const bodyBaseY = legH + hopperH;
  const bodyCenterY = bodyBaseY + bodyH / 2;

  // ── Support Legs (4) ──
  const legCount = 4;
  for (let i = 0; i < legCount; i++) {
    const angle = (i / legCount) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(angle) * bodyR * 0.85;
    const lz = Math.sin(angle) * bodyR * 0.85;

    // Main leg (angled outward)
    const footX = Math.cos(angle) * bodyR * 1.3;
    const footZ = Math.sin(angle) * bodyR * 1.3;
    const legLen = Math.sqrt((footX - lx) ** 2 + (legH + hopperH) ** 2);
    const legAngle = Math.atan2(footX - lx, legH + hopperH);

    // Leg column
    g.add(box(0.03, legLen, 0.03, legSteel,
      (lx + footX) / 2, (legH + hopperH) / 2, (lz + footZ) / 2,
      0, angle, legAngle));

    // Foot plate
    g.add(box(0.08, 0.01, 0.08, legSteel, footX, 0.005, footZ));
    // Anchor bolts on foot plate
    for (const [dx, dz] of [[-0.025, -0.025], [0.025, -0.025], [-0.025, 0.025], [0.025, 0.025]]) {
      g.add(cyl(0.005, 0.005, 0.015, 6, M.darkChrome, footX + dx, 0.015, footZ + dz));
    }

    // Cross bracing between legs
    const nextAngle = ((i + 1) % legCount / legCount) * Math.PI * 2 + Math.PI / 4;
    const nextFootX = Math.cos(nextAngle) * bodyR * 1.3;
    const nextFootZ = Math.sin(nextAngle) * bodyR * 1.3;
    const braceLen = Math.sqrt((nextFootX - footX) ** 2 + (nextFootZ - footZ) ** 2);
    const braceAngle = Math.atan2(nextFootZ - footZ, nextFootX - footX);
    // Horizontal brace
    g.add(box(braceLen, 0.02, 0.02, legSteel,
      (footX + nextFootX) / 2, legH * 0.4, (footZ + nextFootZ) / 2,
      0, -braceAngle + Math.PI / 2, 0));

    // Gusset plate at top of leg
    g.add(box(0.06, 0.06, 0.005, legSteel, lx, bodyBaseY - 0.03, lz, 0, angle, 0));
  }

  // ── Conical Bottom Hopper Section ──
  g.add(cyl(bodyR, hopperBottomR, hopperH, 24, hopperMat, 0, legH + hopperH / 2, 0));
  // Hopper reinforcement rings
  for (const ht of [0.3, 0.6, 0.85]) {
    const ringY = legH + hopperH * ht;
    const ringR = hopperBottomR + (bodyR - hopperBottomR) * ht;
    g.add(cyl(ringR + 0.005, ringR + 0.005, 0.012, 24, legSteel, 0, ringY, 0));
  }

  // ── Discharge Gate/Valve at Bottom ──
  // Valve body
  g.add(cyl(0.05, 0.05, 0.06, 12, valveMat, 0, legH - 0.01, 0));
  // Valve flange top
  g.add(cyl(0.065, 0.065, 0.012, 12, valveMat, 0, legH + 0.02, 0));
  // Valve flange bottom
  g.add(cyl(0.065, 0.065, 0.012, 12, valveMat, 0, legH - 0.04, 0));
  // Flange bolts
  for (let i = 0; i < 8; i++) {
    const ba = (i / 8) * Math.PI * 2;
    g.add(cyl(0.005, 0.005, 0.016, 6, M.darkChrome,
      Math.cos(ba) * 0.055, legH + 0.02, Math.sin(ba) * 0.055));
    g.add(cyl(0.005, 0.005, 0.016, 6, M.darkChrome,
      Math.cos(ba) * 0.055, legH - 0.04, Math.sin(ba) * 0.055));
  }
  // Handwheel for valve
  g.add(cyl(0.04, 0.04, 0.008, 12, handwheelMat, 0.07, legH - 0.01, 0, 0, 0, Math.PI / 2));
  // Handwheel spokes
  for (let i = 0; i < 4; i++) {
    const sa = (i / 4) * Math.PI * 2;
    g.add(box(0.035, 0.005, 0.005, handwheelMat,
      0.075, legH - 0.01 + Math.cos(sa) * 0.03, Math.sin(sa) * 0.03));
  }
  // Handwheel hub
  g.add(cyl(0.01, 0.01, 0.015, 8, M.darkChrome, 0.075, legH - 0.01, 0, 0, 0, Math.PI / 2));
  // Discharge chute below valve
  g.add(cyl(0.04, 0.035, 0.08, 10, valveMat, 0, legH - 0.08, 0));

  // ── Cylindrical Body ──
  g.add(cyl(bodyR, bodyR, bodyH, 32, siloBody, 0, bodyCenterY, 0));
  // Body reinforcement rings/bands
  for (let i = 0; i < 4; i++) {
    const ringY = bodyBaseY + 0.1 + i * (bodyH - 0.2) / 3;
    g.add(cyl(bodyR + 0.006, bodyR + 0.006, 0.015, 32, legSteel, 0, ringY, 0));
  }
  // Weld seam line (vertical)
  g.add(box(0.004, bodyH, 0.001, mat(0x8090a0, 0.4, 0.5), bodyR - 0.002, bodyCenterY, 0));

  // ── Top Dome/Roof ──
  g.add(cyl(bodyR, bodyR * 0.95, 0.04, 32, siloTop, 0, bodyBaseY + bodyH + 0.02, 0));
  // Slight dome
  g.add(cyl(bodyR * 0.95, bodyR * 0.6, 0.06, 24, siloTop, 0, bodyBaseY + bodyH + 0.07, 0));
  g.add(cyl(bodyR * 0.6, bodyR * 0.3, 0.04, 20, siloTop, 0, bodyBaseY + bodyH + 0.12, 0));

  // ── Top Fill Port with Lid ──
  const fillY = totalH + 0.1;
  g.add(cyl(0.06, 0.06, 0.04, 12, fillPortMat, 0, fillY, 0));
  // Lid (slightly offset to show it can open)
  g.add(cyl(0.07, 0.07, 0.008, 12, fillPortMat, 0.01, fillY + 0.024, 0.01));
  // Lid handle
  g.add(box(0.04, 0.02, 0.008, M.darkChrome, 0.01, fillY + 0.038, 0.01));
  // Lid hinge
  g.add(cyl(0.006, 0.006, 0.03, 6, M.darkChrome, -0.04, fillY + 0.02, 0, 0, 0, Math.PI / 2));
  // Gasket ring
  g.add(cyl(0.062, 0.062, 0.006, 16, gasketMat, 0, fillY + 0.018, 0));

  // ── Vent Pipe on Top ──
  g.add(cyl(0.02, 0.02, 0.12, 8, ventMat, 0.1, fillY + 0.06, 0.05));
  // Vent cap (rain hat)
  g.add(cyl(0.035, 0.035, 0.005, 10, ventMat, 0.1, fillY + 0.13, 0.05));
  g.add(cyl(0.015, 0.035, 0.02, 10, ventMat, 0.1, fillY + 0.14, 0.05));
  // Vent screen
  g.add(cyl(0.021, 0.021, 0.01, 10, mat(0x909090, 0.3, 0.5, { transparent: true, opacity: 0.5 }), 0.1, fillY + 0.115, 0.05));

  // ── Access Ladder on Side ──
  const ladderAngle = Math.PI * 0.7;
  const ladderX = Math.cos(ladderAngle) * (bodyR + 0.02);
  const ladderZ = Math.sin(ladderAngle) * (bodyR + 0.02);

  // Ladder rails
  for (const offset of [-0.04, 0.04]) {
    const rOff = (bodyR + 0.025);
    const rx = Math.cos(ladderAngle) * rOff + Math.cos(ladderAngle + Math.PI / 2) * offset;
    const rz = Math.sin(ladderAngle) * rOff + Math.sin(ladderAngle + Math.PI / 2) * offset;
    g.add(box(0.01, totalH + 0.05, 0.01, ladderMat, rx, (totalH + 0.05) / 2, rz));
  }
  // Ladder rungs
  for (let h = 0.3; h < totalH + 0.05; h += 0.1) {
    g.add(cyl(0.005, 0.005, 0.08, 6, ladderMat,
      ladderX, h, ladderZ,
      0, ladderAngle, Math.PI / 2));
  }
  // Ladder safety cage (hoops around ladder, upper section only)
  for (let h = bodyBaseY; h < totalH; h += 0.15) {
    const cageR = 0.08;
    const segments = 8;
    for (let s = 0; s < segments; s++) {
      const a1 = ladderAngle - Math.PI / 2 + (s / segments) * Math.PI;
      const a2 = ladderAngle - Math.PI / 2 + ((s + 1) / segments) * Math.PI;
      const cx1 = ladderX + Math.cos(a1) * cageR;
      const cz1 = ladderZ + Math.sin(a1) * cageR;
      const cx2 = ladderX + Math.cos(a2) * cageR;
      const cz2 = ladderZ + Math.sin(a2) * cageR;
      const segLen = Math.sqrt((cx2 - cx1) ** 2 + (cz2 - cz1) ** 2);
      const segAngle = Math.atan2(cz2 - cz1, cx2 - cx1);
      g.add(box(segLen, 0.006, 0.006, ladderMat,
        (cx1 + cx2) / 2, h, (cz1 + cz2) / 2, 0, -segAngle + Math.PI / 2, 0));
    }
  }
  // Ladder mounting brackets
  for (const h of [bodyBaseY + 0.2, bodyCenterY, bodyBaseY + bodyH - 0.1]) {
    g.add(box(0.03, 0.03, 0.03, legSteel, ladderX * 0.95, h, ladderZ * 0.95));
  }

  // ── Level Indicator (sight glass strip) ──
  const glassAngle = Math.PI * 0.2;
  const glassX = Math.cos(glassAngle) * (bodyR + 0.005);
  const glassZ = Math.sin(glassAngle) * (bodyR + 0.005);
  // Glass tube housing
  g.add(box(0.02, bodyH * 0.7, 0.015, legSteel, glassX, bodyCenterY, glassZ, 0, glassAngle, 0));
  // Glass tube
  g.add(box(0.008, bodyH * 0.65, 0.008, sightGlass, glassX, bodyCenterY, glassZ, 0, glassAngle, 0));
  // Level indication (material visible through glass at ~60% full)
  g.add(box(0.007, bodyH * 0.35, 0.007, mat(0xddcc88, 0.0, 0.7, { transparent: true, opacity: 0.6 }),
    glassX, bodyBaseY + bodyH * 0.22, glassZ, 0, glassAngle, 0));
  // Top and bottom valves for sight glass
  for (const hy of [bodyBaseY + 0.08, bodyBaseY + bodyH - 0.08]) {
    g.add(cyl(0.012, 0.012, 0.02, 8, valveMat, glassX * 1.05, hy, glassZ * 1.05, 0, glassAngle, Math.PI / 2));
  }
  // Scale markings alongside sight glass
  for (let i = 0; i <= 10; i++) {
    const my = bodyBaseY + 0.08 + i * (bodyH * 0.65) / 10;
    g.add(box(0.015, 0.002, 0.002, M.bodyDark, glassX * 1.1, my, glassZ * 1.1));
  }

  // ── Inspection Hatch on Body ──
  const hatchAngle = Math.PI * 1.3;
  const hatchX = Math.cos(hatchAngle) * (bodyR + 0.003);
  const hatchZ = Math.sin(hatchAngle) * (bodyR + 0.003);
  const hatchY = bodyCenterY + 0.1;
  // Hatch ring
  g.add(cyl(0.08, 0.08, 0.015, 16, hatchMat, hatchX, hatchY, hatchZ, Math.PI / 2, hatchAngle + Math.PI / 2, 0));
  // Hatch cover
  g.add(cyl(0.065, 0.065, 0.01, 16, hatchMat, hatchX * 1.02, hatchY, hatchZ * 1.02, Math.PI / 2, hatchAngle + Math.PI / 2, 0));
  // Hatch bolts
  for (let i = 0; i < 8; i++) {
    const ba = (i / 8) * Math.PI * 2;
    const bx = hatchX + Math.cos(ba) * 0.065 * Math.cos(hatchAngle);
    const bz = hatchZ + Math.cos(ba) * 0.065 * Math.sin(hatchAngle);
    const by = hatchY + Math.sin(ba) * 0.065;
    g.add(cyl(0.005, 0.005, 0.012, 6, M.darkChrome, bx * 1.01, by, bz * 1.01));
  }
  // Hatch handle
  g.add(box(0.05, 0.008, 0.008, M.darkChrome, hatchX * 1.04, hatchY, hatchZ * 1.04, 0, hatchAngle + Math.PI / 2, 0));

  // ── Piping Connections ──
  // Inlet pipe (side of body)
  const pipeAngle = Math.PI * 0.5;
  const pipeX = Math.cos(pipeAngle) * (bodyR + 0.04);
  const pipeZ = Math.sin(pipeAngle) * (bodyR + 0.04);
  g.add(cyl(0.025, 0.025, 0.1, 10, M.pipe, pipeX, bodyCenterY - 0.1, pipeZ, 0, 0, Math.PI / 2));
  // Pipe flange
  g.add(cyl(0.04, 0.04, 0.012, 10, M.pipe, pipeX + 0.05, bodyCenterY - 0.1, pipeZ, 0, 0, Math.PI / 2));
  // Flange bolts
  for (let i = 0; i < 6; i++) {
    const fa = (i / 6) * Math.PI * 2;
    g.add(cyl(0.004, 0.004, 0.015, 6, M.darkChrome,
      pipeX + 0.055, bodyCenterY - 0.1 + Math.cos(fa) * 0.032, pipeZ + Math.sin(fa) * 0.032));
  }

  // Outlet pipe (from discharge)
  g.add(cyl(0.02, 0.02, 0.15, 8, M.pipe, 0.08, legH - 0.12, 0, 0, 0, Math.PI / 4));

  // ── Pressure Relief Valve on Top ──
  g.add(cyl(0.015, 0.015, 0.04, 8, valveMat, -0.08, fillY + 0.02, -0.05));
  g.add(cyl(0.02, 0.02, 0.008, 8, M.red, -0.08, fillY + 0.044, -0.05));

  // ── Status Light ──
  g.add(createStatusLight(bodyR + 0.08, bodyBaseY + 0.15, 0));

  return g;
}
