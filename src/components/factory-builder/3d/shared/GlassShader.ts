import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlassParams {
  color?: THREE.Color;
  opacity?: number;
  roughness?: number;
  refractionStrength?: number;
  thickness?: number;
  fresnelPower?: number;
  ior?: number;
}

// ---------------------------------------------------------------------------
// Shared GLSL chunks
// ---------------------------------------------------------------------------

const glassVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Simplex-style 2D noise used by frosted glass for UV scatter. */
const noiseGlsl = /* glsl */ `
  // Hash-based pseudo-random for procedural noise
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float simplexNoise2D(vec2 p) {
    const float K1 = 0.366025404;  // (sqrt(3) - 1) / 2
    const float K2 = 0.211324865;  // (3 - sqrt(3)) / 6
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash22(i)), dot(b, hash22(i + o)), dot(c, hash22(i + 1.0)));
    return dot(n, vec3(70.0));
  }
`;

// ---------------------------------------------------------------------------
// 1. createGlassMaterial
// ---------------------------------------------------------------------------

function buildGlassFragmentShader(opts: {
  frosted?: boolean;
  safetyWire?: boolean;
}): string {
  const { frosted = false, safetyWire = false } = opts;

  return /* glsl */ `
    uniform vec3 uGlassColor;
    uniform float uOpacity;
    uniform float uRoughness;
    uniform float uRefractionStrength;
    uniform float uThickness;
    uniform float uFresnelPower;
    uniform float uF0;
    uniform vec2 uResolution;
    uniform sampler2D tBackground;

    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec3 vViewDir;

    ${frosted ? noiseGlsl : ''}

    void main() {
      vec3 normal = normalize(vWorldNormal);
      vec3 viewDir = normalize(vViewDir);
      float NdotV = abs(dot(normal, viewDir));

      // --- Fresnel (Schlick) ---
      float fresnel = uF0 + (1.0 - uF0) * pow(1.0 - NdotV, uFresnelPower);
      fresnel = clamp(fresnel, 0.0, 1.0);

      // --- Refraction UV ---
      vec2 screenUV = gl_FragCoord.xy / uResolution;
      vec2 refractionOffset = normal.xy * uRefractionStrength;

      ${frosted ? `
      // Frosted glass: scatter the refraction UV with noise
      float noiseScale = 40.0;
      float scatter = uRoughness * 0.04;
      vec2 noiseUV = vWorldPosition.xy * noiseScale;
      refractionOffset += vec2(
        simplexNoise2D(noiseUV),
        simplexNoise2D(noiseUV + vec2(43.0, 17.0))
      ) * scatter;
      ` : ''}

      vec2 refractedUV = screenUV + refractionOffset;
      refractedUV = clamp(refractedUV, 0.0, 1.0);
      vec3 refractedColor = texture2D(tBackground, refractedUV).rgb;

      ${frosted ? `
      // Extra blur samples for frosted look
      float blurRadius = uRoughness * 0.008;
      vec3 blurred = refractedColor;
      blurred += texture2D(tBackground, refractedUV + vec2(blurRadius, 0.0)).rgb;
      blurred += texture2D(tBackground, refractedUV - vec2(blurRadius, 0.0)).rgb;
      blurred += texture2D(tBackground, refractedUV + vec2(0.0, blurRadius)).rgb;
      blurred += texture2D(tBackground, refractedUV - vec2(0.0, blurRadius)).rgb;
      blurred += texture2D(tBackground, refractedUV + vec2(blurRadius, blurRadius) * 0.707).rgb;
      blurred += texture2D(tBackground, refractedUV - vec2(blurRadius, blurRadius) * 0.707).rgb;
      blurred += texture2D(tBackground, refractedUV + vec2(-blurRadius, blurRadius) * 0.707).rgb;
      blurred += texture2D(tBackground, refractedUV + vec2(blurRadius, -blurRadius) * 0.707).rgb;
      refractedColor = blurred / 9.0;
      ` : ''}

      // --- Thickness-based tint ---
      vec3 tint = mix(vec3(1.0), uGlassColor, uThickness * (1.0 - NdotV));
      vec3 tintedRefraction = refractedColor * tint;

      // --- Reflection color (environment approximation) ---
      vec3 reflectDir = reflect(-viewDir, normal);
      // Simple sky-ground gradient as reflection fallback
      float reflectY = reflectDir.y * 0.5 + 0.5;
      vec3 reflectionColor = mix(vec3(0.3, 0.35, 0.4), vec3(0.7, 0.8, 0.95), reflectY);

      // --- Edge highlight (rim) ---
      float rim = pow(1.0 - NdotV, 4.0) * 0.3;

      // --- Compose ---
      vec3 color = mix(tintedRefraction, reflectionColor, fresnel) + vec3(rim);

      ${safetyWire ? `
      // --- Safety wire mesh ---
      vec2 meshUV = fract(vWorldPosition.xz * 20.0); // grid every ~0.05 world units
      float wireWidth = 0.03;
      float wireX = smoothstep(wireWidth, wireWidth * 0.5, abs(meshUV.x - 0.5));
      float wireY = smoothstep(wireWidth, wireWidth * 0.5, abs(meshUV.y - 0.5));
      float wire = max(wireX, wireY);
      // Wire more visible at straight-on angles
      wire *= NdotV;
      vec3 wireColor = vec3(0.15, 0.18, 0.15);
      color = mix(color, wireColor, wire * 0.6);
      ` : ''}

      float alpha = uOpacity + fresnel * (1.0 - uOpacity) + rim;
      alpha = clamp(alpha, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `;
}

function resolveGlassParams(params?: GlassParams): Required<GlassParams> {
  return {
    color: params?.color ?? new THREE.Color(0x88bbdd),
    opacity: params?.opacity ?? 0.12,
    roughness: params?.roughness ?? 0.05,
    refractionStrength: params?.refractionStrength ?? 0.02,
    thickness: params?.thickness ?? 0.3,
    fresnelPower: params?.fresnelPower ?? 3.0,
    ior: params?.ior ?? 1.5,
  };
}

function computeF0(ior: number): number {
  const ratio = (ior - 1) / (ior + 1);
  return ratio * ratio;
}

function buildUniforms(p: Required<GlassParams>): Record<string, THREE.IUniform> {
  return {
    uGlassColor: { value: p.color },
    uOpacity: { value: p.opacity },
    uRoughness: { value: p.roughness },
    uRefractionStrength: { value: p.refractionStrength },
    uThickness: { value: p.thickness },
    uFresnelPower: { value: p.fresnelPower },
    uF0: { value: computeF0(p.ior) },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    tBackground: { value: null as THREE.Texture | null },
  };
}

function buildShaderMaterial(
  uniforms: Record<string, THREE.IUniform>,
  fragmentShader: string,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: glassVertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

/**
 * Standard clear glass material with Fresnel reflection, refraction
 * distortion, thickness tint, and edge highlights.
 */
export function createGlassMaterial(params?: GlassParams): THREE.ShaderMaterial {
  const p = resolveGlassParams(params);
  const uniforms = buildUniforms(p);
  const fragmentShader = buildGlassFragmentShader({ frosted: false });
  return buildShaderMaterial(uniforms, fragmentShader);
}

// ---------------------------------------------------------------------------
// 2. createFrostedGlassMaterial
// ---------------------------------------------------------------------------

/**
 * Frosted / sandblasted glass material. Same base as clear glass but with
 * noise-scattered refraction for a soft, diffused look.
 */
export function createFrostedGlassMaterial(params?: GlassParams): THREE.ShaderMaterial {
  const p = resolveGlassParams({
    roughness: 0.4,
    ...params,
  });
  // Bump opacity slightly for frosted look
  if (params?.opacity === undefined) {
    p.opacity = 0.18;
  }
  const uniforms = buildUniforms(p);
  const fragmentShader = buildGlassFragmentShader({ frosted: true });
  return buildShaderMaterial(uniforms, fragmentShader);
}

// ---------------------------------------------------------------------------
// 3. createSafetyGlassMaterial
// ---------------------------------------------------------------------------

/**
 * Wire-reinforced safety glass with embedded dark grid mesh and a slightly
 * green tint typical of real safety glass.
 */
export function createSafetyGlassMaterial(): THREE.ShaderMaterial {
  const p = resolveGlassParams({
    color: new THREE.Color(0x90b8a0),
    opacity: 0.15,
    thickness: 0.4,
  });
  const uniforms = buildUniforms(p);
  const fragmentShader = buildGlassFragmentShader({ safetyWire: true });
  return buildShaderMaterial(uniforms, fragmentShader);
}

// ---------------------------------------------------------------------------
// 4. GlassManager
// ---------------------------------------------------------------------------

/**
 * Manages a background render target so glass materials can sample the scene
 * behind them for refraction. Renders the scene once without glass objects,
 * stores that as a texture, then glass materials sample it with UV distortion.
 *
 * Usage:
 * ```ts
 * const gm = new GlassManager(renderer, scene, camera);
 * // In render loop, before rendering the full scene:
 * gm.updateBackground();
 * glassMaterial.uniforms.tBackground.value = gm.getBackgroundTexture();
 * ```
 */
export class GlassManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderTarget: THREE.WebGLRenderTarget;
  private glassMeshes: THREE.Object3D[] = [];

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    this.renderTarget = new THREE.WebGLRenderTarget(
      size.x || window.innerWidth,
      size.y || window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      },
    );
  }

  /**
   * Register glass meshes so they can be temporarily hidden during the
   * background pass. Call this whenever glass objects are added or removed.
   */
  registerGlassMeshes(meshes: THREE.Object3D[]): void {
    this.glassMeshes = meshes;
  }

  /**
   * Render the scene to the background target with glass objects hidden.
   * Call this once per frame, before the main scene render.
   */
  updateBackground(): void {
    // Resize render target if the canvas size changed
    const size = this.renderer.getSize(new THREE.Vector2());
    if (
      this.renderTarget.width !== size.x ||
      this.renderTarget.height !== size.y
    ) {
      this.renderTarget.setSize(size.x, size.y);
    }

    // Hide glass objects
    const previousVisibility: boolean[] = [];
    for (let i = 0; i < this.glassMeshes.length; i++) {
      previousVisibility[i] = this.glassMeshes[i].visible;
      this.glassMeshes[i].visible = false;
    }

    // Render to the background target
    const previousRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousRenderTarget);

    // Restore glass visibility
    for (let i = 0; i < this.glassMeshes.length; i++) {
      this.glassMeshes[i].visible = previousVisibility[i];
    }
  }

  /** Returns the background texture for use in glass material uniforms. */
  getBackgroundTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  /** Clean up GPU resources. */
  dispose(): void {
    this.renderTarget.dispose();
    this.glassMeshes = [];
  }
}
