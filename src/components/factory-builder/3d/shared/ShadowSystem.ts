import * as THREE from 'three';

interface ContactShadow {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
}

export class EnhancedShadowSystem {
  private scene: THREE.Scene;

  private primaryLight: THREE.DirectionalLight;
  private secondaryLight: THREE.DirectionalLight;
  private primaryTarget: THREE.Object3D;
  private secondaryTarget: THREE.Object3D;

  private groundPlane: THREE.Mesh;
  private contactShadows: ContactShadow[] = [];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Primary light — high-res, tight frustum for near objects
    this.primaryTarget = new THREE.Object3D();
    this.scene.add(this.primaryTarget);

    this.primaryLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.primaryLight.position.set(5, 10, 7);
    this.primaryLight.target = this.primaryTarget;
    this.primaryLight.castShadow = true;
    this.primaryLight.shadow.mapSize.set(4096, 4096);
    this.primaryLight.shadow.bias = -0.0003;
    this.primaryLight.shadow.normalBias = 0.02;

    const primaryCam = this.primaryLight.shadow.camera;
    primaryCam.left = -7.5;
    primaryCam.right = 7.5;
    primaryCam.top = 7.5;
    primaryCam.bottom = -7.5;
    primaryCam.near = 0.5;
    primaryCam.far = 50;

    this.scene.add(this.primaryLight);

    // Secondary light — medium-res, wider frustum for mid-range shadows
    this.secondaryTarget = new THREE.Object3D();
    this.scene.add(this.secondaryTarget);

    this.secondaryLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.secondaryLight.position.set(5, 10, 7);
    this.secondaryLight.target = this.secondaryTarget;
    this.secondaryLight.castShadow = true;
    this.secondaryLight.shadow.mapSize.set(2048, 2048);
    this.secondaryLight.shadow.bias = -0.001;
    this.secondaryLight.shadow.normalBias = 0.04;

    const secondaryCam = this.secondaryLight.shadow.camera;
    secondaryCam.left = -20;
    secondaryCam.right = 20;
    secondaryCam.top = 20;
    secondaryCam.bottom = -20;
    secondaryCam.near = 0.5;
    secondaryCam.far = 80;

    this.scene.add(this.secondaryLight);

    // Ground shadow-receiving plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
    this.groundPlane = new THREE.Mesh(groundGeometry, shadowMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0.001;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);
  }

  update(cameraTarget: THREE.Vector3): void {
    // Snap target to 0.5 unit grid to prevent shadow swimming
    const snappedX = Math.round(cameraTarget.x / 0.5) * 0.5;
    const snappedZ = Math.round(cameraTarget.z / 0.5) * 0.5;

    // Move primary light and target to follow camera look point
    this.primaryTarget.position.set(snappedX, 0, snappedZ);
    this.primaryLight.position.set(snappedX + 5, 10, snappedZ + 7);

    this.primaryLight.shadow.camera.updateProjectionMatrix();

    // Secondary light follows more loosely at the same snapped position
    this.secondaryTarget.position.set(snappedX, 0, snappedZ);
    this.secondaryLight.position.set(snappedX + 5, 10, snappedZ + 7);

    this.secondaryLight.shadow.camera.updateProjectionMatrix();
  }

  registerObject(position: THREE.Vector3, radius: number): void {
    const size = radius * 2;
    const resolution = 128;

    // Create canvas with radial gradient for contact shadow
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(
      resolution / 2,
      resolution / 2,
      0,
      resolution / 2,
      resolution / 2,
      resolution / 2
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, resolution, resolution);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0.002, position.z);

    this.scene.add(mesh);
    this.contactShadows.push({ mesh, texture });
  }

  setQuality(level: 'low' | 'medium' | 'high'): void {
    switch (level) {
      case 'low':
        this.primaryLight.shadow.mapSize.set(1024, 1024);
        this.secondaryLight.shadow.mapSize.set(512, 512);
        break;
      case 'medium':
        this.primaryLight.shadow.mapSize.set(2048, 2048);
        this.secondaryLight.shadow.mapSize.set(1024, 1024);
        break;
      case 'high':
        this.primaryLight.shadow.mapSize.set(4096, 4096);
        this.secondaryLight.shadow.mapSize.set(2048, 2048);
        break;
    }

    // Force shadow map regeneration
    if (this.primaryLight.shadow.map) {
      this.primaryLight.shadow.map.dispose();
      this.primaryLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    if (this.secondaryLight.shadow.map) {
      this.secondaryLight.shadow.map.dispose();
      this.secondaryLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  dispose(): void {
    // Remove and dispose lights
    this.scene.remove(this.primaryLight);
    this.scene.remove(this.secondaryLight);
    this.scene.remove(this.primaryTarget);
    this.scene.remove(this.secondaryTarget);

    if (this.primaryLight.shadow.map) {
      this.primaryLight.shadow.map.dispose();
    }
    if (this.secondaryLight.shadow.map) {
      this.secondaryLight.shadow.map.dispose();
    }

    // Remove and dispose ground plane
    this.scene.remove(this.groundPlane);
    (this.groundPlane.material as THREE.Material).dispose();
    this.groundPlane.geometry.dispose();

    // Remove and dispose contact shadows
    for (const cs of this.contactShadows) {
      this.scene.remove(cs.mesh);
      cs.texture.dispose();
      (cs.mesh.material as THREE.Material).dispose();
      cs.mesh.geometry.dispose();
    }
    this.contactShadows = [];
  }
}
