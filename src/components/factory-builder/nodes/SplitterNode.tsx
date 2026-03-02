import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SplitterNodeData {
  label: string;
  outputs?: number;
  splitType?: 'equal' | 'percentage' | 'conditional' | 'product-based';
  percentages?: number[];
  productRouting?: Record<string, number>;
  isSelected?: boolean;
}

export const SplitterNode = memo(({ data, selected }: NodeProps<SplitterNodeData>) => {
  const outputs = data.outputs || 2;
  const percentages = data.percentages || Array(outputs).fill(100 / outputs);
  const isProductBased = data.splitType === 'product-based';
  const productRouting = data.productRouting || {};

  // Build reverse mapping: output index -> product names
  const outputProductMap: Record<number, string[]> = {};
  if (isProductBased) {
    for (const [productId, outputIdx] of Object.entries(productRouting)) {
      if (!outputProductMap[outputIdx]) outputProductMap[outputIdx] = [];
      outputProductMap[outputIdx].push(productId);
    }
  }

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-teal-500 shadow-lg' : 'border-teal-300'
      } bg-gradient-to-br from-teal-50 to-teal-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-teal-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-teal-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-teal-900">{data.label}</div>
          <div className="text-xs text-teal-600">
            {data.splitType || 'Splitter'}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-teal-700">
        {isProductBased ? (
          Array.from({ length: outputs }).map((_, i) => (
            <div key={i} className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              <span>Out {i + 1}: {outputProductMap[i]?.join(', ') || '(none)'}</span>
            </div>
          ))
        ) : (
          percentages.map((p, i) => (
            <div key={i} className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              <span>Output {i + 1}: {p.toFixed(0)}%</span>
            </div>
          ))
        )}
      </div>
      {/* Multiple output handles */}
      {Array.from({ length: outputs }).map((_, i) => (
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          className="w-3 h-3 bg-teal-500"
          style={{ top: `${((i + 1) / (outputs + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});

SplitterNode.displayName = 'SplitterNode';
