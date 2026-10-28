import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ---------------------------------------------------------------------------
// ChromaticAberrationPass
// Very subtle per-channel UV offset that increases toward the edges,
// mimicking real-world lens fringing.
// ---------------------------------------------------------------------------

const chromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.002 },
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
    uniform float strength;
    uniform vec2 resolution;

    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);

      // Radial offset increases quadratically toward edges
      vec2 offset = dir * dist * strength;

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;

      gl_FragColor = vec4(r, g, b, texture2D(tDiffuse, vUv).a);
    }
  `,
};

export class ChromaticAberrationPass extends Pass {
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;

  constructor(params?: { strength?: number }) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(chromaticAberrationShader.uniforms),
      vertexShader: chromaticAberrationShader.vertexShader,
      fragmentShader: chromaticAberrationShader.fragmentShader,
    });

    if (params?.strength !== undefined) {
      this.material.uniforms.strength.value = params.strength;
    }

    this.fsQuad = new FullScreenQuad(this.material);
  }

  setStrength(value: number): void {
    this.material.uniforms.strength.value = value;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  override setSize(width: number, height: number): void {
    this.material.uniforms.resolution.value.set(width, height);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// ---------------------------------------------------------------------------
// FilmGrainPass
// Subtle procedural noise that is luminance-aware: shadows receive more
// grain than highlights, matching real film stock behaviour.
// ---------------------------------------------------------------------------

const filmGrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.03 },
    time: { value: 0.0 },
    animated: { value: 1.0 },
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
    uniform float intensity;
    uniform float time;
    uniform float animated;

    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Seed varies over time when animated, static otherwise
      float seed = animated > 0.5 ? time : 0.0;
      float noise = rand(vUv + vec2(seed, seed * 0.7));

      // Luminance-aware: less grain in bright areas, more in shadows
      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float grainWeight = 1.0 - luminance * 0.6;

      color.rgb += (noise - 0.5) * intensity * grainWeight;

      gl_FragColor = color;
    }
  `,
};

export class FilmGrainPass extends Pass {
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private clock: THREE.Clock;

  constructor(params?: { intensity?: number; animated?: boolean }) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(filmGrainShader.uniforms),
      vertexShader: filmGrainShader.vertexShader,
      fragmentShader: filmGrainShader.fragmentShader,
    });

    if (params?.intensity !== undefined) {
      this.material.uniforms.intensity.value = params.intensity;
    }
    if (params?.animated !== undefined) {
      this.material.uniforms.animated.value = params.animated ? 1.0 : 0.0;
    }

    this.fsQuad = new FullScreenQuad(this.material);
    this.clock = new THREE.Clock();
  }

  setIntensity(value: number): void {
    this.material.uniforms.intensity.value = value;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.time.value = this.clock.getElapsedTime();

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  override setSize(_width: number, _height: number): void {
    // No-op: full-screen shader does not need size information
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// ---------------------------------------------------------------------------
// LensDistortionPass
// Barrel / pincushion distortion using the Brown-Conrady model.
// Very subtle by default — just enough to convey a physical camera lens.
// ---------------------------------------------------------------------------

const lensDistortionShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.04 },
    cubic: { value: 0.02 },
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
    uniform float strength;
    uniform float cubic;

    varying vec2 vUv;

    void main() {
      // Centre UVs to -1..1 range
      vec2 centered = vUv * 2.0 - 1.0;
      float r2 = dot(centered, centered);
      float r4 = r2 * r2;

      // Brown-Conrady distortion model
      vec2 distorted = centered * (1.0 + strength * r2 + cubic * r4);

      // Back to 0..1 UV space
      vec2 distortedUv = distorted * 0.5 + 0.5;

      // Clamp to valid range to avoid sampling outside the texture
      distortedUv = clamp(distortedUv, 0.0, 1.0);

      gl_FragColor = texture2D(tDiffuse, distortedUv);
    }
  `,
};

export class LensDistortionPass extends Pass {
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;

  constructor(params?: { strength?: number; cubic?: number }) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(lensDistortionShader.uniforms),
      vertexShader: lensDistortionShader.vertexShader,
      fragmentShader: lensDistortionShader.fragmentShader,
    });

    if (params?.strength !== undefined) {
      this.material.uniforms.strength.value = params.strength;
    }
    if (params?.cubic !== undefined) {
      this.material.uniforms.cubic.value = params.cubic;
    }

    this.fsQuad = new FullScreenQuad(this.material);
  }

  setStrength(value: number): void {
    this.material.uniforms.strength.value = value;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  override setSize(_width: number, _height: number): void {
    // No-op: full-screen shader does not need size information
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
