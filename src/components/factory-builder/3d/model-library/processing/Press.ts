import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildPress(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const heavyFrame = mat(0x3a4250, 0.7, 0.4);
  const plateMetal = mat(0x556070, 0.75, 0.3);
  const hydraulicCyl = mat(0x889098, 0.85, 0.2);
  const dieTool = mat(0x505868, 0.8, 0.25);
  const safetyYellow = mat(0xddaa00, 0.1, 0.6);
  const lightCurtainRed = mat(0xff1111, 0.0, 0.3, {
    emissive: 0xff0000, emissiveIntensity: 1.5,
  });
  const chuteMetal = mat(0x667080, 0.6, 0.4);
  const gaugeWhite = mat(0xeeeeee, 0.0, 0.8);
  const pendantCable = mat(0x222222, 0.1, 0.8);
  const lubTank = mat(0x888866, 0.3, 0.5);

  // ====== 4-POST FRAME ======
  const frameW = 1.6;
  const frameD = 1.2;
  const frameH = 2.8;
  // Four columns
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.2, frameH, 0.2, heavyFrame,
        sx * frameW / 2, frameH / 2, sz * frameD / 2));
    }
  }
  // Crown (top cross beam)
  g.add(box(frameW + 0.2, 0.25, frameD + 0.2, heavyFrame, 0, frameH, 0));
  // Bed (bottom plate)
  g.add(box(frameW + 0.2, 0.2, frameD + 0.2, heavyFrame, 0, 0.1, 0));

  // Crown reinforcement ribs
  g.add(box(frameW, 0.08, 0.08, heavyFrame, 0, frameH - 0.15, -frameD / 2 + 0.15));
  g.add(box(frameW, 0.08, 0.08, heavyFrame, 0, frameH - 0.15, frameD / 2 - 0.15));

  // Column tie-rods (visible bolts at top and bottom)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Top nut
      g.add(cyl(0.06, 0.06, 0.04, 6, M.darkChrome,
        sx * frameW / 2, frameH + 0.13, sz * frameD / 2));
      // Bottom nut
      g.add(cyl(0.06, 0.06, 0.04, 6, M.darkChrome,
        sx * frameW / 2, 0.0, sz * frameD / 2));
    }
  }

  // ====== HYDRAULIC CYLINDER ON TOP ======
  // Main cylinder body
  g.add(cyl(0.18, 0.18, 0.7, 16, hydraulicCyl, 0, frameH - 0.48, 0));
  // Piston rod
  g.add(cyl(0.08, 0.08, 0.6, 12, M.chrome, 0, frameH - 0.95, 0));
  // Cylinder end cap
  g.add(cyl(0.2, 0.2, 0.06, 16, M.darkChrome, 0, frameH - 0.15, 0));
  // Hydraulic fittings
  g.add(cyl(0.03, 0.03, 0.08, 8, M.chrome, 0.15, frameH - 0.35, 0, 0, 0, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.08, 8, M.chrome, -0.15, frameH - 0.45, 0, 0, 0, Math.PI / 2));
  // Hydraulic hoses
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, 0.22, frameH - 0.55, 0));
  g.add(cyl(0.02, 0.02, 0.5, 6, M.rubber, -0.22, frameH - 0.65, 0));

  // ====== RAM / SLIDE (UPPER MOVING PLATEN) ======
  const ramY = 1.5;
  g.add(box(1.2, 0.2, 0.9, plateMetal, 0, ramY, 0));
  // Gibs (slide guides on columns)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.22, 0.3, 0.06, M.darkChrome,
        sx * frameW / 2, ramY, sz * (frameD / 2 - 0.08)));
    }
  }

  // ====== BOLSTER PLATE (LOWER FIXED PLATEN) ======
  const bolsterY = 0.35;
  g.add(box(1.3, 0.15, 1.0, plateMetal, 0, bolsterY, 0));
  // T-slot lines on bolster
  for (let x = -0.5; x <= 0.5; x += 0.25) {
    g.add(box(0.02, 0.005, 0.8, M.darkChrome, x, bolsterY + 0.08, 0));
  }

  // ====== DIE SET (PUNCH & DIE BLOCKS) ======
  // Upper die (punch) attached to ram
  g.add(box(0.5, 0.15, 0.4, dieTool, 0, ramY - 0.18, 0));
  g.add(box(0.3, 0.08, 0.25, mat(0x606878, 0.85, 0.2), 0, ramY - 0.3, 0));
  // Lower die on bolster
  g.add(box(0.5, 0.12, 0.4, dieTool, 0, bolsterY + 0.14, 0));
  // Die cavity
  g.add(box(0.28, 0.06, 0.23, mat(0x404858, 0.8, 0.2), 0, bolsterY + 0.22, 0));
  // Guide pins
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.025, 0.025, 0.4, 8, M.chrome,
        sx * 0.2, ramY - 0.5, sz * 0.15));
      // Guide bushings
      g.add(cyl(0.035, 0.035, 0.08, 10, mat(0xaa8844, 0.6, 0.3),
        sx * 0.2, bolsterY + 0.2, sz * 0.15));
    }
  }

  // ====== CONTROL PENDANT ON FLEXIBLE CABLE ======
  const pendX = 1.1;
  // Pendant box
  g.add(box(0.12, 0.2, 0.06, safetyYellow, pendX, 1.3, 0.5));
  // Buttons on pendant (start, stop, jog)
  g.add(cyl(0.02, 0.02, 0.015, 8, mat(0x00aa44, 0.2, 0.5), pendX - 0.03, 1.38, 0.535));
  g.add(cyl(0.02, 0.02, 0.015, 8, M.red, pendX + 0.03, 1.38, 0.535));
  g.add(cyl(0.015, 0.015, 0.015, 8, M.blue, pendX, 1.32, 0.535));
  // Mode selector
  g.add(cyl(0.015, 0.015, 0.02, 8, M.chrome, pendX, 1.26, 0.535));
  // Pendant cable (coiled)
  g.add(cyl(0.015, 0.015, 0.6, 6, pendantCable, pendX, 1.7, 0.4, 0.3, 0, 0));
  // Cable anchor
  g.add(box(0.06, 0.04, 0.04, M.darkChrome, pendX, 2.0, 0.2));

  // ====== SAFETY LIGHT CURTAINS ======
  // Two vertical pillars with emissive red strips
  for (const sx of [-1, 1]) {
    const lcX = sx * (frameW / 2 + 0.2);
    // Pillar
    g.add(box(0.06, 1.4, 0.06, safetyYellow, lcX, 0.9, frameD / 2 + 0.15));
    // Red emitter/receiver strip
    g.add(box(0.02, 1.2, 0.02, lightCurtainRed, lcX, 0.9, frameD / 2 + 0.15));
    // Mounting bracket
    g.add(box(0.1, 0.06, 0.08, M.darkChrome, lcX, 0.2, frameD / 2 + 0.15));
    g.add(box(0.1, 0.06, 0.08, M.darkChrome, lcX, 1.6, frameD / 2 + 0.15));
    // Indicator light on top
    g.add(sph(0.02, mat(0x00ff00, 0, 0.3, {
      emissive: 0x00ff00, emissiveIntensity: 1.0,
    }), lcX, 1.65, frameD / 2 + 0.15));
  }

  // ====== PART CHUTE / EXIT SLIDE ======
  const chuteZ = -frameD / 2 - 0.15;
  g.add(box(0.5, 0.03, 0.6, chuteMetal, 0, 0.5, chuteZ - 0.3, -0.4, 0, 0));
  // Chute sides
  g.add(box(0.03, 0.06, 0.6, chuteMetal, -0.25, 0.52, chuteZ - 0.3, -0.4, 0, 0));
  g.add(box(0.03, 0.06, 0.6, chuteMetal, 0.25, 0.52, chuteZ - 0.3, -0.4, 0, 0));
  // Collection bin at bottom
  g.add(box(0.6, 0.3, 0.4, mat(0x3355aa, 0.2, 0.6), 0, 0.15, chuteZ - 0.7));

  // ====== LUBRICATION SYSTEM ======
  const lubX = -frameW / 2 - 0.3;
  // Tank
  g.add(box(0.15, 0.25, 0.12, lubTank, lubX, 1.0, 0));
  // Sight glass
  g.add(box(0.02, 0.12, 0.015, mat(0x88bbdd, 0, 0.1, {
    transparent: true, opacity: 0.4,
  }), lubX + 0.08, 1.0, 0));
  // Pump
  g.add(cyl(0.03, 0.03, 0.06, 8, M.darkChrome, lubX, 0.85, 0));
  // Lines to die area
  g.add(cyl(0.008, 0.008, 0.6, 6, M.pipe, lubX + 0.2, 1.0, 0, 0, 0, Math.PI / 3));
  g.add(cyl(0.008, 0.008, 0.4, 6, M.pipe, lubX + 0.5, 0.9, 0, 0, 0, Math.PI / 6));

  // ====== TONNAGE INDICATOR (GAUGE) ======
  g.add(cyl(0.06, 0.06, 0.02, 16, gaugeWhite, frameW / 2 + 0.12, 2.2, 0));
  g.add(cyl(0.065, 0.065, 0.015, 16, M.chrome, frameW / 2 + 0.12, 2.2, 0.01));
  // Needle
  g.add(box(0.04, 0.005, 0.003, M.red, frameW / 2 + 0.12, 2.2, 0.015, 0, 0, 0.5));

  // ====== TWO-HAND CONTROL BUTTONS (SAFETY) ======
  // Console box
  g.add(box(0.5, 0.06, 0.2, safetyYellow, 0, 0.95, frameD / 2 + 0.35));
  // Pedestal
  g.add(cyl(0.04, 0.04, 0.4, 8, M.darkChrome, 0, 0.75, frameD / 2 + 0.35));
  // Two green palm buttons
  g.add(cyl(0.04, 0.04, 0.025, 12, mat(0x00aa44, 0.2, 0.5), -0.12, 0.99, frameD / 2 + 0.35));
  g.add(cyl(0.04, 0.04, 0.025, 12, mat(0x00aa44, 0.2, 0.5), 0.12, 0.99, frameD / 2 + 0.35));
  // Guard rings around buttons
  g.add(cyl(0.05, 0.05, 0.03, 12, safetyYellow, -0.12, 0.985, frameD / 2 + 0.35));
  g.add(cyl(0.05, 0.05, 0.03, 12, safetyYellow, 0.12, 0.985, frameD / 2 + 0.35));
  // E-stop
  g.add(cyl(0.035, 0.035, 0.025, 12, M.red, 0, 0.99, frameD / 2 + 0.35));

  // ====== FLYWHEEL (MECHANICAL PRESS DETAIL) ======
  g.add(cyl(0.3, 0.3, 0.06, 24, heavyFrame, -frameW / 2 - 0.05, frameH - 0.5, 0));
  g.add(cyl(0.25, 0.25, 0.07, 24, M.darkChrome, -frameW / 2 - 0.05, frameH - 0.5, 0));
  g.add(cyl(0.06, 0.06, 0.08, 12, M.chrome, -frameW / 2 - 0.05, frameH - 0.5, 0));
  // Spokes
  for (let a = 0; a < 6; a++) {
    const angle = (a * Math.PI) / 3;
    g.add(box(0.2, 0.04, 0.04, heavyFrame,
      -frameW / 2 - 0.05 + Math.cos(angle) * 0.12,
      frameH - 0.5 + Math.sin(angle) * 0.12, 0.0));
  }

  // ====== HYDRAULIC POWER UNIT (REAR) ======
  g.add(box(0.5, 0.5, 0.4, M.bodyDark, 0, 0.35, -frameD / 2 - 0.4));
  // Motor
  g.add(cyl(0.12, 0.12, 0.25, 12, M.bodyGray, 0, 0.6, -frameD / 2 - 0.4,
    0, 0, Math.PI / 2));
  // Oil level sight glass
  g.add(cyl(0.03, 0.03, 0.01, 12, mat(0xddcc44, 0, 0.3, {
    transparent: true, opacity: 0.5,
  }), 0.26, 0.35, -frameD / 2 - 0.4));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(frameW / 2 + 0.1, frameH + 0.12, -frameD / 2));

  return g;
}
