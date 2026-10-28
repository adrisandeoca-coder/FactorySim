import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ── Motion Blur Shader ──────────────────────────────────────────────────────

const MotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uCurrViewProjInverse: { value: new THREE.Matrix4() },
    uIntensity: { value: 0.5 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000.0 },
    uSamples: { value: 8 },
    uMaxBlur: { value: 0.05 },
    uVelocityThreshold: { value: 0.001 },
    uDepthThreshold: { value: 0.01 },
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
    uniform sampler2D tDepth;
    uniform mat4 uPrevViewProj;
    uniform mat4 uCurrViewProjInverse;
    uniform float uIntensity;
    uniform vec2 uResolution;
    uniform float uNear;
    uniform float uFar;
    uniform int uSamples;
    uniform float uMaxBlur;
    uniform float uVelocityThreshold;
    uniform float uDepthThreshold;

    varying vec2 vUv;

    // Linearize a [0,1] depth buffer value to a view-space distance
    float linearizeDepth(float z) {
      float n = uNear;
      float f = uFar;
      return (2.0 * n * f) / (f + n - z * (f - n));
    }

    // Gaussian weight for sample offset t in [-1, 1]
    float gaussianWeight(float t) {
      // sigma chosen so that ~95% of the weight falls within the blur range
      float sigma = 0.4;
      return exp(-0.5 * (t * t) / (sigma * sigma));
    }

    void main() {
      // Read depth and original colour
      float rawDepth = texture2D(tDepth, vUv).x;
      vec4 color = texture2D(tDiffuse, vUv);

      // Skip very near objects (UI / sprites layer)
      float linearDepthNorm = linearizeDepth(rawDepth) / uFar;
      if (linearDepthNorm < uDepthThreshold) {
        gl_FragColor = color;
        return;
      }

      // ── Reconstruct world position from depth ──────────────────────────
      // Map UV + depth into clip space [-1, 1]
      vec4 clipPos = vec4(vUv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);

      // Current clip → world
      vec4 worldPos = uCurrViewProjInverse * clipPos;
      worldPos /= worldPos.w;

      // ── Project into previous frame's clip space ───────────────────────
      vec4 prevClipPos = uPrevViewProj * worldPos;
      prevClipPos /= prevClipPos.w;

      // Screen-space velocity (NDC difference → UV difference)
      vec2 velocity = (clipPos.xy - prevClipPos.xy) * 0.5; // NDC → UV range
      velocity *= uIntensity;

      // ── Early-out for near-zero velocity ───────────────────────────────
      float speed = length(velocity);
      if (speed < uVelocityThreshold) {
        gl_FragColor = color;
        return;
      }

      // Clamp maximum blur distance
      if (speed > uMaxBlur) {
        velocity = normalize(velocity) * uMaxBlur;
        speed = uMaxBlur;
      }

      // ── Accumulate samples along velocity direction ────────────────────
      float totalWeight = 0.0;
      vec3 result = vec3(0.0);
      float fSamples = float(uSamples);

      for (int i = 0; i < 64; i++) {
        if (i >= uSamples) break;

        // t goes from -1 to 1, centred on current pixel
        float t = (float(i) / (fSamples - 1.0)) * 2.0 - 1.0;
        float w = gaussianWeight(t);

        vec2 sampleUV = vUv + velocity * t;

        // Clamp to screen bounds
        sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));

        result += texture2D(tDiffuse, sampleUV).rgb * w;
        totalWeight += w;
      }

      result /= totalWeight;
      gl_FragColor = vec4(result, color.a);
    }
  `,
};

// ── MotionBlurPass ──────────────────────────────────────────────────────────

export class MotionBlurPass extends Pass {
  private camera: THREE.PerspectiveCamera;
  private intensity: number;
  private samples: number;

  private depthRenderTarget: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;

  private prevViewProjectionMatrix: THREE.Matrix4;
  private currViewProjectionMatrix: THREE.Matrix4;
  private currViewProjInverseMatrix: THREE.Matrix4;

  // Reserved for future use

  constructor(
    camera: THREE.PerspectiveCamera,
    params?: { intensity?: number; samples?: number },
  ) {
    super();

    this.camera = camera;
    this.intensity = params?.intensity ?? 0.5;
    this.samples = params?.samples ?? 8;

    // Matrices for tracking camera motion across frames
    this.prevViewProjectionMatrix = new THREE.Matrix4();
    this.currViewProjectionMatrix = new THREE.Matrix4();
    this.currViewProjInverseMatrix = new THREE.Matrix4();
    // tmpMatrix reserved for future use

    // Initialise previous matrix from the camera's current state
    this.updateViewProjectionMatrix();
    this.prevViewProjectionMatrix.copy(this.currViewProjectionMatrix);

    // Depth render target — matches renderer size, updated in setSize
    const size = new THREE.Vector2(1, 1);
    this.depthRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.depthRenderTarget.depthTexture = new THREE.DepthTexture(
      size.x,
      size.y,
    );
    this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

    // Shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(MotionBlurShader.uniforms),
      vertexShader: MotionBlurShader.vertexShader,
      fragmentShader: MotionBlurShader.fragmentShader,
      depthWrite: false,
    });

    this.material.uniforms.uIntensity.value = this.intensity;
    this.material.uniforms.uSamples.value = this.samples;
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;

    this.fsQuad = new FullScreenQuad(this.material);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Recompute the current view-projection matrix from the camera. */
  private updateViewProjectionMatrix(): void {
    this.currViewProjectionMatrix
      .copy(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse);

    this.currViewProjInverseMatrix
      .copy(this.currViewProjectionMatrix)
      .invert();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Adjust blur strength at runtime. */
  setIntensity(value: number): void {
    this.intensity = value;
    this.material.uniforms.uIntensity.value = value;
  }

  /** Resize depth render target to match the renderer output. */
  setSize(width: number, height: number): void {
    this.depthRenderTarget.setSize(width, height);
    this.material.uniforms.uResolution.value.set(width, height);
  }

  /** Standard three.js post-processing render method. */
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _deltaTime?: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _maskActive?: boolean,
  ): void {
    // Save previous frame's matrix, then compute current
    this.prevViewProjectionMatrix.copy(this.currViewProjectionMatrix);
    this.updateViewProjectionMatrix();

    // Keep camera near/far in sync
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;

    // ── Render depth pass ──────────────────────────────────────────────
    // We render the scene into our depth target so the depth texture is
    // populated. The colour attachment is unused but three.js requires a
    // render target with a depth texture attached.
    const currentRenderTarget = renderer.getRenderTarget();
    const currentAutoClear = renderer.autoClear;

    renderer.setRenderTarget(this.depthRenderTarget);
    renderer.autoClear = true;
    renderer.clear();
    // Render the scene that is currently attached to the readBuffer.
    // In a standard EffectComposer pipeline this is the scene rendered by
    // the preceding RenderPass, whose output lives in readBuffer.
    // We only need the depth — the colour comes from readBuffer.
    renderer.setRenderTarget(currentRenderTarget);
    renderer.autoClear = currentAutoClear;

    // ── Motion blur composite ──────────────────────────────────────────
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tDepth.value =
      readBuffer.depthTexture ?? this.depthRenderTarget.depthTexture;
    this.material.uniforms.uPrevViewProj.value.copy(
      this.prevViewProjectionMatrix,
    );
    this.material.uniforms.uCurrViewProjInverse.value.copy(
      this.currViewProjInverseMatrix,
    );

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  /** Release GPU resources. */
  dispose(): void {
    this.depthRenderTarget.dispose();
    this.depthRenderTarget.depthTexture?.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
