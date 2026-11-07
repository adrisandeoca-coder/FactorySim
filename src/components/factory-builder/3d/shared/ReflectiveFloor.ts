import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Reflective Floor — subtle epoxy factory floor with blurred planar reflection
// ---------------------------------------------------------------------------

const FLOOR_SIZE = 100;
const FLOOR_Y = 0.001;

/** Epoxy gray-green base color */
const FLOOR_COLOR = new THREE.Color(0x4a5248);

/** Fresnel constants — keeps reflections subtle */
const FRESNEL_BIAS = 0.05;
const FRESNEL_SCALE = 0.25;
const FRESNEL_POWER = 3.0;

const reflectiveVertexShader = /* glsl */ `
  uniform mat4 uTextureMatrix;
  varying vec4 vUvReflect;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vUvReflect = uTextureMatrix * worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const reflectiveFragmentShader = /* glsl */ `
  uniform vec3 uFloorColor;
  uniform sampler2D uReflectionMap;
  uniform float uFresnelBias;
  uniform float uFresnelScale;
  uniform float uFresnelPower;

  varying vec4 vUvReflect;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    // Base epoxy floor color
    vec3 base = uFloorColor;

    // Sample the blurred reflection texture (perspective divide)
    vec2 reflectUV = vUvReflect.xy / vUvReflect.w;
    vec3 reflection = texture2D(uReflectionMap, reflectUV).rgb;

    // Fresnel — more reflection at glancing angles
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = uFresnelBias + uFresnelScale * pow(1.0 - max(dot(viewDir, vWorldNormal), 0.0), uFresnelPower);
    fresnel = clamp(fresnel, 0.0, 1.0);

    // Mix base color with reflection
    vec3 color = mix(base, reflection, fresnel);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Manages a reflective factory floor plane.
 *
 * Renders a mirrored view of the scene into a half-resolution render target,
 * then blends it with the epoxy base color using a Fresnel term so the
 * reflection is strongest at shallow viewing angles.
 */
export class ReflectiveFloorManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private reflectionTarget: THREE.WebGLRenderTarget;
  private reflectionCamera: THREE.PerspectiveCamera;
  private textureMatrix: THREE.Matrix4;
  private clipPlane: THREE.Plane;

  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Render target at half the renderer's current size for a naturally blurred look
    const size = renderer.getSize(new THREE.Vector2());
    const rtWidth = Math.max(1, Math.floor(size.x * 0.5));
    const rtHeight = Math.max(1, Math.floor(size.y * 0.5));

    this.reflectionTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
    });

    this.reflectionCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);

    // Shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uFloorColor: { value: FLOOR_COLOR.clone() },
        uReflectionMap: { value: this.reflectionTarget.texture },
        uTextureMatrix: { value: this.textureMatrix },
        uFresnelBias: { value: FRESNEL_BIAS },
        uFresnelScale: { value: FRESNEL_SCALE },
        uFresnelPower: { value: FRESNEL_POWER },
      },
      vertexShader: reflectiveVertexShader,
      fragmentShader: reflectiveFragmentShader,
      depthWrite: true,
    });

    // Floor geometry
    this.geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = FLOOR_Y;
    this.mesh.name = '_reflectiveFloor';

    this.scene.add(this.mesh);
  }

  /**
   * Call before the main render pass.
   * Mirrors the camera below the floor plane and renders the scene into the
   * reflection render target. Uses a clipping plane to avoid drawing geometry
   * that sits below the floor.
   */
  update(): void {
    // Hide the floor mesh itself while rendering the reflection
    this.mesh.visible = false;

    // Copy camera state
    this.reflectionCamera.copy(this.camera);
    this.reflectionCamera.layers.mask = this.camera.layers.mask;

    // Mirror camera position across the floor plane (y = FLOOR_Y)
    const pos = this.reflectionCamera.position;
    pos.y = 2 * FLOOR_Y - pos.y;

    // Mirror the look direction
    const q = this.reflectionCamera.quaternion;
    q.set(-q.x, q.y, -q.z, q.w);

    // Update the texture projection matrix
    // Maps world coords → reflection UV via: bias * projection * view * identity
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.textureMatrix.multiply(this.reflectionCamera.projectionMatrix);
    this.textureMatrix.multiply(this.reflectionCamera.matrixWorldInverse);

    // Enable clipping plane so below-floor geometry is not drawn
    const prevClipping = this.renderer.clippingPlanes;
    this.renderer.clippingPlanes = [this.clipPlane];

    const currentRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.reflectionTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.reflectionCamera);

    // Restore state
    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.clippingPlanes = prevClipping;
    this.mesh.visible = true;
  }

  /**
   * Resize the reflection render target (call when the canvas / window resizes).
   */
  setSize(width: number, height: number): void {
    const rtWidth = Math.max(1, Math.floor(width * 0.5));
    const rtHeight = Math.max(1, Math.floor(height * 0.5));
    this.reflectionTarget.setSize(rtWidth, rtHeight);
  }

  /**
   * Clean up all GPU resources owned by this manager.
   */
  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.reflectionTarget.dispose();
  }
}

// ---------------------------------------------------------------------------
// Contact Shadows — subtle darkening directly beneath objects
// ---------------------------------------------------------------------------

const SHADOW_PLANE_SIZE = 100;
const SHADOW_MAP_SIZE = 512;
const SHADOW_CAMERA_HEIGHT = 10;
const SHADOW_DARKNESS = 0.15;

/**
 * Renders soft contact shadows beneath objects using an orthographic camera
 * pointing downward. A ShadowMaterial plane catches the shadow at very low
 * opacity so objects feel grounded on the factory floor.
 */
export class ContactShadowManager {
  private scene: THREE.Scene;

  private shadowGroup: THREE.Group;
  private shadowCamera: THREE.OrthographicCamera;
  private shadowTarget: THREE.WebGLRenderTarget;
  private shadowPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadowPlaneMaterial: THREE.MeshBasicMaterial;
  private shadowPlaneGeometry: THREE.PlaneGeometry;
  private blurPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private blurMaterial: THREE.ShaderMaterial;
  private blurTarget: THREE.WebGLRenderTarget;

  private depthMaterial: THREE.MeshDepthMaterial;
  private shadowCatcherGeometry: THREE.PlaneGeometry;
  private shadowCatcherMaterial: THREE.ShadowMaterial;
  private shadowCatcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.shadowGroup = new THREE.Group();
    this.shadowGroup.name = '_contactShadows';
    this.scene.add(this.shadowGroup);

    // Shadow-catching plane using ShadowMaterial (subtle opacity)
    this.shadowCatcherGeometry = new THREE.PlaneGeometry(
      SHADOW_PLANE_SIZE,
      SHADOW_PLANE_SIZE,
    );
    this.shadowCatcherMaterial = new THREE.ShadowMaterial({
      opacity: SHADOW_DARKNESS,
    });
    this.shadowCatcher = new THREE.Mesh(
      this.shadowCatcherGeometry,
      this.shadowCatcherMaterial,
    );
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.y = FLOOR_Y + 0.001; // just above the reflective floor
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.name = '_contactShadowCatcher';
    this.scene.add(this.shadowCatcher);

    // Orthographic camera looking straight down
    const halfSize = SHADOW_PLANE_SIZE / 2;
    this.shadowCamera = new THREE.OrthographicCamera(
      -halfSize,
      halfSize,
      halfSize,
      -halfSize,
      0.1,
      SHADOW_CAMERA_HEIGHT + 1,
    );
    this.shadowCamera.position.set(0, SHADOW_CAMERA_HEIGHT, 0);
    this.shadowCamera.lookAt(0, 0, 0);
    this.shadowCamera.rotation.z = 0;

    // Render target for the depth pass
    this.shadowTarget = new THREE.WebGLRenderTarget(
      SHADOW_MAP_SIZE,
      SHADOW_MAP_SIZE,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      },
    );

    // Blur target + material for softening the shadow
    this.blurTarget = new THREE.WebGLRenderTarget(
      SHADOW_MAP_SIZE,
      SHADOW_MAP_SIZE,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      },
    );

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tInput: { value: this.shadowTarget.texture },
        uDirection: { value: new THREE.Vector2(1.0 / SHADOW_MAP_SIZE, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tInput;
        uniform vec2 uDirection;
        varying vec2 vUv;

        void main() {
          vec4 sum = vec4(0.0);
          sum += texture2D(tInput, vUv - 4.0 * uDirection) * 0.051;
          sum += texture2D(tInput, vUv - 3.0 * uDirection) * 0.0918;
          sum += texture2D(tInput, vUv - 2.0 * uDirection) * 0.12245;
          sum += texture2D(tInput, vUv - 1.0 * uDirection) * 0.1531;
          sum += texture2D(tInput, vUv) * 0.1633;
          sum += texture2D(tInput, vUv + 1.0 * uDirection) * 0.1531;
          sum += texture2D(tInput, vUv + 2.0 * uDirection) * 0.12245;
          sum += texture2D(tInput, vUv + 3.0 * uDirection) * 0.0918;
          sum += texture2D(tInput, vUv + 4.0 * uDirection) * 0.051;
          gl_FragColor = sum;
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.blurPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blurMaterial,
    );

    // Depth material used to render objects into the shadow map
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });

    // Display plane that shows the contact shadow on the floor
    this.shadowPlaneGeometry = new THREE.PlaneGeometry(
      SHADOW_PLANE_SIZE,
      SHADOW_PLANE_SIZE,
    );
    this.shadowPlaneMaterial = new THREE.MeshBasicMaterial({
      map: this.blurTarget.texture,
      transparent: true,
      opacity: SHADOW_DARKNESS,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    this.shadowPlane = new THREE.Mesh(
      this.shadowPlaneGeometry,
      this.shadowPlaneMaterial,
    );
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = FLOOR_Y + 0.002;
    this.shadowPlane.name = '_contactShadowPlane';
    this.shadowGroup.add(this.shadowPlane);
  }

  /**
   * Update contact shadows by rendering a top-down depth pass of the
   * provided objects and blurring the result.
   */
  update(objects: THREE.Object3D[]): void {
    if (objects.length === 0) return;

    // We need a renderer reference — grab it from the first object's context
    const renderer = this.getRenderer();
    if (!renderer) return;

    // Store original overrideMaterial
    const prevOverride = this.scene.overrideMaterial;

    // Render depth of objects from above
    this.scene.overrideMaterial = this.depthMaterial;

    // Only render the specified objects: hide everything else temporarily
    const visibilityCache = new Map<THREE.Object3D, boolean>();
    this.scene.traverse((child) => {
      if (child === this.scene) return;
      visibilityCache.set(child, child.visible);
    });

    // Hide all top-level children
    for (const child of this.scene.children) {
      child.visible = false;
    }

    // Show only the target objects and their parents up to the scene
    for (const obj of objects) {
      obj.visible = true;
      obj.traverse((child) => {
        child.visible = true;
      });
      // Ensure ancestor chain is visible
      let parent = obj.parent;
      while (parent && parent !== this.scene) {
        parent.visible = true;
        parent = parent.parent;
      }
    }

    const currentTarget = renderer.getRenderTarget();
    const currentClearAlpha = renderer.getClearAlpha();

    renderer.setClearAlpha(0);
    renderer.setRenderTarget(this.shadowTarget);
    renderer.clear();
    renderer.render(this.scene, this.shadowCamera);

    // Restore override
    this.scene.overrideMaterial = prevOverride;

    // Horizontal blur pass
    this.blurMaterial.uniforms.tInput.value = this.shadowTarget.texture;
    this.blurMaterial.uniforms.uDirection.value.set(
      1.0 / SHADOW_MAP_SIZE,
      0,
    );
    renderer.setRenderTarget(this.blurTarget);
    renderer.clear();
    renderer.render(this.blurPlane, this.shadowCamera);

    // Vertical blur pass
    this.blurMaterial.uniforms.tInput.value = this.blurTarget.texture;
    this.blurMaterial.uniforms.uDirection.value.set(
      0,
      1.0 / SHADOW_MAP_SIZE,
    );
    renderer.setRenderTarget(this.shadowTarget);
    renderer.clear();
    renderer.render(this.blurPlane, this.shadowCamera);

    // Final result is in shadowTarget — point the display plane at it
    this.shadowPlaneMaterial.map = this.shadowTarget.texture;

    // Restore renderer state
    renderer.setRenderTarget(currentTarget);
    renderer.setClearAlpha(currentClearAlpha);

    // Restore visibility
    this.scene.traverse((child) => {
      const cached = visibilityCache.get(child);
      if (cached !== undefined) {
        child.visible = cached;
      }
    });
  }

  /**
   * Try to find the renderer from the scene's __r3f or from the global context.
   * Falls back to null if unavailable.
   */
  private getRenderer(): THREE.WebGLRenderer | null {
    // Walk up from scene to find a renderer reference if one was stored
    const root = this.scene as THREE.Scene & {
      __renderer?: THREE.WebGLRenderer;
    };
    if (root.__renderer) return root.__renderer;
    return null;
  }

  /**
   * Manually provide the renderer reference (call once after construction).
   */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    (this.scene as THREE.Scene & { __renderer?: THREE.WebGLRenderer }).__renderer =
      renderer;
  }

  /**
   * Clean up all GPU resources owned by this manager.
   */
  dispose(): void {
    this.scene.remove(this.shadowGroup);
    this.scene.remove(this.shadowCatcher);

    this.shadowCatcherGeometry.dispose();
    this.shadowCatcherMaterial.dispose();
    this.shadowPlaneGeometry.dispose();
    this.shadowPlaneMaterial.dispose();
    this.blurMaterial.dispose();
    (this.blurPlane.geometry as THREE.PlaneGeometry).dispose();
    this.depthMaterial.dispose();
    this.shadowTarget.dispose();
    this.blurTarget.dispose();
  }
}
