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
// Hash a string to a numeric seed
// ---------------------------------------------------------------------------
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Type-colour mapping for machine ID badges
// ---------------------------------------------------------------------------
const TYPE_COLORS: Record<string, string> = {
  station: '#2962ff',
  cncmill: '#2962ff',
  grinder: '#2962ff',
  conveyor: '#2e7d32',
  rollerconveyor: '#2e7d32',
  press: '#c62828',
  injectionmolder: '#c62828',
  roboticcell: '#ef6c00',
  agv: '#6a1b9a',
  forklift: '#6a1b9a',
  lasercutter: '#00838f',
  weldingcell: '#00838f',
  oven: '#d84315',
  heattreat: '#d84315',
};

// ---------------------------------------------------------------------------
// MachineDecalManager
// ---------------------------------------------------------------------------
export class MachineDecalManager {
  private textureCache: Map<string, THREE.CanvasTexture>;
  private decalMeshes: THREE.Mesh[];
  private sharedGeometries: Map<string, THREE.PlaneGeometry>;

  constructor() {
    this.textureCache = new Map();
    this.decalMeshes = [];
    this.sharedGeometries = new Map();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Apply appropriate decals to a machine group based on its type.
   */
  applyDecals(
    group: THREE.Group,
    machineType: string,
    machineName: string,
  ): void {
    const type = machineType.toLowerCase().replace(/[\s_-]/g, '');

    // Derive a deterministic seed from the group uuid
    const seed = hashString(group.uuid);
    const rand = seededRandom(seed);

    // Generate serial number from seed
    const sn = this.generateSerial(rand);

    // Determine which decals to apply
    const decals: THREE.Mesh[] = [];

    switch (type) {
      case 'station':
      case 'cncmill':
      case 'grinder':
        decals.push(
          this.createSafetyWarning(),
          this.createSerialPlate(sn),
          this.createCEMark(),
          this.createMachineIdBadge(machineName, type),
        );
        break;

      case 'press':
      case 'injectionmolder':
        decals.push(
          this.createPinchPointWarning(),
          this.createSafetyWarning(),
          this.createSerialPlate(sn),
          this.createLoadRating(Math.floor(500 + rand() * 4500)),
          this.createLockoutTag(),
        );
        break;

      case 'conveyor':
      case 'rollerconveyor':
        decals.push(
          this.createArrowLabel('right'),
          this.createPinchPointWarning(),
          this.createCEMark(),
        );
        break;

      case 'roboticcell':
        decals.push(
          this.createSafetyWarning(),
          this.createElectricalWarning(),
          this.createLockoutTag(),
          this.createSerialPlate(sn),
          this.createQRCode(),
        );
        break;

      case 'agv':
      case 'forklift':
        decals.push(
          this.createLoadRating(Math.floor(200 + rand() * 2800)),
          this.createSafetyWarning(),
          this.createMachineIdBadge(machineName, type),
        );
        break;

      case 'lasercutter':
      case 'weldingcell':
        decals.push(
          this.createSafetyWarning(),
          this.createElectricalWarning(),
          this.createCEMark(),
        );
        break;

      case 'oven':
      case 'heattreat':
        decals.push(
          this.createSafetyWarning('HOT SURFACE'),
          this.createSerialPlate(sn),
        );
        break;

      default:
        decals.push(this.createSerialPlate(sn), this.createCEMark());
        break;
    }

    // Measure the group bounding box to place decals sensibly
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const machineHeight = size.y || 1;
    const halfX = (size.x || 1) * 0.5;
    const halfZ = (size.z || 1) * 0.5;

    // Place each decal on the front or side surfaces
    for (let i = 0; i < decals.length; i++) {
      const mesh = decals[i];

      // Distribute decals across front (+z) and side (+x / -x) faces
      const face = i % 3; // 0 = front, 1 = right side, 2 = left side
      const yFraction = 0.3 + rand() * 0.5; // 0.3 – 0.8 of height
      const lateralOffset = -0.3 + rand() * 0.6; // spread along face

      const py = box.min.y + machineHeight * yFraction;

      if (face === 0) {
        // Front face (+z)
        mesh.position.set(
          center.x + lateralOffset * halfX,
          py,
          box.max.z + 0.001,
        );
        mesh.rotation.set(0, 0, (rand() - 0.5) * 0.07); // ±2°
      } else if (face === 1) {
        // Right side (+x)
        mesh.position.set(
          box.max.x + 0.001,
          py,
          center.z + lateralOffset * halfZ,
        );
        mesh.rotation.set(0, -Math.PI * 0.5, (rand() - 0.5) * 0.07);
      } else {
        // Left side (-x)
        mesh.position.set(
          box.min.x - 0.001,
          py,
          center.z + lateralOffset * halfZ,
        );
        mesh.rotation.set(0, Math.PI * 0.5, (rand() - 0.5) * 0.07);
      }

      group.add(mesh);
      this.decalMeshes.push(mesh);
    }
  }

  /**
   * Dispose of all cached textures, geometries, and meshes.
   */
  dispose(): void {
    this.textureCache.forEach((tex) => {
      tex.dispose();
    });
    this.textureCache.clear();

    this.sharedGeometries.forEach((geo) => {
      geo.dispose();
    });
    this.sharedGeometries.clear();

    this.decalMeshes.forEach((mesh) => {
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    });
    this.decalMeshes = [];
  }

  // -----------------------------------------------------------------------
  // Individual decal creators
  // -----------------------------------------------------------------------

  private createSafetyWarning(text: string = 'CAUTION'): THREE.Mesh {
    const cacheKey = `safety_${text}`;
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 128, (ctx) => {
        // Yellow background
        ctx.fillStyle = '#ffd600';
        ctx.fillRect(0, 0, 128, 128);

        // Black border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);

        // Black triangle
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(64, 16);
        ctx.lineTo(112, 96);
        ctx.lineTo(16, 96);
        ctx.closePath();
        ctx.fill();

        // Yellow inner triangle
        ctx.fillStyle = '#ffd600';
        ctx.beginPath();
        ctx.moveTo(64, 28);
        ctx.lineTo(104, 92);
        ctx.lineTo(24, 92);
        ctx.closePath();
        ctx.fill();

        // Exclamation mark
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 40px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 64, 66);

        // Text below triangle
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText(text, 64, 114);
      }),
    );

    return this.createDecalMesh(texture, 0.1, 0.1);
  }

  private createSerialPlate(serial: string): THREE.Mesh {
    const cacheKey = `serial_${serial}`;
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 48, (ctx) => {
        // Silver/aluminum background
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(0, 0, 128, 48);

        // Thin black border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(1, 1, 126, 46);

        // Inner bevel highlight
        ctx.strokeStyle = '#d8d8d8';
        ctx.lineWidth = 1;
        ctx.strokeRect(3, 3, 122, 42);

        // Serial number text
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(serial, 64, 24);
      }),
    );

    return this.createDecalMesh(texture, 0.08, 0.03);
  }

  private createCEMark(): THREE.Mesh {
    const cacheKey = 'ce_mark';
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(64, 64, (ctx) => {
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 64);

        // Circle outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(32, 32, 28, 0, Math.PI * 2);
        ctx.stroke();

        // "CE" text – specific proportions: bold, tightly spaced
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CE', 32, 33);
      }),
    );

    return this.createDecalMesh(texture, 0.04, 0.04);
  }

  private createPinchPointWarning(): THREE.Mesh {
    const cacheKey = 'pinch_point';
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 128, (ctx) => {
        // Red background
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(0, 0, 128, 128);

        // White border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, 120, 120);

        // Simplified hand/gear icon – two interlocking gears
        ctx.fillStyle = '#ffffff';
        // Left gear
        ctx.beginPath();
        ctx.arc(44, 50, 16, 0, Math.PI * 2);
        ctx.fill();
        // Right gear
        ctx.beginPath();
        ctx.arc(84, 50, 16, 0, Math.PI * 2);
        ctx.fill();
        // Inner circles (gear holes)
        ctx.fillStyle = '#d32f2f';
        ctx.beginPath();
        ctx.arc(44, 50, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(84, 50, 6, 0, Math.PI * 2);
        ctx.fill();

        // Gear teeth marks (simplified)
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const lx = 44 + Math.cos(angle) * 20;
          const ly = 50 + Math.sin(angle) * 20;
          ctx.fillRect(lx - 2, ly - 2, 4, 4);
          const rx = 84 + Math.cos(angle) * 20;
          const ry = 50 + Math.sin(angle) * 20;
          ctx.fillRect(rx - 2, ry - 2, 4, 4);
        }

        // Hand silhouette (simplified pointing hand between gears)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(58, 40);
        ctx.lineTo(70, 40);
        ctx.lineTo(70, 60);
        ctx.lineTo(58, 60);
        ctx.closePath();
        ctx.fill();

        // "DANGER" text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DANGER', 64, 88);

        // "PINCH POINT" text
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillText('PINCH POINT', 64, 104);
      }),
    );

    return this.createDecalMesh(texture, 0.1, 0.1);
  }

  private createElectricalWarning(): THREE.Mesh {
    const cacheKey = 'electrical';
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 128, (ctx) => {
        // Yellow background
        ctx.fillStyle = '#ffd600';
        ctx.fillRect(0, 0, 128, 128);

        // Black border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);

        // Black triangle
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(64, 10);
        ctx.lineTo(118, 88);
        ctx.lineTo(10, 88);
        ctx.closePath();
        ctx.fill();

        // Yellow inner triangle
        ctx.fillStyle = '#ffd600';
        ctx.beginPath();
        ctx.moveTo(64, 24);
        ctx.lineTo(108, 84);
        ctx.lineTo(20, 84);
        ctx.closePath();
        ctx.fill();

        // Lightning bolt
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(72, 32);
        ctx.lineTo(56, 58);
        ctx.lineTo(66, 58);
        ctx.lineTo(54, 80);
        ctx.lineTo(78, 52);
        ctx.lineTo(68, 52);
        ctx.lineTo(78, 32);
        ctx.closePath();
        ctx.fill();

        // "HIGH VOLTAGE" text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HIGH VOLTAGE', 64, 104);
      }),
    );

    return this.createDecalMesh(texture, 0.1, 0.1);
  }

  private createLockoutTag(): THREE.Mesh {
    const cacheKey = 'lockout';
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 128, (ctx) => {
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 128, 128);

        // Red border
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 120, 120);

        // Red padlock body
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(44, 42, 40, 32);

        // Padlock shackle
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 40, 14, Math.PI, 0);
        ctx.stroke();

        // Keyhole
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(64, 54, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(62, 54, 4, 10);

        // "LOCKOUT" text
        ctx.fillStyle = '#d32f2f';
        ctx.font = 'bold 13px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LOCKOUT', 64, 90);

        // "BEFORE SERVICE" text
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.fillText('BEFORE SERVICE', 64, 106);
      }),
    );

    return this.createDecalMesh(texture, 0.09, 0.09);
  }

  private createArrowLabel(
    direction: 'left' | 'right' | 'up' | 'down',
  ): THREE.Mesh {
    const cacheKey = `arrow_${direction}`;
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 64, (ctx) => {
        // Dark green background
        ctx.fillStyle = '#1b5e20';
        ctx.fillRect(0, 0, 128, 64);

        // White border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 124, 60);

        // Draw arrow
        ctx.fillStyle = '#ffffff';
        ctx.save();
        ctx.translate(64, 32);

        let rotAngle = 0;
        if (direction === 'left') rotAngle = Math.PI;
        else if (direction === 'up') rotAngle = -Math.PI * 0.5;
        else if (direction === 'down') rotAngle = Math.PI * 0.5;

        ctx.rotate(rotAngle);

        // Arrow pointing right (default)
        ctx.beginPath();
        ctx.moveTo(-30, -6);
        ctx.lineTo(10, -6);
        ctx.lineTo(10, -16);
        ctx.lineTo(36, 0);
        ctx.lineTo(10, 16);
        ctx.lineTo(10, 6);
        ctx.lineTo(-30, 6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }),
    );

    return this.createDecalMesh(texture, 0.1, 0.05);
  }

  private createMachineIdBadge(name: string, type: string): THREE.Mesh {
    const bgColor = TYPE_COLORS[type] || '#424242';
    const cacheKey = `badge_${name}_${type}`;
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(192, 64, (ctx) => {
        // Colored background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 192, 64);

        // Slightly lighter strip at top
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, 0, 192, 20);

        // White border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 188, 60);

        // Machine type label (small, top)
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(type.toUpperCase(), 96, 12);

        // Machine name (large)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial, sans-serif';
        const displayName =
          name.length > 16 ? name.substring(0, 15) + '\u2026' : name;
        ctx.fillText(displayName, 96, 40);
      }),
    );

    return this.createDecalMesh(texture, 0.12, 0.04);
  }

  private createQRCode(): THREE.Mesh {
    const cacheKey = 'qr_code';
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(64, 64, (ctx) => {
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 64);

        // Black border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 64, 64);

        const cellSize = 4;
        const gridCount = 13;
        const offset = (64 - gridCount * cellSize) * 0.5;
        const rand = seededRandom(12345);

        ctx.fillStyle = '#000000';

        // Three finder patterns (top-left, top-right, bottom-left)
        const drawFinder = (fx: number, fy: number) => {
          // Outer 7x7 ring
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
              if (
                r === 0 || r === 6 || c === 0 || c === 6 ||
                (r >= 2 && r <= 4 && c >= 2 && c <= 4)
              ) {
                ctx.fillRect(
                  offset + (fx + c) * cellSize,
                  offset + (fy + r) * cellSize,
                  cellSize,
                  cellSize,
                );
              }
            }
          }
        };

        drawFinder(0, 0);
        drawFinder(gridCount - 7, 0);
        drawFinder(0, gridCount - 7);

        // Random data modules in the remaining area
        for (let r = 0; r < gridCount; r++) {
          for (let c = 0; c < gridCount; c++) {
            // Skip finder pattern areas
            if (r < 8 && c < 8) continue;
            if (r < 8 && c >= gridCount - 8) continue;
            if (r >= gridCount - 8 && c < 8) continue;

            if (rand() > 0.5) {
              ctx.fillRect(
                offset + c * cellSize,
                offset + r * cellSize,
                cellSize,
                cellSize,
              );
            }
          }
        }
      }),
    );

    return this.createDecalMesh(texture, 0.05, 0.05);
  }

  private createLoadRating(kg: number): THREE.Mesh {
    const cacheKey = `load_${kg}`;
    const texture = this.getCachedTexture(cacheKey, () =>
      this.renderDecalCanvas(128, 48, (ctx) => {
        // Silver background
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(0, 0, 128, 48);

        // Red border
        ctx.strokeStyle = '#c62828';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 124, 44);

        // Text
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MAX LOAD: ${kg} kg`, 64, 24);
      }),
    );

    return this.createDecalMesh(texture, 0.08, 0.03);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Render a decal to an offscreen canvas and return as CanvasTexture.
   */
  private renderDecalCanvas(
    width: number,
    height: number,
    drawFn: (ctx: CanvasRenderingContext2D) => void,
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    drawFn(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  /**
   * Return a cached texture or create it via the factory function.
   */
  private getCachedTexture(
    key: string,
    factory: () => THREE.CanvasTexture,
  ): THREE.CanvasTexture {
    let tex = this.textureCache.get(key);
    if (!tex) {
      tex = factory();
      this.textureCache.set(key, tex);
    }
    return tex;
  }

  /**
   * Get or create a shared PlaneGeometry for a given width/height.
   */
  private getSharedGeometry(
    width: number,
    height: number,
  ): THREE.PlaneGeometry {
    const key = `${width}_${height}`;
    let geo = this.sharedGeometries.get(key);
    if (!geo) {
      geo = new THREE.PlaneGeometry(width, height);
      this.sharedGeometries.set(key, geo);
    }
    return geo;
  }

  /**
   * Create a decal mesh from a texture and dimensions.
   */
  private createDecalMesh(
    texture: THREE.CanvasTexture,
    width: number,
    height: number,
  ): THREE.Mesh {
    const geometry = this.getSharedGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Generate a procedural serial number string from a seeded random.
   */
  private generateSerial(rand: () => number): string {
    const part = (r: () => number): string => {
      return String(Math.floor(r() * 10000)).padStart(4, '0');
    };
    return `SN: ${part(rand)}-${part(rand)}`;
  }
}
