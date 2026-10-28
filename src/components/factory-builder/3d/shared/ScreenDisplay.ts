import * as THREE from 'three';

/**
 * Dynamic canvas-based HMI screen system for factory machines.
 * Creates and manages CanvasTexture-driven displays that show
 * real-time machine state, utilization bars, counters, and graphs.
 */

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface ScreenData {
  utilization: number;   // 0-1
  throughput: number;    // parts/hr
  cycleTime: number;     // seconds
  partsCount: number;
  uptime: number;        // hours
  state: string;
}

type ScreenType = 'hmi' | 'status' | 'counter' | 'graph';

interface ScreenEntry {
  id: string;
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  screenType: ScreenType;
  state: string;
  data: ScreenData;
  lastUpdate: number;
  dirty: boolean;
  flashTimer: number;
}

// ── Canvas size presets ────────────────────────────────────────────────────────

const CANVAS_SIZES: Record<ScreenType, [number, number]> = {
  hmi:     [256, 192],
  status:  [128, 128],
  counter: [128, 64],
  graph:   [256, 128],
};

// ── Plane size presets (world units) ───────────────────────────────────────────

const PLANE_SIZES: Record<ScreenType, [number, number]> = {
  hmi:     [0.15, 0.10],
  status:  [0.08, 0.08],
  counter: [0.10, 0.05],
  graph:   [0.15, 0.08],
};

// ── State colours ──────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  processing: '#00cc44',
  idle:       '#cccc00',
  failed:     '#dd2222',
  blocked:    '#ee8822',
  starved:    '#ee8822',
  off:        '#333333',
};

function stateColor(state: string): string {
  return STATE_COLORS[state] ?? '#666666';
}

// ── Default data ───────────────────────────────────────────────────────────────

function defaultData(): ScreenData {
  return {
    utilization: 0,
    throughput: 0,
    cycleTime: 0,
    partsCount: 0,
    uptime: 0,
    state: 'idle',
  };
}

// ── Manager ────────────────────────────────────────────────────────────────────

export class ScreenDisplayManager {
  private screens: Map<string, ScreenEntry> = new Map();
  private updateInterval: number;

  constructor(updateInterval = 500) {
    this.updateInterval = updateInterval;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a screen on a machine group. Finds an existing mesh named
   * 'screen' or 'screenActive', or creates a small plane at a default spot.
   */
  register(nodeId: string, group: THREE.Group, screenType: ScreenType = 'hmi'): void {
    if (this.screens.has(nodeId)) return;

    const [cw, ch] = CANVAS_SIZES[screenType];
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    });
    // Emissive-like glow via color boost (MeshBasicMaterial has no emissive)
    material.color.set(0xffffff);

    let mesh = this.findScreenMesh(group);

    if (mesh) {
      // Replace existing material
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
      mesh.material = material;
    } else {
      // Create a default screen plane
      const [pw, ph] = PLANE_SIZES[screenType];
      const geo = new THREE.PlaneGeometry(pw, ph);
      mesh = new THREE.Mesh(geo, material);
      mesh.name = 'screen';
      mesh.position.set(0, 0.5, 0.25);
      group.add(mesh);
    }

    // Add a subtle point light near the screen for glow
    const light = new THREE.PointLight(0x004488, 0.05, 0.5);
    light.position.copy(mesh.position);
    light.position.z += 0.03;
    mesh.parent!.add(light);

    const data = defaultData();

    // Initial render
    const entry: ScreenEntry = {
      id: nodeId,
      mesh,
      texture,
      canvas,
      ctx,
      screenType,
      state: 'idle',
      data,
      lastUpdate: 0,
      dirty: true,
      flashTimer: 0,
    };

    this.screens.set(nodeId, entry);
    this.renderEntry(entry);
    texture.needsUpdate = true;
  }

  /** Update a screen's machine state. */
  setState(nodeId: string, state: string): void {
    const entry = this.screens.get(nodeId);
    if (!entry) return;
    if (entry.state !== state) {
      entry.state = state;
      entry.data.state = state;
      entry.dirty = true;
      entry.flashTimer = 0.12; // brief white flash on state change
    }
  }

  /** Merge partial data into a screen's data store. */
  setData(nodeId: string, data: Partial<ScreenData>): void {
    const entry = this.screens.get(nodeId);
    if (!entry) return;
    Object.assign(entry.data, data);
    entry.dirty = true;
  }

  /** Called each frame. Internally throttles redraws to updateInterval. */
  update(elapsed: number): void {
    const now = performance.now();

    this.screens.forEach((entry) => {
      // Tick down flash timer
      if (entry.flashTimer > 0) {
        entry.flashTimer = Math.max(0, entry.flashTimer - elapsed);
        entry.dirty = true;
      }

      if (!entry.dirty) return;
      if (now - entry.lastUpdate < this.updateInterval) return;

      this.renderEntry(entry);
      entry.texture.needsUpdate = true;
      entry.lastUpdate = now;
      entry.dirty = false;
    });
  }

  /** Dispose of all screens, textures, and canvases. */
  dispose(): void {
    this.screens.forEach((entry) => {
      entry.texture.dispose();
      if (!Array.isArray(entry.mesh.material)) {
        entry.mesh.material.dispose();
      }
    });
    this.screens.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Find existing screen mesh in a group hierarchy. */
  private findScreenMesh(group: THREE.Group): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    group.traverse((child) => {
      if (found) return;
      if (
        (child.name === 'screen' || child.name === 'screenActive') &&
        (child as THREE.Mesh).isMesh
      ) {
        found = child as THREE.Mesh;
      }
    });
    return found;
  }

  /** Dispatch to the correct renderer based on screen type. */
  private renderEntry(entry: ScreenEntry): void {
    const { ctx, canvas, data, flashTimer } = entry;

    switch (entry.screenType) {
      case 'hmi':     this.renderHMI(ctx, canvas, data);     break;
      case 'status':  this.renderStatus(ctx, canvas, data);  break;
      case 'counter': this.renderCounter(ctx, canvas, data); break;
      case 'graph':   this.renderGraph(ctx, canvas, data);   break;
    }

    // Scanline overlay — every other row slightly darker
    this.applyScanlines(ctx, canvas);

    // Brief white flash on state change
    if (flashTimer > 0) {
      const alpha = flashTimer / 0.12 * 0.25;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── Render: HMI ────────────────────────────────────────────────────────────

  private renderHMI(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: ScreenData,
  ): void {
    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Header bar
    const headerH = 28;
    ctx.fillStyle = stateColor(data.state);
    ctx.fillRect(0, 0, w, headerH);

    // State text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.state.toUpperCase(), w / 2, headerH / 2);

    // Utilization bar
    const barY = 42;
    const barH = 16;
    const barPad = 12;
    const barW = w - barPad * 2;

    ctx.fillStyle = '#0e0e1e';
    ctx.fillRect(barPad, barY, barW, barH);

    const fillW = barW * Math.min(1, Math.max(0, data.utilization));
    ctx.fillStyle = '#00cc44';
    ctx.fillRect(barPad, barY, fillW, barH);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Util: ${(data.utilization * 100).toFixed(0)}%`, barPad, barY + barH + 12);

    // Parts counter
    const partsY = 90;
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Parts: ${data.partsCount}`, w / 2, partsY);

    // Cycle time
    const ctY = 118;
    ctx.fillStyle = '#88ccff';
    ctx.font = '14px monospace';
    ctx.fillText(`C/T: ${data.cycleTime.toFixed(1)}s`, w / 2, ctY);

    // Throughput
    const tpY = 140;
    ctx.fillStyle = '#aaaacc';
    ctx.font = '12px monospace';
    ctx.fillText(`${data.throughput.toFixed(0)} pcs/hr`, w / 2, tpY);

    // Uptime at bottom
    ctx.fillStyle = '#556677';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Up: ${data.uptime.toFixed(1)}h`, w - 8, h - 6);
  }

  // ── Render: Status ─────────────────────────────────────────────────────────

  private renderStatus(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: ScreenData,
  ): void {
    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Large state circle
    const cx = w / 2;
    const cy = 44;
    const r = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = stateColor(data.state);
    ctx.fill();

    // Glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = stateColor(data.state);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // State text
    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.state.toUpperCase(), cx, 84);

    // Parts counter
    ctx.fillStyle = '#00ff88';
    ctx.font = '16px monospace';
    ctx.fillText(`${data.partsCount}`, cx, 110);
  }

  // ── Render: Counter ────────────────────────────────────────────────────────

  private renderCounter(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: ScreenData,
  ): void {
    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Large seven-segment style count
    ctx.fillStyle = '#00ff44';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(data.partsCount).padStart(5, '0'), w / 2, h / 2 - 4);

    // Label
    ctx.fillStyle = '#556655';
    ctx.font = '10px monospace';
    ctx.fillText('PARTS', w / 2, h - 8);
  }

  // ── Render: Graph ──────────────────────────────────────────────────────────

  private renderGraph(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: ScreenData,
  ): void {
    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, w, h);

    const barAreaTop = 18;
    const barAreaBot = h - 18;
    const barAreaH = barAreaBot - barAreaTop;
    const barCount = 3;
    const barGap = 16;
    const totalGap = barGap * (barCount + 1);
    const barW = (w - totalGap) / barCount;

    // Normalise throughput to 0-1 range (cap at 200 pcs/hr for display)
    const throughputNorm = Math.min(1, data.throughput / 200);
    // Cycle efficiency: rough metric based on cycle time (lower is better, cap at 60s)
    const cycleEfficiency = data.cycleTime > 0 ? Math.min(1, 1 - data.cycleTime / 60) : 0;

    const bars: { value: number; color: string; label: string }[] = [
      { value: data.utilization, color: '#3388ff', label: 'Util' },
      { value: throughputNorm,   color: '#00cc44', label: 'Thru' },
      { value: cycleEfficiency,  color: '#cccc00', label: 'Eff' },
    ];

    bars.forEach((bar, i) => {
      const x = barGap + i * (barW + barGap);
      const fillH = barAreaH * Math.min(1, Math.max(0, bar.value));

      // Bar background
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(x, barAreaTop, barW, barAreaH);

      // Bar fill
      ctx.fillStyle = bar.color;
      ctx.fillRect(x, barAreaBot - fillH, barW, fillH);

      // Label below
      ctx.fillStyle = '#888888';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bar.label, x + barW / 2, h - 4);

      // Value above bar
      ctx.fillStyle = bar.color;
      ctx.font = '9px monospace';
      ctx.fillText(
        `${(bar.value * 100).toFixed(0)}%`,
        x + barW / 2,
        barAreaTop - 4,
      );
    });
  }

  // ── Scanline overlay ───────────────────────────────────────────────────────

  private applyScanlines(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 0; y < canvas.height; y += 2) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }
}
