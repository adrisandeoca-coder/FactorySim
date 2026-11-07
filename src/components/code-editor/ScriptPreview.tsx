import { useEffect, useMemo, useRef, useState } from 'react';
import type { FactoryModel, DistributionConfig } from '../../types';
import { t } from '../../i18n';

const W = 150;
const H = 54;

const KIND_COLOR: Record<string, string> = {
  station: 'var(--color-station, #2563EB)',
  buffer: 'var(--color-buffer, #D97706)',
  source: 'var(--color-source, #16A34A)',
  sink: 'var(--color-sink, #475569)',
  conveyor: 'var(--color-conveyor, #0891B2)',
  operator: '#7C3AED',
  humanoid: '#7C3AED',
};

function distMean(d?: DistributionConfig): number | null {
  if (!d) return null;
  const p = d.parameters as Record<string, number>;
  switch (d.type) {
    case 'constant': return p.value;
    case 'normal': case 'exponential': return p.mean;
    case 'triangular': return (p.min + p.mode + p.max) / 3;
    case 'uniform': return (p.min + p.max) / 2;
    default: return null;
  }
}

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

interface PNode { id: string; name: string; kind: string; x: number; y: number; detail: string }

export function ScriptPreview({ model, onPick, dimmed }: {
  model: FactoryModel;
  onPick?: (name: string) => void;
  dimmed?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, byId, box } = useMemo(() => {
    const list: PNode[] = [];
    for (const s of model.stations) {
      const m = distMean(s.cycleTime);
      list.push({ id: s.id, name: s.name, kind: 'station', x: s.position.x, y: s.position.y,
        detail: m != null ? `${fmt(m)} s${s.mtbf ? ` · MTBF ${fmt(s.mtbf)} h` : ''}` : t('station') });
    }
    for (const b of model.buffers) {
      list.push({ id: b.id, name: b.name, kind: 'buffer', x: b.position.x, y: b.position.y, detail: `${t('cap.')} ${b.capacity}` });
    }
    for (const n of model.extraNodes) {
      const d = n.data as unknown as Record<string, unknown>;
      let detail: string = n.type;
      if (n.type === 'source' && typeof d.arrivalRate === 'number') detail = `${t('every')} ${fmt(d.arrivalRate)} s`;
      else if ((n.type === 'operator' || n.type === 'humanoid') && typeof d.count === 'number') detail = `× ${d.count}`;
      else if (typeof d.cycleTime === 'number') detail = `${n.type} · ${fmt(d.cycleTime)} s`;
      list.push({ id: n.id, name: String(d.name ?? n.id), kind: n.type, x: n.position.x, y: n.position.y, detail });
    }
    const map = new Map(list.map(n => [n.id, n]));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of list) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + W); y1 = Math.max(y1, n.y + H);
    }
    if (!list.length) { x0 = 0; y0 = 0; x1 = 400; y1 = 200; }
    const pad = 30;
    return { nodes: list, byId: map, box: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } };
  }, [model]);

  const kindOf = (id: string) => byId.get(id)?.kind;

  // pan (drag) and zoom (wheel); double-click fits the model again
  const [view, setView] = useState(box);
  const boxKey = `${box.x}|${box.y}|${box.w}|${box.h}`;
  const lastKey = useRef('');
  useEffect(() => {
    if (lastKey.current !== boxKey) { lastKey.current = boxKey; setView(box); }
  }, [boxKey, box]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const toModel = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.max(view.w / r.width, view.h / r.height);
    const ox = view.x - (r.width * scale - view.w) / 2;
    const oy = view.y - (r.height * scale - view.h) / 2;
    return { x: ox + (e.clientX - r.left) * scale, y: oy + (e.clientY - r.top) * scale, scale };
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toModel(e);
      const f = Math.exp(e.deltaY * 0.0015);
      setView(v => {
        const w = Math.min(Math.max(v.w * f, box.w / 8), box.w * 3);
        const k = w / v.w;
        return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w, h: v.h * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const zoomed = Math.abs(view.w - box.w) > 1 || Math.abs(view.x - box.x) > 1 || Math.abs(view.y - box.y) > 1;

  return (
    <div className="w-full h-full relative">
    <svg
      ref={svgRef}
      className="w-full h-full block select-none"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d || e.buttons !== 1) return;
        const { scale } = toModel(e);
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
        if (d.moved) setView(v => ({ ...v, x: d.vx - (e.clientX - d.x) * scale, y: d.vy - (e.clientY - d.y) * scale }));
      }}
      onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
      onDoubleClick={() => setView(box)}
      preserveAspectRatio="xMidYMid meet"
      style={{ opacity: dimmed ? 0.45 : 1, fontFamily: 'IBM Plex Sans, sans-serif' }}
      role="img"
      aria-label={t('Model preview')}
    >
      <defs>
        <pattern id="sp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#EEF1F5" strokeWidth="1" />
        </pattern>
        <marker id="sp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
        </marker>
      </defs>
      <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#sp-grid)" />

      {model.connections.map(c => {
        const a = byId.get(c.source), b = byId.get(c.target);
        if (!a || !b) return null;
        const isOp = kindOf(c.source) === 'operator' || kindOf(c.source) === 'humanoid';
        const sx = a.x + W, sy = a.y + H / 2, tx = b.x, ty = b.y + H / 2;
        const back = tx < sx;
        const dx = Math.max(40, Math.abs(tx - sx) / 2);
        const d = isOp
          ? `M ${a.x + W / 2} ${a.y + H} L ${b.x + W / 2} ${b.y}`
          : back
            ? `M ${sx} ${sy} C ${sx + 60} ${sy + 90}, ${tx - 60} ${ty + 90}, ${tx} ${ty}`
            : `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
        const mode = c.transport ?? 'auto';
        const dash = isOp ? '2 4' : mode === 'manual' ? '5 4' : mode === 'forklift' || mode === 'agv' ? '10 5' : undefined;
        const hot = hover === c.source || hover === c.target;
        const label = mode === 'manual' ? t('by hand') : mode === 'forklift' ? t('forklift') : mode === 'agv' ? 'AGV'
          : mode === 'direct' ? t('direct') : c.probability != null ? `${Math.round(c.probability * 100)} %` : null;
        return (
          <g key={c.id}>
            <path d={d} fill="none" stroke={hot ? 'var(--blue, #2563EB)' : isOp ? '#A78BFA' : '#94A3B8'}
              strokeWidth={hot ? 2 : 1.4} strokeDasharray={dash} markerEnd={isOp ? undefined : 'url(#sp-arrow)'} />
            {label && !isOp && (
              <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 5} fontSize="10" fill="#475569" textAnchor="middle">{label}</text>
            )}
          </g>
        );
      })}

      {nodes.map(n => {
        const col = KIND_COLOR[n.kind] ?? '#64748B';
        const hot = hover === n.id;
        const name = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name;
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`} style={{ cursor: onPick ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
            onClick={() => { if (!drag.current?.moved) onPick?.(n.name); }}>
            <title>{`${n.name} (${n.kind})`}</title>
            <rect width={W} height={H} rx="2" fill="#fff" stroke={hot ? 'var(--blue, #2563EB)' : '#C5CCD6'} strokeWidth={hot ? 2 : 1} />
            <rect width="4" height={H} fill={col} />
            <text x="12" y="22" fontSize="12.5" fontWeight="600" fill="#0B1220">{name}</text>
            <text x="12" y="40" fontSize="10.5" fill="#64748B">{n.detail}</text>
          </g>
        );
      })}
    </svg>
    <div className="absolute right-2 top-2 flex gap-1">
      <button className="w-6 h-6 text-[13px] bg-white border border-[var(--chrome-border)] rounded-sm text-[#334155]" title={t('Zoom in')}
        onClick={() => setView(v => ({ x: v.x + v.w * 0.15, y: v.y + v.h * 0.15, w: v.w * 0.7, h: v.h * 0.7 }))}>+</button>
      <button className="w-6 h-6 text-[13px] bg-white border border-[var(--chrome-border)] rounded-sm text-[#334155]" title={t('Zoom out')}
        onClick={() => setView(v => ({ x: v.x - v.w * 0.2, y: v.y - v.h * 0.2, w: v.w * 1.4, h: v.h * 1.4 }))}>−</button>
      {zoomed && (
        <button className="h-6 px-2 text-[11px] bg-white border border-[var(--chrome-border)] rounded-sm text-[#334155]" onClick={() => setView(box)}>{t('Fit')}</button>
      )}
    </div>
    </div>
  );
}
