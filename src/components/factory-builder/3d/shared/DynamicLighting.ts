import * as THREE from 'three';

/**
 * Dynamic lighting effects for factory machines.
 * Adds contextual lighting based on node type and processing state.
 */

interface MachineLightEffect {
  light: THREE.PointLight;
  nodeId: string;
  type: 'welding_arc' | 'laser_pulse' | 'oven_glow' | 'inspection_beam' | 'status_cone';
  baseIntensity: number;
  active: boolean;
  phase: number; // animation phase
}

export class DynamicLightingManager {
  private scene: THREE.Scene;
  private effects: Map<string, MachineLightEffect> = new Map();
  private tempColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Register a light effect for a node group.
   * Call once per node when it is created in the scene.
   */
  registerNode(nodeId: string, nodeType: string, group: THREE.Group) {
    // Determine which effect this node type gets
    const effectType = this.getEffectType(nodeType);
    if (!effectType) return;

    const config = EFFECT_CONFIGS[effectType];
    const light = new THREE.PointLight(config.color, 0, config.distance, config.decay);
    light.position.copy(group.position);
    light.position.y += config.heightOffset;
    light.name = `_dynLight_${nodeId}`;

    // Welding and laser cast shadows for dramatic effect
    if (effectType === 'welding_arc' || effectType === 'laser_pulse') {
      light.castShadow = true;
      light.shadow.mapSize.width = 256;
      light.shadow.mapSize.height = 256;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = config.distance;
    }

    this.scene.add(light);
    this.effects.set(nodeId, {
      light,
      nodeId,
      type: effectType,
      baseIntensity: config.intensity,
      active: false,
      phase: Math.random() * Math.PI * 2, // random start phase for variety
    });
  }

  /**
   * Update the processing state for a node.
   * Effects activate when the node is processing.
   */
  setNodeState(nodeId: string, state: string) {
    const effect = this.effects.get(nodeId);
    if (!effect) return;
    effect.active = state === 'processing';
  }

  /**
   * Update all dynamic lights. Call each frame.
   */
  update(dt: number, elapsed: number) {
    for (const effect of this.effects.values()) {
      if (!effect.active) {
        // Fade out when not processing
        if (effect.light.intensity > 0.01) {
          effect.light.intensity *= 0.85;
        } else {
          effect.light.intensity = 0;
        }
        continue;
      }

      effect.phase += dt;

      switch (effect.type) {
        case 'welding_arc':
          this.updateWeldingArc(effect, elapsed);
          break;
        case 'laser_pulse':
          this.updateLaserPulse(effect, elapsed);
          break;
        case 'oven_glow':
          this.updateOvenGlow(effect, elapsed);
          break;
        case 'inspection_beam':
          this.updateInspectionBeam(effect, elapsed);
          break;
        case 'status_cone':
          this.updateStatusCone(effect, elapsed);
          break;
      }
    }
  }

  private updateWeldingArc(effect: MachineLightEffect, elapsed: number) {
    // Intense flickering orange-white light simulating arc welding
    const flicker = Math.random() * 0.6 + 0.4; // random flicker
    const burst = Math.sin(elapsed * 15 + effect.phase) > 0.3 ? 1.0 : 0.2; // intermittent bursts
    effect.light.intensity = effect.baseIntensity * flicker * burst;

    // Color shifts between orange-white and warm orange for dramatic arc effect
    const colorMix = Math.random() * 0.3;
    this.tempColor.setRGB(1.0, 0.6 + colorMix * 0.5, 0.2 + colorMix);
    effect.light.color.copy(this.tempColor);
  }

  private updateLaserPulse(effect: MachineLightEffect, elapsed: number) {
    // Pulsing bright cyan-green laser glow
    const pulse = 0.6 + Math.sin(elapsed * 8 + effect.phase) * 0.4;
    effect.light.intensity = effect.baseIntensity * pulse;
    // Bright cyan-green for dramatic laser effect
    this.tempColor.setHex(0x00ffcc);
    effect.light.color.copy(this.tempColor);
  }

  private updateOvenGlow(effect: MachineLightEffect, elapsed: number) {
    // Warm orange glow with natural flame flicker using dual-sine modulation
    const time = elapsed + effect.phase;
    const baseIntensity = effect.baseIntensity * (0.7 + Math.sin(elapsed * 0.8 + effect.phase) * 0.3);
    effect.light.intensity = baseIntensity + Math.sin(time * 47.3) * 0.3 + Math.sin(time * 31.7) * 0.2;
    // Warm orange-red
    const heat = 0.5 + Math.sin(elapsed * 0.5) * 0.1;
    this.tempColor.setRGB(1.0, 0.4 + heat, 0.1);
    effect.light.color.copy(this.tempColor);
  }

  private updateInspectionBeam(effect: MachineLightEffect, elapsed: number) {
    // Steady bright white inspection light with slight flicker
    const flicker = 0.95 + Math.sin(elapsed * 30) * 0.05;
    effect.light.intensity = effect.baseIntensity * flicker;
  }

  private updateStatusCone(effect: MachineLightEffect, elapsed: number) {
    // Green processing light projecting onto floor
    const pulse = 0.8 + Math.sin(elapsed * 3 + effect.phase) * 0.2;
    effect.light.intensity = effect.baseIntensity * pulse;
  }

  /**
   * Update light positions to follow node groups (if they move).
   */
  syncPositions(nodeGroups: Map<string, THREE.Group>) {
    for (const [nodeId, effect] of this.effects) {
      const group = nodeGroups.get(nodeId);
      if (group) {
        const config = EFFECT_CONFIGS[effect.type];
        effect.light.position.copy(group.position);
        effect.light.position.y += config.heightOffset;
      }
    }
  }

  private getEffectType(nodeType: string): MachineLightEffect['type'] | null {
    switch (nodeType) {
      case 'weldingcell':
        return 'welding_arc';
      case 'lasercutter':
        return 'laser_pulse';
      case 'oven':
      case 'paintbooth':
        return 'oven_glow';
      case 'inspection':
        return 'inspection_beam';
      case 'station':
      case 'roboticcell':
      case 'cncmachine':
      case 'press':
      case 'injectionmolder':
        return 'status_cone';
      default:
        return null;
    }
  }

  removeNode(nodeId: string) {
    const effect = this.effects.get(nodeId);
    if (effect) {
      this.scene.remove(effect.light);
      effect.light.dispose();
      this.effects.delete(nodeId);
    }
  }

  dispose() {
    for (const effect of this.effects.values()) {
      this.scene.remove(effect.light);
      effect.light.dispose();
    }
    this.effects.clear();
  }
}

// ── Effect configurations ────────────────────────────────────────────────────

const EFFECT_CONFIGS: Record<MachineLightEffect['type'], {
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  heightOffset: number;
}> = {
  welding_arc: {
    color: 0xff9933,
    intensity: 11.0,
    distance: 4,
    decay: 2,
    heightOffset: 0.8,
  },
  laser_pulse: {
    color: 0x00ffcc,
    intensity: 9.0,
    distance: 3,
    decay: 2,
    heightOffset: 0.5,
  },
  oven_glow: {
    color: 0xff6600,
    intensity: 1.5,
    distance: 5,
    decay: 1.5,
    heightOffset: 0.3,
  },
  inspection_beam: {
    color: 0xe8f4ff,
    intensity: 1.0,
    distance: 3,
    decay: 2,
    heightOffset: 1.2,
  },
  status_cone: {
    color: 0x22cc66,
    intensity: 0.6,
    distance: 2.5,
    decay: 2,
    heightOffset: 1.0,
  },
};
