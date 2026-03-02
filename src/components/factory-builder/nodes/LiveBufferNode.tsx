import { memo, useRef, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';

interface LiveBufferNodeData {
  name: string;
  liveLevel?: number;
  liveCapacity?: number;
}

// Inject buffer keyframes — only for FULL alert
const styleId = 'live-buffer-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes buffer-full-glow {
      0%, 100% { box-shadow: 0 0 8px 2px rgba(239,68,68,0.4); }
      50% { box-shadow: 0 0 14px 4px rgba(239,68,68,0.6); }
    }
    .buffer-full-glow { animation: buffer-full-glow 2s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

// Fill color — understated for normal, loud only at extremes
function fillColor(pct: number): string {
  if (pct >= 95) return '#ef4444';  // red — alert
  if (pct >= 80) return '#f97316';  // orange — warning
  if (pct >= 50) return '#eab308';  // yellow — attention
  if (pct > 0) return '#22c55e';    // green — healthy
  return '#64748b';                  // slate — empty
}

export const LiveBufferNode = memo(({ data }: NodeProps<LiveBufferNodeData>) => {
  const level = data.liveLevel ?? 0;
  const capacity = data.liveCapacity ?? 1;
  const pct = capacity > 0 ? (level / capacity) * 100 : 0;

  // Track level delta — only show for large jumps
  const prevLevel = useRef(level);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const d = level - prevLevel.current;
    prevLevel.current = level;
    if (capacity > 0 && Math.abs(d) >= capacity * 0.25) {
      setDelta(d);
      const t = setTimeout(() => setDelta(0), 1500);
      return () => clearTimeout(t);
    }
  }, [level, capacity]);

  const isFull = pct >= 95;
  const fc = fillColor(pct);

  // Tank height — slight growth when full, subtle
  const height = 68 + (pct / 100) * 16;
  const fillH = (pct / 100) * (height - 36);

  const zoom = useStore((s) => (s as any).transform[2]);
  const isCompact = zoom < 0.45;
  const isMicro = zoom < 0.25;

  // Micro tier: tiny colored rectangle with FULL glow
  if (isMicro) {
    return (
      <div style={{ position: 'relative' }} className={isFull ? 'buffer-full-glow' : ''}>
        <Handle type="target" position={Position.Left} className="w-1 h-1" style={{ opacity: 0 }} />
        <div
          style={{
            width: 20, height: 14, borderRadius: 2,
            backgroundColor: isFull ? '#ef4444' : fc,
            opacity: isFull ? 1 : 0.7,
            border: isFull ? '2px solid #fca5a5' : '1px solid #475569',
            boxShadow: isFull ? '0 0 8px rgba(239,68,68,0.7)' : undefined,
          }}
        />
        <Handle type="source" position={Position.Right} className="w-1 h-1" style={{ opacity: 0 }} />
      </div>
    );
  }

  if (isCompact) {
    return (
      <div
        className={`rounded-lg overflow-hidden ${isFull ? 'buffer-full-glow' : ''}`}
        style={{
          minWidth: 60,
          minHeight: 40,
          border: isFull ? '2px solid #ef4444' : '1.5px solid #475569',
          backgroundColor: isFull ? '#2d1519' : '#1e293b',
          boxShadow: isFull ? '0 0 10px 3px rgba(239,68,68,0.5)' : undefined,
          position: 'relative',
        }}
      >
        <Handle type="target" position={Position.Left} className="w-2 h-2" />
        {/* Fill background */}
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${Math.min(100, pct)}%`,
            backgroundColor: fc,
            opacity: 0.3,
            transition: 'height 0.6s ease',
          }}
        />
        {/* Count */}
        <div className="relative z-10 flex items-center justify-center h-full py-1">
          <span className={`font-bold font-mono text-[12px] ${isFull ? 'text-red-400' : 'text-slate-300'}`}>
            {level}
          </span>
        </div>
        {/* FULL badge */}
        {isFull && (
          <div className="absolute top-0 right-0 bg-red-500 rounded-bl px-1" style={{ fontSize: 7, color: '#fff', fontWeight: 900 }}>
            FULL
          </div>
        )}
        <Handle type="source" position={Position.Right} className="w-2 h-2" />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-500 ${
        isFull ? 'buffer-full-glow' : ''
      }`}
      data-buffer-full={isFull ? 'true' : undefined}
      style={{
        minWidth: 120,
        minHeight: height,
        border: isFull ? '3px solid #ef4444'
          : level > 0 ? '1.5px solid #475569'
          : '1.5px solid #334155',
        backgroundColor: isFull ? '#3b1520' : '#1e293b',
        boxShadow: isFull ? '0 0 16px 6px rgba(239,68,68,0.7), inset 0 0 24px rgba(239,68,68,0.2)' : undefined,
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2" />

      {/* Header */}
      <div style={{ padding: '5px 8px 2px', position: 'relative', zIndex: 2 }}>
        <div className="font-semibold text-[10px] truncate leading-tight text-slate-300">
          {data.name}
        </div>
        <div className={`text-center font-bold font-mono tabular-nums mt-0.5 ${
          isFull ? 'text-sm text-red-400' : level > 0 ? 'text-sm text-slate-300' : 'text-xs text-slate-500'
        }`}>
          {level}<span className="text-slate-500 font-normal">/{capacity}</span>
          {delta !== 0 && (
            <span className={`ml-1 text-[9px] ${delta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </div>
      </div>

      {/* Liquid fill — rising from bottom, dramatic at full */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: Math.max(fillH, 0),
          backgroundColor: fc,
          opacity: isFull ? 0.55 : 0.25,
          transition: 'height 0.6s ease, background-color 0.6s ease',
          borderRadius: '0 0 5px 5px',
        }}
      />
      {/* Surface line — thin, subtle */}
      {level > 0 && !isFull && (
        <div
          style={{
            position: 'absolute', bottom: Math.max(fillH, 0),
            left: 0, right: 0, height: 1.5,
            backgroundColor: fc, opacity: 0.5,
            transition: 'bottom 0.6s ease',
          }}
        />
      )}

      {/* FULL badge — high-contrast white-on-red pill */}
      {isFull && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span
            style={{
              backgroundColor: 'rgba(239,68,68,0.85)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
            }}
          >
            FULL {level}/{capacity}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-2 h-2" />
    </div>
  );
});

LiveBufferNode.displayName = 'LiveBufferNode';
