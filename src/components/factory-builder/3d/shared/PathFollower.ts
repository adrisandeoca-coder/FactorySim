import * as THREE from 'three';

/**
 * PathFollower — generic path-based motion driver shared by conveyors, AGVs,
 * forklifts, and supply-chain trucks. Wraps a THREE.Curve (or array of points)
 * with a speed profile, optional looping, and a Tool Center Point (TCP) frame
 * so payloads can be parented to the moving frame.
 *
 * Design parallel to robots: a robot has FKChain + IK target; a path-follower
 * has PathFollower + path target. Both produce a TCP world transform that
 * downstream code (e.g. WorkObject reparenting) consumes.
 */

export interface PathFollowerOptions {
  /** Loop back to start when reaching the end. Default: true. */
  loop?: boolean;
  /** Travel speed in world units / second. Default: 1. */
  speed?: number;
  /** Acceleration & deceleration in units / s². 0 = instant. Default: 0. */
  accel?: number;
  /** Initial path parameter t in [0, 1]. Default: 0. */
  startT?: number;
}

export class PathFollower {
  readonly tcp: THREE.Group;            // moving frame; parent payloads here

  private curve: THREE.Curve<THREE.Vector3>;
  private loop: boolean;
  private targetSpeed: number;
  private accel: number;
  private speed = 0;
  private t: number;
  private length: number;
  private paused = false;

  // Reusable temps
  private _pos = new THREE.Vector3();
  private _tan = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);

  constructor(curve: THREE.Curve<THREE.Vector3>, opts: PathFollowerOptions = {}) {
    this.curve = curve;
    this.loop = opts.loop ?? true;
    this.targetSpeed = opts.speed ?? 1;
    this.accel = opts.accel ?? 0;
    this.t = opts.startT ?? 0;
    this.length = curve.getLength();
    this.tcp = new THREE.Group();
    this.tcp.name = 'pathTCP';
    this.applyT();
  }

  /** Build a follower from waypoints. Uses CatmullRom for smooth turns. */
  static fromPoints(points: THREE.Vector3[], opts: PathFollowerOptions = {}): PathFollower {
    if (points.length < 2) throw new Error('PathFollower: need at least 2 points');
    const curve = new THREE.CatmullRomCurve3(points, opts.loop ?? true, 'centripetal', 0.5);
    return new PathFollower(curve, opts);
  }

  /** Replace the underlying curve, preserving the current t. */
  setCurve(curve: THREE.Curve<THREE.Vector3>): void {
    this.curve = curve;
    this.length = curve.getLength();
    this.applyT();
  }

  setSpeed(unitsPerSec: number): void { this.targetSpeed = unitsPerSec; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  isAtEnd(): boolean { return !this.loop && this.t >= 1 - 1e-6; }
  getT(): number { return this.t; }
  getLength(): number { return this.length; }

  /** Advance along the path. Call each frame. */
  update(dt: number): void {
    if (this.paused) return;

    // Accelerate toward targetSpeed.
    if (this.accel > 0) {
      const diff = this.targetSpeed - this.speed;
      const step = Math.min(this.accel * dt, Math.abs(diff));
      this.speed += Math.sign(diff) * step;
    } else {
      this.speed = this.targetSpeed;
    }

    if (this.length <= 1e-6) return;
    const ds = this.speed * dt;
    this.t += ds / this.length;

    if (this.t >= 1) {
      if (this.loop) {
        this.t = this.t % 1;
      } else {
        this.t = 1;
        this.speed = 0;
      }
    } else if (this.t < 0) {
      this.t = this.loop ? this.t + 1 : 0;
    }

    this.applyT();
  }

  /** Place the TCP at the current path parameter, oriented along the tangent. */
  private applyT(): void {
    this.curve.getPointAt(this.t, this._pos);
    this.curve.getTangentAt(this.t, this._tan).normalize();

    this.tcp.position.copy(this._pos);
    // Orient: forward = tangent, up = world Y. Build a basis quaternion.
    const forward = this._tan;
    const right = new THREE.Vector3().crossVectors(this._up, forward).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, forward);
    this.tcp.quaternion.setFromRotationMatrix(m);
  }
}
