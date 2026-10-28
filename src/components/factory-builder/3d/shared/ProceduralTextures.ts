import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

type TextureType =
  | 'brushedMetal'
  | 'paintedMetal'
  | 'castIron'
  | 'rubber'
  | 'plastic'
  | 'concrete'
  | 'wood'
  | 'diamondPlate';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEX_SIZE = 512;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/** Simple seeded pseudo-random (xorshift32) for deterministic textures. */
function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Decompose a hex color into normalized RGB components (0..1). */
function hexToRGB(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

/** Clamp a value to [0, 255]. */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Add random pixel noise to an existing canvas context. */
function addNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const rand = seededRandom(7919);
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 2 * intensity * 255;
    data[i] = clamp255(data[i] + n);
    data[i + 1] = clamp255(data[i + 1] + n);
    data[i + 2] = clamp255(data[i + 2] + n);
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Convert a grayscale heightmap canvas to a tangent-space normal map.
 * Uses a Sobel-like approach: sample neighbors, compute x/y slopes,
 * encode as RGB where R=x, G=y, B=z (z always up).
 */
function heightToNormal(heightCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const [outCanvas, outCtx] = makeCanvas();
  const outImage = outCtx.createImageData(w, h);
  const out = outImage.data;

  const getHeight = (x: number, y: number): number => {
    // Wrap for tiling
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return srcData[(wy * w + wx) * 4] / 255;
  };

  const strength = 2.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel kernel for x and y gradients
      const tl = getHeight(x - 1, y - 1);
      const t = getHeight(x, y - 1);
      const tr = getHeight(x + 1, y - 1);
      const l = getHeight(x - 1, y);
      const r = getHeight(x + 1, y);
      const bl = getHeight(x - 1, y + 1);
      const b = getHeight(x, y + 1);
      const br = getHeight(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const i = (y * w + x) * 4;
      out[i] = clamp255((nx / len * 0.5 + 0.5) * 255);
      out[i + 1] = clamp255((ny / len * 0.5 + 0.5) * 255);
      out[i + 2] = clamp255((nz / len * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  return outCanvas;
}

/** Wrap a canvas as a repeating CanvasTexture. */
function wrapTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// ProceduralTextureGenerator
// ---------------------------------------------------------------------------

export class ProceduralTextureGenerator {
  private cache = new Map<string, TextureSet>();

  // ---- public generators ----

  generateBrushedMetal(baseColor: number): TextureSet {
    const key = `brushedMetal_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const [r, g, b] = hexToRGB(baseColor);
    const rand = seededRandom(101);

    // Diffuse map: base color with horizontal streaks and slight variation
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      const streak = 0.92 + rand() * 0.16; // per-scanline brightness variation
      for (let x = 0; x < TEX_SIZE; x++) {
        const micro = 1.0 + (rand() - 0.5) * 0.06;
        diffCtx.fillStyle = `rgb(${clamp255(r * 255 * streak * micro)},${clamp255(g * 255 * streak * micro)},${clamp255(b * 255 * streak * micro)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness map: horizontal streaks (lighter = smoother, darker = rougher)
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(202);
    for (let y = 0; y < TEX_SIZE; y++) {
      const baseVal = 80 + Math.sin(y * 0.5) * 20;
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = clamp255(baseVal + (randR() - 0.5) * 40);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal map via heightmap: horizontal directional lines
    const [heightCanvas, heightCtx] = makeCanvas();
    const randH = seededRandom(303);
    for (let y = 0; y < TEX_SIZE; y++) {
      const lineVal = 128 + Math.sin(y * 1.2) * 30;
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = clamp255(lineVal + (randH() - 0.5) * 20);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generatePaintedMetal(baseColor: number): TextureSet {
    const key = `paintedMetal_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const [r, g, b] = hexToRGB(baseColor);
    const rand = seededRandom(401);

    // Diffuse: subtle orange-peel texture via slight per-pixel color variation
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 1.0 + (rand() - 0.5) * 0.04;
        diffCtx.fillStyle = `rgb(${clamp255(r * 255 * v)},${clamp255(g * 255 * v)},${clamp255(b * 255 * v)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness: micro-bumps pattern
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(502);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Periodic orange-peel bump pattern
        const bump = Math.sin(x * 0.3) * Math.sin(y * 0.3) * 15;
        const v = clamp255(100 + bump + (randR() - 0.5) * 20);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal: fine stipple from heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    const randH = seededRandom(603);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const stipple = Math.sin(x * 0.4) * Math.cos(y * 0.4) * 10;
        const v = clamp255(128 + stipple + (randH() - 0.5) * 12);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generateCastIron(): TextureSet {
    const key = 'castIron';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const rand = seededRandom(701);

    // Diffuse: dark gray with sandy granularity
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 60 + (rand() - 0.5) * 30;
        const v = clamp255(base);
        diffCtx.fillStyle = `rgb(${v},${v},${clamp255(v - 3)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness: high overall with grain
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(802);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = clamp255(180 + (randR() - 0.5) * 50);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal: rough stipple heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    const randH = seededRandom(903);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = clamp255(128 + (randH() - 0.5) * 60);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generateRubber(): TextureSet {
    const key = 'rubber';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const rand = seededRandom(1001);
    const spacing = 16; // diamond/crosshatch cell size

    // Diffuse: dark with crosshatch/diamond pattern
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Diamond knurl: raised where both diagonals align
        const d1 = (x + y) % spacing;
        const d2 = (x - y + TEX_SIZE * spacing) % spacing;
        const edge1 = Math.min(d1, spacing - d1);
        const edge2 = Math.min(d2, spacing - d2);
        const diamond = Math.min(edge1, edge2) / (spacing * 0.5);
        const base = 35 + diamond * 15 + (rand() - 0.5) * 6;
        const v = clamp255(base);
        diffCtx.fillStyle = `rgb(${v},${v},${v})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness: high uniform with diamond pattern
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(1102);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const d1 = (x + y) % spacing;
        const d2 = (x - y + TEX_SIZE * spacing) % spacing;
        const edge1 = Math.min(d1, spacing - d1);
        const edge2 = Math.min(d2, spacing - d2);
        const diamond = Math.min(edge1, edge2) / (spacing * 0.5);
        const v = clamp255(200 - diamond * 30 + (randR() - 0.5) * 10);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal: diamond knurl heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const d1 = (x + y) % spacing;
        const d2 = (x - y + TEX_SIZE * spacing) % spacing;
        const edge1 = Math.min(d1, spacing - d1);
        const edge2 = Math.min(d2, spacing - d2);
        const diamond = Math.min(edge1, edge2) / (spacing * 0.5);
        const v = clamp255(128 + diamond * 60);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generatePlastic(baseColor: number): TextureSet {
    const key = `plastic_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const [cr, cg, cb] = hexToRGB(baseColor);
    const rand = seededRandom(1201);

    // Diffuse: smooth with subtle flow lines from injection molding
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Gentle swirl pattern to mimic flow lines
        const swirl = Math.sin(x * 0.02 + Math.sin(y * 0.03) * 2) * 0.015;
        const v = 1.0 + swirl + (rand() - 0.5) * 0.01;
        diffCtx.fillStyle = `rgb(${clamp255(cr * 255 * v)},${clamp255(cg * 255 * v)},${clamp255(cb * 255 * v)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness: mostly smooth with faint swirls
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(1302);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const swirl = Math.sin(x * 0.02 + Math.sin(y * 0.03) * 2) * 8;
        const v = clamp255(60 + swirl + (randR() - 0.5) * 6);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal: very subtle flow lines
    const [heightCanvas, heightCtx] = makeCanvas();
    const randH = seededRandom(1403);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const flow = Math.sin(x * 0.02 + Math.sin(y * 0.03) * 2) * 8;
        const v = clamp255(128 + flow + (randH() - 0.5) * 4);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generateConcreteFloor(): TextureSet {
    const key = 'concreteFloor';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const rand = seededRandom(1501);

    // Diffuse: gray with aggregates, cracks, stains
    const [diffCanvas, diffCtx] = makeCanvas();
    // Base gray fill
    diffCtx.fillStyle = '#9a9a9a';
    diffCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    // Random aggregate speckles
    for (let i = 0; i < 3000; i++) {
      const ax = rand() * TEX_SIZE;
      const ay = rand() * TEX_SIZE;
      const ar = 1 + rand() * 3;
      const shade = clamp255(120 + rand() * 80);
      diffCtx.fillStyle = `rgb(${shade},${shade - 5},${shade - 10})`;
      diffCtx.beginPath();
      diffCtx.arc(ax, ay, ar, 0, Math.PI * 2);
      diffCtx.fill();
    }
    // Stains (darker splotches)
    for (let i = 0; i < 8; i++) {
      const sx = rand() * TEX_SIZE;
      const sy = rand() * TEX_SIZE;
      const sr = 20 + rand() * 40;
      const grad = diffCtx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      grad.addColorStop(0, 'rgba(80,75,70,0.3)');
      grad.addColorStop(1, 'rgba(80,75,70,0)');
      diffCtx.fillStyle = grad;
      diffCtx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // Cracks (thin dark lines using bezier curves)
    diffCtx.strokeStyle = 'rgba(60,60,60,0.4)';
    diffCtx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const startX = rand() * TEX_SIZE;
      const startY = rand() * TEX_SIZE;
      diffCtx.beginPath();
      diffCtx.moveTo(startX, startY);
      diffCtx.bezierCurveTo(
        startX + (rand() - 0.5) * 100,
        startY + (rand() - 0.5) * 100,
        startX + (rand() - 0.5) * 150,
        startY + (rand() - 0.5) * 150,
        startX + (rand() - 0.5) * 200,
        startY + (rand() - 0.5) * 200,
      );
      diffCtx.stroke();
    }
    addNoise(diffCtx, TEX_SIZE, TEX_SIZE, 0.03);

    // Roughness: varied (smoother where worn, rougher in divots)
    const [roughCanvas, roughCtx] = makeCanvas();
    roughCtx.fillStyle = '#a0a0a0'; // base medium-high roughness
    roughCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    // Smoother worn patches
    const randR = seededRandom(1602);
    for (let i = 0; i < 12; i++) {
      const px = randR() * TEX_SIZE;
      const py = randR() * TEX_SIZE;
      const pr = 30 + randR() * 60;
      const grad = roughCtx.createRadialGradient(px, py, 0, px, py, pr);
      grad.addColorStop(0, 'rgba(90,90,90,0.6)');
      grad.addColorStop(1, 'rgba(90,90,90,0)');
      roughCtx.fillStyle = grad;
      roughCtx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    addNoise(roughCtx, TEX_SIZE, TEX_SIZE, 0.06);

    // Normal: aggregate bumps heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    heightCtx.fillStyle = '#808080';
    heightCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const randH = seededRandom(1703);
    // Aggregate bumps
    for (let i = 0; i < 3000; i++) {
      const ax = randH() * TEX_SIZE;
      const ay = randH() * TEX_SIZE;
      const ar = 1 + randH() * 3;
      const shade = clamp255(128 + randH() * 40);
      heightCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
      heightCtx.beginPath();
      heightCtx.arc(ax, ay, ar, 0, Math.PI * 2);
      heightCtx.fill();
    }
    addNoise(heightCtx, TEX_SIZE, TEX_SIZE, 0.04);
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generateWoodGrain(baseColor: number): TextureSet {
    const key = `woodGrain_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const [cr, cg, cb] = hexToRGB(baseColor);
    const rand = seededRandom(1801);

    // Diffuse: plank grain lines
    const [diffCanvas, diffCtx] = makeCanvas();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Grain runs vertically (along y); x controls grain frequency
        const grain = Math.sin(x * 0.15 + Math.sin(y * 0.005 + x * 0.01) * 8) * 0.5 + 0.5;
        const variation = grain * 0.3 + 0.7;
        const noise = (rand() - 0.5) * 0.03;
        const m = variation + noise;
        diffCtx.fillStyle = `rgb(${clamp255(cr * 255 * m)},${clamp255(cg * 255 * m)},${clamp255(cb * 255 * m)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }

    // Roughness: follows grain
    const [roughCanvas, roughCtx] = makeCanvas();
    const randR = seededRandom(1902);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const grain = Math.sin(x * 0.15 + Math.sin(y * 0.005 + x * 0.01) * 8) * 0.5 + 0.5;
        const v = clamp255(120 + grain * 40 + (randR() - 0.5) * 10);
        roughCtx.fillStyle = `rgb(${v},${v},${v})`;
        roughCtx.fillRect(x, y, 1, 1);
      }
    }

    // Normal: grain relief heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    const randH = seededRandom(2003);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const grain = Math.sin(x * 0.15 + Math.sin(y * 0.005 + x * 0.01) * 8) * 0.5 + 0.5;
        const v = clamp255(128 + grain * 30 + (randH() - 0.5) * 8);
        heightCtx.fillStyle = `rgb(${v},${v},${v})`;
        heightCtx.fillRect(x, y, 1, 1);
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  generateDiamondPlate(): TextureSet {
    const key = 'diamondPlate';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const rand = seededRandom(2101);
    const spacing = 32;
    const diamondSize = 12;

    // Diffuse: brushed steel base with raised diamond pattern
    const [diffCanvas, diffCtx] = makeCanvas();
    // Brushed steel base
    for (let y = 0; y < TEX_SIZE; y++) {
      const streak = 0.85 + rand() * 0.15;
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = clamp255(160 * streak + (rand() - 0.5) * 8);
        diffCtx.fillStyle = `rgb(${v},${v},${clamp255(v + 3)})`;
        diffCtx.fillRect(x, y, 1, 1);
      }
    }
    // Stamp diamonds (brighter, polished)
    for (let row = 0; row <= TEX_SIZE / spacing; row++) {
      for (let col = 0; col <= TEX_SIZE / spacing; col++) {
        const offsetX = (row % 2) * (spacing / 2);
        const cx = col * spacing + offsetX;
        const cy = row * spacing;
        for (let dy = -diamondSize; dy <= diamondSize; dy++) {
          for (let dx = -diamondSize; dx <= diamondSize; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > diamondSize) continue;
            const px = ((cx + dx) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            const py = ((cy + dy) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            const dist = (Math.abs(dx) + Math.abs(dy)) / diamondSize;
            const brightness = clamp255(190 + (1 - dist) * 40);
            diffCtx.fillStyle = `rgb(${brightness},${brightness},${clamp255(brightness + 3)})`;
            diffCtx.fillRect(px, py, 1, 1);
          }
        }
      }
    }

    // Roughness: diamonds smoother (darker), base rougher (lighter)
    const [roughCanvas, roughCtx] = makeCanvas();
    roughCtx.fillStyle = '#b0b0b0'; // base: rougher
    roughCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    addNoise(roughCtx, TEX_SIZE, TEX_SIZE, 0.02);
    for (let row = 0; row <= TEX_SIZE / spacing; row++) {
      for (let col = 0; col <= TEX_SIZE / spacing; col++) {
        const offsetX = (row % 2) * (spacing / 2);
        const cx = col * spacing + offsetX;
        const cy = row * spacing;
        for (let dy = -diamondSize; dy <= diamondSize; dy++) {
          for (let dx = -diamondSize; dx <= diamondSize; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > diamondSize) continue;
            const px = ((cx + dx) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            const py = ((cy + dy) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            roughCtx.fillStyle = '#505050'; // smoother on diamonds
            roughCtx.fillRect(px, py, 1, 1);
          }
        }
      }
    }

    // Normal: strong diamond relief heightmap
    const [heightCanvas, heightCtx] = makeCanvas();
    heightCtx.fillStyle = '#606060'; // base lower
    heightCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let row = 0; row <= TEX_SIZE / spacing; row++) {
      for (let col = 0; col <= TEX_SIZE / spacing; col++) {
        const offsetX = (row % 2) * (spacing / 2);
        const cx = col * spacing + offsetX;
        const cy = row * spacing;
        for (let dy = -diamondSize; dy <= diamondSize; dy++) {
          for (let dx = -diamondSize; dx <= diamondSize; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > diamondSize) continue;
            const px = ((cx + dx) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            const py = ((cy + dy) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
            const dist = (Math.abs(dx) + Math.abs(dy)) / diamondSize;
            const h = clamp255(96 + (1 - dist) * 140); // raised
            heightCtx.fillStyle = `rgb(${h},${h},${h})`;
            heightCtx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
    const normalCanvas = heightToNormal(heightCanvas);

    const set: TextureSet = {
      map: wrapTexture(diffCanvas),
      roughnessMap: wrapTexture(roughCanvas),
      normalMap: wrapTexture(normalCanvas),
    };
    this.cache.set(key, set);
    return set;
  }

  dispose(): void {
    for (const set of this.cache.values()) {
      set.map.dispose();
      set.roughnessMap.dispose();
      set.normalMap.dispose();
    }
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

const defaultGenerator = new ProceduralTextureGenerator();

export function applyProceduralTexture(
  material: THREE.MeshStandardMaterial,
  textureType: TextureType,
  tileScale: number = 2,
): void {
  // Preserve existing base color
  const baseColor = material.color.getHex();

  let texSet: TextureSet;

  switch (textureType) {
    case 'brushedMetal':
      texSet = defaultGenerator.generateBrushedMetal(baseColor);
      break;
    case 'paintedMetal':
      texSet = defaultGenerator.generatePaintedMetal(baseColor);
      break;
    case 'castIron':
      texSet = defaultGenerator.generateCastIron();
      break;
    case 'rubber':
      texSet = defaultGenerator.generateRubber();
      break;
    case 'plastic':
      texSet = defaultGenerator.generatePlastic(baseColor);
      break;
    case 'concrete':
      texSet = defaultGenerator.generateConcreteFloor();
      break;
    case 'wood':
      texSet = defaultGenerator.generateWoodGrain(baseColor);
      break;
    case 'diamondPlate':
      texSet = defaultGenerator.generateDiamondPlate();
      break;
  }

  // Apply textures with tiling
  material.map = texSet.map;
  material.roughnessMap = texSet.roughnessMap;
  material.normalMap = texSet.normalMap;

  material.map.repeat.set(tileScale, tileScale);
  material.roughnessMap.repeat.set(tileScale, tileScale);
  material.normalMap.repeat.set(tileScale, tileScale);

  material.needsUpdate = true;
}
