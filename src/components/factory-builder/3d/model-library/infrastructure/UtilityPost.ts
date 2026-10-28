import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildUtilityPost(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const postGray = mat(0x606870, 0.7, 0.35);
  const postDark = mat(0x505560, 0.65, 0.4);
  const basePlateMat = mat(0x606060, 0.7, 0.35);
  const boltMat = mat(0x888888, 0.8, 0.2);
  const outletGray = mat(0x777780, 0.5, 0.5);
  const coverGray = mat(0x888890, 0.4, 0.55);
  const airBlue = mat(0x2266cc, 0.4, 0.45);
  const fittingChrome = mat(0xb0b8c0, 0.85, 0.15);
  const eStopRed = mat(0xee1111, 0.15, 0.45, { emissive: 0x440000, emissiveIntensity: 0.3 });
  const eStopYellow = mat(0xddbb00, 0.2, 0.45);
  const dataPort = mat(0xcccccc, 0.3, 0.5);
  const ledWhite = mat(0xffffff, 0.1, 0.3, { emissive: 0xffffee, emissiveIntensity: 0.8 });
  const ledHousing = mat(0x333333, 0.5, 0.5);
  const gooseNeck = mat(0x444444, 0.6, 0.4);
  const reelBody = mat(0x555560, 0.6, 0.4);
  const hoseMat = mat(0x334488, 0.1, 0.7);
  const labelWhite = mat(0xeeeeee, 0.0, 0.85);
  const labelText = mat(0x111111, 0.0, 0.9);
  const cableMat = mat(0x222222, 0.1, 0.8);

  // ── Dimensions ──
  const postH = 2.4;
  const postR = 0.06;

  // ════════════════════════════════════════
  // ── Main Post Column ──
  // ════════════════════════════════════════
  g.add(cyl(postR, postR, postH, 16, postGray, 0, postH / 2, 0));
  // Post cap
  g.add(cyl(postR + 0.005, postR - 0.01, 0.03, 12, postDark, 0, postH + 0.015, 0));
  // Decorative rings at mounting point heights
  for (const ry of [0.5, 1.0, 1.5, 2.0]) {
    g.add(cyl(postR + 0.005, postR + 0.005, 0.015, 12, postDark, 0, ry, 0));
  }

  // ── Floor Mounting Base Plate ──
  g.add(box(0.22, 0.015, 0.22, basePlateMat, 0, 0.0075, 0));
  // Welded collar
  g.add(cyl(postR + 0.01, postR + 0.015, 0.03, 12, postDark, 0, 0.03, 0));
  // Anchor bolts (4)
  for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]] as [number, number][]) {
    g.add(cyl(0.006, 0.006, 0.025, 6, boltMat, dx, 0.027, dz));
    g.add(cyl(0.01, 0.01, 0.006, 6, boltMat, dx, 0.018, dz));
    g.add(cyl(0.013, 0.013, 0.002, 8, boltMat, dx, 0.016, dz));
  }
  // Base gussets
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const gx = Math.cos(angle) * 0.05;
    const gz = Math.sin(angle) * 0.05;
    g.add(box(0.004, 0.08, 0.04, postDark, gx, 0.055, gz, 0, angle, 0));
  }

  // ════════════════════════════════════════
  // ── 1. Compressed Air Outlet (at 1.0m) ──
  // ════════════════════════════════════════
  const airY = 1.0;
  // Mounting bracket
  g.add(box(0.08, 0.06, 0.04, postDark, postR + 0.04, airY, 0));
  // Air outlet body (blue cylinder)
  g.add(cyl(0.02, 0.02, 0.05, 10, airBlue, postR + 0.08, airY, 0, 0, 0, Math.PI / 2));
  // Quick-connect fitting
  g.add(cyl(0.015, 0.015, 0.03, 10, fittingChrome, postR + 0.11, airY, 0, 0, 0, Math.PI / 2));
  // Fitting collar (release ring)
  g.add(cyl(0.018, 0.018, 0.008, 10, fittingChrome, postR + 0.125, airY, 0, 0, 0, Math.PI / 2));
  // Fitting nipple
  g.add(cyl(0.008, 0.008, 0.015, 8, fittingChrome, postR + 0.135, airY, 0, 0, 0, Math.PI / 2));
  // Shut-off valve
  g.add(box(0.025, 0.025, 0.02, airBlue, postR + 0.065, airY + 0.025, 0));
  g.add(cyl(0.004, 0.004, 0.02, 6, fittingChrome, postR + 0.065, airY + 0.04, 0));
  // Label: "AIR"
  g.add(box(0.04, 0.02, 0.003, labelWhite, postR + 0.08, airY - 0.04, 0.021));
  g.add(box(0.025, 0.01, 0.003, labelText, postR + 0.08, airY - 0.04, 0.022));

  // ════════════════════════════════════════
  // ── 2. Electrical Outlet Box (at 0.6m) ──
  // ════════════════════════════════════════
  const elecY = 0.6;
  const elecAngle = Math.PI * 0.6;  // rotated around post
  const elecX = Math.cos(elecAngle) * (postR + 0.03);
  const elecZ = Math.sin(elecAngle) * (postR + 0.03);
  // Outlet box body
  g.add(box(0.09, 0.12, 0.05, outletGray, elecX, elecY, elecZ));
  // Cover plate
  g.add(box(0.1, 0.13, 0.004, coverGray, elecX - 0.005, elecY, elecZ + 0.027));
  // Outlet slots (2 duplex outlets)
  for (const dy of [-0.025, 0.025]) {
    // Hot slot
    g.add(box(0.004, 0.015, 0.005, mat(0x111111, 0.0, 0.9), elecX - 0.012, elecY + dy, elecZ + 0.03));
    // Neutral slot
    g.add(box(0.004, 0.02, 0.005, mat(0x111111, 0.0, 0.9), elecX + 0.012, elecY + dy, elecZ + 0.03));
    // Ground pin hole
    g.add(cyl(0.004, 0.004, 0.005, 6, mat(0x111111, 0.0, 0.9), elecX, elecY + dy - 0.015, elecZ + 0.03));
  }
  // Cover hinge
  g.add(cyl(0.004, 0.004, 0.13, 6, boltMat, elecX - 0.05, elecY, elecZ + 0.02));
  // Weather cover (flip-up)
  g.add(box(0.095, 0.065, 0.004, coverGray, elecX, elecY + 0.05, elecZ + 0.04, -0.3, 0, 0));
  // Label: "120V"
  g.add(box(0.04, 0.015, 0.003, labelWhite, elecX, elecY - 0.075, elecZ + 0.028));
  g.add(box(0.025, 0.008, 0.003, labelText, elecX, elecY - 0.075, elecZ + 0.029));

  // ════════════════════════════════════════
  // ── 3. Ethernet/Data Port (at 0.5m) ──
  // ════════════════════════════════════════
  const dataY = 0.5;
  const dataAngle = Math.PI * 1.3;
  const dataX = Math.cos(dataAngle) * (postR + 0.025);
  const dataZ = Math.sin(dataAngle) * (postR + 0.025);
  // Data port housing
  g.add(box(0.06, 0.04, 0.035, dataPort, dataX, dataY, dataZ));
  // RJ45 port opening
  g.add(box(0.015, 0.012, 0.005, mat(0x222222, 0.0, 0.9), dataX, dataY, dataZ + 0.018));
  // Port cover flap
  g.add(box(0.02, 0.015, 0.003, coverGray, dataX, dataY + 0.005, dataZ + 0.019));
  // Link LED
  g.add(sph(0.004, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }),
    dataX + 0.015, dataY + 0.012, dataZ + 0.018));
  // Activity LED
  g.add(sph(0.004, mat(0xffaa00, 0.1, 0.3, { emissive: 0xffaa00, emissiveIntensity: 0.6 }),
    dataX - 0.015, dataY + 0.012, dataZ + 0.018));
  // Label: "DATA"
  g.add(box(0.035, 0.012, 0.003, labelWhite, dataX, dataY - 0.03, dataZ + 0.018));
  g.add(box(0.022, 0.006, 0.003, labelText, dataX, dataY - 0.03, dataZ + 0.019));

  // ════════════════════════════════════════
  // ── 4. Emergency Stop Button (at 1.5m) ──
  // ════════════════════════════════════════
  const eStopY = 1.5;
  // Yellow mounting plate
  g.add(box(0.1, 0.1, 0.015, eStopYellow, postR + 0.05, eStopY, 0));
  // Yellow plate border bevel
  g.add(box(0.11, 0.005, 0.02, eStopYellow, postR + 0.05, eStopY + 0.05, 0));
  g.add(box(0.11, 0.005, 0.02, eStopYellow, postR + 0.05, eStopY - 0.05, 0));
  g.add(box(0.005, 0.1, 0.02, eStopYellow, postR + 0.1, eStopY, 0));
  // Red mushroom button (dome)
  g.add(cyl(0.03, 0.03, 0.02, 12, eStopRed, postR + 0.05, eStopY, 0.015));
  g.add(sph(0.03, eStopRed, postR + 0.05, eStopY, 0.025));
  // Button base collar
  g.add(cyl(0.035, 0.035, 0.008, 12, mat(0x222222, 0.5, 0.5), postR + 0.05, eStopY, 0.01));
  // "E-STOP" text on yellow plate
  g.add(box(0.06, 0.012, 0.003, mat(0x111111, 0.0, 0.9), postR + 0.05, eStopY - 0.035, 0.017));
  // Mounting screws
  for (const [dx, dy] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]] as [number, number][]) {
    g.add(cyl(0.004, 0.004, 0.018, 6, boltMat, postR + 0.05 + dx, eStopY + dy, 0.009));
  }
  // Label: "EMERGENCY STOP"
  g.add(box(0.09, 0.015, 0.003, labelWhite, postR + 0.05, eStopY + 0.065, 0.008));
  g.add(box(0.07, 0.008, 0.003, eStopRed, postR + 0.05, eStopY + 0.065, 0.009));

  // ════════════════════════════════════════
  // ── 5. LED Work Light on Gooseneck Arm ──
  // ════════════════════════════════════════
  const lightY = 2.1;
  // Gooseneck mount bracket on post
  g.add(cyl(0.015, 0.015, 0.04, 8, gooseNeck, postR + 0.02, lightY, 0, 0, 0, Math.PI / 2));
  // Gooseneck arm (flexible segments)
  const neckSegments = 8;
  for (let i = 0; i < neckSegments; i++) {
    const t = i / neckSegments;
    const sx = postR + 0.04 + t * 0.25;
    const sy = lightY + t * 0.12 - (t * t) * 0.05;
    g.add(cyl(0.008, 0.008, 0.035, 6, gooseNeck, sx, sy, 0, 0, 0, Math.PI / 2 - t * 0.3));
    // Joint balls
    if (i < neckSegments - 1) {
      g.add(sph(0.009, postDark, sx + 0.015, sy + 0.005, 0));
    }
  }
  // LED light head
  const lightHeadX = postR + 0.32;
  const lightHeadY = lightY + 0.1;
  g.add(box(0.08, 0.03, 0.04, ledHousing, lightHeadX, lightHeadY, 0));
  // LED lens (front face)
  g.add(box(0.075, 0.025, 0.004, ledWhite, lightHeadX, lightHeadY, 0.022));
  // Heat sink fins on back
  for (let i = -3; i <= 3; i++) {
    g.add(box(0.005, 0.035, 0.008, ledHousing, lightHeadX + i * 0.01, lightHeadY, -0.024));
  }
  // Pivot joint
  g.add(cyl(0.01, 0.01, 0.015, 8, postDark, lightHeadX - 0.04, lightHeadY, 0, Math.PI / 2, 0, 0));

  // ════════════════════════════════════════
  // ── 6. Retractable Cable/Hose Reel ──
  // ════════════════════════════════════════
  const reelY = 2.0;
  const reelAngle2 = Math.PI * 0.75;
  const reelX = Math.cos(reelAngle2) * (postR + 0.12);
  const reelZ = Math.sin(reelAngle2) * (postR + 0.12);
  // Mounting bracket to post
  g.add(box(0.06, 0.08, 0.04, postDark, Math.cos(reelAngle2) * (postR + 0.03), reelY, Math.sin(reelAngle2) * (postR + 0.03)));
  // Reel housing (cylindrical body)
  g.add(cyl(0.08, 0.08, 0.1, 14, reelBody, reelX, reelY, reelZ, Math.PI / 2, 0, 0));
  // Reel side covers
  g.add(cyl(0.082, 0.082, 0.006, 14, postDark, reelX, reelY, reelZ - 0.053));
  g.add(cyl(0.082, 0.082, 0.006, 14, postDark, reelX, reelY, reelZ + 0.053));
  // Wound cable/hose visible
  g.add(cyl(0.065, 0.065, 0.08, 12, hoseMat, reelX, reelY, reelZ, Math.PI / 2, 0, 0));
  // Reel hub
  g.add(cyl(0.02, 0.02, 0.11, 8, boltMat, reelX, reelY, reelZ, Math.PI / 2, 0, 0));
  // Spring return mechanism housing
  g.add(cyl(0.03, 0.03, 0.02, 10, postDark, reelX, reelY, reelZ + 0.065, Math.PI / 2, 0, 0));
  // Hanging cable/hose end
  g.add(cyl(0.008, 0.008, 0.3, 8, cableMat, reelX, reelY - 0.23, reelZ));
  // Quick-connect at end of hose
  g.add(cyl(0.012, 0.012, 0.025, 8, fittingChrome, reelX, reelY - 0.39, reelZ));

  // ════════════════════════════════════════
  // ── Labels for each utility ──
  // ════════════════════════════════════════
  // Label backgrounds with text bars are already placed near each utility above.
  // Add an overall "UTILITY POST" label near top
  g.add(box(0.1, 0.03, 0.003, labelWhite, 0, postH - 0.1, postR + 0.002));
  g.add(box(0.08, 0.015, 0.003, labelText, 0, postH - 0.1, postR + 0.003));

  return g;
}
