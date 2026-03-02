import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface DepalletizeNodeData {
  label: string;
  cycleTime?: number;
  isSelected?: boolean;
}

export const DepalletizeNode = memo(({ data, selected }: NodeProps<DepalletizeNodeData>) => {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-yellow-600 shadow-lg' : 'border-yellow-400'
      } bg-gradient-to-br from-yellow-50 to-yellow-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-yellow-600" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-yellow-600 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-yellow-900">{data.label}</div>
          <div className="text-xs text-yellow-700">Depalletize</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="bg-yellow-200 rounded px-2 py-0.5 text-yellow-800">
          Unloads until empty
        </div>
        {data.cycleTime && (
          <div className="bg-yellow-200 rounded px-2 py-0.5 text-yellow-800">
            {data.cycleTime}s per item
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-yellow-600" />
    </div>
  );
});

DepalletizeNode.displayName = 'DepalletizeNode';
