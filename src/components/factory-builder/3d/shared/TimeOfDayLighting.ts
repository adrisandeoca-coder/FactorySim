import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────

export type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export interface LightingPreset {
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunAngle: number;
  sunAzimuth: number;
  skylightColor: number;
  skylightIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  clearColor: number;
}

// ── Presets ───────────────────────────────────────────────────────────

const PRESETS: Record<TimeOfDay, LightingPreset> = {
  dawn: {
    ambientColor: 0xffa060,
    ambientIntensity: 0.15,
    sunColor: 0xffcc88,
    sunIntensity: 0.3,
    sunAngle: 15,
    sunAzimuth: 90,
    skylightColor: 0xffcc88,
    skylightIntensity: 0.2,
    fogColor: 0x6678aa,
    fogNear: 20,
    fogFar: 80,
    clearColor: 0x6678aa,
  },
  morning: {
    ambientColor: 0xe0e8f0,
    ambientIntensity: 0.25,
    sunColor: 0xfff4e0,
    sunIntensity: 0.7,
    sunAngle: 35,
    sunAzimuth: 120,
    skylightColor: 0xfff4e0,
    skylightIntensity: 0.5,
    fogColor: 0xc8d0e0,
    fogNear: 40,
    fogFar: 120,
    clearColor: 0xc8d0e0,
  },
  midday: {
    ambientColor: 0xffffff,
    ambientIntensity: 0.3,
    sunColor: 0xfff8f0,
    sunIntensity: 0.9,
    sunAngle: 60,
    sunAzimuth: 180,
    skylightColor: 0xfff8f0,
    skylightIntensity: 0.7,
    fogColor: 0xe8e8e8,
    fogNear: 60,
    fogFar: 200,
    clearColor: 0xe8e8e8,
  },
  afternoon: {
    ambientColor: 0xf0e8e0,
    ambientIntensity: 0.25,
    sunColor: 0xffeedd,
    sunIntensity: 0.8,
    sunAngle: 40,
    sunAzimuth: 240,
    skylightColor: 0xffeedd,
    skylightIntensity: 0.5,
    fogColor: 0xd8d0c8,
    fogNear: 40,
    fogFar: 120,
    clearColor: 0xd8d0c8,
  },
  evening: {
    ambientColor: 0xff8844,
    ambientIntensity: 0.15,
    sunColor: 0xff6622,
    sunIntensity: 0.4,
    sunAngle: 10,
    sunAzimuth: 270,
    skylightColor: 0xff6622,
    skylightIntensity: 0.2,
    fogColor: 0x997755,
    fogNear: 20,
    fogFar: 80,
    clearColor: 0x997755,
  },
  night: {
    ambientColor: 0x1a2040,
    ambientIntensity: 0.08,
    sunColor: 0x000000,
    sunIntensity: 0,
    sunAngle: -10,
    sunAzimuth: 0,
    skylightColor: 0x1a2040,
    skylightIntensity: 0,
    fogColor: 0x0a1020,
    fogNear: 10,
    fogFar: 60,
    clearColor: 0x0a1020,
  },
};

/** Map each preset to its nominal hour for interpolation. */
const TIME_HOURS: Record<TimeOfDay, number> = {
  dawn: 6,
  morning: 9,
  midday: 12,
  afternoon: 15,
  evening: 18,
  night: 21,
};

/** Ordered list for cycling / interpolation. */
const TIME_ORDER: TimeOfDay[] = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];

// ── Skylight config ──────────────────────────────────────────────────

const SKYLIGHT_COUNT = 4;
const SKYLIGHT_WIDTH = 2;
const SKYLIGHT_DEPTH = 1;
const SKYLIGHT_Y = 5.9; // just under a typical 6m ceiling
const SKYLIGHT_SPACING = 4;
const SKYLIGHT_POOL_Y = 0.5; // height of light pool above floor

// ── Helpers ──────────────────────────────────────────────────────────

function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Interpolate every field of two LightingPresets into a new object. */
function lerpPreset(a: LightingPreset, b: LightingPreset, t: number): LightingPreset {
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const cOut = new THREE.Color();

  const lerpHex = (ha: number, hb: number): number => {
    cA.setHex(ha);
    cB.setHex(hb);
    lerpColor(cOut, cA, cB, t);
    return (
      ((Math.round(cOut.r * 255) & 0xff) << 16) |
      ((Math.round(cOut.g * 255) & 0xff) << 8) |
      (Math.round(cOut.b * 255) & 0xff)
    );
  };

  return {
    ambientColor: lerpHex(a.ambientColor, b.ambientColor),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    sunColor: lerpHex(a.sunColor, b.sunColor),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunAngle: lerp(a.sunAngle, b.sunAngle, t),
    sunAzimuth: lerp(a.sunAzimuth, b.sunAzimuth, t),
    skylightColor: lerpHex(a.skylightColor, b.skylightColor),
    skylightIntensity: lerp(a.skylightIntensity, b.skylightIntensity, t),
    fogColor: lerpHex(a.fogColor, b.fogColor),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    clearColor: lerpHex(a.clearColor, b.clearColor),
  };
}

/** Compute sun direction from elevation angle and azimuth. */
function sunDirection(angleDeg: number, azimuthDeg: number): THREE.Vector3 {
  const elev = degToRad(angleDeg);
  const azim = degToRad(azimuthDeg);
  return new THREE.Vector3(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim),
  ).normalize();
}

// ── Skylight panel + pool pair ───────────────────────────────────────

interface SkylightUnit {
  panel: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  poolLight: THREE.PointLight;
}

// ── Manager ──────────────────────────────────────────────────────────

export class TimeOfDayManager {
  private scene: THREE.Scene;

  // Scene light references (found or created)
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;

  // Skylights
  private skylights: SkylightUnit[] = [];
  private skylightGroup: THREE.Group;

  // Interior fluorescent references found in scene
  private fluorescentLights: THREE.Light[] = [];
  private fluorescentBaseIntensities: number[] = [];

  // State
  private currentPreset: LightingPreset;
  private currentTimeName: TimeOfDay = 'midday';

  // Smooth transition state
  private transitioning = false;
  private transitionFrom: LightingPreset;
  private transitionTo: LightingPreset;
  private transitionDuration = 2.0;
  private transitionElapsed = 0;

  // Day cycle state
  private cycling = false;
  private cycleSpeed = 1.0;
  private cycleHour = 12; // current simulated hour

  // Temp colors to avoid allocations
  // (temp colors created on demand in interpolation methods)

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.currentPreset = { ...PRESETS.midday };
    this.transitionFrom = { ...PRESETS.midday };
    this.transitionTo = { ...PRESETS.midday };

    this.findOrCreateLights();
    this.findFluorescentLights();
    this.skylightGroup = new THREE.Group();
    this.skylightGroup.name = '_skylightGroup';
    this.scene.add(this.skylightGroup);
    this.createSkylights();
    this.applyPreset(this.currentPreset);
  }

  // ── Light discovery ──────────────────────────────────────────────

  private findOrCreateLights(): void {
    // Try to find existing lights in the scene by type / name
    this.scene.traverse((obj) => {
      if (!this.ambientLight && obj instanceof THREE.AmbientLight) {
        this.ambientLight = obj;
      }
      if (!this.sunLight && obj instanceof THREE.DirectionalLight) {
        this.sunLight = obj;
      }
      if (!this.hemiLight && obj instanceof THREE.HemisphereLight) {
        this.hemiLight = obj;
      }
    });

    // Create any that are missing
    if (!this.ambientLight) {
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      this.ambientLight.name = '_todAmbient';
      this.scene.add(this.ambientLight);
    }

    if (!this.sunLight) {
      this.sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
      this.sunLight.name = '_todSun';
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 100;
      this.sunLight.shadow.camera.left = -30;
      this.sunLight.shadow.camera.right = 30;
      this.sunLight.shadow.camera.top = 30;
      this.sunLight.shadow.camera.bottom = -30;
      this.scene.add(this.sunLight);
    }

    if (!this.hemiLight) {
      this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2);
      this.hemiLight.name = '_todHemi';
      this.scene.add(this.hemiLight);
    }
  }

  /**
   * Find lights that look like interior fluorescent fixtures.
   * Convention: any PointLight or SpotLight whose name contains "fluorescent" or "interior".
   */
  private findFluorescentLights(): void {
    this.scene.traverse((obj) => {
      if (
        (obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) &&
        (obj.name.toLowerCase().includes('fluorescent') ||
          obj.name.toLowerCase().includes('interior'))
      ) {
        this.fluorescentLights.push(obj);
        this.fluorescentBaseIntensities.push(obj.intensity);
      }
    });
  }

  // ── Skylights ────────────────────────────────────────────────────

  private createSkylights(): void {
    const totalWidth = (SKYLIGHT_COUNT - 1) * SKYLIGHT_SPACING;
    const startX = -totalWidth / 2;

    for (let i = 0; i < SKYLIGHT_COUNT; i++) {
      const x = startX + i * SKYLIGHT_SPACING;

      // Glass panel
      const geo = new THREE.PlaneGeometry(SKYLIGHT_WIDTH, SKYLIGHT_DEPTH);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xaaccff,
        transparent: true,
        opacity: 0.2,
        emissive: 0xffffff,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const panel = new THREE.Mesh(geo, mat);
      panel.rotation.x = -Math.PI / 2; // lay flat on ceiling
      panel.position.set(x, SKYLIGHT_Y, 0);
      panel.name = `_skylight_panel_${i}`;
      this.skylightGroup.add(panel);

      // Light pool on factory floor
      const poolLight = new THREE.PointLight(0xfff8f0, 0, 8, 2);
      poolLight.position.set(x, SKYLIGHT_POOL_Y, 0);
      poolLight.name = `_skylight_pool_${i}`;
      this.skylightGroup.add(poolLight);

      this.skylights.push({ panel, material: mat, poolLight });
    }
  }

  // ── Apply preset to scene ────────────────────────────────────────

  private applyPreset(p: LightingPreset): void {
    // Ambient
    if (this.ambientLight) {
      this.ambientLight.color.setHex(p.ambientColor);
      this.ambientLight.intensity = p.ambientIntensity;
    }

    // Sun / directional
    if (this.sunLight) {
      this.sunLight.color.setHex(p.sunColor);
      this.sunLight.intensity = p.sunIntensity;
      const dir = sunDirection(p.sunAngle, p.sunAzimuth);
      this.sunLight.position.copy(dir.multiplyScalar(50));
      this.sunLight.target.position.set(0, 0, 0);
      this.sunLight.target.updateMatrixWorld();
    }

    // Hemisphere light follows sun/ambient tones
    if (this.hemiLight) {
      this.hemiLight.color.setHex(p.skylightColor);
      this.hemiLight.groundColor.setHex(p.ambientColor);
      this.hemiLight.intensity = p.skylightIntensity * 0.5;
    }

    // Fog
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(p.fogColor);
      this.scene.fog.near = p.fogNear;
      this.scene.fog.far = p.fogFar;
    } else {
      this.scene.fog = new THREE.Fog(p.fogColor, p.fogNear, p.fogFar);
    }

    // Background / clear color
    if (this.scene.background instanceof THREE.Color) {
      (this.scene.background as THREE.Color).setHex(p.clearColor);
    } else {
      this.scene.background = new THREE.Color(p.clearColor);
    }

    // Skylights: emissive glow + pool lights
    for (const sl of this.skylights) {
      sl.material.emissive.setHex(p.skylightColor);
      sl.material.emissiveIntensity = p.skylightIntensity;
      sl.poolLight.color.setHex(p.sunColor);
      sl.poolLight.intensity = p.sunIntensity * 0.6;
    }

    // Interior fluorescents: brighter when sun is dimmer
    const sunFactor = Math.min(p.sunIntensity / 0.9, 1); // 0..1 how much sun
    const fluorescentFactor = 1.0 - sunFactor * 0.7; // never fully off in daytime
    for (let i = 0; i < this.fluorescentLights.length; i++) {
      this.fluorescentLights[i].intensity =
        this.fluorescentBaseIntensities[i] * fluorescentFactor;
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  /** Instantly snap to a named preset. */
  setTime(time: TimeOfDay): void {
    this.transitioning = false;
    this.currentTimeName = time;
    this.currentPreset = { ...PRESETS[time] };
    this.cycleHour = TIME_HOURS[time];
    this.applyPreset(this.currentPreset);
  }

  /** Smoothly transition to a named preset over the given duration in seconds. */
  setTimeSmooth(time: TimeOfDay, duration: number = 2.0): void {
    this.transitionFrom = { ...this.currentPreset };
    this.transitionTo = { ...PRESETS[time] };
    this.transitionDuration = Math.max(duration, 0.01);
    this.transitionElapsed = 0;
    this.transitioning = true;
    this.currentTimeName = time;
    this.cycleHour = TIME_HOURS[time];
  }

  /**
   * Set lighting by continuous hour (0-24).
   * Interpolates between the two nearest presets.
   */
  setCustomTime(hour: number): void {
    this.transitioning = false;
    this.cycleHour = ((hour % 24) + 24) % 24;
    const preset = this.presetForHour(this.cycleHour);
    this.currentPreset = preset;
    this.currentTimeName = this.closestTimeName(this.cycleHour);
    this.applyPreset(preset);
  }

  /** Begin auto-cycling through the day. speed=1 is real time; 60 = 1 real minute per sim hour. */
  startDayCycle(speed: number = 1.0): void {
    this.cycling = true;
    this.cycleSpeed = speed;
  }

  /** Stop auto-cycling. */
  stopDayCycle(): void {
    this.cycling = false;
  }

  /** Call every frame with delta time in seconds. */
  update(dt: number): void {
    // Handle smooth transition
    if (this.transitioning) {
      this.transitionElapsed += dt;
      let t = this.transitionElapsed / this.transitionDuration;
      if (t >= 1) {
        t = 1;
        this.transitioning = false;
      }
      // Smooth-step easing
      t = t * t * (3 - 2 * t);
      this.currentPreset = lerpPreset(this.transitionFrom, this.transitionTo, t);
      this.applyPreset(this.currentPreset);
    }

    // Handle day cycle
    if (this.cycling) {
      // dt is in seconds; cycleSpeed * dt / 3600 gives hours elapsed
      this.cycleHour += (this.cycleSpeed * dt) / 3600;
      this.cycleHour = ((this.cycleHour % 24) + 24) % 24;

      const preset = this.presetForHour(this.cycleHour);
      this.currentPreset = preset;
      this.currentTimeName = this.closestTimeName(this.cycleHour);
      this.applyPreset(preset);
    }
  }

  /** Return the closest named time of day. */
  getCurrentTime(): TimeOfDay {
    return this.currentTimeName;
  }

  /** Clean up all created objects. */
  dispose(): void {
    this.cycling = false;
    this.transitioning = false;

    // Remove skylights
    for (const sl of this.skylights) {
      sl.material.dispose();
      sl.panel.geometry.dispose();
      this.skylightGroup.remove(sl.panel);
      this.skylightGroup.remove(sl.poolLight);
    }
    this.skylights.length = 0;
    this.scene.remove(this.skylightGroup);

    // Remove lights we created (identified by name prefix)
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.name.startsWith('_tod')) {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      this.scene.remove(obj);
      if ((obj as any).dispose) (obj as any).dispose();
    }

    this.ambientLight = null;
    this.sunLight = null;
    this.hemiLight = null;
    this.fluorescentLights.length = 0;
    this.fluorescentBaseIntensities.length = 0;
  }

  // ── Internals ────────────────────────────────────────────────────

  /**
   * Compute an interpolated preset for an arbitrary hour.
   * Wraps around midnight so 23h interpolates toward dawn at 6h.
   */
  private presetForHour(hour: number): LightingPreset {
    // Build ordered (hour, preset) pairs, adding a wrap-around entry
    const entries = TIME_ORDER.map((name) => ({
      hour: TIME_HOURS[name],
      preset: PRESETS[name],
    }));
    // Add wrap-around: dawn again at hour + 24
    entries.push({ hour: TIME_HOURS.dawn + 24, preset: PRESETS.dawn });

    // If hour < first entry, shift into the wrap range
    let h = hour;
    if (h < entries[0].hour) {
      h += 24;
    }

    // Find the two bracketing entries
    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i];
      const b = entries[i + 1];
      if (h >= a.hour && h <= b.hour) {
        const span = b.hour - a.hour;
        const t = span > 0 ? (h - a.hour) / span : 0;
        return lerpPreset(a.preset, b.preset, t);
      }
    }

    // Fallback (should not happen)
    return { ...PRESETS.midday };
  }

  /** Return the TimeOfDay name closest to the given hour. */
  private closestTimeName(hour: number): TimeOfDay {
    let bestName: TimeOfDay = 'midday';
    let bestDist = Infinity;
    for (const name of TIME_ORDER) {
      const h = TIME_HOURS[name];
      // Circular distance on 24h clock
      const dist = Math.min(Math.abs(hour - h), 24 - Math.abs(hour - h));
      if (dist < bestDist) {
        bestDist = dist;
        bestName = name;
      }
    }
    return bestName;
  }
}
