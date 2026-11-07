import * as THREE from 'three';

/**
 * Moving equipment of the 3D warehouse, built at real size (1 unit = 1 m)
 * from a few boxes and cylinders each, because a DC can have many of them.
 *
 *   - Semi-trailer truck (tractor + 13.6 m box trailer) that backs onto a dock door.
 *   - AS/RS stacker crane: floor rail, mast, lift carriage with telescopic forks,
 *     top guide rail.
 */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
WHEEL.rotateZ(Math.PI / 2);

const TRAILER_MAT = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.55, metalness: 0.15 });
const TRAILER_FRAME = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.4 });
const TYRE_MAT = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.95 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.7 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.15, metalness: 0.6 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xd8261c, emissive: 0x8a1410, emissiveIntensity: 0.6 });

const CAB_MATS = new Map<number, THREE.MeshStandardMaterial>();
const cabMat = (c: number) => {
  let m = CAB_MATS.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.35 }); CAB_MATS.set(c, m); }
  return m;
};

function part(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, geo: THREE.BufferGeometry = BOX) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export const TRAILER_LENGTH = 13.6;
export const TRUCK_LENGTH = 16.5;

/**
 * Semi-trailer truck. Local origin = trailer rear at floor level; the truck
 * extends along +Z (cab at +Z), so it docks by sitting at the door with its
 * rear facing −Z. `cab` colour tells inbound from outbound trucks apart.
 */
export function buildSemiTruck(cab: number, stripe: number): THREE.Group {
  const g = new THREE.Group();
  const L = TRAILER_LENGTH, W = 2.55;
  // Trailer box (floor at 1.2 m dock height, 2.7 m inside height)
  part(g, TRAILER_MAT, 0, 1.25 + 1.4, L / 2, W, 2.8, L);
  part(g, cabMat(stripe), 0, 1.6, L / 2, W + 0.02, 0.35, L - 0.4);                // side stripe
  part(g, TRAILER_FRAME, 0, 1.05, L / 2, W - 0.3, 0.3, L);                         // chassis
  part(g, TRAILER_FRAME, 0, 2.65, 0.03, W + 0.04, 2.84, 0.06);                     // rear door frame
  part(g, LIGHT_MAT, -1.05, 1.0, -0.02, 0.3, 0.12, 0.04);
  part(g, LIGHT_MAT, 1.05, 1.0, -0.02, 0.3, 0.12, 0.04);
  part(g, TRAILER_FRAME, 0, 0.75, 0.05, W - 0.2, 0.1, 0.12);                       // underride bar
  for (const z of [1.6, 2.9, 4.2]) for (const x of [-0.95, 0.95]) {           // tri-axle bogie
    part(g, TYRE_MAT, x, 0.5, z, 0.5, 1.0, 1.0, WHEEL);
    part(g, RIM_MAT, x + Math.sign(x) * 0.26, 0.5, z, 0.04, 0.55, 0.55, WHEEL);
  }
  part(g, TRAILER_FRAME, -0.9, 0.55, L - 3.5, 0.1, 1.0, 0.1);                       // landing legs
  part(g, TRAILER_FRAME, 0.9, 0.55, L - 3.5, 0.1, 1.0, 0.1);
  // Tractor: chassis, cab with windscreen, fuel tanks, wheels
  const zc = L - 1.4;
  part(g, TRAILER_FRAME, 0, 0.85, zc + 1.5, 1.0, 0.3, 5.6);
  part(g, cabMat(cab), 0, 2.15, zc + 3.6, 2.5, 2.5, 2.2);
  part(g, cabMat(cab), 0, 3.55, zc + 3.4, 2.4, 0.4, 1.8);                          // roof fairing
  part(g, GLASS_MAT, 0, 2.6, zc + 4.71, 2.2, 1.0, 0.02);
  part(g, GLASS_MAT, -1.26, 2.6, zc + 4.1, 0.02, 0.8, 0.9);
  part(g, GLASS_MAT, 1.26, 2.6, zc + 4.1, 0.02, 0.8, 0.9);
  part(g, RIM_MAT, 0, 1.1, zc + 4.75, 2.3, 0.35, 0.1);                             // bumper
  part(g, RIM_MAT, -1.0, 0.9, zc + 2.0, 0.5, 0.5, 1.0);                            // tanks
  part(g, RIM_MAT, 1.0, 0.9, zc + 2.0, 0.5, 0.5, 1.0);
  for (const z of [zc - 0.1, zc + 1.2, zc + 4.0]) for (const x of [-1.0, 1.0]) {
    part(g, TYRE_MAT, x, 0.5, z, 0.5, 1.0, 1.0, WHEEL);
    part(g, RIM_MAT, x + Math.sign(x) * 0.26, 0.5, z, 0.04, 0.55, 0.55, WHEEL);
  }
  g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  return g;
}

const CRANE_MAT = new THREE.MeshStandardMaterial({ color: 0xf0b400, roughness: 0.45, metalness: 0.3 });
const CRANE_DARK = new THREE.MeshStandardMaterial({ color: 0x3d434b, roughness: 0.5, metalness: 0.5 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: 0x8a929b, roughness: 0.4, metalness: 0.7 });

export interface StackerCrane {
  /** Whole crane; move along the aisle with `group.position.z`. */
  group: THREE.Group;
  /** Lift carriage; set `carriage.position.y` to the level height. */
  carriage: THREE.Group;
  /** Telescopic forks; `forks.position.x` −reach…+reach toward a rack side. */
  forks: THREE.Group;
  /** Pallet carried on the forks. */
  load: THREE.Group;
}

/** Rails (static, full aisle length) for one aisle at x, from zFront to zBack. */
export function buildCraneRails(x: number, zFront: number, zBack: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const len = zFront - zBack;
  const zc = (zFront + zBack) / 2;
  part(g, RAIL_MAT, x, 0.06, zc, 0.12, 0.12, len);
  part(g, RAIL_MAT, x, height + 0.25, zc, 0.12, 0.12, len);
  // Top-rail hangers every ~6 m from the rack tops
  for (let z = zFront - 0.5; z > zBack; z -= 6) part(g, RAIL_MAT, x, height + 0.4, z, 1.2, 0.06, 0.08);
  g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  return g;
}

export function buildStackerCrane(height: number, aisleWidth: number, palletD: number, palletW: number, loadH: number): StackerCrane {
  const g = new THREE.Group();
  const w = Math.max(0.6, aisleWidth - 0.35);
  // Bottom carriage with drive, mast (lattice reads as a tall slim box), top guide trolley
  part(g, CRANE_MAT, 0, 0.3, 0, 0.5, 0.45, 2.6);
  part(g, CRANE_DARK, 0, 0.3, 1.45, 0.45, 0.4, 0.3);
  part(g, CRANE_DARK, 0, 0.3, -1.45, 0.45, 0.4, 0.3);
  part(g, CRANE_MAT, 0, height / 2 + 0.3, -0.85, 0.3, height, 0.45);
  part(g, CRANE_DARK, 0, height + 0.15, -0.85, 0.35, 0.25, 1.1);
  // Control cabinet at the foot of the mast
  part(g, CRANE_DARK, 0, 1.0, 0.85, 0.42, 1.0, 0.5);
  const carriage = new THREE.Group();
  part(carriage, CRANE_MAT, 0, 0.1, 0, w, 0.12, 1.25);       // platform
  part(carriage, CRANE_DARK, 0, 0.55, -0.62, w, 0.9, 0.06);   // back plate on the mast
  const forks = new THREE.Group();
  part(forks, RAIL_MAT, 0, 0.2, -0.3, palletD, 0.05, 0.14);
  part(forks, RAIL_MAT, 0, 0.2, 0.3, palletD, 0.05, 0.14);
  const load = new THREE.Group();
  const pal = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.9 });
  part(load, pal, 0, 0.3, 0, palletD, 0.14, palletW);
  const box = part(load, new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 }), 0, 0.37 + loadH / 2, 0, palletD - 0.06, loadH, palletW - 0.06);
  load.userData.box = box;
  load.visible = false;
  forks.add(load);
  carriage.add(forks);
  g.add(carriage);
  g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  return { group: g, carriage, forks, load };
}
