import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { mat } from '../../shared/materials';
import { attachOverrideAPI } from '../../shared/Overrides';

/**
 * BuildingShell — exterior models for facilities at the supply-chain scale.
 *
 * Used when the user is modelling abstract sites (a factory, a DC, a port) as
 * single nodes in a network rather than detailed interiors. Three variants
 * with the same footprint convention so they can swap freely:
 *
 *   buildFactoryShell()     — saw-tooth roofed industrial plant
 *   buildWarehouseShell()   — flat-roofed distribution center with dock doors
 *   buildOfficeBlockShell() — office/HQ with windows
 *
 * Each returns a centered THREE.Group with origin at floor center and a
 * `userData.shell` block describing dock positions, dimensions, and a
 * suggested truck approach point.
 */

export interface ShellMetadata {
  width: number;
  depth: number;
  height: number;
  /** Local-space points where trucks can dock (door midpoints). */
  dockPoints: THREE.Vector3[];
  /** Local-space approach point for the building (truck path arrival). */
  approachPoint: THREE.Vector3;
  /** "factory" | "warehouse" | "office" — for downstream styling. */
  kind: 'factory' | 'warehouse' | 'office';
}

// ─── Warehouse: flat roof + 4 truck dock doors on one long face ────────────
export function buildWarehouseShell(opts: { width?: number; depth?: number; height?: number } = {}): THREE.Group {
  const W = opts.width ?? 18;
  const D = opts.depth ?? 12;
  const H = opts.height ?? 5;

  const g = new THREE.Group();
  g.name = 'warehouseShell';

  const wallMat = mat(0xc8cdd2, 0.85, 0.05);
  const trimMat = mat(0x4a5160, 0.45, 0.4);
  const roofMat = mat(0x6a727c, 0.70, 0.30);
  const doorMat = mat(0x2a2e36, 0.75, 0.35);

  // Slab
  g.add(box(W + 1, 0.05, D + 1, mat(0x6f7480, 0.85, 0.1), 0, -0.025, 0));

  // Walls
  g.add(box(W, H, 0.15, wallMat, 0, H / 2, -D / 2));   // back
  g.add(box(W, H, 0.15, wallMat, 0, H / 2, D / 2));     // front (will get doors)
  g.add(box(0.15, H, D, wallMat, -W / 2, H / 2, 0));    // left
  g.add(box(0.15, H, D, wallMat, W / 2, H / 2, 0));     // right

  // Trim band along top
  g.add(box(W + 0.2, 0.20, D + 0.2, trimMat, 0, H - 0.1, 0));

  // Flat roof slab
  g.add(box(W + 0.4, 0.08, D + 0.4, roofMat, 0, H + 0.04, 0));
  // Roof HVAC units
  g.add(box(2, 0.6, 1.2, mat(0x9aa0a8, 0.7, 0.35), -W / 4, H + 0.4, -D / 4));
  g.add(box(2, 0.6, 1.2, mat(0x9aa0a8, 0.7, 0.35), W / 4, H + 0.4, -D / 4));

  // 4 truck dock doors on the front face
  const dockCount = 4;
  const doorW = 2.4, doorH = 3.2;
  const dockPoints: THREE.Vector3[] = [];
  for (let i = 0; i < dockCount; i++) {
    const x = (i - (dockCount - 1) / 2) * (W / (dockCount + 0.5));
    g.add(box(doorW, doorH, 0.05, doorMat, x, doorH / 2, D / 2 + 0.08));
    // Roller-door slats
    for (let k = 0; k < 6; k++) {
      g.add(box(doorW, 0.02, 0.005, mat(0x1c1e22, 0.7, 0.4), x, 0.3 + k * 0.5, D / 2 + 0.11));
    }
    // Concrete bumpers
    g.add(box(doorW + 0.2, 0.30, 0.20, mat(0xd0d2d6, 0.85, 0.05), x, 0.15, D / 2 + 0.15));
    dockPoints.push(new THREE.Vector3(x, 0, D / 2 + 1.5));
  }

  // Side personnel door
  g.add(box(0.08, 2.1, 0.95, doorMat, W / 2 + 0.06, 1.05, D / 4));

  // Logo strip
  g.add(box(W * 0.3, 0.5, 0.05, mat(0x2870c8, 0.4, 0.3, { emissive: 0x1a4a88, emissiveIntensity: 0.3 }),
    0, H * 0.85, D / 2 + 0.10));

  const meta: ShellMetadata = {
    width: W, depth: D, height: H,
    dockPoints,
    approachPoint: new THREE.Vector3(0, 0, D / 2 + 6),
    kind: 'warehouse',
  };
  g.userData.shell = meta;
  attachOverrideAPI(g);
  return g;
}

// ─── Factory: saw-tooth roofline + chimney + 2 dock doors ──────────────────
export function buildFactoryShell(opts: { width?: number; depth?: number; height?: number } = {}): THREE.Group {
  const W = opts.width ?? 22;
  const D = opts.depth ?? 14;
  const H = opts.height ?? 6;

  const g = new THREE.Group();
  g.name = 'factoryShell';

  const wallMat = mat(0xb5b9c0, 0.85, 0.08);
  const trimMat = mat(0x3a3f48, 0.55, 0.35);
  const roofMat = mat(0x4a5158, 0.75, 0.30);
  const windowMat = mat(0x6090b8, 0.10, 0.25, { emissive: 0x88aacc, emissiveIntensity: 0.4 });

  // Slab
  g.add(box(W + 1, 0.05, D + 1, mat(0x60656e, 0.85, 0.1), 0, -0.025, 0));

  // Walls
  g.add(box(W, H, 0.18, wallMat, 0, H / 2, -D / 2));
  g.add(box(W, H, 0.18, wallMat, 0, H / 2, D / 2));
  g.add(box(0.18, H, D, wallMat, -W / 2, H / 2, 0));
  g.add(box(0.18, H, D, wallMat, W / 2, H / 2, 0));

  // Saw-tooth roof: 4 ridges along the length
  const teeth = 4;
  const toothW = W / teeth;
  for (let i = 0; i < teeth; i++) {
    const cx = -W / 2 + toothW / 2 + i * toothW;
    // Tooth body — angled north face
    g.add(box(toothW * 0.95, 1.6, D, roofMat, cx, H + 0.8, 0));
    // North-facing window glazing
    g.add(box(toothW * 0.95, 1.4, 0.05, windowMat, cx, H + 0.8, -D / 2 + 0.05));
    // Ridge
    g.add(box(toothW * 0.95, 0.10, 0.20, trimMat, cx, H + 1.55, 0));
  }

  // Trim
  g.add(box(W + 0.3, 0.20, D + 0.3, trimMat, 0, H, 0));

  // Chimney
  g.add(box(1.0, 4.0, 1.0, mat(0xb24030, 0.6, 0.35), W / 2 - 1.5, H + 3, -D / 2 + 1.5));
  g.add(box(1.2, 0.2, 1.2, mat(0xa0a4a8, 0.5, 0.4), W / 2 - 1.5, H + 5, -D / 2 + 1.5));
  g.add(cyl(0.20, 0.18, 0.6, 12, mat(0x3a3a3a, 0.75, 0.4), W / 2 - 1.5, H + 5.4, -D / 2 + 1.5));

  // Big roll-up dock doors (2)
  const doorW = 3.5, doorH = 4.0;
  const dockPoints: THREE.Vector3[] = [];
  const xs = [-W / 4, W / 4];
  for (const x of xs) {
    g.add(box(doorW, doorH, 0.08, mat(0x252830, 0.75, 0.35), x, doorH / 2, D / 2 + 0.10));
    for (let k = 0; k < 8; k++) {
      g.add(box(doorW, 0.02, 0.005, mat(0x18191c, 0.7, 0.4), x, 0.3 + k * 0.5, D / 2 + 0.13));
    }
    dockPoints.push(new THREE.Vector3(x, 0, D / 2 + 2));
  }

  // Strip windows along sides
  for (let k = 0; k < 5; k++) {
    const x = -W / 2 + 1.5 + k * 4.5;
    if (x > W / 2 - 1.5) break;
    g.add(box(2.5, 1.2, 0.02, windowMat, x, H * 0.55, -D / 2 + 0.10));
  }

  const meta: ShellMetadata = {
    width: W, depth: D, height: H,
    dockPoints,
    approachPoint: new THREE.Vector3(0, 0, D / 2 + 7),
    kind: 'factory',
  };
  g.userData.shell = meta;
  attachOverrideAPI(g);
  return g;
}

// ─── Office block (smaller, glassy) ─────────────────────────────────────────
export function buildOfficeBlockShell(opts: { width?: number; depth?: number; floors?: number } = {}): THREE.Group {
  const W = opts.width ?? 10;
  const D = opts.depth ?? 8;
  const floors = opts.floors ?? 3;
  const floorH = 3.2;
  const H = floors * floorH;

  const g = new THREE.Group();
  g.name = 'officeShell';

  const wallMat = mat(0xe2e6ec, 0.5, 0.10);
  const slabMat = mat(0x9aa0a8, 0.6, 0.30);
  const glass = mat(0x5a8cb8, 0.20, 0.20, { transparent: true, opacity: 0.8, emissive: 0x7da0c4, emissiveIntensity: 0.2 });

  g.add(box(W + 1, 0.05, D + 1, mat(0x60656e, 0.85, 0.1), 0, -0.025, 0));

  // Floor slabs + glass curtain walls
  for (let f = 0; f < floors; f++) {
    const y = f * floorH;
    // Slab
    g.add(box(W + 0.3, 0.18, D + 0.3, slabMat, 0, y + 0.09, 0));
    // Curtain wall — 4 sides of glass with mullion strips
    g.add(box(W - 0.4, floorH - 0.4, 0.05, glass, 0, y + floorH / 2, D / 2));
    g.add(box(W - 0.4, floorH - 0.4, 0.05, glass, 0, y + floorH / 2, -D / 2));
    g.add(box(0.05, floorH - 0.4, D - 0.4, glass, W / 2, y + floorH / 2, 0));
    g.add(box(0.05, floorH - 0.4, D - 0.4, glass, -W / 2, y + floorH / 2, 0));
    // Spandrel
    g.add(box(W, 0.30, D, wallMat, 0, y + 0.30, 0));
  }
  // Roof slab
  g.add(box(W + 0.5, 0.20, D + 0.5, slabMat, 0, H + 0.10, 0));

  // Entrance canopy
  g.add(box(W * 0.4, 0.15, 1.5, mat(0x2a2e36, 0.6, 0.3), 0, 2.6, D / 2 + 0.75));
  // Glass entrance doors
  g.add(box(2.0, 2.4, 0.04, glass, 0, 1.2, D / 2 + 0.02));

  const meta: ShellMetadata = {
    width: W, depth: D, height: H,
    dockPoints: [],
    approachPoint: new THREE.Vector3(0, 0, D / 2 + 4),
    kind: 'office',
  };
  g.userData.shell = meta;
  attachOverrideAPI(g);
  return g;
}
