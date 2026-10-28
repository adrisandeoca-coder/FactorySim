import type { KPIData, FactoryModel } from '../../types';
import { formatDuration } from '../../stores/simulationStore';

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
  if (h >= 24 * 7 - 0.01 && h % (24 * 7) === 0) return `${h / (24 * 7)} week${h === 168 ? '' : 's'}`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
}

export function ResultsSummary({ kpis, model, durationSeconds, onStationClick }: ResultsSummaryProps) {
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
        title: `${nameOf(bnId)} is the bottleneck`,
        body: `It is working ${pct(busy)} of the time and sets the pace of the whole line. A shorter cycle time or extra capacity here raises output; improving other stations will not.`,
        stationId: bnId,
      });
    } else {
      findings.push({
        tone: 'info',
        title: 'No station is overloaded',
        body: `The busiest station (${nameOf(bnId)}) works ${pct(busy)} of the time. Output is limited by how fast parts arrive, not by machine capacity.`,
        stationId: bnId,
      });
    }

    // 2. Biggest avoidable loss: blocking (no space downstream) or breakdowns.
    const [blkId, blk] = stations.reduce((a, b) => ((b[1].blocked || 0) > (a[1].blocked || 0) ? b : a));
    const [failId, fail] = stations.reduce((a, b) => ((b[1].failed || 0) > (a[1].failed || 0) ? b : a));
    if ((fail.failed || 0) >= 0.05 && (fail.failed || 0) >= (blk.blocked || 0)) {
      findings.push({
        tone: 'warn',
        title: `${nameOf(failId)} loses ${pct(fail.failed || 0)} to breakdowns`,
        body: 'Shorter repair times or preventive maintenance here recover capacity directly.',
        stationId: failId,
      });
    } else if ((blk.blocked || 0) >= 0.05) {
      findings.push({
        tone: 'warn',
        title: `${nameOf(blkId)} is blocked ${pct(blk.blocked || 0)} of the time`,
        body: 'It has finished parts but nowhere to put them. A larger buffer after it, or a faster next step, frees this time.',
        stationId: blkId,
      });
    } else {
      findings.push({
        tone: 'good',
        title: 'Parts flow without blocking',
        body: 'No station spends more than 5% of the time waiting for space downstream.',
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
      const equip = asrs ? 'stacker cranes' : 'forklifts';
      const busiest = fl >= pk ? { what: equip, u: fl } : { what: 'pickers', u: pk };
      const remedy = asrs
        ? (busiest.what === 'pickers' ? 'More pickers or pick stations raise capacity.' : 'More aisles (cranes), faster cranes or fewer levels raise capacity.')
        : `More ${busiest.what} or shorter travel (ABC slotting, fewer aisles) raises capacity.`;
      findings.push(busiest.u >= 0.8
        ? { tone: busiest.u >= 0.9 ? 'bad' : 'warn', title: `The ${busiest.what} are the constraint`, body: `${asrs && busiest.what !== 'pickers' ? 'The busiest crane is' : 'They are'} busy ${pct(busiest.u)} of the time. ${remedy}` }
        : { tone: 'info', title: 'Handling capacity is sufficient', body: asrs
          ? `The busiest stacker crane is busy ${pct(fl)} and pickers ${pct(pk)} of the time.`
          : `Forklifts are busy ${pct(fl)} and pickers ${pct(pk)} of the time.` });
      if (fr != null) {
        findings.push(fr >= 0.95
          ? { tone: 'good', title: `${pct(fr)} of order lines were in stock`, body: 'Reorder points cover demand during the lead time.' }
          : { tone: fr < 0.85 ? 'bad' : 'warn', title: `Only ${pct(fr)} of order lines were in stock`, body: 'Raise reorder points for the SKUs that run out (see the SKU table), or shorten lead times.' });
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
      aria-label="Results summary"
      className="dock-panel"
    >
      <div className="dock-panel-title">Results summary</div>
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
            Your warehouse shipped <b style={{ fontWeight: 600 }}>{o.shipped.toLocaleString()} orders</b> in {hoursLabel(durationSeconds)} — about{' '}
            <b style={{ fontWeight: 600 }}>{(o.shipped / (durationSeconds / 3600)).toFixed(0)} per hour</b>.
            {o.cycle > 0 && <> An order takes <b style={{ fontWeight: 600 }}>{formatDuration(o.cycle)}</b> on average from arrival to shipping.</>}
          </p>
        );
      })() : (
      <p style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--t1)', margin: 0, maxWidth: 900 }}>
        Your line produced <b style={{ fontWeight: 600 }}>{kpis.throughput.total.toLocaleString()} parts</b> in{' '}
        {hoursLabel(durationSeconds)} — about <b style={{ fontWeight: 600 }}>{rate.toFixed(rate >= 10 ? 0 : 1)} per hour</b>.
        {kpis.cycleTime.mean > 0 && (
          <> A part takes <b style={{ fontWeight: 600 }}>{formatDuration(kpis.cycleTime.mean)}</b> on average from start to finish.</>
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
                    Open {nameOf(f.stationId)} in the builder →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {warnings > 0 && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 12, marginBottom: 0, fontWeight: 600 }}>
          {warnings} model check{warnings === 1 ? '' : 's'} need{warnings === 1 ? 's' : ''} your attention — see below.
        </p>
      )}
      </div>
    </section>
  );
}
