import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SinkNodeData {
  label: string;
  totalProcessed?: number;
  isSelected?: boolean;
}

export const SinkNode = memo(({ data, selected }: NodeProps<SinkNodeData>) => {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-red-500 shadow-lg' : 'border-red-300'
      } bg-gradient-to-br from-red-50 to-red-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-red-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-red-900">{data.label}</div>
          <div className="text-xs text-red-600">Sink / Exit</div>
        </div>
      </div>
      {data.totalProcessed !== undefined && (
        <div className="mt-2 text-xs bg-red-200 rounded px-2 py-1 text-red-800">
          {data.totalProcessed} processed
        </div>
      )}
    </div>
  );
});

SinkNode.displayName = 'SinkNode';
