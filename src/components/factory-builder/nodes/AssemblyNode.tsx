import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

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
      className={`px-4 py-3 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-indigo-500 shadow-lg' : 'border-indigo-300'
      } bg-gradient-to-br from-indigo-50 to-indigo-100`}
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
        <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-indigo-900">{data.label}</div>
          <div className="text-xs text-indigo-600">Assembly</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {hasPerProduct ? (
          data.inputPartsByProduct!.map((p, i) => (
            <div key={i} className="bg-indigo-200 rounded px-2 py-0.5 text-indigo-800">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-indigo-200 rounded px-2 py-0.5 text-indigo-800">
            {inputParts} inputs &rarr; 1 output
          </div>
        )}
        {data.cycleTime && (
          <div className="bg-indigo-200 rounded px-2 py-0.5 text-indigo-800">
            Cycle: {data.cycleTime}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
});

AssemblyNode.displayName = 'AssemblyNode';
