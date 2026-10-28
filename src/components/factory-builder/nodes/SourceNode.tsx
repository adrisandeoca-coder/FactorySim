import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SourceNodeData {
  label: string;
  arrivalRate?: number;
  feedMode?: 'interval' | 'orders';
  productFilter?: string;
  productBatchSize?: number;
  productType?: string;
  isSelected?: boolean;
}

function SourceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" opacity="0.3" />
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v3M10 15v3M2 10h3M15 10h3" />
    </svg>
  );
}

export const SourceNode = memo(({ data, selected }: NodeProps<SourceNodeData>) => {
  const feedMode = data.feedMode || 'interval';

  return (
    <div
      className={`factory-node source ${selected ? 'selected' : ''}`}
      style={{ minWidth: 148 }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 7px',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        borderBottom: '1px solid #a7f3d0',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(5,150,105,0.4)',
          color: '#fff',
        }}>
          <SourceIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#064e3b', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {data.label}
          </div>
          <div style={{ fontSize: 10, color: '#065f46' }}>
            {feedMode === 'orders' ? 'Order-driven' : data.arrivalRate ? `↻ ${data.arrivalRate}s` : 'Continuous'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '5px 10px 7px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 600,
          background: feedMode === 'orders' ? '#dbeafe' : '#d1fae5',
          color: feedMode === 'orders' ? '#1d4ed8' : '#065f46',
        }}>
          {feedMode === 'orders' ? 'Orders' : 'Interval'}
        </span>
        {data.productType && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 7px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: '#f0fdf4',
            color: '#16a34a',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {data.productType}
          </span>
        )}
        {data.productBatchSize && data.productBatchSize > 1 && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 7px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            background: '#fef9c3',
            color: '#854d0e',
            fontVariantNumeric: 'tabular-nums',
          }}>
            ×{data.productBatchSize}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#10b981', borderColor: '#059669' }} />
    </div>
  );
});

SourceNode.displayName = 'SourceNode';
