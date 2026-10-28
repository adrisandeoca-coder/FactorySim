import * as THREE from 'three';
import { box, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Line-end and buffer models in real-world proportions (1 unit = 1 m),
 * styled after Visual Components / FlexSim layouts:
 *  - Source: infeed pallet station (raw-material pallet + roller stub)
 *  - Sink:   outbound pallet that fills with cartons as parts complete
 *  - Buffer: accumulation roller conveyor whose totes show the fill level
 *
 * Named children used by the live view:
 *  - 'fillGroup' with 'bin_<n>' meshes (shown/hidden by fill level)
 *  - 'statusLight' (via createStatusLight)
 */

const ROLLER_TOP = 0.8;
const frameMat = mat(0x8d969f, 0.45, 0.4);
const legMat = mat(0x4f5660, 0.4, 0.5);
const rollerMat = mat(0xc3c9cf, 0.7, 0.3);
const markMat = mat(0xf2c200, 0.05, 0.6);
const toteMat = () => mat(0x5f6b78, 0.05, 0.6); // neutral grey totes: colour is reserved for product types
const stretchMat = mat(0xdfe6ee, 0.0, 0.25, { transparent: true, opacity: 0.35 });

/** EUR pallet 1.2 × 0.8 × 0.144 m, top at y = 0.144 */
function eurPallet(g: THREE.Group, x: number, z: number, rotY = 0) {
  const p = new THREE.Group();
  p.position.set(x, 0, z);
  p.rotation.y = rotY;
  for (const dz of [-0.35, 0, 0.35]) p.add(box(1.2, 0.022, 0.1, M.pallet, 0, 0.133, dz)); // top boards (3 wide)
  for (const dz of [-0.2, 0.2]) p.add(box(1.2, 0.022, 0.08, M.pallet, 0, 0.133, dz));
  for (const dx of [-0.55, 0, 0.55]) for (const dz of [-0.35, 0, 0.35]) p.add(box(0.1, 0.078, 0.1, M.pallet, dx, 0.083, dz)); // blocks
  for (const dz of [-0.35, 0, 0.35]) p.add(box(1.2, 0.022, 0.1, M.pallet, 0, 0.033, dz)); // bottom boards
  p.add(box(1.2, 0.022, 0.8, M.pallet, 0, 0.011, 0)).visible = false; // shadow catcher stays hidden
  g.add(p);
  return p;
}

/** Short roller conveyor section along local X (centred on x) */
function rollerSection(g: THREE.Group, x: number, z: number, len: number, w = 0.6) {
  for (const side of [-1, 1]) g.add(box(len, 0.14, 0.035, frameMat, x, ROLLER_TOP - 0.05, z + side * w / 2));
  const n = Math.floor(len / 0.1);
  for (let i = 0; i < n; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, w - 0.05, 10), rollerMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x - len / 2 + (i + 0.5) * (len / n), ROLLER_TOP - 0.028, z);
    g.add(r);
  }
  for (const lx of [x - len / 2 + 0.08, x + len / 2 - 0.08]) {
    for (const side of [-1, 1]) g.add(box(0.05, ROLLER_TOP - 0.12, 0.05, legMat, lx, (ROLLER_TOP - 0.12) / 2, z + side * (w / 2 - 0.04)));
    g.add(box(0.04, 0.04, w - 0.08, legMat, lx, 0.22, z));
  }
}

/** Yellow floor marking rectangle */
function floorMark(g: THREE.Group, w: number, d: number, x = 0, z = 0) {
  const t = 0.05;
  g.add(box(w, 0.004, t, markMat, x, 0.003, z - d / 2));
  g.add(box(w, 0.004, t, markMat, x, 0.003, z + d / 2));
  g.add(box(t, 0.004, d, markMat, x - w / 2, 0.003, z));
  g.add(box(t, 0.004, d, markMat, x + w / 2, 0.003, z));
}

function carton(w: number, h: number, d: number, x: number, y: number, z: number) {
  const c = box(w, h, d, M.cardboard, x, y + h / 2, z);
  c.castShadow = true;
  return c;
}

/** Source: raw-material pallet in a marked bay + roller infeed toward +X */
export function buildInfeedStation(): THREE.Group {
  const g = new THREE.Group();
  floorMark(g, 1.5, 1.1, -0.45, 0);
  eurPallet(g, -0.45, 0);
  // Two layers of crates (2 × 2 per layer)
  for (let layer = 0; layer < 2; layer++) {
    for (const dx of [-0.29, 0.29]) for (const dz of [-0.19, 0.19]) {
      g.add(carton(0.56, 0.3, 0.37, -0.45 + dx, 0.144 + layer * 0.3, dz));
    }
  }
  // Pick-up roller stub that the outgoing conveyor continues from
  rollerSection(g, 0.6, 0, 0.7);
  // Control post with stack light
  g.add(box(0.08, 1.2, 0.08, legMat, 0.6, 0.6, -0.45));
  g.add(box(0.22, 0.28, 0.12, M.bodyGray, 0.6, 1.0, -0.42));
  g.add(box(0.14, 0.08, 0.005, M.screen, 0.6, 1.04, -0.36));
  const light = createStatusLight(0.6, 1.2, -0.45);
  g.add(light);
  return g;
}

/** Sink: outbound pallet that fills with cartons (bin_0..bin_11) + stretch-wrap mast */
export function buildOutfeedStation(): THREE.Group {
  const g = new THREE.Group();
  floorMark(g, 1.5, 1.1, 0.3, 0);
  // Out-feed roller stub coming from the line (from −X)
  rollerSection(g, -0.75, 0, 0.6);
  eurPallet(g, 0.3, 0);
  const fill = new THREE.Group();
  fill.name = 'fillGroup';
  let i = 0;
  for (let layer = 0; layer < 3; layer++) {
    for (const dx of [-0.4, 0, 0.4]) for (const dz of [-0.19, 0.19]) {
      const c = carton(0.38, 0.28, 0.36, 0.3 + dx, 0.144 + layer * 0.28, dz);
      c.name = `bin_${i++}`;
      c.visible = false;
      fill.add(c);
    }
  }
  g.add(fill);
  // Stretch-wrap mast + film roll (reads as "shipping")
  g.add(box(0.1, 2.0, 0.1, M.bodyDark, 0.3, 1.0, -0.62));
  g.add(box(0.14, 0.5, 0.14, stretchMat, 0.3, 0.7, -0.55));
  g.add(box(0.5, 0.06, 0.5, M.bodyDark, 0.3, 0.03, -0.62));
  const light = createStatusLight(0.3, 2.05, -0.62);
  g.add(light);
  return g;
}

/**
 * Buffer: 2.4 m accumulation roller conveyor with side guards; totes
 * (bin_0..bin_5) appear as the buffer fills. Runs along local X.
 */
export function buildAccumulationBuffer(): THREE.Group {
  const g = new THREE.Group();
  const len = 2.4;
  rollerSection(g, 0, 0, len);
  for (const side of [-1, 1]) g.add(box(len, 0.05, 0.02, markMat, 0, ROLLER_TOP + 0.08, side * 0.31));
  // Photo-eye posts at both ends (accumulation sensors)
  for (const x of [-len / 2 + 0.1, len / 2 - 0.1]) {
    g.add(box(0.03, 0.18, 0.03, M.bodyDark, x, ROLLER_TOP + 0.09, -0.34));
  }
  const fill = new THREE.Group();
  fill.name = 'fillGroup';
  const n = 6;
  for (let i = 0; i < n; i++) {
    // Fill from the downstream end (+X) backwards, like a real accumulation line
    const x = len / 2 - 0.25 - i * ((len - 0.4) / n);
    const tote = box(0.3, 0.2, 0.44, toteMat(), x, ROLLER_TOP + 0.1, 0);
    tote.castShadow = true;
    tote.name = `bin_${i}`;
    tote.visible = i < 3; // half full until live data says otherwise
    fill.add(tote);
  }
  g.add(fill);
  const light = createStatusLight(len / 2 - 0.1, ROLLER_TOP + 0.4, -0.34);
  g.add(light);
  return g;
}
