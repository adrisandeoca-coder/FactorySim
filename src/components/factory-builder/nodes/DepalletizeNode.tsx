import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { PackageOpen } from 'lucide-react';

interface DepalletizeNodeData {
  label: string;
  cycleTime?: number;
  isSelected?: boolean;
}

export const DepalletizeNode = memo(({ data, selected }: NodeProps<DepalletizeNodeData>) => {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-yellow-600 shadow-lg' : 'border-yellow-400'
      } bg-yellow-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-yellow-600" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-yellow-600 rounded flex items-center justify-center">
          <PackageOpen className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-yellow-900">{data.label}</div>
          <div className="text-[11px] text-yellow-700">Depalletize</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        <div className="bg-yellow-100 rounded px-1.5 py-0.5 text-yellow-700">
          Unloads until empty
        </div>
        {data.cycleTime && (
          <div className="bg-yellow-100 rounded px-1.5 py-0.5 text-yellow-700 font-mono tabular-nums">
            {data.cycleTime}s per item
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-yellow-600" />
    </div>
  );
});

DepalletizeNode.displayName = 'DepalletizeNode';
