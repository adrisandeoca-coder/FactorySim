import * as THREE from 'three';

/**
 * MaterialLibrary — a curated, named PBR palette inspired by VC's stock
 * materials. Lightweight: no textures yet, just consistent color/roughness/
 * metalness combinations that read correctly under standard lighting.
 *
 * Lookup by name: `M.steelBrushed`, `M.industrialOrange`, `M.concreteFloor`, ...
 *
 * All materials are *shared* (cached) — clone via `cloneMaterial(name)` if a
 * model needs to mutate one without affecting the rest of the scene.
 *
 * Tier-2 future work: add texture maps for roughness/normal/AO. Hooks are in
 * place via the optional `tex` argument.
 */

interface MatSpec {
  color: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

const SPECS: Record<string, MatSpec> = {
  // ─── Metals ───────────────────────────────────────────────
  steelBrushed:    { color: 0x9aa3ad, roughness: 0.45, metalness: 0.85 },
  steelMatte:      { color: 0x6e7682, roughness: 0.65, metalness: 0.7  },
  steelDark:       { color: 0x3a3f48, roughness: 0.55, metalness: 0.75 },
  aluminumLight:   { color: 0xc7cdd4, roughness: 0.40, metalness: 0.80 },
  copperPolished:  { color: 0xb87333, roughness: 0.30, metalness: 0.90 },
  brassPolished:   { color: 0xc9a14a, roughness: 0.30, metalness: 0.85 },
  chromeMirror:    { color: 0xeaedf2, roughness: 0.10, metalness: 0.95 },
  cabinetGrey:     { color: 0x575c64, roughness: 0.55, metalness: 0.45 },

  // ─── Plastics & rubbers ───────────────────────────────────
  rubberBlack:     { color: 0x222428, roughness: 0.95, metalness: 0.0  },
  plasticWhite:    { color: 0xeef0f3, roughness: 0.45, metalness: 0.0  },
  plasticBlack:    { color: 0x1a1c20, roughness: 0.50, metalness: 0.0  },

  // ─── Industrial colors ────────────────────────────────────
  industrialOrange:{ color: 0xe6711a, roughness: 0.40, metalness: 0.30 },
  industrialBlue:  { color: 0x2870c8, roughness: 0.40, metalness: 0.30 },
  industrialRed:   { color: 0xc23a2c, roughness: 0.45, metalness: 0.25 },
  industrialGreen: { color: 0x4a8b3b, roughness: 0.45, metalness: 0.25 },
  hazardYellow:    { color: 0xf2c03a, roughness: 0.45, metalness: 0.20 },

  // ─── Surfaces ─────────────────────────────────────────────
  concreteFloor:   { color: 0x6c727a, roughness: 0.92, metalness: 0.05 },
  paintedFloor:    { color: 0x4a5260, roughness: 0.70, metalness: 0.10 },
  wood:            { color: 0xa0723e, roughness: 0.75, metalness: 0.05 },

  // ─── Glass ────────────────────────────────────────────────
  glassClear:      { color: 0xb6d2e4, roughness: 0.10, metalness: 0.0, transparent: true, opacity: 0.55 },
  glassTinted:     { color: 0x4a6a8a, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.55 },

  // ─── Status / lights ──────────────────────────────────────
  ledRed:          { color: 0xff2222, roughness: 0.30, metalness: 0.0, emissive: 0xff0000, emissiveIntensity: 1.5 },
  ledGreen:        { color: 0x22ff66, roughness: 0.30, metalness: 0.0, emissive: 0x00ff44, emissiveIntensity: 1.5 },
  ledAmber:        { color: 0xffcc33, roughness: 0.30, metalness: 0.0, emissive: 0xff9900, emissiveIntensity: 1.4 },
  ledBlue:         { color: 0x44aaff, roughness: 0.30, metalness: 0.0, emissive: 0x2266cc, emissiveIntensity: 1.0 },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

function build(spec: MatSpec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 0,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
  });
}

/** Get a shared material by name. Returns the same instance for the same name. */
export function getMaterial(name: string): THREE.MeshStandardMaterial {
  const cached = cache.get(name);
  if (cached) return cached;
  const spec = SPECS[name];
  if (!spec) {
    // Soft fallback — log once and return a generic grey.
    console.warn(`MaterialLibrary: unknown material "${name}", using fallback`);
    return build({ color: 0x888888, roughness: 0.6, metalness: 0.2 });
  }
  const mat = build(spec);
  cache.set(name, mat);
  return mat;
}

/** Clone a library material so the caller can mutate it without affecting others. */
export function cloneMaterial(name: string): THREE.MeshStandardMaterial {
  return getMaterial(name).clone();
}

/** Public dictionary form for ergonomic access: `M.steelBrushed`. */
export const M = new Proxy({} as Record<string, THREE.MeshStandardMaterial>, {
  get(_, prop: string) {
    return getMaterial(prop);
  },
});

/** Names of all available materials in the library. */
export function listMaterialNames(): string[] {
  return Object.keys(SPECS);
}
