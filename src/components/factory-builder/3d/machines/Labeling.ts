import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Labeling Machine
 * Compact body with prominent label roll spool, ~0.6w x ~0.7h x ~0.5d
 */
export function buildLabeling(): THREE.Group {
  const g = new THREE.Group();

  // ── Compact body ──
  g.add(box(0.6, 0.5, 0.5, M.bodyGray, 0, 0.25, 0));

  // ── Large label roll spool on right side ──
  const spool = cyl(0.15, 0.15, 0.08, 20, M.yellow, 0.34, 0.4, 0, 0, 0, Math.PI / 2);
  spool.name = 'labelSpool';
  g.add(spool);
  // Spool hub
  g.add(cyl(0.04, 0.04, 0.09, 12, M.darkChrome, 0.34, 0.4, 0, 0, 0, Math.PI / 2));

  // ── Label web (thin strip from spool down to applicator) ──
  // Vertical section coming off spool
  g.add(box(0.002, 0.15, 0.04, M.yellow, 0.3, 0.28, 0));
  // Horizontal section going to applicator
  g.add(box(0.2, 0.002, 0.04, M.yellow, 0.15, 0.2, 0));

  // ── Applicator head ──
  const applicator = box(0.1, 0.06, 0.08, M.chrome, 0.05, 0.17, 0);
  applicator.name = 'applicator';
  g.add(applicator);
  // Rubber pad on bottom of applicator
  g.add(box(0.08, 0.015, 0.06, M.rubber, 0.05, 0.14, 0));

  // ── Product conveyor passage through middle (small belt area) ──
  g.add(box(0.5, 0.03, 0.2, M.conveyor, 0, 0.02, 0));
  // Conveyor side rails
  g.add(box(0.5, 0.05, 0.015, M.darkChrome, 0, 0.035, 0.1));
  g.add(box(0.5, 0.05, 0.015, M.darkChrome, 0, 0.035, -0.1));
  // Conveyor rollers
  for (let i = -3; i <= 3; i++) {
    g.add(cyl(0.015, 0.015, 0.2, 8, M.chrome, i * 0.07, 0.01, 0, Math.PI / 2, 0, 0));
  }

  // ── Sensor eye (small green emissive sphere) ──
  const sensorMat = mat(0x00ff44, 0.1, 0.3, { emissive: 0x00ff22, emissiveIntensity: 1.0 });
  const sensor = sph(0.02, sensorMat, -0.1, 0.12, 0.12);
  sensor.name = 'sensor';
  g.add(sensor);
  // Sensor bracket
  g.add(box(0.02, 0.06, 0.02, M.darkChrome, -0.1, 0.09, 0.12));

  // ── Label output tray (small flat box) ──
  g.add(box(0.12, 0.02, 0.1, M.darkChrome, -0.2, 0.51, 0.15));

  // ── Tension roller ──
  g.add(cyl(0.02, 0.02, 0.06, 10, M.chrome, 0.25, 0.3, 0, 0, 0, Math.PI / 2));

  // ── Status light ──
  const statusLight = createStatusLight(-0.25, 0.5, -0.2);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
