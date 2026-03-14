import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ArrowDownCircle } from 'lucide-react';

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
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-green-500 shadow-lg' : 'border-green-300'
      } bg-green-50`}
    >
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
          <ArrowDownCircle className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-green-900">{data.label}</div>
          <div className="text-[11px] text-green-600">
            {feedMode === 'orders' ? 'From orders' : data.arrivalRate ? `${data.arrivalRate}s interval` : 'Source'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        <div className={`text-[11px] rounded px-1.5 py-0.5 ${feedMode === 'orders' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {feedMode === 'orders' ? 'Order queue' : 'Interval'}
        </div>
        {data.productType && (
          <div className="text-[11px] bg-green-100 rounded px-1.5 py-0.5 text-green-700">
            {data.productType}
          </div>
        )}
        {data.productBatchSize && data.productBatchSize > 1 && (
          <div className="text-[11px] bg-yellow-100 rounded px-1.5 py-0.5 text-yellow-700 font-mono tabular-nums">
            Batch: {data.productBatchSize}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-green-500" />
    </div>
  );
});

SourceNode.displayName = 'SourceNode';
