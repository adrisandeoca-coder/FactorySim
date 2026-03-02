import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface PalletizeNodeData {
  label: string;
  defaultPalletSize?: number;
  palletSizeByProduct?: Record<string, number>;
  cycleTime?: number;
  isSelected?: boolean;
}

export const PalletizeNode = memo(({ data, selected }: NodeProps<PalletizeNodeData>) => {
  const hasByProduct = data.palletSizeByProduct && Object.keys(data.palletSizeByProduct).length > 0;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-amber-600 shadow-lg' : 'border-amber-400'
      } bg-gradient-to-br from-amber-50 to-amber-100`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-600" />
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-amber-900">{data.label}</div>
          <div className="text-xs text-amber-700">Palletize</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800">
          Default: {data.defaultPalletSize || 10} per pallet
        </div>
        {hasByProduct && (
          <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800">
            Per-product sizes configured
          </div>
        )}
        {data.cycleTime && (
          <div className="bg-amber-200 rounded px-2 py-0.5 text-amber-800">
            Cycle: {data.cycleTime}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-600" />
    </div>
  );
});

PalletizeNode.displayName = 'PalletizeNode';
