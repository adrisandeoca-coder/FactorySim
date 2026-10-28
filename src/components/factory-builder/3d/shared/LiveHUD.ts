import * as THREE from 'three';
import type { ScenarioRenderResult } from './ScenarioRenderer';

/**
 * LiveHUD — floating per-entity HUD sprites showing simulation state and
 * utilization, hovering above each rigged or animated entity. Mirrors the
 * AnyLogic / VC overlay convention that turns a 3D scene into a live dashboard.
 *
 * The HUD updates every frame from a `dataSource` callback that returns the
 * current state and utilization for a given entity id. State drives a colored
 * dot (green/amber/red); utilization is a thin bar.
 *
 * The sprites use canvas textures so they always face the camera and stay
 * legible at any zoom level.
 */

export interface HUDDataSource {
  (entityId: string): {
    state?: string;            // 'processing' | 'blocked' | 'starved' | 'idle' | 'failed' | ...
    utilization?: number;      // 0..1
    label?: string;            // short label (defaults to the entityId)
  } | null;
}

interface ManagedHUD {
  entityId: string;
  wrapper: THREE.Group;        // entity wrapper to position the sprite above
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  lastSig: string;             // signature of last drawn state, to skip redraws
}

const STATE_COLORS: Record<string, string> = {
  processing: '#22c55e',
  setup:      '#3b82f6',
  starved:    '#f59e0b',
  blocked:    '#ef4444',
  failed:     '#ef4444',
  batch_wait: '#a855f7',
  idle:       '#6b7280',
  off_shift:  '#374151',
};

function makeCanvas(w = 256, h = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
  state: string,
  util: number,
): void {
  ctx.clearRect(0, 0, w, h);

  // Background (rounded panel)
  ctx.fillStyle = 'rgba(15, 18, 24, 0.85)';
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // State dot
  const stateColor = STATE_COLORS[state] ?? '#6b7280';
  ctx.fillStyle = stateColor;
  ctx.beginPath();
  ctx.arc(22, 28, 9, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 42, 30);

  // State name
  ctx.fillStyle = stateColor;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(state, 16, 58);

  // Utilization bar
  const barX = 100;
  const barY = 50;
  const barW = w - barX - 16;
  const barH = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(barX, barY, barW, barH);
  const fillW = barW * Math.min(1, Math.max(0, util));
  // Color tracks state: green for processing, otherwise neutral
  const barColor = state === 'processing' ? '#22c55e' : state === 'failed' || state === 'blocked' ? '#ef4444' : '#6b7280';
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, fillW, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  // Utilization percent text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(util * 100)}%`, barX + barW / 2 - 14, barY + barH / 2 + 1);
}

export class LiveHUD {
  private huds: ManagedHUD[] = [];
  private source: HUDDataSource | null = null;
  private visible = true;

  /** Attach a HUD sprite to every entity in the result. */
  attach(result: ScenarioRenderResult, source: HUDDataSource): void {
    this.attachInner(result.entityById, source);
  }

  /**
   * Alternate attach for Factory3DView-style flat node-group maps. Each group
   * gets a HUD sprite parented above its bounding-box top.
   */
  attachGroups(groups: Map<string, THREE.Group>, source: HUDDataSource): void {
    this.attachInner(groups, source);
  }

  private attachInner(entries: Map<string, THREE.Group>, source: HUDDataSource): void {
    this.dispose();
    this.source = source;

    for (const [entityId, wrapper] of entries) {
      const canvas = makeCanvas();
      const ctx = canvas.getContext('2d')!;
      drawHUD(ctx, canvas.width, canvas.height, entityId, 'idle', 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      // Sprite ground-truth size in world units; aspect ratio matches canvas.
      const aspect = canvas.width / canvas.height;
      const heightWorld = 0.45;
      sprite.scale.set(heightWorld * aspect, heightWorld, 1);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 999;
      // Position is updated each frame by `update()` so it follows the entity.
      wrapper.add(sprite);

      this.huds.push({
        entityId,
        wrapper,
        sprite,
        canvas,
        ctx,
        texture,
        lastSig: '',
      });
    }
  }

  /** Toggle HUD visibility. */
  setVisible(v: boolean): void {
    this.visible = v;
    for (const h of this.huds) h.sprite.visible = v;
  }

  isVisible(): boolean { return this.visible; }

  /** Update sprite contents and positions. */
  update(): void {
    if (!this.visible || !this.source) return;

    for (const h of this.huds) {
      const data = this.source(h.entityId);
      const state = data?.state ?? 'idle';
      const util = data?.utilization ?? 0;
      const label = data?.label ?? h.entityId;

      const sig = `${label}|${state}|${Math.round(util * 100)}`;
      if (sig !== h.lastSig) {
        drawHUD(h.ctx, h.canvas.width, h.canvas.height, label, state, util);
        h.texture.needsUpdate = true;
        h.lastSig = sig;
      }

      // Position the sprite slightly above the entity's bounding box top.
      const bbox = new THREE.Box3().setFromObject(h.wrapper);
      if (!bbox.isEmpty()) {
        const top = bbox.max.y;
        // Local Y position relative to wrapper.
        const wrapperWorldY = h.wrapper.position.y;
        h.sprite.position.set(0, top - wrapperWorldY + 0.25, 0);
      }
    }
  }

  count(): number { return this.huds.length; }

  dispose(): void {
    for (const h of this.huds) {
      if (h.sprite.parent) h.sprite.parent.remove(h.sprite);
      h.texture.dispose();
      (h.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.huds = [];
    this.source = null;
  }
}
