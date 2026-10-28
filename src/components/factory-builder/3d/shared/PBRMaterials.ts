import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurfaceType =
  | 'brushed_steel'
  | 'machined'
  | 'diamond_plate'
  | 'concrete'
  | 'painted_metal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an off-screen canvas of the given size. */
function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/** Simple seeded pseudo-random (xorshift32) so textures are deterministic. */
function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Encode a normal vector (nx, ny, nz each in -1..1) into RGB 0..255. */
function encodeNormal(nx: number, ny: number, nz: number): [number, number, number] {
  return [
    Math.round((nx * 0.5 + 0.5) * 255),
    Math.round((ny * 0.5 + 0.5) * 255),
    Math.round((nz * 0.5 + 0.5) * 255),
  ];
}

// ---------------------------------------------------------------------------
// 1. createProceduralNormalMap
// ---------------------------------------------------------------------------

export function createProceduralNormalMap(type: SurfaceType): THREE.CanvasTexture {
  const size = type === 'diamond_plate' ? 1024 : 512;
  const [canvas, ctx] = makeCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const rand = seededRandom(42);

  switch (type) {
    case 'brushed_steel':
      generateBrushedSteel(data, size, rand);
      break;
    case 'machined':
      generateMachined(data, size, rand);
      break;
    case 'diamond_plate':
      generateDiamondPlate(data, size, rand);
      break;
    case 'concrete':
      generateConcrete(data, size, rand);
      break;
    case 'painted_metal':
      generatePaintedMetal(data, size, rand);
      break;
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

// --- generators ---

function generateBrushedSteel(
  data: Uint8ClampedArray, size: number, rand: () => number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Horizontal brush strokes: perturb the normal in the Y direction
      const noise = (rand() - 0.5) * 0.3;
      const linePhase = Math.sin(y * 1.2 + rand() * 0.5) * 0.15;
      const nx = 0;
      const ny = noise + linePhase;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const [r, g, b] = encodeNormal(nx, ny, nz);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function generateMachined(
  data: Uint8ClampedArray, size: number, rand: () => number,
): void {
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Concentric rings with slight noise
      const ring = Math.sin(dist * 0.8) * 0.2 + rand() * 0.05;
      // Tangential normal perturbation
      const angle = Math.atan2(dy, dx);
      const nx = -Math.sin(angle) * ring;
      const ny = Math.cos(angle) * ring;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const [r, g, b] = encodeNormal(nx, ny, nz);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function generateDiamondPlate(
  data: Uint8ClampedArray, size: number, rand: () => number,
): void {
  const spacing = 32;
  const diamondSize = 12;

  // Start with flat normal everywhere
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = encodeNormal(0, 0, 1);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  // Stamp raised diamonds in a staggered grid
  for (let row = 0; row < size / spacing + 1; row++) {
    for (let col = 0; col < size / spacing + 1; col++) {
      const offsetX = (row % 2) * (spacing / 2);
      const cxD = col * spacing + offsetX;
      const cyD = row * spacing;

      for (let dy = -diamondSize; dy <= diamondSize; dy++) {
        for (let dx = -diamondSize; dx <= diamondSize; dx++) {
          // Diamond shape: |dx| + |dy| <= diamondSize
          if (Math.abs(dx) + Math.abs(dy) > diamondSize) continue;
          const px = ((cxD + dx) % size + size) % size;
          const py = ((cyD + dy) % size + size) % size;
          const i = (py * size + px) * 4;

          // Slope away from center of diamond
          const len = Math.max(1, Math.abs(dx) + Math.abs(dy));
          const nx = (dx / len) * 0.4 + rand() * 0.02;
          const ny = (dy / len) * 0.4 + rand() * 0.02;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const [r, g, b] = encodeNormal(nx, ny, nz);
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }
}

function generateConcrete(
  data: Uint8ClampedArray, size: number, rand: () => number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rough porous surface — strong random perturbation
      const nx = (rand() - 0.5) * 0.6;
      const ny = (rand() - 0.5) * 0.6;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const [r, g, b] = encodeNormal(nx, ny, nz);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function generatePaintedMetal(
  data: Uint8ClampedArray, size: number, rand: () => number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Subtle orange-peel: very mild perturbation with low-frequency waviness
      const wave = Math.sin(x * 0.15) * Math.sin(y * 0.15) * 0.06;
      const nx = wave + (rand() - 0.5) * 0.04;
      const ny = wave + (rand() - 0.5) * 0.04;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const [r, g, b] = encodeNormal(nx, ny, nz);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. createDirtOverlay
// ---------------------------------------------------------------------------

export function createDirtOverlay(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rand = seededRandom(77);

  // Start with a transparent black canvas
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);

  // Edge grime — darker, brownish splotches near borders
  const edgeWidth = 40;
  for (let k = 0; k < 120; k++) {
    let x: number, y: number;
    if (rand() < 0.6) {
      // Concentrate near edges
      const side = Math.floor(rand() * 4);
      switch (side) {
        case 0: x = rand() * edgeWidth;            y = rand() * size; break;
        case 1: x = size - rand() * edgeWidth;     y = rand() * size; break;
        case 2: x = rand() * size;                 y = rand() * edgeWidth; break;
        default: x = rand() * size;                y = size - rand() * edgeWidth; break;
      }
    } else {
      // Random interior spots
      x = rand() * size;
      y = rand() * size;
    }

    const radius = 4 + rand() * 18;
    const alpha = 0.08 + rand() * 0.18;
    const brown = Math.floor(30 + rand() * 40);
    const green = Math.floor(20 + rand() * 20);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${brown},${green},10,${alpha})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// 3. createScratchMap
// ---------------------------------------------------------------------------

export function createScratchMap(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rand = seededRandom(123);

  // Dark background (mostly unused roughness)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Random thin white scratch lines
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  for (let k = 0; k < 40; k++) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const angle = rand() * Math.PI * 2;
    const length = 10 + rand() * 50;
    const x1 = x0 + Math.cos(angle) * length;
    const y1 = y0 + Math.sin(angle) * length;

    ctx.lineWidth = 0.5 + rand() * 1.5;
    ctx.globalAlpha = 0.3 + rand() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// 4. enhanceMaterial
// ---------------------------------------------------------------------------

/** Create a noise-based roughness map for subtle variation. */
function createRoughnessMap(baseRoughness: number): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const d = imageData.data;
  const rand = seededRandom(999);

  const base = Math.round(baseRoughness * 255);
  const variation = 30; // +/- in 0-255

  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const v = Math.max(0, Math.min(255, base + Math.round((rand() - 0.5) * variation * 2)));
    d[idx] = v;
    d[idx + 1] = v;
    d[idx + 2] = v;
    d[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Determine the best SurfaceType for a material based on its properties.
 * Falls back to 'painted_metal' for generic materials.
 */
function inferSurfaceType(material: THREE.MeshStandardMaterial): SurfaceType {
  if (material.roughness > 0.8 && material.metalness < 0.2) return 'concrete';
  if (material.metalness > 0.7 && material.roughness < 0.3) return 'brushed_steel';
  if (material.metalness > 0.5) return 'machined';
  return 'painted_metal';
}

/**
 * Enhance an existing MeshStandardMaterial with PBR details.
 *
 * - Applies the appropriate procedural normal map
 * - Adds a noise-based roughness map for subtle variation
 * - For highly metallic surfaces (metalness > 0.5), upgrades to
 *   MeshPhysicalMaterial and adds clearcoat
 *
 * Returns the (possibly upgraded) material.
 */
export function enhanceMaterial(
  material: THREE.MeshStandardMaterial,
  surfaceType?: string,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const type = (surfaceType as SurfaceType) ?? inferSurfaceType(material);

  // Normal map
  const normalMap = createProceduralNormalMap(type);
  material.normalMap = normalMap;
  material.normalScale = new THREE.Vector2(0.8, 0.8);

  // Roughness map
  const roughnessMap = createRoughnessMap(material.roughness);
  material.roughnessMap = roughnessMap;

  material.needsUpdate = true;

  // For metallic surfaces, upgrade to MeshPhysicalMaterial and add clearcoat
  if (material.metalness > 0.5) {
    const physical = new THREE.MeshPhysicalMaterial({});

    // Copy base properties
    physical.color.copy(material.color);
    physical.metalness = material.metalness;
    physical.roughness = material.roughness;
    physical.normalMap = material.normalMap;
    physical.normalScale.copy(material.normalScale);
    physical.roughnessMap = material.roughnessMap;
    physical.envMap = material.envMap;
    physical.envMapIntensity = material.envMapIntensity;
    if (material.emissive) physical.emissive.copy(material.emissive);
    physical.emissiveIntensity = material.emissiveIntensity;
    physical.transparent = material.transparent;
    physical.opacity = material.opacity;
    physical.side = material.side;

    // Clearcoat
    physical.clearcoat = 0.3;
    physical.clearcoatRoughness = 0.08;

    physical.needsUpdate = true;
    return physical;
  }

  return material;
}

// ---------------------------------------------------------------------------
// 5. MaterialEnhancer class
// ---------------------------------------------------------------------------

export class MaterialEnhancer {
  private textures: THREE.Texture[] = [];
  private enhancedMaterials = new WeakSet<THREE.Material>();

  /**
   * Walk the entire scene graph, find MeshStandardMaterials, and apply
   * procedural enhancements.
   */
  enhanceScene(scene: THREE.Scene): void {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      this.processMesh(object);
    });
  }

  /**
   * Enhance all meshes within a specific group.
   */
  enhanceGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      this.processMesh(object);
    });
  }

  /**
   * Dispose of all textures created by this enhancer.
   */
  dispose(): void {
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.length = 0;
  }

  // --- internal ---

  private processMesh(mesh: THREE.Mesh): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (let idx = 0; idx < materials.length; idx++) {
      const mat = materials[idx];
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (this.enhancedMaterials.has(mat)) continue;

      const enhanced = enhanceMaterial(mat);
      this.trackTextures(enhanced);
      this.enhancedMaterials.add(enhanced);

      // Replace material on mesh if it was upgraded
      if (enhanced !== mat) {
        if (Array.isArray(mesh.material)) {
          mesh.material[idx] = enhanced;
        } else {
          mesh.material = enhanced;
        }
      }
    }
  }

  private trackTextures(material: THREE.Material): void {
    const mat = material as THREE.MeshStandardMaterial;
    if (mat.normalMap) this.textures.push(mat.normalMap);
    if (mat.roughnessMap) this.textures.push(mat.roughnessMap);
  }
}
