import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Deterministic seeded random (simple splitmix32)
// ---------------------------------------------------------------------------
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// 1. Detailed Floor Texture (1024x1024)
// ---------------------------------------------------------------------------
export function createDetailedFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(42);

  // Base epoxy color
  ctx.fillStyle = '#7a8070';
  ctx.fillRect(0, 0, size, size);

  // Concrete aggregate – lots of tiny random dots
  for (let i = 0; i < 12000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const gray = 110 + Math.floor(rand() * 30);
    ctx.globalAlpha = 0.15 + rand() * 0.12;
    ctx.fillStyle = `rgb(${gray},${gray + Math.floor(rand() * 6)},${gray - Math.floor(rand() * 4)})`;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;

  // Expansion joints – thin dark grid every 256px
  ctx.strokeStyle = '#555850';
  ctx.lineWidth = 1.5;
  for (let g = 256; g < size; g += 256) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(size, g);
    ctx.stroke();
  }

  // Tire marks – faint curved streaks
  ctx.strokeStyle = '#5a5d54';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.18;
  for (let t = 0; t < 4; t++) {
    const sx = rand() * size;
    const sy = rand() * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(
      sx + (rand() - 0.5) * 300, sy + rand() * 200,
      sx + (rand() - 0.5) * 250, sy + rand() * 300,
      sx + (rand() - 0.5) * 400, sy + rand() * 350
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Oil stains – brownish translucent splotches
  const oilStains: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const ox = 100 + rand() * (size - 200);
    const oy = 100 + rand() * (size - 200);
    const or2 = 20 + rand() * 40;
    oilStains.push({ x: ox, y: oy, r: or2 });
    ctx.globalAlpha = 0.12 + rand() * 0.08;
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or2);
    grad.addColorStop(0, '#4a3a28');
    grad.addColorStop(0.6, '#5a4a32');
    grad.addColorStop(1, 'rgba(90,74,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, or2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Scuff marks – random short dark scratches
  ctx.strokeStyle = '#5e6058';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 30; i++) {
    const sx = rand() * size;
    const sy = rand() * size;
    const angle = rand() * Math.PI * 2;
    const len = 8 + rand() * 25;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// ---------------------------------------------------------------------------
// 2. Floor Normal Map (512x512)
// ---------------------------------------------------------------------------
export function createFloorNormalMap(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(101);

  // Flat base: (128,128,255)
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Subtle surface undulation via low-frequency noise
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Simple sine-based undulation
      const wave = Math.sin(x * 0.03) * Math.cos(y * 0.025) * 6;
      // Small high-frequency noise for epoxy texture
      const noise = (rand() - 0.5) * 8;
      data[idx] = Math.max(0, Math.min(255, 128 + wave + noise));         // R (x-normal)
      data[idx + 1] = Math.max(0, Math.min(255, 128 + wave * 0.7 + noise)); // G (y-normal)
      // B stays near 255 (z-normal pointing up)
      data[idx + 2] = Math.max(0, Math.min(255, 255 - Math.abs(wave) * 0.5));
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Bumps around expansion joints (every 128px in this 512 map – corresponds to 256px in 1024 floor)
  ctx.globalAlpha = 0.35;
  for (let g = 128; g < size; g += 128) {
    // Horizontal joint bump
    ctx.fillStyle = 'rgb(128,118,250)';
    ctx.fillRect(0, g - 1, size, 1);
    ctx.fillStyle = 'rgb(128,138,250)';
    ctx.fillRect(0, g + 1, size, 1);
    // Vertical joint bump
    ctx.fillStyle = 'rgb(118,128,250)';
    ctx.fillRect(g - 1, 0, 1, size);
    ctx.fillStyle = 'rgb(138,128,250)';
    ctx.fillRect(g + 1, 0, 1, size);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// ---------------------------------------------------------------------------
// 3. Floor Roughness Map (512x512)
// ---------------------------------------------------------------------------
export function createFloorRoughnessMap(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(77);

  // Base roughness: ~0.45 → gray value 115
  const baseGray = 115;
  ctx.fillStyle = `rgb(${baseGray},${baseGray},${baseGray})`;
  ctx.fillRect(0, 0, size, size);

  // Slightly shinier in center (trafficked area) – lighter patches
  ctx.globalAlpha = 0.15;
  const centerGrad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.45);
  centerGrad.addColorStop(0, 'rgb(90,90,90)');
  centerGrad.addColorStop(1, 'rgba(115,115,115,0)');
  ctx.fillStyle = centerGrad;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  // Rougher near walls/edges – darker band
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = `rgb(145,145,145)`;
  ctx.fillRect(0, 0, size, 30);        // top
  ctx.fillRect(0, size - 30, size, 30); // bottom
  ctx.fillRect(0, 0, 30, size);         // left
  ctx.fillRect(size - 30, 0, 30, size); // right
  ctx.globalAlpha = 1;

  // Oil stains – smoother (lighter) matching approximate oil positions
  // Reuse same seed offsets as floor texture oil stains
  const oilRand = seededRandom(42);
  // Skip non-oil draws to get to the same random state
  for (let i = 0; i < 12000 * 5 + 4 * 6 + 30 * 4; i++) oilRand();
  // Now generate matching oil positions (same seed progression as floor)
  // Use a dedicated seed for oil positions
  const oilPosRand = seededRandom(4200);
  for (let i = 0; i < 4; i++) {
    const ox = (100 + oilPosRand() * (1024 - 200)) / 2; // scale from 1024 to 512
    const oy = (100 + oilPosRand() * (1024 - 200)) / 2;
    const or2 = (20 + oilPosRand() * 40) / 2;
    ctx.globalAlpha = 0.25;
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or2);
    grad.addColorStop(0, 'rgb(80,80,80)');
    grad.addColorStop(1, 'rgba(115,115,115,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, or2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Random micro-variation
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 12;
    const v = Math.max(0, Math.min(255, data[i] + noise));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// ---------------------------------------------------------------------------
// 4. Wall Detail Texture (512x256)
// ---------------------------------------------------------------------------
export function createWallDetailTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(303);

  // Base corrugated metal – light gray
  ctx.fillStyle = '#b0b4b0';
  ctx.fillRect(0, 0, w, h);

  // Corrugation – subtle horizontal bands
  for (let y = 0; y < h; y++) {
    const brightness = 170 + Math.sin(y * 0.25) * 8;
    ctx.fillStyle = `rgb(${brightness},${brightness + 2},${brightness})`;
    ctx.fillRect(0, y, w, 1);
  }

  // Vertical rivet lines every ~64px
  ctx.fillStyle = '#8a8e8a';
  for (let x = 64; x < w; x += 64) {
    ctx.fillRect(x - 1, 0, 2, h);
    // Rivet dots along the line
    for (let ry = 16; ry < h; ry += 32) {
      ctx.beginPath();
      ctx.arc(x, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Faint rust streaks near top edge
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    const sx = rand() * w;
    const streakLen = 20 + rand() * 60;
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.bezierCurveTo(
      sx + (rand() - 0.5) * 15, streakLen * 0.3,
      sx + (rand() - 0.5) * 20, streakLen * 0.7,
      sx + (rand() - 0.5) * 10, streakLen
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Dents/dings – circular dark spots
  for (let i = 0; i < 5; i++) {
    const dx = 30 + rand() * (w - 60);
    const dy = 30 + rand() * (h - 60);
    const dr = 3 + rand() * 6;
    ctx.globalAlpha = 0.12 + rand() * 0.08;
    const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
    grad.addColorStop(0, '#606460');
    grad.addColorStop(1, 'rgba(176,180,176,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fine noise for metal grain
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 6;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------------------
// 5. Ceiling Dirt Texture (512x512)
// ---------------------------------------------------------------------------
export function createCeilingDirtTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(555);

  // Mostly clean white/light gray
  ctx.fillStyle = '#e8e4e0';
  ctx.fillRect(0, 0, size, size);

  // Subtle yellowing from age – warm tint over whole surface
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#d4c090';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  // Darker areas near HVAC vents (corners)
  const corners = [
    [0, 0],
    [size, 0],
    [0, size],
    [size, size],
  ];
  for (const [cx, cy] of corners) {
    ctx.globalAlpha = 0.12;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.35);
    grad.addColorStop(0, '#8a8680');
    grad.addColorStop(0.5, '#b0aca6');
    grad.addColorStop(1, 'rgba(232,228,224,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalAlpha = 1;

  // Light dust accumulation – random soft spots
  for (let i = 0; i < 20; i++) {
    const dx = rand() * size;
    const dy = rand() * size;
    const dr = 30 + rand() * 60;
    ctx.globalAlpha = 0.04 + rand() * 0.04;
    const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
    grad.addColorStop(0, '#a09a90');
    grad.addColorStop(1, 'rgba(232,228,224,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fine noise
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 5;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------------------
// Helper: create a canvas-based text decal plane
// ---------------------------------------------------------------------------
function createTextDecal(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  color: string,
  bgColor?: string,
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const geometry = new THREE.PlaneGeometry(width / 200, height / 200);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

// ---------------------------------------------------------------------------
// 6. SurfaceDetailManager
// ---------------------------------------------------------------------------
export class SurfaceDetailManager {
  private textures: THREE.CanvasTexture[] = [];
  private decals: THREE.Mesh[] = [];
  constructor(_scene: THREE.Scene) {
  }

  /** Apply detailed floor textures (map, normal, roughness) to the floor mesh. */
  enhanceFloor(floorMesh: THREE.Mesh): void {
    const floorMap = createDetailedFloorTexture();
    const normalMap = createFloorNormalMap();
    const roughnessMap = createFloorRoughnessMap();

    this.textures.push(floorMap, normalMap, roughnessMap);

    const material = floorMesh.material;
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      material.map = floorMap;
      material.normalMap = normalMap;
      material.normalScale = new THREE.Vector2(0.3, 0.3);
      material.roughnessMap = roughnessMap;
      material.needsUpdate = true;
    } else {
      // Replace with a standard material that supports PBR maps
      const newMat = new THREE.MeshStandardMaterial({
        map: floorMap,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughnessMap: roughnessMap,
        roughness: 0.45,
        metalness: 0.05,
      });
      floorMesh.material = newMat;
    }
  }

  /** Apply wall detail texture to wall meshes. */
  enhanceWalls(wallMeshes: THREE.Mesh[]): void {
    const wallMap = createWallDetailTexture();
    this.textures.push(wallMap);

    for (const wall of wallMeshes) {
      const material = wall.material;
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.map = wallMap;
        material.needsUpdate = true;
      } else {
        wall.material = new THREE.MeshStandardMaterial({
          map: wallMap,
          roughness: 0.6,
          metalness: 0.3,
        });
      }
    }
  }

  /** Add floor decals – zone labels, aisle numbers, fire lane text. */
  addFloorDecals(scene: THREE.Scene): void {
    // Zone / caution labels
    const caution1 = createTextDecal('CAUTION', 256, 64, 32, '#c8a800', 'rgba(60,60,50,0.7)');
    caution1.position.set(3, 0.002, 2);
    scene.add(caution1);
    this.decals.push(caution1);

    const caution2 = createTextDecal('ZONE 2', 256, 64, 30, '#c8a800', 'rgba(60,60,50,0.7)');
    caution2.position.set(-4, 0.002, -3);
    scene.add(caution2);
    this.decals.push(caution2);

    const caution3 = createTextDecal('ZONE 1', 256, 64, 30, '#c8a800', 'rgba(60,60,50,0.7)');
    caution3.position.set(-4, 0.002, 3);
    scene.add(caution3);
    this.decals.push(caution3);

    // Aisle numbers painted on floor
    const aisle1 = createTextDecal('A1', 128, 128, 56, '#e0e0e0');
    aisle1.position.set(0, 0.002, 5);
    scene.add(aisle1);
    this.decals.push(aisle1);

    const aisle2 = createTextDecal('A2', 128, 128, 56, '#e0e0e0');
    aisle2.position.set(0, 0.002, -5);
    scene.add(aisle2);
    this.decals.push(aisle2);

    // Fire lane text
    const fireLane = createTextDecal('KEEP CLEAR', 512, 64, 36, '#cc2222', 'rgba(40,40,40,0.6)');
    fireLane.position.set(8, 0.002, 0);
    scene.add(fireLane);
    this.decals.push(fireLane);
  }

  /** Dispose all managed textures and decals. */
  dispose(): void {
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.length = 0;

    for (const decal of this.decals) {
      if (decal.parent) {
        decal.parent.remove(decal);
      }
      decal.geometry.dispose();
      const mat = decal.material;
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.map?.dispose();
        mat.dispose();
      }
    }
    this.decals.length = 0;
  }
}
