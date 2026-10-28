import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildPackagingMachine(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const frameMetal = mat(0x505868, 0.75, 0.3);
  const machineBlue = mat(0x2855a0, 0.4, 0.5);
  const filmClear = mat(0xccddee, 0.0, 0.05, {
    transparent: true, opacity: 0.2, side: THREE.DoubleSide,
  });
  const filmRoll = mat(0xccddee, 0.0, 0.1, {
    transparent: true, opacity: 0.35,
  });
  const rollerChrome = mat(0xaab0b8, 0.85, 0.18);
  const safetyYellow = mat(0xddaa00, 0.1, 0.6);
  const conveyorRoller = mat(0x667080, 0.7, 0.35);
  const rampPlate = mat(0x556068, 0.6, 0.4);
  const lightCurtainRed = mat(0xff1111, 0.0, 0.3, {
    emissive: 0xff0000, emissiveIntensity: 1.5,
  });
  const controlPanel = mat(0x3a4050, 0.5, 0.5);

  // ====== TURNTABLE BASE ======
  // Base platform (octagonal approximation)
  g.add(cyl(0.85, 0.85, 0.12, 24, frameMetal, 0, 0.06, 0));
  // Turntable rotating platform
  g.add(cyl(0.75, 0.75, 0.06, 24, M.darkChrome, 0, 0.15, 0));
  // Rotation ring bearing
  g.add(cyl(0.8, 0.78, 0.03, 32, M.chrome, 0, 0.1, 0));
  // Drive motor housing underneath
  g.add(box(0.2, 0.1, 0.15, M.bodyDark, 0.5, 0.04, 0.3));
  // Turntable surface markings / alignment guides
  g.add(box(1.3, 0.005, 0.03, safetyYellow, 0, 0.185, 0));
  g.add(box(0.03, 0.005, 1.3, safetyYellow, 0, 0.185, 0));

  // ====== CONVEYOR ROLLERS INTEGRATED INTO TURNTABLE ======
  for (let z = -0.5; z <= 0.5; z += 0.1) {
    g.add(cyl(0.03, 0.03, 1.2, 12, conveyorRoller, 0, 0.21, z,
      0, 0, Math.PI / 2));
    // Roller end caps
    g.add(cyl(0.035, 0.035, 0.01, 8, M.darkChrome, -0.6, 0.21, z,
      0, 0, Math.PI / 2));
    g.add(cyl(0.035, 0.035, 0.01, 8, M.darkChrome, 0.6, 0.21, z,
      0, 0, Math.PI / 2));
  }
  // Roller frame sides
  g.add(box(0.04, 0.06, 1.1, frameMetal, -0.62, 0.2, 0));
  g.add(box(0.04, 0.06, 1.1, frameMetal, 0.62, 0.2, 0));

  // ====== PALLET ON TURNTABLE ======
  // Pallet base
  g.add(box(0.9, 0.05, 0.9, M.pallet, 0, 0.27, 0));
  // Pallet slats
  for (let x = -0.35; x <= 0.35; x += 0.175) {
    g.add(box(0.12, 0.08, 0.9, M.pallet, x, 0.24, 0));
  }
  // Boxes on pallet (load to wrap)
  for (let layer = 0; layer < 2; layer++) {
    for (let bx = -0.25; bx <= 0.25; bx += 0.25) {
      for (let bz = -0.25; bz <= 0.25; bz += 0.25) {
        g.add(box(0.22, 0.2, 0.22, M.cardboard,
          bx, 0.4 + layer * 0.2, bz));
      }
    }
  }

  // ====== MAST / COLUMN ======
  const mastX = -1.0;
  // Main vertical column
  g.add(box(0.15, 2.6, 0.15, machineBlue, mastX, 1.3, 0));
  // Column reinforcement plates
  g.add(box(0.18, 0.04, 0.18, frameMetal, mastX, 0.05, 0));
  g.add(box(0.18, 0.04, 0.18, frameMetal, mastX, 2.6, 0));
  // Guide rails on column
  g.add(box(0.025, 2.4, 0.04, M.chrome, mastX + 0.08, 1.3, -0.06));
  g.add(box(0.025, 2.4, 0.04, M.chrome, mastX + 0.08, 1.3, 0.06));
  // Column anchor bolts at base
  for (const sz of [-0.08, 0.08]) {
    for (const sx of [-0.08, 0.08]) {
      g.add(cyl(0.015, 0.015, 0.03, 6, M.chrome,
        mastX + sx, 0.02, sz));
    }
  }
  // Lead screw inside column
  g.add(cyl(0.02, 0.02, 2.3, 8, M.chrome, mastX + 0.04, 1.3, 0));

  // ====== FILM CARRIAGE ON MAST ======
  const carriageY = 0.8;
  // Carriage body
  g.add(box(0.3, 0.25, 0.25, machineBlue, mastX + 0.2, carriageY, 0));
  // Linear bearings / guide blocks
  g.add(box(0.06, 0.08, 0.06, M.darkChrome, mastX + 0.09, carriageY, -0.06));
  g.add(box(0.06, 0.08, 0.06, M.darkChrome, mastX + 0.09, carriageY, 0.06));
  // Carriage motor
  g.add(box(0.08, 0.08, 0.08, M.bodyDark, mastX + 0.2, carriageY + 0.18, 0));

  // ====== FILM ROLL HOLDER ON CARRIAGE ======
  const frX = mastX + 0.35;
  // Roll spindle
  g.add(cyl(0.025, 0.025, 0.25, 8, M.chrome, frX, carriageY, 0,
    0, 0, Math.PI / 2));
  // Film roll
  g.add(cyl(0.12, 0.12, 0.15, 16, filmRoll, frX, carriageY, 0));
  g.add(cyl(0.04, 0.04, 0.16, 12, M.darkChrome, frX, carriageY, 0));
  // Film tail trailing to load (representing wrapping)
  g.add(box(0.5, 0.6, 0.003, filmClear, frX + 0.3, carriageY, 0.15));

  // ====== PRE-STRETCH ROLLERS ======
  const psX = frX + 0.08;
  // Roller pair
  g.add(cyl(0.03, 0.03, 0.15, 10, rollerChrome,
    psX, carriageY + 0.1, -0.08));
  g.add(cyl(0.025, 0.025, 0.15, 10, rollerChrome,
    psX + 0.06, carriageY + 0.08, -0.08));
  // Roller mounting bracket
  g.add(box(0.12, 0.04, 0.04, M.darkChrome, psX + 0.03, carriageY + 0.14, -0.08));
  // Film guide idler roller
  g.add(cyl(0.02, 0.02, 0.15, 8, rollerChrome,
    psX + 0.1, carriageY - 0.05, -0.06));

  // ====== FILM CLAMP / CUT MECHANISM ======
  g.add(box(0.08, 0.06, 0.06, M.darkChrome, frX, carriageY - 0.18, 0));
  // Clamp jaw
  g.add(box(0.06, 0.015, 0.04, M.chrome, frX + 0.02, carriageY - 0.16, 0));
  // Pneumatic actuator for clamp
  g.add(cyl(0.015, 0.015, 0.06, 8, M.pipe, frX - 0.02, carriageY - 0.22, 0));
  // Cut blade housing
  g.add(box(0.04, 0.03, 0.035, M.bodyDark, frX + 0.04, carriageY - 0.2, 0));

  // ====== TOP PLATEN PRESS ======
  const topY = 2.4;
  // Platen arm extending from mast
  g.add(box(0.8, 0.06, 0.15, machineBlue, mastX + 0.5, topY, 0));
  // Platen press plate
  g.add(box(0.6, 0.04, 0.6, frameMetal, mastX + 0.8, topY - 0.05, 0));
  // Press cylinder
  g.add(cyl(0.04, 0.04, 0.15, 10, M.chrome, mastX + 0.5, topY + 0.1, 0));
  // Rubber pad on bottom
  g.add(box(0.55, 0.02, 0.55, M.rubber, mastX + 0.8, topY - 0.08, 0));

  // ====== CONTROL PANEL WITH CYCLE COUNTER ======
  const cpX = mastX - 0.15;
  const cpY = 1.2;
  // Panel enclosure
  g.add(box(0.35, 0.45, 0.08, controlPanel, cpX, cpY, 0.2));
  // Screen / display
  g.add(box(0.25, 0.12, 0.005, M.screenActive, cpX, cpY + 0.1, 0.245));
  // Cycle counter display
  g.add(box(0.12, 0.05, 0.005, mat(0x001100, 0, 0.9, {
    emissive: 0x00ff44, emissiveIntensity: 0.9,
  }), cpX, cpY - 0.02, 0.245));
  // Start button
  g.add(cyl(0.025, 0.025, 0.015, 10, mat(0x00aa44, 0.2, 0.5),
    cpX - 0.08, cpY - 0.1, 0.245));
  // Stop button
  g.add(cyl(0.025, 0.025, 0.015, 10, M.red,
    cpX + 0.08, cpY - 0.1, 0.245));
  // E-stop
  g.add(cyl(0.03, 0.03, 0.02, 12, M.red,
    cpX, cpY - 0.16, 0.245));
  g.add(cyl(0.035, 0.035, 0.005, 12, safetyYellow,
    cpX, cpY - 0.165, 0.245));
  // Speed adjustment knob
  g.add(cyl(0.02, 0.02, 0.02, 10, M.chrome,
    cpX - 0.08, cpY - 0.16, 0.245));
  // Mode selector
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome,
    cpX + 0.08, cpY - 0.16, 0.245));
  // Panel mounting arm
  g.add(box(0.04, 0.04, 0.15, M.darkChrome, cpX, cpY, 0.1));

  // ====== RAMP FOR PALLET ENTRY ======
  const rampZ = 1.1;
  g.add(box(1.0, 0.06, 0.6, rampPlate, 0, 0.12, rampZ, -0.1, 0, 0));
  // Ramp side rails
  g.add(box(0.04, 0.1, 0.6, frameMetal, -0.5, 0.15, rampZ));
  g.add(box(0.04, 0.1, 0.6, frameMetal, 0.5, 0.15, rampZ));
  // Ramp support legs
  g.add(box(0.04, 0.1, 0.04, frameMetal, -0.45, 0.05, rampZ + 0.2));
  g.add(box(0.04, 0.1, 0.04, frameMetal, 0.45, 0.05, rampZ + 0.2));
  // Yellow safety stripe on ramp edge
  g.add(box(0.9, 0.01, 0.05, safetyYellow, 0, 0.1, rampZ + 0.3));

  // ====== SAFETY LIGHT CURTAIN AT ENTRY ======
  for (const sx of [-1, 1]) {
    const lcX = sx * 0.6;
    // Post
    g.add(box(0.05, 1.4, 0.05, safetyYellow, lcX, 0.78, rampZ + 0.05));
    // Red emitter strip
    g.add(box(0.02, 1.2, 0.02, lightCurtainRed, lcX, 0.78, rampZ + 0.05));
    // Mounting feet
    g.add(box(0.1, 0.03, 0.1, M.darkChrome, lcX, 0.08, rampZ + 0.05));
    // Top indicator
    g.add(sph(0.015, mat(0x00ff00, 0, 0.3, {
      emissive: 0x00ff00, emissiveIntensity: 1.0,
    }), lcX, 1.5, rampZ + 0.05));
  }

  // ====== FILM TENSION ADJUSTMENT ======
  // Tension roller assembly on carriage
  g.add(cyl(0.02, 0.02, 0.1, 8, rollerChrome,
    mastX + 0.35, carriageY - 0.1, -0.1));
  // Tension spring
  g.add(cyl(0.01, 0.01, 0.06, 6, M.chrome,
    mastX + 0.35, carriageY - 0.1, -0.16));
  // Adjustment knob
  g.add(cyl(0.02, 0.02, 0.02, 10, M.orange,
    mastX + 0.35, carriageY - 0.1, -0.19));

  // ====== CABLE CHAIN / ENERGY CHAIN ======
  for (let i = 0; i < 10; i++) {
    g.add(box(0.03, 0.025, 0.04, M.bodyDark,
      mastX + 0.08, 0.5 + i * 0.06, -0.12));
  }

  // ====== PNEUMATIC CONNECTIONS ======
  g.add(cyl(0.015, 0.015, 0.1, 6, M.blue,
    mastX - 0.08, 0.4, -0.08, 0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, 0.15, 6, M.blue,
    mastX - 0.08, 0.3, -0.08));

  // ====== SAFETY FENCE SECTIONS (PARTIAL) ======
  // Rear partial fence
  for (let x = -0.8; x <= 0.8; x += 0.4) {
    g.add(cyl(0.02, 0.02, 1.0, 6, safetyYellow, x, 0.5, -0.95));
  }
  g.add(box(1.6, 0.03, 0.03, safetyYellow, 0, 0.5, -0.95));
  g.add(box(1.6, 0.03, 0.03, safetyYellow, 0, 1.0, -0.95));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(mastX, 2.65, 0));

  return g;
}
