import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Cpu } from 'lucide-react';

interface RoboticCellNodeData {
  label: string;
  cycleTime?: number;
  program?: string;
  isSelected?: boolean;
}

export const RoboticCellNode = memo(({ data, selected }: NodeProps<RoboticCellNodeData>) => {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-orange-500 shadow-lg' : 'border-orange-300'
      } bg-orange-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-orange-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-orange-600 rounded-full flex items-center justify-center">
          <Cpu className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-orange-900">{data.label}</div>
          <div className="text-[11px] text-orange-600">Robotic Cell</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {data.cycleTime != null && (
          <div className="text-[11px] bg-orange-100 rounded px-1.5 py-0.5 text-orange-700">
            Cycle: {data.cycleTime}s
          </div>
        )}
        {data.program && (
          <div className="text-[11px] bg-orange-100 rounded px-1.5 py-0.5 text-orange-700">
            Program: {data.program}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-orange-500" />
    </div>
  );
});

RoboticCellNode.displayName = 'RoboticCellNode';
