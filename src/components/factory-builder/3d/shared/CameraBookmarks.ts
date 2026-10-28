import * as THREE from 'three';

/**
 * CameraBookmarks — saved viewpoints (camera position + look target + FOV)
 * with smooth fly-to playback. Mirrors VC / Unity's camera bookmark feature.
 *
 * Bookmarks are persisted to localStorage so they survive reloads.
 */

export interface CameraBookmark {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

const STORAGE_KEY = 'factorysim:camera-bookmarks';

export class CameraBookmarks {
  private camera: THREE.PerspectiveCamera;
  private controls: { target: THREE.Vector3; update: () => void };
  private bookmarks: CameraBookmark[] = [];

  // Active fly-to animation
  private flyStart: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;
  private flyEnd: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;
  private flyT = 0;
  private flyDuration = 0.8;

  constructor(camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3; update: () => void }) {
    this.camera = camera;
    this.controls = controls;
    this.load();
  }

  /** List all saved bookmarks. */
  list(): CameraBookmark[] {
    return [...this.bookmarks];
  }

  /** Capture the current camera pose as a new bookmark. */
  capture(label: string): CameraBookmark {
    const id = `bm-${Date.now()}`;
    const bm: CameraBookmark = {
      id,
      label,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z },
      fov: this.camera.fov,
    };
    this.bookmarks.push(bm);
    this.persist();
    return bm;
  }

  /** Smoothly fly to a saved bookmark. Pass an id or the bookmark itself. */
  flyTo(idOrBookmark: string | CameraBookmark, duration = 0.8): void {
    const bm = typeof idOrBookmark === 'string'
      ? this.bookmarks.find(b => b.id === idOrBookmark)
      : idOrBookmark;
    if (!bm) return;

    this.flyStart = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
    };
    this.flyEnd = {
      pos: new THREE.Vector3(bm.position.x, bm.position.y, bm.position.z),
      target: new THREE.Vector3(bm.target.x, bm.target.y, bm.target.z),
      fov: bm.fov,
    };
    this.flyT = 0;
    this.flyDuration = duration;
  }

  /** Per-frame update — must be called from the render loop. */
  update(dt: number): void {
    if (!this.flyStart || !this.flyEnd) return;

    this.flyT += dt;
    const k = Math.min(1, this.flyT / this.flyDuration);
    // Ease out-cubic for a smooth landing.
    const t = 1 - Math.pow(1 - k, 3);

    this.camera.position.lerpVectors(this.flyStart.pos, this.flyEnd.pos, t);
    this.controls.target.lerpVectors(this.flyStart.target, this.flyEnd.target, t);
    const fov = this.flyStart.fov + (this.flyEnd.fov - this.flyStart.fov) * t;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();

    if (k >= 1) {
      this.flyStart = null;
      this.flyEnd = null;
    }
  }

  /** Remove a bookmark by id. */
  remove(id: string): void {
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
    this.persist();
  }

  /** Drop everything. */
  clear(): void {
    this.bookmarks = [];
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bookmarks));
    } catch {/* ignore */}
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.bookmarks = JSON.parse(raw) as CameraBookmark[];
    } catch {/* ignore */}
  }
}
