import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LogOut } from 'lucide-react';

interface SinkNodeData {
  label: string;
  totalProcessed?: number;
  isSelected?: boolean;
}

export const SinkNode = memo(({ data, selected }: NodeProps<SinkNodeData>) => {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-red-500 shadow-lg' : 'border-red-300'
      } bg-red-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-red-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center">
          <LogOut className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-red-900">{data.label}</div>
          <div className="text-[11px] text-red-600">Sink / Exit</div>
        </div>
      </div>
      {data.totalProcessed !== undefined && (
        <div className="mt-1.5 text-[11px] bg-red-100 rounded px-1.5 py-0.5 text-red-700 font-mono tabular-nums">
          {data.totalProcessed} processed
        </div>
      )}
    </div>
  );
});

SinkNode.displayName = 'SinkNode';
