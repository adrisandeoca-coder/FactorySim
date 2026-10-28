import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { User } from 'lucide-react';

interface OperatorNodeData {
  label: string;
  count?: number;
  skill?: string;
  efficiency?: number;
  shift?: string;
  isSelected?: boolean;
}

export const OperatorNode = memo(({ data, selected }: NodeProps<OperatorNodeData>) => {
  const efficiency = data.efficiency || 100;

  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-violet-500 shadow-lg' : 'border-violet-300'
      } bg-violet-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-violet-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-violet-500 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-violet-900">{data.label}</div>
          <div className="text-[11px] text-violet-600">
            {data.count ? `${data.count} operators` : 'Operator'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {data.skill && (
          <div className="text-[11px] bg-violet-100 rounded px-1.5 py-0.5 text-violet-700">
            Skill: {data.skill}
          </div>
        )}
        <div className="flex items-center space-x-1">
          <span className="text-[11px] text-violet-600">Eff:</span>
          <div className="flex-1 h-1.5 bg-violet-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${efficiency >= 90 ? 'bg-green-500' : efficiency >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${efficiency}%` }}
            />
          </div>
          <span className="text-[11px] text-violet-600 font-mono tabular-nums">{efficiency}%</span>
        </div>
        {data.shift && (
          <div className="text-[11px] text-violet-600">Shift: {data.shift}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-violet-500" />
    </div>
  );
});

OperatorNode.displayName = 'OperatorNode';
