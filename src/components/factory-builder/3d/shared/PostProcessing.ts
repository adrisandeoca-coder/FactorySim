import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { BokehPass } from './DepthOfField';
import { SSRPass } from './SSRPass';
import { MotionBlurPass } from './MotionBlurPass';
import { ChromaticAberrationPass, FilmGrainPass, LensDistortionPass } from './LensEffects';

// ── ACES Filmic Tone Mapping shader ──────────────────────────────────────────

const ACESFilmicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    exposure: { value: 1.0 },
    saturation: { value: 1.05 },
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
    uniform float exposure;
    uniform float saturation;
    varying vec2 vUv;

    vec3 ACESFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb * exposure;

      // ACES filmic tone mapping
      c = ACESFilm(c);

      // Saturation adjustment
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, saturation);

      gl_FragColor = vec4(c, color.a);
    }
  `,
};

// ── Vignette shader ──────────────────────────────────────────────────────────

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.3 },
    smoothness: { value: 0.5 },
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
    uniform float smoothness;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.5, 0.5 - smoothness, dist * (1.0 + intensity));
      color.rgb *= mix(1.0, vignette, intensity);
      gl_FragColor = color;
    }
  `,
};

// ── Post-Processing Setup ────────────────────────────────────────────────────

export interface PostProcessingConfig {
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  ssao: boolean;
  ssaoRadius: number;
  ssaoMinDistance: number;
  ssaoMaxDistance: number;
  toneMapping: boolean;
  exposure: number;
  vignette: boolean;
  vignetteIntensity: number;
  smaa: boolean;
  dof: boolean;
  dofFocus: number;
  dofAperture: number;
  dofMaxblur: number;
  filmGrain: boolean;
  filmGrainIntensity: number;
  ssr: boolean;
  ssrOpacity: number;
}

const DEFAULT_CONFIG: PostProcessingConfig = {
  bloom: true,
  bloomStrength: 0.45,
  bloomRadius: 0.5,
  bloomThreshold: 0.75,
  ssao: true,
  ssaoRadius: 0.5,
  ssaoMinDistance: 0.005,
  ssaoMaxDistance: 0.1,
  toneMapping: true,
  exposure: 1.1,
  vignette: true,
  vignetteIntensity: 0.35,
  smaa: true,
  dof: false,
  dofFocus: 10.0,
  dofAperture: 0.0,
  dofMaxblur: 0.0,
  filmGrain: true,
  filmGrainIntensity: 0.018,
  ssr: false,
  ssrOpacity: 0.15,
};

export class PostProcessingPipeline {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private ssaoPass: SSAOPass;
  private toneMappingPass: ShaderPass;
  private vignettePass: ShaderPass;
  private bokehPass: BokehPass | null = null;
  // Phase 3 passes
  private ssrPass: SSRPass | null = null;
  private motionBlurPass: MotionBlurPass | null = null;
  private chromaticPass: ChromaticAberrationPass | null = null;
  private filmGrainPass: FilmGrainPass | null = null;
  private lensDistortionPass: LensDistortionPass | null = null;
  private config: PostProcessingConfig;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config: Partial<PostProcessingConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    // Disable renderer's built-in tone mapping — we handle it in post
    renderer.toneMapping = THREE.NoToneMapping;

    this.composer = new EffectComposer(renderer);

    // 1. Render pass — renders the scene normally
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2. SSAO — screen-space ambient occlusion for depth
    this.ssaoPass = new SSAOPass(scene, camera, width, height);
    this.ssaoPass.kernelRadius = this.config.ssaoRadius;
    this.ssaoPass.minDistance = this.config.ssaoMinDistance;
    this.ssaoPass.maxDistance = this.config.ssaoMaxDistance;
    this.ssaoPass.enabled = this.config.ssao;
    this.composer.addPass(this.ssaoPass);

    // 3. Bloom — glow on emissive materials (status lights, screens, lasers)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.config.bloomStrength,
      this.config.bloomRadius,
      this.config.bloomThreshold,
    );
    this.bloomPass.enabled = this.config.bloom;
    this.composer.addPass(this.bloomPass);

    // 4. ACES Filmic tone mapping
    this.toneMappingPass = new ShaderPass(ACESFilmicShader);
    this.toneMappingPass.uniforms.exposure.value = this.config.exposure;
    this.toneMappingPass.enabled = this.config.toneMapping;
    this.composer.addPass(this.toneMappingPass);

    // 5. Vignette — subtle darkening at edges
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.intensity.value = this.config.vignetteIntensity;
    this.vignettePass.enabled = this.config.vignette;
    this.composer.addPass(this.vignettePass);

    // 6. Depth of Field — subtle cinematic bokeh
    if (this.config.dof) {
      this.bokehPass = new BokehPass(scene, camera, {
        focus: this.config.dofFocus,
        aperture: this.config.dofAperture,
        maxblur: this.config.dofMaxblur,
      });
      this.composer.addPass(this.bokehPass);
    }

    // Phase 3 passes (SSR, motion blur, lens effects) are available but not added
    // to the pipeline by default for performance. They can be enabled via API.

    // 6a. SSR — screen-space reflections for floor/machine surfaces
    this.ssrPass = new SSRPass(scene, camera, { opacity: this.config.ssrOpacity, resolution: 0.5, maxSteps: 24 });
    if (this.config.ssr) {
      this.ssrPass.enabled = true;
      this.composer.addPass(this.ssrPass);
    }

    // 6b. Film Grain — subtle analog film texture
    if (this.config.filmGrain) {
      this.filmGrainPass = new FilmGrainPass({ intensity: this.config.filmGrainIntensity, animated: true });
      this.composer.addPass(this.filmGrainPass);
    }

    // 7. SMAA anti-aliasing
    if (this.config.smaa) {
      const smaaPass = new SMAAPass();
      this.composer.addPass(smaaPass);
    }

    // 13. Output pass — final color space conversion
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  render() {
    this.composer.render();
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.ssrPass?.setSize(width, height);
    this.motionBlurPass?.setSize(width, height);
  }

  setBloomStrength(value: number) {
    this.bloomPass.strength = value;
  }

  setBloomEnabled(enabled: boolean) {
    this.bloomPass.enabled = enabled;
  }

  setSSAOEnabled(enabled: boolean) {
    this.ssaoPass.enabled = enabled;
  }

  setExposure(value: number) {
    this.toneMappingPass.uniforms.exposure.value = value;
  }

  setDOFFocus(value: number) {
    if (this.bokehPass) {
      this.bokehPass.setFocus(value);
    }
  }

  dispose() {
    this.ssrPass?.dispose();
    this.motionBlurPass?.dispose();
    this.chromaticPass?.dispose();
    this.filmGrainPass?.dispose();
    this.lensDistortionPass?.dispose();
    this.composer.dispose();
  }
}
