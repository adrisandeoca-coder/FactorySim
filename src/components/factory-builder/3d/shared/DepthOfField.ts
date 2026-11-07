import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ── Bokeh DOF Shader ────────────────────────────────────────────────────────

const BokehShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    focus: { value: 10.0 },
    aperture: { value: 0.002 },
    maxblur: { value: 0.006 },
    nearClip: { value: 0.1 },
    farClip: { value: 1000.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
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
    uniform float focus;
    uniform float aperture;
    uniform float maxblur;
    uniform float nearClip;
    uniform float farClip;
    uniform vec2 resolution;

    varying vec2 vUv;

    // Linearize the depth buffer value to a view-space distance
    float linearizeDepth(float z) {
      float n = nearClip;
      float f = farClip;
      return (2.0 * n * f) / (f + n - z * (f - n));
    }

    // 12-tap Poisson disc kernel for smooth circular blur
    const int SAMPLE_COUNT = 12;
    vec2 poissonDisc[12];

    void initPoissonDisc() {
      poissonDisc[0]  = vec2(-0.326212, -0.405810);
      poissonDisc[1]  = vec2(-0.840144, -0.073580);
      poissonDisc[2]  = vec2(-0.695914,  0.457137);
      poissonDisc[3]  = vec2(-0.203345,  0.620716);
      poissonDisc[4]  = vec2( 0.962340, -0.194983);
      poissonDisc[5]  = vec2( 0.473434, -0.480026);
      poissonDisc[6]  = vec2( 0.519456,  0.767022);
      poissonDisc[7]  = vec2( 0.185461, -0.893124);
      poissonDisc[8]  = vec2( 0.507431,  0.064425);
      poissonDisc[9]  = vec2( 0.896420,  0.412458);
      poissonDisc[10] = vec2(-0.321940, -0.932615);
      poissonDisc[11] = vec2(-0.791559, -0.597710);
    }

    void main() {
      initPoissonDisc();

      // Read depth and linearize to world-space distance
      float rawDepth = texture2D(tDepth, vUv).x;
      float depth = linearizeDepth(rawDepth);

      // Circle of Confusion — signed distance from the focus plane
      float coc = clamp(abs(depth - focus) * aperture, 0.0, maxblur);

      // Texel size for sampling offsets
      vec2 texelSize = 1.0 / resolution;

      // Accumulate blurred color using Poisson disc sampling
      vec4 color = texture2D(tDiffuse, vUv);
      float totalWeight = 1.0;

      for (int i = 0; i < SAMPLE_COUNT; i++) {
        vec2 offset = poissonDisc[i] * coc * resolution.y * texelSize;
        vec4 sampleColor = texture2D(tDiffuse, vUv + offset);

        // Weight distant samples by their own CoC to avoid sharp-to-blurred bleeding
        float sampleDepth = linearizeDepth(texture2D(tDepth, vUv + offset).x);
        float sampleCoc = clamp(abs(sampleDepth - focus) * aperture, 0.0, maxblur);
        float weight = smoothstep(0.0, coc, sampleCoc) * 0.8 + 0.2;

        color += sampleColor * weight;
        totalWeight += weight;
      }

      gl_FragColor = color / totalWeight;
    }
  `,
};

// ── BokehPass ───────────────────────────────────────────────────────────────

export interface BokehPassParams {
  focus?: number;
  aperture?: number;
  maxblur?: number;
}

export class BokehPass extends Pass {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private depthRenderTarget: THREE.WebGLRenderTarget;
  private bokehMaterial: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;

  uniforms: Record<string, THREE.IUniform>;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    params: BokehPassParams = {},
  ) {
    super();

    this.scene = scene;
    this.camera = camera;

    const {
      focus = 10.0,
      aperture = 0.002,
      maxblur = 0.006,
    } = params;

    // Create a render target with an attached depth texture
    // Size will be set properly on first render via setSize
    this.depthRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.depthRenderTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

    // Create the bokeh shader material
    this.bokehMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BokehShader.uniforms),
      vertexShader: BokehShader.vertexShader,
      fragmentShader: BokehShader.fragmentShader,
      depthWrite: false,
    });

    this.uniforms = this.bokehMaterial.uniforms;
    this.uniforms.focus.value = focus;
    this.uniforms.aperture.value = aperture;
    this.uniforms.maxblur.value = maxblur;
    this.uniforms.nearClip.value = camera.near;
    this.uniforms.farClip.value = camera.far;

    this.fsQuad = new FullScreenQuad(this.bokehMaterial);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    /* deltaTime?: number, */
    /* maskActive?: boolean, */
  ): void {
    // Update clipping planes from the camera in case they changed
    this.uniforms.nearClip.value = this.camera.near;
    this.uniforms.farClip.value = this.camera.far;

    // Match the depth render target to the current read buffer size
    const width = readBuffer.width;
    const height = readBuffer.height;

    if (
      this.depthRenderTarget.width !== width ||
      this.depthRenderTarget.height !== height
    ) {
      this.depthRenderTarget.setSize(width, height);
      this.uniforms.resolution.value.set(width, height);
    }

    // Render the scene into the depth render target to capture the depth texture
    renderer.setRenderTarget(this.depthRenderTarget);
    renderer.render(this.scene, this.camera);

    // Bind textures
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;

    // Render the bokeh pass
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  setSize(width: number, height: number): void {
    this.depthRenderTarget.setSize(width, height);
    this.uniforms.resolution.value.set(width, height);
  }

  /** Update focus distance in world units */
  setFocus(distance: number): void {
    this.uniforms.focus.value = distance;
  }

  /** Adjust aperture — smaller values give a wider in-focus range */
  setAperture(value: number): void {
    this.uniforms.aperture.value = value;
  }

  dispose(): void {
    this.depthRenderTarget.dispose();
    this.bokehMaterial.dispose();
    this.fsQuad.dispose();
  }
}

// ── Auto-focus helper ───────────────────────────────────────────────────────

/**
 * Returns the distance from the camera to the orbit controls target point.
 * Useful for automatically focusing on whatever the user is looking at.
 *
 * @param camera - The perspective camera
 * @param controls - Orbit controls (or any object with a `target` Vector3)
 * @returns Distance in world units from camera position to controls target
 */
export function autoFocus(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 },
): number {
  return camera.position.distanceTo(controls.target);
}
