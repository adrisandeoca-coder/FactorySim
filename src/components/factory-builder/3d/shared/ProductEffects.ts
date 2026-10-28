import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRODUCT_COLORS: number[] = [
  0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b,
  0x8b5cf6, 0xec4899, 0x06b6d4, 0xf97316,
];

// ---------------------------------------------------------------------------
// Shared geometry cache (reused across products of the same type)
// ---------------------------------------------------------------------------

const _geoCache = new Map<string, THREE.BufferGeometry>();

function getCachedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = _geoCache.get(key);
  if (!geo) {
    geo = factory();
    _geoCache.set(key, geo);
  }
  return geo;
}

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------

function makeRawMaterialGeo(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.12, 0.10, 0.12, 2, 2, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (Math.random() - 0.5) * 0.012);
    pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.008);
    pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 0.012);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeInProcessGeo(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.055, 0.055, 0.12, 16, 1, false);
}

function makeFinishedGeo(): THREE.BufferGeometry {
  // Beveled box via ExtrudeGeometry with a rounded-rect shape
  const w = 0.10;
  const h = 0.10;
  const bevel = 0.012;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + bevel, -h / 2);
  shape.lineTo(w / 2 - bevel, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + bevel);
  shape.lineTo(w / 2, h / 2 - bevel);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - bevel, h / 2);
  shape.lineTo(-w / 2 + bevel, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - bevel);
  shape.lineTo(-w / 2, -h / 2 + bevel);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + bevel, -h / 2);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.10,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
}

function makeElectronicGeo(): THREE.BufferGeometry {
  // Flat PCB board as the base — merge with small bumps
  const board = new THREE.BoxGeometry(0.14, 0.02, 0.10);
  // Simple approach: use board as the main geometry, bumps added as children in group
  // Return only the board here; bumps are added in createProductMesh
  return board;
}

function makeBottleGeo(): THREE.BufferGeometry {
  // Lathe geometry from a profile
  const points: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.04, 0),
    new THREE.Vector2(0.04, 0.06),
    new THREE.Vector2(0.035, 0.07),
    new THREE.Vector2(0.018, 0.08),
    new THREE.Vector2(0.018, 0.12),
    new THREE.Vector2(0.022, 0.125),
    new THREE.Vector2(0.022, 0.13),
    new THREE.Vector2(0.015, 0.13),
    new THREE.Vector2(0, 0.13),
  ];
  return new THREE.LatheGeometry(points, 16);
}

function makeAutomotiveGeo(): THREE.BufferGeometry {
  // L-shaped bracket: merge two boxes
  const arm1 = new THREE.BoxGeometry(0.14, 0.03, 0.04);
  const arm2 = new THREE.BoxGeometry(0.03, 0.10, 0.04);

  const m1 = new THREE.Matrix4().makeTranslation(0, 0, 0);
  const m2 = new THREE.Matrix4().makeTranslation(-0.055, 0.05, 0);

  const merged = mergeBufferGeometries([
    { geometry: arm1, matrix: m1 },
    { geometry: arm2, matrix: m2 },
  ]);
  arm1.dispose();
  arm2.dispose();
  return merged;
}

function makeFoodGeo(): THREE.BufferGeometry {
  // Rounded box approximation: sphere with fewer segments, slightly squished
  const geo = new THREE.SphereGeometry(0.06, 8, 6);
  geo.scale(1.0, 0.75, 1.0);
  return geo;
}

function makeDefaultGeo(): THREE.BufferGeometry {
  // Standard box with rounded edges via ExtrudeGeometry
  const s = 0.10;
  const r = 0.01;
  const shape = new THREE.Shape();
  shape.moveTo(-s / 2 + r, -s / 2);
  shape.lineTo(s / 2 - r, -s / 2);
  shape.quadraticCurveTo(s / 2, -s / 2, s / 2, -s / 2 + r);
  shape.lineTo(s / 2, s / 2 - r);
  shape.quadraticCurveTo(s / 2, s / 2, s / 2 - r, s / 2);
  shape.lineTo(-s / 2 + r, s / 2);
  shape.quadraticCurveTo(-s / 2, s / 2, -s / 2, s / 2 - r);
  shape.lineTo(-s / 2, -s / 2 + r);
  shape.quadraticCurveTo(-s / 2, -s / 2, -s / 2 + r, -s / 2);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.10,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
}

// ---------------------------------------------------------------------------
// Utility: merge buffer geometries with transforms
// ---------------------------------------------------------------------------

interface GeoEntry {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

function mergeBufferGeometries(entries: GeoEntry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIdx = 0;

  for (const e of entries) {
    totalVerts += (e.geometry.attributes.position as THREE.BufferAttribute).count;
    totalIdx += e.geometry.index ? e.geometry.index.count : 0;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices: number[] = [];

  let vertOffset = 0;

  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const e of entries) {
    const pos = e.geometry.attributes.position as THREE.BufferAttribute;
    const nrm = e.geometry.attributes.normal as THREE.BufferAttribute | undefined;
    const idx = e.geometry.index;

    normalMatrix.getNormalMatrix(e.matrix);

    for (let i = 0; i < pos.count; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(e.matrix);
      positions[(vertOffset + i) * 3] = _v.x;
      positions[(vertOffset + i) * 3 + 1] = _v.y;
      positions[(vertOffset + i) * 3 + 2] = _v.z;

      if (nrm) {
        _n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(normalMatrix).normalize();
      } else {
        _n.set(0, 1, 0);
      }
      normals[(vertOffset + i) * 3] = _n.x;
      normals[(vertOffset + i) * 3 + 1] = _n.y;
      normals[(vertOffset + i) * 3 + 2] = _n.z;
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vertOffset);
      }
    }

    vertOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (indices.length > 0) {
    merged.setIndex(indices);
  }
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// createProductMesh
// ---------------------------------------------------------------------------

export function createProductMesh(productType: string, colorIndex: number): THREE.Group {
  const group = new THREE.Group();
  const baseColor = PRODUCT_COLORS[colorIndex % PRODUCT_COLORS.length];
  const color = new THREE.Color(baseColor);

  const makeMat = (metalness = 0.3, roughness = 0.6): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive: color.clone().multiplyScalar(0.15),
      emissiveIntensity: 1.0,
    });

  switch (productType) {
    case 'raw_material': {
      // Rough box with irregular edges — geometry is NOT cached (random offsets)
      const geo = makeRawMaterialGeo();
      const mesh = new THREE.Mesh(geo, makeMat(0.1, 0.85));
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }

    case 'in_process': {
      const geo = getCachedGeo('in_process', makeInProcessGeo);
      const mesh = new THREE.Mesh(geo, makeMat(0.5, 0.4));
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }

    case 'finished': {
      const geo = getCachedGeo('finished', makeFinishedGeo);
      const mesh = new THREE.Mesh(geo, makeMat(0.35, 0.5));
      mesh.castShadow = true;
      // Center the extruded shape
      mesh.position.set(0, 0, -0.05);
      group.add(mesh);

      // Subtle label stripe
      const stripeGeo = getCachedGeo('finished_stripe', () => new THREE.PlaneGeometry(0.08, 0.015));
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.2,
        metalness: 0.0,
        roughness: 0.9,
        transparent: true,
        opacity: 0.6,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0.051, 0.05, 0);
      stripe.rotation.y = Math.PI / 2;
      group.add(stripe);
      break;
    }

    case 'electronic': {
      const boardGeo = getCachedGeo('electronic_board', makeElectronicGeo);
      const boardMat = makeMat(0.1, 0.7);
      boardMat.color.set(0x1a5c2a); // PCB green
      boardMat.emissive.set(0x0a3010);
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.castShadow = true;
      group.add(board);

      // Component bumps
      const bumpGeo = getCachedGeo('electronic_bump', () => new THREE.BoxGeometry(0.025, 0.015, 0.025));
      const bumpMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.6,
        roughness: 0.3,
        emissive: new THREE.Color(baseColor),
        emissiveIntensity: 0.2,
      });
      const offsets = [
        [-0.035, 0.0175, -0.02],
        [0.02, 0.0175, 0.015],
        [-0.01, 0.0175, 0.025],
        [0.04, 0.0175, -0.01],
      ];
      for (const [bx, by, bz] of offsets) {
        const bump = new THREE.Mesh(bumpGeo, bumpMat);
        bump.position.set(bx, by, bz);
        bump.castShadow = true;
        group.add(bump);
      }
      break;
    }

    case 'bottle': {
      const geo = getCachedGeo('bottle', makeBottleGeo);
      const mat = makeMat(0.05, 0.3);
      mat.transparent = true;
      mat.opacity = 0.85;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }

    case 'automotive': {
      const geo = getCachedGeo('automotive', makeAutomotiveGeo);
      const mesh = new THREE.Mesh(geo, makeMat(0.7, 0.25));
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }

    case 'food': {
      const geo = getCachedGeo('food', makeFoodGeo);
      const mesh = new THREE.Mesh(geo, makeMat(0.05, 0.8));
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }

    default: {
      const geo = getCachedGeo('default', makeDefaultGeo);
      const mesh = new THREE.Mesh(geo, makeMat(0.3, 0.6));
      mesh.castShadow = true;
      mesh.position.set(0, 0, -0.05);
      group.add(mesh);
      break;
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// MotionTrailManager
// ---------------------------------------------------------------------------

interface Trail {
  points: Float32Array;     // ring buffer: maxPoints * 3 floats
  alphas: Float32Array;     // per-point alpha
  head: number;             // write index in ring buffer
  count: number;            // how many points written so far (capped at maxPoints)
  maxPoints: number;
  line: THREE.Line;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
}

const TRAIL_VERTEX_SHADER = /* glsl */ `
  attribute float alpha;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor * (0.6 + 0.4 * vAlpha), vAlpha * 0.7);
  }
`;

export class MotionTrailManager {
  private scene: THREE.Scene;
  private trails = new Map<string, Trail>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  createTrail(id: string, color: number, maxPoints = 20): void {
    if (this.trails.has(id)) return;

    const points = new Float32Array(maxPoints * 3);
    const alphas = new Float32Array(maxPoints);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setDrawRange(0, 0);

    const c = new THREE.Color(color);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: c },
      },
      vertexShader: TRAIL_VERTEX_SHADER,
      fragmentShader: TRAIL_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    this.scene.add(line);

    this.trails.set(id, {
      points,
      alphas,
      head: 0,
      count: 0,
      maxPoints,
      line,
      geometry,
      material,
    });
  }

  updateTrail(id: string, position: THREE.Vector3): void {
    const trail = this.trails.get(id);
    if (!trail) return;

    const { points, maxPoints } = trail;
    const idx = trail.head;

    // Write new point at head
    points[idx * 3] = position.x;
    points[idx * 3 + 1] = position.y;
    points[idx * 3 + 2] = position.z;

    trail.head = (trail.head + 1) % maxPoints;
    if (trail.count < maxPoints) trail.count++;

    // Rebuild the draw-order positions and alphas so the line is contiguous
    // oldest first, newest last
    const drawCount = trail.count;
    const posAttr = trail.geometry.attributes.position as THREE.BufferAttribute;
    const alphaAttr = trail.geometry.attributes.alpha as THREE.BufferAttribute;

    for (let i = 0; i < drawCount; i++) {
      // Map draw index to ring buffer index: oldest is (head - count + maxPoints) % maxPoints
      const ringIdx = (trail.head - drawCount + i + maxPoints) % maxPoints;
      const age = i / Math.max(drawCount - 1, 1); // 0 = oldest, 1 = newest

      posAttr.setXYZ(
        i,
        points[ringIdx * 3],
        points[ringIdx * 3 + 1],
        points[ringIdx * 3 + 2],
      );
      alphaAttr.setX(i, age);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    trail.geometry.setDrawRange(0, drawCount);
  }

  removeTrail(id: string): void {
    const trail = this.trails.get(id);
    if (!trail) return;

    this.scene.remove(trail.line);
    trail.geometry.dispose();
    trail.material.dispose();
    this.trails.delete(id);
  }

  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, trail] of this.trails) {
      // Gradually fade all alpha values
      const alphaAttr = trail.geometry.attributes.alpha as THREE.BufferAttribute;
      let allFaded = true;
      const drawCount = trail.geometry.drawRange.count;

      for (let i = 0; i < drawCount; i++) {
        const a = alphaAttr.getX(i);
        const newA = Math.max(0, a - dt * 0.5);
        alphaAttr.setX(i, newA);
        if (newA > 0.001) allFaded = false;
      }
      alphaAttr.needsUpdate = true;

      // Mark fully faded trails for removal only if no new updates are coming
      // (i.e., count > 0 and all faded)
      if (allFaded && trail.count > 0 && drawCount > 0) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeTrail(id);
    }
  }

  dispose(): void {
    for (const [id] of this.trails) {
      this.removeTrail(id);
    }
    this.trails.clear();
  }
}

// ---------------------------------------------------------------------------
// ProductGlowManager
// ---------------------------------------------------------------------------

function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

let _glowTexture: THREE.Texture | null = null;
let _glowGeo: THREE.PlaneGeometry | null = null;

function getGlowTexture(): THREE.Texture {
  if (!_glowTexture) _glowTexture = createGlowTexture();
  return _glowTexture;
}

function getGlowGeo(): THREE.PlaneGeometry {
  if (!_glowGeo) _glowGeo = new THREE.PlaneGeometry(0.15, 0.15);
  return _glowGeo;
}

interface GlowEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class ProductGlowManager {
  private scene: THREE.Scene;
  private glows = new Map<string, GlowEntry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  createGlow(id: string, color: number): THREE.Mesh {
    if (this.glows.has(id)) {
      return this.glows.get(id)!.mesh;
    }

    const material = new THREE.MeshBasicMaterial({
      color,
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(getGlowGeo(), material);
    mesh.rotation.x = -Math.PI / 2; // Lay flat on floor
    mesh.position.y = 0.01;
    mesh.renderOrder = -1;

    this.scene.add(mesh);
    this.glows.set(id, { mesh, material });

    return mesh;
  }

  updatePosition(id: string, position: THREE.Vector3): void {
    const entry = this.glows.get(id);
    if (!entry) return;
    entry.mesh.position.set(position.x, 0.01, position.z);
  }

  removeGlow(id: string): void {
    const entry = this.glows.get(id);
    if (!entry) return;

    this.scene.remove(entry.mesh);
    entry.material.dispose();
    this.glows.delete(id);
  }

  dispose(): void {
    for (const [id] of this.glows) {
      this.removeGlow(id);
    }
    this.glows.clear();
  }
}
