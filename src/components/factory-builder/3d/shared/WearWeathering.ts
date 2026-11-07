import * as THREE from 'three';

/**
 * Procedural wear, weathering, and aging effects for machine meshes.
 * Makes machines look realistically used rather than factory-new.
 */
export class WearWeatheringManager {
  private createdTextures: THREE.Texture[] = [];
  private createdGeometries: THREE.BufferGeometry[] = [];
  private createdMeshes: THREE.Mesh[] = [];
  private greaseCacheTextures: THREE.CanvasTexture[] = [];

  private stainGeometry: THREE.PlaneGeometry | null = null;
  private scratchGeometry: THREE.PlaneGeometry | null = null;
  private chipGeometry: THREE.PlaneGeometry | null = null;

  private readonly dirtyColor = new THREE.Color(0x3a3228);
  private readonly dustColor = new THREE.Color(0x9e9686);
  private readonly bareMetalColor = new THREE.Color(0xb0b0b0);

  /**
   * Derive a deterministic pseudo-random number from a seed string.
   */
  private seededRandom(seed: string, index: number): number {
    let hash = 0;
    const str = seed + index.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs((Math.sin(hash) * 43758.5453) % 1);
  }

  /**
   * Get or create the shared stain plane geometry.
   */
  private getStainGeometry(): THREE.PlaneGeometry {
    if (!this.stainGeometry) {
      this.stainGeometry = new THREE.PlaneGeometry(1, 1);
      this.createdGeometries.push(this.stainGeometry);
    }
    return this.stainGeometry;
  }

  /**
   * Get or create the shared scratch plane geometry.
   */
  private getScratchGeometry(): THREE.PlaneGeometry {
    if (!this.scratchGeometry) {
      this.scratchGeometry = new THREE.PlaneGeometry(0.2, 0.002);
      this.createdGeometries.push(this.scratchGeometry);
    }
    return this.scratchGeometry;
  }

  /**
   * Get or create the shared chip plane geometry.
   */
  private getChipGeometry(): THREE.PlaneGeometry {
    if (!this.chipGeometry) {
      this.chipGeometry = new THREE.PlaneGeometry(1, 1);
      this.createdGeometries.push(this.chipGeometry);
    }
    return this.chipGeometry;
  }

  /**
   * Get a cached grease stain texture (4 variations).
   */
  private getGreaseTexture(variant: number): THREE.CanvasTexture {
    if (this.greaseCacheTextures.length === 0) {
      for (let i = 0; i < 4; i++) {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        const cx = size / 2 + (i - 2) * 3;
        const cy = size / 2 + (i - 1) * 2;
        const radius = size / 2 - 4;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(30, 25, 20, ${0.6 + i * 0.1})`);
        gradient.addColorStop(0.5, `rgba(40, 32, 25, ${0.3 + i * 0.05})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        this.greaseCacheTextures.push(texture);
        this.createdTextures.push(texture);
      }
    }
    return this.greaseCacheTextures[variant % this.greaseCacheTextures.length];
  }

  /**
   * Apply wear effects to all meshes in a group by cloning and modifying materials.
   */
  applyWear(group: THREE.Group, wearLevel?: number): void {
    const wear = wearLevel ?? (0.1 + this.seededRandom(group.uuid, 0) * 0.4);

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!(child.material instanceof THREE.MeshStandardMaterial)) return;

      const mat = child.material.clone() as THREE.MeshStandardMaterial;

      // Edge wear: increase metalness (paint wearing off reveals metal)
      mat.metalness = Math.min(1, mat.metalness + wear * 0.15);

      // Color darkening: blend toward dirty color
      mat.color.lerp(this.dirtyColor, wear * 0.15);

      // Roughness increase: worn surfaces are rougher
      mat.roughness = Math.min(1, mat.roughness + wear * 0.1);

      // Emissive dim: dirty lenses/covers reduce glow
      if (mat.emissive && mat.emissiveIntensity > 0) {
        mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - wear * 0.2);
      }

      child.material = mat;
    });
  }

  /**
   * Add small dark semi-transparent grease stain planes on top surfaces.
   */
  addGreaseStains(group: THREE.Group, count?: number): void {
    const stainCount = count ?? (1 + Math.floor(this.seededRandom(group.uuid, 10) * 3));
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);

    const geometry = this.getStainGeometry();

    for (let i = 0; i < stainCount; i++) {
      const r = (idx: number) => this.seededRandom(group.uuid, 100 + i * 10 + idx);

      const stainSize = 0.05 + r(0) * 0.1;
      const texture = this.getGreaseTexture(i);

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.15 + r(1) * 0.15,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(stainSize, stainSize, 1);

      // Position on a horizontal surface (y-up), on top of the bounding box
      mesh.position.set(
        box.min.x + r(2) * size.x,
        box.max.y + 0.001,
        box.min.z + r(3) * size.z
      );

      // Rotate to lie flat (face up)
      mesh.rotation.x = -Math.PI / 2;

      group.add(mesh);
      this.createdMeshes.push(mesh);
    }
  }

  /**
   * Apply a dust layer by shifting colors toward warm gray and increasing roughness.
   */
  addDustLayer(group: THREE.Group, intensity?: number): void {
    const dustIntensity = intensity ?? (0.05 + this.seededRandom(group.uuid, 20) * 0.1);

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!(child.material instanceof THREE.MeshStandardMaterial)) return;

      // Only modify if material is already cloned (has been through applyWear)
      // or clone it now
      if (child.material.userData._dustApplied) return;

      const mat = child.material.clone() as THREE.MeshStandardMaterial;
      mat.color.lerp(this.dustColor, dustIntensity);
      mat.roughness = Math.min(1, mat.roughness + dustIntensity * 0.15);
      mat.userData._dustApplied = true;

      child.material = mat;
    });
  }

  /**
   * Add thin scratch mark meshes on surfaces.
   */
  addScratchMarks(group: THREE.Group, count?: number): void {
    const scratchCount = count ?? (2 + Math.floor(this.seededRandom(group.uuid, 30) * 4));
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);

    const geometry = this.getScratchGeometry();

    for (let i = 0; i < scratchCount; i++) {
      const r = (idx: number) => this.seededRandom(group.uuid, 200 + i * 10 + idx);

      const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.8,
        roughness: 0.3,
      });

      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(
        box.min.x + r(0) * size.x,
        box.min.y + r(1) * size.y,
        box.min.z + r(2) * size.z
      );

      // Random rotation on the surface
      mesh.rotation.set(
        r(3) * Math.PI,
        r(4) * Math.PI,
        r(5) * Math.PI
      );

      group.add(mesh);
      this.createdMeshes.push(mesh);
    }
  }

  /**
   * Add small paint chip patches near edges revealing bare metal.
   */
  addPaintChips(group: THREE.Group, count?: number): void {
    const chipCount = count ?? (1 + Math.floor(this.seededRandom(group.uuid, 40) * 4));
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const geometry = this.getChipGeometry();

    for (let i = 0; i < chipCount; i++) {
      const r = (idx: number) => this.seededRandom(group.uuid, 300 + i * 10 + idx);

      const chipSize = 0.01 + r(0) * 0.02;

      const material = new THREE.MeshStandardMaterial({
        color: this.bareMetalColor,
        metalness: 0.9,
        roughness: 0.2,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(chipSize, chipSize, 1);

      // Position near edges (offset from center toward bounding box edges)
      const edgeAxis = Math.floor(r(1) * 3); // 0=x, 1=y, 2=z
      const edgeSign = r(2) > 0.5 ? 1 : -1;

      const pos = new THREE.Vector3(
        box.min.x + r(3) * size.x,
        box.min.y + r(4) * size.y,
        box.min.z + r(5) * size.z
      );

      // Push toward the chosen edge
      if (edgeAxis === 0) pos.x = edgeSign > 0 ? box.max.x - chipSize : box.min.x + chipSize;
      else if (edgeAxis === 1) pos.y = edgeSign > 0 ? box.max.y - chipSize : box.min.y + chipSize;
      else pos.z = edgeSign > 0 ? box.max.z - chipSize : box.min.z + chipSize;

      mesh.position.copy(pos);
      mesh.rotation.set(r(6) * Math.PI, r(7) * Math.PI, 0);

      group.add(mesh);
      this.createdMeshes.push(mesh);
    }
  }

  /**
   * Convenience method to apply a full weathering pass based on age category.
   */
  weatherAll(group: THREE.Group, age: 'new' | 'used' | 'old'): void {
    switch (age) {
      case 'new': {
        this.applyWear(group, 0.05);
        this.addDustLayer(group, 0.03);
        const scratchCount = Math.floor(this.seededRandom(group.uuid, 50) * 2); // 0-1
        if (scratchCount > 0) {
          this.addScratchMarks(group, scratchCount);
        }
        break;
      }
      case 'used': {
        this.applyWear(group, 0.2);
        this.addGreaseStains(group, 1 + Math.floor(this.seededRandom(group.uuid, 51) * 2));
        this.addDustLayer(group, 0.08);
        this.addScratchMarks(group, 2 + Math.floor(this.seededRandom(group.uuid, 52) * 3));
        this.addPaintChips(group, 1 + Math.floor(this.seededRandom(group.uuid, 53) * 2));
        break;
      }
      case 'old': {
        this.applyWear(group, 0.4);
        this.addGreaseStains(group, 2 + Math.floor(this.seededRandom(group.uuid, 54) * 3));
        this.addDustLayer(group, 0.14);
        this.addScratchMarks(group, 4 + Math.floor(this.seededRandom(group.uuid, 55) * 5));
        this.addPaintChips(group, 3 + Math.floor(this.seededRandom(group.uuid, 56) * 4));
        break;
      }
    }
  }

  /**
   * Clean up all created textures, geometries, and meshes.
   */
  dispose(): void {
    for (const texture of this.createdTextures) {
      texture.dispose();
    }
    this.createdTextures = [];
    this.greaseCacheTextures = [];

    for (const geometry of this.createdGeometries) {
      geometry.dispose();
    }
    this.createdGeometries = [];
    this.stainGeometry = null;
    this.scratchGeometry = null;
    this.chipGeometry = null;

    for (const mesh of this.createdMeshes) {
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    }
    this.createdMeshes = [];
  }
}
