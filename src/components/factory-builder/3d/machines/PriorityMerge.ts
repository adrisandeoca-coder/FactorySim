import * as THREE from 'three';
import { box, cyl, sph, tor, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Priority Merge / Funnel — multiple inputs converging to single output
 * with a marked priority lane.
 * Footprint: ~1.0w (input) narrowing to ~0.4w (output), ~0.3h, ~0.8d
 */
export function buildPriorityMerge(): THREE.Group {
  const g = new THREE.Group();

  // ── Base plate ──
  g.add(box(1.0, 0.03, 0.8, M.bodyDark, 0, 0.015, 0));

  // ── Angled side walls (trapezoidal funnel) ──
  // Input side at z=-0.4, output side at z=+0.4
  // Width goes from 1.0 to 0.4
  const wallH = 0.2;
  const wallThick = 0.025;
  const wallLen = Math.sqrt(0.8 ** 2 + 0.3 ** 2); // hypotenuse for angled wall
  const wallAngleY = Math.atan2(0.3, 0.8);         // angle in XZ plane

  // Left angled wall: from (-0.5, z=-0.4) to (-0.2, z=+0.4)
  const leftWall = box(wallLen, wallH, wallThick, M.bodyGray,
    -0.35, 0.03 + wallH / 2, 0);
  leftWall.rotation.y = -wallAngleY;
  g.add(leftWall);

  // Right angled wall: from (+0.5, z=-0.4) to (+0.2, z=+0.4)
  const rightWall = box(wallLen, wallH, wallThick, M.bodyGray,
    0.35, 0.03 + wallH / 2, 0);
  rightWall.rotation.y = wallAngleY;
  g.add(rightWall);

  // ── Input side: 3 input channel openings ──
  const channelW = 0.26;
  const channelH = 0.15;
  const channelD = 0.15;
  const inputZ = -0.35;

  for (let i = 0; i < 3; i++) {
    const cx = -0.32 + i * 0.32;
    // Channel walls (U-shape)
    g.add(box(wallThick, channelH, channelD, M.darkChrome, cx - channelW / 2, 0.03 + channelH / 2, inputZ));
    g.add(box(wallThick, channelH, channelD, M.darkChrome, cx + channelW / 2, 0.03 + channelH / 2, inputZ));
    g.add(box(channelW, channelH, wallThick, M.darkChrome, cx, 0.03 + channelH / 2, inputZ - channelD / 2));

    // Sensor heads at each input (green emissive spheres)
    const sensorMat = mat(0x00dd44, 0.1, 0.4, { emissive: 0x00dd44, emissiveIntensity: 0.8 });
    g.add(sph(0.02, sensorMat, cx, 0.03 + channelH + 0.03, inputZ));
  }

  // ── Priority lane marking (middle channel, index 1 → cx=0) ──
  // Yellow side rails on priority channel
  const prioMat = mat(0xffcc00, 0.2, 0.6);
  g.add(box(0.008, channelH + 0.03, channelD, prioMat, -channelW / 2 + 0.01, 0.03 + channelH / 2, inputZ));
  g.add(box(0.008, channelH + 0.03, channelD, prioMat,  channelW / 2 - 0.01, 0.03 + channelH / 2, inputZ));
  // Yellow stripe on priority channel floor
  g.add(box(channelW - 0.04, 0.005, channelD, prioMat, 0, 0.035, inputZ));

  // Priority indicator light (amber emissive)
  const amberMat = mat(0xffaa00, 0.1, 0.3, { emissive: 0xffaa00, emissiveIntensity: 1.0 });
  g.add(sph(0.025, amberMat, 0, 0.03 + channelH + 0.06, inputZ));

  // ── Output side: single output channel ──
  const outputZ = 0.35;
  const outW = 0.3;
  const outH = 0.15;
  const outD = 0.12;
  g.add(box(wallThick, outH, outD, M.darkChrome, -outW / 2, 0.03 + outH / 2, outputZ));
  g.add(box(wallThick, outH, outD, M.darkChrome,  outW / 2, 0.03 + outH / 2, outputZ));
  g.add(box(outW, outH, wallThick, M.darkChrome, 0, 0.03 + outH / 2, outputZ + outD / 2));

  // ── Merge mechanism: star wheel / gate in center ──
  const gateY = 0.03 + 0.1;
  // Torus ring
  g.add(tor(0.1, 0.015, M.chrome, 0, gateY, 0, Math.PI / 2, 0, 0));
  // Spokes (4 thin cylinders through center)
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 4;
    g.add(cyl(0.008, 0.008, 0.2, 6, M.chrome,
      Math.cos(angle) * 0.0, gateY, Math.sin(angle) * 0.0,
      0, angle, Math.PI / 2));
    // Actual spoke extending from center
    const spokeX = Math.cos(angle) * 0.05;
    const spokeZ = Math.sin(angle) * 0.05;
    g.add(cyl(0.006, 0.006, 0.1, 6, M.chrome,
      spokeX, gateY, spokeZ,
      0, angle, Math.PI / 2));
  }

  // ── Status light ──
  g.add(createStatusLight(0.4, 0.03 + wallH, -0.3));

  return g;
}
