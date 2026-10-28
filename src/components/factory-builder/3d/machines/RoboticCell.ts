import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Robotic Cell — 6-axis industrial robot arm inside a safety cage.
 * Includes base pedestal, articulated arm segments, gripper, and safety fencing.
 */
export function buildRoboticCell(): THREE.Group {
  const g = new THREE.Group();

  const robotOrange = mat(0xef6c00, 0.4, 0.4);
  const robotDark = mat(0x2a2a2a, 0.6, 0.35);
  const cageMat = mat(0x888888, 0.5, 0.5, { transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const cageFrame = mat(0xcccc00, 0.3, 0.6);

  // ── Floor plate ──
  g.add(box(1.0, 0.02, 1.0, M.floor, 0, 0.01, 0));

  // ── Safety cage (wire mesh fencing) ──
  const cageH = 0.9;
  // 4 corner posts (yellow safety color)
  g.add(box(0.03, cageH, 0.03, cageFrame, -0.48, cageH / 2 + 0.02, -0.48));
  g.add(box(0.03, cageH, 0.03, cageFrame, 0.48, cageH / 2 + 0.02, -0.48));
  g.add(box(0.03, cageH, 0.03, cageFrame, -0.48, cageH / 2 + 0.02, 0.48));
  g.add(box(0.03, cageH, 0.03, cageFrame, 0.48, cageH / 2 + 0.02, 0.48));
  // Top rails
  g.add(box(0.96, 0.02, 0.02, cageFrame, 0, cageH + 0.02, -0.48));
  g.add(box(0.96, 0.02, 0.02, cageFrame, 0, cageH + 0.02, 0.48));
  g.add(box(0.02, 0.02, 0.96, cageFrame, -0.48, cageH + 0.02, 0));
  g.add(box(0.02, 0.02, 0.96, cageFrame, 0.48, cageH + 0.02, 0));
  // Mid rails
  g.add(box(0.96, 0.02, 0.02, cageFrame, 0, cageH * 0.5 + 0.02, -0.48));
  g.add(box(0.96, 0.02, 0.02, cageFrame, 0, cageH * 0.5 + 0.02, 0.48));
  g.add(box(0.02, 0.02, 0.96, cageFrame, -0.48, cageH * 0.5 + 0.02, 0));
  g.add(box(0.02, 0.02, 0.96, cageFrame, 0.48, cageH * 0.5 + 0.02, 0));
  // Wire mesh panels (translucent)
  g.add(box(0.96, cageH, 0.005, cageMat, 0, cageH / 2 + 0.02, -0.48));  // back
  g.add(box(0.005, cageH, 0.96, cageMat, -0.48, cageH / 2 + 0.02, 0));  // left
  g.add(box(0.005, cageH, 0.96, cageMat, 0.48, cageH / 2 + 0.02, 0));   // right
  // Front panel with gap (access door)
  g.add(box(0.35, cageH, 0.005, cageMat, -0.28, cageH / 2 + 0.02, 0.48));
  g.add(box(0.35, cageH, 0.005, cageMat, 0.28, cageH / 2 + 0.02, 0.48));

  // ── Robot Base Pedestal ──
  g.add(cyl(0.12, 0.14, 0.04, 16, robotDark, 0, 0.04, 0));  // base plate
  g.add(cyl(0.10, 0.10, 0.08, 16, robotOrange, 0, 0.10, 0)); // turret base

  // ── Joint 1 (base rotation) — Shoulder ──
  const shoulder = new THREE.Group();
  shoulder.name = 'robotShoulder';
  shoulder.position.set(0, 0.14, 0);
  // Shoulder housing
  shoulder.add(box(0.12, 0.10, 0.10, robotOrange, 0, 0.05, 0));
  // Joint ring
  shoulder.add(cyl(0.065, 0.065, 0.03, 12, robotDark, 0, 0, 0));

  // ── Upper arm ──
  const upperArm = new THREE.Group();
  upperArm.name = 'robotUpperArm';
  upperArm.position.set(0, 0.10, 0);
  upperArm.rotation.z = -0.3; // angled back slightly
  upperArm.add(box(0.07, 0.35, 0.07, robotOrange, 0, 0.175, 0));
  // Elbow joint
  upperArm.add(cyl(0.05, 0.05, 0.08, 12, robotDark, 0, 0.35, 0, 0, 0, Math.PI / 2));

  // ── Forearm ──
  const forearm = new THREE.Group();
  forearm.name = 'robotForearm';
  forearm.position.set(0, 0.35, 0);
  forearm.rotation.z = 0.6;
  forearm.add(box(0.055, 0.28, 0.055, robotOrange, 0, 0.14, 0));
  // Wrist joint
  forearm.add(cyl(0.04, 0.04, 0.06, 12, robotDark, 0, 0.28, 0, 0, 0, Math.PI / 2));

  // ── Wrist + Gripper ──
  const wrist = new THREE.Group();
  wrist.position.set(0, 0.28, 0);
  // Wrist housing
  wrist.add(cyl(0.03, 0.03, 0.06, 8, robotDark, 0, 0.03, 0));
  // Gripper mount
  wrist.add(box(0.06, 0.02, 0.06, M.chrome, 0, 0.07, 0));
  // Gripper fingers (2 jaws)
  wrist.add(box(0.01, 0.06, 0.04, M.chrome, -0.025, 0.10, 0));
  wrist.add(box(0.01, 0.06, 0.04, M.chrome, 0.025, 0.10, 0));
  // Finger tips
  wrist.add(box(0.01, 0.01, 0.04, M.rubber, -0.025, 0.13, 0));
  wrist.add(box(0.01, 0.01, 0.04, M.rubber, 0.025, 0.13, 0));

  forearm.add(wrist);
  upperArm.add(forearm);
  shoulder.add(upperArm);
  g.add(shoulder);

  // ── Cable harness (draped along arm) ──
  g.add(cyl(0.015, 0.015, 0.20, 6, M.wire, 0.05, 0.25, -0.04, 0.3, 0, 0));

  // ── Work fixture on floor (part holder) ──
  g.add(box(0.2, 0.03, 0.15, M.table, 0.25, 0.035, 0.1));
  // Locating pins
  g.add(cyl(0.01, 0.01, 0.04, 6, M.chrome, 0.20, 0.065, 0.06));
  g.add(cyl(0.01, 0.01, 0.04, 6, M.chrome, 0.30, 0.065, 0.14));

  // ── Controller cabinet (side) ──
  g.add(box(0.12, 0.4, 0.2, robotDark, -0.35, 0.22, -0.3));
  // Cabinet door
  g.add(box(0.005, 0.35, 0.16, mat(0x3a3a3a, 0.5, 0.4), -0.285, 0.22, -0.3));
  // Status LEDs on cabinet
  g.add(sph(0.012, mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.0 }), -0.285, 0.38, -0.34));
  g.add(sph(0.012, mat(0x0088ff, 0.1, 0.3, { emissive: 0x0088ff, emissiveIntensity: 0.8 }), -0.285, 0.38, -0.30));

  // ── Warning signs ──
  // Yellow triangle on cage
  const warnSign = box(0.08, 0.08, 0.005, mat(0xffcc00, 0.0, 0.7), 0, cageH * 0.75, 0.483);
  g.add(warnSign);

  // ── Status light ──
  g.add(createStatusLight(0.42, 0.02, 0.42));

  return g;
}
