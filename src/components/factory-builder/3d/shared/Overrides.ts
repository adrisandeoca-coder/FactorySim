import * as THREE from 'three';

/**
 * Visual overrides — color, opacity, emissive — applied to a built model
 * group. Used by the Excel-driven scenario loader to customize the look of
 * each entity without re-authoring its geometry.
 *
 * The overrides are *additive* and *reversible*: original materials are
 * cached in userData, and the patch can be reverted by passing `null`.
 *
 * Filtering by mesh-name patterns lets the user say "tint only the body"
 * without bleeding into status lights or LED indicators.
 */

export interface VisualOverrides {
  /** Hex color (0xRRGGBB or #RRGGBB) applied to mesh `.color`. */
  color?: number | string;
  /** Opacity in [0,1]; sets transparent=true when < 1. */
  opacity?: number;
  /** Optional emissive boost (0–2 typically). */
  emissive?: number | string;
  emissiveIntensity?: number;
  /**
   * Restrict to meshes whose name matches any of these substrings (case-insensitive).
   * If omitted, applies to ALL non-emissive meshes (so status lights & LEDs are
   * preserved by default).
   */
  matchNames?: string[];
  /**
   * Skip meshes whose name matches any of these substrings (case-insensitive).
   * Defaults exclude common indicator meshes.
   */
  excludeNames?: string[];
}

const DEFAULT_EXCLUDE = ['lamp_', 'statuslight', 'led', 'glow', 'screen', 'visor', 'glass'];

const _color = new THREE.Color();

interface CachedMaterial {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
}

function toHex(v: number | string): number {
  if (typeof v === 'number') return v;
  if (v.startsWith('#')) return parseInt(v.slice(1), 16);
  if (v.startsWith('0x')) return parseInt(v, 16);
  return parseInt(v, 16);
}

function nameMatches(name: string, patterns: string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

/**
 * Apply visual overrides to a group. Each mesh that matches the filter gets
 * a *cloned* material so overrides don't bleed into other models that share
 * the same source material instance.
 *
 * Overrides are stacked: subsequent calls layer on top. Use `revertOverrides`
 * to drop everything back to the originals.
 */
export function applyOverrides(group: THREE.Object3D, overrides: VisualOverrides): void {
  const exclude = overrides.excludeNames ?? DEFAULT_EXCLUDE;
  const include = overrides.matchNames;

  const cache: CachedMaterial[] = (group.userData.__overrideCache as CachedMaterial[]) ?? [];

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    if (include && !nameMatches(mesh.name, include)) return;
    if (nameMatches(mesh.name, exclude)) return;

    // Cache original on first override of this mesh.
    if (!cache.some(c => c.mesh === mesh)) {
      cache.push({ mesh, original: mesh.material });
      // Clone so we can mutate without affecting other instances.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(m => m.clone())
        : (mesh.material as THREE.Material).clone();
    }

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as THREE.MeshStandardMaterial;
      if (overrides.color !== undefined && sm.color) {
        _color.setHex(toHex(overrides.color));
        sm.color.copy(_color);
      }
      if (overrides.opacity !== undefined) {
        sm.opacity = overrides.opacity;
        sm.transparent = overrides.opacity < 1;
        sm.depthWrite = overrides.opacity >= 1;
      }
      if (overrides.emissive !== undefined && sm.emissive) {
        _color.setHex(toHex(overrides.emissive));
        sm.emissive.copy(_color);
      }
      if (overrides.emissiveIntensity !== undefined) {
        sm.emissiveIntensity = overrides.emissiveIntensity;
      }
      sm.needsUpdate = true;
    }
  });

  group.userData.__overrideCache = cache;
}

/** Revert all overrides applied to the group, restoring original materials. */
export function revertOverrides(group: THREE.Object3D): void {
  const cache = group.userData.__overrideCache as CachedMaterial[] | undefined;
  if (!cache) return;
  for (const { mesh, original } of cache) {
    // Dispose the cloned material(s) to free GPU resources.
    const cloned = mesh.material;
    if (Array.isArray(cloned)) cloned.forEach(m => m.dispose?.());
    else (cloned as THREE.Material).dispose?.();
    mesh.material = original;
  }
  delete group.userData.__overrideCache;
}

/**
 * Attach `applyOverrides` and `revertOverrides` as methods on `userData`,
 * so callers can do `model.userData.applyOverrides({color: 0xff0000})`.
 * Call once after building a model.
 */
export function attachOverrideAPI(group: THREE.Object3D): void {
  group.userData.applyOverrides = (o: VisualOverrides) => applyOverrides(group, o);
  group.userData.revertOverrides = () => revertOverrides(group);
}
