import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Tier 3a: GLB upload as static prop.
 *
 * Loads a user-uploaded .glb / .gltf, normalizes it (auto-fit bounds, center
 * on floor, cast/receive shadows), and returns it as a THREE.Group ready to
 * drop into the scenario scene. No rigging — uploaded GLBs are decorations.
 *
 * Tier 3b (rigged uploads) is intentionally out of scope: it requires either
 * a naming-convention contract or a click-to-assign UI, both meaningfully
 * larger pieces of work.
 */

export interface GLBLoadResult {
  group: THREE.Group;
  /** Uniform scale applied to fit `targetSize` (for inspector display). */
  appliedScale: number;
  /** Original bounding-box size before scaling, in source units. */
  sourceSize: THREE.Vector3;
}

export interface GLBLoadOptions {
  /** Largest dimension after scaling, in meters. Default: 1.0. */
  targetSize?: number;
  /** Center the model on its floor (Y=0 at the bottom of the bbox). Default: true. */
  centerOnFloor?: boolean;
}

const loader = new GLTFLoader();

/** Load from an ArrayBuffer (file upload) or URL. */
export async function loadGLB(source: ArrayBuffer | string, opts: GLBLoadOptions = {}): Promise<GLBLoadResult> {
  const targetSize = opts.targetSize ?? 1.0;
  const centerOnFloor = opts.centerOnFloor ?? true;

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    if (typeof source === 'string') {
      loader.load(source, (g) => resolve(g), undefined, (err) => reject(err));
    } else {
      loader.parse(source, '', (g) => resolve(g), (err) => reject(err as unknown as Error));
    }
  });

  const root = gltf.scene as THREE.Group;
  root.name = 'glbUpload';

  // Cast/receive shadows on every mesh.
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Compute bounding box and normalize.
  const bbox = new THREE.Box3().setFromObject(root);
  const sourceSize = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 1e-6);
  const scale = targetSize / maxDim;

  // Wrap so we can scale and translate without losing the original transforms.
  const wrapper = new THREE.Group();
  wrapper.name = 'glbProp';
  wrapper.add(root);
  wrapper.scale.setScalar(scale);

  if (centerOnFloor) {
    // After scaling, recompute bbox to position correctly.
    const scaledBbox = new THREE.Box3().setFromObject(wrapper);
    const center = scaledBbox.getCenter(new THREE.Vector3());
    root.position.x -= center.x / scale;
    root.position.z -= center.z / scale;
    root.position.y -= scaledBbox.min.y / scale;
  }

  return { group: wrapper, appliedScale: scale, sourceSize };
}

/** Convenience: parse a File (from <input type=file>) into a normalized prop. */
export async function loadGLBFromFile(file: File, opts: GLBLoadOptions = {}): Promise<GLBLoadResult> {
  const buf = await file.arrayBuffer();
  return loadGLB(buf, opts);
}
