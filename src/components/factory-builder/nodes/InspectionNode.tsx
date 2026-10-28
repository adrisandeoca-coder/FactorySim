import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { SearchCheck } from 'lucide-react';

interface InspectionNodeData {
  label: string;
  inspectionTime?: number;
  defectRate?: number;
  inspectionType?: 'visual' | 'automated' | 'sampling';
  isSelected?: boolean;
}

export const InspectionNode = memo(({ data, selected }: NodeProps<InspectionNodeData>) => {
  const defectRate = data.defectRate || 0;

  return (
    <div
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-cyan-500 shadow-lg' : 'border-cyan-300'
      } bg-cyan-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-cyan-500 rounded flex items-center justify-center">
          <SearchCheck className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-cyan-900">{data.label}</div>
          <div className="text-[11px] text-cyan-600">
            {data.inspectionType || 'Inspection'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        {data.inspectionTime && (
          <div className="bg-cyan-100 rounded px-1.5 py-0.5 text-cyan-700 font-mono tabular-nums">
            Time: {data.inspectionTime}s
          </div>
        )}
        <div className="flex items-center space-x-1">
          <span className="text-cyan-600">Defect:</span>
          <span className={`font-medium font-mono tabular-nums ${defectRate > 5 ? 'text-red-600' : defectRate > 2 ? 'text-yellow-600' : 'text-green-600'}`}>
            {defectRate}%
          </span>
        </div>
      </div>
      {/* Two outputs: Pass and Fail */}
      <Handle
        type="source"
        position={Position.Right}
        id="pass"
        className="w-3 h-3 bg-green-500"
        style={{ top: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="fail"
        className="w-3 h-3 bg-red-500"
        style={{ top: '70%' }}
      />
      <div className="absolute right-[-40px] top-[25%] text-[11px] text-green-600">Pass</div>
      <div className="absolute right-[-32px] top-[65%] text-[11px] text-red-600">Fail</div>
    </div>
  );
});

InspectionNode.displayName = 'InspectionNode';
