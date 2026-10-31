import React, { useState } from 'react';
import type { Station, KPIData, Connection } from '../../types';
import { ChartEmptyState } from './ChartEmptyState';

import { t } from '../../i18n';
interface BottleneckHeatmapProps {
  stations: Station[];
  kpis: KPIData;
  connections?: Connection[];
}

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

interface StationMetrics {
  station: Station;
  utilization: number;
  blocked: number;
  starved: number;
  waitTime: number;
  throughput: number;
  queueLength: number;
  isPassThrough: boolean;
  bufferTotalItems: number;
  isBottleneck: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  setup: number;
  failed: number;
}

const BottleneckHeatmap = React.memo(function BottleneckHeatmap({ stations, kpis, connections }: BottleneckHeatmapProps) {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (!kpis || stations.length === 0) {
    return <ChartEmptyState message="No bottleneck data available" height="h-80" />;
  }

  // Build station → input buffer mapping from connections
  const bufferIds = new Set(Object.keys(kpis.wip?.byBuffer || {}));
  const stationInputBuffer: Record<string, string> = {};
  if (connections) {
    for (const conn of connections) {
      // A connection from a buffer to a station means the buffer is the station's input
      if (bufferIds.has(conn.source) && stations.some(s => s.id === conn.target)) {
        stationInputBuffer[conn.target] = conn.source;
      }
    }
  }

  // Calculate comprehensive metrics for each station using per-station buffer data
  const stationMetrics: StationMetrics[] = stations.map((station) => {
    const stationUtil = kpis.utilization.byStation[station.id];
    const busy = stationUtil?.busy ?? 0;
    const setup = stationUtil?.setup ?? 0;
    const failed = stationUtil?.failed ?? 0;
    const utilization = busy + setup + failed;  // busy + setup + failed = non-idle fraction
    const blocked = stationUtil?.blocked ?? 0;
    const starved = stationUtil?.starved ?? 0;

    // Use this station's input buffer stats (if available)
    const inputBufferId = stationInputBuffer[station.id];
    const bufferStats = inputBufferId ? (kpis.wip.byBuffer[inputBufferId] as any) : null;
    const waitTime = bufferStats?.averageWaitingTime ?? 0;
    const queueLength = Math.round(bufferStats?.averageWip ?? 0);
    const isPassThrough = bufferStats?.isPassThrough ?? false;
    const bufferTotalItems = bufferStats?.totalItems ?? 0;

    // Use per-station throughput if available, otherwise fall back to global
    const throughput = (kpis.throughput as any).byStation?.[station.id] ?? Math.round(kpis.throughput.ratePerHour);

    const isBottleneck = utilization > 0.85;
    const severity = getSeverity(utilization);

    return {
      station,
      utilization,
      blocked,
      starved,
      waitTime,
      throughput,
      queueLength,
      isPassThrough,
      bufferTotalItems,
      isBottleneck,
      severity,
      setup,
      failed,
    };
  });

  // Sort for ranking
  const sortedMetrics = [...stationMetrics].sort((a, b) => b.utilization - a.utilization);
  const topBottleneck = sortedMetrics[0];
  const avgUtilization = stationMetrics.reduce((sum, m) => sum + m.utilization, 0) / stationMetrics.length;

  // Detect if there's a clear bottleneck:
  // - At least one station above 85% utilization AND
  // - The top station is meaningfully higher than the average (>10pp spread)
  const hasBottlenecks = stationMetrics.some(m => m.isBottleneck);
  const topSpread = topBottleneck.utilization - avgUtilization;
  const hasClearBottleneck = hasBottlenecks || topSpread > 0.10;

  const selected = stationMetrics.find((m) => m.station.id === selectedStation) ?? null;
  const overloaded = stationMetrics.filter((m) => m.utilization >= 0.95).length;
  const headroom = stationMetrics.filter((m) => m.utilization < 0.75).length;
  // Flow order (as modelled) for the state bars; long lines show the 12 busiest unless expanded
  const flowRows = !showAll && stationMetrics.length > 12
    ? stationMetrics.filter((m) => sortedMetrics.slice(0, 12).includes(m))
    : stationMetrics;

  const extraNodes = (kpis as any).extraNodes || {};
  const stationIds = new Set(stations.map((st) => st.id));
  const extraEntries = Object.entries(extraNodes).filter(([id, v]) => !stationIds.has(id) && !(v as any)?.warehouse) as [string, any][];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!hasClearBottleneck && (
        <Note tone="warn" title={t('No clear bottleneck')}>
          Utilisation is evenly spread (the busiest station is {Math.round(topSpread * 100)} points above the average).
          The line is balanced: more output needs capacity at several stations, not one.
        </Note>
      )}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Tile label={t('Top bottleneck')} value={shortName(topBottleneck.station.name)}
          sub={`${pct(topBottleneck.utilization, 1)} in use (busy + setup + failed)`} tone={topBottleneck.utilization >= 0.9 ? 'bad' : topBottleneck.utilization >= 0.8 ? 'warn' : undefined} />
        <Tile label={t('Overloaded stations')} value={String(overloaded)} sub="≥ 95 % of the time in use" tone={overloaded ? 'bad' : undefined} />
        <Tile label={t('Average utilisation')} value={pct(avgUtilization, 1)} sub={`across ${stationMetrics.length} stations`} />
        <Tile label={t('Stations with headroom')} value={`${headroom} of ${stationMetrics.length}`} sub="below 75 % in use" />
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
        <figure style={{ margin: 0 }}>
          <figcaption style={capStyle}>{t('Time split per station, in flow order')}</figcaption>
          <Legend />
          <div role="list" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {flowRows.map((m) => {
              const isSel = m.station.id === selectedStation;
              const busy = Math.max(0, m.utilization - m.setup - m.failed);
              const idle = Math.max(0, 1 - m.utilization - m.blocked - m.starved);
              return (
                <button key={m.station.id} type="button" role="listitem"
                  onClick={() => setSelectedStation(isSel ? null : m.station.id)}
                  aria-pressed={isSel}
                  title={`${m.station.name}: ${pct(m.utilization, 1)} in use · blocked ${pct(m.blocked)} · starved ${pct(m.starved)}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '140px 1fr 56px', alignItems: 'center', gap: 10,
                    padding: '4px 6px', border: '1px solid', borderColor: isSel ? 'var(--select-border, #7DB2EC)' : 'transparent',
                    background: isSel ? 'var(--select-bg, #DCEBFB)' : 'transparent', borderRadius: 2, cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: m.isBottleneck ? 600 : 400 }}>
                    {shortName(m.station.name)}
                  </span>
                  <span style={{ display: 'flex', height: 14, background: 'var(--gray-100, #F1F5F9)', border: '1px solid var(--border, #E2E8F0)' }}>
                    {SEGMENTS.map((seg) => {
                      const v = seg.key === 'busy' ? busy : seg.key === 'setup' ? m.setup : seg.key === 'failed' ? m.failed : seg.key === 'blocked' ? m.blocked : seg.key === 'starved' ? m.starved : idle;
                      return v > 0.002 ? <span key={seg.key} style={{ width: `${v * 100}%`, background: seg.color }} /> : null;
                    })}
                  </span>
                  <span style={{ ...numStyle, color: toneColor(m.utilization) }}>{pct(m.utilization)}</span>
                </button>
              );
            })}
          </div>
          {stationMetrics.length > 12 && (
            <button type="button" className="ribbon-sbtn" style={{ marginTop: 6 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show the 12 busiest' : `Show all ${stationMetrics.length} stations`}
            </button>
          )}
        </figure>

        <div>
          <div style={capStyle}>{t('Ranking by utilisation')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--t3)', textAlign: 'right' }}>
                {['#', 'Station', 'In use', 'Queue', 'Wait'].map((h, i) => (
                  <th key={h} style={{ ...thStyle, textAlign: i === 1 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMetrics.slice(0, showAll ? undefined : 12).map((m, i) => (
                <tr key={m.station.id} onClick={() => setSelectedStation(m.station.id === selectedStation ? null : m.station.id)}
                  style={{ cursor: 'pointer', background: m.station.id === selectedStation ? 'var(--select-bg, #DCEBFB)' : undefined }}>
                  <td style={{ ...tdStyle, ...numStyle, color: 'var(--t3)' }}>{i + 1}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortName(m.station.name)}{m.isBottleneck && <span style={tagStyle}>{t('BOTTLENECK')}</span>}
                  </td>
                  <td style={{ ...tdStyle, ...numStyle, color: toneColor(m.utilization) }}>{pct(m.utilization, 1)}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{m.isPassThrough ? '—' : m.queueLength}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{fmtWait(m.waitTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--t3)', margin: '6px 0 0', lineHeight: 1.4 }}>
            In use = busy + setup + failed. Bottleneck = above 85 %. Queue and wait are for the station&apos;s input buffer.
          </p>
        </div>
      </div>

      {selected && <StationDetails metrics={selected} onClose={() => setSelectedStation(null)} />}

      {extraEntries.length > 0 && (
        <div>
          <div style={capStyle}>{t('Other elements')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--t3)', textAlign: 'right' }}>
                {['Element', 'Processing', 'Waiting', 'Occupied'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {extraEntries.map(([id, stats]) => {
                const st = stats.state_times || stats.stateTimes || {};
                const total = (Object.values(st) as number[]).reduce((a, v) => a + v, 0) || 1;
                const processing = (st.processing || 0) / total;
                const waiting = (st.waiting || 0) / total;
                return (
                  <tr key={id}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{stats.name || id}</td>
                    <td style={{ ...tdStyle, ...numStyle }}>{pct(processing)}</td>
                    <td style={{ ...tdStyle, ...numStyle }}>{pct(waiting)}</td>
                    <td style={{ ...tdStyle, ...numStyle, color: toneColor(processing + waiting) }}>{pct(processing + waiting)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export { BottleneckHeatmap };

// ── Presentation helpers (engineering style: square borders, tokens, tabular numbers) ──

const SEGMENTS = [
  { key: 'busy', label: 'Busy', color: '#2563EB' },
  { key: 'setup', label: 'Setup', color: '#7C8BA1' },
  { key: 'failed', label: 'Failed', color: '#DC2626' },
  { key: 'blocked', label: 'Blocked', color: '#D97706' },
  { key: 'starved', label: 'Starved', color: '#E8C26A' },
  { key: 'idle', label: 'Idle', color: 'transparent' },
] as const;

const capStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 };
const numStyle: React.CSSProperties = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: 'tabular-nums', textAlign: 'right' };
const thStyle: React.CSSProperties = { padding: '4px 6px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--border-subtle, #F1F5F9)', textAlign: 'right' };
const tagStyle: React.CSSProperties = { marginLeft: 6, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--red)', border: '1px solid var(--red)', padding: '0 3px', borderRadius: 2 };

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const fmtWait = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const toneColor = (u: number) => (u >= 0.9 ? 'var(--red)' : u >= 0.8 ? 'var(--amber)' : 'var(--t1)');

function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11, color: 'var(--t2)' }}>
      {SEGMENTS.map((sg) => (
        <span key={sg.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: sg.color, border: sg.key === 'idle' ? '1px solid var(--border)' : 'none' }} />{sg.label}
        </span>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : 'var(--t1)';
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 3, padding: '10px 12px', background: 'var(--surface)' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color, marginTop: 2, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Note({ tone, title, children }: { tone: 'warn' | 'bad' | 'info'; title: string; children: React.ReactNode }) {
  const c = tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : 'var(--blue)';
  const bg = tone === 'bad' ? 'var(--red-bg)' : tone === 'warn' ? 'var(--amber-bg)' : 'var(--blue-bg)';
  return (
    <div style={{ borderLeft: `3px solid ${c}`, background: bg, padding: '8px 12px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

function StationDetails({ metrics: m, onClose }: { metrics: StationMetrics; onClose: () => void }) {
  const cells: [string, string][] = [
    ['In use', pct(m.utilization, 1)], ['Blocked', pct(m.blocked, 1)], ['Starved', pct(m.starved, 1)],
    ['Throughput', `${m.throughput}/h`], ['Queue (avg)', m.isPassThrough ? '—' : String(m.queueLength)], ['Wait in queue', fmtWait(m.waitTime)],
  ];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 3, background: 'var(--surface)' }}>
      <div className="dock-panel-title">
        <span>{m.station.name}</span>
        <button type="button" onClick={onClose} aria-label={t('Close details')} title={t('Close')}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '10px 12px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          {cells.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>{k}</div>
              <div style={{ ...numStyle, textAlign: 'left', fontSize: 15, color: 'var(--t1)' }}>{v}</div>
            </div>
          ))}
        </div>
        {m.isBottleneck && (
          <Note tone="bad" title={t('Constrains the line')}>
            Above 85 % in use. Shorter cycle time, a parallel machine or less setup and downtime here raises output; improving other stations will not.
          </Note>
        )}
        {m.blocked > 0.3 && (
          <Note tone="warn" title={`Blocked ${pct(m.blocked)} of the time`}>
            It waits to pass parts downstream: the next buffer is full or the next station is slower.
          </Note>
        )}
        {m.starved > 0.5 && !m.isBottleneck && (
          <Note tone="info" title={`Starved ${pct(m.starved)} of the time`}>
            It waits for parts: upstream cannot keep up, so capacity here is not the issue.
          </Note>
        )}
      </div>
    </div>
  );
}

function getSeverity(utilization: number): 'low' | 'medium' | 'high' | 'critical' {
  if (utilization > 0.9) return 'critical';
  if (utilization > 0.8) return 'high';
  if (utilization > 0.65) return 'medium';
  return 'low';
}
