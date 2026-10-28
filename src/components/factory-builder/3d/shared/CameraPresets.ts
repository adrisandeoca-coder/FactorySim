import * as THREE from 'three';
import type { ScenarioType } from './ScenarioRenderer';

/**
 * Per-scenario camera presets — supply-chain views need an aerial bird's-eye,
 * factory cells need a worker-eye angle, warehouses sit in between.
 *
 * The preset returns a position + look-at target relative to the scene's
 * bounding-box center and size, so it adapts to any scene.
 */

export interface CameraPreset {
  /** Camera position relative to (center.x, 0, center.z), scaled by maxDim. */
  positionMul: { x: number; y: number; z: number };
  /** What the camera looks at, relative to scene center. */
  targetOffset: { x: number; y: number; z: number };
  /** Optional FOV override. */
  fov?: number;
}

const PRESETS: Record<ScenarioType, CameraPreset> = {
  factory: {
    // Worker-eye angle, slightly elevated, looking at the cell.
    positionMul: { x: 1.4, y: 1.0, z: 1.4 },
    targetOffset: { x: 0, y: 0.4, z: 0 },
    fov: 50,
  },
  warehouse: {
    // Mid-range, slightly higher to read aisles and dock doors.
    positionMul: { x: 1.7, y: 1.4, z: 1.7 },
    targetOffset: { x: 0, y: 0.8, z: 0 },
    fov: 50,
  },
  'supply-chain': {
    // Aerial bird's-eye for site networks.
    positionMul: { x: 0.4, y: 2.6, z: 0.4 },
    targetOffset: { x: 0, y: 0, z: 0 },
    fov: 45,
  },
  mixed: {
    positionMul: { x: 1.4, y: 1.0, z: 1.4 },
    targetOffset: { x: 0, y: 0.4, z: 0 },
    fov: 50,
  },
};

/** Position the camera according to the scenario type's preset. */
export function applyCameraPreset(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  scenarioType: ScenarioType,
  sceneRoot: THREE.Object3D,
): void {
  const preset = PRESETS[scenarioType] ?? PRESETS.factory;
  const bbox = new THREE.Box3().setFromObject(sceneRoot);
  if (bbox.isEmpty()) return;
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  // Use the *larger* horizontal extent for camera distance — this fixes
  // "thin" scenes (e.g. a row of stations all at Z=0): in those cases size.z
  // is tiny and using max(x,y,z) leaves the camera way too far when only x
  // matters. We also enforce a sensible minimum so trivial scenes don't put
  // the camera right inside the entity.
  const horizExtent = Math.max(size.x, size.z, 2);
  const maxDim = Math.max(horizExtent, size.y, 2);

  camera.position.set(
    center.x + preset.positionMul.x * horizExtent,
    Math.max(2, preset.positionMul.y * maxDim),
    center.z + preset.positionMul.z * horizExtent,
  );
  if (preset.fov !== undefined) {
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
  }
  controls.target.set(
    center.x + preset.targetOffset.x,
    preset.targetOffset.y,
    center.z + preset.targetOffset.z,
  );
  controls.update();
}
