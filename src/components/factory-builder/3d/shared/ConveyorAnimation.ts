import * as THREE from 'three';

/**
 * Conveyor belt and roller animation system.
 * Manages UV-scrolling belt textures and spinning roller animations.
 */

interface AnimatedConveyor {
  nodeId: string;
  group: THREE.Group;
  beltMeshes: THREE.Mesh[];
  rollerMeshes: THREE.Mesh[];
  speed: number;          // configured conveyor speed
  currentSpeed: number;   // animated (ramps up/down)
  active: boolean;
}

// Procedural belt texture with slat lines
function createBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Dark belt surface
  ctx.fillStyle = '#111316';
  ctx.fillRect(0, 0, 256, 64);

  // Diagonal grip pattern — subtle hatching across full belt surface
  ctx.strokeStyle = '#1c2028';
  ctx.lineWidth = 1;
  for (let d = -64; d < 256 + 64; d += 8) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + 64, 64);
    ctx.stroke();
  }

  // Slat gaps — dark recessed gaps between slats (strong contrast)
  ctx.fillStyle = '#0a0c0e';
  for (let x = 0; x < 256; x += 16) {
    ctx.fillRect(x, 0, 2, 64);
  }

  // Slat highlight — bright leading edge of each slat
  ctx.fillStyle = '#2e3540';
  for (let x = 0; x < 256; x += 16) {
    ctx.fillRect(x + 2, 0, 2, 64);
  }

  // Edge grip strips — raised rubber edge bands
  ctx.fillStyle = '#1e2530';
  ctx.fillRect(0, 0, 256, 6);
  ctx.fillRect(0, 58, 256, 6);
  // Edge highlight line
  ctx.fillStyle = '#2a3240';
  ctx.fillRect(0, 6, 256, 2);
  ctx.fillRect(0, 56, 256, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

// Roller conveyor texture with grooves
function createRollerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Steel surface
  ctx.fillStyle = '#606878';
  ctx.fillRect(0, 0, 64, 64);

  // Circular grooves on roller surface
  ctx.strokeStyle = '#505060';
  ctx.lineWidth = 1;
  for (let y = 4; y < 64; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class ConveyorAnimationManager {
  private conveyors: Map<string, AnimatedConveyor> = new Map();
  private beltTexture: THREE.CanvasTexture;
  private rollerTexture: THREE.CanvasTexture;
  private beltMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.beltTexture = createBeltTexture();
    this.rollerTexture = createRollerTexture();
    this.beltMaterial = new THREE.MeshStandardMaterial({
      map: this.beltTexture,
      metalness: 0.1,
      roughness: 0.85,
    });
  }

  /**
   * Register a conveyor node for animation.
   * Finds belt and roller meshes by name convention.
   */
  registerConveyor(nodeId: string, group: THREE.Group, speed: number = 1) {
    const beltMeshes: THREE.Mesh[] = [];
    const rollerMeshes: THREE.Mesh[] = [];

    group.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const name = mesh.name.toLowerCase();

      // Belt surfaces — apply scrolling texture
      if (name.includes('belt') || name.includes('conveyor_surface') || name.includes('slat')) {
        // Clone the belt material so each conveyor has independent UV offset
        const mat = this.beltMaterial.clone();
        mat.map = this.beltTexture.clone();
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(4, 1);
        mesh.material = mat;
        beltMeshes.push(mesh);
      }

      // Rollers — any cylindrical part named roller
      if (name.includes('roller') || name.includes('idler') || name.includes('drive_roller')) {
        rollerMeshes.push(mesh);
      }
    });

    // If no named parts found, look for the main body as belt
    if (beltMeshes.length === 0) {
      group.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        // Belt-colored meshes (dark, low metalness)
        if (mat && mat.color && mat.color.r < 0.15 && mat.color.g < 0.15 && mat.metalness < 0.3) {
          const newMat = this.beltMaterial.clone();
          newMat.map = this.beltTexture.clone();
          newMat.map.wrapS = THREE.RepeatWrapping;
          newMat.map.wrapT = THREE.RepeatWrapping;
          newMat.map.repeat.set(4, 1);
          mesh.material = newMat;
          beltMeshes.push(mesh);
        }
      });
    }

    this.conveyors.set(nodeId, {
      nodeId,
      group,
      beltMeshes,
      rollerMeshes,
      speed,
      currentSpeed: 0,
      active: false,
    });
  }

  /**
   * Set whether a conveyor is actively running.
   */
  setActive(nodeId: string, active: boolean) {
    const conv = this.conveyors.get(nodeId);
    if (conv) conv.active = active;
  }

  /**
   * Set all conveyors active/inactive based on whether simulation is running.
   */
  setAllActive(active: boolean) {
    for (const conv of this.conveyors.values()) {
      conv.active = active;
    }
  }

  /**
   * Update all conveyor animations. Call each frame.
   */
  update(dt: number) {
    for (const conv of this.conveyors.values()) {
      // Ramp speed up/down
      const targetSpeed = conv.active ? conv.speed : 0;
      conv.currentSpeed += (targetSpeed - conv.currentSpeed) * Math.min(1, dt * 3);

      if (Math.abs(conv.currentSpeed) < 0.001) continue;

      // Scroll belt UV
      const scrollAmount = conv.currentSpeed * dt * 0.5;
      for (const mesh of conv.beltMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.map) {
          mat.map.offset.x += scrollAmount;
          mat.map.needsUpdate = false; // offset changes don't need full texture update
        }
      }

      // Spin rollers
      const rollerSpeed = conv.currentSpeed * dt * 4;
      for (const roller of conv.rollerMeshes) {
        roller.rotation.z += rollerSpeed;
      }
    }
  }

  removeConveyor(nodeId: string) {
    this.conveyors.delete(nodeId);
  }

  dispose() {
    this.beltTexture.dispose();
    this.rollerTexture.dispose();
    this.beltMaterial.dispose();
    this.conveyors.clear();
  }
}
