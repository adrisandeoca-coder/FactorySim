import { memo } from 'react';
import { NodeProps } from 'reactflow';

interface ZoneBackgroundData {
  label: string;
  width: number;
  height: number;
  color: string;
}

export const ZoneBackgroundNode = memo(({ data }: NodeProps<ZoneBackgroundData>) => {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: `1.5px dashed ${data.color}`,
        borderRadius: 12,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -1,
          left: -1,
          backgroundColor: data.color,
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 8px',
          borderRadius: '12px 0 8px 0',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}
      >
        {data.label}
      </div>
    </div>
  );
});

ZoneBackgroundNode.displayName = 'ZoneBackgroundNode';
