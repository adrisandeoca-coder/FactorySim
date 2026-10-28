import { memo, useRef, useState } from 'react';
import { useModelStore } from '../../stores/modelStore';

export const FloorPlanOverlay = memo(function FloorPlanOverlay() {
  const layout = useModelStore((s) => s.model.layout);
  const setBackgroundSettings = useModelStore((s) => s.setBackgroundSettings);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const {
    backgroundImage,
    backgroundOpacity = 0.3,
    backgroundOffsetX = 0,
    backgroundOffsetY = 0,
    backgroundLocked = false,
  } = layout;

  if (!backgroundImage) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (backgroundLocked) return;
    e.stopPropagation();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: backgroundOffsetX, oy: backgroundOffsetY };

    const handleMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      setBackgroundSettings({
        backgroundOffsetX: dragStart.current.ox + dx,
        backgroundOffsetY: dragStart.current.oy + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragStart.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: backgroundOffsetX,
        top: backgroundOffsetY,
        opacity: backgroundOpacity,
        cursor: backgroundLocked ? 'default' : dragging ? 'grabbing' : 'grab',
        pointerEvents: backgroundLocked ? 'none' : 'auto',
        zIndex: -1,
        border: dragging ? '2px dashed #3b82f6' : 'none',
      }}
      onMouseDown={handleMouseDown}
    >
      <img
        src={backgroundImage}
        alt="Floor plan"
        draggable={false}
        style={{ display: 'block', userSelect: 'none' }}
      />
    </div>
  );
});
