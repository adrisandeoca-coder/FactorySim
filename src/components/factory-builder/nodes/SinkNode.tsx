import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SinkNodeData {
  label: string;
  totalProcessed?: number;
  isSelected?: boolean;
}

function SinkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="13" width="14" height="4" rx="1.5" />
      <path d="M10 3v7M6.5 6.5L10 10l3.5-3.5" />
    </svg>
  );
}

export const SinkNode = memo(({ data, selected }: NodeProps<SinkNodeData>) => {
  return (
    <div
      className={`factory-node sink ${selected ? 'selected' : ''}`}
      style={{ minWidth: 140 }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#ef4444', borderColor: '#dc2626' }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 7px',
        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
        borderBottom: '1px solid #fecaca',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(220,38,38,0.4)',
          color: '#fff',
        }}>
          <SinkIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {data.label}
          </div>
          <div style={{ fontSize: 10, color: '#991b1b' }}>
            Exit / Collector
          </div>
        </div>
      </div>

      {/* Body */}
      {data.totalProcessed !== undefined && (
        <div style={{ padding: '5px 10px 7px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 7px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            background: '#fee2e2',
            color: '#dc2626',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {data.totalProcessed} processed
          </span>
        </div>
      )}
      {data.totalProcessed === undefined && (
        <div style={{ padding: '5px 10px 7px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 7px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: '#fee2e2',
            color: '#b91c1c',
          }}>
            Collecting
          </span>
        </div>
      )}
    </div>
  );
});

SinkNode.displayName = 'SinkNode';
