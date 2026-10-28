import * as THREE from 'three';
import { PRODUCT_PALETTE } from '../../../../utils/productColors';
import { buildForklift } from '../model-library/material-handling/Forklift';
import { buildSemiTruck, buildStackerCrane, buildCraneRails, type StackerCrane } from './WarehouseActors';

/**
 * 3D pallet-rack warehouse built from a Warehouse element's settings, using
 * the same geometry as the engine (engine/warehouse.py):
 *
 *   - the dock / I/O point is the group origin, in the middle of the front;
 *   - aisles run away from the dock along −Z (engine +Y), a rack on both sides
 *     of each aisle; aisle centre X = a·(w + 2d) + d + w/2 − width/2;
 *   - location index = (((aisle·2 + side)·bays + bay)·levels + level)·perBay + slot.
 *
 * Looks follow the reference layouts (Visual Components / FlexSim): braced
 * blue upright frames with base plates, orange beams, wire decks, yellow
 * end-of-aisle guards, loads of cartons coloured by SKU, a marked staging
 * area, dock doors, pack stations and the simulated number of forklifts.
 * An AS/RS (storageType 'asrs') gets high-bay racks with one stacker crane
 * per aisle, P&D conveyors and goods-to-person pick stations instead.
 *
 * Replay is driven by the engine's logs (kpis.warehouses[id]): `moves`
 * (pallet in/out of a location), `trips` (every forklift / crane trip with its
 * phase times) and `trucks` (dock door occupancy). Loads on the move are
 * hidden from their rack slot until they are set down.
 *
 * Everything repeated is an InstancedMesh, so a 1,000-location warehouse is
 * still a handful of draw calls.
 */

export interface RackLayout {
  aisles: number; baysPerAisle: number; levels: number; palletsPerBay: number;
  bayWidth: number; levelHeight: number; aisleWidth: number; rackDepth: number; frontClearance: number;
}

export interface RackEquipment {
  forklifts: number;
  forkliftSpeed: number;   // m/s
  liftSpeed: number;       // m/s
  handlingTime: number;    // s per pick-up / set-down
  doors: number;           // dock doors to draw (0 = none, e.g. a store linked to a line)
  packStations: number;    // 0 = no order picking
  pickers: number;
  storage: 'racks' | 'asrs';
  craneSpeed: number;      // m/s along the aisle
  craneLift: number;       // m/s vertical
  craneHandling: number;   // s per pick-up / set-down
  conveyorSpeed: number;   // m/s dock ↔ aisle P&D
}

/** Engine logs that drive the replay (all optional; design view passes moves only). */
export interface WarehouseLog {
  moves?: [number, number, number][];
  trips?: number[][];
  trucks?: number[][];
}

export const DEFAULT_RACK_LAYOUT: RackLayout = {
  aisles: 4, baysPerAisle: 10, levels: 4, palletsPerBay: 2,
  bayWidth: 2.7, levelHeight: 1.5, aisleWidth: 3.5, rackDepth: 1.1, frontClearance: 4,
};

/** Layout from element data; models saved before rack layouts map capacity + levels like the engine. */
export function rackLayoutOf(data: any): RackLayout {
  if (data?.layout) return { ...DEFAULT_RACK_LAYOUT, ...data.layout };
  if (data?.capacity) {
    const levels = Math.max(1, Math.round(data.levels ?? 4));
    const bays = Math.max(1, Math.ceil(data.capacity / (2 * 2 * levels * 2)));
    return { ...DEFAULT_RACK_LAYOUT, aisles: 2, baysPerAisle: bays, levels, palletsPerBay: 2 };
  }
  return { ...DEFAULT_RACK_LAYOUT };
}

/** Equipment from element data (defaults match the engine). */
export function rackEquipmentOf(data: any, standalone: boolean): RackEquipment {
  const fl = data?.forklifts || {};
  const inbound = data?.inbound || {};
  const orders = data?.orders || {};
  const pk = data?.pickers || {};
  const reorders = (data?.skus || []).some((s: any) => (s.reorderPoint ?? -1) >= 0);
  const outbound = !!orders.enabled && (orders.departureInterval ?? 0) > 0;
  const cr = data?.cranes || {};
  return {
    forklifts: Math.max(1, Math.round(fl.count ?? 2)),
    forkliftSpeed: fl.speed ?? 2.0,
    liftSpeed: fl.liftSpeed ?? 0.4,
    handlingTime: fl.handlingTime ?? 15,
    // Trucks only arrive when inbound or reordering is on; a store linked to a
    // line gets no doors drawn (they would sit between the racks and the line)
    doors: standalone && (inbound.enabled || reorders || outbound) ? Math.max(1, Math.round(inbound.doors ?? 2)) : 0,
    packStations: orders.enabled ? Math.max(1, Math.round(orders.packStations ?? 1)) : 0,
    pickers: orders.enabled ? Math.max(1, Math.round(pk.count ?? 3)) : 0,
    storage: data?.storageType === 'asrs' ? 'asrs' : 'racks',
    craneSpeed: cr.speed ?? 3.0,
    craneLift: cr.liftSpeed ?? 1.0,
    craneHandling: cr.handlingTime ?? 10,
    conveyorSpeed: cr.conveyorSpeed ?? 0.5,
  };
}

const UPRIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0x2f5f9f, roughness: 0.5, metalness: 0.35 });
const BEAM_MAT = new THREE.MeshStandardMaterial({ color: 0xe8681a, roughness: 0.5, metalness: 0.25 });
const DECK_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.55 });
const PALLET_MAT = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.9 });
const CARTON_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
const GUARD_MAT = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 });
const LINE_MAT = new THREE.MeshBasicMaterial({ color: 0xe8b800 });
const AISLE_MAT = new THREE.MeshStandardMaterial({ color: 0xc4cbd2, roughness: 0.95 });
const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.85 });
const OPENING_MAT = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.6, metalness: 0.2 });
const RUBBER_MAT = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.95 });
const BENCH_MAT = new THREE.MeshStandardMaterial({ color: 0xd5dae0, roughness: 0.6, metalness: 0.2 });
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x4f5660, roughness: 0.5, metalness: 0.4 });
const SCREEN_MAT = new THREE.MeshStandardMaterial({ color: 0x2a5d8f, roughness: 0.3, emissive: 0x1d4f80, emissiveIntensity: 0.6 });
const TOTE_MAT = new THREE.MeshStandardMaterial({ color: 0x2f62d0, roughness: 0.6 });
const CONV_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 });
const ASPHALT_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.95 });
const DOOR_PITCH = 4.2;
const WHITE_LINE_MAT = new THREE.MeshBasicMaterial({ color: 0xf1f3f5 });
const BOX = new THREE.BoxGeometry(1, 1, 1);

export interface RackWarehouse {
  group: THREE.Group;
  capacity: number;
  /** Show a pallet of SKU index `sku` at location `loc`, or empty it (sku = −1). */
  set(loc: number, sku: number): void;
  clear(): void;
  /** Show the state at time t from the engine's logs (rebuilds when going back). */
  showAt(log: WarehouseLog, t: number): void;
  /** Park forklifts and cranes (design mode). */
  park(): void;
  /** Footprint in group coordinates (racks + dock + pack area), for scenery and camera;
   *  `yard` is the truck apron outside the dock wall (not part of the building). */
  bounds: { x0: number; x1: number; z0: number; z1: number; yard?: { x0: number; x1: number; z0: number; z1: number } };
}

const DEFAULT_EQUIPMENT: RackEquipment = {
  forklifts: 2, forkliftSpeed: 2, liftSpeed: 0.4, handlingTime: 15, doors: 0, packStations: 0, pickers: 0,
  storage: 'racks', craneSpeed: 3, craneLift: 1, craneHandling: 10, conveyorSpeed: 0.5,
};

export function buildRackWarehouse(layout: RackLayout, equipment: RackEquipment = DEFAULT_EQUIPMENT): RackWarehouse {
  const L = layout;
  const E = equipment;
  const g = new THREE.Group();
  const asrs = E.storage === 'asrs';
  const width = L.aisles * (L.aisleWidth + 2 * L.rackDepth);
  const depth = L.frontClearance + L.baysPerAisle * L.bayWidth;
  const aisleX = (a: number) => a * (L.aisleWidth + 2 * L.rackDepth) + L.rackDepth + L.aisleWidth / 2 - width / 2;
  const rackX = (a: number, side: number) => aisleX(a) + (side === 0 ? -1 : 1) * (L.aisleWidth / 2 + L.rackDepth / 2);
  const bayZ = (b: number) => -(L.frontClearance + b * L.bayWidth);
  const H = L.levels * L.levelHeight + 0.25;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q0 = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotZ = 0) => {
    const rot = rotZ ? q.setFromAxisAngle(zAxis, rotZ) : q0;
    mesh.setMatrixAt(i, m4.compose(v.set(x, y, z), rot, sc.set(sx, sy, sz)));
  };
  const statics: THREE.Object3D[] = [];
  const addStatic = (o: THREE.Object3D) => { statics.push(o); g.add(o); return o; };

  // ── Floor: aisles, staging lanes, yellow front line ──────────────────
  for (let a = 0; a < L.aisles; a++) {
    const f = new THREE.Mesh(BOX, AISLE_MAT);
    f.scale.set(L.aisleWidth, 0.006, L.baysPerAisle * L.bayWidth);
    f.position.set(aisleX(a), 0.004, bayZ(0) - (L.baysPerAisle * L.bayWidth) / 2);
    f.receiveShadow = true;
    addStatic(f);
  }
  const lanes = Math.max(2, E.doors || 2);
  const laneW = Math.min(3.2, (width - 1) / lanes);
  // AS/RS: shallow lanes, the transfer conveyor runs behind them
  const laneD = asrs ? Math.max(1.0, Math.min(1.6, L.frontClearance - 3.2)) : Math.max(1.6, L.frontClearance - 1.2);
  const zDock = -0.9;   // forklifts pick up / drop at the dock here
  const laneZ = -0.4 - laneD / 2;
  const stagingPallets: THREE.Vector3[] = [];
  for (let i = 0; i < lanes; i++) {
    const cx = (i - (lanes - 1) / 2) * laneW;
    for (const [dx, dz, w, d] of [
      [-laneW / 2 + 0.15, 0, 0.06, laneD], [laneW / 2 - 0.15, 0, 0.06, laneD], [0, -laneD / 2, laneW - 0.3, 0.06],
    ] as const) {
      const m = new THREE.Mesh(BOX, LINE_MAT);
      m.scale.set(w, 0.005, d);
      m.position.set(cx + dx, 0.007, laneZ + dz);
      addStatic(m);
    }
    stagingPallets.push(new THREE.Vector3(cx, 0, laneZ + laneD / 4), new THREE.Vector3(cx, 0, laneZ - laneD / 4));
  }

  // ── Upright frames: two posts per bay boundary, braced, with base plates ──
  const frames: { x: number; z: number }[] = [];
  for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
    for (let b = 0; b <= L.baysPerAisle; b++) frames.push({ x: rackX(a, side), z: bayZ(b) });
  }
  const posts = new THREE.InstancedMesh(BOX, UPRIGHT_MAT, frames.length * 2);
  const plates = new THREE.InstancedMesh(BOX, UPRIGHT_MAT, frames.length * 2);
  const bracePitch = 1.2;
  const nH = Math.max(2, Math.ceil(H / bracePitch) + 1);
  const braces = new THREE.InstancedMesh(BOX, UPRIGHT_MAT, frames.length * (nH + (nH - 1)));
  const inner = L.rackDepth - 0.1;
  const diagLen = Math.hypot(inner, H / (nH - 1));
  const diagAng = Math.atan2(H / (nH - 1), inner);
  let k = 0, kb = 0;
  frames.forEach((f) => {
    for (const dx of [-1, 1]) {
      put(posts, k, f.x + dx * (L.rackDepth / 2 - 0.05), H / 2, f.z, 0.1, H, 0.09);
      put(plates, k, f.x + dx * (L.rackDepth / 2 - 0.05), 0.01, f.z, 0.2, 0.02, 0.2);
      k++;
    }
    for (let i = 0; i < nH; i++) put(braces, kb++, f.x, 0.15 + (i * (H - 0.3)) / (nH - 1), f.z, inner, 0.035, 0.035);
    for (let i = 0; i < nH - 1; i++) {
      put(braces, kb++, f.x, 0.15 + ((i + 0.5) * (H - 0.3)) / (nH - 1), f.z, diagLen, 0.03, 0.03, (i % 2 ? 1 : -1) * diagAng);
    }
  });
  braces.count = kb;
  for (const m of [posts, braces, plates]) { m.castShadow = true; addStatic(m); }

  // ── Beams (aisle side + back side) and wire decks under every level ≥ 1 ──
  const nBay = L.aisles * 2 * L.baysPerAisle * Math.max(0, L.levels - 1);
  const beams = new THREE.InstancedMesh(BOX, BEAM_MAT, Math.max(1, nBay * 2));
  const decks = new THREE.InstancedMesh(BOX, DECK_MAT, Math.max(1, nBay));
  k = 0; kb = 0;
  for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
    for (let b = 0; b < L.baysPerAisle; b++) for (let lv = 1; lv < L.levels; lv++) {
      const zc = bayZ(b) - L.bayWidth / 2;
      for (const dx of [-1, 1]) put(beams, k++, rackX(a, side) + dx * (L.rackDepth / 2 - 0.05), lv * L.levelHeight, zc, 0.07, 0.14, L.bayWidth - 0.1);
      put(decks, kb++, rackX(a, side), lv * L.levelHeight + 0.075, zc, L.rackDepth - 0.12, 0.012, L.bayWidth - 0.12);
    }
  }
  beams.count = k; decks.count = kb;
  beams.castShadow = true;
  addStatic(beams); addStatic(decks);

  // ── End-of-aisle guards (yellow) at the front of every rack run ──
  const guards = new THREE.InstancedMesh(BOX, GUARD_MAT, L.aisles * 2);
  k = 0;
  for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
    put(guards, k++, rackX(a, side), 0.25, bayZ(0) + 0.25, L.rackDepth + 0.1, 0.5, 0.18);
  }
  addStatic(guards);

  // ── Pallets: base + 2×2 cartons in two layers, coloured by SKU ──
  const capacity = L.aisles * 2 * L.baysPerAisle * L.levels * L.palletsPerBay;
  const slotW = L.bayWidth / L.palletsPerBay;
  const pos: THREE.Vector3[] = [];
  for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
    for (let b = 0; b < L.baysPerAisle; b++) for (let lv = 0; lv < L.levels; lv++) for (let s = 0; s < L.palletsPerBay; s++) {
      pos.push(new THREE.Vector3(rackX(a, side), lv === 0 ? 0 : lv * L.levelHeight + 0.09, bayZ(b) - (s + 0.5) * slotW));
    }
  }
  const palletW = Math.min(0.8, slotW - 0.15);
  const palletD = Math.min(1.2, L.rackDepth - 0.05);
  const loadH = Math.max(0.3, Math.min(1.2, L.levelHeight - 0.4));
  const CPP = 8; // cartons per pallet
  const bases = new THREE.InstancedMesh(BOX, PALLET_MAT, capacity);
  const cartons = new THREE.InstancedMesh(BOX, CARTON_MAT, capacity * CPP);
  const color = new THREE.Color();
  const cW = palletD / 2 - 0.03, cD = palletW / 2 - 0.03, cH = loadH / 2 - 0.02;
  const set = (loc: number, sku: number) => {
    if (loc < 0 || loc >= capacity) return;
    const p = pos[loc];
    if (sku < 0) {
      put(bases, loc, 0, -10, 0, 0, 0, 0);
      for (let c = 0; c < CPP; c++) put(cartons, loc * CPP + c, 0, -10, 0, 0, 0, 0);
    } else {
      put(bases, loc, p.x, p.y + 0.072, p.z, palletD, 0.144, palletW);
      const base = PRODUCT_PALETTE[sku % PRODUCT_PALETTE.length];
      for (let c = 0; c < CPP; c++) {
        const ix = c & 1, iz = (c >> 1) & 1, iy = c >> 2;
        put(cartons, loc * CPP + c,
          p.x + (ix - 0.5) * (palletD / 2), p.y + 0.144 + cH / 2 + 0.01 + iy * (cH + 0.02), p.z + (iz - 0.5) * (palletW / 2),
          cW, cH, cD);
        // Slight shade variation so single cartons read, like real stock
        color.set(base).multiplyScalar(0.88 + ((loc * 7 + c * 3) % 5) * 0.035);
        cartons.setColorAt(loc * CPP + c, color);
      }
    }
    bases.instanceMatrix.needsUpdate = true;
    cartons.instanceMatrix.needsUpdate = true;
    if (cartons.instanceColor) cartons.instanceColor.needsUpdate = true;
  };
  cartons.setColorAt(0, color.set(0xffffff)); // create instanceColor before the first render
  const clearAll = () => { for (let i = 0; i < capacity; i++) set(i, -1); };
  clearAll();
  bases.castShadow = true;
  cartons.castShadow = true;
  g.add(bases, cartons);

  // ── Dock doors along the front (standalone warehouse / DC) ──
  const frontZ = 1.8;
  let x0 = -width / 2, x1 = width / 2, z1 = 0.4;
  let yard: { x0: number; x1: number; z0: number; z1: number } | undefined;
  if (E.doors > 0) {
    // Cut-away dock wall (1 m, like the building's front walls) with door
    // portals: dark frame posts + header, dock leveler and bumpers per door
    const pitch = DOOR_PITCH;
    const span = E.doors * pitch;
    const sill = new THREE.Mesh(BOX, WALL_MAT); sill.scale.set(span + 0.6, 1.0, 0.25); sill.position.set(0, 0.5, frontZ + 0.2);
    addStatic(sill);
    for (let i = 0; i < E.doors; i++) {
      const cx = (i - (E.doors - 1) / 2) * pitch;
      const gap = new THREE.Mesh(BOX, OPENING_MAT); gap.scale.set(3.0, 1.02, 0.27); gap.position.set(cx, 0.5, frontZ + 0.2); // opening in the sill
      const postL = new THREE.Mesh(BOX, FRAME_MAT); postL.scale.set(0.18, 3.4, 0.3); postL.position.set(cx - 1.6, 1.7, frontZ + 0.2);
      const postR = postL.clone(); postR.position.x = cx + 1.6;
      const header = new THREE.Mesh(BOX, FRAME_MAT); header.scale.set(3.4, 0.25, 0.3); header.position.set(cx, 3.3, frontZ + 0.2);
      const door = new THREE.Mesh(BOX, DOOR_MAT); door.scale.set(3.0, 0.6, 0.12); door.position.set(cx, 2.9, frontZ + 0.2); // rolled-up door
      const leveler = new THREE.Mesh(BOX, FRAME_MAT); leveler.scale.set(2.2, 0.03, 1.6); leveler.position.set(cx, 0.015, frontZ - 0.9);
      const bumpL = new THREE.Mesh(BOX, RUBBER_MAT); bumpL.scale.set(0.25, 0.4, 0.15); bumpL.position.set(cx - 1.3, 0.8, frontZ + 0.4);
      const bumpR = bumpL.clone(); bumpR.position.x = cx + 1.3;
      [gap, postL, postR, header, door, leveler, bumpL, bumpR].forEach((m) => { m.castShadow = true; addStatic(m); });
    }
    x0 = Math.min(x0, -span / 2 - 0.3); x1 = Math.max(x1, span / 2 + 0.3); z1 = frontZ + 0.4;
    // Truck apron outside the dock wall, with bay markings
    const yd = 21;
    const ap = new THREE.Mesh(BOX, ASPHALT_MAT); ap.scale.set(span + 4, 0.02, yd); ap.position.set(0, 0.008, frontZ + 0.4 + yd / 2);
    ap.receiveShadow = true; addStatic(ap);
    for (let i = 0; i <= E.doors; i++) {
      const lx = (i - E.doors / 2) * pitch;
      const ln = new THREE.Mesh(BOX, WHITE_LINE_MAT); ln.scale.set(0.12, 0.01, 16); ln.position.set(lx, 0.02, frontZ + 0.5 + 8);
      addStatic(ln);
    }
    yard = { x0: -span / 2 - 2, x1: span / 2 + 2, z0: frontZ + 0.4, z1: frontZ + 0.4 + yd };
  }

  // ── Pack stations to the right of the dock (order picking) ──
  if (E.packStations > 0) {
    const px = width / 2 + 1.8;
    for (let i = 0; i < E.packStations; i++) {
      const z = -1.2 - i * 2.4;
      const top = new THREE.Mesh(BOX, BENCH_MAT); top.scale.set(1.0, 0.05, 1.9); top.position.set(px, 0.9, z);
      const legA = new THREE.Mesh(BOX, FRAME_MAT); legA.scale.set(0.9, 0.85, 0.05); legA.position.set(px, 0.45, z - 0.85);
      const legB = legA.clone(); legB.position.z = z + 0.85;
      const shelf = new THREE.Mesh(BOX, FRAME_MAT); shelf.scale.set(0.06, 0.9, 1.6); shelf.position.set(px + 0.45, 1.4, z);
      const screen = new THREE.Mesh(BOX, SCREEN_MAT); screen.scale.set(0.04, 0.32, 0.48); screen.position.set(px + 0.3, 1.55, z - 0.4);
      const carton = new THREE.Mesh(BOX, CARTON_MAT); carton.scale.set(0.4, 0.3, 0.5); carton.position.set(px, 1.08, z + 0.35);
      const mat = new THREE.Mesh(BOX, RUBBER_MAT); mat.scale.set(0.8, 0.012, 1.4); mat.position.set(px - 0.95, 0.006, z);
      [top, legA, legB, shelf, screen, carton, mat].forEach((m) => { m.castShadow = true; addStatic(m); });
    }
    x1 = Math.max(x1, px + 0.8);
  }

  // ── Picker carts parked at the front left (person-to-goods picking only) ──
  for (let i = 0; i < (asrs ? 0 : E.pickers); i++) {
    const cx = -width / 2 + 0.6 + i * 0.85, cz = -0.9;
    const cart = new THREE.Mesh(BOX, FRAME_MAT); cart.scale.set(0.6, 0.05, 1.0); cart.position.set(cx, 0.35, cz);
    const handle = new THREE.Mesh(BOX, FRAME_MAT); handle.scale.set(0.6, 1.0, 0.04); handle.position.set(cx, 0.6, cz + 0.5);
    const tote1 = new THREE.Mesh(BOX, TOTE_MAT); tote1.scale.set(0.5, 0.22, 0.4); tote1.position.set(cx, 0.49, cz - 0.22);
    const tote2 = tote1.clone(); tote2.position.z = cz + 0.22;
    [cart, handle, tote1, tote2].forEach((m) => addStatic(m));
  }

  // ── Trip geometry shared by forklifts and cranes ──
  const locInfo = (loc: number) => {
    let r = loc;
    const s = r % L.palletsPerBay; r = (r - s) / L.palletsPerBay;
    const lv = r % L.levels; r = (r - lv) / L.levels;
    const b = r % L.baysPerAisle; r = (r - b) / L.baysPerAisle;
    const side = r % 2; const a = (r - side) / 2;
    return { a, side, b, lv, s };
  };
  const slotZ = (b: number, s: number) => bayZ(b) - (s + 0.5) * slotW;
  const heading = (dx: number, dz: number) => Math.atan2(-dz, dx); // forks (+X local) toward (dx, dz)

  // ── Forklifts (simulated count): parked at the dock, driving the engine's trips in replay ──
  const FL_SCALE = 1.5;
  const parkSpots: THREE.Vector3[] = [];
  const forklifts: THREE.Group[] = [];
  if (!asrs) {
    for (let i = 0; i < E.forklifts; i++) {
      // Inside the warehouse's own front zone, clear of conveyors that meet the dock
      parkSpots.push(new THREE.Vector3(width / 2 - 1.2, 0, -Math.min(2.2, L.frontClearance * 0.55) - i * 1.6));
      const f = buildForklift();
      f.scale.setScalar(FL_SCALE);
      // Pallet on the forks while driving a load (own carton material: coloured by SKU)
      const loadPallet = new THREE.Mesh(BOX, PALLET_MAT); loadPallet.scale.set(0.8 / FL_SCALE, 0.14 / FL_SCALE, 0.8 / FL_SCALE);
      const loadBox = new THREE.Mesh(BOX, CARTON_MAT.clone()); loadBox.scale.set(0.75 / FL_SCALE, 0.7 / FL_SCALE, 0.75 / FL_SCALE);
      const load = new THREE.Group();
      loadPallet.position.set(0.95, 0.12, 0); loadBox.position.set(0.95, 0.12 + 0.42 / FL_SCALE, 0);
      load.add(loadPallet, loadBox);
      load.visible = false;
      f.add(load);
      f.userData.load = load;
      f.userData.loadBox = loadBox;
      f.position.copy(parkSpots[i]);
      f.rotation.y = Math.PI / 2; // forks toward the racks (−Z)
      g.add(f);
      forklifts.push(f);
    }
  }

  // ── AS/RS: rails, one stacker crane per aisle, P&D conveyors to a front transfer conveyor ──
  const cranes: StackerCrane[] = [];
  const zConv = -0.4 - laneD - 0.7;           // transfer conveyor behind the staging lanes
  const zPD = bayZ(0) + 0.5;                  // crane carriage at the aisle's P&D
  const CRANE_REST_Y = 0.55;
  const reach = L.aisleWidth / 2 + L.rackDepth / 2;
  const conveyorTime = (a: number) => (Math.abs(aisleX(a)) + L.frontClearance) / E.conveyorSpeed;
  if (asrs) {
    for (let a = 0; a < L.aisles; a++) {
      addStatic(buildCraneRails(aisleX(a), bayZ(0) + 1.2, bayZ(L.baysPerAisle) - 0.3, H));
      const c = buildStackerCrane(H, L.aisleWidth, palletD, palletW, loadH);
      c.group.position.set(aisleX(a), 0, zPD);
      c.carriage.position.y = CRANE_REST_Y;
      c.load.userData.box.material = CARTON_MAT.clone();
      g.add(c.group);
      cranes.push(c);
    }
    // Conveyors: in/out stubs at both rack rows of each aisle → transfer conveyor → dock and pick stations
    const convEnd = E.packStations > 0 ? width / 2 + 0.9 : width / 2;
    const conv = (x0: number, x1: number, z0: number, z1: number) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0) || 0.9, sz = Math.abs(z1 - z0) || 0.9;
      const bed = new THREE.Mesh(BOX, CONV_MAT); bed.scale.set(sx, 0.08, sz); bed.position.set(cx, 0.66, cz);
      const fr = new THREE.Mesh(BOX, FRAME_MAT); fr.scale.set(sx, 0.62, sz * (sx > sz ? 0.15 : 1)); fr.position.set(cx, 0.31, cz);
      if (sz > sx) { fr.scale.set(sx * 0.15, 0.62, sz); }
      bed.castShadow = true; addStatic(bed); addStatic(fr);
    };
    for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
      conv(rackX(a, side) - 0.45, rackX(a, side) + 0.45, bayZ(0) + 0.15, zConv - 0.45);
    }
    conv(-width / 2 + 0.2, convEnd, zConv + 0.45, zConv - 0.45);
    conv(-0.45, 0.45, zConv + 0.45, -0.4); // spur to the dock staging lanes
  }
  // Goods-to-person: pallets waiting at the pick stations (AS/RS)
  const stationSlots: THREE.Vector3[] = [];
  if (asrs && E.packStations > 0) {
    // On the transfer conveyor in front of the pick stations, nearest first
    for (let k = 0; k < 3 * E.packStations; k++) stationSlots.push(new THREE.Vector3(width / 2 + 0.3 - k * 1.05, 0.7, zConv));
  }
  const stationBases = new THREE.InstancedMesh(BOX, PALLET_MAT, Math.max(1, stationSlots.length));
  const stationBoxes = new THREE.InstancedMesh(BOX, CARTON_MAT, Math.max(1, stationSlots.length));
  stationBoxes.setColorAt(0, new THREE.Color(0xffffff));
  stationBases.count = 0; stationBoxes.count = 0;
  g.add(stationBases, stationBoxes);

  // ── Trucks at the dock doors (from the engine's truck log) ──
  const doorX = (i: number) => (i - (E.doors - 1) / 2) * DOOR_PITCH;
  const dockedZ = frontZ + 0.45;
  const truckPool: { mesh: THREE.Group; kind: number }[] = [];
  const truckOf = (kind: number, used: Set<THREE.Group>) => {
    let t = truckPool.find((p) => p.kind === kind && !used.has(p.mesh));
    if (!t) {
      if (truckPool.length >= 4 * Math.max(1, E.doors)) return null;
      const mesh = kind === 1 ? buildSemiTruck(0xc23a2b, 0xe0761a) : buildSemiTruck(0x2f62d0, 0x2f62d0);
      mesh.visible = false;
      g.add(mesh);
      t = { mesh, kind };
      truckPool.push(t);
    }
    used.add(t.mesh);
    return t.mesh;
  };
  const MANOEUVRE = 40; // s to back onto / pull away from a door
  const showTrucks = (trucks: number[][] | undefined, t: number) => {
    const used = new Set<THREE.Group>();
    if (E.doors > 0) {
      if (!trucks) {
        // Design view: one trailer at the first door, so docks read as docks
        const m = truckOf(0, used);
        if (m) { m.position.set(doorX(0), 0, dockedZ); m.visible = true; }
      } else {
        for (const [d, l, door, kind] of trucks) {
          if (d - MANOEUVRE > t) continue;
          if (t > l + MANOEUVRE || door >= E.doors) continue;
          const m = truckOf(kind, used);
          if (!m) break;
          const u = t < d ? (d - t) / MANOEUVRE : t > l ? (t - l) / MANOEUVRE : 0;
          const ease = u * u * (3 - 2 * u);
          m.position.set(doorX(door), 0, dockedZ + ease * 26);
          m.visible = true;
        }
      }
    }
    for (const p of truckPool) if (!used.has(p.mesh)) p.mesh.visible = false;
  };

  // ── Rack contents: current SKU per location, hidden while a load is on the move ──
  const cur = new Int32Array(capacity).fill(-1);
  const last = new Int32Array(capacity).fill(-1);
  const hidden = new Uint16Array(capacity);
  const setLoc = (loc: number, sku: number) => {
    if (loc < 0 || loc >= capacity) return;
    cur[loc] = sku;
    if (sku >= 0) last[loc] = sku;
    if (!hidden[loc]) set(loc, sku);
  };
  const hide = (loc: number) => { if (hidden[loc]++ === 0) set(loc, -1); };
  const unhide = (loc: number) => { if (--hidden[loc] === 0) set(loc, cur[loc]); };

  /** Pre-processed trip log (cached per result). */
  type Prepared = {
    fl: number[][][]; cr: number[][][];               // per unit: trips (with flags appended)
    hides: [number, number, number][];               // [from, to, loc], sorted by from
    station: [number, number, number][];             // [from, to, loc] pallet at a pick station
  };
  const cache = new WeakMap<object, Prepared>();
  const prepare = (trips: number[][], moves: [number, number, number][]): Prepared => {
    const hit = cache.get(trips);
    if (hit) return hit;
    const nFl = Math.max(1, forklifts.length), nCr = Math.max(1, cranes.length);
    const fl: number[][][] = Array.from({ length: nFl }, () => []);
    const cr: number[][][] = Array.from({ length: nCr }, () => []);
    // Per-location move times (to end a "load is away" interval)
    const movesAt = new Map<number, number[]>();
    for (const [t, loc] of moves) { let a = movesAt.get(loc); if (!a) movesAt.set(loc, (a = [])); a.push(t); }
    const firstMoveFrom = (loc: number, t0: number) => {
      const a = movesAt.get(loc); if (!a) return Infinity;
      let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < t0) lo = m + 1; else hi = m; }
      return lo < a.length ? a[lo] : Infinity;
    };
    const lastMoveUpTo = (loc: number, t0: number) => {
      const a = movesAt.get(loc); if (!a) return -Infinity;
      let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= t0) lo = m + 1; else hi = m; }
      return lo > 0 ? a[lo - 1] : -Infinity;
    };
    // Classify each trip: loaded in (deposit) or loaded out (pickup), and when
    const prevByUnit = new Map<string, { code: number; back: number; second: boolean }>();
    const sorted = [...trips].sort((x, y) => x[4] - y[4]);
    const deposits: [number, number][] = []; // [time, loc]
    const pickups: [number, number, number][] = []; // [time, loc, code]
    for (const tr of sorted) {
      const [type, unit, loc, code, a, , c] = tr;
      const key = `${type}:${unit}`;
      const prev = prevByUnit.get(key);
      // A replenishment is two trips back to back: from the reserve slot, then to the face
      const second = code === 2 && !!prev && prev.code === 2 && !prev.second && Math.abs(prev.back - a) < 0.15;
      prevByUnit.set(key, { code, back: tr[8], second });
      const loadedIn = code === 0 || (code === 2 && second);
      const { b, lv } = locInfo(loc);
      const h = type === 1 ? E.craneHandling : E.handlingTime;
      const tAt = type === 1 ? c + h / 2
        : c + ((b + 0.5) * L.bayWidth) / E.forkliftSpeed + (lv * L.levelHeight) / E.liftSpeed + h / 2;
      const row = [...tr, loadedIn ? 1 : 0, tAt];  // [9] loaded in, [10] time at the slot
      (type === 1 ? cr : fl)[Math.min(unit, (type === 1 ? nCr : nFl) - 1)].push(row);
      if (loadedIn) deposits.push([tAt, loc]); else pickups.push([tAt, loc, code]);
    }
    const depAt = new Map<number, number[]>();
    for (const [t, loc] of deposits) { let a = depAt.get(loc); if (!a) depAt.set(loc, (a = [])); a.push(t); }
    const nextDeposit = (loc: number, t0: number) => {
      const a = depAt.get(loc); if (!a) return Infinity;
      for (const t of a) if (t > t0) return t;
      return Infinity;
    };
    const hides: [number, number, number][] = [];
    for (const [tAt, loc] of deposits) {
      const from = lastMoveUpTo(loc, tAt);
      if (from > -Infinity && from < tAt) hides.push([from, tAt, loc]);
    }
    const station: [number, number, number][] = [];
    for (const [tAt, loc, code] of pickups) {
      const back = nextDeposit(loc, tAt);
      hides.push([tAt, Math.min(back, firstMoveFrom(loc, tAt + 0.05)), loc]);
      if (asrs && code === 3) {
        // Out at a pick station between the conveyor legs
        const conv = conveyorTime(locInfo(loc).a);
        const one = Math.max(((locInfo(loc).b + 0.5) * L.bayWidth) / E.craneSpeed, (locInfo(loc).lv * L.levelHeight) / E.craneLift);
        const arrive = tAt + E.craneHandling / 2 + one + conv;
        const leave = back < Infinity ? back - E.craneHandling * 1.5 - one - conv : Math.min(firstMoveFrom(loc, tAt + 0.05), arrive + 60);
        if (leave > arrive) station.push([arrive, leave, loc]);
      }
    }
    hides.sort((x, y) => x[0] - y[0]);
    station.sort((x, y) => x[0] - y[0]);
    const p = { fl, cr, hides, station };
    cache.set(trips, p);
    return p;
  };

  let prep: Prepared | null = null;
  let hidePtr = 0;
  let activeHides: [number, number, number][] = [];
  const flPtr: number[] = forklifts.map(() => 0);
  const crPtr: number[] = cranes.map(() => 0);
  const resetTrips = () => {
    for (const hd of activeHides) unhide(hd[2]);
    activeHides = []; hidePtr = 0;
    flPtr.fill(0); crPtr.fill(0);
  };
  /** Trip of this unit running at t (pointer advances with time, reset on rewind). */
  const current = (list: number[][], ptr: number[], i: number, t: number) => {
    // One unit runs its trips one after another, so start and end times both increase
    while (ptr[i] < list.length && list[ptr[i]][8] <= t) ptr[i]++;
    const tr = list[ptr[i]];
    return tr && tr[4] <= t ? tr : null;
  };
  const tint = (mesh: THREE.Mesh, loc: number) => {
    const sku = last[loc];
    (mesh.material as THREE.MeshStandardMaterial).color.set(sku >= 0 ? PRODUCT_PALETTE[sku % PRODUCT_PALETTE.length] : 0xd9a066);
  };

  const animateForklift = (f: THREE.Group, i: number, t: number) => {
    const tr = prep ? current(prep.fl[i] || [], flPtr, i, t) : null;
    const load = f.userData.load as THREE.Group;
    if (!tr) {
      // Between the trips of one task (handling at the dock) it waits at the dock, otherwise parks
      const list = prep?.fl[i] || [];
      const nx = list[flPtr[i]];
      if (nx && nx[4] - t <= E.handlingTime + 0.5) {
        f.position.set(0, 0, zDock); f.rotation.y = Math.PI / 2;
        load.visible = nx[9] === 1; if (load.visible) tint(f.userData.loadBox, nx[2]);
      } else {
        f.position.copy(parkSpots[i]); f.rotation.y = Math.PI / 2; load.visible = false;
      }
      load.position.y = 0;
      return;
    }
    const [, , loc, , ta, tm, tin, tout, tback] = tr;
    const loadedIn = tr[9] === 1, tAt = tr[10];
    const { a, side, b, lv, s } = locInfo(loc);
    const ax = aisleX(a), zMouth = bayZ(0) + 0.3, zs = slotZ(b, s);
    const leg1 = Math.abs(ax), leg2 = Math.abs(zMouth - zDock), len = leg1 + leg2;
    const along = (d: number) => {
      if (d <= leg1) { f.position.set((Math.sign(ax) || 1) * d, 0, zDock); return [Math.sign(ax) || 1, 0]; }
      f.position.set(ax, 0, zDock - Math.min(d - leg1, leg2)); return [0, -1];
    };
    let liftFrac = 0;
    if (t < tm) {
      const [dx, dz] = along(((t - ta) / Math.max(0.01, tm - ta)) * len); f.rotation.y = heading(dx, dz);
    } else if (t < tin) {
      along(len); f.rotation.y = heading(0, -1);           // waiting at the aisle mouth
    } else if (t < tout) {
      const ti = ((b + 0.5) * L.bayWidth) / E.forkliftSpeed;
      const tl = (lv * L.levelHeight) / E.liftSpeed;
      let u = t - tin;
      if (u < ti) { f.position.set(ax, 0, zMouth + (zs - zMouth) * (u / Math.max(0.01, ti))); f.rotation.y = heading(0, -1); }
      else {
        u -= ti;
        const back = tout - t;
        f.position.set(ax, 0, zs);
        if (back < ti) { f.position.z = zMouth + (zs - zMouth) * (back / Math.max(0.01, ti)); f.rotation.y = heading(0, 1); }
        else {
          f.rotation.y = side === 0 ? Math.PI : 0;           // turned to the rack: side 0 is −X, side 1 is +X
          const inner = (tout - tin) - 2 * ti;                // lift, handle, lower
          const v = u;
          liftFrac = v < tl ? v / Math.max(0.01, tl) : v > inner - tl ? Math.max(0, (inner - v) / Math.max(0.01, tl)) : 1;
        }
      }
    } else {
      const [dx, dz] = along((1 - (t - tout) / Math.max(0.01, tback - tout)) * len);
      f.rotation.y = heading(-dx, -dz);
    }
    load.visible = loadedIn ? t < tAt : t >= tAt;
    if (load.visible) tint(f.userData.loadBox, loc);
    load.position.y = (liftFrac * lv * L.levelHeight) / FL_SCALE;
  };

  const animateCrane = (c: StackerCrane, i: number, t: number) => {
    const tr = prep ? current(prep.cr[i] || [], crPtr, i, t) : null;
    if (!tr) {
      c.group.position.z = zPD; c.carriage.position.y = CRANE_REST_Y; c.forks.position.x = 0; c.load.visible = false;
      return;
    }
    const [, , loc, , ts, tmv, tat, tlv] = tr;
    const loadedIn = tr[9] === 1, tAt = tr[10];
    const { side, b, lv, s } = locInfo(loc);
    const zs = slotZ(b, s);
    const ys = Math.max(0, (lv === 0 ? 0 : lv * L.levelHeight + 0.09) - 0.15);
    const th = Math.max(0.01, ((b + 0.5) * L.bayWidth) / E.craneSpeed);
    const tv = Math.max(0.01, (lv * L.levelHeight) / E.craneLift);
    const sgn = side === 0 ? -1 : 1;
    const travel = (u: number, out: boolean) => {
      const fh = Math.min(1, u / th), fv = Math.min(1, u / tv);
      const ph = out ? fh : 1 - fh, pv = out ? fv : 1 - fv;
      c.group.position.z = zPD + (zs - zPD) * ph;
      c.carriage.position.y = CRANE_REST_Y + (ys - CRANE_REST_Y) * pv;
    };
    c.forks.position.x = 0;
    if (t < tmv) {          // handling at the P&D (take the load from the in-feed conveyor)
      travel(0, true);
      const u = (t - ts) / Math.max(0.01, tmv - ts);
      if (loadedIn) c.forks.position.x = -reach * 0.8 * Math.sin(Math.PI * u);
    } else if (t < tat) travel(t - tmv, true);
    else if (t < tlv) {
      travel(1e9, true);
      c.forks.position.x = sgn * reach * Math.sin(Math.PI * (t - tat) / Math.max(0.01, tlv - tat));
    } else travel(t - tlv, false);
    c.load.visible = loadedIn ? t < tAt : t >= tAt;
    if (c.load.visible) tint(c.load.userData.box, loc);
  };

  const m4s = new THREE.Matrix4();
  const showStations = (t: number) => {
    if (!prep || stationSlots.length === 0) { stationBases.count = 0; stationBoxes.count = 0; return; }
    let n = 0;
    for (const [from, to, loc] of prep.station) {
      if (from > t) break;
      if (t >= to) continue;
      const p = stationSlots[n];
      stationBases.setMatrixAt(n, m4s.compose(v.set(p.x, p.y + 0.07, p.z), q0, sc.set(palletD, 0.14, palletW)));
      stationBoxes.setMatrixAt(n, m4s.compose(v.set(p.x, p.y + 0.14 + loadH * 0.35, p.z), q0, sc.set(palletD - 0.08, loadH * 0.7, palletW - 0.08)));
      const sku = last[loc];
      stationBoxes.setColorAt(n, color.set(sku >= 0 ? PRODUCT_PALETTE[sku % PRODUCT_PALETTE.length] : 0xd9a066));
      if (++n >= stationSlots.length) break;
    }
    stationBases.count = n; stationBoxes.count = n;
    stationBases.instanceMatrix.needsUpdate = true; stationBoxes.instanceMatrix.needsUpdate = true;
    if (stationBoxes.instanceColor) stationBoxes.instanceColor.needsUpdate = true;
  };

  const park = () => {
    forklifts.forEach((f, i) => { f.position.copy(parkSpots[i]); f.rotation.y = Math.PI / 2; f.userData.load.visible = false; });
    cranes.forEach((c) => { c.group.position.z = zPD; c.carriage.position.y = CRANE_REST_Y; c.forks.position.x = 0; c.load.visible = false; });
  };

  let applied = 0;
  let appliedT = -1;
  let lastTrips: unknown = null;
  const resetAll = () => {
    resetTrips();
    cur.fill(-1); last.fill(-1);
    clearAll(); applied = 0; appliedT = -1;
  };
  const showAt = (log: WarehouseLog, t: number) => {
    const moves = log.moves || [];
    if (log.trips !== lastTrips) { resetAll(); lastTrips = log.trips; }
    if (t < appliedT) resetAll();
    prep = log.trips && log.trips.length ? prepare(log.trips, moves) : null;
    while (applied < moves.length && moves[applied][0] <= t) {
      const [, loc, sku] = moves[applied++];
      setLoc(loc, sku);
    }
    if (prep) {
      while (hidePtr < prep.hides.length && prep.hides[hidePtr][0] <= t) {
        const hd = prep.hides[hidePtr++];
        if (hd[1] > t) { hide(hd[2]); activeHides.push(hd); }
      }
      if (activeHides.length) {
        activeHides = activeHides.filter((hd) => { if (hd[1] <= t) { unhide(hd[2]); return false; } return true; });
      }
    }
    appliedT = t;
    forklifts.forEach((f, i) => animateForklift(f, i, t));
    cranes.forEach((c, i) => animateCrane(c, i, t));
    showStations(t);
    showTrucks(log.trucks, t);
  };

  g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  void statics;
  return {
    group: g,
    capacity,
    set,
    clear: () => { resetAll(); lastTrips = null; park(); },
    showAt,
    park,
    bounds: { x0, x1, z0: -depth - 0.3, z1, yard },
  };
}

/**
 * Design-time stock: place each SKU's initial pallets like the engine does at
 * t = 0 with "closest" slotting (first pallet to the nearest pick face on
 * level 0, the rest to the nearest reserve locations).
 */
export function initialMoves(layout: RackLayout, skus: { initialPallets?: number }[], equipment?: RackEquipment): [number, number, number][] {
  const L = layout;
  const width = L.aisles * (L.aisleWidth + 2 * L.rackDepth);
  const aisleX = (a: number) => a * (L.aisleWidth + 2 * L.rackDepth) + L.rackDepth + L.aisleWidth / 2 - width / 2;
  const E = equipment;
  const asrs = E?.storage === 'asrs';
  const locs: { i: number; t: number; lv: number; a: number }[] = [];
  let i = 0;
  for (let a = 0; a < L.aisles; a++) for (let side = 0; side < 2; side++) {
    for (let b = 0; b < L.baysPerAisle; b++) for (let lv = 0; lv < L.levels; lv++) for (let s = 0; s < L.palletsPerBay; s++) {
      const horiz = Math.abs(aisleX(a)) + L.frontClearance + (b + 0.5) * L.bayWidth;
      const t = asrs
        ? (Math.abs(aisleX(a)) + L.frontClearance) / E!.conveyorSpeed + Math.max(((b + 0.5) * L.bayWidth) / E!.craneSpeed, (lv * L.levelHeight) / E!.craneLift)
        : horiz / (E?.forkliftSpeed ?? 2.0) + (lv * L.levelHeight) / (E?.liftSpeed ?? 0.4);
      locs.push({ i: i++, t, lv, a });
    }
  }
  locs.sort((x, y) => x.t - y.t);
  if (asrs) {
    // Engine (AS/RS): each SKU spread over the aisles, nearest free location in the chosen aisle
    const used = new Set<number>();
    const moves: [number, number, number][] = [];
    skus.forEach((s, k) => {
      const perAisle = new Array(L.aisles).fill(0);
      for (let n = 0; n < (s.initialPallets ?? 0); n++) {
        const free = locs.filter((l) => !used.has(l.i));
        if (!free.length) return;
        const aisles = new Set(free.map((l) => l.a));
        let best = -1;
        aisles.forEach((a) => { if (best < 0 || perAisle[a] < perAisle[best] || (perAisle[a] === perAisle[best] && a < best)) best = a; });
        const l = free.find((x) => x.a === best)!;
        used.add(l.i); perAisle[best]++;
        moves.push([0, l.i, k]);
      }
    });
    return moves;
  }
  const faces = locs.filter((l) => l.lv === 0);
  const reserve = locs.filter((l) => l.lv >= 1);
  const used = new Set<number>();
  const take = (list: typeof locs) => { for (const l of list) if (!used.has(l.i)) { used.add(l.i); return l.i; } return -1; };
  const moves: [number, number, number][] = [];
  skus.forEach((s, k) => {
    for (let n = 0; n < (s.initialPallets ?? 0); n++) {
      let loc = take(n === 0 ? faces : reserve);
      if (loc < 0) loc = take(n === 0 ? reserve : faces);
      if (loc < 0) return;
      moves.push([0, loc, k]);
    }
  });
  return moves;
}
