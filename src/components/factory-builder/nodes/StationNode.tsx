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

/* Inline SVG — CNC machine cabinet icon */
function MachineIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <rect x="5" y="6" width="10" height="5" rx="1" />
      <circle cx="6.5" cy="15" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="15" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const StationNode = memo(({ data, selected }: NodeProps<StationNodeData>) => {
  const { value: cycleTime, approx, distAbbrev } = getCycleTimeDisplay(data.cycleTime);
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);
  const hasScrap = (data.scrapRate ?? 0) > 0;
  const heatmap = (data as any)._heatmap as { value: number; color: string } | undefined;
  const hasMtbf = !!data.mtbf;

  /* ── Compact (zoomed out) mode ── */
  if (isCompact) {
    return (
      <div
        className={`factory-node station ${selected ? 'selected' : ''}`}
        style={{ minWidth: 100, padding: 0 }}
      >
        <Handle type="target" position={Position.Left} />
        <div style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          padding: '5px 8px',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <span style={{ color: '#bfdbfe', width: 14, height: 14, display: 'flex' }}><MachineIcon /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name}
          </span>
          {hasScrap && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fca5a5', flexShrink: 0 }} />}
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node station ${selected ? 'selected' : ''}`}
      style={{
        minWidth: 172,
        padding: 0,
        ...(heatmap ? {
          boxShadow: `0 0 0 2px ${heatmap.color}, 0 4px 16px ${heatmap.color}44`,
          borderLeftColor: heatmap.color,
        } : {}),
      }}
    >
      <Handle type="target" position={Position.Left} />

      {/* Heatmap utilization badge */}
      {heatmap && (
        <div
          className="absolute -top-2.5 -right-2.5 w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg z-10"
          style={{ background: heatmap.color, boxShadow: `0 0 8px ${heatmap.color}` }}
        >
          {(heatmap.value * 100).toFixed(0)}%
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 7px',
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderBottom: '1px solid #dbeafe',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(37,99,235,0.4)',
          color: '#fff',
        }}>
          <MachineIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {data.name}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            {distAbbrev ? `${distAbbrev} · ` : ''}{approx ? '~' : ''}{cycleTime}s cycle
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '6px 10px 7px', display: 'flex', gap: 10 }}>
        {/* Cycle time pill */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>CT</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {approx ? '~' : ''}{cycleTime}<span style={{ fontSize: 9, fontWeight: 500, color: '#6b7280', marginLeft: 1 }}>s</span>
          </span>
        </div>

        {hasMtbf && (
          <>
            <div style={{ width: 1, background: '#f1f5f9', alignSelf: 'stretch' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>MTBF</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#d97706', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {data.mtbf}h
              </span>
            </div>
          </>
        )}

        {hasScrap && (
          <>
            <div style={{ width: 1, background: '#f1f5f9', alignSelf: 'stretch' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>Scrap</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {((data.scrapRate ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

StationNode.displayName = 'StationNode';
