import * as THREE from 'three';

/**
 * MultiScale — scenario-driven, author-defined level of detail.
 *
 * Different from camera-distance LODSystem.ts: here the *user* decides whether
 * the scene is showing a single machine, a whole facility, or a supply-chain
 * map, and every entity switches all at once. This is the Visual Components /
 * AnyLogic / FlexSim pattern: the same node has explicit "detailed", "abstract",
 * and "building" representations chosen by scenario type.
 *
 *   ScaleLevel.DETAILED  — fully rigged machine (cobot with gripper, etc).
 *   ScaleLevel.ABSTRACT  — black-box machine: bounding shell + status light.
 *   ScaleLevel.BUILDING  — facility/warehouse exterior on a supply-chain map.
 */

export enum ScaleLevel {
  DETAILED = 'detailed',
  ABSTRACT = 'abstract',
  BUILDING = 'building',
}

export interface ScaleBuilders {
  detailed: () => THREE.Object3D;
  abstract?: () => THREE.Object3D;   // optional: defaults to a generic block
  building?: () => THREE.Object3D;   // optional: defaults to a small shell
}

/**
 * Build a multi-scale group. The returned group contains all 3 representations
 * as named children (only one visible at a time). Call `setScale()` on the
 * group via the attached `userData.setScale` to switch.
 */
export function multiScale(builders: ScaleBuilders): THREE.Group {
  const root = new THREE.Group();
  root.name = 'multiScale';

  const detailed = builders.detailed();
  detailed.name = 'scale_detailed';
  root.add(detailed);

  const abstract = (builders.abstract ?? defaultAbstract)();
  abstract.name = 'scale_abstract';
  abstract.visible = false;
  root.add(abstract);

  const building = (builders.building ?? defaultBuilding)();
  building.name = 'scale_building';
  building.visible = false;
  root.add(building);

  let current: ScaleLevel = ScaleLevel.DETAILED;

  const setScale = (level: ScaleLevel): void => {
    current = level;
    detailed.visible = level === ScaleLevel.DETAILED;
    abstract.visible = level === ScaleLevel.ABSTRACT;
    building.visible = level === ScaleLevel.BUILDING;
  };

  root.userData.multiScale = {
    setScale,
    getScale: () => current,
    levels: { detailed, abstract, building },
  };

  return root;
}

/** Coordinator that switches every registered multi-scale entity at once. */
export class MultiScaleManager {
  private entries: THREE.Group[] = [];
  private level: ScaleLevel = ScaleLevel.DETAILED;

  register(group: THREE.Group): void {
    if (group.userData.multiScale) {
      this.entries.push(group);
      group.userData.multiScale.setScale(this.level);
    }
  }

  unregister(group: THREE.Group): void {
    const i = this.entries.indexOf(group);
    if (i >= 0) this.entries.splice(i, 1);
  }

  setScale(level: ScaleLevel): void {
    this.level = level;
    for (const g of this.entries) g.userData.multiScale.setScale(level);
  }

  getScale(): ScaleLevel { return this.level; }
}

// ── Defaults for entities that don't author all 3 levels ────────────────────

function defaultAbstract(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.0, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x6e7480, roughness: 0.7, metalness: 0.2 }),
  );
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'abstractBody';
  g.add(body);

  // Status indicator on top
  const status = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0x33ff33,
      emissive: 0x33ff33,
      emissiveIntensity: 1.2,
    }),
  );
  status.position.set(0, 1.1, 0);
  status.name = 'statusLight';
  g.add(status);
  return g;
}

function defaultBuilding(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(8, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.85, metalness: 0.05 }),
  );
  shell.position.y = 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.name = 'buildingShell';
  g.add(shell);
  return g;
}
