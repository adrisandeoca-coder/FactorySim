import * as THREE from 'three';
import { mat } from './materials';

// ── Canvas texture helpers ────────────────────────────────────────────

/** Yellow/black diagonal hazard stripe pattern */
function createHazardStripeTexture(width = 256, height = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#222222';
  ctx.fillRect(0, 0, width, height);

  const stripeWidth = 20;
  ctx.fillStyle = '#ccaa00';
  ctx.strokeStyle = '#ccaa00';
  ctx.lineWidth = stripeWidth;

  for (let x = -height; x < width + height; x += stripeWidth * 2) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Subtle corrugated normal-ish pattern for walls (using bumpMap via canvas) */
function createCorrugatedTexture(width = 256, height = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  // Vertical ridges
  const ridgeSpacing = 16;
  for (let x = 0; x < width; x += ridgeSpacing) {
    ctx.fillStyle = '#999999';
    ctx.fillRect(x, 0, ridgeSpacing / 2, height);
    ctx.fillStyle = '#666666';
    ctx.fillRect(x + ridgeSpacing / 2, 0, ridgeSpacing / 2, height);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── Material factories ────────────────────────────────────────────────

function floorMaterial(): THREE.MeshStandardMaterial {
  return mat(0x7a8070, 0.05, 0.4);
}

function wallMaterial(): THREE.MeshStandardMaterial {
  const corrugated = createCorrugatedTexture();
  corrugated.repeat.set(8, 3);
  return mat(0xb0b0b0, 0.3, 0.6, { bumpMap: corrugated, bumpScale: 0.3 });
}

function steelMaterial(): THREE.MeshStandardMaterial {
  return mat(0x505560, 0.75, 0.35);
}

function concretePillarMaterial(): THREE.MeshStandardMaterial {
  return mat(0x808080, 0.05, 0.85);
}

// ── Geometry builder helpers ──────────────────────────────────────────

function makeBox(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

function makeCyl(rTop: number, rBot: number, h: number, seg: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

// ── Constants ─────────────────────────────────────────────────────────

const FLOOR_SIZE = 30;
const WALL_HEIGHT = 6;
const CEILING_HEIGHT = 8;
const HALF = FLOOR_SIZE / 2;

// ── Main export ───────────────────────────────────────────────────────

/**
 * Creates a factory building environment that surrounds the simulation area.
 * Adds floor, walls, ceiling trusses, lights, safety markings, and industrial details.
 * Returns the group so it can be managed (hidden, removed, etc.).
 */
export function createFactoryEnvironment3D(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'factoryEnvironment';

  // ── 1. Epoxy floor ──────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    floorMaterial(),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01; // Slightly below origin to avoid z-fighting
  floor.receiveShadow = true;
  group.add(floor);

  // ── 2. Safety markings ──────────────────────────────────────────

  const markingY = 0.001; // Just above floor

  // 2a. Yellow walkway lines — rectangle around the work area
  const yellowLineMat = mat(0xccaa00, 0.1, 0.7);
  const lineThickness = 0.08;
  const walkwayInset = 2; // Distance from floor edge

  // Lines along X axis (front and back of walkway)
  const lineX = FLOOR_SIZE - walkwayInset * 2;
  group.add(makeBox(lineX, 0.01, lineThickness, yellowLineMat, 0, markingY, HALF - walkwayInset));
  group.add(makeBox(lineX, 0.01, lineThickness, yellowLineMat, 0, markingY, -(HALF - walkwayInset)));

  // Lines along Z axis (left and right of walkway)
  const lineZ = FLOOR_SIZE - walkwayInset * 2;
  group.add(makeBox(lineThickness, 0.01, lineZ, yellowLineMat, HALF - walkwayInset, markingY, 0));
  group.add(makeBox(lineThickness, 0.01, lineZ, yellowLineMat, -(HALF - walkwayInset), markingY, 0));

  // 2b. Hazard stripes near edges
  const hazardTex = createHazardStripeTexture();
  hazardTex.repeat.set(10, 1);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    metalness: 0.05,
    roughness: 0.7,
  });

  // Back edge
  const hazardStrip = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, 0.6), hazardMat);
  hazardStrip.rotation.x = -Math.PI / 2;
  hazardStrip.position.set(0, markingY, -(HALF - 0.3));
  group.add(hazardStrip);

  // Side edges
  for (const side of [-1, 1]) {
    const sideHazard = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, 0.6), hazardMat);
    sideHazard.rotation.x = -Math.PI / 2;
    sideHazard.rotation.z = Math.PI / 2;
    sideHazard.position.set(side * (HALF - 0.3), markingY, 0);
    group.add(sideHazard);
  }

  // 2c. Fork truck crossing hatching (center of floor, perpendicular to back wall)
  const crossingWidth = 3;
  const crossingMat = new THREE.MeshStandardMaterial({
    map: hazardTex.clone(),
    metalness: 0.05,
    roughness: 0.7,
  });
  (crossingMat.map as THREE.CanvasTexture).repeat.set(4, 1);
  const crossing = new THREE.Mesh(new THREE.PlaneGeometry(crossingWidth, FLOOR_SIZE * 0.4), crossingMat);
  crossing.rotation.x = -Math.PI / 2;
  crossing.position.set(HALF * 0.55, markingY, 0);
  group.add(crossing);

  // ── 3. Walls (3 sides, front open) ─────────────────────────────

  const wallMat = wallMaterial();

  // Back wall
  const backWall = makeBox(FLOOR_SIZE, WALL_HEIGHT, 0.15, wallMat, 0, WALL_HEIGHT / 2, -HALF);
  group.add(backWall);

  // Left wall
  const leftWall = makeBox(0.15, WALL_HEIGHT, FLOOR_SIZE, wallMat, -HALF, WALL_HEIGHT / 2, 0);
  group.add(leftWall);

  // Right wall
  const rightWall = makeBox(0.15, WALL_HEIGHT, FLOOR_SIZE, wallMat, HALF, WALL_HEIGHT / 2, 0);
  group.add(rightWall);

  // ── 4. Ceiling structure ────────────────────────────────────────

  const steelMat = steelMaterial();

  // 4a. Main I-beam trusses running along X axis
  const beamHeight = 0.4;
  const beamWidth = 0.2;
  const beamCount = 3;
  for (let i = 0; i < beamCount; i++) {
    const z = -HALF + (FLOOR_SIZE / (beamCount + 1)) * (i + 1);
    // Top flange
    group.add(makeBox(FLOOR_SIZE, 0.05, beamWidth, steelMat, 0, CEILING_HEIGHT, z));
    // Bottom flange
    group.add(makeBox(FLOOR_SIZE, 0.05, beamWidth, steelMat, 0, CEILING_HEIGHT - beamHeight, z));
    // Web
    group.add(makeBox(FLOOR_SIZE, beamHeight, 0.04, steelMat, 0, CEILING_HEIGHT - beamHeight / 2, z));
  }

  // 4b. Cross beams running along Z axis
  const crossBeamCount = 4;
  for (let i = 0; i < crossBeamCount; i++) {
    const x = -HALF + (FLOOR_SIZE / (crossBeamCount + 1)) * (i + 1);
    group.add(makeBox(0.15, 0.3, FLOOR_SIZE, steelMat, x, CEILING_HEIGHT - 0.15, 0));
  }

  // 4c. Fluorescent light fixtures
  const lightFixtureMat = mat(0xffffff, 0.0, 0.5, {
    emissive: 0xeeeeff,
    emissiveIntensity: 0.8,
  });
  const lightFixtureHousingMat = mat(0xd0d0d0, 0.3, 0.5);

  const lightsPerRow = 4;
  const lightRows = 3;
  for (let row = 0; row < lightRows; row++) {
    const z = -HALF + (FLOOR_SIZE / (lightRows + 1)) * (row + 1);
    for (let col = 0; col < lightsPerRow; col++) {
      const x = -HALF + (FLOOR_SIZE / (lightsPerRow + 1)) * (col + 1);
      // Housing
      group.add(makeBox(1.5, 0.06, 0.35, lightFixtureHousingMat, x, CEILING_HEIGHT - beamHeight - 0.1, z));
      // Emissive panel (light surface)
      group.add(makeBox(1.4, 0.02, 0.28, lightFixtureMat, x, CEILING_HEIGHT - beamHeight - 0.07, z));
    }
  }

  // ── 5. Industrial details ───────────────────────────────────────

  // 5a. Column supports (steel pillars at corners)
  const pillarMat = concretePillarMaterial();
  const pillarPositions = [
    { x: -(HALF - 0.3), z: -(HALF - 0.3) },
    { x:  (HALF - 0.3), z: -(HALF - 0.3) },
    { x: -(HALF - 0.3), z:  (HALF - 0.3) },
    { x:  (HALF - 0.3), z:  (HALF - 0.3) },
  ];
  for (const pos of pillarPositions) {
    group.add(makeCyl(0.2, 0.2, CEILING_HEIGHT, 8, pillarMat, pos.x, CEILING_HEIGHT / 2, pos.z));
  }

  // 5b. Fire extinguisher on left wall
  const fireExtGroup = new THREE.Group();
  fireExtGroup.name = 'fireExtinguisher';
  const extRed = mat(0xcc2222, 0.15, 0.5);
  fireExtGroup.add(makeCyl(0.06, 0.06, 0.35, 12, extRed, 0, 0, 0));          // Body
  fireExtGroup.add(makeCyl(0.03, 0.03, 0.06, 8, mat(0x222222, 0.5, 0.4), 0, 0.2, 0)); // Valve
  fireExtGroup.add(makeCyl(0.015, 0.015, 0.12, 6, mat(0x222222, 0.3, 0.6), 0.04, 0.22, 0)); // Handle
  // Wall bracket
  fireExtGroup.add(makeBox(0.14, 0.04, 0.06, mat(0x666666, 0.5, 0.4), 0, 0.1, -0.04));
  fireExtGroup.position.set(-(HALF - 0.2), 1.5, -3);
  group.add(fireExtGroup);

  // 5c. Electrical panel on back wall
  const panelGroup = new THREE.Group();
  panelGroup.name = 'electricalPanel';
  panelGroup.add(makeBox(0.8, 1.0, 0.12, mat(0x707070, 0.4, 0.5), 0, 0, 0)); // Panel body
  panelGroup.add(makeBox(0.7, 0.15, 0.01, mat(0xccaa00, 0.1, 0.6), 0, 0.3, 0.07)); // DANGER label
  // Small handle
  panelGroup.add(makeBox(0.08, 0.15, 0.04, mat(0x333333, 0.5, 0.4), 0.25, -0.1, 0.08));
  panelGroup.position.set(4, 1.8, -(HALF - 0.12));
  group.add(panelGroup);

  // 5d. EXIT sign above open front
  const exitGroup = new THREE.Group();
  exitGroup.name = 'exitSign';
  const exitMat = mat(0x00cc44, 0.0, 0.4, {
    emissive: 0x00cc44,
    emissiveIntensity: 1.5,
  });
  exitGroup.add(makeBox(0.6, 0.25, 0.04, exitMat, 0, 0, 0));
  // Housing frame
  const frameMat = mat(0x333333, 0.5, 0.4);
  exitGroup.add(makeBox(0.66, 0.04, 0.06, frameMat, 0, 0.145, 0));
  exitGroup.add(makeBox(0.66, 0.04, 0.06, frameMat, 0, -0.145, 0));
  exitGroup.add(makeBox(0.04, 0.33, 0.06, frameMat, -0.31, 0, 0));
  exitGroup.add(makeBox(0.04, 0.33, 0.06, frameMat, 0.31, 0, 0));
  exitGroup.position.set(0, WALL_HEIGHT - 0.5, HALF - 0.1);
  group.add(exitGroup);

  scene.add(group);
  return group;
}
