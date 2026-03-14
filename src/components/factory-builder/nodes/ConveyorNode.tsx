import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronsRight } from 'lucide-react';

interface ConveyorNodeData {
  label: string;
  length?: number;
  speed?: number;
  capacity?: number;
  isSelected?: boolean;
}

export const ConveyorNode = memo(({ data, selected }: NodeProps<ConveyorNodeData>) => {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-amber-500 shadow-lg' : 'border-amber-300'
      } bg-amber-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center">
          <ChevronsRight className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-amber-900">{data.label}</div>
          <div className="text-[11px] text-amber-600">Conveyor</div>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] font-mono tabular-nums">
        {data.length && (
          <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700">
            {data.length}m
          </div>
        )}
        {data.speed && (
          <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700">
            {data.speed}m/s
          </div>
        )}
        {data.capacity && (
          <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700 col-span-2">
            Cap: {data.capacity}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-500" />
    </div>
  );
});

ConveyorNode.displayName = 'ConveyorNode';
