import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

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
      className={`px-4 py-3 rounded-lg border-2 min-w-[160px] ${
        selected ? 'border-amber-500 shadow-lg' : 'border-amber-300'
      } bg-gradient-to-br from-amber-50 to-amber-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-amber-900">{data.label}</div>
          <div className="text-xs text-amber-600">Conveyor</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {data.length && (
          <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800">
            {data.length}m
          </div>
        )}
        {data.speed && (
          <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800">
            {data.speed}m/s
          </div>
        )}
        {data.capacity && (
          <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800 col-span-2">
            Cap: {data.capacity}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-500" />
    </div>
  );
});

ConveyorNode.displayName = 'ConveyorNode';
