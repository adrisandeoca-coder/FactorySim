import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { useSimulationStore } from '../../stores/simulationStore';
import type { DistributionConfig } from '../../types';

// ── Formatting helpers ────────────────────────────────────────────────

function fmtDist(d: DistributionConfig): string {
  const p = d.parameters;
  switch (d.type) {
    case 'constant':   return `${p.value}s`;
    case 'normal':     return `N(${p.mean}, ${p.std})s`;
    case 'exponential':return `Exp(${p.mean})s`;
    case 'triangular': return `Tri(${p.min}, ${p.mode}, ${p.max})s`;
    case 'uniform':    return `U(${p.min}, ${p.max})s`;
    case 'weibull':    return `Wei(α=${p.shape}, β=${p.scale})s`;
    case 'lognormal':  return `LogN(${p.mean}, ${p.std})s`;
    case 'empirical':  return `Empirical`;
    default:           return String(d.type);
  }
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function distMean(d: DistributionConfig): number {
  const p = d.parameters;
  switch (d.type) {
    case 'constant':    return p.value as number;
    case 'normal':      return p.mean as number;
    case 'exponential': return p.mean as number;
    case 'triangular':  return ((p.min as number) + (p.mode as number) + (p.max as number)) / 3;
    case 'uniform':     return ((p.min as number) + (p.max as number)) / 2;
    case 'weibull':     return (p.scale as number); // rough approx
    case 'lognormal':   return p.mean as number;
    default:            return 0;
  }
}

// ── Progress bar (kept from LiveSimulationView) ───────────────────────

function ProgressBar({ progress, elapsedSeconds, simDuration }: {
  progress: number; elapsedSeconds: number; simDuration: number;
}) {
  const warmupPeriod = useSimulationStore((s) => s.defaultOptions.warmupPeriod) ?? 0;
  const warmupPct = simDuration > 0 ? (warmupPeriod / simDuration) * 100 : 0;
  const pct = Math.min(progress * 100, 100);
  const eta = progress > 0.05 ? (elapsedSeconds / progress) * (1 - progress) : 0;

  return (
    <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
      {warmupPct > 0 && (
        <div className="absolute inset-y-0 left-0 bg-amber-100/60 border-r border-amber-300"
          style={{ width: `${warmupPct}%` }} />
      )}
      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
        style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-semibold">
        <span className="text-slate-700 drop-shadow-sm">{pct.toFixed(0)}%</span>
        <span className="text-slate-500">
          {elapsedSeconds > 0 && `${fmtTime(Math.round(elapsedSeconds))} elapsed`}
          {eta > 5 && ` · ~${fmtTime(Math.round(eta))} left`}
        </span>
      </div>
    </div>
  );
}

// ── Section components ────────────────────────────────────────────────

function ModelOverview() {
  const { model } = useModelStore();
  const sources = model.extraNodes?.filter(n => n.type === 'source') ?? [];
  const sinks = model.extraNodes?.filter(n => n.type === 'sink') ?? [];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Model Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric label="Stations" value={model.stations.length} />
        <Metric label="Buffers" value={model.buffers.length} />
        <Metric label="Products" value={model.products.length} />
        <Metric label="Sources" value={sources.length} />
        <Metric label="Sinks" value={sinks.length} />
        <Metric label="Connections" value={model.connections.length} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ProductRoutings() {
  const { model } = useModelStore();
  if (model.products.length === 0) return null;

  const stationMap = Object.fromEntries(model.stations.map(s => [s.id, s.name]));
  const extraMap = Object.fromEntries((model.extraNodes ?? []).map(n => [n.id, n.data.name || n.type]));
  const nameOf = (id: string) => stationMap[id] || extraMap[id] || id.slice(0, 8);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Product Routings</h3>
      <div className="space-y-2">
        {model.products.map(p => (
          <div key={p.id} className="flex items-start gap-2">
            <span className="text-xs font-semibold text-indigo-600 whitespace-nowrap min-w-[80px]">{p.name}</span>
            <div className="flex items-center gap-1 flex-wrap text-[11px] text-slate-600">
              {p.routing.map((stepId, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-slate-300">&rarr;</span>}
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded">{nameOf(stepId)}</span>
                </span>
              ))}
              {p.arrivalRate != null && (
                <span className="ml-2 text-slate-400">({p.arrivalRate}/hr)</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StationDetails() {
  const { model } = useModelStore();

  // sort by bottleneck potential: longest mean cycle time first
  const sorted = useMemo(() =>
    [...model.stations].sort((a, b) => distMean(b.cycleTime) - distMean(a.cycleTime)),
    [model.stations]
  );
  if (model.stations.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
        Station Configuration
        <span className="ml-2 text-slate-300 normal-case font-normal">(sorted by cycle time)</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-1 pr-3 font-medium">Station</th>
              <th className="py-1 pr-3 font-medium">Cycle Time</th>
              <th className="py-1 pr-3 font-medium">Batch</th>
              <th className="py-1 pr-3 font-medium">MTBF / MTTR</th>
              <th className="py-1 pr-3 font-medium">Scrap</th>
              <th className="py-1 font-medium">Setup</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-1.5 pr-3 font-medium text-slate-700">{s.name}</td>
                <td className="py-1.5 pr-3 text-slate-600">{fmtDist(s.cycleTime)}</td>
                <td className="py-1.5 pr-3 text-slate-500">{s.batchSize && s.batchSize > 1 ? s.batchSize : '-'}</td>
                <td className="py-1.5 pr-3 text-slate-500">
                  {s.mtbf ? `${fmtTime(s.mtbf)} / ${fmtTime(s.mttr || 0)}` : '-'}
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{s.scrapRate ? `${(s.scrapRate * 100).toFixed(1)}%` : '-'}</td>
                <td className="py-1.5 text-slate-500">{s.setupTime ? fmtDist(s.setupTime) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BufferSummary() {
  const { model } = useModelStore();
  if (model.buffers.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Buffers</h3>
      <div className="flex flex-wrap gap-2">
        {model.buffers.map(b => (
          <div key={b.id} className="bg-slate-50 rounded px-2.5 py-1.5 text-[11px]">
            <span className="font-medium text-slate-700">{b.name}</span>
            <span className="text-slate-400 ml-1.5">cap {b.capacity}</span>
            {b.queueRule !== 'FIFO' && (
              <span className="text-slate-400 ml-1">· {b.queueRule}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BottleneckAnalysis() {
  const { model } = useModelStore();

  const insights = useMemo(() => {
    const results: Array<{ icon: string; text: string; severity: 'info' | 'warn' }> = [];
    const sorted = [...model.stations].sort((a, b) => distMean(b.cycleTime) - distMean(a.cycleTime));

    // Slowest station
    if (sorted.length > 0) {
      const slowest = sorted[0];
      const fastest = sorted[sorted.length - 1];
      const ratio = distMean(slowest.cycleTime) / distMean(fastest.cycleTime);
      results.push({
        icon: '⏱',
        text: `Slowest station: ${slowest.name} (${fmtDist(slowest.cycleTime)})` +
          (ratio > 2 ? ` — ${ratio.toFixed(1)}x slower than fastest` : ''),
        severity: ratio > 3 ? 'warn' : 'info',
      });
    }

    // Stations with high scrap
    const highScrap = model.stations.filter(s => s.scrapRate && s.scrapRate > 0.05);
    for (const s of highScrap) {
      results.push({
        icon: '🗑',
        text: `${s.name} has ${((s.scrapRate || 0) * 100).toFixed(1)}% scrap rate`,
        severity: 'warn',
      });
    }

    // Stations with no reliability data
    const noReliability = model.stations.filter(s => !s.mtbf);
    if (noReliability.length > 0 && noReliability.length < model.stations.length) {
      results.push({
        icon: '🔧',
        text: `${noReliability.length} station${noReliability.length > 1 ? 's' : ''} without MTBF/MTTR configured`,
        severity: 'info',
      });
    }

    // Small buffers (capacity <= 2)
    const tightBuffers = model.buffers.filter(b => b.capacity <= 2);
    if (tightBuffers.length > 0) {
      results.push({
        icon: '📦',
        text: `${tightBuffers.length} buffer${tightBuffers.length > 1 ? 's' : ''} with capacity ≤ 2 (${tightBuffers.map(b => b.name).join(', ')})`,
        severity: 'info',
      });
    }

    // Products without arrival rates (order-driven)
    const noArrival = model.products.filter(p => !p.arrivalRate);
    if (noArrival.length > 0 && noArrival.length < model.products.length) {
      results.push({
        icon: '📋',
        text: `${noArrival.length} product${noArrival.length > 1 ? 's' : ''} order-driven (no arrival rate)`,
        severity: 'info',
      });
    }

    return results;
  }, [model]);
  if (model.stations.length < 2) return null;

  if (insights.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Model Insights</h3>
      <div className="space-y-1.5">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2 text-[11px] px-2 py-1.5 rounded ${
            ins.severity === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'
          }`}>
            <span>{ins.icon}</span>
            <span>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShiftCoverage() {
  const { model } = useModelStore();
  const stationsWithShifts = model.stations.filter(s => s.shifts && s.shifts.length > 0);
  if (stationsWithShifts.length === 0) return null;

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Shift Schedules</h3>
      <div className="space-y-2">
        {stationsWithShifts.map(s => (
          <div key={s.id} className="text-[11px]">
            <span className="font-medium text-slate-700">{s.name}</span>
            <div className="ml-3 text-slate-500">
              {s.shifts!.map((sh, i) => (
                <div key={i}>
                  {sh.name}: {String(sh.startHour).padStart(2, '0')}:00–{String(sh.endHour).padStart(2, '0')}:00
                  <span className="text-slate-400 ml-1">({sh.days.map(d => dayNames[d]).join(', ')})</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimulationConfig({ simDuration }: { simDuration: number }) {
  const opts = useSimulationStore((s) => s.defaultOptions);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Simulation Settings</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <div>
          <div className="text-slate-400">Duration</div>
          <div className="font-medium text-slate-700">{fmtTime(simDuration)}</div>
        </div>
        {(opts.warmupPeriod ?? 0) > 0 && (
          <div>
            <div className="text-slate-400">Warmup</div>
            <div className="font-medium text-slate-700">{fmtTime(opts.warmupPeriod!)}</div>
          </div>
        )}
        {(opts.replications ?? 1) > 1 && (
          <div>
            <div className="text-slate-400">Replications</div>
            <div className="font-medium text-slate-700">{opts.replications}</div>
          </div>
        )}
        {opts.seed != null && (
          <div>
            <div className="text-slate-400">Seed</div>
            <div className="font-medium text-slate-700">{opts.seed}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCounters() {
  const completedProducts = useLiveSimulationStore((s) => s.completedProducts);
  const activeProducts = useLiveSimulationStore((s) => s.activeProducts);
  const currentTime = useLiveSimulationStore((s) => s.currentTime);

  if (currentTime === 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-200 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3">Live Counters</h3>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Sim Time" value={fmtTime(Math.round(currentTime))} />
        <Metric label="WIP" value={activeProducts} />
        <Metric label="Completed" value={completedProducts} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

interface SimulationBriefViewProps {
  progress: number;
  elapsedSeconds: number;
  simDuration: number;
  height?: string | number;
}

export function SimulationBriefView({ progress, elapsedSeconds, simDuration, height }: SimulationBriefViewProps) {
  return (
    <div
      className="flex flex-col bg-slate-50 rounded-xl border border-slate-200 overflow-hidden"
      style={{ height: height || 'calc(100vh - 180px)' }}
    >
      {/* Progress bar */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Simulation Running</span>
        </div>
        <ProgressBar progress={progress} elapsedSeconds={elapsedSeconds} simDuration={simDuration} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        <LiveCounters />
        <ModelOverview />
        <BottleneckAnalysis />
        <ProductRoutings />
        <StationDetails />
        <BufferSummary />
        <ShiftCoverage />
        <SimulationConfig simDuration={simDuration} />
      </div>
    </div>
  );
}
