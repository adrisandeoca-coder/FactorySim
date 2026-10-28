import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildWeldingStation(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const cellFrame = mat(0x445060, 0.7, 0.35);
  const curtainMat = mat(0x882200, 0.0, 0.7, {
    transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  const sparkGuard = mat(0x333840, 0.6, 0.5);
  const weldBlue = mat(0x3366cc, 0.3, 0.5);
  const cableMat = mat(0x222222, 0.1, 0.8);
  const gasCylGreen = mat(0x226633, 0.4, 0.5);
  const gasCylGray = mat(0x667788, 0.5, 0.4);
  const copperTip = mat(0xbb7744, 0.7, 0.3);
  const stainless = mat(0x889098, 0.85, 0.2);

  // ====== BASE PLATE ======
  g.add(box(2.4, 0.08, 2.0, M.bodyDark, 0, 0.04, 0));

  // ====== WELDING POSITIONER / TURNTABLE ======
  // Positioner base
  g.add(cyl(0.25, 0.3, 0.15, 16, cellFrame, 0, 0.12, 0));
  // Rotation ring
  g.add(cyl(0.28, 0.28, 0.03, 24, M.chrome, 0, 0.2, 0));
  // Turntable top
  g.add(cyl(0.4, 0.4, 0.05, 24, stainless, 0, 0.24, 0));
  // T-slots on turntable
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 2;
    g.add(box(0.7, 0.01, 0.025, M.darkChrome,
      Math.cos(angle) * 0.0, 0.27, Math.sin(angle) * 0.0,
      0, angle, 0));
  }
  g.add(box(0.7, 0.01, 0.025, M.darkChrome, 0, 0.27, 0, 0, 0, 0));
  g.add(box(0.025, 0.01, 0.7, M.darkChrome, 0, 0.27, 0, 0, 0, 0));

  // ====== JIG / FIXTURE ON TABLE ======
  // V-blocks
  g.add(box(0.12, 0.08, 0.08, cellFrame, -0.12, 0.31, 0));
  g.add(box(0.12, 0.08, 0.08, cellFrame, 0.12, 0.31, 0));
  // Clamp arms
  g.add(box(0.04, 0.1, 0.04, M.chrome, -0.12, 0.4, 0));
  g.add(box(0.04, 0.1, 0.04, M.chrome, 0.12, 0.4, 0));
  // Toggle clamp handles
  g.add(box(0.08, 0.02, 0.02, M.orange, -0.12, 0.46, 0));
  g.add(box(0.08, 0.02, 0.02, M.orange, 0.12, 0.46, 0));
  // Workpiece (cylinder)
  g.add(cyl(0.05, 0.05, 0.3, 12, stainless, 0, 0.35, 0, 0, 0, Math.PI / 2));

  // ====== ROBOT ARM (SMALL WELDING ROBOT) ======
  const rBase = 0.5;
  // Robot base pedestal
  g.add(cyl(0.15, 0.18, 0.2, 16, M.bodyDark, rBase, 0.18, -0.4));
  g.add(cyl(0.12, 0.12, 0.05, 16, M.orange, rBase, 0.3, -0.4));
  // J1 rotation (shoulder)
  g.add(cyl(0.1, 0.1, 0.08, 12, M.orange, rBase, 0.36, -0.4));
  // Upper arm
  g.add(box(0.08, 0.35, 0.08, M.orange, rBase, 0.55, -0.4));
  // Elbow joint
  g.add(sph(0.06, M.darkChrome, rBase, 0.73, -0.4));
  // Forearm
  g.add(box(0.06, 0.25, 0.06, M.orange, rBase - 0.05, 0.85, -0.25, -0.5, 0, 0));
  // Wrist
  g.add(cyl(0.04, 0.04, 0.06, 10, M.darkChrome, rBase - 0.1, 0.9, -0.1));

  // ====== WELDING TORCH ======
  // Torch body
  g.add(cyl(0.025, 0.02, 0.15, 8, M.chrome, rBase - 0.12, 0.85, -0.02));
  // Torch nozzle
  g.add(cyl(0.015, 0.008, 0.06, 8, copperTip, rBase - 0.12, 0.78, 0.0));
  // Gas diffuser
  g.add(cyl(0.02, 0.02, 0.03, 8, copperTip, rBase - 0.12, 0.82, -0.01));
  // Wire guide
  g.add(cyl(0.008, 0.008, 0.2, 6, M.chrome, rBase - 0.1, 0.92, -0.15, 0.3, 0, 0));

  // ====== WIRE FEED UNIT ======
  const wfX = 0.9;
  const wfZ = -0.6;
  g.add(box(0.3, 0.35, 0.25, M.bodyDark, wfX, 0.45, wfZ));
  // Wire spool drum
  g.add(cyl(0.12, 0.12, 0.08, 16, M.darkChrome, wfX, 0.7, wfZ));
  g.add(cyl(0.04, 0.04, 0.1, 12, M.chrome, wfX, 0.7, wfZ));
  // Wire (thin line from spool to torch)
  g.add(cyl(0.005, 0.005, 0.8, 6, M.chrome, wfX - 0.3, 0.75, wfZ + 0.3, 0.3, 0.3, 0));
  // Feed motor housing
  g.add(box(0.1, 0.08, 0.12, M.bodyGray, wfX, 0.55, wfZ + 0.15));

  // ====== WELDING POWER SOURCE ======
  const psX = -0.9;
  const psZ = -0.6;
  g.add(box(0.55, 0.6, 0.4, M.bodyDark, psX, 0.38, psZ));
  // Front panel details
  g.add(box(0.45, 0.08, 0.005, M.screen, psX, 0.55, psZ + 0.205));
  // Digital display
  g.add(box(0.12, 0.05, 0.005, mat(0x001100, 0, 0.9, {
    emissive: 0x00ff00, emissiveIntensity: 0.8,
  }), psX + 0.1, 0.55, psZ + 0.207));
  // Knobs
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.025, 0.025, 0.02, 12, M.chrome, psX - 0.12 + i * 0.1, 0.45, psZ + 0.21));
  }
  // Power switch
  g.add(box(0.04, 0.025, 0.015, M.red, psX + 0.2, 0.35, psZ + 0.21));
  // Ventilation grille
  for (let y = 0.15; y < 0.55; y += 0.04) {
    g.add(box(0.35, 0.01, 0.005, mat(0x1a1e22, 0.5, 0.6), psX, y, psZ + 0.205));
  }
  // Carrying handle
  g.add(box(0.3, 0.02, 0.02, M.rubber, psX, 0.7, psZ));

  // ====== FUME EXTRACTION HOOD OVERHEAD ======
  // Hood (inverted frustum shape)
  g.add(box(1.0, 0.05, 0.8, mat(0x556068, 0.6, 0.4), 0, 1.8, 0));
  g.add(box(0.8, 0.3, 0.6, mat(0x556068, 0.6, 0.4), 0, 1.6, 0));
  // Support arms
  g.add(cyl(0.03, 0.03, 0.8, 8, cellFrame, -0.5, 1.4, -0.4));
  g.add(cyl(0.03, 0.03, 0.8, 8, cellFrame, 0.5, 1.4, -0.4));
  // Duct out top
  g.add(cyl(0.12, 0.12, 0.3, 12, mat(0x667078, 0.6, 0.35), 0, 2.0, 0));
  // Flexible duct hose
  g.add(cyl(0.1, 0.1, 0.15, 12, mat(0x556060, 0.4, 0.5), 0, 2.2, 0));

  // ====== FLASH CURTAIN / SCREEN ======
  // Frame posts
  const curtainOffset = 0.85;
  for (const sx of [-1, 1]) {
    g.add(cyl(0.025, 0.025, 1.6, 8, cellFrame, sx * 1.1, 0.88, curtainOffset));
    // Top rail
  }
  g.add(box(2.2, 0.03, 0.03, cellFrame, 0, 1.68, curtainOffset));
  // Curtain panels
  g.add(box(0.7, 1.5, 0.01, curtainMat, -0.55, 0.85, curtainOffset));
  g.add(box(0.7, 1.5, 0.01, curtainMat, 0.55, 0.85, curtainOffset));
  // Overlap strip (center)
  g.add(box(0.15, 1.5, 0.01, curtainMat, 0, 0.85, curtainOffset + 0.01));

  // ====== SPARK GUARD PANELS AT BASE ======
  g.add(box(2.2, 0.25, 0.03, sparkGuard, 0, 0.2, curtainOffset - 0.03));
  g.add(box(0.03, 0.25, 1.7, sparkGuard, -1.1, 0.2, 0));
  g.add(box(0.03, 0.25, 1.7, sparkGuard, 1.1, 0.2, 0));

  // ====== GAS CYLINDER RACK ======
  const gcX = -1.0;
  const gcZ = 0.3;
  // Rack frame
  g.add(box(0.04, 0.9, 0.04, cellFrame, gcX - 0.15, 0.5, gcZ));
  g.add(box(0.04, 0.9, 0.04, cellFrame, gcX + 0.15, 0.5, gcZ));
  g.add(box(0.35, 0.04, 0.04, cellFrame, gcX, 0.7, gcZ));
  // Chain restraint
  g.add(box(0.3, 0.015, 0.015, M.chrome, gcX, 0.6, gcZ + 0.08));
  // Cylinders
  g.add(cyl(0.06, 0.06, 0.7, 12, gasCylGreen, gcX - 0.07, 0.4, gcZ));
  g.add(cyl(0.06, 0.06, 0.7, 12, gasCylGray, gcX + 0.07, 0.4, gcZ));
  // Cylinder valves
  g.add(cyl(0.025, 0.025, 0.06, 8, mat(0xbbaa00, 0.7, 0.3), gcX - 0.07, 0.78, gcZ));
  g.add(cyl(0.025, 0.025, 0.06, 8, mat(0xbbaa00, 0.7, 0.3), gcX + 0.07, 0.78, gcZ));
  // Regulator
  g.add(box(0.04, 0.06, 0.03, mat(0xbbaa00, 0.7, 0.3), gcX - 0.07, 0.82, gcZ + 0.04));
  // Gas hose
  g.add(cyl(0.01, 0.01, 0.6, 6, M.blue, gcX, 0.82, gcZ + 0.15, 0, 0, Math.PI / 4));

  // ====== WATER COOLING UNIT ======
  const wcX = 0.9;
  const wcZ = 0.5;
  g.add(box(0.3, 0.3, 0.2, weldBlue, wcX, 0.23, wcZ));
  // Pump housing
  g.add(cyl(0.06, 0.06, 0.1, 12, M.chrome, wcX - 0.1, 0.42, wcZ));
  // Water level sight glass
  g.add(box(0.02, 0.15, 0.015, mat(0x88bbdd, 0.0, 0.1, {
    transparent: true, opacity: 0.4,
  }), wcX + 0.16, 0.25, wcZ));
  // Cooling hoses
  g.add(cyl(0.015, 0.015, 0.4, 6, M.blue, wcX - 0.05, 0.45, wcZ - 0.2, Math.PI / 4, 0, 0));
  g.add(cyl(0.015, 0.015, 0.4, 6, M.red, wcX + 0.05, 0.45, wcZ - 0.2, Math.PI / 4, 0, 0));

  // ====== WELDING CABLE BUNDLES ======
  // Main cable from power source to torch
  g.add(cyl(0.02, 0.02, 0.5, 6, cableMat, psX + 0.3, 0.4, psZ + 0.3, 0, Math.PI / 4, 0));
  g.add(cyl(0.02, 0.02, 0.6, 6, cableMat, 0.1, 0.5, -0.2, 0.5, 0.2, 0));
  // Cable hangers
  g.add(cyl(0.008, 0.008, 0.2, 6, M.chrome, 0.2, 1.5, -0.2));
  g.add(cyl(0.008, 0.008, 0.2, 6, M.chrome, 0.4, 1.5, -0.2));

  // ====== GROUND CLAMP ======
  g.add(box(0.06, 0.03, 0.1, copperTip, 0.15, 0.27, 0.2));
  g.add(box(0.06, 0.02, 0.03, copperTip, 0.15, 0.3, 0.22));
  // Ground cable
  g.add(cyl(0.012, 0.012, 0.4, 6, cableMat, 0.15, 0.15, 0.35, Math.PI / 3, 0, 0));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(-1.0, 1.0, -0.8));

  return g;
}
