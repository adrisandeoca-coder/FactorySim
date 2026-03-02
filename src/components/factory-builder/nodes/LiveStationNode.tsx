import { memo, useRef, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';

interface LiveStationNodeData {
  name: string;
  liveState?: string;
  currentProduct?: {
    productType: string;
    cycleTime: number;
    startTime: number;
  };
  processedCount?: number;
  simTime?: number;
  utilization?: number;
  isBottleneck?: boolean;
  batchSize?: number;
  batchQueueCount?: number;
}

// Strip distribution type from display name: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ── State config: colors match STATE_LEGEND in LiveSimulationView exactly ──
const stateConfig: Record<string, {
  bg: string; text: string; label: string;
  iconBg: string; stripColor: string;
  borderColor: string; // exact hex matching legend
  borderStyle?: string; dimmed?: boolean;
}> = {
  processing: {
    bg: 'bg-emerald-50', text: 'text-emerald-700',
    label: 'Processing', iconBg: 'bg-emerald-500', stripColor: 'bg-emerald-500',
    borderColor: '#22c55e', // green-500 — matches legend
  },
  idle: {
    bg: 'bg-gray-50', text: 'text-gray-400',
    label: 'Idle', iconBg: 'bg-gray-400', stripColor: 'bg-gray-300',
    borderColor: '#9ca3af', // gray-400 — matches legend
  },
  blocked: {
    bg: 'bg-red-50', text: 'text-red-600',
    label: 'Blocked', iconBg: 'bg-red-500', stripColor: 'bg-red-500',
    borderColor: '#ef4444', // red-500 — matches legend
  },
  starved: {
    bg: 'bg-amber-50', text: 'text-amber-600',
    label: 'Starved', iconBg: 'bg-amber-500', stripColor: 'bg-amber-400',
    borderColor: '#f59e0b', // amber-500 — matches legend
    borderStyle: 'dashed',
  },
  failed: {
    bg: 'bg-red-100', text: 'text-red-800',
    label: 'FAILED', iconBg: 'bg-red-700', stripColor: 'bg-red-700',
    borderColor: '#b91c1c', // red-700 — matches legend
  },
  off_shift: {
    bg: 'bg-slate-100', text: 'text-slate-500',
    label: 'Off Shift', iconBg: 'bg-slate-500', stripColor: 'bg-slate-400',
    borderColor: '#64748b', // slate-500 — matches legend
    borderStyle: 'dashed', dimmed: true,
  },
  setup: {
    bg: 'bg-orange-50', text: 'text-orange-600',
    label: 'Setup', iconBg: 'bg-orange-500', stripColor: 'bg-orange-500',
    borderColor: '#f97316', // orange-500 — matches legend
  },
  batch_wait: {
    bg: 'bg-blue-50', text: 'text-blue-600',
    label: 'Batching', iconBg: 'bg-blue-500', stripColor: 'bg-blue-400',
    borderColor: '#3b82f6', // blue-500
  },
};

const defaultConfig = {
  bg: 'bg-gray-50', text: 'text-gray-400',
  label: '\u2014', iconBg: 'bg-gray-400', stripColor: 'bg-gray-300',
  borderColor: '#d1d5db',
};

// Inject keyframes — only for exceptional states
const styleId = 'live-station-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes flash-red {
      0%, 100% { border-color: #dc2626; }
      50% { border-color: #991b1b; }
    }
    @keyframes state-flash {
      0% { opacity: 0.6; }
      100% { opacity: 0; }
    }
    @keyframes bottleneck-glow {
      0%, 100% { box-shadow: 0 0 8px 2px rgba(220,38,38,0.5); }
      50% { box-shadow: 0 0 16px 4px rgba(220,38,38,0.7); }
    }
    .station-flash-red { animation: flash-red 1.5s ease-in-out infinite; }
    .station-state-flash { animation: state-flash 0.8s ease-out forwards; }
    .bottleneck-glow { animation: bottleneck-glow 2s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

// Utilization ring color — only matters at extremes
function utilColor(util: number): string {
  if (util > 0.95) return '#dc2626';
  if (util > 0.80) return '#ea580c';
  if (util > 0.50) return '#d97706';
  return '#16a34a';
}

export const LiveStationNode = memo(({ data }: NodeProps<LiveStationNodeData>) => {
  const state = data.liveState || 'idle';
  const cfg = stateConfig[state] || defaultConfig;
  const product = data.currentProduct;
  const processedCount = data.processedCount || 0;
  const simTime = data.simTime || 0;
  const utilization = data.utilization ?? 0;
  const isBottleneck = data.isBottleneck || false;
  const batchSize = data.batchSize ?? 1;
  const batchQueueCount = data.batchQueueCount ?? 0;

  const zoom = useStore((s) => (s as any).transform[2]);
  const isCompact = zoom < 0.45;
  const isMicro = zoom < 0.25;

  // Detect state changes — brief flash then quiet
  const prevState = useRef(state);
  const [justChanged, setJustChanged] = useState(false);
  useEffect(() => {
    if (prevState.current !== state) {
      setJustChanged(true);
      prevState.current = state;
      const t = setTimeout(() => setJustChanged(false), 800);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Cycle time progress bar
  let cycleProgress = 0;
  if (product && product.cycleTime > 0) {
    cycleProgress = Math.min(1, (simTime - product.startTime) / product.cycleTime);
  }

  // Micro tier: minimal colored dot + name for very zoomed-out views
  if (isMicro) {
    return (
      <div className="flex flex-col items-center" style={{ overflow: 'visible' }}>
        <Handle type="target" position={Position.Left} className="w-1 h-1" style={{ opacity: 0 }} />
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%',
            backgroundColor: cfg.borderColor,
            border: isBottleneck ? '3px solid #dc2626' : '2px solid rgba(255,255,255,0.3)',
            boxShadow: isBottleneck ? '0 0 10px rgba(220,38,38,0.6)' : undefined,
          }}
        />
        <span
          style={{
            fontSize: 7, color: '#cbd5e1', fontWeight: 700,
            marginTop: 2, whiteSpace: 'nowrap', overflow: 'visible',
            textAlign: 'center', lineHeight: 1,
          }}
        >
          {shortName(data.name)}
        </span>
        <Handle type="source" position={Position.Right} className="w-1 h-1" style={{ opacity: 0 }} />
      </div>
    );
  }

  if (isCompact) {
    return (
      <div
        className={`relative rounded-lg border-2 overflow-hidden ${cfg.bg} ${cfg.dimmed ? 'opacity-55' : ''}`}
        style={{
          minWidth: 120,
          borderColor: isBottleneck && state !== 'failed' ? '#dc2626' : cfg.borderColor,
          borderWidth: isBottleneck ? 3 : 2,
          ...(cfg.borderStyle === 'dashed' ? { borderStyle: 'dashed' as const } : {}),
        }}
      >
        <Handle type="target" position={Position.Left} className="w-2 h-2" />
        {/* Color strip */}
        <div className={`h-1 w-full ${cfg.stripColor} rounded-t-[6px]`} />
        <div className="px-2 py-1 flex items-center space-x-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${cfg.iconBg} flex-shrink-0`} />
          <span className="font-bold text-[12px] text-gray-900 truncate leading-tight">{shortName(data.name)}</span>
        </div>
        {/* Bottleneck badge */}
        {isBottleneck && (
          <div style={{
            position: 'absolute', top: -5, right: -5,
            width: 16, height: 16, borderRadius: '50%',
            backgroundColor: '#dc2626', border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}>
            <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>!</span>
          </div>
        )}
        {/* Failed badge */}
        {state === 'failed' && (
          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center z-10 border-2 border-white shadow-md">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
            </svg>
          </div>
        )}
        <Handle type="source" position={Position.Right} className="w-2 h-2" />
      </div>
    );
  }

  // Utilization arc — static, no animation. Small and tight around card.
  const showRing = utilization > 0.05;
  const uColor = utilColor(utilization);

  return (
    <div
      className={`relative rounded-xl border-2 min-w-[200px] overflow-visible transition-colors duration-500 ${cfg.bg} ${
        cfg.dimmed ? 'opacity-55' : ''
      }`}
      style={{
        borderColor: isBottleneck && state !== 'failed' ? '#dc2626' : cfg.borderColor,
        borderWidth: isBottleneck && state !== 'failed' ? 3 : 2,
        ...(cfg.borderStyle === 'dashed' ? { borderStyle: 'dashed' as const } : {}),
        ...(state === 'failed' ? { boxShadow: '0 0 14px 3px rgba(220,38,38,0.5)' } : {}),
      }}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2" />

      {/* State change flash — brief highlight, then gone */}
      {justChanged && (
        <div className="absolute -inset-0.5 rounded-xl border-2 border-yellow-400/60 station-state-flash pointer-events-none" />
      )}

      {/* Failed: pulsing border + lightning badge (ONLY exceptional animation) */}
      {state === 'failed' && (
        <div className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-red-600 flex items-center justify-center z-10 border-2 border-white shadow-md"
          style={{ boxShadow: '0 0 8px 2px rgba(220,38,38,0.6)' }}>
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
        </div>
      )}

      {/* Off-shift: subtle hatching */}
      {state === 'off_shift' && (
        <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden" style={{ opacity: 0.12 }}>
          <svg width="100%" height="100%">
            <defs>
              <pattern id="hatch-station" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" strokeWidth="1.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hatch-station)"/>
          </svg>
        </div>
      )}

      {/* Bottleneck: slow pulsing glow (only animation for non-failure alerts) */}
      {isBottleneck && state !== 'failed' && (
        <div className="absolute -inset-0.5 rounded-xl bottleneck-glow pointer-events-none" />
      )}

      {/* Top color strip — thin, color-coded */}
      <div className={`h-1 w-full ${cfg.stripColor} transition-colors duration-500 rounded-t-[10px]`} />

      <div className="px-3 py-2">
        {/* Header row */}
        <div className="flex items-center space-x-2">
          {/* Icon — static for normal states, no spinning gear */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.iconBg} transition-colors duration-500 relative`}>
            {state === 'failed' ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
              </svg>
            ) : state === 'processing' ? (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : state === 'off_shift' ? (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            ) : state === 'setup' ? (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.648 5.648a2.625 2.625 0 01-3.712-3.712l5.648-5.648m0 0l1.414-1.414a2.625 2.625 0 013.712 0l1.414 1.414a2.625 2.625 0 010 3.712l-1.414 1.414m-3.712-3.712L15.75 7.5" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900 truncate leading-tight" title={data.name}>{shortName(data.name)}</div>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.iconBg}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
            </div>
          </div>
          {/* Processed count — quiet dark pill */}
          {processedCount > 0 && (
            <span
              className="text-[10px] font-bold font-mono rounded-full px-1.5 py-0.5 text-center leading-tight"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#cbd5e1' }}
            >
              {processedCount > 999 ? `${(processedCount / 1000).toFixed(1)}k` : processedCount}
            </span>
          )}
        </div>

        {/* Processing details — calm, no entity dot clutter */}
        {state === 'processing' && product && (
          <div className="mt-1.5 bg-emerald-500/8 rounded-lg px-2 py-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-700 font-medium truncate max-w-[100px]">
                {product.productType}
              </span>
              {product.cycleTime > 0 && (
                <span className="text-[9px] text-emerald-500 font-mono">
                  {product.cycleTime.toFixed(1)}s
                </span>
              )}
            </div>
            {product.cycleTime > 0 && (
              <div className="w-full h-1 bg-emerald-200 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, cycleProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Batch accumulation progress */}
        {batchSize > 1 && batchQueueCount > 0 && (state === 'batch_wait' || state === 'starved') && (
          <div className="mt-1.5 bg-blue-500/8 rounded-lg px-2 py-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-blue-700 font-medium">Batch</span>
              <span className="text-[9px] text-blue-500 font-mono font-bold">{batchQueueCount}/{batchSize}</span>
            </div>
            <div className="w-full h-1 bg-blue-200 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (batchQueueCount / batchSize) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Exceptional state details — these are the ones that should draw the eye */}
        {state === 'blocked' && (
          <div className="mt-1 bg-red-500/10 rounded px-2 py-0.5 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[9px] text-red-600 font-medium">Output blocked</span>
          </div>
        )}
        {state === 'starved' && (
          <div className="mt-1 bg-amber-500/8 rounded px-2 py-0.5 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[9px] text-amber-600 font-medium">Waiting for input</span>
          </div>
        )}
        {state === 'failed' && (
          <div className="mt-1 bg-red-600 rounded px-2 py-0.5 flex items-center justify-center space-x-1">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" /></svg>
            <span className="text-[10px] text-white font-black uppercase tracking-wide">FAILED</span>
          </div>
        )}
        {state === 'off_shift' && (
          <div className="mt-1 rounded px-2 py-0.5 flex items-center space-x-1" style={{ backgroundColor: 'rgba(100,116,139,0.1)' }}>
            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[9px] text-slate-500 font-medium">Off Shift</span>
          </div>
        )}
        {state === 'setup' && (
          <div className="mt-1 bg-orange-500/8 rounded px-2 py-0.5 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-[9px] text-orange-600 font-medium">Changeover</span>
          </div>
        )}
        {state === 'batch_wait' && batchQueueCount === 0 && (
          <div className="mt-1 bg-blue-500/8 rounded px-2 py-0.5 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-[9px] text-blue-600 font-medium">Accumulating batch</span>
          </div>
        )}
      </div>

      {/* Utilization — small static bar at bottom, no ring/arc clutter */}
      {showRing && (
        <div className="px-3 pb-1.5">
          <div className="flex items-center space-x-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${utilization * 100}%`, backgroundColor: uColor }}
              />
            </div>
            <span className="text-[9px] font-bold font-mono tabular-nums" style={{ color: uColor, minWidth: 24, textAlign: 'right' }}>
              {(utilization * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Bottleneck badge — the ONE animated thing on this node */}
      {isBottleneck && (
        <div style={{
          position: 'absolute', top: -7, right: -7,
          width: 20, height: 20, borderRadius: '50%',
          backgroundColor: '#dc2626', border: '2px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}>
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>!</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-2 h-2" />
    </div>
  );
});

LiveStationNode.displayName = 'LiveStationNode';
