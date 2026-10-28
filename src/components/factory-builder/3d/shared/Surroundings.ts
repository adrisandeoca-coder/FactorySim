import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildOperator } from '../machines/Operator';
import { buildWarehouseBay } from '../model-library/warehousing/WarehouseBay';
import { buildForklift as buildForkliftModel } from '../model-library/material-handling/Forklift';

/**
 * Building context and scenery around the simulated line, generated from
 * the layout's own bounds (Visual Components / FlexSim look):
 *
 *   always    cell zone with yellow boundary, dark aisle with white arrows,
 *             steel columns on a 10 m grid, back and side walls with windows
 *   scenery   pallet racks, staged pallets, a parked forklift and workers at
 *             stations. Decorative only (not simulated), so it can be
 *             switched off and is only placed where nothing simulated sits.
 *
 * 1 unit = 1 m. The camera looks from +X/+Z, so walls go on the −Z and −X
 * sides and the aisle runs along the +Z side of the line.
 */

export interface LayoutNode {
  id: string;
  type: string;
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Extra footprint (world rect), e.g. a warehouse's rack block behind its dock. */
  block?: { x0: number; x1: number; z0: number; z1: number };
  /** Truck apron outside a dock wall (world rect): the building opens there. */
  yard?: { x0: number; x1: number; z0: number; z1: number };
}

/** Pieces of [x0, x1] outside the given holes. */
function splitX(x0: number, x1: number, holes: { x0: number; x1: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let x = x0;
  for (const h of [...holes].sort((a, b) => a.x0 - b.x0)) {
    if (h.x1 <= x || h.x0 >= x1) continue;
    if (h.x0 > x) out.push([x, h.x0]);
    x = Math.max(x, h.x1);
  }
  if (x < x1) out.push([x, x1]);
  return out;
}

export interface LayoutInfo {
  nodes: LayoutNode[];
  routes: THREE.Vector3[][];
}

interface Rect { x0: number; x1: number; z0: number; z1: number }

const STAFFED = new Set(['station', 'assembly', 'inspection', 'disassembly', 'qcstation']);

const zoneMat = new THREE.MeshStandardMaterial({ color: 0xc9d0d7, roughness: 0.95, metalness: 0 });
const yellowMat = new THREE.MeshBasicMaterial({ color: 0xe8b800 });
const aisleMat = new THREE.MeshStandardMaterial({ color: 0x7a828c, roughness: 0.9, metalness: 0 });
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f8 });
const columnMat = new THREE.MeshStandardMaterial({ color: 0x5b6169, roughness: 0.55, metalness: 0.35 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.85, metalness: 0 });
const wallBaseMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.8, metalness: 0.1 });
const windowMat = new THREE.MeshStandardMaterial({ color: 0x8fb3cf, roughness: 0.15, metalness: 0.3 });
const palletMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.9 });
const matMat = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.95 });           // anti-fatigue mat
const hmiMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.4 });
const screenMat = new THREE.MeshStandardMaterial({ color: 0x2a5d8f, roughness: 0.3, emissive: 0x1d4f80, emissiveIntensity: 0.6 });
const officeMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.8 });
const cartonMat = new THREE.MeshStandardMaterial({ color: 0xc4934a, roughness: 0.95 });
const vestColors = [0xff7a1a, 0xe6f22e, 0xff7a1a, 0xffd21f];

/** Materials shared across rebuilds (never disposed). */
export const SURROUNDINGS_SHARED_MATS: THREE.Material[] = [
  zoneMat, yellowMat, aisleMat, whiteMat, columnMat, wallMat, wallBaseMat, windowMat, palletMat, cartonMat,
  matMat, hmiMat, screenMat, officeMat,
];

function slab(w: number, d: number, mat: THREE.Material, x: number, y: number, z: number, h = 0.004) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function overlaps(a: Rect, b: Rect) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Bounds of nodes and conveyors, plus rectangles that scenery must avoid. */
function occupancy(info: LayoutInfo) {
  const rects: Rect[] = [];
  for (const n of info.nodes) {
    rects.push({ x0: n.x - n.hx - 0.4, x1: n.x + n.hx + 0.4, z0: n.z - n.hz - 0.4, z1: n.z + n.hz + 0.4 });
  }
  for (const n of info.nodes) {
    if (n.block) rects.push({ x0: n.block.x0 - 0.5, x1: n.block.x1 + 0.5, z0: n.block.z0 - 0.5, z1: n.block.z1 + 0.5 });
  }
  for (const r of info.routes) {
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      rects.push({ x0: Math.min(a.x, b.x) - 0.6, x1: Math.max(a.x, b.x) + 0.6, z0: Math.min(a.z, b.z) - 0.6, z1: Math.max(a.z, b.z) + 0.6 });
    }
  }
  const b: Rect = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const r of rects) {
    b.x0 = Math.min(b.x0, r.x0); b.x1 = Math.max(b.x1, r.x1);
    b.z0 = Math.min(b.z0, r.z0); b.z1 = Math.max(b.z1, r.z1);
  }
  return { rects, bounds: b };
}

/** White floor arrow (shaft + head) pointing along +X before rotation. */
function floorArrow(x: number, z: number, dir: 1 | -1) {
  const g = new THREE.Group();
  g.add(slab(0.9, 0.16, whiteMat, -0.15, 0.006, 0));
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.32, 3), whiteMat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0.38, 0.007, 0);
  g.add(head);
  g.position.set(x, 0, z);
  g.rotation.y = dir > 0 ? 0 : Math.PI;
  return g;
}

/** Steel H-column (two flanges + web) with a base plate. */
function column(x: number, z: number, h: number) {
  const g = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, h, 0.04), columnMat); f1.position.set(0, h / 2, -0.16);
  const f2 = f1.clone(); f2.position.z = 0.16;
  const web = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.32), columnMat); web.position.y = h / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.6), columnMat); base.position.y = 0.015;
  // Yellow/black impact guard at the foot
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.46), yellowMat); guard.position.y = 0.4;
  [f1, f2, web].forEach((m) => { m.castShadow = true; });
  g.add(f1, f2, web, base, guard);
  g.position.set(x, 0, z);
  return g;
}

/** Wall run along X (or Z when alongZ) with a window band. */
function wall(x0: number, x1: number, z: number, h: number, alongZ = false) {
  const g = new THREE.Group();
  const len = Math.abs(x1 - x0);
  const mid = (x0 + x1) / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.2), wallBaseMat); base.position.set(0, 0.5, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(len, h - 2.6, 0.2), wallMat); upper.position.set(0, 2.6 + (h - 2.6) / 2, 0);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.2), wallMat); lower.position.set(0, 1.4, 0);
  g.add(base, upper, lower);
  // Window band 1.8–2.6 m with mullions every 2.5 m
  const win = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.08), windowMat); win.position.set(0, 2.2, 0);
  g.add(win);
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.5) {
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.22), wallBaseMat);
    mull.position.set(x, 2.2, 0);
    g.add(mull);
  }
  g.traverse((o) => { (o as THREE.Mesh).receiveShadow = true; });
  if (alongZ) { g.rotation.y = Math.PI / 2; g.position.set(z, 0, mid); }
  else g.position.set(mid, 0, z);
  return g;
}

/** Pallet with a stack of cartons (staged material). */
function stagedPallet(x: number, z: number, layers: number) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.144, 0.8), palletMat); p.position.y = 0.072; g.add(p);
  for (let l = 0; l < layers; l++) {
    for (const dx of [-0.3, 0.3]) for (const dz of [-0.2, 0.2]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.37), cartonMat);
      c.position.set(dx, 0.144 + 0.15 + l * 0.3, dz);
      c.castShadow = true;
      g.add(c);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

/** Operator position: black anti-fatigue mat + HMI screen on a swing arm, facing the machine. */
function workstation(x: number, z: number, faceX: number, faceZ: number) {
  const g = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.012, 0.8), matMat);
  mat.position.y = 0.006;
  g.add(mat);
  // Arm post at the machine side of the mat, screen turned toward the operator
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 0.06), hmiMat);
  post.position.set(0.5, 0.675, 0.32);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), hmiMat);
  arm.position.set(0.5, 1.33, 0.12);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.05), hmiMat);
  head.position.set(0.42, 1.42, -0.1);
  head.rotation.x = -0.25;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.27, 0.01), screenMat);
  screen.position.set(0.42, 1.42, -0.128);
  screen.rotation.x = -0.25;
  g.add(post, arm, head, screen);
  g.position.set(x, 0, z);
  // Local +Z points to the machine
  g.rotation.y = Math.atan2(faceX - x, faceZ - z);
  return g;
}

/** Shop-floor office (white block, window band, door). */
function office(x: number, z: number, w: number, d: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), officeMat);
  body.position.y = 1.5;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.9, d + 0.02), windowMat);
  band.position.y = 1.9;
  g.add(band);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.04), wallBaseMat);
  door.position.set(w * 0.3, 1.05, d / 2 + 0.01);
  g.add(door);
  g.position.set(x, 0, z);
  return g;
}

function worker(x: number, z: number, faceX: number, faceZ: number, vest: number) {
  const op = buildOperator();
  const fig = op.getObjectByName('figure') ?? op;
  const g = new THREE.Group();
  g.add(fig);
  g.scale.setScalar(1.85);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(faceX - x, faceZ - z);
  const vestMat = new THREE.MeshStandardMaterial({ color: vest, roughness: 0.7 });
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.color?.getHex() === 0xffe033) m.material = vestMat;
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

export function buildSurroundings(info: LayoutInfo, opts: { scenery: boolean }): THREE.Group {
  const root = new THREE.Group();
  root.name = '_surroundings';
  if (info.nodes.length === 0) return root;
  const { rects, bounds } = occupancy(info);
  const M = 2.0; // margin around the cell
  const cx0 = bounds.x0 - M, cx1 = bounds.x1 + M;
  const cz0 = bounds.z0 - M, cz1 = bounds.z1 + M;
  const W = cx1 - cx0, D = cz1 - cz0;
  // Dock yards: the front boundary, aisle and wall stop there, trucks come in from outside
  const yards = info.nodes.flatMap((n) => (n.yard ? [n.yard] : []));
  const holes = yards.map((y) => ({ x0: y.x0, x1: y.x1 }));
  for (const y of yards) rects.push({ ...y });

  // ── Cell zone + yellow boundary ──
  root.add(slab(W, D, zoneMat, (cx0 + cx1) / 2, 0.002, (cz0 + cz1) / 2));
  const t = 0.1;
  root.add(slab(W, t, yellowMat, (cx0 + cx1) / 2, 0.005, cz0));
  for (const [a, b] of splitX(cx0, cx1, holes)) root.add(slab(b - a, t, yellowMat, (a + b) / 2, 0.005, cz1));
  root.add(slab(t, D, yellowMat, cx0, 0.005, (cz0 + cz1) / 2));
  root.add(slab(t, D, yellowMat, cx1, 0.005, (cz0 + cz1) / 2));

  // ── Aisle along +Z with arrows both ways (two-way traffic) ──
  const aW = 3.2, az = cz1 + 0.4 + aW / 2;
  const ax0 = cx0 - 4, ax1 = cx1 + 4;
  const inYard = (x0: number, x1: number) => holes.some((h) => x0 < h.x1 && x1 > h.x0);
  for (const [a, b] of splitX(ax0, ax1, holes)) root.add(slab(b - a, aW, aisleMat, (a + b) / 2, 0.003, az));
  for (const edge of [az - aW / 2 + 0.1, az + aW / 2 - 0.1]) {
    for (let x = ax0 + 0.5; x < ax1 - 0.5; x += 1.2) if (!inYard(x, x + 0.7)) root.add(slab(0.7, 0.08, whiteMat, x + 0.35, 0.006, edge));
  }
  for (let x = ax0 + 3; x < ax1 - 2; x += 6) {
    if (!inYard(x - 0.6, x + 0.6)) root.add(floorArrow(x, az - aW / 4, 1));
    if (!inYard(x + 2.4, x + 3.6)) root.add(floorArrow(x + 3, az + aW / 4, -1));
  }

  // ── Walls on the far sides (camera looks from +X/+Z) ──
  const wz = cz0 - 3.5, wx = cx0 - 4.5, wh = 6;
  root.add(wall(wx, ax1, wz, wh));
  root.add(wall(wz, az + aW / 2 + 2, wx, wh, true));
  // Front and right walls cut away to 1 m, so the inside stays visible (as in layout tools)
  const fz = az + aW / 2 + 2, fx = ax1;
  for (const [a, b] of splitX(wx, fx, holes)) {
    const lowFront = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.0, 0.2), wallBaseMat);
    lowFront.position.set((a + b) / 2, 0.5, fz);
    root.add(lowFront);
  }
  const lowSide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, fz - wz), wallBaseMat);
  lowSide.position.set(fx, 0.5, (wz + fz) / 2);
  root.add(lowSide);

  // ── Columns on a 10 m grid: one row in front of the back wall, one along the aisle's far edge ──
  const colH = 6.5;
  for (let x = Math.ceil((wx + 1) / 10) * 10; x < ax1; x += 10) {
    root.add(column(x, wz + 0.6, colH)); // back row only: a front row would hide the line
  }

  // ── Operator positions at staffed machines: mat + HMI (equipment, always shown) ──
  const workSpots: { x: number; z: number; n: LayoutNode }[] = [];
  for (const n of info.nodes) {
    if (!STAFFED.has(n.type) || n.block) continue;
    const cands: [number, number][] = [
      [n.x, n.z + n.hz + 0.6], [n.x + n.hx + 0.6, n.z], [n.x - n.hx - 0.6, n.z], [n.x, n.z - n.hz - 0.6],
    ];
    for (const [x, z] of cands) {
      const r = { x0: x - 0.6, x1: x + 0.6, z0: z - 0.45, z1: z + 0.45 };
      const onConveyor = rects.some((o, i) => i >= info.nodes.length && overlaps(r, o));
      const inNode = info.nodes.some((o) => Math.abs(x - o.x) < o.hx + 0.1 && Math.abs(z - o.z) < o.hz + 0.1);
      if (onConveyor || inNode) continue;
      root.add(workstation(x, z, n.x, n.z));
      rects.push(r);
      workSpots.push({ x, z, n });
      break;
    }
  }

  if (opts.scenery) {
    const free = (r: Rect) => !rects.some((o) => overlaps(r, o));
    const place = (r: Rect) => { rects.push(r); };

    // Pallet racks against the back wall, starting at the infeed end
    const rackZ = wz + 1.6;
    let racks = 0;
    for (let x = wx + 2; x < cx1 && racks < 4; x += 3.0) {
      const r = { x0: x - 1.4, x1: x + 1.4, z0: rackZ - 0.9, z1: rackZ + 0.9 };
      if (!free(r)) continue;
      const rack = buildWarehouseBay();
      rack.scale.setScalar(1.6);
      rack.position.set(x, 0, rackZ);
      root.add(rack); place(r); racks++;
    }

    // Staged pallets beside sources (raw material) and sinks (finished goods)
    for (const n of info.nodes) {
      if (n.type !== 'source' && n.type !== 'sink') continue;
      const spots = [[0, -(n.hz + 1.4)], [1.4, -(n.hz + 1.4)], [0, n.hz + 1.4], [-1.4, -(n.hz + 1.4)]];
      let placed = 0;
      for (const [dx, dz] of spots) {
        const x = n.x + dx, z = n.z + dz;
        const r = { x0: x - 0.7, x1: x + 0.7, z0: z - 0.5, z1: z + 0.5 };
        if (!free(r)) continue;
        root.add(stagedPallet(x, z, 1 + (placed % 3)));
        place(r);
        if (++placed >= 2) break;
      }
    }

    // A parked forklift in the aisle near the outbound end
    {
      const fx = cx1 - 2, fz = az - aW / 4;
      const fl = buildForkliftModel();
      fl.scale.setScalar(1.25);
      fl.position.set(fx, 0, fz);
      fl.rotation.y = -Math.PI / 2;
      root.add(fl);
    }

    // Workers on the operator mats, facing the machine
    workSpots.slice(0, 10).forEach((w, k) => {
      root.add(worker(w.x, w.z, w.n.x, w.n.z, vestColors[k % vestColors.length]));
    });

    // Office block in the back-left corner when the floor there is free
    {
      const ow = 6, od = 4;
      const ox = wx + 0.4 + ow / 2, oz = wz + 0.4 + od / 2;
      const r = { x0: ox - ow / 2, x1: ox + ow / 2, z0: oz - od / 2, z1: oz + od / 2 };
      if (free(r)) { root.add(office(ox, oz, ow, od)); place(r); }
    }
  }

  return mergeStatic(root);
}

const NO_SHADOW = new Set<THREE.Material>([zoneMat, yellowMat, aisleMat, whiteMat]);

/**
 * Everything here is static, so bake it into one mesh per material: a few
 * dozen draw calls instead of several thousand (racks and people are built
 * from many small parts).
 */
function mergeStatic(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(mesh.matrixWorld);
    const list = byMat.get(mesh.material) ?? [];
    list.push(g);
    byMat.set(mesh.material, list);
  });
  // Dispose the source parts' geometry (materials are reused by the merged meshes)
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  const out = new THREE.Group();
  out.name = '_surroundings';
  byMat.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = !NO_SHADOW.has(mat);
    mesh.raycast = () => {};
    out.add(mesh);
  });
  return out;
}

/** Camera position that frames the layout across its long axis (aisle side). */
export function frameLayout(info: LayoutInfo, fovDeg: number): { target: THREE.Vector3; position: THREE.Vector3 } {
  const { bounds } = occupancy(info);
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
  const w = bounds.x1 - bounds.x0, d = bounds.z1 - bounds.z0;
  const span = Math.max(w, d * 1.6, 8);
  const dist = (span / 2) / Math.tan((fovDeg * Math.PI) / 360) * 0.68;
  const target = new THREE.Vector3(cx, 0, cz);
  // ~40° elevation, viewed from the aisle (+Z) and slightly from the outbound end
  const position = new THREE.Vector3(cx + dist * 0.12, dist * 0.62, cz + dist * 0.8);
  return { target, position };
}
