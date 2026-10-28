import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Merge } from 'lucide-react';

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
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-emerald-500 shadow-lg' : 'border-emerald-300'
      } bg-emerald-50`}
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
        <div className="w-7 h-7 bg-emerald-500 rounded flex items-center justify-center">
          <Merge className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-emerald-900">{data.label}</div>
          <div className="text-[11px] text-emerald-600">Merge</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        <div className="bg-emerald-100 rounded px-1.5 py-0.5 text-emerald-700 font-mono tabular-nums">
          {inputs} inputs &rarr; 1 output
        </div>
        {data.mergeType && (
          <div className="bg-emerald-100 rounded px-1.5 py-0.5 text-emerald-700">
            {data.mergeType.toUpperCase()}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500" />
    </div>
  );
});

MergeNode.displayName = 'MergeNode';
