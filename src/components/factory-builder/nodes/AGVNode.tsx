import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Truck } from 'lucide-react';

interface AGVNodeData {
  label: string;
  count?: number;
  speed?: number;
  capacity?: number;
  isSelected?: boolean;
}

export const AGVNode = memo(({ data, selected }: NodeProps<AGVNodeData>) => {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-cyan-500 shadow-lg' : 'border-cyan-300'
      } bg-cyan-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-cyan-600 rounded-full flex items-center justify-center">
          <Truck className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-cyan-900">{data.label}</div>
          <div className="text-[11px] text-cyan-600">
            {data.count ? `${data.count} AGVs` : 'AGV'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {data.speed != null && (
          <div className="text-[11px] bg-cyan-100 rounded px-1.5 py-0.5 text-cyan-700">
            Speed: {data.speed} m/s
          </div>
        )}
        {data.capacity != null && (
          <div className="text-[11px] bg-cyan-100 rounded px-1.5 py-0.5 text-cyan-700">
            Capacity: {data.capacity} units
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500" />
    </div>
  );
});

AGVNode.displayName = 'AGVNode';
