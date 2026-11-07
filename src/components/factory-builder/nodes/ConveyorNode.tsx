import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface ConveyorNodeData {
  label: string;
  length?: number;
  speed?: number;
  capacity?: number;
  isSelected?: boolean;
}

function ConveyorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="13" height="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10h16" />
      <path d="M5 7l3 3-3 3M12 7l3 3-3 3" />
      <circle cx="4" cy="15" r="1.5" />
      <circle cx="16" cy="15" r="1.5" />
    </svg>
  );
}

export const ConveyorNode = memo(({ data, selected }: NodeProps<ConveyorNodeData>) => {
  return (
    <div
      className={`factory-node ${selected ? 'selected' : ''}`}
      style={{
        minWidth: 148,
        padding: 0,
        borderLeft: '3px solid #f59e0b',
        ...(selected ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #f59e0b, 0 4px 16px rgba(245,158,11,0.15)' } : {}),
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#f59e0b', borderColor: '#d97706' }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 7px',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        borderBottom: '1px solid #fde68a',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(217,119,6,0.4)',
          color: '#fff',
        }}>
          <ConveyorIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#78350f', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {data.label}
          </div>
          <div style={{ fontSize: 10, color: '#92400e' }}>Conveyor</div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: '5px 10px 7px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {data.length && (
          <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef3c7', color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>
            {data.length}m
          </span>
        )}
        {data.speed && (
          <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef3c7', color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>
            {data.speed}m/s
          </span>
        )}
        {data.capacity && (
          <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef3c7', color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>
            ×{data.capacity}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b', borderColor: '#d97706' }} />
    </div>
  );
});

ConveyorNode.displayName = 'ConveyorNode';
