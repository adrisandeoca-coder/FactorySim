import { useState } from 'react';
import { useModelStore } from '../../stores/modelStore';

/**
 * Properties for the Warehouse element (engine: factorysim/engine/warehouse.py).
 *
 * Sections follow how a planner thinks about a warehouse: racks → equipment
 * → stock (SKUs) → inbound → orders. All times are in seconds, distances in
 * metres. Linking happens in the layout, not here: connect a warehouse in
 * front of a line (raw-material supply), after it (finished goods) or
 * between stations (WIP store).
 */

import { WAREHOUSE_DEFAULTS, type Dist, type Sku } from '../../utils/warehouseDefaults';

const DIST_PARAMS: Record<string, string[]> = {
  constant: ['value'],
  exponential: ['mean'],
  normal: ['mean', 'std'],
  triangular: ['min', 'mode', 'max'],
  uniform: ['min', 'max'],
};

function Section({ title, children, defaultOpen = true, hint }: { title: string; children: React.ReactNode; defaultOpen?: boolean; hint?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid var(--border, #d6dbe1)', paddingTop: 8, marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--t1, #0f172a)' }}
      >
        <span style={{ width: 10 }}>{open ? '▾' : '▸'}</span>{title}
      </button>
      {hint && open && <p style={{ fontSize: 11, color: 'var(--t3, #64748b)', margin: '4px 0 0 16px', lineHeight: 1.4 }}>{hint}</p>}
      {open && <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>{children}</div>}
    </div>
  );
}

function Num({ label, value, onChange, min = 0, step = 1, unit, id }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; unit?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="input-label">{label}{unit ? ` (${unit})` : ''}</label>
      <input
        id={id}
        type="number"
        className="input"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.max(min, v));
        }}
      />
    </div>
  );
}

function DistInput({ label, value, onChange, unit, id }: { label: string; value: Dist; onChange: (d: Dist) => void; unit?: string; id: string }) {
  const params = DIST_PARAMS[value.type] || ['value'];
  return (
    <div>
      <label htmlFor={`${id}-type`} className="input-label">{label}{unit ? ` (${unit})` : ''}</label>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(92px, 1fr) repeat(${params.length}, minmax(52px, 1fr))`, gap: 4 }}>
        <select
          id={`${id}-type`}
          className="input"
          value={value.type}
          onChange={(e) => {
            const type = e.target.value;
            const m = value.parameters.mean ?? value.parameters.value ?? value.parameters.mode ?? 1;
            const p: Record<string, number> =
              type === 'constant' ? { value: m }
              : type === 'exponential' ? { mean: m }
              : type === 'normal' ? { mean: m, std: Math.round(m * 0.1 * 100) / 100 }
              : type === 'triangular' ? { min: m * 0.5, mode: m, max: m * 1.5 }
              : { min: m * 0.5, max: m * 1.5 };
            onChange({ type, parameters: p });
          }}
        >
          <option value="constant">Fixed</option>
          <option value="exponential">Exponential</option>
          <option value="normal">Normal</option>
          <option value="triangular">Triangular</option>
          <option value="uniform">Uniform</option>
        </select>
        {params.map((p) => (
          <input
            key={p}
            aria-label={`${label} ${p}`}
            title={p}
            placeholder={p}
            type="number"
            className="input"
            value={value.parameters[p] ?? ''}
            min={0}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(v)) onChange({ type: value.type, parameters: { ...value.parameters, [p]: Math.max(0, v) } });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

type Shift = { start: string; end: string };
type Break = { start: string; minutes: number };

/** Working calendar for pickers and packers. Empty = always working. */
function Shifts({ pickers, onChange }: { pickers: { shifts?: Shift[]; breaks?: Break[] }; onChange: (p: { shifts?: Shift[]; breaks?: Break[] }) => void }) {
  const shifts = pickers.shifts || [];
  const breaks = pickers.breaks || [];
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: 4, alignItems: 'end' } as const;
  const del = { height: 30, border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 } as const;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="input-label" style={{ marginBottom: 0 }}>
        Shifts {shifts.length === 0 && <span style={{ fontWeight: 400, color: 'var(--t3, #64748b)' }}>— none, pickers work around the clock</span>}
      </div>
      {shifts.map((w, i) => (
        <div key={`s${i}`} style={row}>
          <div><label htmlFor={`wh-sh-${i}-a`} className="input-label">Start</label>
            <input id={`wh-sh-${i}-a`} type="time" className="input" value={w.start} onChange={(e) => onChange({ shifts: shifts.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)) })} /></div>
          <div><label htmlFor={`wh-sh-${i}-b`} className="input-label">End</label>
            <input id={`wh-sh-${i}-b`} type="time" className="input" value={w.end} onChange={(e) => onChange({ shifts: shifts.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)) })} /></div>
          <button type="button" aria-label="Remove shift" title="Remove shift" style={del} onClick={() => onChange({ shifts: shifts.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      {breaks.map((b, i) => (
        <div key={`b${i}`} style={row}>
          <div><label htmlFor={`wh-br-${i}-a`} className="input-label">Break at</label>
            <input id={`wh-br-${i}-a`} type="time" className="input" value={b.start} onChange={(e) => onChange({ breaks: breaks.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)) })} /></div>
          <Num id={`wh-br-${i}-m`} label="Minutes" value={b.minutes} min={1} onChange={(v) => onChange({ breaks: breaks.map((x, k) => (k === i ? { ...x, minutes: Math.round(v) } : x)) })} />
          <button type="button" aria-label="Remove break" title="Remove break" style={del} onClick={() => onChange({ breaks: breaks.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="ribbon-sbtn" onClick={() => {
          const last = shifts[shifts.length - 1];
          onChange({ shifts: [...shifts, last ? { start: last.end, end: last.end === '14:00' ? '22:00' : '06:00' } : { start: '06:00', end: '14:00' }] });
        }}>+ Shift</button>
        <button type="button" className="ribbon-sbtn" onClick={() => onChange({ breaks: [...breaks, { start: '10:00', minutes: 30 }] })}>+ Break</button>
      </div>
    </div>
  );
}

export function WarehouseProperties({ node, onChange }: { node: any; onChange: (key: string, value: unknown) => void }) {
  const products = useModelStore((s) => s.model.products);
  const D = WAREHOUSE_DEFAULTS;
  const layout = { ...D.layout, ...(node.layout || {}) };
  const forklifts = { ...D.forklifts, ...(node.forklifts || {}) };
  const cranes = { ...D.cranes, ...(node.cranes || {}) };
  const outbound = { ...D.outbound, ...(node.outbound || {}) };
  const asrs = node.storageType === 'asrs';
  const pickers = { ...D.pickers, ...(node.pickers || {}) };
  const inbound = { ...D.inbound, ...(node.inbound || {}) };
  const orders = { ...D.orders, ...(node.orders || {}) };
  const lineSupply = { ...D.lineSupply, ...(node.lineSupply || {}) };
  const store = { ...D.store, ...(node.store || {}) };
  const skus: Sku[] = node.skus || [];
  const locations = layout.aisles * 2 * layout.baysPerAisle * layout.levels * layout.palletsPerBay;

  const set = <T extends object>(key: string, base: T, patch: Partial<T>) => onChange(key, { ...base, ...patch });
  const setSku = (i: number, patch: Partial<Sku>) => onChange('skus', skus.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addSku = () => {
    const n = skus.length + 1;
    onChange('skus', [...skus, {
      id: `SKU-${Date.now().toString(36)}`, name: `SKU ${n}`, class: n <= 2 ? 'A' : n <= 5 ? 'B' : 'C',
      unitsPerPallet: 40, initialPallets: 4, reorderPoint: 2, orderQuantity: 6,
      leadTime: { type: 'constant', parameters: { value: 7200 } }, demandShare: 10,
    }]);
  };

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <p style={{ fontSize: 11, color: 'var(--t3, #64748b)', lineHeight: 1.45, margin: 0 }}>
        Connect it <b>before</b> a line to supply raw material, <b>after</b> a line to store finished goods, or
        <b> between</b> stations as a WIP store. On its own it runs as a distribution centre (enable inbound and orders).
      </p>

      <Section title="Racks" hint={asrs
        ? `${locations.toLocaleString()} pallet locations in a high-bay store. Each aisle has a stacker crane; pallets reach the pick stations by conveyor.`
        : `${locations.toLocaleString()} pallet locations. Level 0 is for pick faces, upper levels are reserve.`}>
        <div>
          <label htmlFor="wh-type" className="input-label">Storage type</label>
          <select id="wh-type" className="input" value={asrs ? 'asrs' : 'racks'} onChange={(e) => onChange('storageType', e.target.value)}>
            <option value="racks">Pallet racking with forklifts</option>
            <option value="asrs">Automated high-bay (AS/RS, stacker cranes)</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Num id="wh-aisles" label="Aisles" value={layout.aisles} min={1} onChange={(v) => set('layout', layout, { aisles: Math.round(v) })} />
          <Num id="wh-bays" label="Bays per aisle" value={layout.baysPerAisle} min={1} onChange={(v) => set('layout', layout, { baysPerAisle: Math.round(v) })} />
          <Num id="wh-levels" label="Levels" value={layout.levels} min={1} onChange={(v) => set('layout', layout, { levels: Math.round(v) })} />
          <Num id="wh-perbay" label="Pallets per bay" value={layout.palletsPerBay} min={1} onChange={(v) => set('layout', layout, { palletsPerBay: Math.round(v) })} />
          <Num id="wh-bayw" label="Bay width" unit="m" step={0.1} value={layout.bayWidth} min={0.5} onChange={(v) => set('layout', layout, { bayWidth: v })} />
          <Num id="wh-levelh" label="Level height" unit="m" step={0.1} value={layout.levelHeight} min={0.5} onChange={(v) => set('layout', layout, { levelHeight: v })} />
          <Num id="wh-aislew" label="Aisle width" unit="m" step={0.1} value={layout.aisleWidth} min={1} onChange={(v) => set('layout', layout, { aisleWidth: v })} />
          <Num id="wh-front" label="Dock to racks" unit="m" step={0.5} value={layout.frontClearance} min={0} onChange={(v) => set('layout', layout, { frontClearance: v })} />
        </div>
        <div>
          <label htmlFor="wh-slotting" className="input-label">Slotting (where pallets are put)</label>
          <select id="wh-slotting" className="input" value={node.slotting || 'closest'} disabled={asrs}
            title={asrs ? 'AS/RS spreads each SKU over the aisles, nearest location first' : undefined}
            onChange={(e) => onChange('slotting', e.target.value)}>
            <option value="closest">Closest free location</option>
            <option value="abc">ABC — fast movers nearest the dock</option>
            <option value="random">Random</option>
          </select>
        </div>
      </Section>

      {asrs ? (
        <Section title="Stacker cranes" hint={`${layout.aisles} crane${layout.aisles === 1 ? '' : 's'}, one per aisle. Travel and lift run at the same time (the slower one counts).`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Num id="wh-crs" label="Travel speed" unit="m/s" step={0.1} value={cranes.speed} min={0.1} onChange={(v) => set('cranes', cranes, { speed: v })} />
            <Num id="wh-crl" label="Lift speed" unit="m/s" step={0.1} value={cranes.liftSpeed} min={0.05} onChange={(v) => set('cranes', cranes, { liftSpeed: v })} />
            <Num id="wh-crh" label="Pick-up / set-down" unit="s" value={cranes.handlingTime} onChange={(v) => set('cranes', cranes, { handlingTime: v })} />
            <Num id="wh-crc" label="Conveyor speed" unit="m/s" step={0.1} value={cranes.conveyorSpeed} min={0.05} onChange={(v) => set('cranes', cranes, { conveyorSpeed: v })} />
          </div>
        </Section>
      ) : (
        <Section title="Forklifts">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Num id="wh-fl" label="Forklifts" value={forklifts.count} min={1} onChange={(v) => set('forklifts', forklifts, { count: Math.round(v) })} />
            <Num id="wh-fls" label="Speed" unit="m/s" step={0.1} value={forklifts.speed} min={0.1} onChange={(v) => set('forklifts', forklifts, { speed: v })} />
            <Num id="wh-fll" label="Lift speed" unit="m/s" step={0.05} value={forklifts.liftSpeed} min={0.05} onChange={(v) => set('forklifts', forklifts, { liftSpeed: v })} />
            <Num id="wh-flh" label="Pick-up / set-down" unit="s" value={forklifts.handlingTime} onChange={(v) => set('forklifts', forklifts, { handlingTime: v })} />
            <Num id="wh-flma" label="Max per aisle (0 = no limit)" value={forklifts.maxPerAisle ?? 0} onChange={(v) => set('forklifts', forklifts, { maxPerAisle: Math.round(v) })} />
          </div>
        </Section>
      )}

      <Section title={`Stock (SKUs) · ${skus.length}`} hint="Pallets are stored per SKU. Reorder point and order quantity are in pallets; −1 disables reordering. Linked products without a SKU get one automatically.">
        {skus.map((s, i) => (
          <div key={s.id} style={{ border: '1px solid var(--border, #d6dbe1)', borderRadius: 3, padding: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 24px', gap: 4, alignItems: 'end' }}>
              <div>
                <label htmlFor={`sku-${i}-name`} className="input-label">Name</label>
                <input id={`sku-${i}-name`} className="input" value={s.name} onChange={(e) => setSku(i, { name: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`sku-${i}-class`} className="input-label">Class</label>
                <select id={`sku-${i}-class`} className="input" value={s.class || 'B'} onChange={(e) => setSku(i, { class: e.target.value })}>
                  <option>A</option><option>B</option><option>C</option>
                </select>
              </div>
              <button type="button" aria-label={`Remove ${s.name}`} title="Remove SKU" onClick={() => onChange('skus', skus.filter((_, k) => k !== i))}
                style={{ height: 30, border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div>
              <label htmlFor={`sku-${i}-prod`} className="input-label">Linked product (for line supply / finished goods)</label>
              <select id={`sku-${i}-prod`} className="input" value={s.productId || ''} onChange={(e) => setSku(i, { productId: e.target.value || undefined })}>
                <option value="">— none (warehouse-only SKU) —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <Num id={`sku-${i}-upp`} label="Units / pallet" value={s.unitsPerPallet ?? 40} min={1} onChange={(v) => setSku(i, { unitsPerPallet: Math.round(v) })} />
              <Num id={`sku-${i}-init`} label="Start pallets" value={s.initialPallets ?? 0} onChange={(v) => setSku(i, { initialPallets: Math.round(v) })} />
              <Num id={`sku-${i}-share`} label="Demand share" value={s.demandShare ?? 1} onChange={(v) => setSku(i, { demandShare: v })} />
              <Num id={`sku-${i}-rop`} label="Reorder at" value={s.reorderPoint ?? -1} min={-1} onChange={(v) => setSku(i, { reorderPoint: Math.round(v) })} />
              <Num id={`sku-${i}-q`} label="Order qty" value={s.orderQuantity ?? 4} min={1} onChange={(v) => setSku(i, { orderQuantity: Math.round(v) })} />
              <Num id={`sku-${i}-lt`} label="Lead time (h)" step={0.5}
                value={Math.round(((s.leadTime?.parameters.value ?? s.leadTime?.parameters.mean ?? 7200) / 3600) * 10) / 10}
                onChange={(v) => setSku(i, { leadTime: { type: 'constant', parameters: { value: v * 3600 } } })} />
            </div>
          </div>
        ))}
        <button type="button" className="ribbon-sbtn" onClick={addSku} style={{ justifySelf: 'start' }}>+ Add SKU</button>
      </Section>

      <Section title="Inbound trucks" defaultOpen={!!inbound.enabled} hint="Scheduled deliveries, in addition to the reorder deliveries above.">
        <Toggle id="wh-in-on" label="Scheduled inbound trucks" checked={!!inbound.enabled} onChange={(v) => set('inbound', inbound, { enabled: v })} />
        <DistInput id="wh-in-iat" label="Time between trucks" unit="s" value={inbound.interarrival} onChange={(d) => set('inbound', inbound, { interarrival: d })} />
        <DistInput id="wh-in-ppt" label="Pallets per truck" value={inbound.palletsPerTruck} onChange={(d) => set('inbound', inbound, { palletsPerTruck: d })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <Num id="wh-doors" label="Dock doors" value={inbound.doors} min={1} onChange={(v) => set('inbound', inbound, { doors: Math.round(v) })} />
        </div>
        <DistInput id="wh-unload" label="Unload time per pallet" unit="s" value={inbound.unloadTimePerPallet} onChange={(d) => set('inbound', inbound, { unloadTimePerPallet: d })} />
        <Toggle id="wh-xdock" label="Cross-dock: pallets for SKUs with open orders go straight to picking" checked={!!node.crossDock} onChange={(v) => onChange('crossDock', v)} />
      </Section>

      <Section title="Customer orders & picking" defaultOpen={!!orders.enabled} hint={asrs
        ? 'Goods-to-person: cranes bring pallets to the pick stations, pickers pick, the pallet goes back.'
        : 'Pickers walk the aisles (S-shape route) and pick from level-0 pick faces; forklifts refill faces from reserve.'}>
        <Toggle id="wh-ord-on" label="Generate customer orders" checked={!!orders.enabled} onChange={(v) => set('orders', orders, { enabled: v })} />
        <DistInput id="wh-ord-iat" label="Time between orders" unit="s" value={orders.interarrival} onChange={(d) => set('orders', orders, { interarrival: d })} />
        <DistInput id="wh-ord-lines" label="Lines per order" value={orders.linesPerOrder} onChange={(d) => set('orders', orders, { linesPerOrder: d })} />
        <DistInput id="wh-ord-units" label="Units per line" value={orders.unitsPerLine} onChange={(d) => set('orders', orders, { unitsPerLine: d })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Num id="wh-pk" label="Pickers" value={pickers.count} min={1} onChange={(v) => set('pickers', pickers, { count: Math.round(v) })} />
          <Num id="wh-pkw" label="Walk speed" unit="m/s" step={0.1} value={pickers.walkSpeed} min={0.1} onChange={(v) => set('pickers', pickers, { walkSpeed: v })} />
          <Num id="wh-pkl" label="Time per line" unit="s" value={pickers.timePerLine} onChange={(v) => set('pickers', pickers, { timePerLine: v })} />
          <Num id="wh-pku" label="Time per unit" unit="s" step={0.5} value={pickers.timePerUnit} onChange={(v) => set('pickers', pickers, { timePerUnit: v })} />
          <Num id="wh-pks" label="Order setup" unit="s" value={pickers.setupTime} onChange={(v) => set('pickers', pickers, { setupTime: v })} />
          <Num id="wh-pack" label="Pack stations" value={orders.packStations} min={1} onChange={(v) => set('orders', orders, { packStations: Math.round(v) })} />
        </div>
        <DistInput id="wh-packt" label="Pack time per order" unit="s" value={orders.packTime} onChange={(d) => set('orders', orders, { packTime: d })} />
        <Num id="wh-dep" label="Outbound truck every (0 = ship at once)" unit="min" value={Math.round(orders.departureInterval / 60)} onChange={(v) => set('orders', orders, { departureInterval: v * 60 })} />
        {orders.departureInterval > 0 && (
          <DistInput id="wh-loadt" label="Truck loading time per order" unit="s" value={outbound.loadTimePerOrder} onChange={(d) => set('outbound', outbound, { loadTimePerOrder: d })} />
        )}
        <Shifts pickers={pickers} onChange={(patch) => set('pickers', pickers, patch)} />
      </Section>

      <Section title="Line links" defaultOpen={false} hint="Used when the warehouse is connected to stations.">
        <Num id="wh-calloff" label="Call off next pallet when line-side stock is below" unit="% of pallet" value={Math.round(lineSupply.callOffShare * 100)}
          onChange={(v) => set('lineSupply', lineSupply, { callOffShare: Math.min(100, v) / 100 })} />
        <DistInput id="wh-dwell" label="WIP store: dwell time" unit="s" value={store.dwellTime} onChange={(d) => set('store', store, { dwellTime: d })} />
      </Section>
    </div>
  );
}
