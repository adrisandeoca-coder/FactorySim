import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { useLiveSimulationStore, StreamedEvent } from '../../stores/liveSimulationStore';
import { registerElement } from '../../services/elementRegistry';

// ── Product colors ─────────────────────────────────────
const PRODUCT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

// ── Types ──────────────────────────────────────────────
interface Particle {
  sx: number; sy: number;
  tx: number; ty: number;
  mx: number; my: number;
  t: number;        // progress 0→1
  speed: number;    // progress per ms
  color: string;
  r: number;        // base radius
  id: number;       // for pulse phase offset
  isEvent: boolean;
}

interface Ripple {
  x: number; y: number;
  t: number;        // progress 0→1
  speed: number;
  color: string;
  maxR: number;
}

interface EdgeData {
  srcId: string; tgtId: string;
  sx: number; sy: number;
  tx: number; ty: number;
  mx: number; my: number;
  active: boolean;
  processing: boolean;
  bottleneck: boolean;
}

interface Resolved {
  srcId: string;
  tgtId: string;
  pt: string;
}

// ── Constants — "quiet by default" tuning ──────────────
const MAX_PARTICLES = 300;       // was 800 — much less clutter
const DRAIN_PER_FRAME = 4;      // was 8 — gentler event drain
const FLOW_INTERVAL = 200;      // was 50 — much slower ambient spawning
const FLOW_IDLE_PROB = 0.03;    // was 0.12 — barely any particles on idle edges
const DASH_SPEED = 0.015;       // was 0.04 — slow gentle drift
const RIPPLE_SPEED = 1 / 500;   // was 1/350 — slower ripples
const TRAIL_LEN = 0.08;         // was 0.12 — shorter comet tails
const TRAIL_SEGS = 6;           // was 10 — fewer trail segments

// ── Math helpers ───────────────────────────────────────
function bezMid(sx: number, sy: number, tx: number, ty: number) {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const c = Math.min(0.12, 25 / (d + 1));
  return {
    x: (sx + tx) / 2 - (dy / (d + 1)) * d * c,
    y: (sy + ty) / 2 + (dx / (d + 1)) * d * c,
  };
}

function evalBez(
  t: number,
  sx: number, sy: number,
  mx: number, my: number,
  tx: number, ty: number,
) {
  const u = 1 - t;
  return {
    x: u * u * sx + 2 * u * t * mx + t * t * tx,
    y: u * u * sy + 2 * u * t * my + t * t * ty,
  };
}

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function hexRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Component ──────────────────────────────────────────
export function LiveAnimationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const animRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastFlowRef = useRef(0);
  const lastFlowFlushRef = useRef(0);
  const localFlowCounts = useRef<Record<string, number>>({});
  const dashOffRef = useRef(0);
  const nextIdRef = useRef(0);
  const processedRef = useRef(0);
  const pendingRef = useRef<Resolved[]>([]);
  const colorMapRef = useRef(new Map<string, string>());
  const colorIdxRef = useRef(0);

  const { getNodes, getEdges, getViewport } = useReactFlow();

  // Register animation canvas for direct frame capture
  useEffect(() => {
    registerElement('animation-canvas', canvasRef.current);
    return () => registerElement('animation-canvas', null);
  }, []);

  // ── Color assignment ──
  const getColor = useCallback((pt: string) => {
    if (!colorMapRef.current.has(pt)) {
      colorMapRef.current.set(
        pt,
        PRODUCT_COLORS[colorIdxRef.current++ % PRODUCT_COLORS.length],
      );
    }
    return colorMapRef.current.get(pt)!;
  }, []);

  // ── Resolve streamed event → source/target node IDs ──
  const resolveEvent = useCallback(
    (
      ev: StreamedEvent,
      edgeList: ReturnType<typeof getEdges>,
      nameToId: Map<string, string>,
      nodeIds: Set<string>,
    ): Resolved | null => {
      let src: string | undefined;
      let tgt: string | undefined;
      const pt =
        (ev.details.product_type as string) ||
        (ev.details.product_id as string) ||
        'product';

      if (
        ev.type === 'processing_start' ||
        (ev.type === 'state_change' && ev.details.state === 'processing')
      ) {
        const n = (ev.details.station as string) || ev.entity_id;
        tgt = nameToId.get(n) || n;
        const e = edgeList.find((ed) => ed.target === tgt);
        if (e) src = e.source;
      } else if (ev.type === 'buffer_put') {
        const n = ev.details.buffer as string;
        tgt = nameToId.get(n) || n;
        const e = edgeList.find((ed) => ed.target === tgt);
        if (e) src = e.source;
      } else if (ev.type === 'buffer_get') {
        const n = ev.details.buffer as string;
        src = nameToId.get(n) || n;
        const e = edgeList.find((ed) => ed.source === src);
        if (e) tgt = e.target;
      } else if (ev.type === 'source_generate') {
        const n = (ev.details.source as string) || ev.entity_id;
        src = nameToId.get(n) || n;
        const e = edgeList.find((ed) => ed.source === src);
        if (e) tgt = e.target;
      } else if (ev.type === 'sink_exit') {
        const n = (ev.details.sink as string) || ev.entity_id;
        tgt = nameToId.get(n) || n;
        const e = edgeList.find((ed) => ed.target === tgt);
        if (e) src = e.source;
      } else {
        return null;
      }

      if (!src || !tgt || !nodeIds.has(src) || !nodeIds.has(tgt)) return null;
      return { srcId: src, tgtId: tgt, pt };
    },
    [],
  );

  // ── Build edge geometry + activity state ──
  const buildEdges = useCallback((): EdgeData[] => {
    const nodes = getNodes();
    const edgeList = getEdges();
    const states = useLiveSimulationStore.getState().stationStates;
    const bufLevels = useLiveSimulationStore.getState().bufferLevels;

    // Handle positions: source = right edge, target = left edge
    const srcHandle = new Map<string, { x: number; y: number }>();
    const tgtHandle = new Map<string, { x: number; y: number }>();
    const nameToId = new Map<string, string>();

    for (const node of nodes) {
      const w = node.width || 140;
      const h = node.height || 55;
      srcHandle.set(node.id, { x: node.position.x + w, y: node.position.y + h / 2 });
      tgtHandle.set(node.id, { x: node.position.x, y: node.position.y + h / 2 });
      const name = (node.data as any)?.name;
      if (name) nameToId.set(name, node.id);
    }

    const activeIds = new Set<string>();
    const procIds = new Set<string>();
    for (const [name, state] of Object.entries(states)) {
      if (state === 'processing' || state === 'blocked') {
        const id = nameToId.get(name);
        if (id) activeIds.add(id);
      }
      if (state === 'processing') {
        const id = nameToId.get(name);
        if (id) procIds.add(id);
      }
    }
    for (const [name, bl] of Object.entries(bufLevels)) {
      if (bl.level > 0) {
        const id = nameToId.get(name);
        if (id) activeIds.add(id);
      }
    }

    // #4 — Detect bottleneck buffers (at capacity)
    const bottleneckIds = new Set<string>();
    for (const [name, bl] of Object.entries(bufLevels)) {
      if (bl.capacity > 0 && bl.level >= bl.capacity) {
        const id = nameToId.get(name);
        if (id) bottleneckIds.add(id);
      }
    }

    const result: EdgeData[] = [];
    for (const edge of edgeList) {
      const s = srcHandle.get(edge.source);
      const t = tgtHandle.get(edge.target);
      if (!s || !t) continue;
      const m = bezMid(s.x, s.y, t.x, t.y);
      result.push({
        srcId: edge.source,
        tgtId: edge.target,
        sx: s.x, sy: s.y,
        tx: t.x, ty: t.y,
        mx: m.x, my: m.y,
        active: activeIds.has(edge.source) || activeIds.has(edge.target),
        processing: procIds.has(edge.source) || procIds.has(edge.target),
        bottleneck: bottleneckIds.has(edge.source) || bottleneckIds.has(edge.target),
      });
    }
    return result;
  }, [getNodes, getEdges]);

  // ── Subscribe to streamed events → queue for animation ──
  const recentEvents = useLiveSimulationStore((s) => s.recentEvents);

  useEffect(() => {
    if (recentEvents.length === 0) return;
    const newEvts = recentEvents.slice(processedRef.current);
    processedRef.current = recentEvents.length;
    if (newEvts.length === 0) return;

    const nodes = getNodes();
    const edgeList = getEdges();
    const nodeIds = new Set<string>();
    const nameToId = new Map<string, string>();
    for (const node of nodes) {
      nodeIds.add(node.id);
      const name = (node.data as any)?.name;
      if (name) nameToId.set(name, node.id);
    }

    for (const ev of newEvts) {
      const r = resolveEvent(ev, edgeList, nameToId, nodeIds);
      if (r) pendingRef.current.push(r);
    }

    // Downsample if overloaded
    if (pendingRef.current.length > 1000) {
      const step = Math.ceil(pendingRef.current.length / 500);
      pendingRef.current = pendingRef.current.filter((_, i) => i % step === 0);
    }

    startLoop();
  }, [recentEvents, getNodes, getEdges, resolveEvent]);

  // Kick loop when station states change
  const stationStates = useLiveSimulationStore((s) => s.stationStates);
  useEffect(() => {
    if (Object.keys(stationStates).length > 0) startLoop();
  }, [stationStates]);

  // ── Main animation loop (Canvas 2D) ──
  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTimeRef.current = performance.now();
    let cooldown = 0;

    const tick = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) { runningRef.current = false; return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { runningRef.current = false; return; }

      // ── Resize canvas for HiDPI ──
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (parent) {
        const cw = parent.clientWidth;
        const ch = parent.clientHeight;
        if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
          canvas.width = cw * dpr;
          canvas.height = ch * dpr;
          canvas.style.width = cw + 'px';
          canvas.style.height = ch + 'px';
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      // ── Apply viewport transform (zoom/pan aware) ──
      const vp = getViewport();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.zoom, vp.zoom);

      const dt = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;

      const edges = buildEdges();
      const particles = particlesRef.current;
      const ripples = ripplesRef.current;

      // ── 1. Drain pending events → spawn event particles + emit ripples ──
      const drainCount =
        pendingRef.current.length > 200 ? 14 :
        pendingRef.current.length > 50 ? 10 : DRAIN_PER_FRAME;
      const batch = pendingRef.current.splice(0, drainCount);

      for (const ev of batch) {
        const edge =
          edges.find((e) => e.srcId === ev.srcId && e.tgtId === ev.tgtId) ||
          edges.find((e) => e.tgtId === ev.tgtId) ||
          edges.find((e) => e.srcId === ev.srcId);
        if (!edge) continue;

        // P2 — Accumulate edge flow count locally (flushed periodically)
        const flowKey = `${edge.srcId}->${edge.tgtId}`;
        localFlowCounts.current[flowKey] = (localFlowCounts.current[flowKey] || 0) + 1;

        const color = getColor(ev.pt);
        particles.push({
          sx: edge.sx, sy: edge.sy,
          tx: edge.tx, ty: edge.ty,
          mx: edge.mx, my: edge.my,
          t: 0,
          speed: (1 / 2200) * (0.8 + Math.random() * 0.3), // slower travel
          color,
          r: 3 + Math.random() * 1.5, // smaller event dots
          id: nextIdRef.current++,
          isEvent: true,
        });

        // Subtle ripple at source handle
        ripples.push({
          x: edge.sx, y: edge.sy,
          t: 0, speed: RIPPLE_SPEED,
          color, maxR: 10, // smaller ripple
        });
      }

      // ── 2. Spawn ambient flow particles on edges (P2: flow-scaled density) ──
      if (now - lastFlowRef.current > FLOW_INTERVAL) {
        lastFlowRef.current = now;
        // P2 — Compute max flow for normalization from local counts
        const flowCounts = localFlowCounts.current;
        const flowVals = Object.values(flowCounts);
        const maxFlow = flowVals.length > 0 ? Math.max(...flowVals, 1) : 1;

        for (const edge of edges) {
          if (edge.active) {
            const flowKey = `${edge.srcId}->${edge.tgtId}`;
            const flowRatio = maxFlow > 0 ? (flowCounts[flowKey] || 0) / maxFlow : 0;
            // Quiet: 1 particle on low-flow edges, up to 3 on busiest
            const spawnCount = Math.round(1 + flowRatio * 2);
            const speedMult = 0.4 + flowRatio * 0.4; // gentle drift
            for (let i = 0; i < spawnCount; i++) {
              const color = edge.processing ? '#4ade80' : '#60a5fa';
              particles.push({
                sx: edge.sx, sy: edge.sy,
                tx: edge.tx, ty: edge.ty,
                mx: edge.mx, my: edge.my,
                t: Math.random() * 0.08,
                speed: (1 / 4000) * speedMult * (0.8 + Math.random() * 0.4),
                color,
                r: 1.0 + Math.random() * 1.2, // smaller dots
                id: nextIdRef.current++,
                isEvent: false,
              });
            }
          } else if (Math.random() < FLOW_IDLE_PROB) {
            particles.push({
              sx: edge.sx, sy: edge.sy,
              tx: edge.tx, ty: edge.ty,
              mx: edge.mx, my: edge.my,
              t: Math.random() * 0.15,
              speed: (1 / 5000) * (0.3 + Math.random() * 0.4), // very slow
              color: '#475569', // darker, less visible
              r: 0.6 + Math.random() * 0.5, // tiny
              id: nextIdRef.current++,
              isEvent: false,
            });
          }
        }
      }

      // ── 3. Update particles ──
      let alive = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.t += p.speed * dt;
        if (p.t < 1) {
          particles[alive++] = p;
        }
        // No absorb ripple — keeps things calm
      }
      particles.length = alive;

      // Update ripples
      let rAlive = 0;
      for (let i = 0; i < ripples.length; i++) {
        ripples[i].t += ripples[i].speed * dt;
        if (ripples[i].t < 1) ripples[rAlive++] = ripples[i];
      }
      ripples.length = rAlive;

      // Cap particles
      if (particles.length > MAX_PARTICLES) {
        const evts = particles.filter((p) => p.isEvent);
        const flows = particles.filter((p) => !p.isEvent);
        particlesRef.current = [
          ...flows.slice(-(MAX_PARTICLES - evts.length)),
          ...evts,
        ];
      }

      // ── Flush local flow counts to Zustand store every 2s ──
      if (now - lastFlowFlushRef.current > 2000 && Object.keys(localFlowCounts.current).length > 0) {
        lastFlowFlushRef.current = now;
        useLiveSimulationStore.setState({ edgeFlowCounts: { ...localFlowCounts.current } });
      }

      // ── DRAWING ──────────────────────────────────────

      // 4a. Edge glow — very faint, only on bottleneck edges
      for (const edge of edges) {
        if (!edge.bottleneck) continue; // only bottleneck gets glow
        ctx.beginPath();
        ctx.moveTo(edge.sx, edge.sy);
        ctx.quadraticCurveTo(edge.mx, edge.my, edge.tx, edge.ty);
        ctx.strokeStyle = rgba('#f87171', 0.03);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // 4b. Flowing dashes — slow, very faint
      dashOffRef.current += DASH_SPEED * dt;
      ctx.save();
      for (const edge of edges) {
        if (!edge.active) continue;
        ctx.beginPath();
        ctx.moveTo(edge.sx, edge.sy);
        ctx.quadraticCurveTo(edge.mx, edge.my, edge.tx, edge.ty);
        ctx.setLineDash([4, 14]);
        ctx.lineDashOffset = -dashOffRef.current;
        ctx.strokeStyle = edge.bottleneck
          ? rgba('#f87171', 0.08)
          : edge.processing
          ? rgba('#4ade80', 0.05)
          : rgba('#60a5fa', 0.03);
        ctx.lineWidth = 0.8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // 5. Draw flow particles — very faint ambient dots
      for (const p of particlesRef.current) {
        if (p.isEvent) continue;
        const et = ease(p.t);
        const pos = evalBez(et, p.sx, p.sy, p.mx, p.my, p.tx, p.ty);

        let op: number;
        let sz: number;
        if (p.t < 0.1) {
          op = (p.t / 0.1) * 0.15; // much dimmer
          sz = p.r;
        } else if (p.t > 0.85) {
          const tail = (p.t - 0.85) / 0.15;
          op = (1 - tail) * 0.15;
          sz = p.r * (1 - tail * 0.4);
        } else {
          op = 0.15; // was 0.30
          sz = p.r;
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = rgba(p.color, op);
        ctx.fill();
      }

      // 6. Draw event particles — smaller, calmer, no per-particle pulse
      for (const p of particlesRef.current) {
        if (!p.isEvent) continue;
        const et = ease(p.t);
        const pos = evalBez(et, p.sx, p.sy, p.mx, p.my, p.tx, p.ty);

        let op: number;
        let sz: number;
        if (p.t < 0.08) {
          op = (p.t / 0.08) * 0.7;
          sz = p.r;
        } else if (p.t > 0.85) {
          const tail = (p.t - 0.85) / 0.15;
          op = (1 - tail) * 0.7;
          sz = p.r * (1 - tail * 0.4);
        } else {
          op = 0.7; // was 1.0 — calmer
          sz = p.r;
        }

        const [cr, cg, cb] = hexRgb(p.color);

        // Short comet trail — subtle
        if (p.t > 0.05) {
          ctx.lineCap = 'round';
          for (let i = 0; i < TRAIL_SEGS; i++) {
            const t1 = Math.max(0, p.t - TRAIL_LEN * ((TRAIL_SEGS - i) / TRAIL_SEGS));
            const t2 = Math.max(0, p.t - TRAIL_LEN * ((TRAIL_SEGS - i - 1) / TRAIL_SEGS));
            const p1 = evalBez(ease(t1), p.sx, p.sy, p.mx, p.my, p.tx, p.ty);
            const p2 = evalBez(ease(t2), p.sx, p.sy, p.mx, p.my, p.tx, p.ty);
            const segAlpha = op * (i / TRAIL_SEGS) * 0.10; // was 0.20
            const segWidth = sz * (0.2 + 0.8 * (i / TRAIL_SEGS));
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${segAlpha})`;
            ctx.lineWidth = segWidth;
            ctx.stroke();
          }
        }

        // Main dot — no outer glow ring, just the dot
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${op * 0.7})`;
        ctx.fill();
      }

      // 7. Draw ripples — very faint
      for (const rip of ripplesRef.current) {
        const [rr, rg, rb] = hexRgb(rip.color);
        const radius = rip.t * rip.maxR;
        const alpha = (1 - rip.t) * 0.10; // was 0.20

        ctx.beginPath();
        ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},${alpha})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      ctx.restore();

      // ── Continue or stop loop ──
      const hasWork = pendingRef.current.length > 0;
      const hasActive = edges.some((e) => e.active);
      const hasContent = particlesRef.current.length > 0 || ripplesRef.current.length > 0;

      if (hasWork || hasActive || hasContent) {
        cooldown = 0;
        animRef.current = requestAnimationFrame(tick);
      } else {
        cooldown++;
        if (cooldown < 60) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          runningRef.current = false;
          animRef.current = null;
        }
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [buildEdges, getColor, getViewport]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      runningRef.current = false;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    />
  );
}
