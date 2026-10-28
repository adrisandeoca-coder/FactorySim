import { useMemo, useState } from 'react';
import { PRODUCT_PALETTE } from '../../utils/productColors';

/**
 * Results of Warehouse elements (engine/warehouse.py → kpis.warehouses).
 *
 * Per warehouse: headline tiles for the questions planners ask (is storage
 * big enough, are forklifts/pickers the constraint, are orders on time, does
 * the line run out), inventory over time per SKU, rack occupancy over time
 * (separate chart: different unit), and a SKU table (also the accessible
 * view of the chart).
 *
 * The Electron bridge camelCases keys; the preview bridge may not. `n()`
 * reads either spelling.
 */

type Any = Record<string, any>;

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
function norm(o: any): any {
  if (Array.isArray(o)) return o.map(norm);
  if (o && typeof o === 'object') {
    const r: Any = {};
    for (const [k, v] of Object.entries(o)) r[camel(k)] = norm(v);
    return r;
  }
  return o;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtTime = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--red, #dc2626)' : tone === 'warn' ? 'var(--amber, #b45309)' : 'var(--t1, #0f172a)';
  return (
    <div style={{ border: '1px solid var(--border, #d6dbe1)', borderRadius: 3, padding: '10px 12px', background: 'var(--surface, #fff)' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--t3, #64748b)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--t2, #475569)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/** Single-axis line chart with crosshair tooltip. */
function LineChart({ title, series, x, unit, height = 180, ariaLabel }: {
  title: string; series: { name: string; color: string; values: number[] }[]; x: number[]; unit: string; height?: number; ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 44, R = 12, T = 10, B = 24;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = (() => { const p = Math.pow(10, Math.floor(Math.log10(maxY))); return Math.ceil(maxY / p) * p; })();
  const tMax = x[x.length - 1] || 1;
  const px = (t: number) => L + (t / tMax) * (W - L - R);
  const py = (v: number) => T + (1 - v / niceMax) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const hoursMax = tMax / 3600;
  // Whole-hour ticks, at most ~9 of them
  const stepH = Math.max(1, Math.ceil(hoursMax / 8));
  const xTicks: number[] = [];
  for (let h = 0; h <= hoursMax + 0.05; h += stepH) xTicks.push(h * 3600);
  const direct = series.length <= 4;

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1, #0f172a)', marginBottom: 4 }}>{title}</figcaption>
      {series.length >= 2 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: 'var(--t2, #475569)', marginBottom: 4 }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 2, background: s.color, borderRadius: 1 }} />{s.name}
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const t = ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * tMax;
            let best = 0;
            x.forEach((xi, i) => { if (Math.abs(xi - t) < Math.abs(x[best] - t)) best = i; });
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke="var(--grid, #e5e9ee)" strokeWidth={1} />
              <text x={L - 6} y={py(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--t3, #64748b)">{Math.round(v).toLocaleString()}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={px(t)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--t3, #64748b)">{Math.round(t / 3600)}h</text>
          ))}
          {series.map((s) => (
            <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${px(x[i])},${py(v)}`).join(' ')} />
          ))}
          {direct && series.length >= 2 && series.map((s) => {
            const last = s.values[s.values.length - 1] ?? 0;
            return <text key={`l-${s.name}`} x={W - R + 2} y={py(last) + 3.5} fontSize={10} fill="var(--t2, #475569)">{s.name}</text>;
          })}
          {hover != null && (
            <g>
              <line x1={px(x[hover])} x2={px(x[hover])} y1={T} y2={H - B} stroke="var(--t3, #94a3b8)" strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.name} cx={px(x[hover])} cy={py(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="var(--surface, #fff)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <div role="tooltip" style={{
            position: 'absolute', top: 4, left: `${Math.min(70, (px(x[hover]) / W) * 100 + 2)}%`, pointerEvents: 'none',
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #d6dbe1)', borderRadius: 3, padding: '6px 8px', fontSize: 11.5,
            boxShadow: '0 2px 6px rgba(15,23,42,0.12)', color: 'var(--t1, #0f172a)', minWidth: 120,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{fmtTime(x[hover])}</div>
            {series.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ color: 'var(--t2, #475569)' }}>{s.name}</span>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{(s.values[hover] ?? 0).toLocaleString()} {unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

function OneWarehouse({ wh, name, compact = false }: { wh: Any; name: string; compact?: boolean }) {
  const o = wh.orders || {};
  const st = wh.storage || {};
  const fl = wh.forklifts || {};
  const pk = wh.pickers || {};
  const ls = wh.lineSupply || {};
  const fg = wh.finishedGoods || {};
  const docks = wh.docks || {};
  const asrs = wh.storageType === 'asrs';
  const cr = wh.cranes || {};
  const cg = wh.congestion || {};
  const sh = wh.shifts || {};
  const xd = wh.crossDock || {};
  const bo = wh.backorders || {};
  const moves = Object.values(fl.tasks || {}).reduce((a: number, b: any) => a + Number(b), 0);
  const skus: Any[] = wh.skus || [];
  const series: Any[] = wh.series || [];
  const hasOrders = (o.created || 0) > 0;
  const hasSupply = (ls.parts || 0) > 0;
  const hasFg = (fg.units || 0) > 0;
  const roles = [hasSupply && 'Raw-material supply', hasFg && 'Finished-goods store', hasOrders && 'Order picking',
    (wh.wipStore?.items || 0) > 0 && 'WIP store'].filter(Boolean) as string[];

  const chart = useMemo(() => {
    const x = series.map((p) => p.t);
    const ids: string[] = series.length ? (series[0].sku || []).map((s: Any) => s.id) : [];
    const nameOf = (id: string) => skus.find((s) => s.id === id)?.name || id;
    const skuSeries = ids.slice(0, 8).map((id, i) => ({
      name: nameOf(id),
      color: PRODUCT_PALETTE[i % PRODUCT_PALETTE.length],
      values: series.map((p) => (p.sku || []).find((s: Any) => s.id === id)?.units ?? 0),
    }));
    return { x, skuSeries, occ: [{ name: 'Occupied locations', color: PRODUCT_PALETTE[1], values: series.map((p) => p.occupied) }] };
  }, [series, skus]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1, #0f172a)' }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--t3, #64748b)' }}>
          {wh.layout ? `${wh.layout.aisles} aisles · ${wh.layout.levels} levels · ${Number(wh.layout.locations).toLocaleString()} pallet locations` : ''}
          {roles.length ? ` · ${roles.join(', ')}` : ''}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Tile label="Rack utilisation" value={pct(st.avgUtilization)} sub={`peak ${pct(st.maxUtilization)}${st.fullWaits ? ` · full ${st.fullWaits}×` : ''}`}
          tone={st.fullWaits ? 'bad' : st.maxUtilization > 0.9 ? 'warn' : undefined} />
        {asrs ? (() => {
          const peak = Math.max(0, ...(cr.byAisle || []));
          return <Tile label="Cranes busy" value={pct(cr.utilization)} sub={`${cr.count} cranes · busiest aisle ${pct(peak)} · ${moves} moves`}
            tone={peak > 0.9 ? 'bad' : peak > 0.8 ? 'warn' : undefined} />;
        })() : (
          <Tile label="Forklifts busy" value={pct(fl.utilization)} sub={`${fl.count} forklifts · ${moves} moves`}
            tone={fl.utilization > 0.9 ? 'bad' : fl.utilization > 0.8 ? 'warn' : undefined} />
        )}
        {!asrs && cg.maxPerAisle > 0 && (
          <Tile label="Aisle congestion" value={cg.waits ? fmtTime(cg.avgWait || 0) : 'none'}
            sub={cg.waits ? `${cg.waits} waits at aisle entry (max ${cg.maxPerAisle}/aisle)` : `max ${cg.maxPerAisle} forklift${cg.maxPerAisle === 1 ? '' : 's'} per aisle`}
            tone={cg.avgWait > 30 ? 'warn' : undefined} />
        )}
        {hasOrders && <>
          <Tile label="Orders shipped" value={Number(o.shipped).toLocaleString()} sub={`${o.ordersPerHour}/h · ${o.openEnd} open at end`} />
          <Tile label="Order cycle time" value={fmtTime(o.cycleTimeMean || 0)} sub={`95% within ${fmtTime(o.cycleTimeP95 || 0)}`} />
          <Tile label="Fill rate" value={pct(o.fillRate)} sub="lines in stock on arrival" tone={o.fillRate != null && o.fillRate < 0.95 ? (o.fillRate < 0.85 ? 'bad' : 'warn') : undefined} />
          <Tile label="Pickers busy" value={pct(pk.utilization)} sub={`${pk.count} pickers · ${fmtTime(pk.avgPickTime || 0)}/order`} tone={pk.utilization > 0.9 ? 'bad' : pk.utilization > 0.8 ? 'warn' : undefined} />
        </>}
        {hasSupply && <Tile label="Line supplied" value={Number(ls.parts).toLocaleString()} sub={ls.starvedParts > 1 ? `line waited ${ls.starvedParts}× (avg ${fmtTime(ls.avgWait)})` : 'line never waited'} tone={ls.starvedParts > 1 ? 'warn' : undefined} />}
        {hasFg && <Tile label="Finished goods in" value={Number(fg.units).toLocaleString()} sub="units from the line" />}
        {docks.trucks > 0 && <Tile label="Trucks received" value={String(docks.trucks)} sub={`doors busy ${pct(docks.utilization)} · wait ${fmtTime(docks.avgDoorWait || 0)}`} />}
        {docks.outboundTrucks > 0 && <Tile label="Trucks dispatched" value={String(docks.outboundTrucks)} sub={`${docks.ordersPerOutboundTruck} orders per truck`} />}
        {xd.enabled && (xd.pallets > 0 || docks.trucks > 0) && <Tile label="Cross-docked" value={`${xd.pallets} pallets`} sub={`${Number(xd.units).toLocaleString()} units picked at the dock`} />}
        {hasOrders && bo.lines > 0 && <Tile label="Backordered lines" value={String(bo.lines)} sub={`waited ${fmtTime(bo.avgWait || 0)} on average`} tone={o.fillRate < 0.85 ? 'bad' : 'warn'} />}
        {sh.calendar && <Tile label="Off-shift waits" value={fmtTime(sh.totalWait || 0)} sub={`${sh.waits} picks/packs waited for the shift`} />}
      </div>

      {!compact && chart.x.length > 1 && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {chart.skuSeries.length > 0 && (
            <LineChart title="Stock on hand per SKU (units)" series={chart.skuSeries} x={chart.x} unit="units"
              ariaLabel={`Stock on hand over time for ${chart.skuSeries.map((s) => s.name).join(', ')}`} />
          )}
          <LineChart title="Occupied rack locations" series={chart.occ} x={chart.x} unit="pallets"
            ariaLabel="Occupied rack locations over time" />
        </div>
      )}

      {!compact && skus.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'right', color: 'var(--t3, #64748b)' }}>
                {['SKU', 'Class', 'Pallets at end', 'Avg units', 'Picked', 'To line', 'Received', 'From line', 'Out of stock'].map((h, i) => (
                  <th key={h} style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid var(--border, #d6dbe1)', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <tr key={s.id} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <td style={{ padding: '4px 8px', textAlign: 'left' }}>{s.name}</td>
                  <td style={{ padding: '4px 8px' }}>{s.class}</td>
                  <td style={{ padding: '4px 8px' }}>{s.palletsEnd}</td>
                  <td style={{ padding: '4px 8px' }}>{Number(s.avgUnits).toLocaleString()}</td>
                  <td style={{ padding: '4px 8px' }}>{Number(s.unitsPicked).toLocaleString()}</td>
                  <td style={{ padding: '4px 8px' }}>{Number(s.unitsSupplied).toLocaleString()}</td>
                  <td style={{ padding: '4px 8px' }}>{s.palletsReceived}</td>
                  <td style={{ padding: '4px 8px' }}>{s.palletsFromProduction}</td>
                  <td style={{ padding: '4px 8px', color: s.stockoutShare > 0.05 ? 'var(--red, #dc2626)' : undefined }}>{pct(s.stockoutShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WarehouseResults({ warehouses, names, compact = false }: { warehouses: Record<string, unknown>; names: Record<string, string>; compact?: boolean }) {
  const list = Object.entries(warehouses).map(([id, w]) => [id, norm(w)] as const);
  if (list.length === 0) return null;
  return (
    <section aria-label="Warehouse results" className="dock-panel">
      <div className="dock-panel-title">Warehouse{list.length > 1 ? 's' : ''}</div>
      <div style={{ padding: '14px 16px', display: 'grid', gap: 24 }}>
        {list.map(([id, w]) => <OneWarehouse key={id} wh={w} compact={compact} name={names[id] || (w as Any).name || id} />)}
      </div>
    </section>
  );
}
