import * as THREE from 'three';

export enum LODLevel {
  HIGH = 0,      // < 8 units from camera: full detail
  MEDIUM = 1,    // 8-20 units: reduced detail
  LOW = 2,       // 20-40 units: simplified
  BILLBOARD = 3, // > 40 units: sprite/impostor
}

enum MeshImportance {
  CRITICAL = 0, // Always visible: main body, status lights
  DETAIL = 1,   // Hide at medium: bolts, small features, cables
  FINE = 2,     // Hide at low: interior components, text labels, decorations
}

interface LODEntry {
  group: THREE.Group;
  nodeType: string;
  currentLevel: LODLevel;
  criticalMeshes: THREE.Mesh[];
  detailMeshes: THREE.Mesh[];
  fineMeshes: THREE.Mesh[];
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  impostor: THREE.Sprite | null;
  worldPosition: THREE.Vector3;
}

const CRITICAL_PATTERNS = ['body', 'base', 'frame', 'shell'];
const DETAIL_PATTERNS = ['bolt', 'rivet', 'handle', 'button', 'knob', 'screw'];
const FINE_PATTERNS = ['interior', 'detail', 'decoration', 'label', 'wire', 'cable'];

/**
 * Material cache entry for simplified Lambert materials,
 * keyed by the hex color of the original material.
 */
const lambertCache = new Map<number, THREE.MeshLambertMaterial>();

function classifyMesh(mesh: THREE.Mesh): MeshImportance {
  const name = mesh.name.toLowerCase();

  for (const pattern of FINE_PATTERNS) {
    if (name.includes(pattern)) return MeshImportance.FINE;
  }
  for (const pattern of DETAIL_PATTERNS) {
    if (name.includes(pattern)) return MeshImportance.DETAIL;
  }
  for (const pattern of CRITICAL_PATTERNS) {
    if (name.includes(pattern)) return MeshImportance.CRITICAL;
  }

  // Default: treat unnamed meshes as critical so they stay visible
  return MeshImportance.CRITICAL;
}

function getLambertMaterial(color: THREE.Color): THREE.MeshLambertMaterial {
  const key = color.getHex();
  let mat = lambertCache.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    lambertCache.set(key, mat);
  }
  return mat;
}

export class LODManager {
  private camera: THREE.PerspectiveCamera;
  private entries: LODEntry[] = [];
  private frameCounter = 0;
  private updateInterval = 5;

  // Distance thresholds
  private highMax = 8;
  private mediumMax = 20;
  private lowMax = 40;

  // Hysteresis offset: 1 unit
  private hysteresis = 1;

  // Reusable vector to avoid per-frame allocation
  private _cameraPos = new THREE.Vector3();
  private _groupPos = new THREE.Vector3();

  // Offscreen renderer for impostors
  private impostorRenderer: THREE.WebGLRenderer | null = null;
  private impostorScene: THREE.Scene | null = null;
  private impostorCamera: THREE.PerspectiveCamera | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(group: THREE.Group, nodeType: string): void {
    const critical: THREE.Mesh[] = [];
    const detail: THREE.Mesh[] = [];
    const fine: THREE.Mesh[] = [];

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const importance = classifyMesh(child);
      switch (importance) {
        case MeshImportance.CRITICAL:
          critical.push(child);
          break;
        case MeshImportance.DETAIL:
          detail.push(child);
          break;
        case MeshImportance.FINE:
          fine.push(child);
          break;
      }
    });

    this.entries.push({
      group,
      nodeType,
      currentLevel: LODLevel.HIGH,
      criticalMeshes: critical,
      detailMeshes: detail,
      fineMeshes: fine,
      originalMaterials: new Map(),
      impostor: null,
      worldPosition: new THREE.Vector3(),
    });
  }

  registerAll(nodeGroups: Map<string, THREE.Group>): void {
    nodeGroups.forEach((group, nodeType) => {
      this.register(group, nodeType);
    });
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(): void {
    this.frameCounter++;
    if (this.frameCounter % this.updateInterval !== 0) return;

    this.camera.getWorldPosition(this._cameraPos);

    for (const entry of this.entries) {
      entry.group.getWorldPosition(this._groupPos);
      const distance = this._cameraPos.distanceTo(this._groupPos);

      const desiredLevel = this.distanceToLevel(distance, entry.currentLevel);
      if (desiredLevel !== entry.currentLevel) {
        this.applyLevel(entry, desiredLevel);
        entry.currentLevel = desiredLevel;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LOD level determination with hysteresis
  // ---------------------------------------------------------------------------

  private distanceToLevel(distance: number, currentLevel: LODLevel): LODLevel {
    // Transitioning DOWN (increasing LOD level / reducing detail) uses the
    // raw threshold. Transitioning UP (increasing detail) requires the
    // camera to be closer by the hysteresis offset.

    const h = this.hysteresis;

    // Determine the target level based on raw distance first
    let target: LODLevel;
    if (distance < this.highMax) {
      target = LODLevel.HIGH;
    } else if (distance < this.mediumMax) {
      target = LODLevel.MEDIUM;
    } else if (distance < this.lowMax) {
      target = LODLevel.LOW;
    } else {
      target = LODLevel.BILLBOARD;
    }

    // If no change, return early
    if (target === currentLevel) return currentLevel;

    // Going to higher detail (lower enum value): require passing hysteresis
    if (target < currentLevel) {
      // Check that distance is truly below the "upgrade" threshold
      if (currentLevel === LODLevel.MEDIUM && distance > this.highMax - h) {
        return currentLevel;
      }
      if (currentLevel === LODLevel.LOW && distance > this.mediumMax - h) {
        return currentLevel;
      }
      if (currentLevel === LODLevel.BILLBOARD && distance > this.lowMax - h) {
        return currentLevel;
      }
    }

    // Going to lower detail (higher enum value): use raw thresholds (already computed)
    return target;
  }

  // ---------------------------------------------------------------------------
  // Apply LOD changes
  // ---------------------------------------------------------------------------

  private applyLevel(entry: LODEntry, level: LODLevel): void {
    switch (level) {
      case LODLevel.HIGH:
        this.applyHigh(entry);
        break;
      case LODLevel.MEDIUM:
        this.applyMedium(entry);
        break;
      case LODLevel.LOW:
        this.applyLow(entry);
        break;
      case LODLevel.BILLBOARD:
        this.applyBillboard(entry);
        break;
    }
  }

  private applyHigh(entry: LODEntry): void {
    // Restore everything
    entry.group.visible = true;
    this.hideImpostor(entry);

    // Show all meshes
    for (const mesh of entry.fineMeshes) mesh.visible = true;
    for (const mesh of entry.detailMeshes) mesh.visible = true;
    for (const mesh of entry.criticalMeshes) mesh.visible = true;

    // Restore original materials
    this.restoreMaterials(entry);
  }

  private applyMedium(entry: LODEntry): void {
    entry.group.visible = true;
    this.hideImpostor(entry);

    // Show critical + detail, hide fine
    for (const mesh of entry.criticalMeshes) mesh.visible = true;
    for (const mesh of entry.detailMeshes) mesh.visible = true;
    for (const mesh of entry.fineMeshes) mesh.visible = false;

    // Restore originals first (in case coming from LOW)
    this.restoreMaterials(entry);

    // Simplify materials: remove env maps and normal maps
    entry.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.visible) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          // Store original before modifying
          if (!entry.originalMaterials.has(child)) {
            entry.originalMaterials.set(child, child.material);
          }
          mat.envMapIntensity = 0;
          mat.normalMap = null;
          mat.needsUpdate = true;
        }
      }
    });
  }

  private applyLow(entry: LODEntry): void {
    entry.group.visible = true;
    this.hideImpostor(entry);

    // Show only critical meshes
    for (const mesh of entry.criticalMeshes) mesh.visible = true;
    for (const mesh of entry.detailMeshes) mesh.visible = false;
    for (const mesh of entry.fineMeshes) mesh.visible = false;

    // Replace standard materials with lambert
    for (const mesh of entry.criticalMeshes) {
      if (!entry.originalMaterials.has(mesh)) {
        entry.originalMaterials.set(mesh, mesh.material);
      }

      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replacements: THREE.MeshLambertMaterial[] = [];

      for (const mat of sourceMaterials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          replacements.push(getLambertMaterial(mat.color));
        } else if (mat instanceof THREE.MeshLambertMaterial) {
          replacements.push(mat);
        } else {
          // Fallback: create a grey lambert
          replacements.push(getLambertMaterial(new THREE.Color(0x888888)));
        }
      }

      mesh.material = replacements.length === 1 ? replacements[0] : replacements;
    }
  }

  private applyBillboard(entry: LODEntry): void {
    // Hide the entire group and show an impostor sprite
    entry.group.visible = false;

    if (!entry.impostor) {
      entry.impostor = this.createImpostor(entry.group);
      entry.group.parent?.add(entry.impostor);
    }
    entry.impostor.visible = true;
  }

  // ---------------------------------------------------------------------------
  // Material restoration
  // ---------------------------------------------------------------------------

  private restoreMaterials(entry: LODEntry): void {
    for (const [mesh, original] of entry.originalMaterials) {
      mesh.material = original;
      // Ensure needsUpdate in case properties were mutated
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.needsUpdate = true;
      }
    }
    entry.originalMaterials.clear();
  }

  // ---------------------------------------------------------------------------
  // Impostor creation
  // ---------------------------------------------------------------------------

  createImpostor(group: THREE.Group): THREE.Sprite {
    const size = 64;

    // Lazy init offscreen renderer
    if (!this.impostorRenderer) {
      this.impostorRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      this.impostorRenderer.setSize(size, size);
      this.impostorScene = new THREE.Scene();
      this.impostorCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

      // Add basic lighting to the offscreen scene
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(1, 1, 1);
      this.impostorScene.add(light);
      this.impostorScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    }

    // Compute bounding box of the group
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const boxSize = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);

    // Clone the group into the offscreen scene temporarily
    const clone = group.clone(true);
    clone.visible = true;
    clone.traverse((child) => { child.visible = true; });

    // Center the clone at origin
    clone.position.sub(center);
    this.impostorScene!.add(clone);

    // Position camera to see the whole object from the front
    const dist = maxDim / (2 * Math.tan((this.impostorCamera!.fov * Math.PI) / 360));
    this.impostorCamera!.position.set(0, 0, dist * 1.2);
    this.impostorCamera!.lookAt(0, 0, 0);
    this.impostorCamera!.updateProjectionMatrix();

    // Render
    this.impostorRenderer.render(this.impostorScene!, this.impostorCamera!);

    // Extract texture from canvas
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.impostorRenderer.domElement, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Clean up clone
    this.impostorScene!.remove(clone);

    // Create sprite
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);

    // Position at group center, scale to approximate bounding box
    group.getWorldPosition(sprite.position);
    sprite.scale.set(maxDim, maxDim, 1);
    sprite.visible = false;

    return sprite;
  }

  // ---------------------------------------------------------------------------
  // Impostor visibility helper
  // ---------------------------------------------------------------------------

  private hideImpostor(entry: LODEntry): void {
    if (entry.impostor) {
      entry.impostor.visible = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setDistances(high: number, medium: number, low: number): void {
    this.highMax = high;
    this.mediumMax = medium;
    this.lowMax = low;
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): { total: number; high: number; medium: number; low: number; billboard: number } {
    let high = 0;
    let medium = 0;
    let low = 0;
    let billboard = 0;

    for (const entry of this.entries) {
      switch (entry.currentLevel) {
        case LODLevel.HIGH: high++; break;
        case LODLevel.MEDIUM: medium++; break;
        case LODLevel.LOW: low++; break;
        case LODLevel.BILLBOARD: billboard++; break;
      }
    }

    return { total: this.entries.length, high, medium, low, billboard };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    // Restore all materials to original state
    for (const entry of this.entries) {
      this.restoreMaterials(entry);

      // Remove and dispose impostors
      if (entry.impostor) {
        entry.impostor.parent?.remove(entry.impostor);
        const spriteMat = entry.impostor.material as THREE.SpriteMaterial;
        spriteMat.map?.dispose();
        spriteMat.dispose();
        entry.impostor = null;
      }

      // Restore visibility
      entry.group.visible = true;
      entry.group.traverse((child) => {
        child.visible = true;
      });
    }

    this.entries.length = 0;

    // Dispose offscreen renderer
    if (this.impostorRenderer) {
      this.impostorRenderer.dispose();
      this.impostorRenderer = null;
      this.impostorScene = null;
      this.impostorCamera = null;
    }

    // Clear lambert cache
    for (const mat of lambertCache.values()) {
      mat.dispose();
    }
    lambertCache.clear();
  }
}
