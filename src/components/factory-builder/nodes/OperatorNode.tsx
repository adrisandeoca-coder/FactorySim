import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

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
      className={`px-4 py-3 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-violet-500 shadow-lg' : 'border-violet-300'
      } bg-gradient-to-br from-violet-50 to-violet-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-violet-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-violet-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-violet-900">{data.label}</div>
          <div className="text-xs text-violet-600">
            {data.count ? `${data.count} operators` : 'Operator'}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {data.skill && (
          <div className="text-xs bg-violet-200 rounded px-2 py-0.5 text-violet-800">
            Skill: {data.skill}
          </div>
        )}
        <div className="flex items-center space-x-1">
          <span className="text-xs text-violet-600">Eff:</span>
          <div className="flex-1 h-2 bg-violet-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${efficiency >= 90 ? 'bg-green-500' : efficiency >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${efficiency}%` }}
            />
          </div>
          <span className="text-xs text-violet-600">{efficiency}%</span>
        </div>
        {data.shift && (
          <div className="text-xs text-violet-600">Shift: {data.shift}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-violet-500" />
    </div>
  );
});

OperatorNode.displayName = 'OperatorNode';
