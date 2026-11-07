import * as THREE from 'three';

/**
 * Articulated human at real size (1 unit = 1 m, about 1.75 m tall) for
 * operators, walkers and carriers.
 *
 * The figure is a joint hierarchy, not a single mesh:
 *
 *   root (feet on the floor, faces +Z)
 *    └ pelvis ─ spine ─ chest ─ neck ─ head
 *    │                   ├ shoulderL ─ elbowL ─ wristL (hand)
 *    │                   └ shoulderR ─ elbowR ─ wristR (hand)
 *    ├ hipL ─ kneeL ─ ankleL (foot)
 *    └ hipR ─ kneeR ─ ankleR (foot)
 *
 * Arms are placed by two-bone inverse kinematics: give a hand a target in
 * world space and the shoulder and elbow turn so the hand reaches it, the
 * elbow pointing down and out like a person's. When a target is out of
 * reach the spine bends forward (and the knees give for low targets), which
 * is how operators lean over a fixture.
 *
 * Shapes are capsules and ellipsoids with skin, clothing, hair and shoes, so
 * the figure reads as a person at layout zoom, like the humans in
 * Process Simulate / Visual Components.
 */

export interface HumanLook {
  shirt: number;
  trousers: number;
  skin: number;
  hair: number;
  hairStyle: 'short' | 'long' | 'bun';
  shoes: number;
  vest?: boolean;      // hi-vis vest over the shirt
  glasses?: boolean;   // safety glasses
  build?: number;      // 0.92 … 1.08 height factor
}

const LOOKS: HumanLook[] = [
  { shirt: 0x1f8a8a, trousers: 0x3b4a63, skin: 0xd9a77e, hair: 0x2b1d14, hairStyle: 'short', shoes: 0x2a2a2a },
  { shirt: 0x7b3fa0, trousers: 0x2f3440, skin: 0xe8c3a0, hair: 0x6b4423, hairStyle: 'long', shoes: 0x3a3a3a },
  { shirt: 0x2f62d0, trousers: 0x8a7a5c, skin: 0x8d5a3b, hair: 0x15100c, hairStyle: 'short', shoes: 0x2a2a2a },
  { shirt: 0xc8452e, trousers: 0x3b4a63, skin: 0xf0cfb0, hair: 0xc9a25e, hairStyle: 'bun', shoes: 0x4a3a2a },
  { shirt: 0x3e8e2e, trousers: 0x2f3440, skin: 0xc68e62, hair: 0x2b1d14, hairStyle: 'short', shoes: 0x2a2a2a, glasses: true },
  { shirt: 0x5a6b7d, trousers: 0x2f3440, skin: 0xe0b896, hair: 0x4a3020, hairStyle: 'short', shoes: 0x2a2a2a, vest: true },
];

/** A look from a stable index (so the same station always gets the same person). */
export function lookFor(i: number): HumanLook {
  const base = LOOKS[((i % LOOKS.length) + LOOKS.length) % LOOKS.length];
  return { ...base, build: 0.94 + ((i * 37) % 13) / 100 };
}

// ── Shared geometry (unit shapes, scaled per part) ─────────────────────
const CAPSULE = new THREE.CapsuleGeometry(0.5, 1, 6, 12);   // radius 0.5, straight part 1 → total 2
const SPHERE = new THREE.SphereGeometry(0.5, 18, 12);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const HAIR_CAP = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);

const MATS = new Map<string, THREE.MeshStandardMaterial>();
function matOf(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
  const k = `${color}:${rough}:${metal}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); MATS.set(k, m); }
  return m;
}
const VEST_MAT = new THREE.MeshStandardMaterial({ color: 0xd8f028, roughness: 0.7, emissive: 0x2a3000, emissiveIntensity: 0.3 });
const STRIPE_MAT = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.3, metalness: 0.6 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.2, metalness: 0.5 });

/** Mesh helper: a capsule between local y = 0 and y = −len (a limb hanging from its joint). */
function limb(parent: THREE.Object3D, len: number, r0: number, r1: number, m: THREE.Material) {
  // Unit capsule is 2 tall and 1 wide; the slight overlap at both ends hides the joints
  const r = (r0 + r1) / 2;
  const mesh = new THREE.Mesh(CAPSULE, m);
  mesh.scale.set(r * 2, (len + r * 0.6) / 2, r * 2);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function blob(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, geo: THREE.BufferGeometry = SPHERE) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Segment lengths (m) for a 1.75 m person; scaled by build
const L = {
  thigh: 0.45, shin: 0.44, ankle: 0.08,
  spine: 0.26, chest: 0.24, neck: 0.07,
  upperArm: 0.29, forearm: 0.26, hand: 0.17,
  shoulderW: 0.19, hipW: 0.095,
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Two-bone IK in the parent frame of `upper`: rotate `upper` and `lower` (both
 * modelled hanging along −Y) so the end of the chain reaches `targetWorld`,
 * with the middle joint bending toward `pole` (parent-frame direction).
 */
function twoBone(upper: THREE.Object3D, lower: THREE.Object3D, a: number, b: number, targetWorld: THREE.Vector3, pole: THREE.Vector3) {
  const parent = upper.parent!;
  parent.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const T = targetWorld.clone().applyMatrix4(inv);
  const S = upper.position;
  const toT = T.sub(S);
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 0.01), a + b - 0.002);
  const u = toT.normalize();
  const w = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const E = u.clone().multiplyScalar(a * cosA).addScaledVector(w, a * sinA);   // elbow/knee, relative to S
  const end = u.clone().multiplyScalar(d);
  upper.quaternion.setFromUnitVectors(DOWN, E.clone().normalize());
  const lowerDir = end.sub(E).normalize().applyQuaternion(_q.copy(upper.quaternion).invert());
  lower.quaternion.setFromUnitVectors(DOWN, lowerDir);
}

export class HumanRig {
  readonly group = new THREE.Group();
  readonly pelvis = new THREE.Object3D();
  readonly spine = new THREE.Object3D();
  readonly chest = new THREE.Object3D();
  readonly neck = new THREE.Object3D();
  readonly head = new THREE.Object3D();
  readonly shoulder: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly elbow: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly wrist: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly hip: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly knee: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly ankle: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  /** Box held between the hands while carrying (hidden otherwise). */
  readonly carried: THREE.Mesh;
  readonly s: number;               // build scale
  readonly hipHeight: number;
  private segMeshes = new Map<string, THREE.Mesh[]>();

  constructor(look: HumanLook = LOOKS[0]) {
    const s = (this.s = look.build ?? 1);
    const g = this.group;
    g.name = 'human';
    const skin = matOf(look.skin, 0.75);
    const shirt = matOf(look.shirt, 0.85);
    const trousers = matOf(look.trousers, 0.9);
    const shoes = matOf(look.shoes, 0.6);
    const hair = matOf(look.hair, 0.9);

    this.hipHeight = (L.thigh + L.shin + L.ankle) * s;
    g.add(this.pelvis);
    this.pelvis.position.y = this.hipHeight;
    // Pelvis / hips
    this.seg('pelvis', blob(this.pelvis, trousers, 0, 0.02 * s, 0, 0.34 * s, 0.2 * s, 0.22 * s));

    // ── Legs ──
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const hip = this.hip[i], knee = this.knee[i], ankle = this.ankle[i];
      hip.position.set(side * L.hipW * s, -0.02 * s, 0);
      this.pelvis.add(hip);
      this.seg(`thigh${i}`, limb(hip, L.thigh * s, 0.09 * s, 0.072 * s, trousers));
      knee.position.y = -L.thigh * s;
      hip.add(knee);
      this.seg(`shin${i}`, limb(knee, L.shin * s, 0.066 * s, 0.05 * s, trousers));
      ankle.position.y = -L.shin * s;
      knee.add(ankle);
      // Shoe: rounded box, toe forward (+Z)
      blob(ankle, shoes, 0, -0.045 * s, 0.045 * s, 0.1 * s, 0.075 * s, 0.26 * s);
    }

    // ── Torso ──
    this.pelvis.add(this.spine);
    this.spine.position.y = 0.06 * s;
    this.seg('spine', blob(this.spine, shirt, 0, L.spine * 0.55 * s, 0, 0.3 * s, L.spine * 0.62 * s, 0.2 * s, CAPSULE));
    this.spine.add(this.chest);
    this.chest.position.y = L.spine * s;
    this.seg('chest', blob(this.chest, shirt, 0, L.chest * 0.5 * s, 0.005 * s, 0.37 * s, L.chest * 0.56 * s, 0.23 * s, CAPSULE));
    blob(this.chest, shirt, 0, L.chest * 0.78 * s, 0, 0.17 * s, 0.2 * s, 0.19 * s, CAPSULE).rotation.z = Math.PI / 2;  // shoulder girdle
    if (look.vest) {
      blob(this.chest, VEST_MAT, 0, L.chest * 0.38 * s, 0.008 * s, 0.415 * s, L.chest * 1.15 * s, 0.245 * s);
      blob(this.spine, VEST_MAT, 0, L.spine * 0.8 * s, 0, 0.325 * s, L.spine * 0.7 * s, 0.215 * s);
      for (const y of [0.05, 0.13]) blob(this.chest, STRIPE_MAT, 0, y * s, 0.02 * s, 0.42 * s, 0.025 * s, 0.25 * s);
    }

    // ── Neck and head ──
    this.chest.add(this.neck);
    this.neck.position.y = L.chest * s;
    blob(this.neck, skin, 0, L.neck * 0.5 * s, 0, 0.1 * s, L.neck * 1.6 * s, 0.1 * s);
    this.neck.add(this.head);
    this.head.position.y = L.neck * s;
    this.head.rotation.order = 'YXZ';   // yaw then pitch: no sideways tilt when looking down and aside
    blob(this.head, skin, 0, 0.115 * s, 0.01 * s, 0.19 * s, 0.235 * s, 0.215 * s);                 // skull + face
    blob(this.head, skin, 0, 0.1 * s, 0.11 * s, 0.035 * s, 0.05 * s, 0.04 * s);                    // nose
    blob(this.head, skin, -0.095 * s, 0.11 * s, 0, 0.03 * s, 0.055 * s, 0.035 * s);               // ears
    blob(this.head, skin, 0.095 * s, 0.11 * s, 0, 0.03 * s, 0.055 * s, 0.035 * s);
    blob(this.head, hair, 0, 0.135 * s, -0.005 * s, 0.205 * s, 0.25 * s, 0.23 * s, HAIR_CAP);       // hair cap
    if (look.hairStyle === 'long') {
      blob(this.head, hair, 0, 0.04 * s, -0.07 * s, 0.2 * s, 0.26 * s, 0.1 * s);
    } else if (look.hairStyle === 'bun') {
      blob(this.head, hair, 0, 0.2 * s, -0.1 * s, 0.09 * s, 0.09 * s, 0.09 * s);
    }
    if (look.glasses) blob(this.head, GLASS_MAT, 0, 0.13 * s, 0.1 * s, 0.17 * s, 0.035 * s, 0.03 * s, BOX);

    // ── Arms ──
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const sh = this.shoulder[i], el = this.elbow[i], wr = this.wrist[i];
      sh.position.set(side * L.shoulderW * s, L.chest * 0.82 * s, 0);
      this.chest.add(sh);
      blob(sh, shirt, 0, -0.025 * s, 0, 0.1 * s, 0.1 * s, 0.1 * s);                               // deltoid
      this.seg(`upperArm${i}`, limb(sh, L.upperArm * s, 0.055 * s, 0.047 * s, shirt));
      el.position.y = -L.upperArm * s;
      sh.add(el);
      this.seg(`forearm${i}`, limb(el, L.forearm * s, 0.044 * s, 0.036 * s, skin));
      wr.position.y = -L.forearm * s;
      el.add(wr);
      // Hand: palm + fingers block + thumb
      blob(wr, skin, 0, -0.05 * s, 0, 0.05 * s, 0.1 * s, 0.085 * s);
      blob(wr, skin, 0, -0.11 * s, 0.005 * s, 0.045 * s, 0.07 * s, 0.075 * s);
      blob(wr, skin, -side * 0.0 * s, -0.04 * s, 0.045 * s, 0.03 * s, 0.06 * s, 0.03 * s);
    }

    // Carried box (manual transport)
    this.carried = new THREE.Mesh(BOX, matOf(0xc4934a, 0.9));
    this.carried.scale.set(0.38 * s, 0.26 * s, 0.3 * s);
    this.carried.castShadow = true;
    this.carried.visible = false;
    g.add(this.carried);

    g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  }

  private seg(name: string, m: THREE.Mesh) {
    const list = this.segMeshes.get(name) ?? [];
    list.push(m);
    this.segMeshes.set(name, list);
  }

  /** Rest pose: standing, arms hanging slightly forward. */
  rest() {
    this.pelvis.position.set(0, this.hipHeight, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.spine.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      this.shoulder[i].quaternion.setFromEuler(new THREE.Euler(0.08, 0, side * 0.08));
      this.elbow[i].quaternion.setFromEuler(new THREE.Euler(-0.18, 0, 0));
      this.wrist[i].rotation.set(0, 0, 0);
      this.hip[i].rotation.set(0, 0, 0);
      this.knee[i].rotation.set(0, 0, 0);
      this.ankle[i].rotation.set(0, 0, 0);
    }
  }

  /** Reach length of one arm (shoulder → palm). */
  get reach() { return (L.upperArm + L.forearm + L.hand * 0.55) * this.s; }

  /**
   * Trunk bend (rad) and squat (m) that bring a world point within reach of the
   * shoulders: upright for bench height, leaning over a fixture, squatting low.
   */
  leanFor(target: THREE.Vector3, maxBend = 1.05): { bend: number; squat: number } {
    this.group.updateMatrixWorld(true);
    _m.copy(this.group.matrixWorld).invert();
    const t = _v1.copy(target).applyMatrix4(_m);
    const s = this.s;
    const shoulderUp = (0.06 + L.spine + L.chest * 0.82) * s; // pelvis → shoulder line
    const reach = this.reach * 0.9;
    let bend = 0, squat = 0;
    for (let k = 0; k <= 24; k++) {
      bend = (k / 24) * maxBend;
      squat = Math.max(0, Math.min(0.3 * s, (0.7 * s - t.y) * 0.7)) * Math.min(1, bend / maxBend + 0.3);
      const py = this.hipHeight - squat;
      const sy = py + Math.cos(bend) * shoulderUp;
      const sz = Math.sin(bend) * shoulderUp;
      const d = Math.hypot(Math.max(0, Math.abs(t.x) - L.shoulderW * s * 0.6), t.y - sy, t.z - sz);
      if (d <= reach) break;
    }
    return { bend, squat };
  }

  /** Apply a trunk bend and squat (see leanFor), keeping the body balanced over the feet. */
  applyLean(bend: number, squat: number) {
    this.pelvis.position.y = this.hipHeight - squat;
    this.spine.rotation.x = bend * 0.7;
    this.chest.rotation.x = bend * 0.3;
    this.plantFeet();
  }

  /** Leg IK: keep both feet flat on the floor under the hips whatever the pelvis does. */
  plantFeet(stepL = 0, stepR = 0) {
    const s = this.s;
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const foot = this.group.localToWorld(_v3.set(side * L.hipW * s, L.ankle * s, (i === 0 ? stepL : stepR)));
      twoBone(this.hip[i], this.knee[i], L.thigh * s, L.shin * s, foot, _v2.set(0, 0, 1));
      // Foot flat: undo the leg's rotation at the ankle
      this.ankle[i].quaternion.copy(this.hip[i].quaternion).multiply(this.knee[i].quaternion)
        .premultiply(this.pelvis.quaternion).invert();
    }
  }

  /**
   * Two-bone IK: put the palm of hand `i` (0 left, 1 right) on a world point.
   * The elbow points down, back and out (pole), like a person working at a bench.
   */
  reachTo(i: 0 | 1, target: THREE.Vector3, palmDown = true) {
    const side = i === 0 ? -1 : 1;
    const a = L.upperArm * this.s, b = (L.forearm + L.hand * 0.55) * this.s;
    twoBone(this.shoulder[i], this.elbow[i], a, b, target, _v2.set(side * 0.7, -0.55, -0.45));
    // Palm faces the work (down) or the body (carrying)
    this.wrist[i].rotation.set(palmDown ? 0.35 : 0, palmDown ? 0 : side * 1.4, 0);
  }

  /** Turn the head toward a world point (yaw/pitch limited like a neck). */
  lookAt(target: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    _m.copy(this.neck.matrixWorld).invert();
    const t = _v1.copy(target).applyMatrix4(_m);
    const yaw = Math.atan2(t.x, t.z);
    const pitch = -Math.atan2(t.y - 0.12 * this.s, Math.hypot(t.x, t.z));
    this.head.rotation.set(THREE.MathUtils.clamp(pitch, -0.5, 0.7), THREE.MathUtils.clamp(yaw, -1.1, 1.1), 0);
  }

  /**
   * Walk cycle at phase `ph` (radians, 2π per stride pair). Legs swing with knee
   * flexion in swing, arms counter-swing, pelvis bobs and rolls.
   */
  walk(ph: number, amount = 1, carrying = false) {
    const A = 0.42 * amount;
    for (let i = 0; i < 2; i++) {
      const p = ph + (i === 0 ? 0 : Math.PI);
      const swing = Math.sin(p);
      this.hip[i].rotation.x = -swing * A;
      // Knee bends in the swing phase (leg moving forward) and a little at heel strike
      const kneeBend = Math.max(0, Math.cos(p)) * 0.95 * amount + 0.06;
      this.knee[i].rotation.x = kneeBend;
      this.ankle[i].rotation.x = -Math.max(0, -Math.sin(p)) * 0.25 * amount + kneeBend * -0.2;
      if (!carrying) {
        const side = i === 0 ? -1 : 1;
        this.shoulder[i].quaternion.setFromEuler(new THREE.Euler(swing * 0.45 * amount, 0, side * 0.07));
        this.elbow[i].quaternion.setFromEuler(new THREE.Euler(-0.25 - Math.max(0, swing) * 0.35 * amount, 0, 0));
      }
    }
    this.pelvis.position.y = this.hipHeight - 0.025 * this.s * amount + Math.abs(Math.cos(ph)) * 0.03 * this.s * amount;
    this.pelvis.rotation.z = Math.sin(ph) * 0.04 * amount;
    this.pelvis.rotation.y = Math.sin(ph) * 0.08 * amount;
    this.chest.rotation.y = -Math.sin(ph) * 0.12 * amount;
    this.spine.rotation.x = 0.04 * amount;
    if (carrying) this.holdBox();
  }

  /** Both hands under a box held in front of the belly. */
  holdBox() {
    this.carried.visible = true;
    const s = this.s;
    this.group.updateMatrixWorld(true);
    const p = new THREE.Vector3(0, this.pelvis.position.y + 0.12 * s, 0.33 * s);
    this.carried.position.copy(p);
    const wp = (dx: number) => this.group.localToWorld(new THREE.Vector3(dx, p.y - 0.06 * s, p.z));
    this.reachTo(0, wp(-0.2 * s), false);
    this.reachTo(1, wp(0.2 * s), false);
  }

  /**
   * Ergonomic load of the current posture, RULA-like, per body region
   * (0 = fine, 1 = take care, 2 = high risk): trunk flexion, upper-arm
   * elevation, neck flexion, knee flexion.
   */
  posture(): { trunk: number; armL: number; armR: number; neck: number; legs: number } {
    const trunkDeg = THREE.MathUtils.radToDeg(this.spine.rotation.x + this.chest.rotation.x);
    const armDeg = (i: number) => {
      const d = new THREE.Vector3(0, -1, 0).applyQuaternion(this.shoulder[i].quaternion);
      return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-d.y, -1, 1)));
    };
    const neckDeg = THREE.MathUtils.radToDeg(this.head.rotation.x);
    const kneeDeg = THREE.MathUtils.radToDeg(Math.max(this.knee[0].rotation.x, this.knee[1].rotation.x));
    const lvl = (v: number, a: number, b: number) => (v >= b ? 2 : v >= a ? 1 : 0);
    return {
      trunk: lvl(trunkDeg, 20, 60), armL: lvl(armDeg(0), 45, 90), armR: lvl(armDeg(1), 45, 90),
      neck: lvl(neckDeg, 20, 35), legs: lvl(kneeDeg, 30, 60),
    };
  }

  private ergoOn = false;
  private origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  /** Colour body regions by posture load (ergonomics view), or restore the clothes. */
  showErgonomics(on: boolean) {
    if (on) {
      const p = this.posture();
      const col = [0x2fa84f, 0xe6b800, 0xd93a2b];
      const paint = (names: string[], level: number) => {
        for (const n of names) for (const m of this.segMeshes.get(n) ?? []) {
          if (!this.origMats.has(m)) this.origMats.set(m, m.material);
          m.material = matOf(col[level], 0.6);
        }
      };
      paint(['spine', 'chest', 'pelvis'], p.trunk);
      paint(['upperArm0', 'forearm0'], p.armL);
      paint(['upperArm1', 'forearm1'], p.armR);
      paint(['thigh0', 'thigh1', 'shin0', 'shin1'], p.legs);
      this.ergoOn = true;
    } else if (this.ergoOn) {
      this.origMats.forEach((m, mesh) => { mesh.material = m; });
      this.origMats.clear();
      this.ergoOn = false;
    }
  }
}
