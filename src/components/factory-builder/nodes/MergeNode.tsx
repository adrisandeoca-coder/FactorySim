import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface MergeNodeData {
  label: string;
  inputs?: number;
  mergeType?: 'fifo' | 'priority' | 'alternating';
  isSelected?: boolean;
}

export const MergeNode = memo(({ data, selected }: NodeProps<MergeNodeData>) => {
  const inputs = data.inputs || 2;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-emerald-500 shadow-lg' : 'border-emerald-300'
      } bg-gradient-to-br from-emerald-50 to-emerald-100`}
    >
      {/* Multiple input handles */}
      {Array.from({ length: inputs }).map((_, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          className="w-3 h-3 bg-emerald-500"
          style={{ top: `${((i + 1) / (inputs + 1)) * 100}%` }}
        />
      ))}
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-emerald-900">{data.label}</div>
          <div className="text-xs text-emerald-600">Merge</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="bg-emerald-200 rounded px-2 py-0.5 text-emerald-800">
          {inputs} inputs → 1 output
        </div>
        {data.mergeType && (
          <div className="bg-emerald-200 rounded px-2 py-0.5 text-emerald-800">
            Type: {data.mergeType.toUpperCase()}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500" />
    </div>
  );
});

MergeNode.displayName = 'MergeNode';
