import * as THREE from 'three';

// ── Cached geometries ──────────────────────────────────────────────────────────
const cache: { [key: string]: THREE.BufferGeometry } = {};

function getCached(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!cache[key]) cache[key] = factory();
  return cache[key];
}

// ── Default materials (lazy) ────────────────────────────────────────────────────
const seamMat = () => new THREE.MeshBasicMaterial({ color: 0x111111 });

const chromeMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.15 });

const rubberMat = () =>
  new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.0, roughness: 0.85 });

const darkMetalMat = () =>
  new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });

// ── Helper to set shadow flags ──────────────────────────────────────────────────
function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 1. panelWithSeams
// ─────────────────────────────────────────────────────────────────────────────────
export function panelWithSeams(
  width: number,
  height: number,
  seamWidth = 0.002,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const panelMat = mat ?? new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.4 });

  // Main panel
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMat);
  shadowed(panel);
  g.add(panel);

  // Seam strips along edges
  const sMat = seamMat();
  const halfW = width / 2;
  const halfH = height / 2;
  const offset = 0.0005; // slight z-offset so seams render in front

  // Top
  const topStrip = new THREE.Mesh(new THREE.BoxGeometry(width, seamWidth, seamWidth), sMat);
  topStrip.position.set(0, halfH, offset);
  g.add(topStrip);

  // Bottom
  const bottomStrip = new THREE.Mesh(new THREE.BoxGeometry(width, seamWidth, seamWidth), sMat);
  bottomStrip.position.set(0, -halfH, offset);
  g.add(bottomStrip);

  // Left
  const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(seamWidth, height, seamWidth), sMat);
  leftStrip.position.set(-halfW, 0, offset);
  g.add(leftStrip);

  // Right
  const rightStrip = new THREE.Mesh(new THREE.BoxGeometry(seamWidth, height, seamWidth), sMat);
  rightStrip.position.set(halfW, 0, offset);
  g.add(rightStrip);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 2. ventGrille
// ─────────────────────────────────────────────────────────────────────────────────
export function ventGrille(
  width: number,
  height: number,
  slotCount?: number,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const count = slotCount ?? Math.max(2, Math.floor(height / 0.015));

  // Background plate (dark, slightly recessed)
  const bgMat = mat ?? new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.7 });
  const bg = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.002), bgMat);
  shadowed(bg);
  g.add(bg);

  // Horizontal slot strips
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.2, roughness: 0.9 });
  const spacing = height / (count + 1);
  const slotHeight = spacing * 0.55;
  const slotGeo = getCached(
    `ventSlot_${width.toFixed(4)}_${slotHeight.toFixed(4)}`,
    () => new THREE.BoxGeometry(width * 0.9, slotHeight, 0.003),
  );

  const startY = -height / 2 + spacing;
  for (let i = 0; i < count; i++) {
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, startY + i * spacing, 0.001);
    shadowed(slot);
    g.add(slot);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 3. rivetRow
// ─────────────────────────────────────────────────────────────────────────────────
export function rivetRow(
  length: number,
  count: number,
  rivetRadius = 0.004,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  direction: 'x' | 'z' = 'x',
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const rMat = mat ?? new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.25 });
  const rivetGeo = getCached(
    `rivet_${rivetRadius.toFixed(4)}`,
    () => new THREE.CylinderGeometry(rivetRadius, rivetRadius * 1.1, rivetRadius * 0.6, 8),
  );

  const spacing = count > 1 ? length / (count - 1) : 0;
  const halfLen = length / 2;

  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? -halfLen + i * spacing : 0;
    const rivet = new THREE.Mesh(rivetGeo, rMat);
    if (direction === 'x') {
      rivet.position.set(offset, 0, 0);
    } else {
      rivet.position.set(0, 0, offset);
    }
    rivet.rotation.x = Math.PI / 2;
    shadowed(rivet);
    g.add(rivet);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 4. cableGrommet
// ─────────────────────────────────────────────────────────────────────────────────
export function cableGrommet(
  radius: number,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const rMat = mat ?? rubberMat();
  const geo = new THREE.TorusGeometry(radius, radius * 0.25, 8, 16);
  const mesh = new THREE.Mesh(geo, rMat);
  mesh.position.set(x, y, z);
  shadowed(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 5. handleBar
// ─────────────────────────────────────────────────────────────────────────────────
export function handleBar(
  width: number,
  height = 0.04,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const hMat = mat ?? chromeMat();
  const postRadius = 0.005;
  const postGeo = getCached(
    `handlePost_${height.toFixed(4)}`,
    () => new THREE.CylinderGeometry(postRadius, postRadius, height, 8),
  );
  const barGeo = getCached(
    `handleBar_${width.toFixed(4)}`,
    () => new THREE.CylinderGeometry(postRadius, postRadius, width, 8),
  );

  // Left post
  const leftPost = new THREE.Mesh(postGeo, hMat);
  leftPost.position.set(-width / 2, height / 2, 0);
  shadowed(leftPost);
  g.add(leftPost);

  // Right post
  const rightPost = new THREE.Mesh(postGeo, hMat);
  rightPost.position.set(width / 2, height / 2, 0);
  shadowed(rightPost);
  g.add(rightPost);

  // Cross bar (horizontal, rotated 90 on Z)
  const bar = new THREE.Mesh(barGeo, hMat);
  bar.position.set(0, height, 0);
  bar.rotation.z = Math.PI / 2;
  shadowed(bar);
  g.add(bar);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 6. indicatorLED
// ─────────────────────────────────────────────────────────────────────────────────
export function indicatorLED(
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const geo = getCached(
    'ledDome',
    () => new THREE.SphereGeometry(0.005, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  );
  const ledMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, ledMat);
  mesh.position.set(x, y, z);
  shadowed(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 7. hingeAssembly
// ─────────────────────────────────────────────────────────────────────────────────
export function hingeAssembly(
  height: number,
  mat?: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const hMat = mat ?? darkMetalMat();
  const knuckleRadius = 0.006;
  const knuckleHeight = height * 0.35;
  const pinRadius = 0.002;

  const knuckleGeo = getCached(
    `hingeKnuckle_${knuckleHeight.toFixed(4)}`,
    () => new THREE.CylinderGeometry(knuckleRadius, knuckleRadius, knuckleHeight, 8),
  );

  // Two knuckles
  const k1 = new THREE.Mesh(knuckleGeo, hMat);
  k1.position.set(0, -height / 2 + knuckleHeight / 2, 0);
  shadowed(k1);
  g.add(k1);

  const k2 = new THREE.Mesh(knuckleGeo, hMat);
  k2.position.set(0, height / 2 - knuckleHeight / 2, 0);
  shadowed(k2);
  g.add(k2);

  // Pin through center
  const pinGeo = getCached(
    `hingePin_${height.toFixed(4)}`,
    () => new THREE.CylinderGeometry(pinRadius, pinRadius, height, 6),
  );
  const pin = new THREE.Mesh(pinGeo, hMat);
  shadowed(pin);
  g.add(pin);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 8. rubberBumper
// ─────────────────────────────────────────────────────────────────────────────────
export function rubberBumper(
  radius: number,
  height = radius * 0.6,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const rMat = rubberMat();
  // Truncated cone: wider base, narrower top
  const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 12);
  const mesh = new THREE.Mesh(geo, rMat);
  mesh.position.set(x, y, z);
  shadowed(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 9. wireLoom
// ─────────────────────────────────────────────────────────────────────────────────
export function wireLoom(
  points: THREE.Vector3[],
  radius = 0.006,
  mat?: THREE.Material,
): THREE.Mesh {
  const wMat = mat ?? new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 });
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(8, points.length * 6);
  const geo = new THREE.TubeGeometry(curve, segments, radius, 6, false);
  const mesh = new THREE.Mesh(geo, wMat);
  shadowed(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 10. namePlateSlot
// ─────────────────────────────────────────────────────────────────────────────────
export function namePlateSlot(
  width: number,
  height: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Recessed dark background
  const bgMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.8 });
  const bg = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.001), bgMat);
  bg.position.z = -0.001;
  shadowed(bg);
  g.add(bg);

  // Raised border frame
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.3 });
  const borderThickness = 0.002;
  const halfW = width / 2;
  const halfH = height / 2;

  // Top border
  const topB = new THREE.Mesh(new THREE.BoxGeometry(width + borderThickness * 2, borderThickness, 0.002), borderMat);
  topB.position.set(0, halfH, 0);
  g.add(topB);

  // Bottom border
  const bottomB = new THREE.Mesh(new THREE.BoxGeometry(width + borderThickness * 2, borderThickness, 0.002), borderMat);
  bottomB.position.set(0, -halfH, 0);
  g.add(bottomB);

  // Left border
  const leftB = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, height, 0.002), borderMat);
  leftB.position.set(-halfW, 0, 0);
  g.add(leftB);

  // Right border
  const rightB = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, height, 0.002), borderMat);
  rightB.position.set(halfW, 0, 0);
  g.add(rightB);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Dispose cached geometries
// ─────────────────────────────────────────────────────────────────────────────────
export function disposeEnhancedHelpers(): void {
  for (const key of Object.keys(cache)) {
    cache[key].dispose();
    delete cache[key];
  }
}
