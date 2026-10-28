import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import { MoveHorizontal } from 'lucide-react';

interface OverheadConveyorNodeData {
  id: string;
  name: string;
  carrierCount: number;
  carrierSpeed: number;
  loadTime: number;
  unloadTime: number;
  trackLength: number;
  _heatmap?: { value: number; color: string };
}

export const OverheadConveyorNode = memo(({ data, selected }: NodeProps<OverheadConveyorNodeData>) => {
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);
  const heatmap = data._heatmap;

  if (isCompact) {
    return (
      <div
        className={`rounded-lg border-2 ${selected ? 'border-blue-500 shadow-lg' : 'border-cyan-400'} bg-cyan-50 overflow-hidden`}
        style={{ minWidth: '120px' }}
      >
        <Handle type="target" position={Position.Left} />
        <div className="bg-cyan-500 px-2 py-1.5 flex items-center">
          <div className="font-bold text-[16px] text-white truncate leading-tight flex-1">{data.name}</div>
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node overhead-conveyor ${selected ? 'selected' : ''}`}
      style={{
        minWidth: '180px',
        ...(heatmap ? { boxShadow: `0 0 12px 3px ${heatmap.color}`, borderColor: heatmap.color, borderWidth: '2px' } : {}),
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <MoveHorizontal className="w-4 h-4 text-cyan-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{data.name}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 font-mono tabular-nums">
            {data.carrierCount} carriers
          </div>
        </div>
      </div>

      {heatmap && (
        <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white shadow"
          style={{ backgroundColor: heatmap.color }}>
          {(heatmap.value * 100).toFixed(0)}%
        </div>
      )}

      <div className="mt-1.5 pt-1.5 border-t border-gray-100 grid grid-cols-2 gap-1 text-[11px] text-gray-500 font-mono tabular-nums">
        <div title="Carrier speed">Speed: {data.carrierSpeed}m/s</div>
        <div title="Track length">Track: {data.trackLength}m</div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

OverheadConveyorNode.displayName = 'OverheadConveyorNode';
