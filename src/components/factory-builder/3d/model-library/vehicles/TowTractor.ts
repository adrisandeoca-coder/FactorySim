import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildTowTractor(): THREE.Group {
  const g = new THREE.Group();

  // --- Color palette ---
  const bodyYellow = mat(0xccaa00, 0.3, 0.5);
  const bodyYellowDark = mat(0x998800, 0.35, 0.55);
  const batteryBlack = mat(0x1a1a1a, 0.2, 0.7);
  const batteryLabel = mat(0x992200, 0.1, 0.6);
  const frameMat = mat(0x2a2a2a, 0.6, 0.5);
  const platformMat = mat(0x444444, 0.5, 0.5);
  const dashMat = mat(0x333333, 0.2, 0.7);
  const seatMat = mat(0x222222, 0.0, 0.85);
  const beaconMat = mat(0xffcc00, 0.0, 0.3, { emissive: 0xffaa00, emissiveIntensity: 1.5 });
  const beaconLens = mat(0xffdd44, 0.0, 0.15, { emissive: 0xffbb00, emissiveIntensity: 1.0, transparent: true, opacity: 0.7 });
  const headlightMat = mat(0xffffdd, 0.0, 0.2, { emissive: 0xffffaa, emissiveIntensity: 0.8 });
  const taillightMat = mat(0xff2200, 0.0, 0.3, { emissive: 0xff1100, emissiveIntensity: 0.7 });
  const sensorStrip = mat(0xff4400, 0.1, 0.5, { emissive: 0xdd2200, emissiveIntensity: 0.4 });
  const hitchMat = mat(0x555555, 0.7, 0.3);
  const pinMat = mat(0x888888, 0.8, 0.2);
  const steeringMat = mat(0x333333, 0.3, 0.6);
  const keyMat = mat(0xcccccc, 0.7, 0.3);
  const mirrorGlass = mat(0xcccccc, 0.9, 0.1);
  const hornMat = mat(0x444444, 0.3, 0.6);

  // Compact vehicle, faces +X
  // Footprint roughly 0.6 x 0.4 (small industrial vehicle)

  // ============ CHASSIS / FRAME ============
  g.add(box(0.55, 0.03, 0.36, frameMat, 0, 0.06, 0));

  // Frame cross members
  g.add(box(0.03, 0.025, 0.32, frameMat, 0.15, 0.06, 0));
  g.add(box(0.03, 0.025, 0.32, frameMat, -0.1, 0.06, 0));
  g.add(box(0.03, 0.025, 0.32, frameMat, -0.22, 0.06, 0));

  // ============ WHEELS (3: 1 front steer, 2 rear drive) ============
  const wheelY = 0.06;
  const tireR = 0.06;

  // Front wheel (steerable)
  g.add(cyl(tireR, tireR, 0.04, 14, M.rubber, 0.22, wheelY, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.03, 10, M.darkChrome, 0.22, wheelY, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.005, 8, M.chrome, 0.22, wheelY, 0.022, Math.PI / 2, 0, 0));
  // Front fork / steering pivot
  g.add(box(0.03, 0.06, 0.05, frameMat, 0.22, 0.08, 0));
  g.add(cyl(0.015, 0.015, 0.08, 8, frameMat, 0.22, 0.12, 0));

  // Rear left wheel
  g.add(cyl(tireR, tireR, 0.05, 14, M.rubber, -0.2, wheelY, 0.2, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.035, 10, M.darkChrome, -0.2, wheelY, 0.2, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.005, 8, M.chrome, -0.2, wheelY, 0.225, Math.PI / 2, 0, 0));

  // Rear right wheel
  g.add(cyl(tireR, tireR, 0.05, 14, M.rubber, -0.2, wheelY, -0.2, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.035, 10, M.darkChrome, -0.2, wheelY, -0.2, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.005, 8, M.chrome, -0.2, wheelY, -0.225, Math.PI / 2, 0, 0));

  // Rear axle
  g.add(cyl(0.015, 0.015, 0.4, 8, frameMat, -0.2, wheelY, 0, Math.PI / 2, 0, 0));

  // ============ BATTERY COMPARTMENT ============
  // Main battery block
  g.add(box(0.28, 0.1, 0.3, batteryBlack, 0.0, 0.13, 0));
  // Battery top cover
  g.add(box(0.29, 0.01, 0.31, frameMat, 0.0, 0.185, 0));
  // Battery terminals
  g.add(cyl(0.01, 0.01, 0.015, 8, M.chrome, 0.08, 0.195, 0.08));
  g.add(cyl(0.01, 0.01, 0.015, 8, M.chrome, 0.08, 0.195, -0.08));
  // Battery label
  g.add(box(0.1, 0.04, 0.005, batteryLabel, 0.0, 0.13, 0.155));
  g.add(box(0.1, 0.04, 0.005, batteryLabel, 0.0, 0.13, -0.155));
  // Battery cables
  g.add(cyl(0.006, 0.006, 0.08, 6, M.red, 0.08, 0.2, 0.06, 0.5, 0.3, 0));
  g.add(cyl(0.006, 0.006, 0.08, 6, M.wire, 0.08, 0.2, -0.06, 0.5, -0.3, 0));
  // Battery vent caps
  for (let z = -0.06; z <= 0.06; z += 0.04) {
    g.add(cyl(0.008, 0.008, 0.008, 6, M.bodyDark, 0.06, 0.195, z));
  }

  // ============ OPERATOR PLATFORM ============
  // Floor plate (diamond plate)
  g.add(box(0.22, 0.015, 0.34, platformMat, -0.05, 0.19, 0));
  // Floor texture ridges
  for (let x = -0.12; x <= 0.05; x += 0.04) {
    g.add(box(0.03, 0.003, 0.3, mat(0x555555, 0.4, 0.5), x, 0.2, 0));
  }

  // Side rails / guards
  g.add(box(0.2, 0.06, 0.015, bodyYellow, -0.05, 0.23, 0.175));
  g.add(box(0.2, 0.06, 0.015, bodyYellow, -0.05, 0.23, -0.175));

  // Rear rail
  g.add(box(0.015, 0.06, 0.34, bodyYellow, -0.16, 0.23, 0));

  // Rail corner posts
  g.add(cyl(0.01, 0.01, 0.08, 8, bodyYellowDark, 0.05, 0.23, 0.175));
  g.add(cyl(0.01, 0.01, 0.08, 8, bodyYellowDark, 0.05, 0.23, -0.175));
  g.add(cyl(0.01, 0.01, 0.08, 8, bodyYellowDark, -0.155, 0.23, 0.175));
  g.add(cyl(0.01, 0.01, 0.08, 8, bodyYellowDark, -0.155, 0.23, -0.175));

  // ============ SEAT ============
  // Seat base
  g.add(box(0.12, 0.03, 0.14, seatMat, -0.08, 0.215, 0));
  // Seat back
  g.add(box(0.02, 0.12, 0.14, seatMat, -0.14, 0.28, 0));
  // Seat cushion detail
  g.add(box(0.1, 0.015, 0.12, mat(0x333333, 0.0, 0.9), -0.08, 0.235, 0));
  // Armrests
  g.add(box(0.08, 0.015, 0.015, seatMat, -0.1, 0.27, 0.08));
  g.add(box(0.08, 0.015, 0.015, seatMat, -0.1, 0.27, -0.08));

  // ============ BODY PANELS ============
  // Front cowl / nose
  g.add(box(0.08, 0.12, 0.34, bodyYellow, 0.2, 0.2, 0));
  // Front face panel
  g.add(box(0.01, 0.14, 0.36, bodyYellow, 0.245, 0.2, 0));
  // Fender tops
  g.add(box(0.12, 0.02, 0.1, bodyYellow, 0.18, 0.27, 0.16));
  g.add(box(0.12, 0.02, 0.1, bodyYellow, 0.18, 0.27, -0.16));

  // Side panels below platform
  g.add(box(0.4, 0.08, 0.015, bodyYellowDark, 0.02, 0.12, 0.185));
  g.add(box(0.4, 0.08, 0.015, bodyYellowDark, 0.02, 0.12, -0.185));

  // Rear panel
  g.add(box(0.015, 0.08, 0.34, bodyYellowDark, -0.2, 0.12, 0));

  // Ventilation grille on front
  for (let y = 0.16; y <= 0.24; y += 0.02) {
    g.add(box(0.005, 0.008, 0.2, M.bodyDark, 0.25, y, 0));
  }

  // ============ DASHBOARD ============
  g.add(box(0.06, 0.06, 0.24, dashMat, 0.14, 0.25, 0));

  // Dashboard face panel
  g.add(box(0.005, 0.05, 0.22, mat(0x2a2a2a, 0.1, 0.7), 0.11, 0.26, 0));

  // Key switch
  g.add(cyl(0.008, 0.008, 0.01, 8, keyMat, 0.108, 0.27, 0.04));
  g.add(box(0.005, 0.015, 0.003, keyMat, 0.103, 0.27, 0.04));

  // Speed/battery gauge (screen)
  g.add(box(0.005, 0.025, 0.04, M.screen, 0.108, 0.265, -0.03));

  // Forward/reverse switch
  g.add(box(0.01, 0.02, 0.015, M.bodyDark, 0.108, 0.25, 0.07));

  // Indicator LEDs on dash
  g.add(sph(0.005, mat(0x00ff00, 0.0, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }), 0.108, 0.28, -0.06));
  g.add(sph(0.005, mat(0xff8800, 0.0, 0.3, { emissive: 0xff6600, emissiveIntensity: 0.5 }), 0.108, 0.28, -0.075));

  // ============ STEERING TILLER / WHEEL ============
  // Steering column
  g.add(cyl(0.012, 0.012, 0.1, 8, steeringMat, 0.14, 0.3, 0, 0.4, 0, 0));

  // Steering wheel (small)
  g.add(cyl(0.04, 0.04, 0.01, 16, steeringMat, 0.13, 0.34, 0, 0.4, 0, 0));
  g.add(cyl(0.03, 0.03, 0.012, 16, M.rubber, 0.13, 0.34, 0, 0.4, 0, 0));

  // Steering wheel center cap
  g.add(cyl(0.012, 0.012, 0.008, 8, M.chrome, 0.128, 0.342, 0, 0.4, 0, 0));

  // ============ HORN BUTTON (on steering wheel center) ============
  g.add(cyl(0.01, 0.01, 0.005, 8, hornMat, 0.126, 0.344, 0, 0.4, 0, 0));

  // ============ LED HEADLIGHT ============
  g.add(cyl(0.025, 0.025, 0.015, 12, headlightMat, 0.255, 0.22, 0));
  // Headlight housing
  g.add(cyl(0.03, 0.03, 0.01, 12, M.bodyDark, 0.252, 0.22, 0));
  // Headlight bezel
  g.add(cyl(0.032, 0.032, 0.004, 12, M.chrome, 0.257, 0.22, 0));

  // ============ TAIL LIGHTS ============
  g.add(box(0.01, 0.03, 0.025, taillightMat, -0.21, 0.16, 0.16));
  g.add(box(0.01, 0.03, 0.025, taillightMat, -0.21, 0.16, -0.16));

  // ============ FRONT BUMPER WITH SAFETY SENSOR STRIP ============
  g.add(box(0.03, 0.06, 0.38, M.rubber, 0.27, 0.14, 0));
  // Sensor strip (orange/red)
  g.add(box(0.01, 0.02, 0.36, sensorStrip, 0.287, 0.15, 0));
  // Bumper mounting brackets
  g.add(box(0.04, 0.03, 0.02, frameMat, 0.26, 0.12, 0.15));
  g.add(box(0.04, 0.03, 0.02, frameMat, 0.26, 0.12, -0.15));

  // ============ SIDE MIRRORS ============
  // Left mirror
  g.add(cyl(0.005, 0.005, 0.06, 6, M.bodyDark, 0.18, 0.29, 0.2, 0, 0, Math.PI / 6));
  g.add(box(0.035, 0.03, 0.005, mirrorGlass, 0.18, 0.3, 0.23));
  g.add(box(0.04, 0.035, 0.008, M.bodyDark, 0.18, 0.3, 0.228));

  // Right mirror
  g.add(cyl(0.005, 0.005, 0.06, 6, M.bodyDark, 0.18, 0.29, -0.2, 0, 0, -Math.PI / 6));
  g.add(box(0.035, 0.03, 0.005, mirrorGlass, 0.18, 0.3, -0.23));
  g.add(box(0.04, 0.035, 0.008, M.bodyDark, 0.18, 0.3, -0.228));

  // ============ WARNING BEACON (top) ============
  // Beacon post
  g.add(cyl(0.01, 0.01, 0.06, 8, M.bodyDark, -0.14, 0.38, 0));
  // Beacon base
  g.add(cyl(0.03, 0.03, 0.015, 12, M.bodyDark, -0.14, 0.41, 0));
  // Beacon dome (yellow emissive)
  g.add(sph(0.025, beaconLens, -0.14, 0.435, 0));
  // Beacon inner light
  g.add(sph(0.012, beaconMat, -0.14, 0.435, 0));
  // Beacon top cap
  g.add(cyl(0.01, 0.015, 0.008, 8, M.bodyDark, -0.14, 0.46, 0));

  // ============ TOW HITCH (rear) ============
  // Hitch frame
  g.add(box(0.06, 0.04, 0.12, hitchMat, -0.25, 0.08, 0));
  // Hitch receiver
  g.add(box(0.04, 0.05, 0.05, hitchMat, -0.28, 0.075, 0));
  // Hitch pin hole
  g.add(cyl(0.01, 0.01, 0.06, 8, M.bodyDark, -0.28, 0.075, 0, Math.PI / 2, 0, 0));

  // ============ TOW PIN / COUPLING ============
  // Pin
  g.add(cyl(0.008, 0.008, 0.07, 8, pinMat, -0.28, 0.075, 0, Math.PI / 2, 0, 0));
  // Pin head
  g.add(cyl(0.015, 0.015, 0.008, 8, pinMat, -0.28, 0.075, 0.038, Math.PI / 2, 0, 0));
  // Safety clip / cotter pin
  g.add(cyl(0.003, 0.003, 0.02, 6, M.chrome, -0.28, 0.075, -0.038, 0.3, 0, 0));

  // Hitch reinforcement plates
  g.add(box(0.005, 0.05, 0.04, frameMat, -0.22, 0.08, 0.06));
  g.add(box(0.005, 0.05, 0.04, frameMat, -0.22, 0.08, -0.06));

  // ============ OVERHEAD GUARD / ROLL-OVER PROTECTION ============
  // Two rear uprights
  g.add(cyl(0.012, 0.012, 0.2, 8, bodyYellowDark, -0.12, 0.3, 0.16));
  g.add(cyl(0.012, 0.012, 0.2, 8, bodyYellowDark, -0.12, 0.3, -0.16));
  // Top bar
  g.add(box(0.02, 0.02, 0.32, bodyYellowDark, -0.12, 0.4, 0));
  // Cross bar connecting to front
  g.add(box(0.2, 0.015, 0.015, bodyYellowDark, -0.02, 0.4, 0.16));
  g.add(box(0.2, 0.015, 0.015, bodyYellowDark, -0.02, 0.4, -0.16));
  // Front cross bar
  g.add(box(0.02, 0.02, 0.32, bodyYellowDark, 0.08, 0.4, 0));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(-0.12, 0.4, 0));

  return g;
}
