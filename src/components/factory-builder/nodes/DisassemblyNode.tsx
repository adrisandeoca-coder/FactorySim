import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

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
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-orange-500 shadow-lg' : 'border-orange-300'
      } bg-orange-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-orange-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-orange-500 rounded flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-orange-900">{data.label}</div>
          <div className="text-[11px] text-orange-600">Disassembly</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        {data.cycleTime && (
          <div className="bg-orange-100 rounded px-1.5 py-0.5 text-orange-700 font-mono tabular-nums">
            CT: {data.cycleTime}s
          </div>
        )}
        {outputParts.length > 0 ? (
          outputParts.map((p, i) => (
            <div key={i} className="bg-orange-100 rounded px-1.5 py-0.5 text-orange-700 font-mono tabular-nums">
              {p.quantity}x {p.productName}
            </div>
          ))
        ) : (
          <div className="bg-orange-100 rounded px-1.5 py-0.5 text-orange-700">
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
