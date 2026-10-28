import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useModelStore } from '../../../stores/modelStore';
import { useLiveSimulationStore } from '../../../stores/liveSimulationStore';
import { useSimulationStore } from '../../../stores/simulationStore';
import { useAppStore } from '../../../stores/appStore';
import { MODEL_BUILDERS } from './machines/MachineRegistry';
import { getLibraryBuilders } from './model-library/ModelLibraryRegistry';
import { setStatusLampState } from './shared/helpers';
import { M } from './shared/materials';
import { productColorNum, PRODUCT_PALETTE, type ProductRef } from '../../../utils/productColors';
import { buildSurroundings, frameLayout, SURROUNDINGS_SHARED_MATS, type LayoutInfo } from './shared/Surroundings';
import { buildRackWarehouse, rackLayoutOf, rackEquipmentOf, initialMoves, type RackWarehouse } from './shared/RackWarehouse';
import { PostProcessingPipeline } from './shared/PostProcessing';
import { DynamicLightingManager } from './shared/DynamicLighting';
import { ConveyorAnimationManager } from './shared/ConveyorAnimation';
import { VehicleAnimationManager } from './shared/VehicleAnimation';
import { OperatorAnimationManager } from './shared/OperatorAnimation';
import { ParticleEffectManager, type EffectType } from './shared/ParticleEffects';
import { createFactoryEnvironment as createEnvMap, applyEnvironmentMap } from './shared/EnvironmentMap';
import { MaterialEnhancer } from './shared/PBRMaterials';
import { ReflectiveFloorManager } from './shared/ReflectiveFloor';
import { MachineAnimationManager } from './shared/MachineAnimations';
import { AtmosphericEffectsManager } from './shared/AtmosphericEffects';
// DepthOfField disabled — factory simulation needs all objects sharp
import { RobotArmAnimationManager } from './shared/RobotArmAnimation';
import { SurfaceDetailManager } from './shared/SurfaceDetail';
// Phase 3 realism enhancements
import { EnhancedShadowSystem } from './shared/ShadowSystem';
import { CableSystemManager } from './shared/CableSystem';
import { TimeOfDayManager } from './shared/TimeOfDayLighting';
import { LODManager } from './shared/LODSystem';
import { ScenarioAnimator } from './shared/ScenarioAnimator';
import { LiveHUD } from './shared/LiveHUD';
import { CameraBookmarks } from './shared/CameraBookmarks';
import { CycleTimeAnalyzer } from './shared/CycleTimeAnalyzer';
import { GlassManager } from './shared/GlassShader';
// Phase 4 realism enhancements
import { ProceduralTextureGenerator } from './shared/ProceduralTextures';
import { WearWeatheringManager } from './shared/WearWeathering';
import { MachineDecalManager } from './shared/MachineDecals';
import { ScreenDisplayManager } from './shared/ScreenDisplay';
import { MaterialVariationManager } from './shared/MaterialVariation';
import { AnisotropicMetalManager } from './shared/AnisotropicMetal';

const LIBRARY_BUILDERS = getLibraryBuilders();

// ── Constants ──────────────────────────────────────────────────────────────────

// Metres per 2D-layout pixel. 0.02 gives ~2–3 m of conveyor between machines
// placed at the 2D builder's default spacing, as on a real line.
const SCALE = 0.02;

// ── Label Texture Helper ───────────────────────────────────────────────────────

// On-screen label sizes (sprites use sizeAttenuation:false, so these are
// fractions of the view height × 2·tan(fov/2) ≈ 0.93 at 50°).
const LABEL_SCALE: [number, number] = [0.16, 0.04];
const STATS_SCALE: [number, number] = [0.15, 0.0375];

function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 512;
  canvas.height = 128;

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // background pill
  const metrics = ctx.measureText(text);
  const pw = metrics.width + 32;
  const ph = 64;
  const px = (canvas.width - pw) / 2;
  const py = (canvas.height - ph) / 2;
  // CAE-style annotation: white box, thin slate border, dark text
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, px, py, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#64748B';
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  // toneMapped:false keeps label colours exact (white box, dark text)
  // Constant on-screen size (sizeAttenuation off) so names stay readable when zoomed out
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(LABEL_SCALE[0], LABEL_SCALE[1], 1);
  return sprite;
}

// ── Stats Badge Sprite (updated dynamically during replay) ────────────────

const STATE_LABELS: Record<string, string> = {
  processing: 'PROC', idle: 'IDLE', blocked: 'BLKD', starved: 'STRV',
  failed: 'FAIL', setup: 'SETP', off_shift: 'OFF', batch_wait: 'WAIT',
};

const BADGE_COLORS: Record<string, string> = {
  processing: '#22c55e', idle: '#94a3b8', blocked: '#ef4444', starved: '#f97316',
  failed: '#dc2626', setup: '#f59e0b', off_shift: '#64748b', batch_wait: '#a78bfa',
};

function createStatsSprite(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(STATS_SCALE[0], STATS_SCALE[1], 1);
  sprite.name = '_statsSprite';
  (sprite as any)._statsCanvas = canvas;
  (sprite as any)._statsTex = tex;
  return sprite;
}

function updateStatsSprite(
  sprite: THREE.Sprite,
  state: string,
  processedCount: number,
  utilization: number,
) {
  const canvas = (sprite as any)._statsCanvas as HTMLCanvasElement;
  const tex = (sprite as any)._statsTex as THREE.CanvasTexture;
  if (!canvas || !tex) return;

  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background pill
  const pw = 420;
  const ph = 64;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, px, py, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#94A3B8';
  ctx.stroke();

  const stateColor = BADGE_COLORS[state] || '#94a3b8';
  const stateLabel = STATE_LABELS[state] || state.toUpperCase().slice(0, 4);
  const cy = h / 2;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // Left: state dot + abbreviation
  ctx.beginPath();
  ctx.arc(px + 20, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = stateColor;
  ctx.fill();

  ctx.font = `bold 26px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = stateColor;
  ctx.fillText(stateLabel, px + 34, cy);

  // Center: utilization % number
  const utilColor = utilization > 0.85 ? '#DC2626' : utilization > 0.6 ? '#D97706' : '#059669';
  ctx.font = `bold 30px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = utilColor;
  ctx.fillText(`${(utilization * 100).toFixed(0)}%`, w / 2, cy);

  // Right: count + "pc" suffix
  ctx.font = `bold 30px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F172A';
  const countStr = `${processedCount}`;
  const countX = px + pw - 46;
  ctx.fillText(countStr, countX, cy);

  ctx.font = `18px ${font}`;
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'left';
  ctx.fillText('pc', countX + 4, cy);

  tex.needsUpdate = true;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Selection Ring ─────────────────────────────────────────────────────────────

function createSelectionRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.7, 0.9, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  return ring;
}

// ── Connection — steel conveyor strip per edge ───────────────────────────────

const CONN_GEO = new THREE.BoxGeometry(1, 1, 1); // shared, scaled per connection
const CONN_MAT = new THREE.MeshStandardMaterial({ color: 0x7d8a9b, metalness: 0.4, roughness: 0.45 }); // brushed steel on a light floor
const ARROW_MAT = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.2, roughness: 0.5, emissive: 0xfbbf24, emissiveIntensity: 0.55 });
const ARROW_GEO = new THREE.ConeGeometry(0.04, 0.08, 3);
const FOOTPRINT_GEO = new THREE.BoxGeometry(1, 0.005, 1);
const FOOTPRINT_MAT = new THREE.MeshStandardMaterial({ color: 0xbcc5cf, roughness: 0.98, metalness: 0 });
// Glass panel for stations — shared
const GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x88bbdd, metalness: 0.0, roughness: 0.05,
  transparent: true, opacity: 0.15, side: THREE.DoubleSide,
});
const GLASS_GEO = new THREE.BoxGeometry(1, 1, 0.02); // shared, scaled

// ── Factory floor paths — painted lane markings ──
const PATH_GEO = new THREE.BoxGeometry(1, 1, 1); // shared, scaled per path

// Set of module-level shared geometries/materials — must NOT be disposed on unmount
const SHARED_GEOS: Set<THREE.BufferGeometry> = new Set([CONN_GEO, ARROW_GEO, FOOTPRINT_GEO, GLASS_GEO, PATH_GEO]);
const SHARED_MATS: Set<THREE.Material> = new Set([CONN_MAT, ARROW_MAT, FOOTPRINT_MAT, GLASS_MAT]);

/** Create a single straight floor-path segment (axis-aligned) */
function _createPathSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  isForklift: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.05) return g;
  const angle = Math.atan2(dx, dz);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;

  if (isForklift) {
    // ── Forklift lane — wide, dark with yellow edge stripes ──
    const laneWidth = 0.70;
    const laneMat = new THREE.MeshStandardMaterial({ color: 0xaab4c0, roughness: 0.95, metalness: 0 });
    const lane = new THREE.Mesh(PATH_GEO, laneMat);
    lane.scale.set(laneWidth, 0.004, dist + 0.02);
    lane.position.set(cx, 0.005, cz);
    lane.rotation.y = angle;
    g.add(lane);

    // Yellow edge lines
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.7, emissive: 0xf5c518, emissiveIntensity: 0.1 });
    const halfW = laneWidth / 2;
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(PATH_GEO, edgeMat);
      edge.scale.set(0.035, 0.005, dist + 0.02);
      // Perpendicular offset: rotate 90° from path direction
      const perpX = -Math.sin(angle) * side * halfW;
      const perpZ = Math.cos(angle) * side * halfW;
      edge.position.set(cx + perpX, 0.006, cz + perpZ);
      edge.rotation.y = angle;
      g.add(edge);
    }

    // Center dashed yellow line
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.7, emissive: 0xf5c518, emissiveIntensity: 0.05 });
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const dashLen = 0.25;
    const segLen = 0.45;
    const numDashes = Math.floor(dist / segLen);
    for (let i = 0; i < numDashes; i++) {
      const t = (i * segLen + dashLen / 2) / dist;
      const dash = new THREE.Mesh(PATH_GEO, dashMat);
      dash.scale.set(0.03, 0.005, dashLen);
      dash.position.set(start.x + dirX * t * dist, 0.007, start.z + dirZ * t * dist);
      dash.rotation.y = angle;
      g.add(dash);
    }
  } else {
    // ── Walking path — gray concrete with white edges ──
    const pathWidth = 0.40;
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.92, metalness: 0 });
    const path = new THREE.Mesh(PATH_GEO, pathMat);
    path.scale.set(pathWidth, 0.003, dist + 0.02);
    path.position.set(cx, 0.005, cz);
    path.rotation.y = angle;
    g.add(path);

    // White edge lines
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.8, metalness: 0 });
    const halfW = pathWidth / 2;
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(PATH_GEO, edgeMat);
      edge.scale.set(0.018, 0.004, dist + 0.02);
      const perpX = -Math.sin(angle) * side * halfW;
      const perpZ = Math.cos(angle) * side * halfW;
      edge.position.set(cx + perpX, 0.006, cz + perpZ);
      edge.rotation.y = angle;
      g.add(edge);
    }
  }

  return g;
}

/** Create a Manhattan (L-shaped) floor path: horizontal then perpendicular segments */
function createFloorPath(
  start: THREE.Vector3,
  end: THREE.Vector3,
  isForklift: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const dx = Math.abs(end.x - start.x);
  const dz = Math.abs(end.z - start.z);

  // If nearly aligned, single straight segment
  if (dx < 0.1 || dz < 0.1) {
    g.add(_createPathSegment(start, end, isForklift));
    return g;
  }

  // L-shaped: go along X first, then Z
  const corner = new THREE.Vector3(end.x, 0, start.z);
  g.add(_createPathSegment(start, corner, isForklift));
  g.add(_createPathSegment(corner, end, isForklift));

  return g;
}

// ── Conveyor parts — small boxes that travel along connections ──
const CONV_PART_GEO = new THREE.BoxGeometry(0.4, 0.24, 0.32); // tote, ~real size
SHARED_GEOS.add(CONV_PART_GEO);
const CONV_PART_COLORS = PRODUCT_PALETTE.map((h) => parseInt(h.slice(1), 16)); // product colours

interface ConveyorPart {
  mesh: THREE.Mesh;
  t: number;           // 0→1 position along path
  speed: number;       // units per second
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  path?: THREE.Vector3[];
  total?: number;
  edgeKey: string;
}

interface ConnectionGroup extends THREE.Group {
  userData: {
    edgeKey: string;
    flowRate: number;
    beltMesh: THREE.Mesh;
    arrowMesh: THREE.Mesh;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    dist: number;
  };
}

// Roller-conveyor parts (shared, never disposed)
// Real-world proportions (1 unit = 1 m): 0.6 m wide bed, rollers at 0.8 m —
// the height parts sit at when they enter a machine.
export const CONV_W = 0.6;
export const CONV_TOP = 0.8;
const RC_ROLLER_GEO = new THREE.CylinderGeometry(0.028, 0.028, 1, 10);
const RC_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const RC_FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x8d969f, metalness: 0.45, roughness: 0.4 });
const RC_ROLLER_MAT = new THREE.MeshStandardMaterial({ color: 0xc3c9cf, metalness: 0.7, roughness: 0.3 });
const RC_LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x4f5660, metalness: 0.4, roughness: 0.5 });
const RC_GUARD_MAT = new THREE.MeshStandardMaterial({ color: 0xf2c200, metalness: 0.2, roughness: 0.5 });
const RC_TRANSFER_MAT = new THREE.MeshStandardMaterial({ color: 0x3b4149, metalness: 0.3, roughness: 0.6 });
SHARED_GEOS.add(RC_ROLLER_GEO); SHARED_GEOS.add(RC_BOX_GEO);
[RC_FRAME_MAT, RC_ROLLER_MAT, RC_LEG_MAT, RC_GUARD_MAT, RC_TRANSFER_MAT].forEach((m) => SHARED_MATS.add(m));

/** Footprint half-extents of a node model on the floor (x, z). */
export interface HalfExtents { x: number; z: number }

/** A machine side: axis and outward sign, e.g. {axis:'x', sign:1} = the +X face. */
export interface Face { axis: 'x' | 'z'; sign: number }
export const faceKey = (f: Face) => `${f.axis}${f.sign > 0 ? '+' : '-'}`;

export interface RouteOptions {
  /** Faces already used on the source / target (each side carries one conveyor). */
  usedSrc?: Set<string>;
  usedTgt?: Set<string>;
  /** If set, the only face the route may leave / enter by (buffers, line ends). */
  srcFace?: Face;
  tgtFace?: Face;
}

/**
 * Orthogonal conveyor route between two machines, the way layouts are drawn
 * in Visual Components / Plant Simulation: straight runs and 90° turns only.
 * Candidates: L-shapes (X→Z, Z→X) and Z-shapes (out, jog, in) along either
 * axis. Each is scored by length plus penalties for corners, for reusing a
 * machine side that already carries a conveyor, and for violating a fixed
 * in/out face. The same polyline is used to draw the conveyor and to move
 * parts along it.
 */
export function routeConveyor(src: THREE.Vector3, tgt: THREE.Vector3, sh: HalfExtents, th: HalfExtents, opt: RouteOptions = {}): { path: THREE.Vector3[]; srcFace: Face; tgtFace: Face } {
  const S = { x: src.x, z: src.z }, T = { x: tgt.x, z: tgt.z };
  const dx = T.x - S.x, dz = T.z - S.z;
  const sx = Math.sign(dx) || 1, sz = Math.sign(dz) || 1;
  const MIN = 0.35 + CONV_W / 2; // shortest run past a machine edge before a corner
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  type Cand = { path: THREE.Vector3[]; srcFace: Face; tgtFace: Face; ok: boolean };
  const cands: Cand[] = [];

  // L: leave on X face, enter on Z face
  {
    const a = V(S.x + sx * sh.x, S.z), c = V(T.x, S.z), b = V(T.x, T.z - sz * th.z);
    cands.push({ path: [a, c, b], srcFace: { axis: 'x', sign: sx }, tgtFace: { axis: 'z', sign: -sz },
      ok: Math.abs(dx) - sh.x >= MIN && Math.abs(dz) - th.z >= MIN });
  }
  // L: leave on Z face, enter on X face
  {
    const a = V(S.x, S.z + sz * sh.z), c = V(S.x, T.z), b = V(T.x - sx * th.x, T.z);
    cands.push({ path: [a, c, b], srcFace: { axis: 'z', sign: sz }, tgtFace: { axis: 'x', sign: -sx },
      ok: Math.abs(dz) - sh.z >= MIN && Math.abs(dx) - th.x >= MIN });
  }
  // Z along X: out the X face, jog in Z at the midpoint, in the X face
  {
    const x0 = S.x + sx * sh.x, x1 = T.x - sx * th.x, mx = (x0 + x1) / 2;
    // Small offsets: one straight run at the mean line, still inside both faces
    const straight = Math.abs(dz) < Math.min(sh.z, th.z) * 0.6;
    const zm = (S.z + T.z) / 2;
    cands.push({ path: straight ? [V(x0, zm), V(x1, zm)] : [V(x0, S.z), V(mx, S.z), V(mx, T.z), V(x1, T.z)],
      srcFace: { axis: 'x', sign: sx }, tgtFace: { axis: 'x', sign: -sx },
      ok: sx * (x1 - x0) >= (straight ? 0.3 : 2 * MIN) });
  }
  // Z along Z
  {
    const z0 = S.z + sz * sh.z, z1 = T.z - sz * th.z, mz = (z0 + z1) / 2;
    const straight = Math.abs(dx) < Math.min(sh.x, th.x) * 0.6;
    const xm = (S.x + T.x) / 2;
    cands.push({ path: straight ? [V(xm, z0), V(xm, z1)] : [V(S.x, z0), V(S.x, mz), V(T.x, mz), V(T.x, z1)],
      srcFace: { axis: 'z', sign: sz }, tgtFace: { axis: 'z', sign: -sz },
      ok: sz * (z1 - z0) >= (straight ? 0.3 : 2 * MIN) });
  }

  const same = (a: Face, b?: Face) => !b || (a.axis === b.axis && a.sign === b.sign);
  let best: Cand | null = null, bestCost = Infinity;
  for (const c of cands) {
    let cost = pathLength(c.path) + (c.path.length - 2) * 0.8;
    if (!c.ok) cost += 1000;
    if (!same(c.srcFace, opt.srcFace)) cost += 300;
    if (!same(c.tgtFace, opt.tgtFace)) cost += 300;
    if (opt.usedSrc?.has(faceKey(c.srcFace))) cost += 100;
    if (opt.usedTgt?.has(faceKey(c.tgtFace))) cost += 100;
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best!;
}

export function pathLength(path: THREE.Vector3[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += path[i - 1].distanceTo(path[i]);
  return d;
}

/** Point and heading at fraction t (0..1) along a polyline. */
export function samplePolyline(path: THREE.Vector3[], total: number, t: number, out: THREE.Vector3): number {
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = a.distanceTo(b);
    if (d <= seg || i === path.length - 1) {
      out.lerpVectors(a, b, seg > 0 ? Math.min(1, d / seg) : 0);
      return Math.atan2(b.x - a.x, b.z - a.z);
    }
    d -= seg;
  }
  out.copy(path[path.length - 1]);
  return 0;
}

/** One straight roller-conveyor section from a to b (local helper). */
function addConveyorRun(parent: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, bedMat: THREE.Material, guards: boolean) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.05) return;
  const W = CONV_W, TOP = CONV_TOP;
  const local = new THREE.Group();
  local.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  local.rotation.y = Math.atan2(dx, dz); // local +Z runs along the flow
  parent.add(local);

  const bed = new THREE.Mesh(RC_BOX_GEO, bedMat);
  bed.scale.set(W - 0.06, 0.02, len);
  bed.position.set(0, TOP - 0.075, 0);
  bed.receiveShadow = true;
  local.add(bed);

  // Side frames (C-channel look: tall flat plate)
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(RC_BOX_GEO, RC_FRAME_MAT);
    rail.scale.set(0.035, 0.14, len);
    rail.position.set(side * (W / 2), TOP - 0.05, 0);
    rail.castShadow = true;
    local.add(rail);
    if (guards) {
      const guard = new THREE.Mesh(RC_BOX_GEO, RC_GUARD_MAT);
      guard.scale.set(0.02, 0.05, len);
      guard.position.set(side * (W / 2 + 0.005), TOP + 0.07, 0);
      local.add(guard);
    }
  }

  const pitch = 0.1;
  const n = Math.max(2, Math.floor(len / pitch));
  const rollers = new THREE.InstancedMesh(RC_ROLLER_GEO, RC_ROLLER_MAT, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const sc = new THREE.Vector3(1, W - 0.05, 1);
  for (let k = 0; k < n; k++) {
    m4.compose(new THREE.Vector3(0, TOP - 0.028, -len / 2 + (k + 0.5) * (len / n)), q, sc);
    rollers.setMatrixAt(k, m4);
  }
  rollers.instanceMatrix.needsUpdate = true;
  rollers.receiveShadow = true;
  local.add(rollers);

  // Leg frames every ~1.5 m: two legs, foot plates, cross brace
  const legCount = Math.max(2, Math.ceil(len / 1.5) + 1);
  for (let k = 0; k < legCount; k++) {
    const z = -len / 2 + 0.08 + (k * (len - 0.16)) / (legCount - 1);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(RC_BOX_GEO, RC_LEG_MAT);
      leg.scale.set(0.05, TOP - 0.12, 0.05);
      leg.position.set(side * (W / 2 - 0.04), (TOP - 0.12) / 2, z);
      leg.castShadow = true;
      local.add(leg);
      const foot = new THREE.Mesh(RC_BOX_GEO, RC_LEG_MAT);
      foot.scale.set(0.12, 0.015, 0.12);
      foot.position.set(side * (W / 2 - 0.04), 0.008, z);
      local.add(foot);
    }
    const brace = new THREE.Mesh(RC_BOX_GEO, RC_LEG_MAT);
    brace.scale.set(W - 0.08, 0.04, 0.04);
    brace.position.set(0, 0.22, z);
    local.add(brace);
  }
}

/** 90° transfer unit at a corner (dark square table with rollers at right angles). */
function addTransferUnit(parent: THREE.Group, c: THREE.Vector3) {
  const W = CONV_W + 0.04, TOP = CONV_TOP;
  const body = new THREE.Mesh(RC_BOX_GEO, RC_TRANSFER_MAT);
  body.scale.set(W, 0.16, W);
  body.position.set(c.x, TOP - 0.1, c.z);
  body.castShadow = true;
  parent.add(body);
  const top = new THREE.Mesh(RC_BOX_GEO, RC_ROLLER_MAT);
  top.scale.set(W - 0.08, 0.012, W - 0.08);
  top.position.set(c.x, TOP - 0.012, c.z);
  parent.add(top);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(RC_BOX_GEO, RC_LEG_MAT);
    leg.scale.set(0.05, TOP - 0.18, 0.05);
    leg.position.set(c.x + ox * (W / 2 - 0.05), (TOP - 0.18) / 2, c.z + oz * (W / 2 - 0.05));
    parent.add(leg);
  }
}

/**
 * Roller conveyor along an orthogonal route (see routeConveyor): straight
 * sections joined by transfer units. The bed plate is shared by all sections
 * so the flow colouring in the animation loop recolours the whole conveyor.
 */
function createConveyorConnection(
  path: THREE.Vector3[],
  flowRate: number = 0,
  maxFlowRate: number = 1,
  guards = false,
): ConnectionGroup {
  const g = new THREE.Group() as ConnectionGroup;
  const flowFactor = maxFlowRate > 0 ? flowRate / maxFlowRate : 0;
  const bedMat = new THREE.MeshStandardMaterial({ color: flowFactor > 0.7 ? 0x2f8f6f : 0x59616b, metalness: 0.2, roughness: 0.8 });
  const half = CONV_W / 2 + 0.02;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1].clone(), b = path[i].clone();
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    // Stop short of corner transfer units
    if (i > 1) a.addScaledVector(dir, half);
    if (i < path.length - 1) b.addScaledVector(dir, -half);
    addConveyorRun(g, a, b, bedMat, guards);
  }
  for (let i = 1; i < path.length - 1; i++) addTransferUnit(g, path[i]);

  // Flow-direction arrow above the middle of the longest section
  const total = pathLength(path);
  const mid = new THREE.Vector3();
  const heading = samplePolyline(path, total, 0.5, mid);
  const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT);
  arrow.position.set(mid.x, CONV_TOP + 0.04, mid.z);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)));
  g.add(arrow);

  g.userData = {
    edgeKey: '',
    flowRate,
    beltMesh: { material: bedMat } as any,
    arrowMesh: arrow,
    startPos: path[0].clone(),
    endPos: path[path.length - 1].clone(),
    dist: total,
    path: path.map((p) => p.clone()),
  } as any;
  (g.userData as any).ownedMats = [bedMat];
  return g;
}

// ── Visual Components–style detailing: plinth, edge lines, safety fence ──
const FENCE_POST_MAT = new THREE.MeshStandardMaterial({ color: 0xf2c200, metalness: 0.15, roughness: 0.5 });
const FENCE_MESH_MAT = new THREE.MeshStandardMaterial({ color: 0x6f7883, metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
SHARED_MATS.add(FENCE_POST_MAT); SHARED_MATS.add(FENCE_MESH_MAT);

const _bb = new THREE.Box3();
const _sz = new THREE.Vector3();

/** Bounding box of the machine's solid meshes only (no labels, decals, fences). */
function machineBox(group: THREE.Group, target: THREE.Box3): THREE.Box3 {
  target.makeEmpty();
  group.updateMatrixWorld(true);
  const tmp = new THREE.Box3();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as any).isSprite) return;
    if (o.name.startsWith('_') || o.parent?.name === '_fence') return;
    const m = mesh.material as THREE.Material;
    if ((m as any).transparent && (m as any).opacity < 0.5) return;
    mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    target.union(tmp);
  });
  return target;
}

/**
 * Yellow safety fence around a cell: 2 m posts, grey mesh panels, top and
 * mid rails, a 1.1 m opening wherever a conveyor passes through (`openings`
 * are world points on the machine edge) and a personnel gate on one side.
 */
function addSafetyFence(group: THREE.Group, openings: THREE.Vector3[] = []) {
  machineBox(group, _bb);
  if (_bb.isEmpty()) return;
  _bb.getSize(_sz);
  const sc = group.scale.x || 1;
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const c = _bb.getCenter(new THREE.Vector3()).applyMatrix4(inv);
  const hw = (_sz.x / 2 + 0.5) / sc, hd = (_sz.z / 2 + 0.5) / sc, H = 2.0 / sc;
  const GAP = 1.1 / sc, POST = 0.06 / sc, RAIL = 0.035 / sc;
  const local = openings.map((p) => p.clone().applyMatrix4(inv));
  const fence = new THREE.Group();
  fence.name = '_fence';
  const post = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(POST, H, POST), FENCE_POST_MAT);
    p.position.set(c.x + x, H / 2, c.z + z); p.castShadow = true; fence.add(p);
  };
  const run = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) return;
    const ry = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
    const mx = c.x + (x1 + x2) / 2, mz = c.z + (z1 + z2) / 2;
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(len, H * 0.82), FENCE_MESH_MAT);
    pn.position.set(mx, H * 0.5, mz); pn.rotation.y = ry; fence.add(pn);
    for (const y of [H - RAIL / 2, H * 0.09]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL, RAIL), FENCE_POST_MAT);
      rail.position.set(mx, y, mz); rail.rotation.y = ry; fence.add(rail);
    }
    post(x1, z1); post(x2, z2);
  };
  // Sides as (start, end) in local coords, with gaps where conveyors cross
  const sides: [number, number, number, number][] = [
    [-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd],
  ];
  sides.forEach(([x1, z1, x2, z2], si) => {
    const alongX = Math.abs(z1 - z2) < 1e-6;
    const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const dir = alongX ? Math.sign(x2 - x1) : Math.sign(z2 - z1);
    // Positions along this side (0..len) that need a gap
    const gaps: number[] = [];
    for (const p of local) {
      const off = alongX ? Math.abs(p.z - (c.z + z1)) : Math.abs(p.x - (c.x + x1));
      const along = alongX ? (p.x - (c.x + x1)) * dir : (p.z - (c.z + z1)) * dir;
      if (off < 0.9 / sc && along > 0 && along < len) gaps.push(along);
    }
    // Personnel gate on the aisle side (+Z) if it has no conveyor gap
    if (si === 2 && gaps.length === 0) gaps.push(len * 0.75);
    gaps.sort((a, b) => a - b);
    let t = 0;
    const pt = (u: number): [number, number] => alongX ? [x1 + dir * u, z1] : [x1, z1 + dir * u];
    for (const g of gaps) {
      const g0 = Math.max(t, g - GAP / 2), g1 = Math.min(len, g + GAP / 2);
      if (g0 > t) run(...pt(t), ...pt(g0));
      t = Math.max(t, g1);
    }
    if (t < len) run(...pt(t), ...pt(len));
  });
  fence.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  group.add(fence);
}

const FENCED = /robot|weld|laser|press|cell/i;

/**
 * Paint schemes per machine family, after the references: machine tools in
 * light enclosures with anthracite trim, presses and booths in blue, welding
 * cells anthracite. Only the models' navy-blue painted surfaces are repainted
 * (lighter half → body, darker half → trim); accents (robot orange, safety
 * yellow, green/red lamps, glass, screens, cardboard) are left as modelled.
 */
const PAINT_SCHEMES: Record<string, { body: number; trim: number }> = {
  default: { body: 0xe8ebee, trim: 0x3d444d },
  press: { body: 0x2f6db3, trim: 0x2b3038 },
  'paint-booth': { body: 0x2f6db3, trim: 0x3d444d },
  'welding-station': { body: 0x4a525c, trim: 0x2b3038 },
  'injection-molder': { body: 0x2f8a5f, trim: 0x3d444d },
  'oven-furnace': { body: 0xb9c0c8, trim: 0x3d444d },
};
const _hsl = { h: 0, s: 0, l: 0 };
const PALETTE = new Set<THREE.Material>(Object.values(M) as THREE.Material[]);

function paintMachine(root: THREE.Object3D, modelId: string) {
  const scheme = PAINT_SCHEMES[modelId] || PAINT_SCHEMES.default;
  // Navy/slate painted materials with their visible area (bbox surface)
  const navy = new Map<THREE.MeshStandardMaterial, { l: number; area: number }>();
  const skip = new Set<THREE.Material>();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as any).isSprite) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mt) => {
      const m = mt as THREE.MeshStandardMaterial;
      if (!m.color || skip.has(m) || PALETTE.has(m) || m.transparent) { skip.add(m); return; }
      let e = navy.get(m);
      if (!e) {
        if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0.1) { skip.add(m); return; } // lamps, screens
        m.color.getHSL(_hsl, THREE.SRGBColorSpace);
        if (!(_hsl.h > 0.52 && _hsl.h < 0.72 && _hsl.s > 0.1 && _hsl.l < 0.5)) { skip.add(m); return; }
        e = { l: _hsl.l, area: 0 };
        navy.set(m, e);
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      mesh.geometry.boundingBox!.getSize(size).multiply(mesh.scale);
      e.area += size.x * size.y + size.y * size.z + size.x * size.z;
    });
  });
  if (navy.size === 0) return;
  // The dominant (largest-area) colour is the enclosure: it and anything
  // lighter become the body colour, darker tones become trim
  let dominant = { l: 0, area: -1 };
  navy.forEach((e) => { if (e.area > dominant.area) dominant = e; });
  navy.forEach((e, m) => {
    m.color.setHex(e.l >= dominant.l - 0.02 ? scheme.body : scheme.trim);
    m.metalness = Math.min(m.metalness, 0.3);
    m.roughness = Math.max(m.roughness, 0.45);
  });
}

/** Uniform scale per node type that brings the model to real-world size. */
const PEOPLE_TYPES = new Set(['operator', 'humanoid']);
const FLOW_ALIGNED = new Set(['buffer', 'source', 'sink']);
const FLOW_ALIGNED_MODELS = new Set(['infeed-station', 'outfeed-station', 'accumulation-conveyor']);
const VEHICLE_TYPES = new Set(['agv', 'forklift']);

const REAL_SCALE: Record<string, number> = {
  operator: 1.85,     // 0.94 m → 1.75 m person
  humanoid: 1.95,
  agv: 1.6,           // 0.74 m → 1.2 m long AGV
  roboticcell: 2.4,   // 1 m → 2.4 m fenced cell
  forklift: 1.25,
};

/** Floor footprint half-extents of a node model, ignoring labels and floor decals. */
function measureHalfExtents(group: THREE.Group): HalfExtents & { top: number } {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as any).isSprite || o.name.startsWith('_')) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return { x: 0.6, z: 0.6, top: 1.2 };
  const p = group.position;
  return {
    top: box.max.y,
    x: Math.max(Math.abs(box.max.x - p.x), Math.abs(p.x - box.min.x), 0.3),
    z: Math.max(Math.abs(box.max.z - p.z), Math.abs(p.z - box.min.z), 0.3),
  };
}

// ── Station Name → Variant Mapping ──────────────────────────────────────────

function getParticleEffectType(nodeType: string): EffectType | null {
  switch (nodeType) {
    case 'weldingcell': return 'welding_sparks';
    case 'lasercutter': return 'laser_beam';
    case 'oven': return 'heat_shimmer';
    case 'paintbooth': return 'smoke';
    case 'washer': return 'steam';
    case 'cncmachine': return 'coolant_spray';
    case 'press': return 'dust';
    default: return null;
  }
}

function getNodeBuilder(type: string, name: string, libraryModelId?: string): () => THREE.Group {
  // Library model override takes priority
  if (libraryModelId) {
    const libBuilder = LIBRARY_BUILDERS[libraryModelId] || LIBRARY_BUILDERS[libraryModelId.replace(/-/g, '')];
    if (libBuilder) return libBuilder;
  }

  const lower = name.toLowerCase();

  if (type === 'station') {
    if (lower.includes('cnc') || lower.includes('mill') || lower.includes('turn') || lower.includes('lathe'))
      return MODEL_BUILDERS['cncmill'] || MODEL_BUILDERS['station'];
    if (lower.includes('grind'))
      return MODEL_BUILDERS['grinder'] || MODEL_BUILDERS['station'];
    if (lower.includes('heat') || lower.includes('furnace') || lower.includes('treat') || lower.includes('oven'))
      return MODEL_BUILDERS['heattreat'] || MODEL_BUILDERS['station'];
    if (lower.includes('fill'))
      return MODEL_BUILDERS['filling'] || MODEL_BUILDERS['station'];
    if (lower.includes('label'))
      return MODEL_BUILDERS['labeling'] || MODEL_BUILDERS['station'];
    if (lower.includes('qc') || lower.includes('quality') || lower.includes('inspect') || lower.includes('sampling') || lower.includes('check'))
      return MODEL_BUILDERS['qcstation'] || MODEL_BUILDERS['inspection'];
  }

  // Buffer variants by name
  if (type === 'buffer') {
    if (lower.includes('lifo') || lower.includes('stack') || lower.includes('staging'))
      return MODEL_BUILDERS['lifobuffer'] || MODEL_BUILDERS['buffer'];
    if (lower.includes('sync') || lower.includes('match') || lower.includes('part sync'))
      return MODEL_BUILDERS['matchbuffer'] || MODEL_BUILDERS['buffer'];
  }

  // Conveyor variants
  if (type === 'conveyor') {
    if (lower.includes('pallet'))
      return MODEL_BUILDERS['palletconveyor'] || MODEL_BUILDERS['conveyor'];
  }

  // Merge variants
  if (type === 'merge') {
    if (lower.includes('priority'))
      return MODEL_BUILDERS['prioritymerge'] || MODEL_BUILDERS['merge'];
  }

  // Auto-match library models by name keywords (for any node type)
  if (lower.includes('laser') || lower.includes('cutting'))
    return LIBRARY_BUILDERS['laser-cutter'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('weld'))
    return LIBRARY_BUILDERS['welding-station'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('paint') || lower.includes('spray') || lower.includes('booth'))
    return LIBRARY_BUILDERS['paint-booth'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('press') || lower.includes('stamp'))
    return LIBRARY_BUILDERS['press'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('wash') || lower.includes('clean'))
    return LIBRARY_BUILDERS['washer'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('3d print') || lower.includes('additive'))
    return LIBRARY_BUILDERS['printer-3d'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('packag') || lower.includes('wrap'))
    return LIBRARY_BUILDERS['packaging-machine'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('gantry'))
    return LIBRARY_BUILDERS['gantry-crane'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('bridge crane') || lower.includes('overhead crane'))
    return LIBRARY_BUILDERS['bridge-crane'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('forklift'))
    return LIBRARY_BUILDERS['forklift'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('turntable') || lower.includes('rotary table'))
    return LIBRARY_BUILDERS['turntable'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('elevator') || lower.includes('lift') || lower.includes('vrc'))
    return LIBRARY_BUILDERS['elevator'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('rgv') || lower.includes('rail guided') || lower.includes('shuttle'))
    return LIBRARY_BUILDERS['rail-guided-vehicle'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('warehouse') || lower.includes('rack') || lower.includes('racking'))
    return LIBRARY_BUILDERS['warehouse-bay'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('asrs') || lower.includes('as/rs') || lower.includes('automated storage'))
    return LIBRARY_BUILDERS['asrs'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('cold') || lower.includes('freezer') || lower.includes('refrigerat'))
    return LIBRARY_BUILDERS['cold-storage'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('silo') || lower.includes('hopper') || lower.includes('bulk'))
    return LIBRARY_BUILDERS['silo'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('truck') || lower.includes('delivery'))
    return LIBRARY_BUILDERS['truck'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('trailer') || lower.includes('dock'))
    return LIBRARY_BUILDERS['trailer-dock'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
  if (lower.includes('tow') || lower.includes('tugger'))
    return LIBRARY_BUILDERS['tow-tractor'] || MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];

  return MODEL_BUILDERS[type] || MODEL_BUILDERS['station'];
}

// ── Simulation Animation System ──────────────────────────────────────────────

const PRODUCT_Y = 0.5;
const TRAVEL_SPEED = 3.5;
const MAX_PRODUCTS = 60;
const CONVEYOR_SPEED = 1.2; // m/s on screen (replay time is compressed)
const DOOR_OFFSET = 0.85;   // Stop this far from station center (station front)
const IDLE_OFFSET = 1.2;    // How far to the side for operator idle position
const LOADING_TIME = 0.6;   // Seconds for door-open / product-load animation
const DEPOSIT_TIME = 0.4;   // Seconds for product deposit at buffers/non-processing nodes

const STATE_COLORS: Record<string, number> = {
  idle: 0x94a3b8, processing: 0x22c55e, blocked: 0xef4444,
  starved: 0xf59e0b, failed: 0xb91c1c, off_shift: 0x475569, setup: 0x8b5cf6,
};

type AnimPhase = 'travel' | 'loading' | 'idle_walk' | 'waiting' | 'depositing';

interface AnimProduct {
  mesh: THREE.Group;          // transport group (operator/forklift + product)
  waypoints: THREE.Vector3[]; // Manhattan path waypoints (2 or 3 points)
  totalDist: number;
  progress: number;           // 0→1 along total path
  speed: number;
  alive: boolean;
  processingAt: string | null;
  processDuration: number;
  isPallet: boolean;
  // Operator behavior phases at stations
  phase: AnimPhase;
  phaseTimer: number;
  idleWaypoints?: THREE.Vector3[];   // path from door to idle spot
  idleTotalDist?: number;
  idleProgress?: number;
  doorMesh?: THREE.Mesh;             // animated sliding door panel
  kpiScreen?: THREE.Group;           // KPI screen at idle spot
  stationCenter?: THREE.Vector3;     // original station center position
  approachDir?: THREE.Vector3;       // unit vector: approach direction to station
  onConveyor?: boolean;              // carton riding a conveyor route
}

class SimulationAnimator {
  private scene: THREE.Scene;
  private products: AnimProduct[] = [];
  private processedEvents = new Set<string>();
  private conveyorRoutes = new Map<string, THREE.Vector3[]>();

  /** Conveyor routes keyed `${sourceId}->${targetId}` (same polylines as the drawn conveyors). */
  setConveyorRoutes(routes: Map<string, THREE.Vector3[]>) {
    this.conveyorRoutes = routes;
  }

  /** A carton that rides the conveyor between two machines, then enters the target. */
  private spawnOnConveyor(route: THREE.Vector3[], productType: string, processingAt?: string, processDuration?: number): AnimProduct | null {
    const totalDist = pathLength(route);
    if (totalDist < 0.05) return null;
    const color = this.getColor(productType);
    const g = new THREE.Group();
    // Plastic tote in the product's colour (colour = product type), darker rim
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.24, 0.32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }),
    );
    body.position.y = CONV_TOP + 0.12;
    body.castShadow = true;
    body.name = 'product';
    g.add(body);
    const rimColor = new THREE.Color(color).multiplyScalar(0.7);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.03, 0.34),
      new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.6 }),
    );
    rim.position.y = CONV_TOP + 0.235;
    g.add(rim);
    g.position.copy(route[0]);
    this.scene.add(g);
    const p: AnimProduct = {
      mesh: g, waypoints: route, totalDist, progress: 0,
      speed: CONVEYOR_SPEED / totalDist, alive: true,
      processingAt: processingAt || null, processDuration: processDuration || 0,
      isPallet: false, phase: 'travel', phaseTimer: 0, onConveyor: true,
    };
    this.products.push(p);
    return p;
  }
  private nodePositions = new Map<string, THREE.Vector3>();
  private nodeTypes = new Map<string, string>();     // id → node type
  private nameToId = new Map<string, string>();
  private edgeIncoming = new Map<string, string[]>();
  private edgeOutgoing = new Map<string, string[]>();
  private partGeos = {
    raw: new THREE.BoxGeometry(0.10, 0.08, 0.10),
    inProcess: new THREE.BoxGeometry(0.12, 0.09, 0.12),
    finished: new THREE.BoxGeometry(0.10, 0.08, 0.10),
    fallback: new THREE.BoxGeometry(0.11, 0.09, 0.11),
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Check if a node (by id) involves palletized material */
  private isPalletNode(nodeId: string): boolean {
    const t = this.nodeTypes.get(nodeId) || '';
    return t === 'palletize' || t === 'depalletize' || t === 'palletconveyor';
  }

  /** Check if a node is an AGV */
  private isAGVNode(nodeId: string): boolean {
    return (this.nodeTypes.get(nodeId) || '') === 'agv';
  }

  /** Check if a node is a humanoid */
  private isHumanoidNode(nodeId: string): boolean {
    return (this.nodeTypes.get(nodeId) || '') === 'humanoid';
  }

  /** Check if an edge involves palletized material or AGV transport */
  private isEdgePalletized(sourceId: string, targetId: string): boolean {
    return this.isPalletNode(sourceId) || this.isPalletNode(targetId) ||
           this.isAGVNode(sourceId) || this.isAGVNode(targetId);
  }

  /** Determine transport type for an edge */
  private getTransportType(sourceId: string, targetId: string): 'operator' | 'forklift' | 'agv' | 'humanoid' {
    if (this.isAGVNode(sourceId) || this.isAGVNode(targetId)) return 'agv';
    if (this.isPalletNode(sourceId) || this.isPalletNode(targetId)) return 'forklift';
    if (this.isHumanoidNode(sourceId) || this.isHumanoidNode(targetId)) return 'humanoid';
    return 'operator';
  }

  private modelProducts: ProductRef[] = [];

  updateTopology(model: { stations: any[]; buffers: any[]; extraNodes: any[]; connections: any[]; products?: ProductRef[] }) {
    this.modelProducts = model.products ?? [];
    this.nodePositions.clear();
    this.nameToId.clear();
    this.nodeTypes.clear();
    this.edgeIncoming.clear();
    this.edgeOutgoing.clear();

    for (const s of model.stations) {
      this.nodePositions.set(s.id, new THREE.Vector3(s.position.x * SCALE, PRODUCT_Y, s.position.y * SCALE));
      this.nameToId.set(s.name, s.id);
      this.nodeTypes.set(s.id, s.type || 'station');
    }
    for (const b of model.buffers) {
      this.nodePositions.set(b.id, new THREE.Vector3(b.position.x * SCALE, PRODUCT_Y, b.position.y * SCALE));
      this.nameToId.set(b.name, b.id);
      this.nodeTypes.set(b.id, b.type || 'buffer');
    }
    for (const e of model.extraNodes) {
      this.nodePositions.set(e.id, new THREE.Vector3(e.position.x * SCALE, PRODUCT_Y, e.position.y * SCALE));
      this.nameToId.set(e.data?.name || e.type, e.id);
      this.nodeTypes.set(e.id, e.type || 'extra');
    }
    for (const c of model.connections) {
      if (!this.edgeIncoming.has(c.target)) this.edgeIncoming.set(c.target, []);
      this.edgeIncoming.get(c.target)!.push(c.source);
      if (!this.edgeOutgoing.has(c.source)) this.edgeOutgoing.set(c.source, []);
      this.edgeOutgoing.get(c.source)!.push(c.target);
    }
  }

  /** Sync product animation positions with spread-adjusted 3D coordinates */
  syncPositions(positions: Map<string, { x: number; z: number }>) {
    for (const [id, pos] of positions) {
      const existing = this.nodePositions.get(id);
      if (existing) {
        existing.x = pos.x;
        existing.z = pos.z;
      }
    }
  }

  private getColor(productType: string): number {
    // Same palette and order as the replay legend (utils/productColors)
    return productColorNum(productType, this.modelProducts);
  }

  /** Helper: create mesh, position it, add to group */
  private static _m(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, name?: string): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx, ry, rz);
    if (name) m.name = name;
    g.add(m);
    return m;
  }

  /** Build operator figure carrying a product — based on the proven Operator.ts model */
  private buildOperatorTransport(color: number): THREE.Group {
    const g = new THREE.Group();
    const add = SimulationAnimator._m;

    const skin  = M.skin;
    const fab   = M.fabric;
    const boot  = M.rubber;
    const vest  = M.vest;
    const refl  = M.chrome;
    const glass = M.darkChrome;
    const hat   = M.safety;

    // Boots
    add(g, new THREE.BoxGeometry(0.07, 0.05, 0.10), boot, -0.06, 0.025, 0.01);
    add(g, new THREE.BoxGeometry(0.07, 0.05, 0.10), boot, 0.06, 0.025, 0.01);

    // Legs (named for walk animation)
    add(g, new THREE.CylinderGeometry(0.035, 0.032, 0.30, 8), fab, -0.06, 0.20, 0, 0, 0, 0, 'legL');
    add(g, new THREE.CylinderGeometry(0.035, 0.032, 0.30, 8), fab, 0.06, 0.20, 0, 0, 0, 0, 'legR');

    // Tool belt
    add(g, new THREE.BoxGeometry(0.20, 0.03, 0.10), boot, 0, 0.37, 0);

    // Torso
    add(g, new THREE.BoxGeometry(0.18, 0.26, 0.10), fab, 0, 0.52, 0);

    // Safety vest panels (front, back, sides)
    add(g, new THREE.BoxGeometry(0.19, 0.24, 0.005), vest, 0, 0.53, 0.053);
    add(g, new THREE.BoxGeometry(0.19, 0.24, 0.005), vest, 0, 0.53, -0.053);
    add(g, new THREE.BoxGeometry(0.005, 0.24, 0.10), vest, -0.095, 0.53, 0);
    add(g, new THREE.BoxGeometry(0.005, 0.24, 0.10), vest, 0.095, 0.53, 0);

    // Reflective strips on vest
    add(g, new THREE.BoxGeometry(0.18, 0.012, 0.006), refl, 0, 0.47, 0.056);
    add(g, new THREE.BoxGeometry(0.18, 0.012, 0.006), refl, 0, 0.58, 0.056);

    // Shoulders
    add(g, new THREE.BoxGeometry(0.24, 0.04, 0.10), fab, 0, 0.67, 0);

    // Arms angled forward to carry product
    add(g, new THREE.CylinderGeometry(0.028, 0.025, 0.18, 8), fab, -0.14, 0.57, 0.04, 0.4);
    add(g, new THREE.CylinderGeometry(0.025, 0.022, 0.16, 8), skin, -0.14, 0.44, 0.14, 0.8);
    add(g, new THREE.CylinderGeometry(0.028, 0.025, 0.18, 8), fab, 0.14, 0.57, 0.04, 0.4);
    add(g, new THREE.CylinderGeometry(0.025, 0.022, 0.16, 8), skin, 0.14, 0.44, 0.14, 0.8);
    // Hands
    add(g, new THREE.BoxGeometry(0.03, 0.04, 0.025), skin, -0.14, 0.37, 0.22);
    add(g, new THREE.BoxGeometry(0.03, 0.04, 0.025), skin, 0.14, 0.37, 0.22);

    // Neck
    add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), skin, 0, 0.71, 0);

    // Head
    add(g, new THREE.SphereGeometry(0.065, 12, 12), skin, 0, 0.79, 0);
    // Ears
    add(g, new THREE.SphereGeometry(0.015, 6, 6), skin, -0.065, 0.78, 0);
    add(g, new THREE.SphereGeometry(0.015, 6, 6), skin, 0.065, 0.78, 0);

    // Safety glasses
    add(g, new THREE.BoxGeometry(0.09, 0.018, 0.015), glass, 0, 0.80, 0.06);

    // Hard hat
    add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16), hat, 0, 0.85, 0);
    add(g, new THREE.CylinderGeometry(0.075, 0.08, 0.05, 16), hat, 0, 0.88, 0);
    add(g, new THREE.CylinderGeometry(0.04, 0.075, 0.03, 16), hat, 0, 0.92, 0);

    // Product box held in hands
    const productMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
    add(g, new THREE.BoxGeometry(0.14, 0.10, 0.10), productMat, 0, 0.38, 0.22, 0, 0, 0, 'product');

    return g;
  }

  /** Build a forklift carrying a pallet with product boxes */
  private buildForkliftTransport(color: number): THREE.Group {
    const g = new THREE.Group();
    const add = SimulationAnimator._m;

    const body = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.3 });
    const whl = M.rubber;
    const chr = M.chrome;
    const pal = M.pallet;

    // Wheels (4)
    for (const [wx, wz] of [[-0.15, -0.12], [0.15, -0.12], [-0.12, 0.18], [0.12, 0.18]] as [number, number][]) {
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), whl, wx, 0.06, wz, 0, 0, Math.PI / 2);
    }
    // Body/chassis
    add(g, new THREE.BoxGeometry(0.32, 0.14, 0.36), body, 0, 0.18, 0);
    // Counterweight
    add(g, new THREE.BoxGeometry(0.28, 0.18, 0.10), body, 0, 0.24, -0.18);
    // Mast uprights
    add(g, new THREE.BoxGeometry(0.03, 0.55, 0.03), chr, -0.11, 0.45, 0.20);
    add(g, new THREE.BoxGeometry(0.03, 0.55, 0.03), chr, 0.11, 0.45, 0.20);
    // Mast crossbar
    add(g, new THREE.BoxGeometry(0.25, 0.03, 0.03), chr, 0, 0.65, 0.20);
    // Forks
    add(g, new THREE.BoxGeometry(0.05, 0.025, 0.30), chr, -0.07, 0.18, 0.33);
    add(g, new THREE.BoxGeometry(0.05, 0.025, 0.30), chr, 0.07, 0.18, 0.33);
    // Overhead guard
    add(g, new THREE.BoxGeometry(0.34, 0.015, 0.30), body, 0, 0.72, 0);
    // Guard posts
    for (const [px, pz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]] as [number, number][]) {
      add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.40, 6), body, px, 0.53, pz);
    }
    // Seat
    add(g, new THREE.BoxGeometry(0.14, 0.06, 0.12), M.rubber, 0, 0.30, -0.04);
    add(g, new THREE.BoxGeometry(0.14, 0.14, 0.02), M.rubber, 0, 0.38, -0.10);
    // Steering wheel + column
    add(g, new THREE.TorusGeometry(0.04, 0.008, 8, 16), M.darkChrome, 0, 0.42, 0.06, -0.4);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.10, 6), M.darkChrome, 0, 0.38, 0.04, -0.4);

    // Seated operator
    add(g, new THREE.BoxGeometry(0.06, 0.06, 0.14), M.fabric, -0.04, 0.33, 0.03);
    add(g, new THREE.BoxGeometry(0.06, 0.06, 0.14), M.fabric, 0.04, 0.33, 0.03);
    add(g, new THREE.BoxGeometry(0.12, 0.16, 0.08), M.vest, 0, 0.45, -0.05);
    add(g, new THREE.SphereGeometry(0.05, 10, 10), M.skin, 0, 0.58, -0.05);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), M.safety, 0, 0.62, -0.05);
    add(g, new THREE.CylinderGeometry(0.05, 0.055, 0.04, 12), M.safety, 0, 0.65, -0.05);

    // Pallet on forks — boards
    for (let i = 0; i < 3; i++) {
      add(g, new THREE.BoxGeometry(0.06, 0.015, 0.22), pal, -0.07 + i * 0.07, 0.20, 0.35);
    }
    // Pallet stringers
    add(g, new THREE.BoxGeometry(0.20, 0.04, 0.04), pal, 0, 0.22, 0.28);
    add(g, new THREE.BoxGeometry(0.20, 0.04, 0.04), pal, 0, 0.22, 0.42);

    // Boxes on pallet
    const pm = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
    for (const [bx, bz] of [[-0.05, 0.30], [0.05, 0.30], [-0.05, 0.40], [0.05, 0.40]] as [number, number][]) {
      add(g, new THREE.BoxGeometry(0.08, 0.07, 0.08), pm, bx, 0.28, bz);
    }
    add(g, new THREE.BoxGeometry(0.08, 0.07, 0.08), pm, -0.03, 0.35, 0.35);
    add(g, new THREE.BoxGeometry(0.08, 0.07, 0.08), pm, 0.03, 0.35, 0.35);

    // Scale up — forklifts should be significantly larger than operators
    g.scale.setScalar(2.2);

    return g;
  }

  /** Build an AGV transport — low-profile robot carrying a product */
  private buildAGVTransport(color: number): THREE.Group {
    const g = new THREE.Group();
    const add = SimulationAnimator._m;

    const agvBody = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.4, metalness: 0.5 });
    const agvAccent = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.3, metalness: 0.3, emissive: 0x003366, emissiveIntensity: 0.4 });
    const ledGlow = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.3, metalness: 0, emissive: 0x0088ff, emissiveIntensity: 1.0 });
    const bumper = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.7, metalness: 0 });

    // Chassis
    add(g, new THREE.BoxGeometry(0.50, 0.06, 0.36), agvBody, 0, 0.08, 0);
    // Top plate
    add(g, new THREE.BoxGeometry(0.46, 0.015, 0.32), M.darkChrome, 0, 0.12, 0);
    // Bumper strips
    add(g, new THREE.BoxGeometry(0.52, 0.025, 0.015), bumper, 0, 0.07, 0.19);
    add(g, new THREE.BoxGeometry(0.52, 0.025, 0.015), bumper, 0, 0.07, -0.19);
    // Wheels (4)
    for (const [wx, wz] of [[-0.22, 0.12], [0.22, 0.12], [-0.22, -0.12], [0.22, -0.12]] as [number, number][]) {
      add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.025, 10), M.rubber, wx, 0.04, wz, 0, 0, Math.PI / 2);
    }
    // LiDAR dome
    add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), M.bodyDark, 0, 0.14, 0);
    add(g, new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.7 }), 0, 0.16, 0);
    add(g, new THREE.CylinderGeometry(0.038, 0.038, 0.006, 12), agvAccent, 0, 0.15, 0);
    // Front sensors
    add(g, new THREE.SphereGeometry(0.01, 8, 8), new THREE.MeshStandardMaterial({ color: 0x00ff66, roughness: 0.3, metalness: 0.1, emissive: 0x00ff44, emissiveIntensity: 1.5 }), -0.10, 0.07, 0.19);
    add(g, new THREE.SphereGeometry(0.01, 8, 8), new THREE.MeshStandardMaterial({ color: 0x00ff66, roughness: 0.3, metalness: 0.1, emissive: 0x00ff44, emissiveIntensity: 1.5 }), 0.10, 0.07, 0.19);
    // LED strips (sides)
    add(g, new THREE.BoxGeometry(0.42, 0.006, 0.008), ledGlow, 0, 0.11, 0.17);
    add(g, new THREE.BoxGeometry(0.42, 0.006, 0.008), ledGlow, 0, 0.11, -0.17);
    // Product on top
    const pm = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
    add(g, new THREE.BoxGeometry(0.14, 0.10, 0.10), pm, 0, 0.18, 0, 0, 0, 0, 'product');

    // Name wheels for rotation animation
    const wheelFL = g.children.find((_, i) => i === 4) as THREE.Mesh;
    if (wheelFL) wheelFL.name = 'agvWheel';

    g.scale.setScalar(1.8);
    return g;
  }

  /** Build humanoid transport — robot figure carrying a product */
  private buildHumanoidTransport(color: number): THREE.Group {
    const g = new THREE.Group();
    const add = SimulationAnimator._m;

    const body = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.3, metalness: 0.5 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.7 });
    const led = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.3, metalness: 0, emissive: 0x0066ff, emissiveIntensity: 1.2 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x112244, roughness: 0.1, metalness: 0.8, emissive: 0x0044aa, emissiveIntensity: 0.6 });

    // Feet
    add(g, new THREE.BoxGeometry(0.07, 0.03, 0.12), joint, -0.06, 0.015, 0.01);
    add(g, new THREE.BoxGeometry(0.07, 0.03, 0.12), joint, 0.06, 0.015, 0.01);
    // Legs (named for walk animation)
    add(g, new THREE.CylinderGeometry(0.032, 0.028, 0.30, 8), body, -0.06, 0.20, 0, 0, 0, 0, 'legL');
    add(g, new THREE.CylinderGeometry(0.032, 0.028, 0.30, 8), body, 0.06, 0.20, 0, 0, 0, 0, 'legR');
    // Knee LEDs
    add(g, new THREE.CylinderGeometry(0.034, 0.034, 0.006, 8), led, -0.06, 0.24, 0);
    add(g, new THREE.CylinderGeometry(0.034, 0.034, 0.006, 8), led, 0.06, 0.24, 0);
    // Hip
    add(g, new THREE.BoxGeometry(0.20, 0.05, 0.08), body, 0, 0.38, 0);
    // Torso
    add(g, new THREE.BoxGeometry(0.18, 0.22, 0.09), body, 0, 0.52, 0);
    // Chest LED
    add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.008, 10), led, 0, 0.55, 0.05);
    // Shoulders
    add(g, new THREE.BoxGeometry(0.22, 0.035, 0.09), body, 0, 0.65, 0);
    // Arms angled forward to carry
    add(g, new THREE.CylinderGeometry(0.025, 0.022, 0.16, 8), body, -0.13, 0.56, 0.03, 0.35);
    add(g, new THREE.BoxGeometry(0.04, 0.12, 0.04), body, -0.13, 0.44, 0.12, 0.6);
    add(g, new THREE.CylinderGeometry(0.025, 0.022, 0.16, 8), body, 0.13, 0.56, 0.03, 0.35);
    add(g, new THREE.BoxGeometry(0.04, 0.12, 0.04), body, 0.13, 0.44, 0.12, 0.6);
    // Hands
    add(g, new THREE.BoxGeometry(0.03, 0.04, 0.025), joint, -0.13, 0.37, 0.20);
    add(g, new THREE.BoxGeometry(0.03, 0.04, 0.025), joint, 0.13, 0.37, 0.20);
    // Neck
    add(g, new THREE.CylinderGeometry(0.025, 0.03, 0.04, 8), joint, 0, 0.69, 0);
    // Head
    add(g, new THREE.BoxGeometry(0.10, 0.09, 0.09), body, 0, 0.76, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), body, 0, 0.82, 0);
    // Visor
    add(g, new THREE.BoxGeometry(0.09, 0.025, 0.008), visorMat, 0, 0.76, 0.048);
    // Ear sensors
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6), led, -0.06, 0.76, 0);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6), led, 0.06, 0.76, 0);
    // Backpack
    add(g, new THREE.BoxGeometry(0.14, 0.10, 0.035), joint, 0, 0.56, -0.065);

    // Product held in hands
    const pm = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
    add(g, new THREE.BoxGeometry(0.14, 0.10, 0.10), pm, 0, 0.38, 0.20, 0, 0, 0, 'product');

    return g;
  }

  /** Build Manhattan (L-shaped) waypoints: move along X first, then Z */
  private buildManhattanPath(src: THREE.Vector3, tgt: THREE.Vector3): THREE.Vector3[] {
    const start = new THREE.Vector3(src.x, 0, src.z);
    const end = new THREE.Vector3(tgt.x, 0, tgt.z);
    const dx = Math.abs(end.x - start.x);
    const dz = Math.abs(end.z - start.z);

    // If nearly aligned on one axis, go straight
    if (dx < 0.1 || dz < 0.1) return [start, end];

    // L-shaped: go along X first, then Z
    const corner = new THREE.Vector3(end.x, 0, start.z);
    return [start, corner, end];
  }

  /** Compute total length of a waypoint path */
  private pathLength(waypoints: THREE.Vector3[]): number {
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      total += waypoints[i - 1].distanceTo(waypoints[i]);
    }
    return total;
  }

  /** Get position and facing direction at progress t along waypoint path */
  private samplePath(waypoints: THREE.Vector3[], totalDist: number, t: number): { pos: THREE.Vector3; angle: number } {
    const d = t * totalDist;
    let traveled = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const segLen = waypoints[i - 1].distanceTo(waypoints[i]);
      if (traveled + segLen >= d || i === waypoints.length - 1) {
        const segT = segLen > 0 ? Math.min(1, (d - traveled) / segLen) : 0;
        const pos = new THREE.Vector3().lerpVectors(waypoints[i - 1], waypoints[i], segT);
        const dx = waypoints[i].x - waypoints[i - 1].x;
        const dz = waypoints[i].z - waypoints[i - 1].z;
        const angle = Math.atan2(dx, dz);
        return { pos, angle };
      }
      traveled += segLen;
    }
    const last = waypoints[waypoints.length - 1];
    return { pos: last.clone(), angle: 0 };
  }

  /** Get edge offset distance for a node type (how far from center to stop).
   *  Based on actual 3D model footprints — must clear the geometry. */
  private getNodeEdgeOffset(nodeId: string): number {
    const t = this.nodeTypes.get(nodeId) || '';
    switch (t) {
      case 'station': case 'inspection': case 'assembly':
      case 'disassembly': case 'palletize': case 'depalletize':
        return 0.90;              // ~1.6w × 1.2d machines
      case 'buffer': case 'matchbuffer':
        return 0.90;              // 1.6w × 0.6d racks — same width as stations
      case 'conveyor': case 'palletconveyor':
        return 0.75;              // ~1.4w long
      case 'source':
        return 0.55;              // smaller generator units
      case 'sink':
        return 0.70;              // collection bins
      case 'merge': case 'splitter':
        return 0.70;              // medium junction boxes
      default:
        return 0.75;
    }
  }

  private spawn(sourceId: string, targetId: string, productType: string, processingAt?: string, processDuration?: number, srcPosOverride?: THREE.Vector3): AnimProduct | null {
    const src = srcPosOverride || this.nodePositions.get(sourceId);
    const tgt = this.nodePositions.get(targetId);
    if (!src || !tgt || this.products.length >= MAX_PRODUCTS) return null;

    const route = this.conveyorRoutes.get(`${sourceId}->${targetId}`);
    if (route && this.getTransportType(sourceId, targetId) === 'operator') {
      return this.spawnOnConveyor(route, productType, processingAt, processDuration);
    }

    const isPallet = this.isEdgePalletized(sourceId, targetId);

    // Enforce user-configurable limits from store
    const { maxOperators, maxForklifts } = useLiveSimulationStore.getState();
    const currentOperators = this.products.filter(p => p.alive && !p.isPallet).length;
    const currentForklifts = this.products.filter(p => p.alive && p.isPallet).length;
    if (isPallet && currentForklifts >= maxForklifts) return null;
    if (!isPallet && currentOperators >= maxOperators) return null;

    let effectiveSrc = src;
    let effectiveTgt = tgt;
    let stationCenter: THREE.Vector3 | undefined;
    let approachDir: THREE.Vector3 | undefined;
    let idleWaypoints: THREE.Vector3[] | undefined;
    let idleTotalDist: number | undefined;

    // For non-pallet spawns, offset BOTH source and target to node edges
    // so operators never walk through any equipment
    // Offset both source and target to node edges — applies to operators AND forklifts
    {
      const rawDir = new THREE.Vector3().subVectors(tgt, src);
      rawDir.y = 0;
      const dist = rawDir.length();
      if (dist > 0.01) {
        const dir = rawDir.clone().normalize();
        // Forklifts need a larger clearance than operators
        const clearanceMult = isPallet ? 1.3 : 1.0;

        // Offset source (start from edge of source node)
        if (!srcPosOverride) {
          const srcOffset = this.getNodeEdgeOffset(sourceId) * clearanceMult;
          if (srcOffset < dist * 0.4) {
            effectiveSrc = src.clone().add(dir.clone().multiplyScalar(srcOffset));
            effectiveSrc.y = 0;
          }
        }

        // Offset target (stop at edge of target node)
        const tgtOffset = this.getNodeEdgeOffset(targetId) * clearanceMult;
        if (tgtOffset < dist * 0.4) {
          effectiveTgt = tgt.clone().sub(dir.clone().multiplyScalar(tgtOffset));
          effectiveTgt.y = 0;
        }

        // Compute idle walk path (KPI screen for operators, parking for forklifts)
        if (processingAt) {
          stationCenter = tgt.clone();
          approachDir = dir.clone();
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);
          const idleDist = isPallet ? IDLE_OFFSET * 1.5 : IDLE_OFFSET; // forklifts park farther
          const idlePos = effectiveTgt.clone().add(perp.clone().multiplyScalar(idleDist));
          idleWaypoints = [effectiveTgt.clone(), idlePos];
          idleTotalDist = idleDist;
        }
      }
    }

    const waypoints = this.buildManhattanPath(effectiveSrc, effectiveTgt);
    const totalDist = this.pathLength(waypoints);
    if (totalDist < 0.01) return null;

    const color = this.getColor(productType);

    const transportType = this.getTransportType(sourceId, targetId);
    let group: THREE.Group;
    switch (transportType) {
      case 'agv':
        group = this.buildAGVTransport(color);
        break;
      case 'forklift':
        group = this.buildForkliftTransport(color);
        break;
      case 'humanoid':
        group = this.buildHumanoidTransport(color);
        break;
      default:
        group = this.buildOperatorTransport(color);
        break;
    }

    group.position.copy(waypoints[0]);

    // Face initial direction
    if (waypoints.length > 1) {
      const dx = waypoints[1].x - waypoints[0].x;
      const dz = waypoints[1].z - waypoints[0].z;
      group.rotation.y = Math.atan2(dx, dz);
    }

    this.scene.add(group);

    const p: AnimProduct = {
      mesh: group, waypoints, totalDist, progress: 0,
      speed: TRAVEL_SPEED / totalDist, alive: true,
      processingAt: processingAt || null, processDuration: processDuration || 0,
      isPallet,
      phase: 'travel', phaseTimer: 0,
      idleWaypoints, idleTotalDist,
      stationCenter, approachDir,
    };
    this.products.push(p);
    return p;
  }

  processEvents(events: any[], stationProducts: Record<string, any>) {
    for (const evt of events) {
      const evtKey = `${evt.type}-${evt.entity_id}-${evt.time}`;
      if (this.processedEvents.has(evtKey)) continue;
      this.processedEvents.add(evtKey);
      if (this.processedEvents.size > 500) {
        const arr = [...this.processedEvents];
        this.processedEvents = new Set(arr.slice(-250));
      }

      // entity_id could be a station name — resolve to node ID
      const entityId = this.nameToId.get(evt.entity_id) || evt.entity_id;
      const d = evt.details || {};

      if (evt.type === 'processing_start') {
        const sources = this.edgeIncoming.get(entityId);
        if (sources?.length) {
          const productType = (d.product_type || d.productType || 'default') as string;
          const cycleTime = (d.cycle_time || d.cycleTime || 2) as number;
          this.spawn(sources[0], entityId, productType, entityId, cycleTime);
        }
      } else if (evt.type === 'processing_complete') {
        const targets = this.edgeOutgoing.get(entityId);
        if (targets?.length) {
          const productType = stationProducts[evt.entity_id]?.productType || 'default';
          // Spawn from station door (front), not center — operator exits with product
          const stationPos = this.nodePositions.get(entityId);
          const tgtPos = this.nodePositions.get(targets[0]);
          let srcOverride: THREE.Vector3 | undefined;
          if (stationPos && tgtPos) {
            const dir = new THREE.Vector3().subVectors(tgtPos, stationPos);
            dir.y = 0;
            if (dir.length() > 0.01) {
              dir.normalize();
              srcOverride = stationPos.clone().add(dir.multiplyScalar(DOOR_OFFSET));
              srcOverride.y = 0;
            }
          }
          this.spawn(entityId, targets[0], productType, undefined, undefined, srcOverride);
        }
      } else if (evt.type === 'source_generate') {
        const targets = this.edgeOutgoing.get(entityId);
        if (targets?.length) {
          const productType = (d.product_type || d.productType || 'default') as string;
          this.spawn(entityId, targets[0], productType);
        }
      }
    }
  }

  processAmbientFlow(edgeFlowCounts: Record<string, number>) {
    for (const [edgeKey, count] of Object.entries(edgeFlowCounts)) {
      if (count <= 0 || Math.random() > Math.min(0.3, count * 0.01)) continue;
      const [srcName, tgtName] = edgeKey.split('->');
      const srcId = this.nameToId.get(srcName) || srcName;
      const tgtId = this.nameToId.get(tgtName) || tgtName;
      const p = this.spawn(srcId, tgtId, 'ambient');
      if (p) p.speed *= 0.8 + Math.random() * 0.4;
    }
  }

  /** Animate walking (leg swing) for operator meshes */
  private animateWalk(p: AnimProduct, elapsed: number, progressVal: number) {
    // Walk animation for operators and humanoids (leg swing)
    const legL = p.mesh.getObjectByName('legL') as THREE.Mesh;
    const legR = p.mesh.getObjectByName('legR') as THREE.Mesh;
    if (legL && legR) {
      const swing = Math.sin(elapsed * 10 + progressVal * 20) * 0.35;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
    }
  }

  /** Stop legs in neutral position */
  private stopLegs(p: AnimProduct) {
    const legL = p.mesh.getObjectByName('legL') as THREE.Mesh;
    const legR = p.mesh.getObjectByName('legR') as THREE.Mesh;
    if (legL) legL.rotation.x = 0;
    if (legR) legR.rotation.x = 0;
  }

  /** Create a sliding door panel at station face for loading animation */
  private createDoorAnimation(p: AnimProduct) {
    if (!p.stationCenter || !p.approachDir) return;
    const doorGeo = new THREE.BoxGeometry(0.8, 0.9, 0.04);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff, transparent: true, opacity: 0.6,
      roughness: 0.1, metalness: 0.3,
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    // Position between operator stop and station center
    const doorPos = p.stationCenter.clone().sub(
      p.approachDir.clone().multiplyScalar(DOOR_OFFSET * 0.6)
    );
    door.position.copy(doorPos);
    door.position.y = 0.5;
    door.rotation.y = Math.atan2(p.approachDir.x, p.approachDir.z);
    // Store slide direction (perpendicular to approach)
    const slideDir = new THREE.Vector3(-p.approachDir.z, 0, p.approachDir.x);
    door.userData.basePos = doorPos.clone();
    door.userData.slideDir = slideDir;
    this.scene.add(door);
    p.doorMesh = door;
  }

  /** Build a small KPI display stand placed in front of the operator's idle position */
  private createKPIScreen(p: AnimProduct) {
    if (!p.idleWaypoints || !p.stationCenter) return;
    const operatorPos = p.idleWaypoints[p.idleWaypoints.length - 1];

    // Place screen 0.5 units in front of operator (toward station)
    const toStation = new THREE.Vector3().subVectors(p.stationCenter, operatorPos);
    toStation.y = 0;
    if (toStation.length() > 0.01) toStation.normalize();
    const screenPos = operatorPos.clone().add(toStation.clone().multiplyScalar(0.5));

    const g = new THREE.Group();
    const add = SimulationAnimator._m;
    // Post/stand
    add(g, new THREE.CylinderGeometry(0.02, 0.025, 1.2, 8), M.chrome, 0, 0.6, 0);
    // Base plate
    add(g, new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12), M.darkChrome, 0, 0.015, 0);
    // Screen housing
    add(g, new THREE.BoxGeometry(0.5, 0.35, 0.03), M.bodyDark, 0, 1.1, 0);
    // Screen display (glowing)
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a, emissive: 0x0066cc, emissiveIntensity: 0.4, roughness: 0.2,
    });
    add(g, new THREE.BoxGeometry(0.44, 0.29, 0.005), screenMat, 0, 1.1, 0.018);
    // KPI indicator bars (3 colored bars)
    const barColors = [0x22c55e, 0xf59e0b, 0x3b82f6];
    for (let i = 0; i < 3; i++) {
      const barMat = new THREE.MeshStandardMaterial({
        color: barColors[i], emissive: barColors[i], emissiveIntensity: 0.6,
      });
      const w = 0.06 + (i === 0 ? 0.12 : i === 1 ? 0.08 : 0.10);
      add(g, new THREE.BoxGeometry(w, 0.04, 0.006), barMat, -0.1 + i * 0.14, 1.08 + (i - 1) * 0.07, 0.019);
    }
    g.position.copy(screenPos);
    g.position.y = 0;
    // Face the screen toward the operator (away from station)
    const dx = operatorPos.x - screenPos.x;
    const dz = operatorPos.z - screenPos.z;
    g.rotation.y = Math.atan2(dx, dz);
    this.scene.add(g);
    p.kpiScreen = g;
  }

  /** Dispose a THREE group and all its children */
  private disposeGroup(group: THREE.Group | THREE.Mesh) {
    this.scene.remove(group);
    group.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
        const m = (child as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach(mat => mat.dispose());
        else (m as THREE.Material).dispose();
      }
    });
  }

  update(dt: number, elapsed: number) {
    const toRemove: number[] = [];
    this.products.forEach((p, i) => {
      if (!p.alive) { toRemove.push(i); return; }

      switch (p.phase) {
        case 'travel': {
          p.progress += p.speed * dt;

          if (p.progress >= 1 && p.onConveyor) {
            p.alive = false; // carton enters the machine
            return;
          }
          if (p.progress >= 1) {
            // Arrived at destination
            const lastWp = p.waypoints[p.waypoints.length - 1];
            p.mesh.position.copy(lastWp);

            if (p.processingAt && p.processDuration > 0) {
              // Arrived at station/equipment for processing → loading phase
              p.phase = 'loading';
              p.phaseTimer = LOADING_TIME;
              this.stopLegs(p);
              if (!p.isPallet) this.createDoorAnimation(p);
            } else {
              // Non-processing target (buffer, sink, etc.) — deposit then go to idle spot
              p.phase = 'depositing';
              p.phaseTimer = DEPOSIT_TIME;
              p.processDuration = Math.max(p.processDuration, 5.0); // stay visible at idle spot
              this.stopLegs(p);
              // Compute idle path: perpendicular to travel direction
              const wp = p.waypoints;
              const lastSeg = new THREE.Vector3().subVectors(wp[wp.length - 1], wp[Math.max(0, wp.length - 2)]);
              lastSeg.y = 0;
              if (lastSeg.length() > 0.01) {
                lastSeg.normalize();
                const perp = new THREE.Vector3(-lastSeg.z, 0, lastSeg.x);
                const idleDist = p.isPallet ? IDLE_OFFSET * 1.5 : IDLE_OFFSET;
                const idlePos = lastWp.clone().add(perp.clone().multiplyScalar(idleDist));
                p.idleWaypoints = [lastWp.clone(), idlePos];
                p.idleTotalDist = idleDist;
                p.stationCenter = lastWp.clone();
                p.approachDir = lastSeg.clone();
              }
            }
            return;
          }

          // Follow Manhattan waypoint path
          const { pos, angle } = this.samplePath(p.waypoints, p.totalDist, p.progress);
          p.mesh.position.copy(pos);
          p.mesh.rotation.y = angle;
          this.animateWalk(p, elapsed, p.progress);
          break;
        }

        case 'loading': {
          p.phaseTimer -= dt;
          const t = 1 - (p.phaseTimer / LOADING_TIME); // 0→1

          // Animate door sliding open then closed
          if (p.doorMesh) {
            const basePos = p.doorMesh.userData.basePos as THREE.Vector3;
            const slideDir = p.doorMesh.userData.slideDir as THREE.Vector3;
            const doorMat = p.doorMesh.material as THREE.MeshStandardMaterial;

            if (t < 0.5) {
              // Door slides open
              const openT = t * 2;
              p.doorMesh.position.copy(basePos).add(slideDir.clone().multiplyScalar(openT * 0.6));
              p.doorMesh.position.y = 0.5;
              doorMat.opacity = 0.6 - openT * 0.2;
            } else {
              // Door slides closed
              const closeT = (t - 0.5) * 2;
              p.doorMesh.position.copy(basePos).add(slideDir.clone().multiplyScalar((1 - closeT) * 0.6));
              p.doorMesh.position.y = 0.5;
              doorMat.opacity = 0.4 + closeT * 0.2;
            }
          }

          // Hide product at 40% through loading
          if (t >= 0.4) {
            const product = p.mesh.getObjectByName('product');
            if (product) product.visible = false;
            // For forklifts, hide pallet cargo
            if (p.isPallet) {
              p.mesh.children.forEach(child => {
                if (child.position.y > 0.2 && child.position.z > 0.2) {
                  child.visible = false;
                }
              });
            }
          }

          if (p.phaseTimer <= 0) {
            // Clean up door mesh
            if (p.doorMesh) {
              this.disposeGroup(p.doorMesh);
              p.doorMesh = undefined;
            }
            // Transition: drive/walk to idle spot
            if (p.idleWaypoints && p.idleTotalDist && p.idleTotalDist > 0.01) {
              p.phase = 'idle_walk';
              p.idleProgress = 0;
              if (!p.isPallet) this.createKPIScreen(p); // operators get KPI screen, forklifts just park
            } else {
              p.phase = 'waiting';
            }
          }
          break;
        }

        case 'idle_walk': {
          if (!p.idleWaypoints || !p.idleTotalDist) { p.phase = 'waiting'; return; }
          p.idleProgress = (p.idleProgress || 0) + (TRAVEL_SPEED / p.idleTotalDist) * dt;

          if (p.idleProgress >= 1) {
            // Arrived at idle spot (KPI screen)
            const idleDest = p.idleWaypoints[p.idleWaypoints.length - 1];
            p.mesh.position.copy(idleDest);
            p.phase = 'waiting';
            this.stopLegs(p);
            // Face back toward station / KPI screen
            if (p.stationCenter) {
              const dx = p.stationCenter.x - idleDest.x;
              const dz = p.stationCenter.z - idleDest.z;
              p.mesh.rotation.y = Math.atan2(dx, dz);
            }
            return;
          }

          const { pos, angle } = this.samplePath(p.idleWaypoints, p.idleTotalDist, p.idleProgress);
          p.mesh.position.copy(pos);
          p.mesh.rotation.y = angle;
          this.animateWalk(p, elapsed, p.idleProgress);
          break;
        }

        case 'waiting': {
          p.processDuration -= dt;
          // Gentle fade-out during last 1.5 seconds instead of abrupt vanish
          if (p.processDuration < 1.5 && p.processDuration > 0) {
            const fade = p.processDuration / 1.5;
            p.mesh.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
                m.opacity = fade;
              }
            });
            // Also fade KPI screen
            if (p.kpiScreen) {
              p.kpiScreen.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                  const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                  if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
                  m.opacity = fade;
                }
              });
            }
          }
          if (p.processDuration <= 0) {
            p.alive = false;
          }
          break;
        }

        case 'depositing': {
          p.phaseTimer -= dt;
          const t = 1 - (p.phaseTimer / DEPOSIT_TIME); // 0→1

          if (p.isPallet) {
            // Forklift: lower forks animation (tilt down slightly)
            if (t < 0.5) {
              p.mesh.rotation.x = t * 0.15; // tilt forks down
            } else {
              p.mesh.rotation.x = (1 - t) * 0.15; // level back
            }
          } else {
            // Operator: bend forward to place product
            if (t < 0.5) {
              p.mesh.rotation.x = -t * 0.3;
            } else {
              p.mesh.rotation.x = -(1 - t) * 0.3;
            }
          }

          // Hide product/pallet at midpoint
          if (t >= 0.5) {
            const product = p.mesh.getObjectByName('product');
            if (product) product.visible = false;
            // For forklifts, also hide pallet and product boxes
            if (p.isPallet) {
              p.mesh.traverse(child => {
                if (child.name === 'pallet' || child.name === 'palletProduct') {
                  child.visible = false;
                }
              });
              // Hide everything above the forks (pallet area) by position
              p.mesh.children.forEach(child => {
                if (child.position.y > 0.2 && child.position.z > 0.2) {
                  child.visible = false;
                }
              });
            }
          }

          if (p.phaseTimer <= 0) {
            p.mesh.rotation.x = 0;
            // Drive/walk to idle spot
            if (p.idleWaypoints && p.idleTotalDist && p.idleTotalDist > 0.01) {
              p.phase = 'idle_walk';
              p.idleProgress = 0;
              if (!p.isPallet) this.createKPIScreen(p);
            } else {
              p.phase = 'waiting';
            }
          }
          break;
        }
      }
    });

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const p = this.products[toRemove[i]];
      this.disposeGroup(p.mesh);
      // Clean up KPI screen
      if (p.kpiScreen) this.disposeGroup(p.kpiScreen);
      // Clean up door mesh if still present
      if (p.doorMesh) this.disposeGroup(p.doorMesh);
      this.products.splice(toRemove[i], 1);
    }
  }

  updateStationStates(stationStates: Record<string, string>, nodeGroups: Map<string, THREE.Group>) {
    for (const [name, state] of Object.entries(stationStates)) {
      const id = this.nameToId.get(name);
      if (!id) continue;
      const group = nodeGroups.get(id);
      if (!group) continue;

      // Update andon lamp stack (new detailed models)
      setStatusLampState(group, state);

      // Also update legacy statusLight sphere for backwards compat
      const statusLight = group.children.find(c => c.name === 'statusLight');
      if (statusLight && (statusLight as THREE.Mesh).isMesh) {
        const color = STATE_COLORS[state] || STATE_COLORS.idle;
        const m = (statusLight as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.color.setHex(color);
        if (m.emissive) m.emissive.setHex(color);
      }
    }
  }

  clear() {
    this.products.forEach(p => {
      this.disposeGroup(p.mesh);
      if (p.kpiScreen) this.disposeGroup(p.kpiScreen);
      if (p.doorMesh) this.disposeGroup(p.doorMesh);
    });
    this.products = [];
    this.processedEvents.clear();
  }

  dispose() {
    this.clear();
    this.partGeos.raw.dispose();
    this.partGeos.inProcess.dispose();
    this.partGeos.finished.dispose();
    this.partGeos.fallback.dispose();
  }
}

// ── Unified Node Position Lookup ───────────────────────────────────────────────

interface NodeInfo {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  libraryModelId?: string;
  data?: any;
}

const RACK_TYPES = new Set(['warehouse', 'coldstorage']);
const RACK_MODEL_IDS = new Set(['warehouse-bay', 'cold-storage', 'asrs']);
/** Warehouse elements are drawn as real pallet racks from their layout. */
function isRackNode(n: NodeInfo): boolean {
  return RACK_TYPES.has(n.type) && (!n.libraryModelId || RACK_MODEL_IDS.has(n.libraryModelId));
}
/** Changes that need the rack model rebuilt (layout or start stock). */
function rackSignature(n: NodeInfo, standalone: boolean): string {
  const skus = (n.data?.skus || []).map((s: any) => [s.initialPallets ?? 0, s.reorderPoint ?? -1]);
  return JSON.stringify([rackLayoutOf(n.data), rackEquipmentOf(n.data, standalone), skus]);
}

function collectNodes(model: { stations: any[]; buffers: any[]; extraNodes: any[] }): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  for (const s of model.stations) {
    nodes.push({ id: s.id, name: s.name, type: 'station', position: s.position, libraryModelId: s.libraryModelId });
  }
  for (const b of model.buffers) {
    nodes.push({ id: b.id, name: b.name, type: 'buffer', position: b.position, libraryModelId: b.libraryModelId });
  }
  for (const e of model.extraNodes) {
    nodes.push({ id: e.id, name: e.data?.name || e.type, type: e.type, position: e.position, libraryModelId: e.libraryModelId, data: e.data });
  }
  return nodes;
}

// ── Component ──────────────────────────────────────────────────────────────────

/** (Re)build the generated building context + optional scenery. */
function rebuildSurroundings(s: { scene: THREE.Scene; surroundings: THREE.Group | null; layoutInfo: LayoutInfo | null }, scenery: boolean) {
  if (s.surroundings) {
    s.scene.remove(s.surroundings);
    const keep = new Set<THREE.Material>([...SURROUNDINGS_SHARED_MATS, ...(Object.values(M) as THREE.Material[])]);
    s.surroundings.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mt) => { if (!keep.has(mt)) mt.dispose(); });
    });
    s.surroundings = null;
  }
  if (!s.layoutInfo) return;
  s.surroundings = buildSurroundings(s.layoutInfo, { scenery });
  s.scene.add(s.surroundings);
}

export function Factory3DView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scenery, setScenery] = useState<boolean>(() => {
    try { return localStorage.getItem('fs3d-scenery') !== 'off'; } catch { return true; }
  });
  const sceneryRef = useRef(scenery);

  // React subscriptions for model data
  const model = useModelStore(s => s.model);
  const selectedNodeId = useModelStore(s => s.selectedNodeId);
  const isSimulating = useSimulationStore(s => s.isRunning);

  // Refs for Three.js objects that persist across renders
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animFrameId: number;
    nodeGroups: Map<string, THREE.Group>;
    selectionRing: THREE.Mesh;
    connections: ConnectionGroup[];
    clock: THREE.Clock;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animator: SimulationAnimator;
    lastAmbientSpawn: number;
    bottleneckOrbit: THREE.PointLight;
    bottleneckLabel: THREE.Sprite;
    bottleneckNodeId: string;
    bottleneckMaxUtil: number;
    lastFlyToSignal: number;
    flyToTarget: THREE.Vector3 | null;
    flyToProgress: number;
    flyToStart: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
    conveyorParts: ConveyorPart[];
    surroundings: THREE.Group | null;
    layoutInfo: LayoutInfo | null;
    framed: boolean;
    lastConveyorSync: number;
    floorPaths: THREE.Group[];
    // Enhanced 3D animation systems
    postProcessing: PostProcessingPipeline | null;
    dynamicLighting: DynamicLightingManager | null;
    conveyorAnimation: ConveyorAnimationManager | null;
    vehicleAnimation: VehicleAnimationManager | null;
    operatorAnimation: OperatorAnimationManager | null;
    particleEffects: ParticleEffectManager | null;
    // Phase 2 realism enhancements
    materialEnhancer: MaterialEnhancer | null;
    reflectiveFloor: ReflectiveFloorManager | null;
    machineAnimations: MachineAnimationManager | null;
    atmosphericEffects: AtmosphericEffectsManager | null;
    robotArmAnimation: RobotArmAnimationManager | null;
    surfaceDetail: SurfaceDetailManager | null;
    // Phase 3 realism enhancements
    shadowSystem: EnhancedShadowSystem | null;
    cableSystem: CableSystemManager | null;
    timeOfDay: TimeOfDayManager | null;
    lodManager: LODManager | null;
    glassManager: GlassManager | null;
    // Phase 4 realism enhancements
    proceduralTextures: ProceduralTextureGenerator | null;
    wearWeathering: WearWeatheringManager | null;
    machineDecals: MachineDecalManager | null;
    screenDisplays: ScreenDisplayManager | null;
    materialVariation: MaterialVariationManager | null;
    anisotropicMetal: AnisotropicMetalManager | null;
  } | null>(null);

  // ── Click handler ──────────────────────────────────────────────────────────

  const handleClick = useCallback((e: MouseEvent) => {
    const s = sceneRef.current;
    if (!s || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(s.mouse, s.camera);

    // Gather all meshes in node groups
    const targets: THREE.Object3D[] = [];
    s.nodeGroups.forEach(group => group.traverse(child => {
      if ((child as THREE.Mesh).isMesh) targets.push(child);
    }));

    const hits = s.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      // Walk up to find the node group
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.nodeId) obj = obj.parent;
      if (obj?.userData.nodeId) {
        const store = useModelStore.getState();
        const clickedId = obj.userData.nodeId as string;
        store.setSelectedNode(clickedId === store.selectedNodeId ? null : clickedId);
        return;
      }
    }
    // Clicked empty space - deselect
    useModelStore.getState().setSelectedNode(null);
  }, []);

  // ── Init renderer, scene, camera, controls, lights, ground ─────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width  = container.clientWidth  || container.offsetWidth  || 800;
    const height = container.clientHeight || container.offsetHeight || 600;

    // Renderer — shadows enabled with PCFSoft for depth and realism
    // Engineering-viewport look (light gradient background, neutral tones) and
    // a frame budget a laptop iGPU can hold. Previously: PCFSoft shadows, 15+
    // dynamic lights, SSAO + bloom at devicePixelRatio 2 — which froze the
    // whole app for ~1 min on open and stalled the replay.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0); // transparent: CSS gradient shows through
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // container draws the CAE-style gradient
    scene.fog = new THREE.Fog(0xdde4ec, 45, 90);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 200);
    camera.position.set(6, 10, 6);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 50;

    // Camera bookmarks — saved viewpoints with smooth fly-to. Loads any
    // previously-persisted bookmarks from localStorage automatically.
    const cameraBookmarks = new CameraBookmarks(camera, controls);

    // Lights — factory interior
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    // Main directional light with shadow casting
    const dir = new THREE.DirectionalLight(0xffffff, 2.6);
    dir.position.set(10, 18, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 80;
    dir.shadow.bias = -0.0003;
    scene.add(dir);

    // Fill light
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.8);
    fill.position.set(-8, 14, -6);
    scene.add(fill);

    // Hemisphere — sky blue, warm ground bounce
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 0.7);
    scene.add(hemi);

    // (Ceiling spotlights removed: 6 per-fragment lights for no analytical value.)

    // Factory floor — light neutral (CAE viewport style)
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.9, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Floor grid — bright lines visible against dark floor
    const grid = new THREE.GridHelper(60, 60, 0x9aa6b4, 0xb9c3ce);
    grid.position.y = 0.003;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);

    // Yellow safety lane markings — brighter, more visible
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xe0b100, transparent: true, opacity: 0.35 });
    const laneGeo = new THREE.BoxGeometry(40, 0.004, 0.06);
    const laneH = new THREE.Mesh(laneGeo, laneMat);
    laneH.position.set(0, 0.004, 0);
    scene.add(laneH);
    const laneV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 40), laneMat);
    laneV.position.set(0, 0.004, 0);
    scene.add(laneV);

    // Selection ring
    const selectionRing = createSelectionRing();
    scene.add(selectionRing);

    const clock = new THREE.Clock();

    const animator = new SimulationAnimator(scene);

    // Bottleneck orbiting light
    const bottleneckOrbit = new THREE.PointLight(0xff8800, 0, 5);
    bottleneckOrbit.name = '_orbitLight';
    scene.add(bottleneckOrbit);
    const bottleneckLabel = createTextSprite('⚠ BOTTLENECK');
    bottleneckLabel.visible = false;
    bottleneckLabel.scale.set(0.19, 0.0475, 1);
    scene.add(bottleneckLabel);

    const state = {
      renderer,
      scene,
      camera,
      controls,
      animFrameId: 0,
      nodeGroups: new Map<string, THREE.Group>(),
      selectionRing,
      connections: [] as ConnectionGroup[],
      clock,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      animator,
      // Kinematic animator (additive; only drives nodes whose builders return rigged hierarchies).
      kinematicAnimator: new ScenarioAnimator(),
      lastKinematicSync: 0,
      // Convergence layer: features ported from 3D World — additive, opt-in.
      liveHUD: new LiveHUD(),
      cycleAnalyzer: new CycleTimeAnalyzer(),
      cameraBookmarks,
      hudVisible: false,
      lastHUDSync: 0,
      lastAmbientSpawn: 0,
      bottleneckOrbit,
      bottleneckLabel,
      bottleneckNodeId: '' as string,
      bottleneckMaxUtil: 0,
      // Camera fly-to state
      lastFlyToSignal: 0,
      flyToTarget: null as THREE.Vector3 | null,
      flyToProgress: 0,
      flyToStart: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null,
      // Conveyor parts — animated boxes on connections
      conveyorParts: [] as ConveyorPart[],
      surroundings: null,
      layoutInfo: null,
      framed: false,
      lastConveyorSync: 0,
      floorPaths: [] as THREE.Group[],
      // Enhanced animation systems (initialized below)
      postProcessing: null as PostProcessingPipeline | null,
      dynamicLighting: null as DynamicLightingManager | null,
      conveyorAnimation: null as ConveyorAnimationManager | null,
      vehicleAnimation: null as VehicleAnimationManager | null,
      operatorAnimation: null as OperatorAnimationManager | null,
      particleEffects: null as ParticleEffectManager | null,
      // Phase 2 realism enhancements
      materialEnhancer: null as MaterialEnhancer | null,
      reflectiveFloor: null as ReflectiveFloorManager | null,
      machineAnimations: null as MachineAnimationManager | null,
      atmosphericEffects: null as AtmosphericEffectsManager | null,
      robotArmAnimation: null as RobotArmAnimationManager | null,
      surfaceDetail: null as SurfaceDetailManager | null,
      // Phase 3 realism enhancements
      shadowSystem: null as EnhancedShadowSystem | null,
      cableSystem: null as CableSystemManager | null,
      timeOfDay: null as TimeOfDayManager | null,
      lodManager: null as LODManager | null,
      glassManager: null as GlassManager | null,
      // Phase 4 realism enhancements
      proceduralTextures: null as ProceduralTextureGenerator | null,
      wearWeathering: null as WearWeatheringManager | null,
      machineDecals: null as MachineDecalManager | null,
      screenDisplays: null as ScreenDisplayManager | null,
      materialVariation: null as MaterialVariationManager | null,
      anisotropicMetal: null as AnisotropicMetalManager | null,
    };
    sceneRef.current = state;

    // ── Initialize enhanced 3D systems ───────────────────────────────────────

    // Post-processing pipeline (Bloom + SSAO + Tone Mapping + Vignette + SMAA)
    // Post-processing (SSAO + bloom + SMAA) disabled: SSAO alone costs more
    // than the scene on integrated GPUs, and bloom made labels glow/blur.
    // Re-enable with: new PostProcessingPipeline(renderer, scene, camera)
    state.postProcessing = null;
    void PostProcessingPipeline;

    // Dynamic machine lighting
    // Per-machine dynamic lights disabled: one PointLight per node (shadow-casting
    // cube maps for welding/laser) multiplied the per-frame cost.
    state.dynamicLighting = null;
    void DynamicLightingManager;

    // Conveyor belt animation
    state.conveyorAnimation = new ConveyorAnimationManager();

    // Vehicle path animation (forklifts, AGVs, cranes)
    state.vehicleAnimation = new VehicleAnimationManager(scene);

    // Enhanced operator animation
    state.operatorAnimation = new OperatorAnimationManager();

    // Particle effects (sparks, steam, smoke, laser)
    state.particleEffects = new ParticleEffectManager(scene);

    // HDR environment map for realistic reflections
    try {
      const envMap = createEnvMap(renderer);
      scene.environment = envMap;
      // Apply to existing scene materials after a short delay (let nodes build first)
      setTimeout(() => {
        if (sceneRef.current) {
          applyEnvironmentMap(sceneRef.current.scene, envMap);
        }
      }, 500);
    } catch {
      console.warn('Environment map creation failed');
    }

    // ── Phase 2 realism enhancements ──────────────────────────────────────────

    // PBR Material Enhancement — normal maps, clearcoat, roughness variation
    state.materialEnhancer = null; // see note above (performance)

    // Reflective floor disabled — full-scene re-render per frame too costly for init speed
    // state.reflectiveFloor = new ReflectiveFloorManager(renderer, scene, camera);

    // Machine micro-animations (gauges, spindles, screens, doors, pistons, fans, beacons)
    state.machineAnimations = new MachineAnimationManager();

    // Atmospheric effects — disabled for performance (200 particles + light cones)
    // state.atmosphericEffects = new AtmosphericEffectsManager(scene);

    // Robot arm IK animation
    state.robotArmAnimation = new RobotArmAnimationManager();

    // Surface detail (floor wear, oil stains, wall textures, zone labels)
    state.surfaceDetail = new SurfaceDetailManager(scene);

    // ── Phase 3 & 4 realism enhancements — disabled by default for performance
    // These systems are available but not initialized unless explicitly enabled.
    // To enable, set window.__FACTORYSIM_ENHANCED_3D = true before loading.

    // ── Factory environment enhancement ──────────────────────────────────────

    // Floor material — kept in sync with creation values above
    groundMat.color.setHex(0xd5dbe2); // light neutral floor (CAE viewport look)
    groundMat.roughness = 0.9;
    groundMat.metalness = 0.0;

    // Aisles, zone markings, columns and walls are generated from the layout
    // (see shared/Surroundings.ts) whenever the model changes.

    // (Ceiling I-beams removed: they cut across the plan view.)

    // (Ceiling fixtures + 8 point lights removed for performance and a clean view.)

    // ── Apply surface detail enhancements ──────────────────────────────────
    // Floor wear/decals disabled: clean engineering view.

    // Apply PBR material enhancements to scene after a delay (nodes need to be built)
    // Delayed PBR material enhancement disabled: it swapped every material
    // 1 s after opening and forced a full shader recompile (UI stall).

    // Animation loop
    let frameCount = 0;
    function animate() {
      state.animFrameId = requestAnimationFrame(animate);
      // Hidden (e.g. replay in 2D mode keeps this view mounted): skip the frame.
      if (!container!.isConnected || container!.clientWidth === 0 || container!.clientHeight === 0) return;
      state.controls.update();
      const dt = state.clock.getDelta();
      const elapsed = state.clock.elapsedTime;
      const safeDt = dt > 0.1 ? 0.016 : dt;
      frameCount++;

      // Get live simulation state once per frame
      const liveState = useLiveSimulationStore.getState();

      // ── Label LOD — throttled to every 4 frames ───────────
      if (frameCount % 4 === 0) {
        const selectedId = useModelStore.getState().selectedNodeId;
        const hasLiveData = Object.keys(liveState.stationStates).length > 0;
        state.nodeGroups.forEach(group => {
          group.traverse(child => {
            if ((child as THREE.Sprite).isSprite) {
              const sprite = child as THREE.Sprite;
              const isStats = sprite.name === '_statsSprite';
              const distToNode = state.camera.position.distanceTo(group.position);

              if (isStats) {
                // Stats badges: always visible during simulation, fixed small size
                if (hasLiveData && sprite.userData._active) {
                  sprite.visible = true;
                  sprite.material.opacity = distToNode > 20 ? 0.4 : distToNode > 10 ? 0.7 : 1.0;
                } else {
                  sprite.visible = false;
                }
              } else {
                // Name labels: fixed size, always visible during sim but dim at distance
                // Annotation boxes stay legible (engineering view): fully
                // opaque up close, gently faded only when far away.
                let opacity = 1.0;
                if (distToNode > 30) opacity = 0.75;
                void hasLiveData;
                if (group.userData.nodeId === selectedId) opacity = 1;
                sprite.material.opacity = opacity;
                sprite.visible = opacity > 0.01;
              }
            }
          });
        });
      }

      // ── Animate spindles, machines, operators — throttled every 3 frames ─────
      if (frameCount % 3 === 0) {
        state.nodeGroups.forEach(group => {
          if (group.userData._spindle === undefined) {
            group.userData._spindle = group.getObjectByName('spindle') || null;
            group.userData._figure = group.getObjectByName('figure') || null;
            group.userData._armL = group.getObjectByName('armLeft') || null;
            group.userData._armR = group.getObjectByName('armRight') || null;
            group.userData._spindleSpeed = 0; // ramp-up tracking
          }

          const nodeName = group.userData.nodeName as string || '';
          const stationState = liveState.stationStates[nodeName] || 'idle';
          const isProcessing = stationState === 'processing';

          // Spindle: ramp up/down based on processing state
          const spindle = group.userData._spindle;
          if (spindle) {
            const targetSpeed = isProcessing ? 6 : 0.3; // fast when processing, slow idle
            group.userData._spindleSpeed += (targetSpeed - group.userData._spindleSpeed) * 0.05;
            spindle.rotation.y += group.userData._spindleSpeed * safeDt;
          }

          // Machine vibration: subtle shake when processing
          if (group.userData.nodeType === 'station' || group.userData.nodeType === 'inspection' ||
              group.userData.nodeType === 'assembly' || group.userData.nodeType === 'disassembly' ||
              group.userData.nodeType === 'roboticcell') {
            if (isProcessing) {
              group.rotation.x = Math.sin(elapsed * 25) * 0.003;
              group.rotation.z = Math.cos(elapsed * 30) * 0.002;
            } else {
              group.rotation.x *= 0.9; // settle back
              group.rotation.z *= 0.9;
            }
          }

          // Robotic cell arm animation
          if (group.userData.nodeType === 'roboticcell') {
            if (!group.userData._robotShoulder) {
              group.userData._robotShoulder = group.getObjectByName('robotShoulder') || null;
              group.userData._robotUpperArm = group.getObjectByName('robotUpperArm') || null;
              group.userData._robotForearm = group.getObjectByName('robotForearm') || null;
            }
            const shoulder = group.userData._robotShoulder;
            const upperArm = group.userData._robotUpperArm;
            const forearm = group.userData._robotForearm;
            if (shoulder) {
              if (isProcessing) {
                // Active: rotate base, swing arm up/down, move forearm
                shoulder.rotation.y = Math.sin(elapsed * 1.5) * 0.8;
                if (upperArm) upperArm.rotation.z = -0.3 + Math.sin(elapsed * 2.0) * 0.25;
                if (forearm) forearm.rotation.z = 0.6 + Math.cos(elapsed * 2.5) * 0.3;
              } else {
                // Idle: slow drift
                shoulder.rotation.y = Math.sin(elapsed * 0.3) * 0.1;
                if (upperArm) upperArm.rotation.z += (-0.3 - upperArm.rotation.z) * 0.05;
                if (forearm) forearm.rotation.z += (0.6 - forearm.rotation.z) * 0.05;
              }
            }
          }

          // Operator & Humanoid figure animation — varies by connected station state
          const figure = group.userData._figure;
          if (figure && (group.userData.nodeType === 'operator' || group.userData.nodeType === 'humanoid')) {
            const connName = group.userData._connectedStationName as string | undefined;
            const connState = connName ? (liveState.stationStates[connName] || 'idle') : 'idle';

            const armL = group.userData._armL;
            const armR = group.userData._armR;

            let targetArm = -0.15;   // default idle: relaxed arms
            let swaySpeed = 0.8;
            let swayAmount = 0.06;
            let targetLeanX = 0;

            switch (connState) {
              case 'processing':
                targetArm = -0.5;     // arms forward
                swaySpeed = 1.6;
                swayAmount = 0.08;
                break;
              case 'starved':
                targetArm = -0.1;     // arms crossed
                swaySpeed = 0.4;
                swayAmount = 0.03;
                targetLeanX = 0.1;    // lean forward
                break;
              case 'blocked':
                targetArm = -0.3;     // hands on hips
                swaySpeed = 0.5;
                swayAmount = 0.04;
                break;
              case 'failed':
                targetArm = -0.7;     // arms up
                swaySpeed = 0.3;
                swayAmount = 0.02;
                targetLeanX = -0.1;   // looking up
                break;
              default: // idle, setup, off_shift, etc.
                targetArm = -0.15;
                swaySpeed = 0.8;
                swayAmount = 0.06;
                break;
            }

            figure.rotation.y = Math.sin(elapsed * swaySpeed) * swayAmount;
            figure.rotation.x += (targetLeanX - figure.rotation.x) * 0.06;
            if (armL) armL.rotation.x += (targetArm - armL.rotation.x) * 0.08;
            if (armR) armR.rotation.x += (targetArm - armR.rotation.x) * 0.08;
          }
        });
      }

      // ── Pulse selection ring ────────────────────────────────────────
      if (state.selectionRing.visible) {
        const scale = 1 + Math.sin(elapsed * 4) * 0.08;
        state.selectionRing.scale.set(scale, scale, scale);
      }

      // ── Simulation animation ────────────────────────────────────────
      state.animator.update(safeDt, elapsed);

      // ── Kinematic robot animation (rigged builders only) ───────────
      // Re-attach occasionally so newly built nodes get picked up; the
      // animator skips groups without `userData.fkChain` so it's a no-op
      // on scenes without rigged robots.
      if (elapsed - state.lastKinematicSync > 0.5) {
        state.lastKinematicSync = elapsed;
        state.kinematicAnimator.attachGroups(state.nodeGroups);
        state.kinematicAnimator.setStateSource(() => liveState.stationStates);
        // Tap each rigged robot's onWaypoint into the cycle-time analyzer.
        const animatorRobots = (state.kinematicAnimator as unknown as { robots: Array<{
          entityId: string;
          driver: { opts?: { onWaypoint?: (idx: number, wp: { toolAction?: 'open' | 'close' | null }) => void } };
        }> }).robots;
        for (const r of animatorRobots) {
          const opts = r.driver.opts;
          if (!opts || (opts as { __cycleTapped?: boolean }).__cycleTapped) continue;
          const prev = opts.onWaypoint;
          opts.onWaypoint = (idx, wp) => {
            state.cycleAnalyzer.recordWaypoint(r.entityId, idx, wp);
            prev?.(idx, wp);
          };
          (opts as { __cycleTapped?: boolean }).__cycleTapped = true;
        }
      }
      state.kinematicAnimator.update(safeDt);

      // ── Live HUD overlays ─────────────────────────────────────────
      if (state.hudVisible) {
        if (elapsed - state.lastHUDSync > 0.6) {
          state.lastHUDSync = elapsed;
          state.liveHUD.attachGroups(state.nodeGroups, (entityId) => {
            const s = liveState.stationStates[entityId] ?? 'idle';
            const u = liveState.stationUtilizations[entityId] ?? (s === 'processing' ? 0.85 : 0);
            return { state: s, utilization: u, label: entityId };
          });
        }
        state.liveHUD.update();
      }

      // ── Camera bookmark fly-to ────────────────────────────────────
      state.cameraBookmarks?.update(safeDt);

      // ── Warehouse racks: pallets appear/disappear from the run's move log ──
      if (frameCount % 3 === 0) {
        const whKpis = (useSimulationStore.getState().lastResult?.kpis as any)?.warehouses;
        state.nodeGroups.forEach((g, id) => {
          const rack = g.userData.rack as RackWarehouse | undefined;
          if (!rack) return;
          // Result keys are camelCased by the IPC bridge; ids with underscores change too
          const wk = whKpis?.[id] ?? whKpis?.[id.replace(/_([a-z0-9])/g, (_: string, c: string) => c.toUpperCase())];
          const moves = wk?.moves as [number, number, number][] | undefined;
          if (liveState.isReplaying && moves) {
            if (g.userData.rackMode !== 'replay') { rack.clear(); g.userData.rackMode = 'replay'; }
            rack.showAt({ moves, trips: wk?.trips, trucks: wk?.trucks ?? [] }, liveState.replayTime ?? 0);
          } else if (g.userData.rackMode !== 'design') {
            rack.clear();
            rack.showAt({ moves: g.userData.rackDesignMoves || [] }, 0);
            g.userData.rackMode = 'design';
          }
        });
      }

      // Process live simulation events
      if (liveState.recentEvents.length > 0) {
        state.animator.processEvents(liveState.recentEvents, liveState.stationProducts);
      }
      // Ambient flow particles
      if (elapsed - state.lastAmbientSpawn > 0.8 && Object.keys(liveState.edgeFlowCounts).length > 0) {
        state.lastAmbientSpawn = elapsed;
        state.animator.processAmbientFlow(liveState.edgeFlowCounts);
      }
      // Station state colors
      state.animator.updateStationStates(liveState.stationStates, state.nodeGroups);

      // ── Hide connections during simulation — operators/forklifts carry products ──
      // Connections are only shown when no live data (design mode)
      if (frameCount % 6 === 0) {
        const hasLive = Object.keys(liveState.stationStates).length > 0;
        // Conveyors stay visible: parts ride them during replay too
        void hasLive;
      }

      // ── Conveyor parts — disabled during simulation (operators/forklifts carry instead) ──
      // Remove any existing conveyor parts when live data is active
      if (Object.keys(liveState.stationStates).length > 0 && state.conveyorParts.length > 0) {
        for (const part of state.conveyorParts) {
          state.scene.remove(part.mesh);
          (part.mesh.material as THREE.Material).dispose();
        }
        state.conveyorParts = [];
      }
      if (frameCount % 20 === 0 && Object.keys(liveState.edgeFlowCounts).length > 0 && Object.keys(liveState.stationStates).length === 0) {
        // Compute max flow for relative part density
        let maxFlow = 1;
        for (const count of Object.values(liveState.edgeFlowCounts)) {
          if (count > maxFlow) maxFlow = count;
        }

        // Build set of active edge keys
        const activeEdges = new Set<string>();
        state.connections.forEach(conn => {
          const edgeKey = conn.userData.edgeKey;
          const flow = liveState.edgeFlowCounts[edgeKey] || 0;
          if (flow <= 0) return;
          activeEdges.add(edgeKey);

          // Count existing parts for this edge
          const existing = state.conveyorParts.filter(p => p.edgeKey === edgeKey).length;
          const desired = Math.min(4, Math.max(1, Math.floor((flow / maxFlow) * 4)));

          // Remove excess parts if flow decreased
          if (existing > desired) {
            let removed = 0;
            for (let i = state.conveyorParts.length - 1; i >= 0 && removed < existing - desired; i--) {
              if (state.conveyorParts[i].edgeKey === edgeKey) {
                state.scene.remove(state.conveyorParts[i].mesh);
                (state.conveyorParts[i].mesh.material as THREE.Material).dispose();
                state.conveyorParts.splice(i, 1);
                removed++;
              }
            }
          } else if (existing < desired) {
            // Spawn new parts evenly spaced
            for (let i = existing; i < desired; i++) {
              const colorIdx = (state.conveyorParts.length + i) % CONV_PART_COLORS.length;
              const partColor = CONV_PART_COLORS[colorIdx];
              const partMat = new THREE.MeshStandardMaterial({
                color: partColor,
                roughness: 0.3,
                metalness: 0.1,
                emissive: new THREE.Color(partColor),
                emissiveIntensity: 0.08,
              });
              const mesh = new THREE.Mesh(CONV_PART_GEO, partMat);
              mesh.position.copy(conn.userData.startPos);
              state.scene.add(mesh);
              state.conveyorParts.push({
                mesh,
                t: i / desired, // evenly spaced
                speed: (0.35 + (flow / maxFlow) * 0.35) / Math.max(1, conn.userData.dist), // ~0.35–0.7 m/s
                startPos: conn.userData.startPos.clone(),
                endPos: conn.userData.endPos.clone(),
                path: (conn.userData as any).path,
                total: conn.userData.dist,
                edgeKey,
              });
            }
          }
        });

        // Remove parts on edges that no longer have flow
        for (let i = state.conveyorParts.length - 1; i >= 0; i--) {
          if (!activeEdges.has(state.conveyorParts[i].edgeKey)) {
            state.scene.remove(state.conveyorParts[i].mesh);
            (state.conveyorParts[i].mesh.material as THREE.Material).dispose();
            state.conveyorParts.splice(i, 1);
          }
        }
      }
      // Animate all conveyor parts every frame
      for (const part of state.conveyorParts) {
        part.t += part.speed * safeDt;
        if (part.t > 1) part.t -= 1;
        // Ride the rollers along the conveyor route
        if (part.path && part.total) {
          part.mesh.rotation.y = samplePolyline(part.path, part.total, part.t, part.mesh.position);
        } else {
          part.mesh.position.lerpVectors(part.startPos, part.endPos, part.t);
        }
        part.mesh.position.y = CONV_TOP + 0.14;
      }

      // ── Buffer + Sink fill-level visualization — throttled every 5 frames ──
      const bufferLevels = liveState.bufferLevels;
      if (frameCount % 5 === 0) {
        state.nodeGroups.forEach(group => {
          const nodeType = group.userData.nodeType;
          const nodeName = group.userData.nodeName;

          // Buffer fill from bufferLevels — all queue/buffer types
          const isBufferType = nodeType === 'buffer' || nodeType === 'conveyor' ||
            (nodeName && (
              nodeName.toLowerCase().includes('queue') ||
              nodeName.toLowerCase().includes('buffer') ||
              nodeName.toLowerCase().includes('staging') ||
              nodeName.toLowerCase().includes('wip')
            ));
          if (isBufferType && Object.keys(bufferLevels).length > 0) {
            const bl = bufferLevels[nodeName];
            if (!bl) return;
            const fillRatio = bl.capacity > 0 ? bl.level / bl.capacity : 0;
            const fillGroup = group.getObjectByName('fillGroup');
            if (fillGroup) {
              const bins: THREE.Mesh[] = [];
              fillGroup.traverse(c => {
                if ((c as THREE.Mesh).isMesh && c.name.startsWith('bin_')) bins.push(c as THREE.Mesh);
              });
              // Fill level = number of totes; colour stays reserved for product types
              const visibleCount = Math.round(fillRatio * bins.length);
              bins.forEach((bin, i) => {
                bin.visible = i < visibleCount;
              });
            }
          }

          // Sink fill — count incoming flow to estimate fill level
          if (nodeType === 'sink') {
            const fillGroup = group.getObjectByName('fillGroup');
            if (fillGroup) {
              // Sum up total flow into this sink
              let totalFlow = 0;
              for (const [key, count] of Object.entries(liveState.edgeFlowCounts)) {
                if (key.endsWith(`->${nodeName}`)) totalFlow += count;
              }
              const fillRatio = Math.min(1.0, totalFlow / 100); // scale: 100 parts = full
              const bins: THREE.Mesh[] = [];
              fillGroup.traverse(c => {
                if ((c as THREE.Mesh).isMesh && c.name.startsWith('bin_')) bins.push(c as THREE.Mesh);
              });
              const visibleCount = Math.round(fillRatio * bins.length);
              bins.forEach((bin, i) => { bin.visible = i < visibleCount; });
            }
          }
        });
      }

      // ── Bottleneck identification via utilization — every 10 frames ──
      if (frameCount % 10 === 0) {
        const utilEntries = Object.entries(liveState.stationUtilizations || {});
        let bottleneckId = '';
        let maxUtil = 0;
        for (const [name, util] of utilEntries) {
          if (util > maxUtil) {
            maxUtil = util;
            const id = state.animator['nameToId']?.get(name);
            if (id) bottleneckId = id;
          }
        }
        // Always track highest-utilization station so fly-to-bottleneck works
        // (visual bottleneck indicator still only shows when utilization > 80%)
        state.bottleneckNodeId = bottleneckId;
        state.bottleneckMaxUtil = maxUtil;

        // Update station visual states — strict hierarchy:
        // Processing: normal body, green lamp, interior light bright
        // Starved: normal body, yellow lamp ONLY — no shell tint, no red
        // Blocked: subtle orange shell emissive 0.06, red lamp, footprint warm
        // Failed: red shell pulse, red footprint glow
        // Idle: normal body, blue dim lamp
        // Off-shift: everything dim, interior light off
        const stationStateEntries = Object.entries(liveState.stationStates);
        for (const [name, st] of stationStateEntries) {
          const id = state.animator['nameToId']?.get(name);
          if (!id) continue;
          const group = state.nodeGroups.get(id);
          if (!group) continue;

          // Skip bottleneck node — handled separately
          if (id === state.bottleneckNodeId) continue;

          group.scale.setScalar(1.0);

          // Interior light — ALWAYS stays blue, only intensity changes
          const il = group.getObjectByName('interiorLight') as THREE.PointLight;
          if (il) {
            il.color.setHex(0x80d0ff); // fixed blue-white, never changes color
            if (st === 'processing') il.intensity = 0.9;
            else if (st === 'off_shift') il.intensity = 0;
            else if (st === 'idle') il.intensity = 0.3;
            else il.intensity = 0.5;
          }

          // Reset shell emissive on all body meshes first
          group.traverse(child => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
            const m = mesh.material as THREE.MeshStandardMaterial;
            if (!m.emissive || m.transparent) return;
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          });

          // Reset footprint
          const fp = group.getObjectByName('_footprint') as THREE.Mesh;
          if (fp) {
            const fm = fp.material as THREE.MeshStandardMaterial;
            fm.emissive.setHex(0x000000);
            fm.emissiveIntensity = 0;
          }

          // Apply shell tint ONLY for blocked and failed
          if (st === 'blocked') {
            group.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
              const m = mesh.material as THREE.MeshStandardMaterial;
              if (!m.emissive || m.transparent) return;
              m.emissive.setHex(0xff2200);
              m.emissiveIntensity = 0.06;
            });
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0xff1100);
              fm.emissiveIntensity = 0.04;
            }
          } else if (st === 'failed') {
            const pulse = 0.08 + 0.07 * Math.sin(elapsed * 6);
            group.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.name.startsWith('lamp_') || mesh.name === '_footprint' || mesh.name === 'statusLight') return;
              const m = mesh.material as THREE.MeshStandardMaterial;
              if (!m.emissive || m.transparent) return;
              m.emissive.setHex(0xff0000);
              m.emissiveIntensity = pulse;
            });
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0xff0000);
              fm.emissiveIntensity = 0.10;
            }
          }
          // Starved, Processing, Idle, Off-shift, Setup: NO shell tint — lamp only
        }

        // ── Update stats badges on ALL stations — visible from simulation start ──
        const isSimActive = liveState.isReplaying || useAppStore.getState().isSimulating;
        const isLive = isSimActive || Object.keys(liveState.stationStates).length > 0;
        const activeStateFilter = liveState.stateFilter;
        // Show badges for all stations (not just those with state updates)
        state.nodeGroups.forEach((group) => {
          const statsSprite = group.getObjectByName('_statsSprite') as THREE.Sprite | undefined;
          if (!statsSprite) return;
          statsSprite.visible = isLive;
          if (isLive) {
            const nodeName = group.userData.nodeName as string || '';
            const st = liveState.stationStates[nodeName] || 'idle';
            const processed = liveState.stationProcessedCounts[nodeName] || 0;
            const util = liveState.stationUtilizations[nodeName] || 0;
            updateStatsSprite(statsSprite, st, processed, util);
            statsSprite.userData._active = true;

            // State filter dimming — dim stations not matching the selected filter
            if (activeStateFilter && group.userData.nodeType !== 'buffer' && group.userData.nodeType !== 'source' && group.userData.nodeType !== 'sink') {
              const dimmed = st !== activeStateFilter;
              const targetOpacity = dimmed ? 0.2 : 1.0;
              // Smoothly lerp group opacity
              const currentOpacity = group.userData._filterOpacity ?? 1.0;
              const newOpacity = currentOpacity + (targetOpacity - currentOpacity) * 0.15;
              group.userData._filterOpacity = newOpacity;
              group.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                  if (mat && mat.isMeshStandardMaterial) {
                    mat.transparent = true;
                    mat.opacity = newOpacity;
                  }
                }
              });
              // Also dim stats sprite
              if (dimmed) statsSprite.material.opacity = Math.min(statsSprite.material.opacity, 0.25);
            } else if (!activeStateFilter) {
              // Restore full opacity when filter cleared
              if (group.userData._filterOpacity !== undefined && group.userData._filterOpacity < 0.99) {
                const newOpacity = group.userData._filterOpacity + (1.0 - group.userData._filterOpacity) * 0.15;
                group.userData._filterOpacity = newOpacity >= 0.99 ? undefined : newOpacity;
                group.traverse((child) => {
                  if ((child as THREE.Mesh).isMesh) {
                    const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                    if (mat && mat.isMeshStandardMaterial) {
                      mat.opacity = newOpacity >= 0.99 ? 1.0 : newOpacity;
                      if (newOpacity >= 0.99) mat.transparent = false;
                    }
                  }
                });
              }
            }
          } else {
            statsSprite.userData._active = false;
          }
        });

        // Skip connection thickness updates during simulation (connections hidden)
        if (Object.keys(liveState.stationStates).length === 0) {
          let mfr = 1;
          for (const count of Object.values(liveState.edgeFlowCounts)) {
            if (count > mfr) mfr = count;
          }
          state.connections.forEach(conn => {
            const flow = liveState.edgeFlowCounts[conn.userData.edgeKey] || 0;
            const factor = mfr > 0 ? flow / mfr : 0;
            // Conveyor width is physical now; flow shows as bed colour only
            const belt = conn.userData.beltMesh;
            const bm = belt.material as THREE.MeshStandardMaterial;
            if (factor > 0.7) bm.color.setHex(0x2f8f6f);      // busy flow: green
            else if (factor > 0.3) bm.color.setHex(0x4f7f9a); // moderate: steel blue
            else bm.color.setHex(0x59616b);                   // light flow: dark grey
          });
        }
      }

      // ── Orbiting bottleneck light + shell pulse — runs every frame ──
      // Only show visual indicator when the bottleneck station has high utilization
      if (state.bottleneckNodeId && state.bottleneckMaxUtil > 0.8) {
        const bnGroup = state.nodeGroups.get(state.bottleneckNodeId);
        if (bnGroup) {
          // Orbiting amber light — wider radius, higher intensity
          const orbitAngle = elapsed * 0.9;
          state.bottleneckOrbit.position.set(
            bnGroup.position.x + Math.cos(orbitAngle) * 1.8,
            2.4,
            bnGroup.position.z + Math.sin(orbitAngle) * 1.8
          );
          state.bottleneckOrbit.intensity = 2.5 + 0.5 * Math.sin(elapsed * 5);
          state.bottleneckOrbit.color.setHex(0xff8800);

          // Bottleneck label always visible
          state.bottleneckLabel.visible = true;
          state.bottleneckLabel.position.set(
            bnGroup.position.x, 2.2, bnGroup.position.z
          );

          // Machine shell orange emissive pulse
          bnGroup.traverse(child => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const name = mesh.name;
            // Pulse the main body/shell meshes, skip lamps/lights/footprints
            if (name.startsWith('lamp_') || name === '_footprint' || name === 'statusLight') return;
            const m = mesh.material as THREE.MeshStandardMaterial;
            if (!m.emissive) return;
            // Only pulse opaque body meshes (not glass, not tiny details)
            if (m.transparent) return;
            // Cache original emissive if not already saved
            if (mesh.userData._origEmissive === undefined) {
              mesh.userData._origEmissive = m.emissive.getHex();
              mesh.userData._origEmissiveI = m.emissiveIntensity;
            }
            m.emissive.setHex(0xff4400);
            m.emissiveIntensity = 0.1 + 0.08 * Math.sin(elapsed * 3);
          });

          // Footprint amber glow — pulsing
          const fp = bnGroup.getObjectByName('_footprint') as THREE.Mesh;
          if (fp) {
            const fm = fp.material as THREE.MeshStandardMaterial;
            fm.emissive.setHex(0xff6600);
            fm.emissiveIntensity = 0.2 + 0.1 * Math.sin(elapsed * 2);
          }

          // Status lamp blinks 3× faster (rapid red flash)
          if (frameCount % 2 === 0) {
            const lampRed = bnGroup.getObjectByName('lamp_red') as THREE.Mesh;
            if (lampRed) {
              const lm = lampRed.material as THREE.MeshStandardMaterial;
              const flash = Math.sin(elapsed * 12) > 0;
              lm.emissive.setHex(flash ? 0xff2200 : 0x440000);
              lm.emissiveIntensity = flash ? 2.5 : 0.2;
              lm.color.setHex(flash ? 0xff4400 : 0x440000);
            }
          }
        }
      } else {
        state.bottleneckOrbit.intensity = 0;
        state.bottleneckLabel.visible = false;
        // Reset all shell glows and footprints
        if (frameCount % 30 === 0) {
          state.nodeGroups.forEach(g => {
            // Reset footprint
            const fp = g.getObjectByName('_footprint') as THREE.Mesh;
            if (fp) {
              const fm = fp.material as THREE.MeshStandardMaterial;
              fm.emissive.setHex(0x000000);
              fm.emissiveIntensity = 0;
            }
            // Restore original emissive on all meshes
            g.traverse(child => {
              if (!(child as THREE.Mesh).isMesh) return;
              const mesh = child as THREE.Mesh;
              if (mesh.userData._origEmissive !== undefined) {
                const m = mesh.material as THREE.MeshStandardMaterial;
                m.emissive.setHex(mesh.userData._origEmissive);
                m.emissiveIntensity = mesh.userData._origEmissiveI;
                delete mesh.userData._origEmissive;
                delete mesh.userData._origEmissiveI;
              }
            });
          });
        }
      }

      // ── Camera fly-to bottleneck — smooth animation ──
      const flySignal = useLiveSimulationStore.getState().flyToBottleneck3DSignal;
      if (flySignal > state.lastFlyToSignal) {
        state.lastFlyToSignal = flySignal;
        // Find the current bottleneck node position
        if (state.bottleneckNodeId) {
          const bnGroup = state.nodeGroups.get(state.bottleneckNodeId);
          if (bnGroup) {
            state.flyToTarget = bnGroup.position.clone();
            state.flyToProgress = 0;
            state.flyToStart = {
              pos: state.camera.position.clone(),
              target: state.controls.target.clone(),
            };
          }
        }
      }
      // Animate fly-to
      if (state.flyToTarget && state.flyToStart && state.flyToProgress < 1) {
        state.flyToProgress = Math.min(1, state.flyToProgress + safeDt * 1.5);
        const t = 1 - Math.pow(1 - state.flyToProgress, 3); // ease-out cubic
        const dest = state.flyToTarget;
        const endPos = new THREE.Vector3(dest.x + 4, 4.5, dest.z + 4);
        state.camera.position.lerpVectors(state.flyToStart.pos, endPos, t);
        state.controls.target.lerpVectors(state.flyToStart.target, dest, t);
        state.controls.update();
      }

      // ── Enhanced animation systems ───────────────────────────────────
      if (state.dynamicLighting || state.particleEffects) {
        // Sync lighting + particle states with live simulation
        if (frameCount % 3 === 0) {
          state.nodeGroups.forEach((group) => {
            const nodeName = group.userData.nodeName as string || '';
            const nodeState = liveState.stationStates[nodeName] || 'idle';
            const nodeId = group.userData.nodeId;
            if (state.dynamicLighting) {
              state.dynamicLighting.setNodeState(nodeId, nodeState);
            }
            // Activate/deactivate particle effects based on processing state
            if (state.particleEffects && group.userData._particleEffectId) {
              state.particleEffects.setActive(
                group.userData._particleEffectId,
                nodeState === 'processing',
              );
            }
          });
        }
        if (state.dynamicLighting) state.dynamicLighting.update(safeDt, elapsed);
      }

      // Conveyor belt animation
      if (state.conveyorAnimation) {
        const hasLive = Object.keys(liveState.stationStates).length > 0;
        if (frameCount % 10 === 0) {
          state.conveyorAnimation.setAllActive(hasLive);
        }
        state.conveyorAnimation.update(safeDt);
      }

      // Vehicle animation
      if (state.vehicleAnimation) {
        state.vehicleAnimation.update(safeDt, elapsed);
      }

      // Enhanced operator animation
      if (state.operatorAnimation) {
        if (frameCount % 3 === 0) {
          state.nodeGroups.forEach((group) => {
            const nodeType = group.userData.nodeType;
            if (nodeType === 'operator' || nodeType === 'humanoid') {
              const connName = group.userData._connectedStationName as string | undefined;
              const connState = connName ? (liveState.stationStates[connName] || 'idle') : 'idle';
              state.operatorAnimation!.setState(group.userData.nodeId, connState);
            }
          });
        }
        state.operatorAnimation.update(safeDt, elapsed);
      }

      // Particle effects
      if (state.particleEffects) {
        state.particleEffects.update(safeDt, elapsed);
      }

      // ── Phase 2 realism animation updates ──────────────────────────

      // Machine micro-animations (gauges, spindles, screens, doors, pistons, fans, beacons)
      if (state.machineAnimations) {
        if (frameCount % 3 === 0) {
          state.nodeGroups.forEach((group) => {
            const nodeName = group.userData.nodeName as string || '';
            const nodeState = liveState.stationStates[nodeName] || 'idle';
            state.machineAnimations!.setState(group.userData.nodeId, nodeState);
          });
        }
        state.machineAnimations.update(safeDt, elapsed);
      }

      // Robot arm IK animation
      if (state.robotArmAnimation) {
        if (frameCount % 3 === 0) {
          state.nodeGroups.forEach((group) => {
            if (group.userData.nodeType === 'roboticcell') {
              const nodeName = group.userData.nodeName as string || '';
              const nodeState = liveState.stationStates[nodeName] || 'idle';
              state.robotArmAnimation!.setState(group.userData.nodeId, nodeState);
            }
          });
        }
        state.robotArmAnimation.update(safeDt, elapsed);
      }

      // Atmospheric effects (dust motes, light shafts, heat shimmer, fog)
      if (state.atmosphericEffects) {
        const hasLive = Object.keys(liveState.stationStates).length > 0;
        if (frameCount % 30 === 0) {
          state.atmosphericEffects.setSimulationActive(hasLive);
        }
        state.atmosphericEffects.update(safeDt, elapsed);
      }

      // Reflective floor — render reflection before main render
      if (state.reflectiveFloor) {
        state.reflectiveFloor.update();
      }

      // DOF disabled — factory simulation needs every object sharp

      // ── Phase 3 realism animation updates ──────────────────────────

      // Enhanced shadow system — follow camera target
      if (state.shadowSystem) {
        state.shadowSystem.update(state.controls.target);
      }

      // Cable sway animation
      if (state.cableSystem) {
        state.cableSystem.update(safeDt, elapsed);
      }

      // Time-of-day smooth transitions
      if (state.timeOfDay) {
        state.timeOfDay.update(safeDt);
      }

      // LOD distance-based detail (throttled internally)
      if (state.lodManager) {
        state.lodManager.update();
      }

      // ── Phase 4 realism animation updates ──────────────────────────

      // Dynamic screen displays — update HMI content
      if (state.screenDisplays) {
        if (frameCount % 3 === 0) {
          state.nodeGroups.forEach((group) => {
            const nodeName = group.userData.nodeName as string || '';
            const nodeState = liveState.stationStates[nodeName] || 'idle';
            state.screenDisplays!.setState(group.userData.nodeId, nodeState);
          });
        }
        state.screenDisplays.update(elapsed);
      }

      // ── Render with post-processing or fallback ────────────────────
      if (state.postProcessing) {
        state.postProcessing.render();
      } else {
        renderer.render(scene, camera);
      }
    }
    animate();

    // Click handler
    renderer.domElement.addEventListener('click', handleClick);

    // Resize
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (state.postProcessing) {
          state.postProcessing.setSize(w, h);
        }
        if (state.reflectiveFloor) {
          state.reflectiveFloor.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(state.animFrameId);
      renderer.domElement.removeEventListener('click', handleClick);
      ro.disconnect();
      controls.dispose();

      // Dispose all geometries and materials (skip module-level shared ones)
      scene.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (!SHARED_GEOS.has(mesh.geometry)) mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(m => {
            if (SHARED_MATS.has(m)) return;
            if ((m as THREE.MeshStandardMaterial).map) (m as THREE.MeshStandardMaterial).map!.dispose();
            m.dispose();
          });
        }
        if ((obj as THREE.Sprite).isSprite) {
          const sprite = obj as THREE.Sprite;
          sprite.material.map?.dispose();
          sprite.material.dispose();
        }
      });

      // Clean up conveyor parts
      for (const part of state.conveyorParts) {
        state.scene.remove(part.mesh);
        (part.mesh.material as THREE.Material).dispose();
      }
      state.conveyorParts = [];
      // Clean up floor paths
      for (const fp of state.floorPaths) {
        state.scene.remove(fp);
        fp.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry.dispose();
            ((obj as THREE.Mesh).material as THREE.Material).dispose();
          }
        });
      }
      state.floorPaths = [];

      state.animator.dispose();
      state.postProcessing?.dispose();
      state.dynamicLighting?.dispose();
      state.conveyorAnimation?.dispose();
      state.vehicleAnimation?.dispose();
      state.operatorAnimation?.dispose();
      state.particleEffects?.dispose();
      // Phase 2 realism cleanup
      state.materialEnhancer?.dispose();
      state.reflectiveFloor?.dispose();
      state.machineAnimations?.dispose();
      state.atmosphericEffects?.dispose();
      state.robotArmAnimation?.dispose();
      state.surfaceDetail?.dispose();
      // Phase 3 realism cleanup
      state.shadowSystem?.dispose();
      state.cableSystem?.dispose();
      state.timeOfDay?.dispose();
      state.lodManager?.dispose();
      state.glassManager?.dispose();
      // Phase 4 realism cleanup
      state.proceduralTextures?.dispose();
      state.wearWeathering?.dispose();
      state.machineDecals?.dispose();
      state.screenDisplays?.dispose();
      state.materialVariation?.dispose();
      state.anisotropicMetal?.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []); // init once

  // ── Sync nodes & connections from model ────────────────────────────────────

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    const nodes = collectNodes(model);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Update simulation animator topology
    s.animator.updateTopology(model);

    // Determine which nodes to add / remove
    const currentIds = new Set(nodes.map(n => n.id));
    const existingIds = new Set(s.nodeGroups.keys());

    // Remove stale nodes
    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        const group = s.nodeGroups.get(id)!;
        s.scene.remove(group);
        group.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry.dispose();
            const mats = Array.isArray((obj as THREE.Mesh).material) ? (obj as THREE.Mesh).material as THREE.Material[] : [(obj as THREE.Mesh).material as THREE.Material];
            mats.forEach(m => m.dispose());
          }
          if ((obj as THREE.Sprite).isSprite) {
            (obj as THREE.Sprite).material.map?.dispose();
            (obj as THREE.Sprite).material.dispose();
          }
        });
        s.nodeGroups.delete(id);
      }
    });

    // ── Minimum spacing enforcement — push apart overlapping nodes ──
    // 4.0 units = enough for station model (~1.2u) + label (2.4u) + stats badge (2.8u) + padding
    const MIN_DIST = 4.0;
    const positions3d = new Map<string, { x: number; z: number }>();
    nodes.forEach(n => {
      positions3d.set(n.id, { x: n.position.x * SCALE, z: n.position.y * SCALE });
    });
    // Iterative repulsion — 8 passes for convergence with larger min distance
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions3d.get(nodes[i].id)!;
          const b = positions3d.get(nodes[j].id)!;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < MIN_DIST && dist > 0.01) {
            const push = (MIN_DIST - dist) / 2;
            const nx = dx / dist;
            const nz = dz / dist;
            a.x -= nx * push;
            a.z -= nz * push;
            b.x += nx * push;
            b.z += nz * push;
          }
        }
      }
    }

    // Add or update nodes
    nodes.forEach(n => {
      const pos = positions3d.get(n.id)!;
      const x3d = pos.x;
      const z3d = pos.z;

      if (s.nodeGroups.has(n.id)) {
        const group = s.nodeGroups.get(n.id)!;
        // Check if library model changed — if so, rebuild
        if ((n.libraryModelId || '') !== (group.userData.libraryModelId || '') ||
            (isRackNode(n) && group.userData.rackSig !== rackSignature(n, !model.connections.some(c => c.source === n.id || c.target === n.id)))) {
          s.scene.remove(group);
          group.traverse((obj: any) => {
            if (obj.isMesh) {
              obj.geometry?.dispose();
            }
          });
          s.nodeGroups.delete(n.id);
          // Fall through to the create branch below
        } else {
          // Update position only
          group.position.set(x3d, 0, z3d);
        }
      }
      if (!s.nodeGroups.has(n.id)) {
        // Create new — use library override or name-based variant for stations/buffers/merges
        let rack: RackWarehouse | null = null;
        let group: THREE.Group;
        if (isRackNode(n)) {
          // Pallet racks from the element's layout (same geometry as the engine)
          // Standalone (no connections) = a distribution centre: draw its dock doors
          const standalone = !model.connections.some(c => c.source === n.id || c.target === n.id);
          const equipment = rackEquipmentOf(n.data, standalone);
          rack = buildRackWarehouse(rackLayoutOf(n.data), equipment);
          group = rack.group;
          group.userData.rack = rack;
          group.userData.rackSig = rackSignature(n, standalone);
          group.userData.rackDesignMoves = initialMoves(rackLayoutOf(n.data), n.data?.skus || [], equipment);
          rack.showAt({ moves: group.userData.rackDesignMoves }, 0);
          group.userData.rackMode = 'design';
        } else {
          group = getNodeBuilder(n.type, n.name, n.libraryModelId)();
        }
        group.userData.nodeId = n.id;
        group.userData.nodeType = n.type;
        group.userData.nodeName = n.name;
        group.userData.libraryModelId = n.libraryModelId || '';
        group.position.set(x3d, 0, z3d);

        // Add glass enclosure + interior light to stations that don't have one
        if (n.type === 'station' && !group.getObjectByName('interiorLight')) {
          // Glass side panels — scaled from shared geometry
          const glassL = new THREE.Mesh(GLASS_GEO, GLASS_MAT);
          glassL.scale.set(0.02, 0.8, 1.0);
          glassL.position.set(-0.65, 0.7, 0);
          group.add(glassL);
          const glassR = new THREE.Mesh(GLASS_GEO, GLASS_MAT);
          glassR.scale.set(0.02, 0.8, 1.0);
          glassR.position.set(0.65, 0.7, 0);
          group.add(glassR);
          // (No interior PointLight: adding lights at runtime forces every
          // material to recompile — the source of multi-second stalls.)
        }
        // Strip lights embedded by machine builders (CNC, source, QC lamps):
        // the scene's few global lights do the lighting; per-node lights cost
        // a shader recompile each time a node is added.
        const embeddedLights: THREE.Light[] = [];
        group.traverse((child) => { if ((child as THREE.Light).isLight) embeddedLights.push(child as THREE.Light); });
        embeddedLights.forEach((l) => l.parent?.remove(l));
        // Real-world scale (1 unit = 1 m). Most machine models are built
        // close to life size, but people, robots and vehicles were modelled
        // at roughly half size, which made machines look gigantic.
        if (!rack && !PEOPLE_TYPES.has(n.type) && !FLOW_ALIGNED_MODELS.has(n.libraryModelId || '')) {
          paintMachine(group, n.libraryModelId || n.type);
        }
        const realScale = REAL_SCALE[n.type];
        if (realScale) group.scale.setScalar(realScale);
        // Line ends and buffers are built along local +X: turn them to the flow
        if (FLOW_ALIGNED.has(n.type) && (!n.libraryModelId || FLOW_ALIGNED_MODELS.has(n.libraryModelId))) {
          const inId = model.connections.find(c => c.target === n.id)?.source;
          const outId = model.connections.find(c => c.source === n.id)?.target;
          const from = inId ? positions3d.get(inId) : pos;
          const to = outId ? positions3d.get(outId) : pos;
          if (from && to) {
            const fx = to.x - from.x, fz = to.z - from.z;
            group.rotation.y = Math.abs(fx) >= Math.abs(fz)
              ? (fx >= 0 ? 0 : Math.PI)
              : (fz >= 0 ? -Math.PI / 2 : Math.PI / 2);
          }
        }
        const half = measureHalfExtents(group);
        if (rack) {
          // Conveyors and parts meet the warehouse at its dock (the group origin);
          // the rack block itself extends behind it (−Z)
          half.x = 1.2;
          half.z = 0.8;
          group.userData.rackBounds = rack.bounds;
        }
        group.userData.halfX = half.x;
        group.userData.halfZ = half.z;
        group.userData.top = half.top;
        if (n.type === 'roboticcell' || (n.type === 'station' && FENCED.test(n.name || ''))) {
          addSafetyFence(group);
        }

        // Floor footprint — cloned material for per-node bottleneck glow
        const fpW = n.type === 'sink' ? 1.8 : n.type === 'source' ? 0.9 : n.type === 'conveyor' ? 1.4 : n.type === 'operator' ? 0.6 : 1.2;
        const fpD = n.type === 'sink' ? 1.3 : n.type === 'source' ? 0.7 : n.type === 'conveyor' ? 0.6 : n.type === 'operator' ? 0.6 : 1.0;
        const fpMat = FOOTPRINT_MAT.clone();
        const footprint = new THREE.Mesh(FOOTPRINT_GEO, fpMat);
        footprint.scale.set(fpW, 1, fpD);
        footprint.position.set(0, 0.003, 0);
        footprint.name = '_footprint';
        group.add(footprint);

        // Label
        const label = createTextSprite(n.name);
        // Just above the machine (labels are in the group's scaled space)
        label.position.set(0, (half.top + 0.45) / (group.scale.y || 1), 0);
        group.add(label);

        // Stats badge (shown during simulation/replay for stations)
        if (n.type === 'station') {
          const stats = createStatsSprite();
          stats.position.set(0, (half.top + 1.1) / (group.scale.y || 1), 0);
          stats.visible = false; // hidden until simulation starts
          group.add(stats);
        }

        // Orient operators/humanoids toward their connected station
        if (n.type === 'operator' || n.type === 'humanoid') {
          const outgoing = model.connections.filter(c => c.source === n.id);
          const incoming = model.connections.filter(c => c.target === n.id);
          const connectedId = outgoing[0]?.target || incoming[0]?.source;
          if (connectedId) {
            const connNode = nodeMap.get(connectedId);
            if (connNode) {
              const dx = connNode.position.x * SCALE - x3d;
              const dz = connNode.position.y * SCALE - z3d;
              const figure = group.getObjectByName('figure');
              if (figure) {
                figure.rotation.y = Math.atan2(dx, dz);
              }
              // Store connected station name for per-operator animation
              group.userData._connectedStationName = connNode.name;
            }
          }
          // Vest color by name keywords
          const lower = n.name.toLowerCase();
          let vestColor = 0xff6600; // default orange
          if (lower.includes('qc') || lower.includes('quality') || lower.includes('inspect')) {
            vestColor = 0xffffff; // white for QC
          } else if (lower.includes('rush') || lower.includes('lead') || lower.includes('supervisor')) {
            vestColor = 0xffcc00; // yellow for rush/lead
          }
          group.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              const m = (child as THREE.Mesh).material;
              if (m === M.vest) {
                const newMat = M.vest.clone();
                newMat.color.setHex(vestColor);
                (child as THREE.Mesh).material = newMat;
              }
            }
          });
        }

        s.scene.add(group);
        s.nodeGroups.set(n.id, group);

        // Register with enhanced animation systems
        if (s.dynamicLighting) {
          s.dynamicLighting.registerNode(n.id, n.type, group);
        }
        if (s.conveyorAnimation && (n.type === 'conveyor' || n.type === 'rollerconveyor')) {
          const speed = (n as any).speed || 1;
          s.conveyorAnimation.registerConveyor(n.id, group, speed);
        }
        if (s.vehicleAnimation) {
          if (n.type === 'forklift' || n.type === 'agv') {
            s.vehicleAnimation.registerVehicle(n.id, n.type as 'forklift' | 'agv', group, (n as any).speed || 2);
          } else if (n.type === 'crane') {
            s.vehicleAnimation.registerCrane(n.id, group, (n as any).spanWidth || 6);
          }
        }
        if (s.operatorAnimation && (n.type === 'operator' || n.type === 'humanoid')) {
          s.operatorAnimation.register(n.id, group);
        }
        // Particle effects for specific machine types
        if (s.particleEffects) {
          const particleType = getParticleEffectType(n.type);
          if (particleType) {
            const effectId = s.particleEffects.createEffect(
              particleType,
              new THREE.Vector3(group.position.x, group.position.y + 0.5, group.position.z),
            );
            group.userData._particleEffectId = effectId;
          }
        }

        // Phase 2: Register with machine micro-animations
        if (s.machineAnimations) {
          s.machineAnimations.register(n.id, n.type, group);
        }
        // Phase 2: Register robot arms for IK animation
        if (s.robotArmAnimation && n.type === 'roboticcell') {
          s.robotArmAnimation.register(n.id, group);
        }
        // Phase 2: Register heat sources for atmospheric heat distortion
        if (s.atmosphericEffects && (n.type === 'oven' || n.type === 'heattreat' || n.name.toLowerCase().includes('furnace'))) {
          s.atmosphericEffects.registerHeatSource(
            new THREE.Vector3(group.position.x, group.position.y + 0.5, group.position.z),
          );
        }
      }
    });

    // Sync dynamic lighting positions
    if (s.dynamicLighting) {
      s.dynamicLighting.syncPositions(s.nodeGroups);
    }

    // Apply PBR material enhancements to newly added nodes (deferred)
    if (s.materialEnhancer) {
      setTimeout(() => {
        if (!sceneRef.current || !sceneRef.current.materialEnhancer) return;
        sceneRef.current.nodeGroups.forEach((group) => {
          sceneRef.current!.materialEnhancer!.enhanceGroup(group);
        });
      }, 500);
    }

    // Sync spread positions to animator so products animate to correct locations
    s.animator.syncPositions(positions3d);

    // Remove old connections and their conveyor parts
    s.connections.forEach(conn => {
      s.scene.remove(conn);
      // Geometry and materials are shared except the per-conveyor bed colour
      ((conn.userData as any).ownedMats || []).forEach((m: THREE.Material) => m.dispose());
    });
    s.connections = [];
    // Clear conveyor parts
    for (const part of s.conveyorParts) {
      s.scene.remove(part.mesh);
      (part.mesh.material as THREE.Material).dispose();
    }
    s.conveyorParts = [];
    // Clear old floor paths
    for (const fp of s.floorPaths) {
      s.scene.remove(fp);
      fp.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
          ((obj as THREE.Mesh).material as THREE.Material).dispose();
        }
      });
    }
    s.floorPaths = [];

    // Get live flow data for thickness
    const liveState = useLiveSimulationStore.getState();

    // Compute maxFlowRate across all edges for relative thickness
    const flowCounts = liveState.edgeFlowCounts;
    let maxFlowRate = 1;
    for (const count of Object.values(flowCounts)) {
      if (count > maxFlowRate) maxFlowRate = count;
    }

    // Pallet-related node types for floor path detection
    const palletTypes = new Set(['palletize', 'depalletize']);
    const palletNameHints = ['pallet'];

    function isNodePallet(n: NodeInfo): boolean {
      if (palletTypes.has(n.type)) return true;
      const lower = n.name.toLowerCase();
      return palletNameHints.some(h => lower.includes(h));
    }

    // Create connections + floor paths
    const conveyorRoutes = new Map<string, THREE.Vector3[]>();
    const usedFaces = new Map<string, Set<string>>();
    /** Flow-aligned models (buffers, line ends) only accept flow at their roller ends. */
    const fixedFace = (g: THREE.Group | undefined, end: 1 | -1): Face | undefined => {
      if (!g || !FLOW_ALIGNED.has(g.userData.nodeType) ||
          (g.userData.libraryModelId && !FLOW_ALIGNED_MODELS.has(g.userData.libraryModelId))) return undefined;
      // local +X in world: (cos θ, −sin θ)
      const cx = Math.round(Math.cos(g.rotation.y)), cz = Math.round(-Math.sin(g.rotation.y));
      return cx !== 0 ? { axis: 'x', sign: cx * end } : { axis: 'z', sign: cz * end };
    };
    model.connections.forEach(conn => {
      const srcNode = nodeMap.get(conn.source);
      const tgtNode = nodeMap.get(conn.target);
      if (!srcNode || !tgtNode) return;
      const srcPos = positions3d.get(conn.source);
      const tgtPos = positions3d.get(conn.target);
      if (!srcPos || !tgtPos) return;
      const edgeKey = `${srcNode.name}->${tgtNode.name}`;
      const flowRate = flowCounts[edgeKey] || 0;

      // People are resources, not material flow: no conveyor or path to them
      if (PEOPLE_TYPES.has(srcNode.type) || PEOPLE_TYPES.has(tgtNode.type)) return;

      const floorStart = new THREE.Vector3(srcPos.x, 0, srcPos.z);
      const floorEnd = new THREE.Vector3(tgtPos.x, 0, tgtPos.z);
      const isForklift = isNodePallet(srcNode) || isNodePallet(tgtNode);
      const isVehicle = VEHICLE_TYPES.has(srcNode.type) || VEHICLE_TYPES.has(tgtNode.type);
      if (isForklift || isVehicle) {
        // Vehicles drive on a marked floor route instead of a conveyor
        const floorPath = createFloorPath(floorStart, floorEnd, true);
        s.scene.add(floorPath);
        s.floorPaths.push(floorPath);
        return;
      }

      const sg = s.nodeGroups.get(conn.source), tg = s.nodeGroups.get(conn.target);
      const sh = { x: sg?.userData.halfX ?? 0.8, z: sg?.userData.halfZ ?? 0.6 };
      const th = { x: tg?.userData.halfX ?? 0.8, z: tg?.userData.halfZ ?? 0.6 };
      const usedSrc = usedFaces.get(conn.source) ?? new Set<string>();
      const usedTgt = usedFaces.get(conn.target) ?? new Set<string>();
      const r = routeConveyor(floorStart, floorEnd, sh, th, {
        usedSrc, usedTgt,
        srcFace: fixedFace(sg, +1), tgtFace: fixedFace(tg, -1),
      });
      usedSrc.add(faceKey(r.srcFace)); usedFaces.set(conn.source, usedSrc);
      usedTgt.add(faceKey(r.tgtFace)); usedFaces.set(conn.target, usedTgt);
      const route = r.path;
      const guards = /pack|pallet|box|carton|ship/i.test(`${srcNode.name} ${tgtNode.name}`);
      const connection = createConveyorConnection(route, flowRate, maxFlowRate, guards);
      connection.userData.edgeKey = edgeKey;
      s.scene.add(connection);
      s.connections.push(connection);
      conveyorRoutes.set(`${conn.source}->${conn.target}`, route);
    });
    s.animator.setConveyorRoutes(conveyorRoutes);

    // Fences get openings where conveyors pass through
    const fenceOpenings = new Map<string, THREE.Vector3[]>();
    model.connections.forEach(c => {
      const r = conveyorRoutes.get(`${c.source}->${c.target}`);
      if (!r) return;
      if (!fenceOpenings.has(c.source)) fenceOpenings.set(c.source, []);
      if (!fenceOpenings.has(c.target)) fenceOpenings.set(c.target, []);
      fenceOpenings.get(c.source)!.push(r[0]);
      fenceOpenings.get(c.target)!.push(r[r.length - 1]);
    });
    s.nodeGroups.forEach((g, id) => {
      const old = g.getObjectByName('_fence');
      if (!old) return;
      g.remove(old);
      addSafetyFence(g, fenceOpenings.get(id) || []);
    });

    // Building context + scenery from the layout bounds
    s.layoutInfo = {
      nodes: nodes.map(n => {
        const g = s.nodeGroups.get(n.id);
        const p = positions3d.get(n.id)!;
        const rb = g?.userData.rackBounds;
        return { id: n.id, type: n.type, x: p.x, z: p.z, hx: g?.userData.halfX ?? 0.8, hz: g?.userData.halfZ ?? 0.6,
          block: rb ? { x0: p.x + rb.x0, x1: p.x + rb.x1, z0: p.z + rb.z0, z1: p.z + rb.z1 } : undefined,
          yard: rb?.yard ? { x0: p.x + rb.yard.x0, x1: p.x + rb.yard.x1, z0: p.z + rb.yard.z0, z1: p.z + rb.yard.z1 } : undefined };
      }),
      routes: [...conveyorRoutes.values()],
    };
    rebuildSurroundings(s, sceneryRef.current);
    if (!s.framed && nodes.length > 0) {
      const f = frameLayout(s.layoutInfo, s.camera.fov);
      s.camera.position.copy(f.position);
      s.controls.target.copy(f.target);
      s.controls.update();
      s.framed = true;
    }

  }, [model.stations, model.buffers, model.extraNodes, model.connections]);

  // ── Sync floor plan background image onto ground plane ─────────────────────

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    const FLOOR_PLAN_NAME = '_floorPlanOverlay';

    // Remove existing floor plan mesh
    const existing = s.scene.getObjectByName(FLOOR_PLAN_NAME);
    if (existing) {
      s.scene.remove(existing);
      existing.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
          const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      });
    }

    const bgImage = model.layout.backgroundImage;
    if (!bgImage) return;

    const opacity = model.layout.backgroundOpacity ?? 0.3;
    const offsetX = (model.layout.backgroundOffsetX ?? 0) * SCALE;
    const offsetY = (model.layout.backgroundOffsetY ?? 0) * SCALE;

    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      // Size the floor plan to cover a reasonable area (20 units wide by default)
      const planeWidth = 20 * (SCALE / 0.012); // keep the plan's size relative to the layout
      const planeHeight = planeWidth / aspectRatio;

      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.name = FLOOR_PLAN_NAME;
      planeMesh.rotation.x = -Math.PI / 2;
      planeMesh.position.set(offsetX + planeWidth / 2, 0.005, offsetY + planeHeight / 2);
      planeMesh.renderOrder = -1;

      s.scene.add(planeMesh);
    };
    img.src = bgImage;
  }, [model.layout.backgroundImage, model.layout.backgroundOpacity, model.layout.backgroundOffsetX, model.layout.backgroundOffsetY]);

  // ── Scenery toggle (decorative people / racks / forklift) ─────────────────
  useEffect(() => {
    sceneryRef.current = scenery;
    try { localStorage.setItem('fs3d-scenery', scenery ? 'on' : 'off'); } catch { /* private mode */ }
    const s = sceneRef.current;
    if (s) rebuildSurroundings(s, scenery);
  }, [scenery]);

  // ── Sync selection highlight ───────────────────────────────────────────────

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    if (selectedNodeId && s.nodeGroups.has(selectedNodeId)) {
      const group = s.nodeGroups.get(selectedNodeId)!;
      s.selectionRing.visible = true;
      s.selectionRing.position.set(group.position.x, 0.02, group.position.z);
    } else {
      s.selectionRing.visible = false;
    }
  }, [selectedNodeId]);

  return (
    <div className="viewport-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, #F8FAFC 0%, #DCE4EE 55%, #C3CEDC 100%)' }}
      />
      {/* ── Camera control buttons ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: 4,
        background: 'rgba(255,255,255,0.92)', border: '1px solid #C5CCD6', borderRadius: 3, padding: 4,
        backdropFilter: 'blur(8px)',
      }}>
        {([
          {
            label: 'Fit All',
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            ),
            action: () => {
              const s = sceneRef.current;
              if (!s) return;
              if (!s.layoutInfo || s.layoutInfo.nodes.length === 0) return;
              const f = frameLayout(s.layoutInfo, s.camera.fov);
              s.camera.position.copy(f.position);
              s.controls.target.copy(f.target);
              s.controls.update();
            },
          },
          {
            label: 'Top',
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ),
            action: () => {
              const s = sceneRef.current;
              if (!s) return;
              const target = s.controls.target.clone();
              s.camera.position.set(target.x, 15, target.z + 0.001);
              s.controls.update();
            },
          },
          {
            label: 'Front',
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2 7h12" stroke="currentColor" strokeWidth="1.0" strokeDasharray="2 1.5"/>
              </svg>
            ),
            action: () => {
              const s = sceneRef.current;
              if (!s) return;
              const target = s.controls.target.clone();
              s.camera.position.set(target.x, target.y + 2, target.z + 15);
              s.controls.update();
            },
          },
          {
            label: 'Reset',
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 1 1 1.5 3.96" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M2 12V8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
            action: () => {
              const s = sceneRef.current;
              if (!s) return;
              if (s.layoutInfo && s.layoutInfo.nodes.length > 0) {
                const f = frameLayout(s.layoutInfo, s.camera.fov);
                s.camera.position.copy(f.position);
                s.controls.target.copy(f.target);
              } else {
                s.camera.position.set(6, 10, 6);
                s.controls.target.set(0, 0, 0);
              }
              s.controls.update();
            },
          },
          {
            label: scenery ? 'Hide scenery (people, racks, forklift — not simulated)' : 'Show scenery (people, racks, forklift — not simulated)',
            active: scenery,
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="3.2" r="1.6" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2.5 14v-4.5a2.5 2.5 0 0 1 5 0V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <rect x="9.5" y="2" width="5" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9.5 6h5M9.5 10h5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            ),
            action: () => setScenery(v => !v),
          },
        ] as { label: string; icon: React.ReactNode; action: () => void; active?: boolean }[]).map(btn => (
          <button
            key={btn.label}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={btn.active}
            onClick={btn.action}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, border: 'none', borderRadius: 7,
              background: btn.active ? '#DCEBFB' : 'transparent', color: btn.active ? '#1F5FAD' : '#334155',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#DCEBFB')}
            onMouseLeave={e => (e.currentTarget.style.background = btn.active ? '#DCEBFB' : 'transparent')}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      {isSimulating && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(34,197,94,0.9)', color: 'white',
          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: 'white',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          Simulation Running — 3D Live View
        </div>
      )}
    </div>
  );
}
