/**
 * Export simulation results as a standalone HTML report.
 * Comprehensive: includes all KPI data, charts, model config, and analysis.
 */
import type { SimulationResult, KPIData, FactoryModel, StationUtilization, ResourceUtilization, DistributionConfig } from '../types';

// ── Formatters ────────────────────────────────────────────────────────

function fmtDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCost(v: number): string {
  if (!v || v === 0) return '$0';
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDist(d?: DistributionConfig): string {
  if (!d) return '-';
  const p = d.parameters as Record<string, number>;
  switch (d.type) {
    case 'constant':    return `${p.value}s`;
    case 'normal':      return `N(${p.mean}, ${p.std})s`;
    case 'exponential': return `Exp(${p.mean})s`;
    case 'triangular':  return `Tri(${p.min}, ${p.mode}, ${p.max})s`;
    case 'uniform':     return `U(${p.min}, ${p.max})s`;
    case 'weibull':     return `Wei(α=${p.shape}, β=${p.scale})s`;
    case 'lognormal':   return `LogN(${p.mean}, ${p.std})s`;
    default:            return String(d.type);
  }
}

// ── CSS ───────────────────────────────────────────────────────────────

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 980px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a; font-size: 13px; line-height: 1.6; }

  /* Header */
  .report-header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 28px 32px; margin: -40px -24px 32px; border-radius: 0 0 12px 12px; }
  .report-header h1 { margin: 0; font-size: 24px; font-weight: 700; }
  .report-header .sub { opacity: 0.85; font-size: 13px; margin-top: 6px; }

  h2 { color: #1e40af; font-size: 16px; margin: 32px 0 12px; border-bottom: 2px solid #dbeafe; padding-bottom: 6px; }
  h3 { color: #374151; font-size: 13px; margin: 20px 0 8px; }

  /* KPI cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-card.hl { border-color: #3b82f6; background: #eff6ff; }
  .kpi-card.warn { border-color: #f59e0b; background: #fffbeb; }
  .kpi-val { font-size: 22px; font-weight: 700; color: #111827; }
  .kpi-lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12px; }
  th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f4f6; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; color: #4b5563; }
  tr:hover { background: #fafafa; }
  .right { text-align: right; }
  .mono { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 11px; }
  .dim { color: #9ca3af; }
  .warn-cell { color: #dc2626; font-weight: 600; }

  /* Bars */
  .bar-wrap { height: 16px; background: #f3f4f6; border-radius: 3px; overflow: hidden; position: relative; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .bar-label { position: absolute; right: 4px; top: 0; line-height: 16px; font-size: 9px; font-weight: 600; color: #374151; }
  .stacked-bar { display: flex; height: 16px; border-radius: 3px; overflow: hidden; }
  .stacked-bar > div { height: 100%; }

  /* Waterfall */
  .wf-row { display: flex; align-items: center; margin: 5px 0; }
  .wf-lbl { width: 150px; font-size: 12px; font-weight: 500; }
  .wf-track { flex: 1; height: 26px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .wf-bar { height: 100%; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: white; border-radius: 4px; min-width: 40px; }

  /* Hourly chart (CSS-only bar chart) */
  .hour-chart { display: flex; align-items: flex-end; gap: 2px; height: 80px; margin: 8px 0; border-bottom: 1px solid #e5e7eb; }
  .hour-bar { flex: 1; background: #3b82f6; border-radius: 2px 2px 0 0; min-width: 4px; position: relative; }
  .hour-bar:hover::after { content: attr(data-val); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-size: 9px; background: #1f2937; color: white; padding: 1px 4px; border-radius: 3px; white-space: nowrap; }

  /* WIP sparkline */
  .sparkline { display: flex; align-items: flex-end; gap: 1px; height: 40px; }
  .spark-bar { flex: 1; background: #6366f1; border-radius: 1px 1px 0 0; min-width: 2px; opacity: 0.7; }

  /* Cost bars */
  .cost-stacked { display: flex; height: 14px; border-radius: 3px; overflow: hidden; width: 100%; background: #f3f4f6; }
  .cost-stacked .op { background: #3b82f6; }
  .cost-stacked .vr { background: #10b981; }
  .cost-stacked .sc { background: #ef4444; }

  /* Legends */
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 6px 0 12px; font-size: 11px; color: #6b7280; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; vertical-align: middle; margin-right: 4px; }

  /* Recommendations */
  .rec-list { margin: 8px 0; padding: 0; list-style: none; }
  .rec-list li { padding: 10px 14px; margin: 5px 0; border-radius: 6px; font-size: 12px; line-height: 1.5; }
  .rec-list .rec-warn { background: #fefce8; border-left: 3px solid #eab308; }
  .rec-list .rec-good { background: #f0fdf4; border-left: 3px solid #22c55e; }
  .rec-list .rec-info { background: #eff6ff; border-left: 3px solid #3b82f6; }

  /* Model config */
  .config-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
  .config-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; font-size: 11px; }
  .config-card .name { font-weight: 600; color: #111827; }
  .config-card .detail { color: #6b7280; margin-top: 2px; }

  .meta { color: #6b7280; font-size: 12px; }
  .footer { margin-top: 48px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
`;

// ── Utilization colors ────────────────────────────────────────────────

const UTIL_COLORS: Record<string, string> = {
  busy: '#22c55e', idle: '#d1d5db', setup: '#f59e0b', blocked: '#ef4444',
  failed: '#dc2626', starved: '#f97316', offShift: '#94a3b8', batchWait: '#a78bfa',
};

// ── Section renderers ─────────────────────────────────────────────────

function renderOEEByStation(kpis: KPIData, model: FactoryModel): string {
  const byStation = kpis.oee?.byStation;
  if (!byStation || Object.keys(byStation).length === 0) return '';

  const rows = Object.entries(byStation)
    .map(([id, s]) => {
      const name = model.stations.find(st => st.id === id)?.name || id;
      return { name, ...s };
    })
    .sort((a, b) => a.oee - b.oee);

  return `
<h3>OEE by Station</h3>
<table>
  <thead><tr><th>Station</th><th>OEE</th><th>Availability</th><th>Performance</th><th>Quality</th></tr></thead>
  <tbody>${rows.map(r => `<tr>
    <td>${esc(r.name)}</td>
    <td class="${r.oee < 0.65 ? 'warn-cell' : ''}">${pct(r.oee)}</td>
    <td>${pct(r.availability)}</td>
    <td>${pct(r.performance)}</td>
    <td>${pct(r.quality)}</td>
  </tr>`).join('\n')}</tbody>
</table>`;
}

function renderUtilizationBars(kpis: KPIData, model: FactoryModel): string {
  const util = kpis.utilization?.byStation;
  if (!util || Object.keys(util).length === 0) return '';

  const states: (keyof StationUtilization)[] = ['busy', 'idle', 'setup', 'blocked', 'failed', 'starved', 'offShift', 'batchWait'];
  const stateLabels: Record<string, string> = {
    busy: 'Busy', idle: 'Idle', setup: 'Setup', blocked: 'Blocked',
    failed: 'Failed', starved: 'Starved', offShift: 'Off Shift', batchWait: 'Batch Wait',
  };

  const rows = Object.entries(util).map(([id, s]: [string, any]) => {
    const name = model.stations.find(st => st.id === id)?.name || id;
    const segments = states
      .filter(k => (s[k] || 0) > 0.005)
      .map(k => `<div style="width:${((s[k] || 0) * 100).toFixed(1)}%;background:${UTIL_COLORS[k]}" title="${stateLabels[k]}: ${pct(s[k] || 0)}"></div>`)
      .join('');
    return `<tr><td>${esc(name)}</td><td><div class="stacked-bar">${segments}</div></td></tr>`;
  });

  const legend = states
    .filter(k => Object.values(util).some((s: any) => (s[k] || 0) > 0.005))
    .map(k => `<span><span class="legend-dot" style="background:${UTIL_COLORS[k]}"></span>${stateLabels[k]}</span>`)
    .join('');

  return `
<h2>Station Utilization Breakdown</h2>
<div class="legend">${legend}</div>
<table>
  <thead><tr><th>Station</th><th>Utilization</th></tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderWaterfall(kpis: KPIData): string {
  const oee = kpis.oee;
  const actual = kpis.throughput.total;
  if (!actual || !oee.overall || oee.overall <= 0) return '';

  const theoretical = Math.round(actual / oee.overall);
  const availLoss = Math.round(theoretical * (1 - oee.availability));
  const afterAvail = theoretical - availLoss;
  const perfLoss = Math.round(afterAvail * (1 - oee.performance));
  const afterPerf = afterAvail - perfLoss;
  const qualLoss = Math.round(afterPerf * (1 - oee.quality));
  const bw = (v: number) => `${Math.max(2, (v / theoretical) * 100)}%`;

  return `
<h2>Throughput Waterfall</h2>
<div style="margin:8px 0">
  <div class="wf-row"><span class="wf-lbl">Theoretical Max</span><div class="wf-track"><div class="wf-bar" style="width:${bw(theoretical)};background:#22c55e">${theoretical}</div></div></div>
  <div class="wf-row"><span class="wf-lbl">- Availability Loss</span><div class="wf-track"><div class="wf-bar" style="width:${bw(availLoss)};background:#ef4444">-${availLoss}</div></div></div>
  <div class="wf-row"><span class="wf-lbl">- Performance Loss</span><div class="wf-track"><div class="wf-bar" style="width:${bw(perfLoss)};background:#f97316">-${perfLoss}</div></div></div>
  <div class="wf-row"><span class="wf-lbl">- Quality Loss</span><div class="wf-track"><div class="wf-bar" style="width:${bw(qualLoss)};background:#f59e0b">-${qualLoss}</div></div></div>
  <div class="wf-row"><span class="wf-lbl">= Actual Output</span><div class="wf-track"><div class="wf-bar" style="width:${bw(actual)};background:#3b82f6"><strong>${actual}</strong></div></div></div>
</div>
<p class="meta">OEE = ${pct(oee.availability)} A × ${pct(oee.performance)} P × ${pct(oee.quality)} Q = <strong>${pct(oee.overall)}</strong></p>`;
}

function renderHourlyThroughput(kpis: KPIData): string {
  const byHour = kpis.throughput?.byHour;
  if (!byHour || byHour.length === 0) return '';

  const max = Math.max(...byHour, 1);
  const bars = byHour.map((v, i) =>
    `<div class="hour-bar" style="height:${Math.max(2, (v / max) * 100)}%" data-val="Hr ${i}: ${v}" title="Hour ${i}: ${v} units"></div>`
  ).join('');

  return `
<h3>Hourly Throughput</h3>
<div class="hour-chart">${bars}</div>
<p class="meta" style="display:flex;justify-content:space-between"><span>Hour 0</span><span>Hour ${byHour.length - 1}</span></p>`;
}

function renderCycleTimeByProduct(kpis: KPIData): string {
  const byProduct = kpis.cycleTime?.byProduct;
  if (!byProduct || Object.keys(byProduct).length === 0) return '';

  const rows = Object.entries(byProduct)
    .sort(([, a], [, b]) => b.mean - a.mean)
    .map(([name, ct]) => `<tr><td>${esc(name)}</td><td>${fmtDur(ct.mean)}</td><td>${fmtDur(ct.std)}</td></tr>`);

  return `
<h3>Cycle Time by Product</h3>
<table>
  <thead><tr><th>Product</th><th>Mean</th><th>Std Dev</th></tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderWIPSparkline(kpis: KPIData): string {
  const ts = kpis.wip?.timeSeries;
  if (!ts || ts.length < 3) return '';

  // Sample to max 60 points
  const step = Math.max(1, Math.floor(ts.length / 60));
  const sampled = ts.filter((_, i) => i % step === 0);
  const max = Math.max(...sampled.map(p => p.wip), 1);
  const avg = sampled.reduce((s, p) => s + p.wip, 0) / sampled.length;

  const bars = sampled.map(p =>
    `<div class="spark-bar" style="height:${Math.max(2, (p.wip / max) * 100)}%" title="T=${fmtDur(p.time)}: WIP=${p.wip}"></div>`
  ).join('');

  return `
<h3>WIP Over Time</h3>
<div class="sparkline">${bars}</div>
<p class="meta">Avg WIP: ${avg.toFixed(1)} | Peak: ${max} | Final: ${kpis.wip.total}</p>`;
}

function renderResources(kpis: KPIData): string {
  const byRes = kpis.utilization?.byResource;
  if (!byRes || Object.keys(byRes).length === 0) return '';

  const rows = Object.entries(byRes).map(([id, r]) => {
    if (typeof r === 'number') {
      return `<tr><td>${esc(id)}</td><td colspan="3"><div class="bar-wrap"><div class="bar-fill" style="width:${(r*100).toFixed(0)}%;background:#6366f1"></div><span class="bar-label">${pct(r)}</span></div></td></tr>`;
    }
    const ru = r as ResourceUtilization;
    return `<tr>
      <td>${esc(ru.name || id)}</td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${(ru.utilization*100).toFixed(0)}%;background:#6366f1"></div><span class="bar-label">${pct(ru.utilization)}</span></div></td>
      <td class="right">${ru.capacity}</td>
      <td class="right">${ru.requestCount ?? '-'}</td>
    </tr>`;
  });

  const hasDetail = Object.values(byRes).some(r => typeof r !== 'number');

  return `
<h2>Resource Utilization</h2>
<table>
  <thead><tr><th>Resource</th><th>Utilization</th>${hasDetail ? '<th class="right">Capacity</th><th class="right">Requests</th>' : ''}</tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderDelivery(kpis: KPIData): string {
  const d = kpis.delivery;
  if (!d) return '';

  return `
<h2>Delivery Performance</h2>
<div class="kpi-grid">
  <div class="kpi-card ${d.onTimeRate >= 0.95 ? 'hl' : 'warn'}">
    <div class="kpi-val">${pct(d.onTimeRate)}</div>
    <div class="kpi-lbl">On-Time Rate</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-val">${fmtDur(d.averageLateness)}</div>
    <div class="kpi-lbl">Avg Lateness</div>
  </div>
  <div class="kpi-card ${d.ordersAtRisk > 0 ? 'warn' : ''}">
    <div class="kpi-val">${d.ordersAtRisk}</div>
    <div class="kpi-lbl">Orders at Risk</div>
  </div>
</div>`;
}

function renderPareto(kpis: KPIData, model: FactoryModel): string {
  const util = kpis.utilization?.byStation;
  if (!util || Object.keys(util).length === 0) return '';

  const ranked = Object.entries(util)
    .map(([id, s]: [string, any]) => ({ name: model.stations.find(st => st.id === id)?.name || id, busy: s.busy || 0 }))
    .filter(s => s.busy > 0)
    .sort((a, b) => b.busy - a.busy);
  if (ranked.length === 0) return '';

  const totalBusy = ranked.reduce((sum, s) => sum + s.busy, 0);
  let cum = 0;
  const rows = ranked.map(s => {
    cum += s.busy;
    const cumPct = (cum / totalBusy) * 100;
    const vital = cumPct <= 80;
    return `<tr${vital ? ' style="font-weight:600"' : ''}>
      <td>${esc(s.name)}</td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${(s.busy*100).toFixed(0)}%;background:${vital ? '#3b82f6' : '#94a3b8'}"></div><span class="bar-label">${pct(s.busy)}</span></div></td>
      <td class="right">${cumPct.toFixed(1)}%</td>
    </tr>`;
  });

  return `
<h2>Utilization Pareto</h2>
<table>
  <thead><tr><th>Station</th><th>Busy %</th><th class="right">Cumulative</th></tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderBuffers(kpis: KPIData, model: FactoryModel): string {
  const byBuf = kpis.wip?.byBuffer;
  if (!byBuf || Object.keys(byBuf).length === 0) return '';

  const rows = model.buffers
    .filter(b => !b.id.startsWith('__arrival_'))
    .map(b => {
      const rawLevel = byBuf[b.name] ?? byBuf[b.id] ?? 0;
      const level = typeof rawLevel === 'object' ? (rawLevel as any).averageWip ?? 0 : Number(rawLevel) || 0;
      const fill = b.capacity > 0 ? (level / b.capacity) * 100 : 0;
      return `<tr>
        <td>${esc(b.name)}</td>
        <td><div class="bar-wrap"><div class="bar-fill" style="width:${fill.toFixed(0)}%;background:${fill > 80 ? '#ef4444' : '#3b82f6'}"></div><span class="bar-label">${level}/${b.capacity}</span></div></td>
        <td class="right">${fill.toFixed(0)}%</td>
        <td>${b.queueRule}</td>
      </tr>`;
    });
  if (rows.length === 0) return '';

  return `
<h2>Buffer Levels</h2>
<table>
  <thead><tr><th>Buffer</th><th>Level / Capacity</th><th class="right">Fill</th><th>Rule</th></tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderCost(kpis: KPIData, model: FactoryModel): string {
  const cost = kpis.cost;
  if (!cost) return '';

  const stationRows = Object.entries(cost.byStation)
    .filter(([, c]) => c.total > 0)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([id, c]) => {
      const name = model.stations.find(s => s.id === id)?.name || id;
      const maxC = Math.max(...Object.values(cost.byStation).map(s => s.total)) || 1;
      const w = (c.total / maxC) * 100;
      const opW = c.total > 0 ? (c.operating / c.total) * w : 0;
      const vrW = c.total > 0 ? (c.variable / c.total) * w : 0;
      const scW = c.total > 0 ? (c.scrapCost / c.total) * w : 0;
      return `<tr>
        <td>${esc(name)}</td>
        <td><div class="cost-stacked"><div class="op" style="width:${opW.toFixed(1)}%"></div><div class="vr" style="width:${vrW.toFixed(1)}%"></div><div class="sc" style="width:${scW.toFixed(1)}%"></div></div></td>
        <td class="right">${fmtCost(c.operating)}</td>
        <td class="right">${fmtCost(c.variable)}</td>
        <td class="right">${fmtCost(c.scrapCost)}</td>
        <td class="right"><strong>${fmtCost(c.total)}</strong></td>
      </tr>`;
    });

  return `
<h2>Cost Analysis</h2>
<div class="kpi-grid">
  <div class="kpi-card hl"><div class="kpi-val">${fmtCost(cost.totalCost)}</div><div class="kpi-lbl">Total Cost</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtCost(cost.costPerUnit)}</div><div class="kpi-lbl">Cost / Unit</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtCost(cost.operatingCost)}</div><div class="kpi-lbl">Operating</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtCost(cost.scrapCost)}</div><div class="kpi-lbl">Scrap</div></div>
</div>
${stationRows.length > 0 ? `
<table>
  <thead><tr><th>Station</th><th>Breakdown</th><th class="right">Operating</th><th class="right">Variable</th><th class="right">Scrap</th><th class="right">Total</th></tr></thead>
  <tbody>${stationRows.join('\n')}</tbody>
</table>
<div class="legend">
  <span><span class="legend-dot" style="background:#3b82f6"></span>Operating</span>
  <span><span class="legend-dot" style="background:#10b981"></span>Variable</span>
  <span><span class="legend-dot" style="background:#ef4444"></span>Scrap</span>
</div>` : ''}`;
}

function renderEnergy(kpis: KPIData, model: FactoryModel): string {
  const energy = kpis.energy;
  if (!energy) return '';

  const stationRows = Object.entries(energy.byStation)
    .filter(([, e]) => e.kwh > 0)
    .sort(([, a], [, b]) => b.kwh - a.kwh)
    .map(([id, e]) => {
      const name = model.stations.find(s => s.id === id)?.name || id;
      return `<tr>
        <td>${esc(name)}</td>
        <td class="right">${e.kwh.toFixed(2)}</td>
        <td class="right">${e.perUnit.toFixed(4)}</td>
        <td class="right">${e.cost > 0 ? fmtCost(e.cost) : '--'}</td>
        <td class="right">${e.co2Kg > 0 ? e.co2Kg.toFixed(2) : '--'}</td>
      </tr>`;
    });

  return `
<h2>Energy Consumption</h2>
<div class="kpi-grid">
  <div class="kpi-card hl"><div class="kpi-val">${energy.totalEnergy.toFixed(2)} kWh</div><div class="kpi-lbl">Total Energy</div></div>
  <div class="kpi-card"><div class="kpi-val">${energy.energyPerUnit.toFixed(4)} kWh</div><div class="kpi-lbl">Per Unit</div></div>
  <div class="kpi-card"><div class="kpi-val">${energy.totalCost > 0 ? fmtCost(energy.totalCost) : '--'}</div><div class="kpi-lbl">Energy Cost</div></div>
  <div class="kpi-card"><div class="kpi-val">${energy.co2Kg > 0 ? energy.co2Kg.toFixed(1) + ' kg' : '--'}</div><div class="kpi-lbl">CO2 Emissions</div></div>
</div>
${stationRows.length > 0 ? `
<table>
  <thead><tr><th>Station</th><th class="right">kWh</th><th class="right">kWh/Unit</th><th class="right">Cost</th><th class="right">CO2 (kg)</th></tr></thead>
  <tbody>${stationRows.join('\n')}</tbody>
</table>` : ''}`;
}

function renderMaintenance(kpis: KPIData, model: FactoryModel): string {
  const maint = kpis.maintenance;
  if (!maint) return '';

  const fmtTime = (s: number) => s >= 3600 ? (s / 3600).toFixed(1) + 'h' : s >= 60 ? (s / 60).toFixed(0) + 'm' : s.toFixed(0) + 's';

  const stationRows = Object.entries(maint.byStation)
    .filter(([, m]) => m.plannedDowntime > 0 || m.unplannedDowntime > 0)
    .sort(([, a], [, b]) => (b.plannedDowntime + b.unplannedDowntime) - (a.plannedDowntime + a.unplannedDowntime))
    .map(([id, m]) => {
      const name = model.stations.find(s => s.id === id)?.name || id;
      return `<tr>
        <td>${esc(name)}</td>
        <td class="right">${fmtTime(m.plannedDowntime)}</td>
        <td class="right">${fmtTime(m.unplannedDowntime)}</td>
        <td class="right">${m.pmEvents}</td>
        <td class="right">${m.pmCost > 0 ? fmtCost(m.pmCost) : '--'}</td>
      </tr>`;
    });

  return `
<h2>Maintenance Overview</h2>
<div class="kpi-grid">
  <div class="kpi-card hl"><div class="kpi-val">${fmtTime(maint.totalDowntime)}</div><div class="kpi-lbl">Total Downtime</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtTime(maint.plannedDowntime)}</div><div class="kpi-lbl">Planned (PM)</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtTime(maint.unplannedDowntime)}</div><div class="kpi-lbl">Unplanned</div></div>
  <div class="kpi-card"><div class="kpi-val">${maint.pmEvents}</div><div class="kpi-lbl">PM Events</div></div>
</div>
${stationRows.length > 0 ? `
<table>
  <thead><tr><th>Station</th><th class="right">Planned</th><th class="right">Unplanned</th><th class="right">PM Events</th><th class="right">PM Cost</th></tr></thead>
  <tbody>${stationRows.join('\n')}</tbody>
</table>` : ''}`;
}

function renderFlow(kpis: KPIData, model: FactoryModel): string {
  if (model.products.length === 0) return '';
  const nameOf = (id: string) => model.stations.find(s => s.id === id)?.name
    || (model.extraNodes ?? []).find(n => n.id === id)?.data?.name || id.slice(0, 8);

  const rows = model.products.map(p => {
    const route = p.routing.map(nameOf).join(' → ');
    const out = kpis.throughput.byProduct[p.name] ?? kpis.throughput.byProduct[p.id] ?? '-';
    return `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td class="mono">${esc(route)}</td>
      <td class="right">${out}</td>
      <td class="right dim">${p.arrivalRate ? `${p.arrivalRate}/hr` : 'order'}</td>
    </tr>`;
  });

  return `
<h2>Material Flow</h2>
<table>
  <thead><tr><th>Product</th><th>Routing</th><th class="right">Output</th><th class="right">Arrival</th></tr></thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

function renderModelConfig(model: FactoryModel): string {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const cards = model.stations.map(s => {
    const details: string[] = [`CT: ${fmtDist(s.cycleTime)}`];
    if (s.setupTime) details.push(`Setup: ${fmtDist(s.setupTime)}`);
    if (s.mtbf) details.push(`MTBF: ${fmtDur(s.mtbf * 3600)} / MTTR: ${fmtDur((s.mttr || 0) * 3600)}`);
    if (s.scrapRate) details.push(`Scrap: ${pct(s.scrapRate)}`);
    if (s.batchSize && s.batchSize > 1) details.push(`Batch: ${s.batchSize}`);
    if (s.reworkTarget) details.push(`Rework → ${model.stations.find(st => st.id === s.reworkTarget)?.name || s.reworkTarget}`);
    if (s.shifts && s.shifts.length > 0) {
      details.push(s.shifts.map(sh => `${sh.name}: ${sh.startHour}:00-${sh.endHour}:00 (${sh.days.map(d => dayNames[d]).join(',')})`).join('; '));
    }
    return `<div class="config-card"><div class="name">${esc(s.name)}</div><div class="detail">${details.join(' | ')}</div></div>`;
  });

  return `
<h2>Model Configuration</h2>
<p class="meta">${model.stations.length} stations, ${model.buffers.length} buffers, ${model.products.length} products, ${model.connections.length} connections</p>
<div class="config-grid">${cards.join('\n')}</div>`;
}

function renderRecommendations(kpis: KPIData, model: FactoryModel): string {
  const recs: Array<{ text: string; cls: string }> = [];
  const util = kpis.utilization?.byStation || {};
  const oee = kpis.oee;

  // Bottleneck
  const stations = Object.entries(util)
    .map(([id, s]: [string, any]) => ({ id, name: model.stations.find(st => st.id === id)?.name || id, ...s }))
    .sort((a, b) => (b.busy || 0) - (a.busy || 0));

  if (stations[0]?.busy > 0.85)
    recs.push({ text: `<strong>${esc(stations[0].name)}</strong> is the bottleneck at ${pct(stations[0].busy)} utilization. Adding parallel capacity or reducing cycle time would increase overall throughput.`, cls: 'rec-warn' });

  // Blocked stations
  const blocked = stations.filter(s => (s.blocked || 0) > 0.1).sort((a, b) => b.blocked - a.blocked);
  for (const s of blocked.slice(0, 2))
    recs.push({ text: `<strong>${esc(s.name)}</strong> is blocked ${pct(s.blocked)} — downstream cannot keep up. Increase buffer capacity or speed up the next station.`, cls: 'rec-warn' });

  // Starved stations
  const starved = stations.filter(s => (s.starved || 0) > 0.15).sort((a, b) => b.starved - a.starved);
  for (const s of starved.slice(0, 2))
    recs.push({ text: `<strong>${esc(s.name)}</strong> is starved ${pct(s.starved)} — waiting for input. Check upstream supply rates.`, cls: 'rec-warn' });

  // Quality
  if (oee.quality < 0.95)
    recs.push({ text: `Overall quality is ${pct(oee.quality)}. High-scrap stations should be investigated for root cause.`, cls: 'rec-warn' });

  // OEE
  if (oee.overall >= 0.85)
    recs.push({ text: `OEE of ${pct(oee.overall)} is world-class. Focus on maintaining current performance.`, cls: 'rec-good' });
  else if (oee.overall >= 0.65)
    recs.push({ text: `OEE of ${pct(oee.overall)} is typical. The biggest lever is ${oee.availability < oee.performance ? 'availability (failures/setup)' : 'performance (cycle time/speed losses)'}.`, cls: 'rec-info' });

  // Buffer sizing
  const fullBuffers = model.buffers.filter(b => {
    const rawLvl = kpis.wip?.byBuffer?.[b.name] ?? kpis.wip?.byBuffer?.[b.id] ?? 0;
    const level = typeof rawLvl === 'object' ? (rawLvl as any).averageWip ?? 0 : Number(rawLvl) || 0;
    return b.capacity > 0 && (level / b.capacity) > 0.9;
  });
  if (fullBuffers.length > 0)
    recs.push({ text: `${fullBuffers.length} buffer(s) near capacity (${fullBuffers.map(b => esc(b.name)).join(', ')}). Increasing capacity may reduce upstream blocking.`, cls: 'rec-info' });

  if (recs.length === 0)
    recs.push({ text: 'No significant issues detected. The factory is performing well within expected parameters.', cls: 'rec-good' });

  return `
<h2>Analysis &amp; Recommendations</h2>
<ul class="rec-list">
  ${recs.map(r => `<li class="${r.cls}">${r.text}</li>`).join('\n')}
</ul>`;
}

// ── Main export ───────────────────────────────────────────────────────

export function generateHTMLReport(result: SimulationResult, modelName: string, model?: FactoryModel): string {
  const kpis = result.kpis as KPIData | undefined;
  if (!kpis) return '<html><body><p>No KPI data available.</p></body></html>';

  const oee = kpis.oee;
  const tp = kpis.throughput;
  const ct = kpis.cycleTime;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FactorySim Report — ${esc(modelName)}</title>
<style>${CSS}</style>
</head>
<body>

<div class="report-header">
  <h1>Factory Simulation Report</h1>
  <div class="sub">${esc(modelName)} | Duration: ${fmtDur(result.duration || 0)}${result.replications && result.replications > 1 ? ` | ${result.replications} replications` : ''} | ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

<h2>Executive Summary</h2>
<div class="kpi-grid">
  <div class="kpi-card hl"><div class="kpi-val">${pct(oee?.overall || 0)}</div><div class="kpi-lbl">Overall OEE</div></div>
  <div class="kpi-card"><div class="kpi-val">${tp?.total || 0}</div><div class="kpi-lbl">Total Output</div></div>
  <div class="kpi-card"><div class="kpi-val">${tp?.ratePerHour?.toFixed(1) || '0'}/hr</div><div class="kpi-lbl">Throughput Rate</div></div>
  <div class="kpi-card"><div class="kpi-val">${fmtDur(ct?.mean || 0)}</div><div class="kpi-lbl">Avg Cycle Time</div></div>
</div>
<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-val">${pct(oee?.availability || 0)}</div><div class="kpi-lbl">Availability</div></div>
  <div class="kpi-card"><div class="kpi-val">${pct(oee?.performance || 0)}</div><div class="kpi-lbl">Performance</div></div>
  <div class="kpi-card"><div class="kpi-val">${pct(oee?.quality || 0)}</div><div class="kpi-lbl">Quality</div></div>
  <div class="kpi-card"><div class="kpi-val">${kpis.wip?.total ?? 0}</div><div class="kpi-lbl">Final WIP</div></div>
</div>

${model ? renderRecommendations(kpis, model) : ''}

${renderWaterfall(kpis)}

${model ? renderCost(kpis, model) : ''}

${model ? renderEnergy(kpis, model) : ''}

${model ? renderMaintenance(kpis, model) : ''}

${renderDelivery(kpis)}

${model ? renderFlow(kpis, model) : ''}

${tp?.byProduct && Object.keys(tp.byProduct).length > 0 ? `
<h2>Output by Product</h2>
<table>
  <thead><tr><th>Product</th><th>Completed</th></tr></thead>
  <tbody>${Object.entries(tp.byProduct).map(([id, count]) => `<tr><td>${esc(id)}</td><td>${count}</td></tr>`).join('\n')}</tbody>
</table>` : ''}

${renderHourlyThroughput(kpis)}

${renderCycleTimeByProduct(kpis)}

${renderWIPSparkline(kpis)}

${model ? renderOEEByStation(kpis, model) : ''}

${model ? renderUtilizationBars(kpis, model) : ''}

${model ? renderPareto(kpis, model) : ''}

${model ? renderBuffers(kpis, model) : ''}

${renderResources(kpis)}

${model ? renderModelConfig(model) : ''}

${kpis.warnings && kpis.warnings.length > 0 ? `
<h2>Warnings</h2>
<ul class="rec-list">
  ${kpis.warnings.map(w => `<li class="rec-${w.severity === 'error' ? 'warn' : w.severity === 'warning' ? 'warn' : 'info'}"><strong>${esc(w.severity)}:</strong> ${esc(w.message)}</li>`).join('\n')}
</ul>` : ''}

<div class="footer">
  <span>Generated by FactorySim</span>
  <span>${new Date().toISOString()}</span>
</div>
</body>
</html>`;
}

export async function downloadReport(result: SimulationResult, modelName: string, model?: FactoryModel) {
  const html = generateHTMLReport(result, modelName, model);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factorysim-report-${modelName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
