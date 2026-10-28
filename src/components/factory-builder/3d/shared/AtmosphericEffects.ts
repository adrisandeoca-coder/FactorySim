import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DustMoteData {
  velocityX: Float32Array;
  velocityY: Float32Array;
  velocityZ: Float32Array;
  baseOpacity: Float32Array;
}

interface LightShaft {
  mesh: THREE.Mesh;
  baseOpacity: number;
  breathPhase: number;
  breathSpeed: number;
}

interface HeatWavePlane {
  mesh: THREE.Mesh;
  baseY: number;
  riseSpeed: number;
  wobblePhase: number;
  wobbleFreq: number;
  maxY: number;
}

interface FlickerFixture {
  light: THREE.Light;
  nextFlickerTime: number;
  flickering: boolean;
  flickerElapsed: number;
  flickerSteps: number[];
  originalIntensity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DUST_COUNT = 200;
const DUST_VOLUME = new THREE.Vector3(30, 8, 30);
const DUST_ORIGIN = new THREE.Vector3(0, 0.5, 0); // slightly above floor

const LIGHT_SHAFT_COUNT = 5;
const LIGHT_SHAFT_HEIGHT = 4;
const LIGHT_SHAFT_RADIUS = 1;
const LIGHT_SHAFT_COLOR = 0xfff8e0;

const HEAT_PLANES_PER_SOURCE = 6;
const HEAT_PLANE_SIZE = 0.5;

const FOG_PLANE_SIZE = 40;
const FOG_MAX_HEIGHT = 0.5;

const FLICKER_MIN_INTERVAL = 5;
const FLICKER_MAX_INTERVAL = 15;
const FLICKER_DURATION = 0.3;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const dustVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aOpacity;
  varying float vOpacity;

  void main() {
    vOpacity = aOpacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const dustFragmentShader = /* glsl */ `
  varying float vOpacity;
  uniform vec3 uColor;

  void main() {
    // Soft circle
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, dist) * vOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const fogVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWorldY;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldY = worldPos.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fogFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWorldY;
  uniform float uMaxHeight;
  uniform float uOpacity;
  uniform float uTime;

  void main() {
    // Height-based fade
    float heightFade = 1.0 - smoothstep(0.0, uMaxHeight, vWorldY);

    // Edge fade (denser near walls = edges of plane)
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeFade = 1.0 - smoothstep(0.0, 0.35, edgeDist);
    float density = mix(0.6, 1.0, edgeFade);

    // Subtle noise-like animation
    float wave = sin(vUv.x * 12.0 + uTime * 0.3) * cos(vUv.y * 10.0 + uTime * 0.2) * 0.15 + 0.85;

    float alpha = heightFade * density * wave * uOpacity;
    gl_FragColor = vec4(0.85, 0.85, 0.88, alpha);
  }
`;

const heatVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const heatFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;

  void main() {
    // Wavy distortion pattern
    float wave1 = sin(vUv.y * 20.0 + uTime * 3.0) * 0.5 + 0.5;
    float wave2 = sin(vUv.y * 14.0 - uTime * 2.5 + 1.7) * 0.5 + 0.5;
    float pattern = wave1 * wave2;

    // Edge fade for soft borders
    float edgeX = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float edgeY = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);

    float alpha = pattern * edgeX * edgeY * uOpacity;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

// ---------------------------------------------------------------------------
// AtmosphericEffectsManager
// ---------------------------------------------------------------------------

export class AtmosphericEffectsManager {
  private scene: THREE.Scene;
  private simulationActive = false;

  // Dust motes
  private dustGeometry: THREE.BufferGeometry | null = null;
  private dustMaterial: THREE.ShaderMaterial | null = null;
  private dustPoints: THREE.Points | null = null;
  private dustData: DustMoteData | null = null;

  // Light shafts
  private lightShafts: LightShaft[] = [];

  // Heat distortion
  private heatSources: THREE.Vector3[] = [];
  private heatWaves: HeatWavePlane[] = [];
  private heatMaterial: THREE.ShaderMaterial | null = null;

  // Floor fog
  private fogMesh: THREE.Mesh | null = null;
  private fogMaterial: THREE.ShaderMaterial | null = null;

  // Ceiling light flicker
  private flickerFixtures: FlickerFixture[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initDustMotes();
    this.initLightShafts();
    this.initFloorFog();
    this.initCeilingFlicker();
  }

  // -----------------------------------------------------------------------
  // Dust Motes
  // -----------------------------------------------------------------------

  private initDustMotes(): void {
    const positions = new Float32Array(DUST_COUNT * 3);
    const sizes = new Float32Array(DUST_COUNT);
    const opacities = new Float32Array(DUST_COUNT);
    const velocitiesX = new Float32Array(DUST_COUNT);
    const velocitiesY = new Float32Array(DUST_COUNT);
    const velocitiesZ = new Float32Array(DUST_COUNT);
    const baseOpacities = new Float32Array(DUST_COUNT);

    for (let i = 0; i < DUST_COUNT; i++) {
      // Scatter within volume
      positions[i * 3] = (Math.random() - 0.5) * DUST_VOLUME.x + DUST_ORIGIN.x;
      positions[i * 3 + 1] = Math.random() * DUST_VOLUME.y + DUST_ORIGIN.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * DUST_VOLUME.z + DUST_ORIGIN.z;

      sizes[i] = THREE.MathUtils.lerp(0.01, 0.03, Math.random());
      const opacity = THREE.MathUtils.lerp(0.15, 0.3, Math.random());
      opacities[i] = opacity;
      baseOpacities[i] = opacity;

      // Very slow drift
      velocitiesX[i] = (Math.random() - 0.5) * 0.04;
      velocitiesY[i] = Math.random() * 0.03 + 0.01; // slight upward tendency
      velocitiesZ[i] = (Math.random() - 0.5) * 0.04;
    }

    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.dustGeometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    this.dustMaterial = new THREE.ShaderMaterial({
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(1.0, 0.98, 0.9) }, // warm white
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });

    this.dustPoints = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.dustPoints.name = '_atmosphericDust';
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);

    this.dustData = {
      velocityX: velocitiesX,
      velocityY: velocitiesY,
      velocityZ: velocitiesZ,
      baseOpacity: baseOpacities,
    };
  }

  private updateDustMotes(dt: number, elapsed: number): void {
    if (!this.dustGeometry || !this.dustData) return;

    const posAttr = this.dustGeometry.getAttribute('position') as THREE.BufferAttribute;
    const opacityAttr = this.dustGeometry.getAttribute('aOpacity') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const opacities = opacityAttr.array as Float32Array;
    const { velocityX, velocityY, velocityZ, baseOpacity } = this.dustData;

    const halfX = DUST_VOLUME.x * 0.5;
    const halfZ = DUST_VOLUME.z * 0.5;
    const minY = DUST_ORIGIN.y;
    const maxY = DUST_ORIGIN.y + DUST_VOLUME.y;

    for (let i = 0; i < DUST_COUNT; i++) {
      const i3 = i * 3;

      // Add a gentle sinusoidal drift for natural look
      const sinOffset = Math.sin(elapsed * 0.5 + i * 0.37) * 0.005;

      positions[i3] += (velocityX[i] + sinOffset) * dt;
      positions[i3 + 1] += velocityY[i] * dt;
      positions[i3 + 2] += (velocityZ[i] + sinOffset * 0.7) * dt;

      // Wrap around when exiting bounds
      if (positions[i3] > DUST_ORIGIN.x + halfX) positions[i3] = DUST_ORIGIN.x - halfX;
      else if (positions[i3] < DUST_ORIGIN.x - halfX) positions[i3] = DUST_ORIGIN.x + halfX;

      if (positions[i3 + 1] > maxY) positions[i3 + 1] = minY;
      else if (positions[i3 + 1] < minY) positions[i3 + 1] = maxY;

      if (positions[i3 + 2] > DUST_ORIGIN.z + halfZ) positions[i3 + 2] = DUST_ORIGIN.z - halfZ;
      else if (positions[i3 + 2] < DUST_ORIGIN.z - halfZ) positions[i3 + 2] = DUST_ORIGIN.z + halfZ;

      // Subtle opacity shimmer (catching light beams)
      opacities[i] = baseOpacity[i] * (0.8 + 0.2 * Math.sin(elapsed * 1.2 + i * 2.1));
    }

    // During simulation, slightly increase overall brightness
    if (this.simulationActive) {
      for (let i = 0; i < DUST_COUNT; i++) {
        opacities[i] = Math.min(opacities[i] * 1.3, 0.4);
      }
    }

    posAttr.needsUpdate = true;
    opacityAttr.needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Light Shafts / God Rays
  // -----------------------------------------------------------------------

  private initLightShafts(): void {
    // Place light shafts at fixed positions simulating ceiling light fixtures
    const shaftPositions: THREE.Vector3[] = [
      new THREE.Vector3(-6, 6, -4),
      new THREE.Vector3(0, 6, -4),
      new THREE.Vector3(6, 6, -4),
      new THREE.Vector3(-3, 6, 4),
      new THREE.Vector3(3, 6, 4),
    ];

    for (let i = 0; i < LIGHT_SHAFT_COUNT && i < shaftPositions.length; i++) {
      const geometry = new THREE.ConeGeometry(
        LIGHT_SHAFT_RADIUS, // radius at base
        LIGHT_SHAFT_HEIGHT, // height
        16,                 // radial segments
        1,                  // height segments
        true                // open-ended
      );

      const baseOpacity = THREE.MathUtils.lerp(0.03, 0.06, Math.random());

      const material = new THREE.MeshBasicMaterial({
        color: LIGHT_SHAFT_COLOR,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide, // front-face only for one-sided visibility
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(shaftPositions[i]);
      // Cone points up by default; rotate so it points downward
      mesh.rotation.x = Math.PI;
      mesh.name = `_lightShaft_${i}`;

      this.scene.add(mesh);

      this.lightShafts.push({
        mesh,
        baseOpacity,
        breathPhase: Math.random() * Math.PI * 2,
        breathSpeed: THREE.MathUtils.lerp(0.3, 0.7, Math.random()),
      });
    }
  }

  private updateLightShafts(elapsed: number): void {
    for (const shaft of this.lightShafts) {
      const material = shaft.mesh.material as THREE.MeshBasicMaterial;
      // Subtle breathing: +-0.01 opacity
      const breath = Math.sin(elapsed * shaft.breathSpeed + shaft.breathPhase) * 0.01;
      material.opacity = Math.max(0.01, shaft.baseOpacity + breath);
    }
  }

  // -----------------------------------------------------------------------
  // Heat Distortion
  // -----------------------------------------------------------------------

  public registerHeatSource(position: THREE.Vector3): void {
    this.heatSources.push(position.clone());
    this.createHeatWavesForSource(position);
  }

  private createHeatWavesForSource(position: THREE.Vector3): void {
    if (!this.heatMaterial) {
      this.heatMaterial = new THREE.ShaderMaterial({
        vertexShader: heatVertexShader,
        fragmentShader: heatFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.03 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    for (let i = 0; i < HEAT_PLANES_PER_SOURCE; i++) {
      const geometry = new THREE.PlaneGeometry(HEAT_PLANE_SIZE, HEAT_PLANE_SIZE);
      const material = this.heatMaterial.clone();
      const opacity = THREE.MathUtils.lerp(0.02, 0.04, Math.random());
      (material.uniforms.uOpacity as { value: number }).value = opacity;

      const mesh = new THREE.Mesh(geometry, material);
      const baseY = position.y + 0.5 + i * 0.4;
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.3,
        baseY,
        position.z + (Math.random() - 0.5) * 0.3
      );
      // Face the plane upward-ish so it catches view from most angles
      mesh.rotation.x = -Math.PI * 0.3;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.name = '_heatWave';

      this.scene.add(mesh);

      this.heatWaves.push({
        mesh,
        baseY,
        riseSpeed: THREE.MathUtils.lerp(0.15, 0.35, Math.random()),
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: THREE.MathUtils.lerp(1.5, 3.0, Math.random()),
        maxY: baseY + 2.5,
      });
    }
  }

  private updateHeatWaves(dt: number, elapsed: number): void {
    for (const wave of this.heatWaves) {
      // Rise
      wave.mesh.position.y += wave.riseSpeed * dt;

      // Horizontal wobble
      wave.mesh.position.x += Math.sin(elapsed * wave.wobbleFreq + wave.wobblePhase) * 0.002;

      // Reset when too high
      if (wave.mesh.position.y > wave.maxY) {
        wave.mesh.position.y = wave.baseY;
      }

      // Update shader time
      const material = wave.mesh.material as THREE.ShaderMaterial;
      (material.uniforms.uTime as { value: number }).value = elapsed;

      // Fade out near top
      const progress = (wave.mesh.position.y - wave.baseY) / (wave.maxY - wave.baseY);
      const fadedOpacity = THREE.MathUtils.lerp(0.03, 0.005, progress);
      (material.uniforms.uOpacity as { value: number }).value = fadedOpacity;
    }
  }

  // -----------------------------------------------------------------------
  // Floor Fog
  // -----------------------------------------------------------------------

  private initFloorFog(): void {
    const geometry = new THREE.PlaneGeometry(FOG_PLANE_SIZE, FOG_PLANE_SIZE, 1, 1);

    this.fogMaterial = new THREE.ShaderMaterial({
      vertexShader: fogVertexShader,
      fragmentShader: fogFragmentShader,
      uniforms: {
        uMaxHeight: { value: FOG_MAX_HEIGHT },
        uOpacity: { value: 0.04 },
        uTime: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.fogMesh = new THREE.Mesh(geometry, this.fogMaterial);
    this.fogMesh.rotation.x = -Math.PI * 0.5; // lay flat
    this.fogMesh.position.y = 0.05; // just above floor
    this.fogMesh.name = '_floorFog';
    this.scene.add(this.fogMesh);
  }

  private updateFloorFog(elapsed: number): void {
    if (!this.fogMaterial) return;
    (this.fogMaterial.uniforms.uTime as { value: number }).value = elapsed;

    // Slightly increase fog density during simulation
    const targetOpacity = this.simulationActive ? 0.06 : 0.04;
    const current = (this.fogMaterial.uniforms.uOpacity as { value: number }).value;
    (this.fogMaterial.uniforms.uOpacity as { value: number }).value =
      THREE.MathUtils.lerp(current, targetOpacity, 0.02);
  }

  // -----------------------------------------------------------------------
  // Ceiling Light Flicker
  // -----------------------------------------------------------------------

  private initCeilingFlicker(): void {
    // Search the scene for fluorescent light objects to flicker
    // We look for point/spot lights that might be ceiling fixtures
    const candidates: THREE.Light[] = [];
    this.scene.traverse((obj) => {
      if (
        (obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) &&
        obj.position.y > 4 // ceiling-height lights
      ) {
        candidates.push(obj);
      }
    });

    // Pick 1-2 random fixtures
    const count = Math.min(candidates.length, Math.random() < 0.5 ? 1 : 2);
    const shuffled = candidates.sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
      const light = shuffled[i];
      this.flickerFixtures.push({
        light,
        nextFlickerTime: THREE.MathUtils.lerp(FLICKER_MIN_INTERVAL, FLICKER_MAX_INTERVAL, Math.random()),
        flickering: false,
        flickerElapsed: 0,
        flickerSteps: this.generateFlickerSteps(),
        originalIntensity: light.intensity,
      });
    }
  }

  private generateFlickerSteps(): number[] {
    // 3-4 rapid intensity changes over FLICKER_DURATION
    const stepCount = Math.random() < 0.5 ? 3 : 4;
    const steps: number[] = [];
    for (let i = 0; i < stepCount; i++) {
      steps.push(Math.random() < 0.5 ? 0.2 : 0.7); // dim or bright
    }
    steps.push(1.0); // always return to full at end
    return steps;
  }

  private updateCeilingFlicker(dt: number, elapsed: number): void {
    for (const fixture of this.flickerFixtures) {
      if (fixture.flickering) {
        fixture.flickerElapsed += dt;

        if (fixture.flickerElapsed >= FLICKER_DURATION) {
          // Flicker done, restore intensity
          fixture.flickering = false;
          fixture.flickerElapsed = 0;
          fixture.light.intensity = fixture.originalIntensity;
          fixture.nextFlickerTime =
            elapsed + THREE.MathUtils.lerp(FLICKER_MIN_INTERVAL, FLICKER_MAX_INTERVAL, Math.random());
          fixture.flickerSteps = this.generateFlickerSteps();
        } else {
          // Determine which step we're on
          const progress = fixture.flickerElapsed / FLICKER_DURATION;
          const stepIndex = Math.min(
            Math.floor(progress * fixture.flickerSteps.length),
            fixture.flickerSteps.length - 1
          );
          fixture.light.intensity = fixture.originalIntensity * fixture.flickerSteps[stepIndex];
        }
      } else {
        // Check if it's time to flicker
        if (elapsed >= fixture.nextFlickerTime) {
          fixture.flickering = true;
          fixture.flickerElapsed = 0;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Update all atmospheric effects. Call once per frame.
   * @param dt Delta time in seconds since last frame
   * @param elapsed Total elapsed time in seconds
   */
  update(dt: number, elapsed: number): void {
    this.updateDustMotes(dt, elapsed);
    this.updateLightShafts(elapsed);
    this.updateHeatWaves(dt, elapsed);
    this.updateFloorFog(elapsed);
    this.updateCeilingFlicker(dt, elapsed);
  }

  /**
   * Toggle simulation-active state. Some effects intensify during simulation
   * (e.g., dust density, fog thickness).
   */
  setSimulationActive(active: boolean): void {
    this.simulationActive = active;
  }

  /**
   * Clean up all created objects and release GPU resources.
   */
  dispose(): void {
    // Dust motes
    if (this.dustPoints) {
      this.scene.remove(this.dustPoints);
      this.dustGeometry?.dispose();
      this.dustMaterial?.dispose();
      this.dustPoints = null;
      this.dustGeometry = null;
      this.dustMaterial = null;
      this.dustData = null;
    }

    // Light shafts
    for (const shaft of this.lightShafts) {
      this.scene.remove(shaft.mesh);
      shaft.mesh.geometry.dispose();
      (shaft.mesh.material as THREE.Material).dispose();
    }
    this.lightShafts = [];

    // Heat waves
    for (const wave of this.heatWaves) {
      this.scene.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      (wave.mesh.material as THREE.Material).dispose();
    }
    this.heatWaves = [];
    this.heatMaterial?.dispose();
    this.heatMaterial = null;
    this.heatSources = [];

    // Floor fog
    if (this.fogMesh) {
      this.scene.remove(this.fogMesh);
      this.fogMesh.geometry.dispose();
      this.fogMaterial?.dispose();
      this.fogMesh = null;
      this.fogMaterial = null;
    }

    // Flicker fixtures (restore original intensity, don't remove lights we didn't create)
    for (const fixture of this.flickerFixtures) {
      fixture.light.intensity = fixture.originalIntensity;
    }
    this.flickerFixtures = [];
  }
}
