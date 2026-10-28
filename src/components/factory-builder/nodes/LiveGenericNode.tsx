import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface LiveGenericNodeData {
  name: string;
  nodeType: string;
  completedCount?: number;
  generatedCount?: number;
  exitedCount?: number;
  simTime?: number;
}

// Inject pulse animation
const styleId = 'live-generic-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes source-emit {
      0% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.3); opacity: 0.3; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    .source-emit-ring { animation: source-emit 2s ease-out infinite; }
    @keyframes conveyor-scroll {
      from { background-position: 0 0; }
      to { background-position: 12px 0; }
    }
  `;
  document.head.appendChild(style);
}

export const LiveGenericNode = memo(({ data }: NodeProps<LiveGenericNodeData>) => {
  const isSink = data.nodeType === 'sink';
  const isSource = data.nodeType === 'source';
  const isConveyor = data.nodeType === 'conveyor';
  const generatedCount = data.generatedCount || 0;
  const exitedCount = data.exitedCount || data.completedCount || 0;

  const simTime = data.simTime || 0;
  const sinkRate = simTime > 60 && exitedCount > 0 ? (exitedCount / simTime) * 3600 : 0;
  const sourceRate = simTime > 60 && generatedCount > 0 ? (generatedCount / simTime) * 3600 : 0;

  return (
    <div
      className={`relative rounded-xl border-2 min-w-[140px] overflow-visible shadow-sm ${
        isSource
          ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-green-400 shadow-green-200/40 shadow-md'
          : isSink
          ? 'bg-gradient-to-br from-rose-50 to-red-100 border-red-400 shadow-red-200/40 shadow-md'
          : isConveyor
          ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-400 shadow-cyan-200/30 shadow-md'
          : 'bg-gradient-to-br from-gray-50 to-slate-100 border-slate-300'
      }`}
    >
      {!isSource && <Handle type="target" position={Position.Left} className="w-2 h-2" />}

      {/* Emit pulse for sources */}
      {isSource && generatedCount > 0 && (
        <div className="absolute -inset-1 rounded-xl border-2 border-green-400 source-emit-ring pointer-events-none" />
      )}

      {/* GAP #7 — Conveyor belt visual: animated dashed line at top */}
      {isConveyor && (
        <div className="absolute top-0 left-2 right-2 h-1.5 overflow-hidden rounded-t-lg">
          <div className="w-full h-full"
            style={{
              background: 'repeating-linear-gradient(90deg, #06b6d4 0px, #06b6d4 6px, transparent 6px, transparent 12px)',
              backgroundSize: '12px 100%',
              animation: 'conveyor-scroll 1s linear infinite',
            }}
          />
        </div>
      )}

      {/* Top strip (skip for conveyor — has its own) */}
      {!isConveyor && (
        <div className={`h-1.5 w-full rounded-t-[10px] ${isSource ? 'bg-green-500' : isSink ? 'bg-red-500' : 'bg-slate-400'}`} />
      )}

      <div className="px-3 py-2">
        <div className="flex items-center space-x-2">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${
              isSource ? 'bg-green-500' : isSink ? 'bg-red-500' : isConveyor ? 'bg-cyan-500' : 'bg-slate-500'
            }`}
          >
            {isSource ? (
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8 8-8-8" />
              </svg>
            ) : isSink ? (
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : isConveyor ? (
              /* GAP #7 — Conveyor belt icon */
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className={`font-semibold text-xs truncate leading-tight ${
                isSource ? 'text-green-900' : isSink ? 'text-red-900' : isConveyor ? 'text-cyan-900' : 'text-gray-900'
              }`}
            >
              {data.name}
            </div>
            <div
              className={`text-[10px] font-bold uppercase tracking-wide ${
                isSource ? 'text-green-600' : isSink ? 'text-red-600' : isConveyor ? 'text-cyan-600' : 'text-gray-500'
              }`}
            >
              {isSource ? 'Source' : isSink ? 'Sink' : isConveyor ? 'Conveyor' : data.nodeType}
            </div>
          </div>
        </div>

        {/* Sink metrics */}
        {isSink && exitedCount > 0 && (
          <div className="mt-1.5 bg-red-500/10 rounded-lg px-2 py-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[12px] font-bold text-red-700">{exitedCount.toLocaleString()}</span>
              </div>
              {sinkRate > 0 && (
                <span className="text-[9px] text-red-400 font-mono bg-red-500/10 rounded px-1 py-0.5">
                  {sinkRate.toFixed(0)}/hr
                </span>
              )}
            </div>
          </div>
        )}

        {/* Source metrics */}
        {isSource && (
          <div className="mt-1.5 bg-green-500/10 rounded-lg px-2 py-1">
            {generatedCount > 0 ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[12px] font-bold text-green-700">{generatedCount.toLocaleString()}</span>
                </div>
                {sourceRate > 0 && (
                  <span className="text-[9px] text-green-400 font-mono bg-green-500/10 rounded px-1 py-0.5">
                    {sourceRate.toFixed(0)}/hr
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Ready</span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isSink && <Handle type="source" position={Position.Right} className="w-2 h-2" />}
    </div>
  );
});

LiveGenericNode.displayName = 'LiveGenericNode';
