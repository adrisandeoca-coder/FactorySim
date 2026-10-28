import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Package } from 'lucide-react';

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
      className={`px-3 py-2.5 rounded-lg border-2 min-w-[140px] ${
        selected ? 'border-amber-600 shadow-lg' : 'border-amber-400'
      } bg-amber-50`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-600" />
      <div className="flex items-center space-x-2">
        <div className="w-7 h-7 bg-amber-600 rounded flex items-center justify-center">
          <Package className="w-4 h-4 text-white" strokeWidth={1.75} />
        </div>
        <div>
          <div className="font-semibold text-[13px] text-amber-900">{data.label}</div>
          <div className="text-[11px] text-amber-700">Palletize</div>
        </div>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px]">
        <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700 font-mono tabular-nums">
          Default: {data.defaultPalletSize || 10} per pallet
        </div>
        {hasByProduct && (
          <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700">
            Per-product sizes configured
          </div>
        )}
        {data.cycleTime && (
          <div className="bg-amber-100 rounded px-1.5 py-0.5 text-amber-700 font-mono tabular-nums">
            CT: {data.cycleTime}s
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-600" />
    </div>
  );
});

PalletizeNode.displayName = 'PalletizeNode';
