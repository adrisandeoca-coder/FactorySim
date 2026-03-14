import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { mat } from '../shared/materials';

/**
 * Quality Control / Sampling Inspection Station
 * Light granite-look work surface with manual measurement equipment.
 * ~1.2w x ~1.2h x ~0.8d
 */
export function buildQCStation(): THREE.Group {
  const g = new THREE.Group();

  const surface = mat(0x8090a0, 0.1, 0.5);   // polished light gray granite-look
  const chrome = mat(0xc8d0d8, 0.95, 0.1);
  const screen = mat(0x0a1520, 0.0, 0.9, { emissive: 0x002244, emissiveIntensity: 0.8 });

  // ── Table legs (4 chrome cylinders at corners) ──
  const legOffsets: [number, number][] = [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]];
  for (const [lx, lz] of legOffsets) {
    g.add(cyl(0.025, 0.025, 0.45, 12, chrome, lx, 0.225, lz));
  }

  // ── Light work surface ──
  const table = box(1.1, 0.06, 0.7, surface, 0, 0.48, 0);
  table.name = 'workSurface';
  g.add(table);

  // Polished top highlight strip
  g.add(box(1.04, 0.004, 0.64, mat(0x95a5b5, 0.15, 0.35), 0, 0.513, 0));

  // ── Height gauge ──
  // Base pad
  g.add(box(0.06, 0.02, 0.06, chrome, -0.25, 0.52, 0.05));
  // Vertical column
  g.add(cyl(0.02, 0.02, 0.4, 12, chrome, -0.25, 0.72, 0.05));
  // Crossbar at top
  g.add(box(0.12, 0.015, 0.015, chrome, -0.25, 0.91, 0.05));

  // ── Dial indicator on gauge crossbar ──
  g.add(cyl(0.03, 0.03, 0.012, 16, chrome, -0.19, 0.91, 0.05));
  g.add(cyl(0.025, 0.025, 0.005, 16, mat(0xeeeeee, 0.0, 0.4), -0.19, 0.918, 0.05));

  // ── V-block (2 angled thin boxes) ──
  g.add(box(0.08, 0.005, 0.04, chrome, 0.05, 0.525, 0.1, 0, 0, 0.5));
  g.add(box(0.08, 0.005, 0.04, chrome, 0.05, 0.525, 0.1, 0, 0, -0.5));

  // ── Micrometer (lying flat) ──
  g.add(cyl(0.015, 0.015, 0.12, 10, chrome, 0.3, 0.52, -0.05, 0, 0, Math.PI / 2));
  // Anvil frame
  g.add(box(0.04, 0.02, 0.015, chrome, 0.24, 0.52, -0.05));

  // ── Inspection lamp + PointLight ──
  // Lamp arm post
  g.add(cyl(0.012, 0.012, 0.35, 8, chrome, 0.5, 0.68, -0.25));
  // Lamp arm horizontal
  g.add(box(0.18, 0.012, 0.012, chrome, 0.42, 0.85, -0.25));
  // Lamp shade
  g.add(cyl(0.04, 0.06, 0.03, 12, mat(0xdddddd, 0.3, 0.4), 0.34, 0.84, -0.25));
  // Light
  const lamp = new THREE.PointLight(0xffffff, 0.8, 2);
  lamp.position.set(0.34, 0.82, -0.25);
  lamp.name = 'interiorLight';
  g.add(lamp);

  // ── Magnifying lens on arm ──
  // Arm post
  g.add(cyl(0.01, 0.01, 0.2, 8, chrome, -0.4, 0.61, -0.15));
  // Arm horizontal
  g.add(box(0.1, 0.01, 0.01, chrome, -0.35, 0.72, -0.15));
  // Glass sphere
  const lens = sph(0.06, mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    -0.3, 0.72, -0.15);
  lens.name = 'magnifyingLens';
  g.add(lens);

  // ── Parts staging tray ──
  // Tray
  g.add(box(0.16, 0.015, 0.1, mat(0x606870, 0.5, 0.4), 0.35, 0.52, 0.2));
  // Tray rim
  g.add(box(0.16, 0.025, 0.005, mat(0x606870, 0.5, 0.4), 0.35, 0.53, 0.25));
  g.add(box(0.16, 0.025, 0.005, mat(0x606870, 0.5, 0.4), 0.35, 0.53, 0.15));
  // Test parts
  g.add(box(0.025, 0.02, 0.025, mat(0x3b82f6, 0.2, 0.5), 0.33, 0.54, 0.2));
  g.add(cyl(0.015, 0.015, 0.025, 10, mat(0xdd2222, 0.1, 0.5), 0.37, 0.54, 0.21));
  g.add(box(0.02, 0.015, 0.03, mat(0x00dd44, 0.1, 0.4), 0.35, 0.54, 0.18));

  // ── Clipboard / screen panel ──
  g.add(box(0.12, 0.09, 0.01, screen, -0.42, 0.56, 0.3, -0.3, 0, 0));

  // ── Status light ──
  const statusLight = createStatusLight(0.5, 0.51, -0.3);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
