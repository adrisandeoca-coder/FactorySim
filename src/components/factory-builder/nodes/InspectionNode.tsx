import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

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
      className={`px-4 py-3 rounded-lg border-2 min-w-[150px] ${
        selected ? 'border-cyan-500 shadow-lg' : 'border-cyan-300'
      } bg-gradient-to-br from-cyan-50 to-cyan-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-cyan-900">{data.label}</div>
          <div className="text-xs text-cyan-600">
            {data.inspectionType || 'Inspection'}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {data.inspectionTime && (
          <div className="bg-cyan-200 rounded px-2 py-0.5 text-cyan-800">
            Time: {data.inspectionTime}s
          </div>
        )}
        <div className="flex items-center space-x-1">
          <span className="text-cyan-600">Defect:</span>
          <span className={`font-medium ${defectRate > 5 ? 'text-red-600' : defectRate > 2 ? 'text-yellow-600' : 'text-green-600'}`}>
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
      <div className="absolute right-[-40px] top-[25%] text-xs text-green-600">Pass</div>
      <div className="absolute right-[-32px] top-[65%] text-xs text-red-600">Fail</div>
    </div>
  );
});

InspectionNode.displayName = 'InspectionNode';
