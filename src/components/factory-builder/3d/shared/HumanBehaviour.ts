import * as THREE from 'three';
import { HumanRig } from './HumanRig';

/**
 * What a person at a station does, driven by the station's simulated state.
 *
 *  - processing: a work cycle on the machine's work surface — both hands on
 *    the part, one hand fetching from the parts bin, fastening with small
 *    wrist turns, a glance at the HMI — leaning in as far as the work point
 *    needs (bench → upright, fixture → bent over).
 *  - idle / starved: standing with weight shifts, looking around and
 *    upstream for the next part.
 *  - blocked: hands on hips, looking downstream.
 *  - failed: bent into the machine, both hands working (repair).
 *  - setup: alternating between the machine and the HMI.
 *
 * Hand targets, trunk bend and head direction all move with critically
 * damped smoothing, so state changes blend instead of snapping.
 */

export type HumanState = 'processing' | 'idle' | 'starved' | 'blocked' | 'failed' | 'setup' | 'offshift';

/** Exponential approach with time constant tau (s). */
function damp(cur: number, target: number, tau: number, dt: number) {
  return target + (cur - target) * Math.exp(-dt / Math.max(1e-3, tau));
}
function dampV(cur: THREE.Vector3, target: THREE.Vector3, tau: number, dt: number) {
  const k = 1 - Math.exp(-dt / Math.max(1e-3, tau));
  cur.lerp(target, k);
}

export interface WorkGeometry {
  /** Main work point on the part (world). */
  part: THREE.Vector3;
  /** Parts bin / supply point the hand fetches from (world). */
  bin: THREE.Vector3;
  /** HMI / control panel point (world). */
  hmi: THREE.Vector3;
  /** Where parts come from and go to, for the head (world). */
  upstream?: THREE.Vector3;
  downstream?: THREE.Vector3;
}

export class StationWorker {
  readonly rig: HumanRig;
  private t = Math.random() * 10;
  private hand: [THREE.Vector3, THREE.Vector3];
  private gaze = new THREE.Vector3();
  private bend = 0;
  private squat = 0;
  private sway = Math.random() * 6;
  private lookAround = new THREE.Vector3();
  private lookTimer = 0;
  private cycle: number;

  private geoLocal: WorkGeometry | null = null;
  private geo: WorkGeometry;

  /**
   * `geo` is in world space, or in `frame`'s local space when a frame is given
   * (for figures inside a group that moves after construction).
   */
  constructor(rig: HumanRig, geo: WorkGeometry, cycleSeconds = 7, private frame: THREE.Object3D | null = null) {
    this.geo = geo;
    if (frame) {
      this.geoLocal = geo;
      this.geo = { part: geo.part.clone(), bin: geo.bin.clone(), hmi: geo.hmi.clone() };
    }
    this.rig = rig;
    this.cycle = cycleSeconds;
    rig.rest();
    const g = rig.group;
    g.updateMatrixWorld(true);
    this.hand = [g.localToWorld(new THREE.Vector3(-0.2, 0.85, 0.08)), g.localToWorld(new THREE.Vector3(0.2, 0.85, 0.08))];
    this.gaze.copy(geo.part);
    this.lookAround.copy(geo.part);
  }

  private local(x: number, y: number, z: number) {
    return this.rig.group.localToWorld(new THREE.Vector3(x, y, z));
  }

  update(dt: number, state: HumanState) {
    if (this.frame && this.geoLocal) {
      this.frame.updateMatrixWorld(true);
      this.geo.part.copy(this.geoLocal.part).applyMatrix4(this.frame.matrixWorld);
      this.geo.bin.copy(this.geoLocal.bin).applyMatrix4(this.frame.matrixWorld);
      this.geo.hmi.copy(this.geoLocal.hmi).applyMatrix4(this.frame.matrixWorld);
    }
    const r = this.rig, s = r.s, g = this.geo;
    this.t += dt;
    const tgtL = new THREE.Vector3(), tgtR = new THREE.Vector3(), look = new THREE.Vector3();
    let wantLean: THREE.Vector3 | null = null;
    let tau = 0.25;

    if (state === 'processing' || state === 'setup') {
      // Work cycle (fractions of the cycle)
      const u = (this.t % this.cycle) / this.cycle;
      const right = g.part.clone(), left = g.part.clone();
      // Hands on either side of the part, small manipulation motion
      const across = this.local(1, 0, 0).sub(this.local(0, 0, 0)).normalize();
      left.addScaledVector(across, -0.11 * s);
      right.addScaledVector(across, 0.11 * s);
      const jig = Math.sin(this.t * 9) * 0.012, jig2 = Math.cos(this.t * 7.3) * 0.01;
      left.y += jig; right.y += jig2;
      tgtL.copy(left); tgtR.copy(right);
      look.copy(g.part);
      if (state === 'setup') {
        // Setup: alternate machine ↔ HMI every few seconds
        if (Math.floor(this.t / 3) % 2 === 0) { tgtR.copy(g.hmi); look.copy(g.hmi); }
      } else if (u > 0.22 && u < 0.42) {
        // The hand on the bin side fetches a component and brings it back
        const k = Math.sin(((u - 0.22) / 0.2) * Math.PI);
        tgtL.lerpVectors(left, g.bin, k);
        look.lerpVectors(g.part, g.bin, k);
      } else if (u > 0.42 && u < 0.7) {
        // Fastening: right hand turns at the part, left holds
        tgtR.y += Math.sin(this.t * 14) * 0.008;
        r.wrist[1].rotation.y = Math.sin(this.t * 14) * 0.6;
      } else if (u > 0.82 && u < 0.95) {
        // Glance and tap at the HMI (hand on the HMI side)
        const k = Math.sin(((u - 0.82) / 0.13) * Math.PI);
        tgtR.lerpVectors(right, g.hmi, k);
        look.lerpVectors(g.part, g.hmi, k);
      }
      wantLean = g.part;
      tau = 0.18;
    } else if (state === 'failed') {
      // Repair: bent into the machine, both hands working low
      const p = g.part.clone(); p.y -= 0.25 * s;
      const across = this.local(1, 0, 0).sub(this.local(0, 0, 0)).normalize();
      tgtL.copy(p).addScaledVector(across, -0.15 + Math.sin(this.t * 3) * 0.04);
      tgtR.copy(p).addScaledVector(across, 0.15 + Math.cos(this.t * 2.6) * 0.05);
      look.copy(p);
      wantLean = p;
    } else if (state === 'blocked') {
      // Hands on hips, looking at where the parts should go
      tgtL.copy(this.local(-0.17 * s, r.hipHeight + 0.06 * s, -0.02));
      tgtR.copy(this.local(0.17 * s, r.hipHeight + 0.06 * s, -0.02));
      look.copy(g.downstream ?? g.part);
      tau = 0.4;
    } else {
      // Idle / starved / off shift: relaxed, weight shift, looking around
      tgtL.copy(this.local(-0.2 * s, r.hipHeight - 0.12 * s, 0.06 * s));
      tgtR.copy(this.local(0.2 * s, r.hipHeight - 0.12 * s, 0.06 * s));
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTimer = 2 + Math.random() * 3;
        const pick = Math.random();
        this.lookAround.copy(pick < 0.5 && g.upstream ? g.upstream : pick < 0.75 ? g.part : this.local((Math.random() - 0.5) * 4, 1.5, 2 + Math.random() * 2));
      }
      look.copy(state === 'starved' && g.upstream ? g.upstream : this.lookAround);
      tau = 0.5;
    }

    // Trunk: lean as far as the work needs, smoothly
    let bendT = 0, squatT = 0;
    if (wantLean) ({ bend: bendT, squat: squatT } = r.leanFor(wantLean));
    this.bend = damp(this.bend, bendT, 0.35, dt);
    this.squat = damp(this.squat, squatT, 0.35, dt);
    // Weight shift while standing
    this.sway += dt;
    const shift = wantLean ? 0 : Math.sin(this.sway * 0.7) * 0.025 * s;
    r.pelvis.position.x = shift;
    r.pelvis.rotation.z = -shift * 1.2;
    r.applyLean(this.bend, this.squat);
    // Breathing
    r.chest.scale.setScalar(1 + Math.sin(this.t * 1.6) * 0.008);

    dampV(this.hand[0], tgtL, tau, dt);
    dampV(this.hand[1], tgtR, tau, dt);
    r.reachTo(0, this.hand[0]);
    r.reachTo(1, this.hand[1]);
    if (state !== 'processing') r.wrist[1].rotation.y = 0;
    dampV(this.gaze, look, 0.3, dt);
    r.lookAt(this.gaze);
  }
}

/**
 * A person walking along a polyline (manual transport, operators going to a
 * station), optionally carrying a box. Stride length follows speed, so feet
 * don't skate.
 */
export class Walker {
  readonly rig: HumanRig;
  private phase = Math.random() * Math.PI * 2;
  private heading = 0;

  constructor(rig: HumanRig) {
    this.rig = rig;
    rig.rest();
  }

  /**
   * Animate the legs for `distance` metres covered this frame (the caller moves
   * and turns the figure). Standing still when the distance is ~0.
   */
  stride(distance: number, dt: number, carrying: boolean) {
    const speed = dt > 0 ? distance / dt : 0;
    const amount = Math.min(1, speed / 1.1);
    this.phase += (distance / (1.4 * this.rig.s)) * Math.PI * 2;
    this.rig.carried.visible = carrying;
    if (amount < 0.05) {
      this.rig.rest();
      this.rig.plantFeet();
      if (carrying) this.rig.holdBox();
    } else {
      this.rig.walk(this.phase, Math.max(0.5, amount), carrying);
    }
  }

  /** Move to `pos` (world, on the floor) this frame; `carrying` shows the box. */
  step(pos: THREE.Vector3, dt: number, carrying: boolean) {
    const g = this.rig.group;
    const dx = pos.x - g.position.x, dz = pos.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = dt > 0 ? dist / dt : 0;
    if (dist > 1e-4) {
      const want = Math.atan2(dx, dz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 8);
    }
    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = this.heading;
    // One stride (two steps) ≈ 1.4 m at normal pace
    const amount = Math.min(1, speed / 1.1);
    this.phase += (dist / (1.4 * this.rig.s)) * Math.PI * 2;
    this.rig.carried.visible = carrying;
    if (amount < 0.05) {
      this.rig.rest();
      this.rig.plantFeet();
      if (carrying) this.rig.holdBox();
    } else {
      this.rig.walk(this.phase, amount, carrying);
    }
  }
}
