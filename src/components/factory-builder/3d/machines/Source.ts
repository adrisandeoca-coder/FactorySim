import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Parts Feeder / Input Hopper
 * Green-accented source station with hopper, vibration motor, and output chute.
 * Footprint ~1.4w x ~1.6h x ~1.2d
 */
export function buildSource(): THREE.Group {
  const g = new THREE.Group();

  // ── Green accent material ──
  const greenAccent = mat(0x1a8a40, 0.3, 0.5);
  const greenDark = mat(0x0e5528, 0.3, 0.6);

  // ── 4 mounting legs ──
  const legPositions: [number, number][] = [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]];
  for (const [lx, lz] of legPositions) {
    // Leg tube
    g.add(cyl(0.04, 0.04, 0.45, 8, M.bodyGray, lx, 0.225, lz));
    // Foot pad
    g.add(cyl(0.06, 0.065, 0.02, 12, M.rubber, lx, 0.01, lz));
    // Cross brace mounting plate
    g.add(box(0.08, 0.04, 0.08, M.darkChrome, lx, 0.44, lz));
  }

  // ── Leg cross braces (structural) ──
  g.add(box(0.6, 0.03, 0.03, M.bodyGray, 0, 0.15, -0.3));
  g.add(box(0.6, 0.03, 0.03, M.bodyGray, 0, 0.15, 0.3));
  g.add(box(0.03, 0.03, 0.56, M.bodyGray, -0.35, 0.15, 0));
  g.add(box(0.03, 0.03, 0.56, M.bodyGray, 0.35, 0.15, 0));

  // ── Hopper body (truncated pyramid — reduced height ~30%) ──
  const hopperGeo = new THREE.CylinderGeometry(0.70, 0.40, 0.42, 4);
  const hopperMesh = new THREE.Mesh(hopperGeo, M.bodyGray);
  hopperMesh.position.set(0, 0.68, 0);
  hopperMesh.rotation.set(0, Math.PI / 4, 0);
  hopperMesh.castShadow = true;
  hopperMesh.receiveShadow = true;
  hopperMesh.name = 'hopper';
  g.add(hopperMesh);

  // Hopper rim (green accent band at top)
  const rimGeo = new THREE.CylinderGeometry(0.72, 0.70, 0.04, 4);
  const rimMesh = new THREE.Mesh(rimGeo, greenAccent);
  rimMesh.position.set(0, 0.90, 0);
  rimMesh.rotation.set(0, Math.PI / 4, 0);
  rimMesh.castShadow = true;
  g.add(rimMesh);

  // Hopper interior walls visible rim
  const innerRimGeo = new THREE.CylinderGeometry(0.67, 0.66, 0.03, 4, 1, true);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, mat(0x2a2e36, 0.5, 0.6, { side: THREE.BackSide }));
  innerRimMesh.position.set(0, 0.87, 0);
  innerRimMesh.rotation.set(0, Math.PI / 4, 0);
  g.add(innerRimMesh);

  // Interior warm glow light
  const interiorLight = new THREE.PointLight(0xffdd88, 0.8, 2);
  interiorLight.position.set(0, 0.75, 0);
  interiorLight.name = 'interiorLight';
  g.add(interiorLight);

  // ── Parts visible inside hopper ──
  const partColors = [
    mat(0x4488cc, 0.6, 0.35),
    mat(0xcc8844, 0.5, 0.4),
    mat(0x88aa88, 0.7, 0.3),
    mat(0xaa6633, 0.4, 0.5),
  ];
  g.add(box(0.06, 0.04, 0.05, partColors[0], -0.08, 0.74, -0.03));
  g.add(box(0.05, 0.04, 0.06, partColors[1], 0.06, 0.72, 0.05));
  g.add(box(0.04, 0.05, 0.04, partColors[2], -0.02, 0.77, 0.08));
  g.add(cyl(0.025, 0.025, 0.05, 8, partColors[3], 0.1, 0.73, -0.06));
  g.add(cyl(0.02, 0.02, 0.06, 8, partColors[0], -0.1, 0.75, 0.04));
  g.add(cyl(0.02, 0.02, 0.05, 8, partColors[2], 0.03, 0.71, -0.08, 0.4, 0.2, 0));
  g.add(box(0.05, 0.03, 0.04, partColors[1], -0.05, 0.70, -0.01, 0.1, 0.3, 0.15));

  // ── Output chute at bottom front ──
  // Angled slide coming from hopper bottom, pointing forward (+Z)
  const chuteMat = M.chrome;
  const chute = new THREE.Group();
  chute.position.set(0, 0.42, 0.32);
  chute.rotation.set(0.52, 0, 0); // ~30 degrees angled downward

  // Chute floor (longer slide surface)
  chute.add(box(0.22, 0.02, 0.45, chuteMat, 0, 0, 0));
  // Chute left wall
  chute.add(box(0.02, 0.07, 0.45, chuteMat, -0.11, 0.035, 0));
  // Chute right wall
  chute.add(box(0.02, 0.07, 0.45, chuteMat, 0.11, 0.035, 0));

  // Flared opening at chute exit
  chute.add(box(0.28, 0.02, 0.06, chuteMat, 0, 0, 0.24));       // wider floor lip
  chute.add(box(0.02, 0.07, 0.06, chuteMat, -0.14, 0.035, 0.24)); // left flare
  chute.add(box(0.02, 0.07, 0.06, chuteMat, 0.14, 0.035, 0.24));  // right flare

  g.add(chute);

  // Chute connection flange to hopper
  g.add(box(0.26, 0.1, 0.05, M.pipe, 0, 0.5, 0.3));

  // Part sliding down the chute
  g.add(box(0.05, 0.03, 0.04, partColors[0], 0, 0.30, 0.58));

  // ── Vibration motor housing (on right side) ──
  const motorHousing = box(0.14, 0.1, 0.12, greenDark, 0.42, 0.65, 0);
  motorHousing.name = 'vibMotor';
  g.add(motorHousing);

  // Motor end cap
  g.add(cyl(0.04, 0.04, 0.03, 12, M.darkChrome, 0.5, 0.65, 0));
  // Motor mounting bolts (4 tiny cylinders)
  const boltOffsets: [number, number][] = [[-0.04, -0.035], [0.04, -0.035], [-0.04, 0.035], [0.04, 0.035]];
  for (const [by, bz] of boltOffsets) {
    g.add(cyl(0.01, 0.01, 0.02, 6, M.chrome, 0.42, 0.65 + by, bz));
  }

  // Motor power cable
  g.add(cyl(0.012, 0.012, 0.18, 6, M.rubber, 0.5, 0.6, 0.05, 0.2, 0, Math.PI / 2));

  // ── Level sensor probe on left side ──
  g.add(box(0.04, 0.12, 0.04, M.bodyGray, -0.48, 0.72, 0));
  g.add(cyl(0.008, 0.008, 0.25, 8, M.chrome, -0.44, 0.74, 0, 0, 0, 0.15));
  g.add(box(0.05, 0.04, 0.04, mat(0x224466, 0.3, 0.5), -0.48, 0.80, 0));
  g.add(sph(0.008, M.statusGreen, -0.48, 0.83, 0.02));

  // ── Green identification stripe on hopper ──
  const stripGeo = new THREE.CylinderGeometry(0.56, 0.50, 0.04, 4, 1, true);
  const stripMesh = new THREE.Mesh(stripGeo, greenAccent);
  stripMesh.position.set(0, 0.64, 0);
  stripMesh.rotation.set(0, Math.PI / 4, 0);
  stripMesh.castShadow = true;
  g.add(stripMesh);

  // ── Base plate (ties legs together, wider) ──
  g.add(box(0.95, 0.03, 0.8, M.bodyDark, 0, 0.46, 0));

  // ── Control junction box on back ──
  g.add(box(0.15, 0.12, 0.06, M.bodyGray, 0.2, 0.52, -0.34));
  // Cable gland
  g.add(cyl(0.015, 0.015, 0.03, 8, M.darkChrome, 0.2, 0.46, -0.36));
  // Wiring conduit down leg
  g.add(cyl(0.012, 0.012, 0.3, 6, M.wire, 0.35, 0.3, -0.32));

  // ── Status light on pole ──
  const statusLight = createStatusLight(0.40, 0.92, -0.2);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  // ── Spindle placeholder (required by animation system) ──
  const spindle = new THREE.Group();
  spindle.name = 'spindle';
  spindle.position.set(0, 0.68, 0);
  g.add(spindle);

  return g;
}
