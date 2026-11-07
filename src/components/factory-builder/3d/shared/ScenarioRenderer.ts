import * as THREE from 'three';
import { buildModelById, MODEL_LIBRARY } from '../model-library/ModelLibraryRegistry';
import {
  multiScale,
  MultiScaleManager,
  ScaleLevel,
} from './MultiScale';
import { applyOverrides, attachOverrideAPI, type VisualOverrides } from './Overrides';

/**
 * ScenarioRenderer — turns a parsed scenario (from Excel or any other source)
 * into a 3D scene. This is the "Excel → 3D world" entry point.
 *
 * Inputs:
 *   - `scenarioType`: factory | warehouse | supply-chain (drives default scale)
 *   - `entities`: list of entities, each with position, rotation, model key,
 *     optional per-entity scale level, and visual overrides (color/opacity).
 *
 * Outputs:
 *   - A scene root group containing every entity, parented through the
 *     MultiScaleManager so scale switching is one call away.
 *
 * What it deliberately does NOT do:
 *   - Touch the existing app data flow / Zustand stores (additive layer).
 *   - Load custom GLBs (Tier 3, deferred).
 *   - Wire into SimulationAnimation3D (separate task).
 */

export type ScenarioType = 'factory' | 'warehouse' | 'supply-chain' | 'mixed';

/**
 * Map scenario type to default scale. Per-entity `scaleLevel` overrides this.
 */
export function defaultScaleForScenario(type: ScenarioType): ScaleLevel {
  switch (type) {
    case 'factory': return ScaleLevel.DETAILED;
    case 'warehouse': return ScaleLevel.ABSTRACT;
    case 'supply-chain': return ScaleLevel.BUILDING;
    case 'mixed':
    default: return ScaleLevel.DETAILED;
  }
}

export interface ScenarioEntity {
  /** Stable id (matches an Excel row's Name/ID column). */
  id: string;
  /** Model library key, e.g. 'cobot', 'industrial-robot', 'warehouse-shell'. */
  modelKey: string;
  /** World-space position (default 0,0,0). */
  position?: { x: number; y: number; z: number };
  /** World-space rotation (Euler in radians, default 0,0,0). */
  rotation?: { x: number; y: number; z: number };
  /** Uniform scale (default 1). */
  scale?: number;
  /** Per-entity scale level override; defaults to scenario default. */
  scaleLevel?: ScaleLevel;
  /** Visual overrides (color/opacity/emissive). */
  overrides?: VisualOverrides;
}

/** Optional connection between two entities — used by StationFlowAnimator. */
export interface ScenarioConnection {
  source: string;
  target: string;
}

export interface ScenarioInput {
  type: ScenarioType;
  /** Optional scale override for the whole scenario. */
  scaleLevel?: ScaleLevel;
  entities: ScenarioEntity[];
  /** Connections between entities. Optional — if absent, station flow is synthesized. */
  connections?: ScenarioConnection[];
}

export interface ScenarioRenderResult {
  root: THREE.Group;
  manager: MultiScaleManager;
  entityById: Map<string, THREE.Group>;
  warnings: string[];
}

/** Build a 3D scene from a parsed scenario. */
export function renderScenario(input: ScenarioInput): ScenarioRenderResult {
  const root = new THREE.Group();
  root.name = 'scenarioRoot';

  const manager = new MultiScaleManager();
  const entityById = new Map<string, THREE.Group>();
  const warnings: string[] = [];

  const scenarioScale = input.scaleLevel ?? defaultScaleForScenario(input.type);
  manager.setScale(scenarioScale);

  for (const ent of input.entities) {
    const built = buildModelById(ent.modelKey);
    if (!built) {
      warnings.push(`Unknown modelKey "${ent.modelKey}" for entity "${ent.id}"; skipped.`);
      continue;
    }

    // Wrap in a multi-scale container. Detailed = the model itself; abstract +
    // building come from MultiScale defaults unless the caller already returned
    // a multi-scale group.
    const wrapper = built.userData.multiScale
      ? (built as THREE.Group)
      : multiScale({ detailed: () => built });

    wrapper.name = `entity:${ent.id}`;
    if (ent.position) wrapper.position.set(ent.position.x, ent.position.y, ent.position.z);
    if (ent.rotation) wrapper.rotation.set(ent.rotation.x, ent.rotation.y, ent.rotation.z);
    if (ent.scale !== undefined) wrapper.scale.setScalar(ent.scale);

    // Apply per-entity scale level if specified — sets it on the wrapper,
    // then the manager records it but won't override (manager applies the
    // *scenario* level to all entries; we set this one directly afterward).
    manager.register(wrapper);
    if (ent.scaleLevel) {
      wrapper.userData.multiScale.setScale(ent.scaleLevel);
    }

    // Apply visual overrides — walks the *currently visible* level so colors
    // land on what the user actually sees. Re-applied if the level changes.
    if (ent.overrides) {
      const target = wrapper.userData.multiScale.levels[ent.scaleLevel ?? scenarioScale];
      if (target) {
        if (!target.userData.applyOverrides) attachOverrideAPI(target);
        applyOverrides(target, ent.overrides);
      }
    }

    root.add(wrapper);
    entityById.set(ent.id, wrapper);
  }

  return { root, manager, entityById, warnings };
}

/**
 * Convenience: get the list of model keys available in the registry,
 * for UI dropdowns.
 */
export function listAvailableModelKeys(): { id: string; name: string; category: string }[] {
  return MODEL_LIBRARY.map(m => ({ id: m.id, name: m.name, category: m.category }));
}
