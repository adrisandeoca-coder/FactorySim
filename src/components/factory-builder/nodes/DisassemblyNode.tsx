import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface DisassemblyNodeData {
  label: string;
  cycleTime?: number;
  outputParts?: { productId: string; productName: string; quantity: number }[];
  isSelected?: boolean;
}

export const DisassemblyNode = memo(({ data, selected }: NodeProps<DisassemblyNodeData>) => {
  const outputParts = data.outputParts || [];
  const outputCount = Math.max(outputParts.length, 1);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-orange-500 shadow-lg' : 'border-orange-300'
      } bg-gradient-to-br from-orange-50 to-orange-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-orange-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-orange-900">{data.label}</div>
          <div className="text-xs text-orange-600">Disassembly</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {data.cycleTime && (
          <div className="bg-orange-200 rounded px-2 py-0.5 text-orange-800">
            Cycle: {data.cycleTime}s
          </div>
        )}
        {outputParts.length > 0 ? (
          outputParts.map((p, i) => (
            <div key={i} className="bg-orange-200 rounded px-2 py-0.5 text-orange-800">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-orange-200 rounded px-2 py-0.5 text-orange-800">
            1 input &rarr; N outputs
          </div>
        )}
      </div>
      {/* Multiple output handles */}
      {Array.from({ length: outputCount }).map((_, i) => (
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          className="w-3 h-3 bg-orange-500"
          style={{ top: `${((i + 1) / (outputCount + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});

DisassemblyNode.displayName = 'DisassemblyNode';
