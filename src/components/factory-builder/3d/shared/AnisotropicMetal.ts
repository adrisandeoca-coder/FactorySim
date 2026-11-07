import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnisotropicParams {
  color?: number;
  roughness?: number;
  metalness?: number;
  anisotropy?: number;
  anisotropyAngle?: number;
  clearcoat?: number;
}

// ---------------------------------------------------------------------------
// Module-level texture cache
// ---------------------------------------------------------------------------

const textureCache = new Map<string, THREE.CanvasTexture>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function getCachedTexture(key: string, generator: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const tex = generator();
  textureCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Procedural texture generators
// ---------------------------------------------------------------------------

/**
 * Generate a directional anisotropy map.
 * Red/green encode the anisotropy direction, blue encodes strength.
 */
function generateAnisotropyMap(angle: number, strength: number): THREE.CanvasTexture {
  const key = `aniso_${angle.toFixed(3)}_${strength.toFixed(2)}`;
  return getCachedTexture(key, () => {
    const size = 256;
    const [canvas, ctx] = makeCanvas(size);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const rand = seededRandom(77);

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Direction encoded as tangent-space vector (red = x, green = y)
    // Blue = strength modulation with slight variation per line
    const dirR = Math.round((cosA * 0.5 + 0.5) * 255);
    const dirG = Math.round((sinA * 0.5 + 0.5) * 255);

    for (let y = 0; y < size; y++) {
      // Slight intensity variation per row to simulate grain lines
      const lineVar = 0.85 + rand() * 0.15;
      const blueVal = Math.round(strength * lineVar * 255);

      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        data[idx] = dirR;
        data[idx + 1] = dirG;
        data[idx + 2] = blueVal;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

/**
 * Generate a normal map with concentric arc patterns (face-milling tool marks).
 */
function generateMillingNormalMap(): THREE.CanvasTexture {
  return getCachedTexture('milling_normal', () => {
    const size = 512;
    const [canvas, ctx] = makeCanvas(size);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Center offset slightly to simulate non-centered milling passes
    const cx = size * 0.45;
    const cy = size * 0.55;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Concentric arc grooves with a period of ~8 pixels
        const groove = Math.sin(dist * 0.8) * 0.3;

        // Normal perturbation along the radial direction
        const len = dist || 1;
        const nx = (dx / len) * groove;
        const ny = (dy / len) * groove;
        const nz = 1.0;

        // Normalize
        const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);

        const idx = (y * size + x) * 4;
        data[idx] = Math.round(((nx / mag) * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round(((ny / mag) * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round(((nz / mag) * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

/**
 * Generate a circular brush anisotropy map (radial pattern).
 */
function generateCircularAnisotropyMap(strength: number): THREE.CanvasTexture {
  return getCachedTexture(`circular_aniso_${strength.toFixed(2)}`, () => {
    const size = 256;
    const [canvas, ctx] = makeCanvas(size);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const rand = seededRandom(99);

    const half = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - half;
        const dy = y - half;
        // Tangent direction (perpendicular to radial)
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const lineVar = 0.8 + rand() * 0.2;

        const idx = (y * size + x) * 4;
        data[idx] = Math.round((cosA * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((sinA * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round(strength * lineVar * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

// ---------------------------------------------------------------------------
// 1. createAnisotropicMaterial
// ---------------------------------------------------------------------------

export function createAnisotropicMaterial(params?: AnisotropicParams): THREE.MeshPhysicalMaterial {
  const color = params?.color ?? 0x8899aa;
  const roughness = params?.roughness ?? 0.35;
  const metalness = params?.metalness ?? 0.85;
  const anisotropyStrength = params?.anisotropy ?? 0.8;
  const anisotropyAngle = params?.anisotropyAngle ?? 0;
  const clearcoat = params?.clearcoat ?? 0.1;

  const anisoMap = generateAnisotropyMap(anisotropyAngle, anisotropyStrength);

  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    anisotropy: anisotropyStrength,
    anisotropyRotation: anisotropyAngle,
    anisotropyMap: anisoMap,
    clearcoat,
    clearcoatRoughness: 0.3,
  });

  return mat;
}

// ---------------------------------------------------------------------------
// 2. createMachinedSurfaceMaterial
// ---------------------------------------------------------------------------

export function createMachinedSurfaceMaterial(
  params?: Partial<AnisotropicParams>,
): THREE.MeshPhysicalMaterial {
  const defaults: AnisotropicParams = {
    color: 0xc8ccd0,
    roughness: 0.25,
    metalness: 0.92,
    anisotropy: 0.7,
    anisotropyAngle: 0,
    clearcoat: 0.15,
  };

  const merged: AnisotropicParams = { ...defaults, ...params };
  const mat = createAnisotropicMaterial(merged);

  // Add concentric-arc normal map for face-milling tool marks
  const normalMap = generateMillingNormalMap();
  mat.normalMap = normalMap;
  mat.normalScale = new THREE.Vector2(0.4, 0.4);

  return mat;
}

// ---------------------------------------------------------------------------
// 3. createBrushedSteelMaterial
// ---------------------------------------------------------------------------

export function createBrushedSteelMaterial(
  direction: 'horizontal' | 'vertical' | 'circular' = 'horizontal',
): THREE.MeshPhysicalMaterial {
  const baseParams: AnisotropicParams = {
    color: 0x999999,
    roughness: 0.35,
    metalness: 0.9,
    anisotropy: 0.85,
    clearcoat: 0.05,
  };

  if (direction === 'circular') {
    baseParams.anisotropyAngle = 0;
    const mat = createAnisotropicMaterial(baseParams);
    // Replace the directional anisotropy map with a circular one
    mat.anisotropyMap = generateCircularAnisotropyMap(baseParams.anisotropy ?? 0.85);
    mat.anisotropyMap.needsUpdate = true;
    return mat;
  }

  baseParams.anisotropyAngle = direction === 'vertical' ? Math.PI / 2 : 0;
  return createAnisotropicMaterial(baseParams);
}

// ---------------------------------------------------------------------------
// 4. createSatinAluminumMaterial
// ---------------------------------------------------------------------------

export function createSatinAluminumMaterial(): THREE.MeshPhysicalMaterial {
  return createAnisotropicMaterial({
    color: 0xb8c4d0, // light silver with slight blue tint
    roughness: 0.3,
    metalness: 0.88,
    anisotropy: 0.6,
    anisotropyAngle: 0, // along extrusion direction (horizontal)
    clearcoat: 0.08,
  });
}

// ---------------------------------------------------------------------------
// 5. AnisotropicMetalManager
// ---------------------------------------------------------------------------

export class AnisotropicMetalManager {
  private materials: THREE.MeshPhysicalMaterial[] = [];

  /**
   * Scan a machine group and upgrade appropriate metal meshes to anisotropic
   * materials, preserving original color.
   */
  upgradeMetals(group: THREE.Group): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const mat = child.material;
      if (!mat || Array.isArray(mat)) return;

      // Only upgrade MeshStandardMaterial or MeshPhysicalMaterial instances
      if (
        !(mat instanceof THREE.MeshStandardMaterial) &&
        !(mat instanceof THREE.MeshPhysicalMaterial)
      ) {
        return;
      }

      // Check metal surface criteria
      const isMetallic = mat.metalness > 0.4;
      const isSmoothEnough = mat.roughness < 0.6;
      const isOpaque = !mat.transparent;

      if (!isMetallic || !isSmoothEnough || !isOpaque) return;

      // Determine brush direction from geometry bounding box
      const geometry = child.geometry;
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      const box = geometry.boundingBox;
      if (!box) return;

      const width = box.max.x - box.min.x;
      const height = box.max.y - box.min.y;
      const direction: 'horizontal' | 'vertical' = width >= height ? 'horizontal' : 'vertical';
      const angle = direction === 'vertical' ? Math.PI / 2 : 0;

      // Extract original color
      const originalColor = mat.color.getHex();

      // Create anisotropic replacement preserving the original color
      const aniso = createAnisotropicMaterial({
        color: originalColor,
        roughness: mat.roughness,
        metalness: mat.metalness,
        anisotropy: 0.7,
        anisotropyAngle: angle,
        clearcoat: 0.1,
      });

      child.material = aniso;
      this.materials.push(aniso);
    });
  }

  /** Dispose all materials and clear cached textures. */
  dispose(): void {
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials.length = 0;

    textureCache.forEach((tex) => {
      tex.dispose();
    });
    textureCache.clear();
  }
}
