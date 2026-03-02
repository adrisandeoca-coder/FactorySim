import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import type { Buffer } from '../../../types';

interface BufferNodeData extends Buffer {}

export const BufferNode = memo(({ data, selected }: NodeProps<BufferNodeData>) => {
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);

  if (isCompact) {
    return (
      <div
        className={`rounded-lg border-2 ${selected ? 'border-blue-500 shadow-lg' : 'border-amber-400'} bg-amber-50 overflow-hidden`}
        style={{ minWidth: '80px' }}
      >
        <Handle type="target" position={Position.Left} />
        <div className="bg-amber-500 px-2 py-1.5">
          <div className="font-bold text-[16px] text-white truncate leading-tight">{data.name}</div>
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node buffer ${selected ? 'selected' : ''}`}
      style={{ minWidth: '120px' }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
          <BufferIcon className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{data.name}</div>
          <div className="text-xs text-gray-500">
            Cap: {data.capacity}
          </div>
        </div>
      </div>

      {/* Queue rule indicator */}
      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
        {data.queueRule || 'FIFO'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

BufferNode.displayName = 'BufferNode';

function BufferIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}
