import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

type EffectType =
  | 'welding_sparks'
  | 'steam'
  | 'smoke'
  | 'coolant_spray'
  | 'laser_beam'
  | 'heat_shimmer'
  | 'dust';

interface EffectConfig {
  maxParticles: number;
  emitRate: number;
  particleLife: number;
  speed: number;
  spread: number;
  startSize: number;
  endSize: number;
  startColor: THREE.Color;
  endColor: THREE.Color;
  startOpacity: number;
  endOpacity: number;
  gravity: number;
  texture: 'circle' | 'spark' | 'smoke';
}

// ---------------------------------------------------------------------------
// Effect presets
// ---------------------------------------------------------------------------

const EFFECT_CONFIGS: Record<EffectType, EffectConfig> = {
  welding_sparks: {
    maxParticles: 96,
    emitRate: 180,
    particleLife: 0.55,
    speed: 3.5,
    spread: 0.6,
    startSize: 0.025,
    endSize: 0.008,
    startColor: new THREE.Color(0xffff88),
    endColor: new THREE.Color(0xff3300),
    startOpacity: 1.0,
    endOpacity: 0.0,
    gravity: -6.0,
    texture: 'spark',
  },
  steam: {
    maxParticles: 60,
    emitRate: 12,
    particleLife: 3.0,
    speed: 0.35,
    spread: 0.25,
    startSize: 0.08,
    endSize: 0.36,
    startColor: new THREE.Color(0.95, 0.95, 0.97),
    endColor: new THREE.Color(0.8, 0.82, 0.84),
    startOpacity: 0.45,
    endOpacity: 0.0,
    gravity: 0.15,
    texture: 'smoke',
  },
  smoke: {
    maxParticles: 48,
    emitRate: 10,
    particleLife: 4.0,
    speed: 0.4,   // faster initial rise
    spread: 0.2,
    startSize: 0.08,
    endSize: 0.4,
    startColor: new THREE.Color(0.35, 0.35, 0.37),
    endColor: new THREE.Color(0.22, 0.22, 0.24),
    startOpacity: 0.5,
    endOpacity: 0.0,
    gravity: 0.12, // positive = upward in Three.js Y-up, keeps smoke rising
    texture: 'smoke',
  },
  coolant_spray: {
    maxParticles: 48,
    emitRate: 120,
    particleLife: 0.7,
    speed: 2.8,
    spread: 0.45,
    startSize: 0.018,
    endSize: 0.01,
    startColor: new THREE.Color(0x44aaff),
    endColor: new THREE.Color(0.3, 0.55, 0.9),
    startOpacity: 0.7,
    endOpacity: 0.0,
    gravity: -3.0,
    texture: 'circle',
  },
  laser_beam: {
    maxParticles: 32,
    emitRate: 200,
    particleLife: 0.15,
    speed: 0.4,
    spread: 0.05,
    startSize: 0.012,
    endSize: 0.006,
    startColor: new THREE.Color(1.0, 0.15, 0.1),
    endColor: new THREE.Color(1.0, 0.3, 0.15),
    startOpacity: 0.9,
    endOpacity: 0.0,
    gravity: 0.0,
    texture: 'circle',
  },
  heat_shimmer: {
    maxParticles: 24,
    emitRate: 8,
    particleLife: 2.5,
    speed: 0.12,
    spread: 0.35,
    startSize: 0.15,
    endSize: 0.3,
    startColor: new THREE.Color(1.0, 0.95, 0.85),
    endColor: new THREE.Color(1.0, 0.97, 0.9),
    startOpacity: 0.06,
    endOpacity: 0.0,
    gravity: 0.1,
    texture: 'smoke',
  },
  dust: {
    maxParticles: 36,
    emitRate: 18,
    particleLife: 2.0,
    speed: 0.3,
    spread: 0.8,
    startSize: 0.015,
    endSize: 0.025,
    startColor: new THREE.Color(0.72, 0.64, 0.5),
    endColor: new THREE.Color(0.6, 0.55, 0.45),
    startOpacity: 0.4,
    endOpacity: 0.0,
    gravity: -0.15,
    texture: 'circle',
  },
};

// ---------------------------------------------------------------------------
// Shared shaders — compiled once, referenced by all instances
// ---------------------------------------------------------------------------

const VERT_SHADER = /* glsl */ `
  attribute float a_life;
  attribute float a_size;
  attribute vec3  a_color;
  attribute float a_opacity;

  varying float v_life;
  varying vec3  v_color;
  varying float v_opacity;

  void main() {
    v_life    = a_life;
    v_color   = a_color;
    v_opacity = a_opacity;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Scale point size by inverse distance so it looks consistent
    gl_PointSize = a_size * (300.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const FRAG_CIRCLE = /* glsl */ `
  varying float v_life;
  varying vec3  v_color;
  varying float v_opacity;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float alpha = v_opacity * (1.0 - smoothstep(0.4, 1.0, d));
    gl_FragColor = vec4(v_color, alpha);
  }
`;

const FRAG_SPARK = /* glsl */ `
  varying float v_life;
  varying vec3  v_color;
  varying float v_opacity;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    // Bright hot-center falloff for sparks
    float core  = exp(-d * 6.0);
    float glow  = exp(-d * 2.0) * 0.4;
    float alpha = v_opacity * (core + glow);
    vec3  col   = mix(v_color, vec3(1.0), core * 0.6);
    gl_FragColor = vec4(col, alpha);
  }
`;

const FRAG_SMOKE = /* glsl */ `
  varying float v_life;
  varying vec3  v_color;
  varying float v_opacity;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    // Very soft puff
    float alpha = v_opacity * (1.0 - d) * (1.0 - d);
    gl_FragColor = vec4(v_color, alpha);
  }
`;

function fragForTexture(tex: 'circle' | 'spark' | 'smoke'): string {
  if (tex === 'spark') return FRAG_SPARK;
  if (tex === 'smoke') return FRAG_SMOKE;
  return FRAG_CIRCLE;
}

// ---------------------------------------------------------------------------
// Single effect instance
// ---------------------------------------------------------------------------

class ParticleEffect {
  readonly id: string;
  readonly config: EffectConfig;
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;

  active = true;

  private particles: Particle[];
  private head = 0;                 // ring-buffer write cursor
  private accumulator = 0;          // fractional particle accumulation

  // GPU buffers
  private geometry: THREE.BufferGeometry;
  private posAttr: THREE.Float32BufferAttribute;
  private lifeAttr: THREE.Float32BufferAttribute;
  private sizeAttr: THREE.Float32BufferAttribute;
  private colorAttr: THREE.Float32BufferAttribute;
  private opacityAttr: THREE.Float32BufferAttribute;

  points: THREE.Points;

  // Reusable temporaries to avoid per-frame allocation
  private static _tmpDir = new THREE.Vector3();
  private static _tmpPerp1 = new THREE.Vector3();
  private static _tmpPerp2 = new THREE.Vector3();

  constructor(
    id: string,
    type: EffectType,
    position: THREE.Vector3,
    direction: THREE.Vector3,
  ) {
    this.id = id;
    this.config = { ...EFFECT_CONFIGS[type] };
    this.position = position.clone();
    this.direction = direction.clone().normalize();

    const n = this.config.maxParticles;

    // Pre-allocate particle pool
    this.particles = [];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        size: 0,
        color: new THREE.Color(),
      });
    }

    // Buffers
    const posArr     = new Float32Array(n * 3);
    const lifeArr    = new Float32Array(n);
    const sizeArr    = new Float32Array(n);
    const colorArr   = new Float32Array(n * 3);
    const opacityArr = new Float32Array(n);

    this.geometry = new THREE.BufferGeometry();
    this.posAttr     = new THREE.Float32BufferAttribute(posArr, 3);
    this.lifeAttr    = new THREE.Float32BufferAttribute(lifeArr, 1);
    this.sizeAttr    = new THREE.Float32BufferAttribute(sizeArr, 1);
    this.colorAttr   = new THREE.Float32BufferAttribute(colorArr, 3);
    this.opacityAttr = new THREE.Float32BufferAttribute(opacityArr, 1);

    this.geometry.setAttribute('position',  this.posAttr);
    this.geometry.setAttribute('a_life',    this.lifeAttr);
    this.geometry.setAttribute('a_size',    this.sizeAttr);
    this.geometry.setAttribute('a_color',   this.colorAttr);
    this.geometry.setAttribute('a_opacity', this.opacityAttr);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT_SHADER,
      fragmentShader: fragForTexture(this.config.texture),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  /** Emit new particles and advance existing ones. */
  update(dt: number): void {
    const cfg = this.config;
    const n = cfg.maxParticles;

    // --- Emit new particles ---
    if (this.active) {
      this.accumulator += cfg.emitRate * dt;
      const toEmit = Math.floor(this.accumulator);
      this.accumulator -= toEmit;

      for (let e = 0; e < toEmit; e++) {
        const p = this.particles[this.head];
        this.head = (this.head + 1) % n;

        p.maxLife = cfg.particleLife * (0.7 + Math.random() * 0.6);
        p.life = p.maxLife;
        p.position.copy(this.position);

        // Build a random direction inside the spread cone
        const dir = ParticleEffect._tmpDir.copy(this.direction);
        const perp1 = ParticleEffect._tmpPerp1;
        const perp2 = ParticleEffect._tmpPerp2;

        // Pick an arbitrary perpendicular
        if (Math.abs(dir.x) < 0.9) {
          perp1.set(1, 0, 0);
        } else {
          perp1.set(0, 1, 0);
        }
        perp1.cross(dir).normalize();
        perp2.crossVectors(dir, perp1);

        const angle = Math.random() * Math.PI * 2;
        const spread = Math.random() * cfg.spread;
        const sinS = Math.sin(spread);

        p.velocity
          .copy(dir)
          .multiplyScalar(Math.cos(spread))
          .addScaledVector(perp1, Math.cos(angle) * sinS)
          .addScaledVector(perp2, Math.sin(angle) * sinS)
          .normalize()
          .multiplyScalar(cfg.speed * (0.6 + Math.random() * 0.8));
      }
    }

    // --- Update all particles ---
    const posArr     = this.posAttr.array as Float32Array;
    const lifeArr    = this.lifeAttr.array as Float32Array;
    const sizeArr    = this.sizeAttr.array as Float32Array;
    const colorArr   = this.colorAttr.array as Float32Array;
    const opacityArr = this.opacityAttr.array as Float32Array;

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        // Dead particle — keep it at zero size so it's invisible
        sizeArr[i] = 0;
        opacityArr[i] = 0;
        continue;
      }

      p.life -= dt;
      if (p.life < 0) p.life = 0;

      // Apply gravity (positive = upward in Three.js Y-up)
      p.velocity.y += cfg.gravity * dt;

      // Integrate position
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Normalised life fraction (1 = just born, 0 = dead)
      const t = 1 - p.life / p.maxLife; // 0→1 over lifetime

      // Interpolate visual properties
      const size = cfg.startSize + (cfg.endSize - cfg.startSize) * t;
      const opacity = cfg.startOpacity + (cfg.endOpacity - cfg.startOpacity) * t;
      p.color.copy(cfg.startColor).lerp(cfg.endColor, t);

      // Write to attribute arrays
      const i3 = i * 3;
      posArr[i3]     = p.position.x;
      posArr[i3 + 1] = p.position.y;
      posArr[i3 + 2] = p.position.z;

      lifeArr[i]  = p.life / p.maxLife;
      sizeArr[i]  = size;
      opacityArr[i] = opacity;

      colorArr[i3]     = p.color.r;
      colorArr[i3 + 1] = p.color.g;
      colorArr[i3 + 2] = p.color.b;
    }

    // Flag buffers for GPU upload
    this.posAttr.needsUpdate     = true;
    this.lifeAttr.needsUpdate    = true;
    this.sizeAttr.needsUpdate    = true;
    this.colorAttr.needsUpdate   = true;
    this.opacityAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}

// ---------------------------------------------------------------------------
// Manager — public API
// ---------------------------------------------------------------------------

let _nextId = 0;

export class ParticleEffectManager {
  private scene: THREE.Scene;
  private effects = new Map<string, ParticleEffect>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Create and add a new particle effect. Returns a unique effect id. */
  createEffect(
    type: EffectType,
    position: THREE.Vector3,
    direction: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
  ): string {
    const id = `particle_${_nextId++}`;
    const effect = new ParticleEffect(id, type, position, direction);
    this.effects.set(id, effect);
    this.scene.add(effect.points);
    return id;
  }

  /** Enable or disable emission for an existing effect. */
  setActive(effectId: string, active: boolean): void {
    const e = this.effects.get(effectId);
    if (e) e.active = active;
  }

  /** Advance every active effect. Call once per frame. */
  update(dt: number, _elapsed: number): void {
    // Clamp dt to prevent huge jumps after tab-away
    const clamped = Math.min(dt, 0.1);
    this.effects.forEach((effect) => {
      effect.update(clamped);
    });
  }

  /** Remove a single effect and free its GPU resources. */
  removeEffect(effectId: string): void {
    const e = this.effects.get(effectId);
    if (!e) return;
    this.scene.remove(e.points);
    e.dispose();
    this.effects.delete(effectId);
  }

  /** Tear down every effect. */
  dispose(): void {
    this.effects.forEach((e) => {
      this.scene.remove(e.points);
      e.dispose();
    });
    this.effects.clear();
  }
}

export type { EffectType, EffectConfig, Particle };
