import * as THREE from 'three';

export class MaterialVariationManager {
  private originalMaterials: Map<THREE.Mesh, THREE.Material>;
  private variationSeed: number;

  constructor() {
    this.originalMaterials = new Map();
    this.variationSeed = Math.random() * 10000;
  }

  private seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    let state = (hash ^ 0x5deece66d) >>> 0;
    return (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  private shouldSkipMaterial(material: THREE.MeshStandardMaterial): boolean {
    if (material.transparent && material.opacity < 1) {
      return true;
    }
    if (material.emissiveIntensity > 0.5) {
      return true;
    }
    const name = material.name.toLowerCase();
    if (name.includes('status') || name.includes('screen')) {
      return true;
    }
    return false;
  }

  applyVariation(group: THREE.Group, variationAmount: number = 0.08): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const material = child.material;
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      if (this.shouldSkipMaterial(material)) return;

      this.originalMaterials.set(child, material);

      const cloned = material.clone();
      const rng = this.seededRandom(child.uuid + String(this.variationSeed));

      // 1. Color Hue Shift
      const hsl = { h: 0, s: 0, l: 0 };
      cloned.color.getHSL(hsl);
      hsl.h += (rng() - 0.5) * 2 * variationAmount * 0.02;
      hsl.l += (rng() - 0.5) * 2 * variationAmount * 0.5;
      hsl.h = ((hsl.h % 1) + 1) % 1;
      hsl.l = Math.max(0, Math.min(1, hsl.l));
      cloned.color.setHSL(hsl.h, hsl.s, hsl.l);

      // 2. Roughness Variation
      cloned.roughness += (rng() - 0.5) * 2 * variationAmount * 0.15;
      cloned.roughness = Math.max(0, Math.min(1, cloned.roughness));

      // 3. Metalness Variation
      cloned.metalness += (rng() - 0.5) * 2 * variationAmount * 0.05;
      cloned.metalness = Math.max(0, Math.min(1, cloned.metalness));

      // 4. Emissive Variation
      if (cloned.emissiveIntensity > 0) {
        cloned.emissiveIntensity += (rng() - 0.5) * 2 * variationAmount * 0.3;
        cloned.emissiveIntensity = Math.max(0, cloned.emissiveIntensity);
      }

      // 5. Color Temperature Shift
      const tempShift = (rng() - 0.5) * 2 * variationAmount * 0.03;
      if (tempShift > 0) {
        cloned.color.r = Math.min(1, cloned.color.r + tempShift);
      } else {
        cloned.color.b = Math.min(1, cloned.color.b - tempShift);
      }

      child.material = cloned;
    });
  }

  applyBatchVariation(groups: THREE.Group[], batchSize: number = 3): void {
    for (let i = 0; i < groups.length; i++) {
      const batchIndex = Math.floor(i / batchSize);
      const batchRng = this.seededRandom('batch' + String(batchIndex) + String(this.variationSeed));

      const batchHueOffset = (batchRng() - 0.5) * 0.03;
      const batchLightnessOffset = (batchRng() - 0.5) * 0.06;
      const batchRoughnessOffset = (batchRng() - 0.5) * 0.04;

      const group = groups[i];
      const withinBatchVariation = 0.03;

      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const material = child.material;
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        if (this.shouldSkipMaterial(material)) return;

        this.originalMaterials.set(child, material);

        const cloned = material.clone();
        const rng = this.seededRandom(child.uuid + String(this.variationSeed));

        // Apply batch-level shift
        const hsl = { h: 0, s: 0, l: 0 };
        cloned.color.getHSL(hsl);
        hsl.h += batchHueOffset + (rng() - 0.5) * 2 * withinBatchVariation * 0.02;
        hsl.l += batchLightnessOffset + (rng() - 0.5) * 2 * withinBatchVariation * 0.5;
        hsl.h = ((hsl.h % 1) + 1) % 1;
        hsl.l = Math.max(0, Math.min(1, hsl.l));
        cloned.color.setHSL(hsl.h, hsl.s, hsl.l);

        // Roughness with batch offset
        cloned.roughness += batchRoughnessOffset + (rng() - 0.5) * 2 * withinBatchVariation * 0.15;
        cloned.roughness = Math.max(0, Math.min(1, cloned.roughness));

        // Metalness (small within-batch variation only)
        cloned.metalness += (rng() - 0.5) * 2 * withinBatchVariation * 0.05;
        cloned.metalness = Math.max(0, Math.min(1, cloned.metalness));

        // Emissive within-batch variation
        if (cloned.emissiveIntensity > 0) {
          cloned.emissiveIntensity += (rng() - 0.5) * 2 * withinBatchVariation * 0.3;
          cloned.emissiveIntensity = Math.max(0, cloned.emissiveIntensity);
        }

        // Temperature shift with batch coherence
        const tempShift = (rng() - 0.5) * 2 * withinBatchVariation * 0.03;
        if (tempShift > 0) {
          cloned.color.r = Math.min(1, cloned.color.r + tempShift);
        } else {
          cloned.color.b = Math.min(1, cloned.color.b - tempShift);
        }

        child.material = cloned;
      });
    }
  }

  restoreOriginal(group: THREE.Group): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const original = this.originalMaterials.get(child);
      if (original) {
        if (child.material instanceof THREE.Material && child.material !== original) {
          child.material.dispose();
        }
        child.material = original;
        this.originalMaterials.delete(child);
      }
    });
  }

  dispose(): void {
    this.originalMaterials.forEach((original, mesh) => {
      if (mesh.material instanceof THREE.Material && mesh.material !== original) {
        mesh.material.dispose();
      }
      mesh.material = original;
    });
    this.originalMaterials.clear();
  }
}
