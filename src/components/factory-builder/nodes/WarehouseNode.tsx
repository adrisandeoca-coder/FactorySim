import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import { Warehouse } from 'lucide-react';

import type { WarehouseNodeData as WarehouseData } from '../../../types';

type WarehouseNodeData = WarehouseData & { _heatmap?: { value: number; color: string } };

/** Pallet locations: rack layout, or the legacy capacity field. */
function locations(d: WarehouseNodeData): number {
  const l = d.layout;
  if (l) return l.aisles * 2 * l.baysPerAisle * l.levels * l.palletsPerBay;
  return d.capacity ?? 0;
}

export const WarehouseNode = memo(({ data, selected }: NodeProps<WarehouseNodeData>) => {
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);
  const heatmap = data._heatmap;

  if (isCompact) {
    return (
      <div
        className={`rounded-lg border-2 ${selected ? 'border-blue-500 shadow-lg' : 'border-amber-400'} bg-amber-50 overflow-hidden`}
        style={{ minWidth: '120px' }}
      >
        <Handle type="target" position={Position.Left} />
        <div className="bg-amber-500 px-2 py-1.5 flex items-center">
          <div className="font-bold text-[16px] text-white truncate leading-tight flex-1">{data.name}</div>
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node warehouse ${selected ? 'selected' : ''}`}
      style={{
        minWidth: '180px',
        ...(heatmap ? { boxShadow: `0 0 12px 3px ${heatmap.color}`, borderColor: heatmap.color, borderWidth: '2px' } : {}),
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Warehouse className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{data.name}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 font-mono tabular-nums">
            {locations(data).toLocaleString()} pallets · {data.layout?.levels ?? data.levels ?? '—'} levels
          </div>
        </div>
      </div>

      {heatmap && (
        <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white shadow"
          style={{ backgroundColor: heatmap.color }}>
          {(heatmap.value * 100).toFixed(0)}%
        </div>
      )}

      <div className="mt-1.5 pt-1.5 border-t border-gray-100 grid grid-cols-2 gap-1 text-[11px] text-gray-500 font-mono tabular-nums">
        {data.storageType === 'asrs'
          ? <div title="AS/RS: one stacker crane per aisle">AS/RS · {data.layout?.aisles ?? 1} crane{(data.layout?.aisles ?? 1) === 1 ? '' : 's'}</div>
          : <div title="Forklifts">{data.forklifts?.count ?? 2} forklift{(data.forklifts?.count ?? 2) === 1 ? '' : 's'}</div>}
        <div title="Stock-keeping units">{data.skus?.length ?? 0} SKU{(data.skus?.length ?? 0) === 1 ? '' : 's'}{data.orders?.enabled ? ' · orders' : ''}</div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

WarehouseNode.displayName = 'WarehouseNode';
