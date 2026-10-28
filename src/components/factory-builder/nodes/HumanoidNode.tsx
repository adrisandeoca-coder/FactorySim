import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Bot } from 'lucide-react';

interface HumanoidNodeData {
  label: string;
  count?: number;
  efficiency?: number;
  skill?: string;
  isSelected?: boolean;
}

export const HumanoidNode = memo(({ data, selected }: NodeProps<HumanoidNodeData>) => {
  const efficiency = data.efficiency || 100;

  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-sky-500 shadow-lg' : 'border-sky-300'
      } bg-sky-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-sky-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-sky-600 rounded-full flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-sky-900">{data.label}</div>
          <div className="text-[11px] text-sky-600">
            {data.count ? `${data.count} humanoids` : 'Humanoid'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {data.skill && (
          <div className="text-[11px] bg-sky-100 rounded px-1.5 py-0.5 text-sky-700">
            Skill: {data.skill}
          </div>
        )}
        <div className="flex items-center space-x-1">
          <span className="text-[11px] text-sky-600">Eff:</span>
          <div className="flex-1 h-1.5 bg-sky-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${efficiency >= 90 ? 'bg-green-500' : efficiency >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${efficiency}%` }}
            />
          </div>
          <span className="text-[11px] text-sky-600 font-mono tabular-nums">{efficiency}%</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-sky-500" />
    </div>
  );
});

HumanoidNode.displayName = 'HumanoidNode';
