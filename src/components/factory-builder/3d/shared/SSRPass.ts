import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ── SSR Parameters ─────────────────────────────────────────────────────────

export interface SSRParams {
  maxDistance?: number;   // Max ray march distance (default: 8.0)
  resolution?: number;    // Resolution scale 0-1 (default: 0.5 = half res)
  thickness?: number;     // Surface thickness for hit test (default: 0.1)
  maxSteps?: number;      // Ray march steps (default: 30)
  opacity?: number;       // Reflection blend opacity (default: 0.3)
}

// ── Normal + Roughness Override Material ────────────────────────────────────

const NormalRoughnessMaterial = new THREE.ShaderMaterial({
  uniforms: {
    roughness: { value: 0.5 },
  },

  vertexShader: /* glsl */ `
    varying vec3 vWorldNormal;
    void main() {
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform float roughness;
    varying vec3 vWorldNormal;
    void main() {
      vec3 n = normalize(vWorldNormal);
      gl_FragColor = vec4(n * 0.5 + 0.5, roughness);
    }
  `,
});

// ── SSR Fragment Shader ────────────────────────────────────────────────────

const SSRShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormalRoughness: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraProjectionMatrix: { value: new THREE.Matrix4() },
    cameraInverseProjectionMatrix: { value: new THREE.Matrix4() },
    cameraMatrixWorld: { value: new THREE.Matrix4() },
    cameraMatrixWorldInverse: { value: new THREE.Matrix4() },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000.0 },
    maxDistance: { value: 8.0 },
    thickness: { value: 0.1 },
    maxSteps: { value: 30 },
    opacity: { value: 0.3 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormalRoughness;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform mat4 cameraProjectionMatrix;
    uniform mat4 cameraInverseProjectionMatrix;
    uniform mat4 cameraMatrixWorld;
    uniform mat4 cameraMatrixWorldInverse;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float maxDistance;
    uniform float thickness;
    uniform int maxSteps;
    uniform float opacity;

    varying vec2 vUv;

    // Linearize a depth buffer value to view-space depth
    float linearizeDepth(float d) {
      return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
    }

    // Reconstruct view-space position from UV and depth
    vec3 viewPositionFromDepth(vec2 uv, float depth) {
      float z = depth * 2.0 - 1.0; // NDC z
      vec4 clipPos = vec4(uv * 2.0 - 1.0, z, 1.0);
      vec4 viewPos = cameraInverseProjectionMatrix * clipPos;
      return viewPos.xyz / viewPos.w;
    }

    // Project a view-space position to screen UV
    vec3 projectToScreen(vec3 viewPos) {
      vec4 clipPos = cameraProjectionMatrix * vec4(viewPos, 1.0);
      clipPos.xyz /= clipPos.w;
      return vec3(clipPos.xy * 0.5 + 0.5, clipPos.z * 0.5 + 0.5);
    }

    // Edge fade: reduce reflection intensity near screen borders
    float screenEdgeFade(vec2 uv) {
      vec2 fade = smoothstep(0.0, 0.1, uv) * (1.0 - smoothstep(0.9, 1.0, uv));
      return fade.x * fade.y;
    }

    // Fresnel approximation (Schlick)
    float fresnelSchlick(float cosTheta) {
      float f0 = 0.04;
      return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
    }

    void main() {
      vec4 normalRoughness = texture2D(tNormalRoughness, vUv);
      vec3 worldNormal = normalRoughness.rgb * 2.0 - 1.0;
      float roughness = normalRoughness.a;

      // Skip rough/matte surfaces — no reflections needed
      if (roughness >= 0.5) {
        gl_FragColor = vec4(0.0);
        return;
      }

      float depth = texture2D(tDepth, vUv).r;

      // Skip sky / far plane
      if (depth >= 1.0) {
        gl_FragColor = vec4(0.0);
        return;
      }

      // Reconstruct view-space position and direction
      vec3 viewPos = viewPositionFromDepth(vUv, depth);
      vec3 viewDir = normalize(viewPos);

      // Transform world normal to view space
      vec3 viewNormal = normalize((cameraMatrixWorldInverse * vec4(worldNormal, 0.0)).xyz);

      // Reflection direction in view space
      vec3 reflectDir = reflect(viewDir, viewNormal);

      // Fresnel weighting
      float NdotV = max(dot(-viewDir, viewNormal), 0.0);
      float fresnel = fresnelSchlick(NdotV);

      // Ray march start and end in view space
      vec3 rayOrigin = viewPos;
      vec3 rayEnd = viewPos + reflectDir * maxDistance;

      // Project to screen space
      vec3 screenStart = projectToScreen(rayOrigin);
      vec3 screenEnd = projectToScreen(rayEnd);

      // March direction in screen space
      vec3 screenDir = screenEnd - screenStart;

      // Scale steps based on screen-space length for efficiency
      float screenLength = length(screenDir.xy * resolution);
      int steps = min(maxSteps, int(screenLength));
      if (steps < 1) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec3 stepSize = screenDir / float(steps);

      // Ray march through screen space
      vec3 currentPos = screenStart + stepSize; // start one step ahead
      vec4 hitColor = vec4(0.0);

      for (int i = 0; i < 128; i++) {
        if (i >= steps) break;

        // Early exit if outside screen bounds
        if (currentPos.x < 0.0 || currentPos.x > 1.0 ||
            currentPos.y < 0.0 || currentPos.y > 1.0 ||
            currentPos.z < 0.0 || currentPos.z > 1.0) {
          break;
        }

        // Sample depth at current screen position
        float sampledDepth = texture2D(tDepth, currentPos.xy).r;

        // Compare ray depth to scene depth
        float depthDiff = currentPos.z - sampledDepth;

        if (depthDiff > 0.0 && depthDiff < thickness) {
          // Hit detected — sample color
          vec3 color = texture2D(tDiffuse, currentPos.xy).rgb;
          float edgeFade = screenEdgeFade(currentPos.xy);

          // Attenuate by distance traveled
          float marchFraction = float(i) / float(steps);
          float distanceFade = 1.0 - marchFraction;

          // Roughness-based attenuation (less reflection for rougher surfaces)
          float roughnessFade = 1.0 - roughness * 2.0; // roughness < 0.5 so this is [0, 1]

          float alpha = fresnel * edgeFade * distanceFade * roughnessFade * opacity;
          hitColor = vec4(color, alpha);
          break;
        }

        currentPos += stepSize;
      }

      gl_FragColor = hitColor;
    }
  `,
};

// ── Gaussian Blur Shader ───────────────────────────────────────────────────

const BlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    direction: { value: new THREE.Vector2(1, 0) },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec2 direction;

    varying vec2 vUv;

    void main() {
      vec2 texelSize = direction / resolution;

      // 5x5 Gaussian kernel (sigma ~1.4)
      vec4 result = vec4(0.0);
      result += texture2D(tDiffuse, vUv - 2.0 * texelSize) * 0.06136;
      result += texture2D(tDiffuse, vUv - 1.0 * texelSize) * 0.24477;
      result += texture2D(tDiffuse, vUv)                    * 0.38774;
      result += texture2D(tDiffuse, vUv + 1.0 * texelSize) * 0.24477;
      result += texture2D(tDiffuse, vUv + 2.0 * texelSize) * 0.06136;

      gl_FragColor = result;
    }
  `,
};

// ── Composite Shader ───────────────────────────────────────────────────────

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tSSR: { value: null as THREE.Texture | null },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tSSR;

    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 ssr = texture2D(tSSR, vUv);

      // Blend SSR on top using premultiplied alpha approach
      vec3 result = base.rgb + ssr.rgb * ssr.a;

      gl_FragColor = vec4(result, base.a);
    }
  `,
};

// ── SSR Pass ───────────────────────────────────────────────────────────────

export class SSRPass extends Pass {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Parameters
  private maxDistance: number;
  private resolutionScale: number;
  private thickness: number;
  private maxSteps: number;
  private _opacity: number;

  // Render targets
  private normalRoughnessTarget: THREE.WebGLRenderTarget;
  private depthTarget: THREE.WebGLRenderTarget;
  private ssrTarget: THREE.WebGLRenderTarget;
  private blurTargetH: THREE.WebGLRenderTarget;
  private blurTargetV: THREE.WebGLRenderTarget;

  // Materials and quads
  private ssrMaterial: THREE.ShaderMaterial;
  private ssrQuad: FullScreenQuad;
  private blurMaterialH: THREE.ShaderMaterial;
  private blurMaterialV: THREE.ShaderMaterial;
  private blurQuadH: FullScreenQuad;
  private blurQuadV: FullScreenQuad;
  private compositeMaterial: THREE.ShaderMaterial;
  private compositeQuad: FullScreenQuad;

  // Cached originals for override material pass
  private originalClearColor = new THREE.Color();
  private originalClearAlpha = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, params?: SSRParams) {
    super();

    this.scene = scene;
    this.camera = camera;

    // Defaults
    this.maxDistance = params?.maxDistance ?? 8.0;
    this.resolutionScale = params?.resolution ?? 0.5;
    this.thickness = params?.thickness ?? 0.1;
    this.maxSteps = params?.maxSteps ?? 30;
    this._opacity = params?.opacity ?? 0.3;

    const width = 1;
    const height = 1;
    const halfW = Math.max(1, Math.floor(width * this.resolutionScale));
    const halfH = Math.max(1, Math.floor(height * this.resolutionScale));

    // Normal + Roughness render target
    this.normalRoughnessTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    });

    // Depth render target with DepthTexture
    this.depthTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.depthTarget.depthTexture = new THREE.DepthTexture(halfW, halfH);
    this.depthTarget.depthTexture.type = THREE.UnsignedIntType;

    // SSR result target
    this.ssrTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // Blur ping-pong targets
    this.blurTargetH = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    this.blurTargetV = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // SSR material
    this.ssrMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SSRShader.uniforms),
      vertexShader: SSRShader.vertexShader,
      fragmentShader: SSRShader.fragmentShader,
      depthWrite: false,
      depthTest: false,
    });
    this.ssrQuad = new FullScreenQuad(this.ssrMaterial);

    // Blur materials (horizontal + vertical)
    this.blurMaterialH = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BlurShader.uniforms),
      vertexShader: BlurShader.vertexShader,
      fragmentShader: BlurShader.fragmentShader,
      depthWrite: false,
      depthTest: false,
    });
    this.blurMaterialH.uniforms.direction.value.set(1, 0);
    this.blurQuadH = new FullScreenQuad(this.blurMaterialH);

    this.blurMaterialV = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BlurShader.uniforms),
      vertexShader: BlurShader.vertexShader,
      fragmentShader: BlurShader.fragmentShader,
      depthWrite: false,
      depthTest: false,
    });
    this.blurMaterialV.uniforms.direction.value.set(0, 1);
    this.blurQuadV = new FullScreenQuad(this.blurMaterialV);

    // Composite material
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CompositeShader.uniforms),
      vertexShader: CompositeShader.vertexShader,
      fragmentShader: CompositeShader.fragmentShader,
      depthWrite: false,
      depthTest: false,
    });
    this.compositeQuad = new FullScreenQuad(this.compositeMaterial);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const halfW = this.normalRoughnessTarget.width;
    const halfH = this.normalRoughnessTarget.height;

    // ── 1. Render normal + roughness buffer ──────────────────────────────

    // Save state
    this.originalClearColor.copy(renderer.getClearColor(this.originalClearColor));
    this.originalClearAlpha = renderer.getClearAlpha();
    const prevOverrideMaterial = this.scene.overrideMaterial;

    // Prepare the override material: copy roughness from each mesh's material
    // by using onBeforeRender on the override material
    const normalMat = NormalRoughnessMaterial.clone();
    normalMat.uniforms = THREE.UniformsUtils.clone(NormalRoughnessMaterial.uniforms);

    this.scene.overrideMaterial = normalMat;

    // Traverse scene to set roughness per-object via onBeforeRender
    const savedOnBeforeRenders: Map<THREE.Object3D, typeof THREE.Object3D.prototype.onBeforeRender> = new Map();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        savedOnBeforeRenders.set(mesh, mesh.onBeforeRender);
        mesh.onBeforeRender = () => {
          if (normalMat.uniforms.roughness) {
            normalMat.uniforms.roughness.value = mat.roughness ?? 0.5;
          }
        };
      }
    });

    renderer.setClearColor(0x7f7fff, 1.0); // neutral normal + 0.5 roughness
    renderer.setRenderTarget(this.normalRoughnessTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Restore onBeforeRender callbacks
    savedOnBeforeRenders.forEach((cb, obj) => {
      obj.onBeforeRender = cb;
    });

    this.scene.overrideMaterial = prevOverrideMaterial;

    // ── 2. Render depth buffer ───────────────────────────────────────────

    renderer.setClearColor(0x000000, 1.0);
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // ── 3. SSR ray march pass ────────────────────────────────────────────

    const uniforms = this.ssrMaterial.uniforms;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.tNormalRoughness.value = this.normalRoughnessTarget.texture;
    uniforms.tDepth.value = this.depthTarget.depthTexture;
    uniforms.resolution.value.set(halfW, halfH);
    uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    uniforms.cameraMatrixWorld.value.copy(this.camera.matrixWorld);
    uniforms.cameraMatrixWorldInverse.value.copy(this.camera.matrixWorldInverse);
    uniforms.cameraNear.value = this.camera.near;
    uniforms.cameraFar.value = this.camera.far;
    uniforms.maxDistance.value = this.maxDistance;
    uniforms.thickness.value = this.thickness;
    uniforms.maxSteps.value = this.maxSteps;
    uniforms.opacity.value = this._opacity;

    renderer.setRenderTarget(this.ssrTarget);
    renderer.clear();
    this.ssrQuad.render(renderer);

    // ── 4. Blur pass (separable 5x5 Gaussian) ───────────────────────────

    // Horizontal blur
    this.blurMaterialH.uniforms.tDiffuse.value = this.ssrTarget.texture;
    this.blurMaterialH.uniforms.resolution.value.set(halfW, halfH);
    renderer.setRenderTarget(this.blurTargetH);
    renderer.clear();
    this.blurQuadH.render(renderer);

    // Vertical blur
    this.blurMaterialV.uniforms.tDiffuse.value = this.blurTargetH.texture;
    this.blurMaterialV.uniforms.resolution.value.set(halfW, halfH);
    renderer.setRenderTarget(this.blurTargetV);
    renderer.clear();
    this.blurQuadV.render(renderer);

    // ── 5. Composite: blend SSR with original scene ─────────────────────

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tSSR.value = this.blurTargetV.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.compositeQuad.render(renderer);

    // Restore renderer state
    renderer.setClearColor(this.originalClearColor, this.originalClearAlpha);
  }

  setSize(width: number, height: number): void {
    const halfW = Math.max(1, Math.floor(width * this.resolutionScale));
    const halfH = Math.max(1, Math.floor(height * this.resolutionScale));

    this.normalRoughnessTarget.setSize(halfW, halfH);
    this.depthTarget.setSize(halfW, halfH);
    this.ssrTarget.setSize(halfW, halfH);
    this.blurTargetH.setSize(halfW, halfH);
    this.blurTargetV.setSize(halfW, halfH);
  }

  dispose(): void {
    this.normalRoughnessTarget.dispose();
    this.depthTarget.dispose();
    if (this.depthTarget.depthTexture) {
      this.depthTarget.depthTexture.dispose();
    }
    this.ssrTarget.dispose();
    this.blurTargetH.dispose();
    this.blurTargetV.dispose();

    this.ssrMaterial.dispose();
    this.ssrQuad.dispose();
    this.blurMaterialH.dispose();
    this.blurMaterialV.dispose();
    this.blurQuadH.dispose();
    this.blurQuadV.dispose();
    this.compositeMaterial.dispose();
    this.compositeQuad.dispose();
  }
}
