import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SourceNodeData {
  label: string;
  arrivalRate?: number;
  feedMode?: 'interval' | 'orders';
  productFilter?: string;
  productBatchSize?: number;
  productType?: string;
  isSelected?: boolean;
}

export const SourceNode = memo(({ data, selected }: NodeProps<SourceNodeData>) => {
  const feedMode = data.feedMode || 'interval';

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-green-500 shadow-lg' : 'border-green-300'
      } bg-gradient-to-br from-green-50 to-green-100`}
    >
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8 8-8-8" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-green-900">{data.label}</div>
          <div className="text-xs text-green-600">
            {feedMode === 'orders' ? 'From orders' : data.arrivalRate ? `${data.arrivalRate}s interval` : 'Source'}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <div className={`text-xs rounded px-2 py-0.5 ${feedMode === 'orders' ? 'bg-blue-200 text-blue-800' : 'bg-green-200 text-green-800'}`}>
          {feedMode === 'orders' ? 'Order queue' : 'Interval'}
        </div>
        {data.productType && (
          <div className="text-xs bg-green-200 rounded px-2 py-0.5 text-green-800">
            {data.productType}
          </div>
        )}
        {data.productBatchSize && data.productBatchSize > 1 && (
          <div className="text-xs bg-yellow-200 rounded px-2 py-0.5 text-yellow-800">
            Batch: {data.productBatchSize}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-green-500" />
    </div>
  );
});

SourceNode.displayName = 'SourceNode';
