import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Flow Combiner / Merge
 * ~1.4w x ~1.0h x ~1.0d
 */
export function buildMerge(): THREE.Group {
  const g = new THREE.Group();

  // ── Mounting base plate ──
  g.add(box(1.2, 0.04, 0.9, M.bodyDark, 0, 0.02, 0));

  // Leveling feet
  const footPos: [number, number][] = [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]];
  for (const [fx, fz] of footPos) {
    g.add(cyl(0.04, 0.05, 0.02, 8, M.rubber, fx, 0.01, fz));
  }

  // ── Main merger housing (16-seg cylinder) ──
  const housingMat = M.bodyGray;
  g.add(cyl(0.3, 0.3, 0.35, 16, housingMat, 0, 0.38, 0));
  // Top/bottom flanges
  g.add(cyl(0.33, 0.33, 0.03, 16, M.darkChrome, 0, 0.57, 0));
  g.add(cyl(0.33, 0.33, 0.03, 16, M.darkChrome, 0, 0.2, 0));

  // ── Glass inspection window (front) ──
  const wf = cyl(0.12, 0.12, 0.03, 16, M.darkChrome, 0, 0.4, 0.3);
  wf.rotation.set(Math.PI / 2, 0, 0);
  g.add(wf);
  const wg = cyl(0.1, 0.1, 0.02, 16, M.glass, 0, 0.4, 0.31);
  wg.rotation.set(Math.PI / 2, 0, 0);
  g.add(wg);

  // ── Star wheel mechanism visible through window ──
  // Hub
  g.add(cyl(0.04, 0.04, 0.05, 12, M.chrome, 0, 0.38, 0.12));
  // 4 spokes
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const sx = Math.sin(angle) * 0.06;
    const sy = Math.cos(angle) * 0.06;
    g.add(box(0.01, 0.12, 0.02, M.chrome, sx, 0.38 + sy, 0.12, 0, 0, angle));
  }

  // ── 2 Input pipe stubs (back, angled inward) ──
  const pipeMat = M.pipe;
  const inAngle = Math.PI / 8;
  for (const side of [-1, 1]) {
    const angle = side * inAngle;
    const ix = Math.sin(angle) * -0.45;
    const iz = Math.cos(angle) * -0.45;
    const pipe = cyl(0.07, 0.07, 0.3, 12, pipeMat, ix, 0.38, iz);
    pipe.rotation.set(Math.PI / 2, -angle, 0);
    g.add(pipe);
    // Flange
    const fl = cyl(0.1, 0.1, 0.03, 12, M.darkChrome, ix - Math.sin(angle) * 0.15, 0.38, iz - Math.cos(angle) * 0.15);
    fl.rotation.set(Math.PI / 2, -angle, 0);
    g.add(fl);
  }

  // ── Single output pipe (front center) ──
  const outPipe = cyl(0.08, 0.08, 0.35, 12, pipeMat, 0, 0.38, 0.48);
  outPipe.rotation.set(Math.PI / 2, 0, 0);
  g.add(outPipe);
  const outFlange = cyl(0.11, 0.11, 0.03, 12, M.darkChrome, 0, 0.38, 0.63);
  outFlange.rotation.set(Math.PI / 2, 0, 0);
  g.add(outFlange);

  // ── Sensor heads at each input (small boxes with lens) ──
  for (const side of [-1, 1]) {
    const sx = side * 0.25;
    g.add(box(0.06, 0.05, 0.04, M.bodyDark, sx, 0.52, -0.35));
    // Lens
    g.add(sph(0.015, mat(0x4488cc, 0.3, 0.2), sx, 0.52, -0.32));
    // Sensor cable
    g.add(cyl(0.008, 0.008, 0.12, 6, M.wire, sx, 0.56, -0.38, 0.3, 0, 0));
  }

  // ── Status indicator matrix (2 input lights) ──
  g.add(sph(0.025, M.statusGreen, -0.2, 0.55, -0.52));
  g.add(sph(0.025, M.statusGreen, 0.2, 0.55, -0.52));

  // ── Control box on side ──
  g.add(box(0.12, 0.1, 0.08, M.bodyDark, 0.45, 0.35, 0));
  g.add(sph(0.012, mat(0x00cc44, 0.1, 0.3, { emissive: 0x004411, emissiveIntensity: 0.5 }), 0.45, 0.42, 0.04));

  // ── Pneumatic tubing ──
  g.add(cyl(0.01, 0.01, 0.15, 8, M.rubber, 0.35, 0.55, 0.05, 0, 0, 0.5));

  // ── Mounting bolts on base ──
  for (const [bx, bz] of footPos) {
    g.add(cyl(0.015, 0.015, 0.02, 6, M.chrome, bx, 0.05, bz));
  }

  // ── Status light ──
  const statusLight = createStatusLight(-0.5, 0.57, -0.35);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
