import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import type { Station } from '../../../types';

interface StationNodeData extends Station {}

const DIST_ABBREV: Record<string, string> = {
  constant: 'C', normal: 'N', lognormal: 'LN', exponential: 'E',
  triangular: 'T', uniform: 'U', weibull: 'W',
};

function getCycleTimeDisplay(ct?: { type?: string; parameters?: Record<string, number | number[]> }): { value: number; approx: boolean; distAbbrev: string } {
  if (!ct?.parameters) return { value: 0, approx: false, distAbbrev: '' };
  const p = ct.parameters as Record<string, number>;
  const distAbbrev = DIST_ABBREV[ct.type || ''] || '';
  switch (ct.type) {
    case 'constant': return { value: p.value ?? 0, approx: false, distAbbrev };
    case 'normal': case 'lognormal': case 'exponential': return { value: p.mean ?? 0, approx: true, distAbbrev };
    case 'triangular': return { value: (p.mode ?? ((p.min + p.max) / 2)) || 0, approx: true, distAbbrev };
    case 'uniform': return { value: ((p.min + p.max) / 2) || 0, approx: true, distAbbrev };
    case 'weibull': return { value: Math.round(p.scale ?? 0), approx: true, distAbbrev };
    default: return { value: 0, approx: false, distAbbrev };
  }
}

export const StationNode = memo(({ data, selected }: NodeProps<StationNodeData>) => {
  const { value: cycleTime, approx, distAbbrev } = getCycleTimeDisplay(data.cycleTime);
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);
  const hasScrap = (data.scrapRate ?? 0) > 0;

  if (isCompact) {
    return (
      <div
        className={`rounded-lg border-2 ${selected ? 'border-blue-500 shadow-lg' : 'border-green-400'} bg-green-50 overflow-hidden`}
        style={{ minWidth: '120px' }}
      >
        <Handle type="target" position={Position.Left} />
        <div className="bg-green-500 px-2 py-1.5 flex items-center">
          <div className="font-bold text-[16px] text-white truncate leading-tight flex-1">{data.name}</div>
          {hasScrap && <div className="w-2 h-2 rounded-full bg-red-400 ml-1 flex-shrink-0" title={`Scrap: ${((data.scrapRate ?? 0) * 100).toFixed(1)}%`} />}
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node station ${selected ? 'selected' : ''}`}
      style={{ minWidth: '180px' }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center space-x-2.5">
        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <StationIcon className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] text-gray-900 truncate leading-tight">{data.name}</div>
          <div className="text-xs text-gray-600 mt-0.5">
            CT: {approx ? '~' : ''}{cycleTime}s{distAbbrev ? ` (${distAbbrev})` : ''}
          </div>
        </div>
      </div>

      {/* Additional details */}
      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-1 text-xs text-gray-600">
        {data.mtbf && (
          <div title="Mean Time Between Failures">
            MTBF: {data.mtbf}h
          </div>
        )}
        {data.scrapRate !== undefined && data.scrapRate > 0 && (
          <div title="Scrap Rate">
            Scrap: {(data.scrapRate * 100).toFixed(1)}%
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

StationNode.displayName = 'StationNode';

function StationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}
