import React, { useMemo } from 'react';
import type { KPIData, FactoryModel, SimulationResult } from '../../types';

interface BufferSparklinesProps {
  kpis: KPIData;
  model: FactoryModel;
  result: SimulationResult | null;
}

interface BufferTimeline {
  name: string;
  capacity: number;
  currentLevel: number;
  samples: number[]; // fill levels sampled at regular intervals
}

const BufferSparklines = React.memo(function BufferSparklines({ kpis, model, result }: BufferSparklinesProps) {
  const buffers = model.buffers;

  const timelines = useMemo(() => {
    if (buffers.length === 0) return [];

    // Build a map of buffer id -> model info
    const bufferMap = new Map(buffers.map(b => [b.id, b]));

    // Try to extract timelines from events
    const eventTimelines = new Map<string, Array<{ time: number; level: number }>>();

    if (result?.events && result.events.length > 0) {
      for (const evt of result.events) {
        if (evt.type === 'buffer_put' || evt.type === 'buffer_get') {
          const bufName = (evt.details?.buffer as string) || evt.entityId;
          // Match by name or id
          const bufId = findBufferId(bufName, bufferMap);
          if (!bufId) continue;

          if (!eventTimelines.has(bufId)) {
            eventTimelines.set(bufId, []);
          }
          const level = typeof evt.details?.level === 'number' ? evt.details.level as number : undefined;
          if (level !== undefined) {
            eventTimelines.get(bufId)!.push({ time: evt.time, level });
          }
        }
      }
    }

    const results: BufferTimeline[] = [];

    for (const buf of buffers) {
      // Skip implicit arrival buffers
      if (buf.id.startsWith('__arrival_') || buf.name.startsWith('__arrival_')) continue;

      const capacity = buf.capacity || 1;
      const rawLevel = kpis.wip.byBuffer[buf.id] ?? kpis.wip.byBuffer[buf.name] ?? 0;
      const currentLevel = typeof rawLevel === 'object' ? (rawLevel as any).averageWip ?? 0 : Number(rawLevel) || 0;

      const raw = eventTimelines.get(buf.id);
      let samples: number[] = [];

      if (raw && raw.length >= 2) {
        // Sort by time and sample at regular intervals
        raw.sort((a, b) => a.time - b.time);
        const numSamples = 30;
        const tMin = raw[0].time;
        const tMax = raw[raw.length - 1].time;
        const step = (tMax - tMin) / (numSamples - 1);

        let ri = 0;
        for (let si = 0; si < numSamples; si++) {
          const t = tMin + si * step;
          while (ri < raw.length - 1 && raw[ri + 1].time <= t) ri++;
          samples.push(raw[ri].level);
        }
      } else {
        // Fallback: just current level as a flat line
        samples = [currentLevel, currentLevel];
      }

      results.push({
        name: buf.name,
        capacity,
        currentLevel,
        samples,
      });
    }

    return results;
  }, [buffers, kpis.wip.byBuffer, result]);

  if (timelines.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No buffers in model
      </div>
    );
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {timelines.map((tl) => (
        <BufferSparkline key={tl.name} timeline={tl} />
      ))}
    </div>
  );
});
export { BufferSparklines };

function BufferSparkline({ timeline }: { timeline: BufferTimeline }) {
  const { name, capacity, currentLevel, samples } = timeline;
  const w = 120;
  const h = 40;
  const pad = { top: 2, bottom: 2, left: 2, right: 2 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const maxVal = Math.max(capacity, ...samples, 1);

  const points = samples.map((v, i) => {
    const x = pad.left + (i / Math.max(samples.length - 1, 1)) * plotW;
    const y = pad.top + plotH - (v / maxVal) * plotH;
    return `${x},${y}`;
  });

  const fillPct = capacity > 0 ? currentLevel / capacity : 0;
  const fillColor = fillPct > 0.9 ? '#F31260' : fillPct > 0.7 ? '#F5A524' : '#2563EB';

  // Area path (fill under sparkline)
  const areaPoints = [
    `${pad.left},${pad.top + plotH}`,
    ...points,
    `${pad.left + plotW},${pad.top + plotH}`,
  ].join(' ');

  // Short name for display
  const displayName = name.length > 18 ? name.slice(0, 18) + '\u2026' : name;

  return (
    <div className="bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
      <div className="text-[10px] font-medium text-gray-600 truncate mb-0.5" title={name}>
        {displayName}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }}>
        {/* Capacity reference line */}
        <line
          x1={pad.left} y1={pad.top + plotH - (capacity / maxVal) * plotH}
          x2={pad.left + plotW} y2={pad.top + plotH - (capacity / maxVal) * plotH}
          stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3,2"
        />
        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill={fillColor}
          opacity={0.15}
        />
        {/* Sparkline */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={fillColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between items-center mt-0.5">
        <span className="text-[10px] font-mono text-gray-500">
          {currentLevel} / {capacity}
        </span>
        <span
          className="text-[10px] font-mono font-semibold"
          style={{ color: fillColor }}
        >
          {(fillPct * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function findBufferId(nameOrId: string, bufferMap: Map<string, { id: string; name: string }>): string | null {
  // Direct id match
  if (bufferMap.has(nameOrId)) return nameOrId;
  // Name match
  for (const [id, buf] of bufferMap) {
    if (buf.name === nameOrId) return id;
  }
  // Partial match (buffer events sometimes use short names)
  for (const [id, buf] of bufferMap) {
    if (nameOrId.includes(buf.name) || buf.name.includes(nameOrId)) return id;
  }
  return null;
}
