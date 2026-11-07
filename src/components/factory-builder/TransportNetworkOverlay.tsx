import { useCallback, useState } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useReactFlow, Panel } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';

const WAYPOINT_COLORS: Record<string, string> = {
  waypoint: '#3b82f6',
  'station-stop': '#22c55e',
  charging: '#eab308',
  parking: '#6b7280',
};

export function TransportNetworkOverlay() {
  const network = useModelStore((s) => s.model.transportNetwork);
  const addWaypoint = useModelStore((s) => s.addWaypoint);
  const removeWaypoint = useModelStore((s) => s.removeWaypoint);
  const addLane = useModelStore((s) => s.addLane);
  const removeLane = useModelStore((s) => s.removeLane);
  const { screenToFlowPosition } = useReactFlow();

  const [mode, setMode] = useState<'select' | 'add-waypoint' | 'add-lane'>('select');
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [laneStart, setLaneStart] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  const waypoints = network?.waypoints || [];
  const lanes = network?.lanes || [];

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (mode === 'add-waypoint') {
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addWaypoint({
          id: `wp-${uuidv4().slice(0, 6)}`,
          position: pos,
          type: 'waypoint',
        });
      }
    },
    [mode, screenToFlowPosition, addWaypoint],
  );

  const handleWaypointClick = useCallback(
    (e: React.MouseEvent, wpId: string) => {
      e.stopPropagation();
      if (mode === 'add-lane') {
        if (!laneStart) {
          setLaneStart(wpId);
        } else if (laneStart !== wpId) {
          addLane({
            id: `lane-${uuidv4().slice(0, 6)}`,
            name: 'Lane',
            waypoints: [laneStart, wpId],
            oneWay: false,
            speedLimit: 2.0,
            laneType: 'both',
          });
          setLaneStart(null);
        }
      } else {
        setSelectedWaypointId(wpId === selectedWaypointId ? null : wpId);
      }
    },
    [mode, laneStart, addLane, selectedWaypointId],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedWaypointId) {
      // Remove lanes that reference this waypoint
      for (const lane of lanes) {
        if (lane.waypoints.includes(selectedWaypointId)) {
          removeLane(lane.id);
        }
      }
      removeWaypoint(selectedWaypointId);
      setSelectedWaypointId(null);
    }
  }, [selectedWaypointId, lanes, removeLane, removeWaypoint]);

  const getWaypointPos = (id: string) =>
    waypoints.find((w) => w.id === id)?.position;

  if (!network?.enabled) return null;

  return (
    <>
      {/* SVG overlay for paths */}
      {showOverlay && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: mode !== 'select' ? 'auto' : 'none',
            zIndex: 4,
          }}
          onClick={handleCanvasClick}
        >
          <defs>
            <marker
              id="transport-arrow"
              viewBox="0 0 12 8"
              refX="6"
              refY="4"
              markerWidth="12"
              markerHeight="8"
              orient="auto"
            >
              <polygon points="0,0 12,4 0,8" fill="#3b82f6" opacity={0.8} />
            </marker>
          </defs>

          {/* Lanes */}
          {lanes.map((lane) => {
            const points = lane.waypoints
              .map(getWaypointPos)
              .filter(Boolean) as { x: number; y: number }[];
            if (points.length < 2) return null;
            const pathD = points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');
            return (
              <g key={lane.id}>
                <path
                  d={pathD}
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fill="none"
                  strokeDasharray={lane.oneWay ? '8 4' : 'none'}
                  opacity={0.6}
                  markerMid={lane.oneWay ? 'url(#transport-arrow)' : undefined}
                />
                {/* Direction arrow for one-way */}
                {lane.oneWay &&
                  points.length >= 2 &&
                  (() => {
                    const p1 = points[points.length - 2];
                    const p2 = points[points.length - 1];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    return (
                      <polygon
                        points="-6,-4 6,0 -6,4"
                        transform={`translate(${mx},${my}) rotate(${angle})`}
                        fill="#3b82f6"
                        opacity={0.8}
                      />
                    );
                  })()}
              </g>
            );
          })}

          {/* Waypoints */}
          {waypoints.map((wp) => (
            <g key={wp.id}>
              <circle
                cx={wp.position.x}
                cy={wp.position.y}
                r={selectedWaypointId === wp.id ? 10 : 7}
                fill={WAYPOINT_COLORS[wp.type] || '#3b82f6'}
                stroke={selectedWaypointId === wp.id ? '#1d4ed8' : 'white'}
                strokeWidth={2}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                onClick={(e) => handleWaypointClick(e, wp.id)}
              />
              {wp.type !== 'waypoint' && (
                <text
                  x={wp.position.x}
                  y={wp.position.y - 12}
                  textAnchor="middle"
                  fill="#374151"
                  fontSize={9}
                  fontWeight={600}
                >
                  {wp.type === 'station-stop'
                    ? 'S'
                    : wp.type === 'charging'
                      ? 'C'
                      : 'P'}
                </text>
              )}
            </g>
          ))}

          {/* Lane-in-progress indicator */}
          {laneStart &&
            (() => {
              const start = getWaypointPos(laneStart);
              if (!start) return null;
              return (
                <circle
                  cx={start.x}
                  cy={start.y}
                  r={12}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              );
            })()}
        </svg>
      )}

      {/* Toolbar */}
      <Panel position="top-right">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-2 space-y-1.5 mt-12">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">
            Transport
          </div>
          <div className="flex gap-1">
            <button
              onClick={() =>
                setMode(mode === 'add-waypoint' ? 'select' : 'add-waypoint')
              }
              className={`px-2 py-1 rounded text-[10px] font-medium ${
                mode === 'add-waypoint'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Click canvas to add waypoints"
            >
              + Point
            </button>
            <button
              onClick={() => {
                setMode(mode === 'add-lane' ? 'select' : 'add-lane');
                setLaneStart(null);
              }}
              className={`px-2 py-1 rounded text-[10px] font-medium ${
                mode === 'add-lane'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Click two waypoints to connect them"
            >
              + Lane
            </button>
            {selectedWaypointId && (
              <button
                onClick={handleDeleteSelected}
                className="px-2 py-1 rounded text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
              >
                Delete
              </button>
            )}
          </div>
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className="w-full px-2 py-1 rounded text-[10px] text-gray-500 hover:bg-gray-100"
          >
            {showOverlay ? 'Hide paths' : 'Show paths'}
          </button>
        </div>
      </Panel>
    </>
  );
}
