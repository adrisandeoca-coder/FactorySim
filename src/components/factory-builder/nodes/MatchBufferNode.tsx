import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface MatchBufferNodeData {
  label: string;
  capacity?: number;
  matchKey?: 'order' | 'batch';
  requiredParts?: { productId: string; productName: string; quantity: number }[];
  timeout?: number;
  isSelected?: boolean;
}

export const MatchBufferNode = memo(({ data, selected }: NodeProps<MatchBufferNodeData>) => {
  const requiredParts = data.requiredParts || [];
  const inputCount = Math.max(requiredParts.length, 1);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[160px] ${
        selected ? 'border-purple-500 shadow-lg' : 'border-purple-300'
      } bg-gradient-to-br from-purple-50 to-purple-100`}
    >
      {/* Multiple input handles */}
      {Array.from({ length: inputCount }).map((_, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          className="w-3 h-3 bg-purple-500"
          style={{ top: `${((i + 1) / (inputCount + 1)) * 100}%` }}
        />
      ))}
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-purple-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-purple-900">{data.label}</div>
          <div className="text-xs text-purple-600">
            Match by {data.matchKey || 'order'}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="bg-purple-200 rounded px-2 py-0.5 text-purple-800">
          Cap: {data.capacity || 20}
        </div>
        {requiredParts.length > 0 ? (
          requiredParts.map((p, i) => (
            <div key={i} className="bg-purple-200 rounded px-2 py-0.5 text-purple-800">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-purple-200 rounded px-2 py-0.5 text-purple-800">
            No parts configured
          </div>
        )}
        {data.timeout && (
          <div className="bg-purple-200 rounded px-2 py-0.5 text-purple-800">
            Timeout: {data.timeout}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
    </div>
  );
});

MatchBufferNode.displayName = 'MatchBufferNode';
