import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitMerge } from 'lucide-react';

interface AssemblyNodeData {
  label: string;
  cycleTime?: number;
  inputParts?: number;
  inputPartsByProduct?: { productId: string; productName: string; quantity: number }[];
  isSelected?: boolean;
}

export const AssemblyNode = memo(({ data, selected }: NodeProps<AssemblyNodeData>) => {
  const hasPerProduct = data.inputPartsByProduct && data.inputPartsByProduct.length > 0;
  const inputParts = hasPerProduct
    ? data.inputPartsByProduct!.reduce((sum, p) => sum + p.quantity, 0)
    : (data.inputParts || 2);

  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-indigo-500 shadow-lg' : 'border-indigo-300'
      } bg-indigo-50`}
    >
      {/* Multiple input handles */}
      {Array.from({ length: hasPerProduct ? data.inputPartsByProduct!.length : (data.inputParts || 2) }).map((_, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          className="w-3 h-3 bg-indigo-500"
          style={{ top: `${((i + 1) / ((hasPerProduct ? data.inputPartsByProduct!.length : (data.inputParts || 2)) + 1)) * 100}%` }}
        />
      ))}
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-indigo-500 rounded flex items-center justify-center">
          <GitMerge className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-indigo-900">{data.label}</div>
          <div className="text-[11px] text-indigo-600">Assembly</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        {hasPerProduct ? (
          data.inputPartsByProduct!.map((p, i) => (
            <div key={i} className="bg-indigo-100 rounded px-1.5 py-0.5 text-indigo-700 font-mono tabular-nums">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-indigo-100 rounded px-1.5 py-0.5 text-indigo-700">
            {inputParts} inputs &rarr; 1 output
          </div>
        )}
        {data.cycleTime && (
          <div className="bg-indigo-100 rounded px-1.5 py-0.5 text-indigo-700 font-mono tabular-nums">
            CT: {data.cycleTime}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
});

AssemblyNode.displayName = 'AssemblyNode';
