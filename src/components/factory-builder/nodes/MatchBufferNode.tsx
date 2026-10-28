import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Link2 } from 'lucide-react';

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
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[155px] ${
        selected ? 'border-purple-500 shadow-lg' : 'border-purple-300'
      } bg-purple-50`}
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
        <div className="w-7 h-7 bg-purple-500 rounded flex items-center justify-center">
          <Link2 className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-purple-900">{data.label}</div>
          <div className="text-[11px] text-purple-600">
            Match by {data.matchKey || 'order'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        <div className="bg-purple-100 rounded px-1.5 py-0.5 text-purple-700 font-mono tabular-nums">
          Cap: {data.capacity || 20}
        </div>
        {requiredParts.length > 0 ? (
          requiredParts.map((p, i) => (
            <div key={i} className="bg-purple-100 rounded px-1.5 py-0.5 text-purple-700 font-mono tabular-nums">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-purple-100 rounded px-1.5 py-0.5 text-purple-700">
            No parts configured
          </div>
        )}
        {data.timeout && (
          <div className="bg-purple-100 rounded px-1.5 py-0.5 text-purple-700 font-mono tabular-nums">
            Timeout: {data.timeout}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
    </div>
  );
});

MatchBufferNode.displayName = 'MatchBufferNode';
