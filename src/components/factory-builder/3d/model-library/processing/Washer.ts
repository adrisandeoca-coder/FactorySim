import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildWasher(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const stainless = mat(0x99a0a8, 0.85, 0.2);
  const stainlessDark = mat(0x778088, 0.8, 0.25);
  const lidMetal = mat(0x8890a0, 0.82, 0.22);
  const sealRubber = mat(0x1a1c20, 0.0, 0.9);
  const nozzleBrass = mat(0xbb9944, 0.7, 0.3);
  const pumpBody = mat(0x446688, 0.4, 0.5);
  const tubingClear = mat(0x88bbdd, 0.0, 0.1, {
    transparent: true, opacity: 0.35,
  });
  const wireMesh = mat(0x889098, 0.7, 0.3, {
    transparent: true, opacity: 0.7, side: THREE.DoubleSide,
  });
  const tempDisplay = mat(0x001100, 0.0, 0.9, {
    emissive: 0x00ff44, emissiveIntensity: 0.9,
  });
  const splashGuard = mat(0x99a0a8, 0.8, 0.25);

  // ====== MAIN TANK / CABINET BODY ======
  const tankW = 1.4;
  const tankH = 1.0;
  const tankD = 1.0;
  const tankY = 0.5 + tankH / 2;
  // Front panel
  g.add(box(tankW, tankH, 0.04, stainless, 0, tankY, tankD / 2));
  // Back panel
  g.add(box(tankW, tankH, 0.04, stainless, 0, tankY, -tankD / 2));
  // Left panel
  g.add(box(0.04, tankH, tankD, stainless, -tankW / 2, tankY, 0));
  // Right panel
  g.add(box(0.04, tankH, tankD, stainless, tankW / 2, tankY, 0));
  // Bottom panel
  g.add(box(tankW, 0.04, tankD, stainlessDark, 0, 0.52, 0));

  // Cabinet legs (4 adjustable feet)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.06, 0.5, 0.06, stainless, sx * (tankW / 2 - 0.08), 0.25, sz * (tankD / 2 - 0.08)));
      g.add(cyl(0.04, 0.05, 0.04, 8, M.rubber, sx * (tankW / 2 - 0.08), 0.02, sz * (tankD / 2 - 0.08)));
    }
  }

  // Reinforcement rim around top
  g.add(box(tankW + 0.04, 0.04, 0.06, stainlessDark, 0, 0.5 + tankH + 0.02, tankD / 2));
  g.add(box(tankW + 0.04, 0.04, 0.06, stainlessDark, 0, 0.5 + tankH + 0.02, -tankD / 2));
  g.add(box(0.06, 0.04, tankD, stainlessDark, -tankW / 2, 0.5 + tankH + 0.02, 0));
  g.add(box(0.06, 0.04, tankD, stainlessDark, tankW / 2, 0.5 + tankH + 0.02, 0));

  // ====== HINGED LID (PARTIALLY OPEN) ======
  const lidY = 0.5 + tankH + 0.04;
  // Lid panel (tilted back ~30 degrees)
  g.add(box(tankW - 0.02, 0.04, tankD * 0.5, lidMetal, 0, lidY + 0.22, -tankD / 4 - 0.15,
    -0.55, 0, 0));
  // Hinge hardware
  g.add(cyl(0.02, 0.02, tankW - 0.1, 6, M.darkChrome, 0, lidY, -tankD / 2 + 0.05,
    0, 0, Math.PI / 2));
  // Lid handle
  g.add(box(0.25, 0.025, 0.04, M.chrome, 0, lidY + 0.38, 0.02));
  // Rubber seal on lid edge
  g.add(box(tankW - 0.06, 0.015, 0.02, sealRubber, 0, lidY + 0.18, 0.08, -0.55, 0, 0));

  // ====== SPRAY NOZZLE MANIFOLD INSIDE ======
  // Main pipe running across tank interior
  g.add(cyl(0.025, 0.025, 1.1, 8, stainless, 0, 1.3, 0, 0, 0, Math.PI / 2));
  // Individual nozzles pointing down
  for (let x = -0.4; x <= 0.4; x += 0.2) {
    g.add(cyl(0.012, 0.008, 0.05, 6, nozzleBrass, x, 1.25, 0));
    // Nozzle fitting
    g.add(cyl(0.018, 0.018, 0.02, 6, stainless, x, 1.28, 0));
  }
  // Second row offset
  for (let x = -0.3; x <= 0.3; x += 0.2) {
    g.add(cyl(0.012, 0.008, 0.05, 6, nozzleBrass, x, 1.25, -0.2));
    g.add(cyl(0.018, 0.018, 0.02, 6, stainless, x, 1.28, -0.2));
  }
  // Feed pipe from manifold out through side
  g.add(cyl(0.02, 0.02, 0.3, 8, stainless, tankW / 2 - 0.05, 1.3, 0,
    0, 0, Math.PI / 2));

  // ====== PARTS BASKET INSIDE (WIRE MESH) ======
  // Basket bottom
  g.add(box(0.9, 0.02, 0.7, wireMesh, 0, 0.75, 0));
  // Basket sides
  g.add(box(0.9, 0.3, 0.02, wireMesh, 0, 0.9, 0.35));
  g.add(box(0.9, 0.3, 0.02, wireMesh, 0, 0.9, -0.35));
  g.add(box(0.02, 0.3, 0.7, wireMesh, 0.45, 0.9, 0));
  g.add(box(0.02, 0.3, 0.7, wireMesh, -0.45, 0.9, 0));
  // Basket handles
  g.add(box(0.3, 0.02, 0.03, M.chrome, 0, 1.08, 0.35));
  g.add(box(0.3, 0.02, 0.03, M.chrome, 0, 1.08, -0.35));
  // Basket support rails
  g.add(box(0.03, 0.03, tankD - 0.1, stainlessDark, -0.4, 0.7, 0));
  g.add(box(0.03, 0.03, tankD - 0.1, stainlessDark, 0.4, 0.7, 0));

  // ====== DRAIN AT BOTTOM ======
  g.add(cyl(0.04, 0.04, 0.06, 12, stainlessDark, 0, 0.5, 0));
  g.add(cyl(0.03, 0.03, 0.15, 8, M.pipe, 0, 0.38, 0));
  // Drain valve
  g.add(box(0.05, 0.04, 0.04, M.chrome, 0.04, 0.33, 0));
  g.add(cyl(0.015, 0.015, 0.06, 6, M.chrome, 0.08, 0.33, 0, 0, 0, Math.PI / 2));

  // ====== FILTRATION UNIT ON SIDE ======
  const fX = tankW / 2 + 0.2;
  // Filter housing
  g.add(cyl(0.1, 0.1, 0.35, 12, stainless, fX, 0.85, -0.15));
  // Filter cap
  g.add(cyl(0.11, 0.11, 0.03, 12, M.darkChrome, fX, 1.04, -0.15));
  // Pressure gauge
  g.add(cyl(0.03, 0.03, 0.015, 12, M.chrome, fX + 0.08, 0.95, -0.15,
    0, 0, Math.PI / 2));
  g.add(cyl(0.025, 0.025, 0.005, 12, mat(0xeeeeee, 0, 0.8), fX + 0.09, 0.95, -0.15,
    0, 0, Math.PI / 2));
  // Inlet/outlet pipes
  g.add(cyl(0.02, 0.02, 0.15, 8, M.pipe, fX - 0.05, 0.75, -0.15, 0, 0, Math.PI / 2));
  g.add(cyl(0.02, 0.02, 0.15, 8, M.pipe, fX - 0.05, 0.95, -0.15, 0, 0, Math.PI / 2));

  // ====== HEATER ELEMENT HOUSING ======
  const hX = -tankW / 2 - 0.12;
  g.add(box(0.1, 0.2, 0.15, M.bodyDark, hX, 0.7, 0.2));
  // Heater connections
  g.add(cyl(0.015, 0.015, 0.12, 6, M.chrome, hX + 0.05, 0.7, 0.2,
    0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, 0.12, 6, M.chrome, hX + 0.05, 0.8, 0.2,
    0, 0, Math.PI / 2));
  // Temperature sensor probe
  g.add(cyl(0.008, 0.008, 0.15, 6, stainless, hX + 0.1, 0.75, 0.2,
    0, 0, Math.PI / 2));

  // ====== CHEMICAL DOSING PUMPS ======
  for (let i = 0; i < 2; i++) {
    const pZ = -0.2 + i * 0.3;
    // Pump body
    g.add(box(0.08, 0.1, 0.06, pumpBody, tankW / 2 + 0.2, 0.55, pZ));
    // Pump head
    g.add(cyl(0.03, 0.03, 0.04, 8, M.chrome, tankW / 2 + 0.2, 0.62, pZ));
    // Suction tube (into chemical jug)
    g.add(cyl(0.006, 0.006, 0.3, 6, tubingClear,
      tankW / 2 + 0.25, 0.4, pZ, -0.3, 0, 0));
    // Discharge tube
    g.add(cyl(0.006, 0.006, 0.2, 6, tubingClear,
      tankW / 2 + 0.15, 0.6, pZ, 0.4, 0, 0));
    // Chemical container (small jug)
    g.add(cyl(0.05, 0.04, 0.15, 8, mat(0xeeeedd, 0.0, 0.8),
      tankW / 2 + 0.3, 0.35, pZ));
  }

  // ====== CONTROL PANEL WITH TEMPERATURE DISPLAY ======
  const cpY = 1.3;
  g.add(box(0.4, 0.3, 0.04, M.bodyGray, 0, cpY, tankD / 2 + 0.04));
  // Temperature display
  g.add(box(0.15, 0.06, 0.005, tempDisplay, 0, cpY + 0.06, tankD / 2 + 0.065));
  // Timer display
  g.add(box(0.1, 0.04, 0.005, tempDisplay, 0, cpY - 0.02, tankD / 2 + 0.065));
  // Start/stop buttons
  g.add(cyl(0.02, 0.02, 0.015, 8, mat(0x00aa44, 0.2, 0.5),
    -0.1, cpY - 0.08, tankD / 2 + 0.065));
  g.add(cyl(0.02, 0.02, 0.015, 8, M.red,
    0.1, cpY - 0.08, tankD / 2 + 0.065));
  // Temperature setpoint knob
  g.add(cyl(0.02, 0.02, 0.02, 10, M.chrome,
    -0.05, cpY - 0.08, tankD / 2 + 0.065));
  // Timer knob
  g.add(cyl(0.02, 0.02, 0.02, 10, M.chrome,
    0.05, cpY - 0.08, tankD / 2 + 0.065));
  // Power indicator LED
  g.add(sph(0.008, mat(0x00ff00, 0, 0.3, {
    emissive: 0x00ff00, emissiveIntensity: 1.5,
  }), 0.15, cpY + 0.1, tankD / 2 + 0.065));

  // ====== OVERFLOW / DRAIN PIPE ======
  g.add(cyl(0.02, 0.02, 0.35, 8, M.pipe,
    -tankW / 2 - 0.05, 1.2, 0.3));
  // Elbow
  g.add(sph(0.025, M.pipe, -tankW / 2 - 0.05, 1.02, 0.3));
  // Horizontal run to drain
  g.add(cyl(0.02, 0.02, 0.3, 8, M.pipe,
    -tankW / 2 - 0.05, 1.0, 0.15, Math.PI / 2, 0, 0));

  // ====== SPLASH GUARD ======
  g.add(box(tankW + 0.1, 0.25, 0.02, splashGuard, 0, 1.65, tankD / 2 + 0.01));
  // Splash guard supports
  g.add(box(0.03, 0.15, 0.06, stainless, -0.5, 1.6, tankD / 2 + 0.02));
  g.add(box(0.03, 0.15, 0.06, stainless, 0.5, 1.6, tankD / 2 + 0.02));

  // ====== STATUS LIGHT ======
  g.add(createStatusLight(tankW / 2 - 0.1, 1.55, -tankD / 2));

  return g;
}
