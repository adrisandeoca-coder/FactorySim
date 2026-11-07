import * as THREE from 'three';

/**
 * Creates a procedural HDR-like environment map for realistic metallic reflections.
 * Simulates a factory interior with fluorescent ceiling lights, gradient sky, and concrete ground.
 * No external files needed — everything is generated via a render target scene.
 */
export function createFactoryEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  // --- Gradient sky dome ---
  // Large sphere with a vertical gradient from light blue (top) to white (horizon)
  const skyGeo = new THREE.SphereGeometry(50, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      // Light studio environment (CAE / Visual Components look). Was a dark
      // navy sky, which tinted every surface navy via image-based lighting.
      topColor:    { value: new THREE.Color(0xf2f5f9) },
      bottomColor: { value: new THREE.Color(0xc9cfd6) },
      offset:      { value: 5 },
      exponent:    { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // --- Warm ground plane (concrete) ---
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0xb9c0c8 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);

  // --- Fluorescent ceiling lights ---
  // Multiple bright rectangles above to simulate industrial strip lighting
  const lightGeo = new THREE.PlaneGeometry(8, 1.2);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e8, emissiveIntensity: 6.0 });

  const lightPositions = [
    { x: -6, z: -4 },
    { x: 0, z: -4 },
    { x: 6, z: -4 },
    { x: -6, z: 4 },
    { x: 0, z: 4 },
    { x: 6, z: 4 },
    { x: -3, z: 0 },
    { x: 3, z: 0 },
  ];

  for (const pos of lightPositions) {
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(pos.x, 12, pos.z);
    light.rotation.x = Math.PI / 2;
    envScene.add(light);
  }

  // --- Subtle warm ambient fill (simulated wall bounce) ---
  const wallGeo = new THREE.PlaneGeometry(80, 15);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xdde2e8 });

  // Back wall
  const backWall = new THREE.Mesh(wallGeo, wallMat);
  backWall.position.set(0, 5, -20);
  envScene.add(backWall);

  // Side walls
  const sideWallGeo = new THREE.PlaneGeometry(40, 15);
  const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
  leftWall.position.set(-20, 5, 0);
  leftWall.rotation.y = Math.PI / 2;
  envScene.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeo, wallMat.clone());
  rightWall.position.set(20, 5, 0);
  rightWall.rotation.y = -Math.PI / 2;
  envScene.add(rightWall);

  // --- Generate the PMREM environment texture ---
  const envMap = pmremGenerator.fromScene(envScene, 0.0).texture;

  // Cleanup
  pmremGenerator.dispose();
  envScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });

  return envMap;
}

/**
 * Traverses a scene and applies the environment map to all MeshStandardMaterials.
 * Intensity varies by metalness to give chrome parts strong reflections while
 * keeping non-metallic surfaces subtle.
 */
export function applyEnvironmentMap(scene: THREE.Scene, envMap: THREE.Texture): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of materials) {
      if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
      const mat = material as THREE.MeshStandardMaterial;

      mat.envMap = envMap;

      if (mat.metalness > 0.7) {
        // Chrome / highly metallic parts — strong reflections
        mat.envMapIntensity = 1.2;
      } else if (mat.metalness >= 0.3) {
        // Medium metal — moderate reflections
        mat.envMapIntensity = 0.4;
      } else {
        // Non-metal (plastic, rubber, fabric) — very subtle
        mat.envMapIntensity = 0.15;
      }

      mat.needsUpdate = true;
    }
  });
}
