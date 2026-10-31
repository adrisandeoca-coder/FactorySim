import type { KPIData, FactoryModel } from '../../types';
import { formatDuration } from '../../stores/simulationStore';
import { t, useT } from '../../i18n';
import React from 'react';

/** Translated sentence with bold values: placeholders {x} are filled with <b> parts. */
function Rich({ text, vars }: { text: string; vars: Record<string, React.ReactNode> }) {
  const parts = t(text).split(/\{(\w+)\}/);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} style={{ fontWeight: 600 }}>{vars[p]}</b> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

/**
 * Plain-language summary of a simulation run, written for production
 * engineers and supervisors rather than simulation specialists.
 *
 * Every statement is derived directly from the KPIs; the "what to try"
 * lines are standard line-balancing rules of thumb (raise capacity at the
 * constraint, add buffer after a blocked station, cut downtime), not
 * optimisation results.
 */
interface ResultsSummaryProps {
  kpis: KPIData;
  model: FactoryModel;
  durationSeconds: number;
  onStationClick?: (stationId: string) => void;
}

type Finding = {
  tone: 'bad' | 'warn' | 'good' | 'info';
  title: string;
  body: string;
  stationId?: string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function hoursLabel(seconds: number): string {
  const h = seconds / 3600;
  if (h >= 24 * 7 - 0.01 && h % (24 * 7) === 0) return t(h === 168 ? '{n} week' : '{n} weeks', { n: h / (24 * 7) });
  return t(h === 1 ? '{n} hour' : '{n} hours', { n: Number.isInteger(h) ? h : h.toFixed(1) });
}

export function ResultsSummary({ kpis, model, durationSeconds, onStationClick }: ResultsSummaryProps) {
  useT();
  const nameOf = (id: string) => model.stations.find((s) => s.id === id)?.name || id;
  const stations = Object.entries(kpis.utilization.byStation || {})
    .filter(([id]) => model.stations.some((s) => s.id === id));

  const findings: Finding[] = [];

  if (stations.length > 0) {
    // 1. Constraint: the busiest station sets the pace of the line.
    const [bnId, bn] = stations.reduce((a, b) => ((b[1].busy || 0) > (a[1].busy || 0) ? b : a));
    const busy = bn.busy || 0;
    if (busy >= 0.75) {
      findings.push({
        tone: busy >= 0.9 ? 'bad' : 'warn',
        title: t('{name} is the bottleneck', { name: nameOf(bnId) }),
        body: t('It is working {p} of the time and sets the pace of the whole line. A shorter cycle time or extra capacity here raises output; improving other stations will not.', { p: pct(busy) }),
        stationId: bnId,
      });
    } else {
      findings.push({
        tone: 'info',
        title: t('No station is overloaded'),
        body: t('The busiest station ({name}) works {p} of the time. Output is limited by how fast parts arrive, not by machine capacity.', { name: nameOf(bnId), p: pct(busy) }),
        stationId: bnId,
      });
    }

    // 2. Biggest avoidable loss: blocking (no space downstream) or breakdowns.
    const [blkId, blk] = stations.reduce((a, b) => ((b[1].blocked || 0) > (a[1].blocked || 0) ? b : a));
    const [failId, fail] = stations.reduce((a, b) => ((b[1].failed || 0) > (a[1].failed || 0) ? b : a));
    if ((fail.failed || 0) >= 0.05 && (fail.failed || 0) >= (blk.blocked || 0)) {
      findings.push({
        tone: 'warn',
        title: t('{name} loses {p} to breakdowns', { name: nameOf(failId), p: pct(fail.failed || 0) }),
        body: t('Shorter repair times or preventive maintenance here recover capacity directly.'),
        stationId: failId,
      });
    } else if ((blk.blocked || 0) >= 0.05) {
      findings.push({
        tone: 'warn',
        title: t('{name} is blocked {p} of the time', { name: nameOf(blkId), p: pct(blk.blocked || 0) }),
        body: t('It has finished parts but nowhere to put them. A larger buffer after it, or a faster next step, frees this time.'),
        stationId: blkId,
      });
    } else {
      findings.push({
        tone: 'good',
        title: t('Parts flow without blocking'),
        body: t('No station spends more than 5% of the time waiting for space downstream.'),
      });
    }
  }

  // Warehouse-only model (distribution centre): describe orders instead of parts
  const whList = Object.values((kpis.warehouses || {}) as Record<string, any>);
  const warehouseOnly = model.stations.length === 0 && whList.length > 0;
  if (warehouseOnly) {
    const g = (o: any, a: string, b: string) => o?.[a] ?? o?.[b];
    for (const w of whList) {
      const asrs = g(w, 'storageType', 'storage_type') === 'asrs';
      // AS/RS: a crane serves only its own aisle, so the busiest crane is the limit
      const byAisle: number[] = g(w.cranes, 'byAisle', 'by_aisle') || [];
      const fl = asrs ? Math.max(0, ...byAisle) : g(w.forklifts, 'utilization', 'utilization') ?? 0;
      const pk = g(w.pickers, 'utilization', 'utilization') ?? 0;
      const fr = g(w.orders, 'fillRate', 'fill_rate');
      const equip = asrs ? t('stacker cranes') : t('forklifts');
      const busiest = fl >= pk ? { what: equip, u: fl } : { what: t('pickers'), u: pk };
      const isPickers = busiest.u === pk && pk > fl;
      const remedy = asrs
        ? (isPickers ? t('More pickers or pick stations raise capacity.') : t('More aisles (cranes), faster cranes or fewer levels raise capacity.'))
        : t('More {what} or shorter travel (ABC slotting, fewer aisles) raises capacity.', { what: busiest.what });
      findings.push(busiest.u >= 0.8
        ? { tone: busiest.u >= 0.9 ? 'bad' : 'warn', title: t('The {what} are the constraint', { what: busiest.what }),
            body: (asrs && !isPickers ? t('The busiest crane is busy {p} of the time.', { p: pct(busiest.u) }) : t('They are busy {p} of the time.', { p: pct(busiest.u) })) + ' ' + remedy }
        : { tone: 'info', title: t('Handling capacity is sufficient'), body: asrs
          ? t('The busiest stacker crane is busy {a} and pickers {b} of the time.', { a: pct(fl), b: pct(pk) })
          : t('Forklifts are busy {a} and pickers {b} of the time.', { a: pct(fl), b: pct(pk) }) });
      if (fr != null) {
        findings.push(fr >= 0.95
          ? { tone: 'good', title: t('{p} of order lines were in stock', { p: pct(fr) }), body: t('Reorder points cover demand during the lead time.') }
          : { tone: fr < 0.85 ? 'bad' : 'warn', title: t('Only {p} of order lines were in stock', { p: pct(fr) }), body: t('Raise reorder points for the SKUs that run out (see the SKU table), or shorten lead times.') });
      }
    }
  }

  const warnings = kpis.warnings?.length || 0;
  const rate = kpis.throughput.ratePerHour || 0;

  const toneStyle: Record<Finding['tone'], { dot: string; bg: string }> = {
    bad: { dot: 'var(--red)', bg: 'var(--red-bg)' },
    warn: { dot: 'var(--amber)', bg: 'var(--amber-bg)' },
    good: { dot: 'var(--green)', bg: 'var(--green-bg)' },
    info: { dot: 'var(--blue)', bg: 'var(--blue-bg)' },
  };

  return (
    <section
      aria-label={t('Results summary')}
      className="dock-panel"
    >
      <div className="dock-panel-title">{t('Results summary')}</div>
      <div style={{ padding: '14px 16px' }}>
      {warehouseOnly ? (() => {
        const o = whList.reduce((acc: any, w: any) => {
          const od = w.orders || {};
          acc.shipped += od.shipped || 0;
          acc.cycle = Math.max(acc.cycle, od.cycleTimeMean ?? od.cycle_time_mean ?? 0);
          return acc;
        }, { shipped: 0, cycle: 0 });
        return (
          <p style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--t1)', margin: 0, maxWidth: 900 }}>
            <Rich text="Your warehouse shipped {orders} in {time} — about {rate}." vars={{
              orders: t('{n} orders', { n: o.shipped.toLocaleString() }), time: hoursLabel(durationSeconds),
              rate: t('{n} per hour', { n: (o.shipped / (durationSeconds / 3600)).toFixed(0) }) }} />
            {o.cycle > 0 && <>{' '}<Rich text="An order takes {time} on average from arrival to shipping." vars={{ time: formatDuration(o.cycle) }} /></>}
          </p>
        );
      })() : (
      <p style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--t1)', margin: 0, maxWidth: 900 }}>
        <Rich text="Your line produced {parts} in {time} — about {rate}." vars={{
          parts: t('{n} parts', { n: kpis.throughput.total.toLocaleString() }), time: hoursLabel(durationSeconds),
          rate: t('{n} per hour', { n: rate.toFixed(rate >= 10 ? 0 : 1) }) }} />
        {kpis.cycleTime.mean > 0 && (
          <>{' '}<Rich text="A part takes {time} on average from start to finish." vars={{ time: formatDuration(kpis.cycleTime.mean) }} /></>
        )}
      </p>
      )}

      {findings.length > 0 && (
        <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {findings.map((f) => (
            <div key={f.title} style={{ background: toneStyle[f.tone].bg, borderRadius: 2, borderLeft: `3px solid ${toneStyle[f.tone].dot}`, padding: '10px 12px', display: 'flex', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: toneStyle[f.tone].dot, marginTop: 6, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2, lineHeight: 1.45 }}>{f.body}</div>
                {f.stationId && onStationClick && (
                  <button
                    type="button"
                    onClick={() => onStationClick(f.stationId!)}
                    style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {t('Open {name} in the builder →', { name: nameOf(f.stationId) })}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {warnings > 0 && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 12, marginBottom: 0, fontWeight: 600 }}>
          {t(warnings === 1 ? '{n} model check needs your attention — see below.' : '{n} model checks need your attention — see below.', { n: warnings })}
        </p>
      )}
      </div>
    </section>
  );
}
