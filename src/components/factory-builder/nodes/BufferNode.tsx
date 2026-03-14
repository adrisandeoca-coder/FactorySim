import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import { Layers } from 'lucide-react';
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
        <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
          <Layers className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[13px] truncate">{data.name}</div>
          <div className="text-[11px] text-gray-500 font-mono tabular-nums">
            Cap: {data.capacity}
          </div>
        </div>
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-500">
        {data.queueRule || 'FIFO'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

BufferNode.displayName = 'BufferNode';
