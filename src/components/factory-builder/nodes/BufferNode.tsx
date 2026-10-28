import { memo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';
import type { Buffer } from '../../../types';

interface BufferNodeData extends Buffer {}

function QueueIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="13" height="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="4" height="6" rx="1" />
      <rect x="8" y="7" width="4" height="6" rx="1" />
      <rect x="14" y="7" width="4" height="6" rx="1" />
    </svg>
  );
}

export const BufferNode = memo(({ data, selected }: NodeProps<BufferNodeData>) => {
  const isCompact = useStore((s) => (s as any).transform[2] < 0.5);
  const capacity = data.capacity ?? 10;
  const queueRule = data.queueRule || 'FIFO';

  if (isCompact) {
    return (
      <div
        className={`factory-node buffer ${selected ? 'selected' : ''}`}
        style={{ minWidth: 80, padding: 0 }}
      >
        <Handle type="target" position={Position.Left} />
        <div style={{
          background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <span style={{ color: '#fef3c7', display: 'flex' }}><QueueIcon /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name}
          </span>
        </div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      className={`factory-node buffer ${selected ? 'selected' : ''}`}
      style={{ minWidth: 140, padding: 0 }}
    >
      <Handle type="target" position={Position.Left} />

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
          <QueueIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#78350f', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {data.name}
          </div>
          <div style={{ fontSize: 10, color: '#92400e' }}>
            {queueRule} · Cap {capacity}
          </div>
        </div>
      </div>

      {/* Capacity fill bar */}
      <div style={{ padding: '6px 10px 7px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>Capacity</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{capacity}</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: 3,
            background: 'linear-gradient(90deg, #f59e0b, #d97706)',
            width: `${Math.min(100, (1 / Math.max(1, capacity)) * 100 * 8)}%`,
            minWidth: capacity > 0 ? 8 : 0,
          }} />
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
});

BufferNode.displayName = 'BufferNode';
