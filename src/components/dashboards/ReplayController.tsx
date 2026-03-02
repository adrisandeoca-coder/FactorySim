import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { useSimulationStore, formatDuration } from '../../stores/simulationStore';
import { useModelStore } from '../../stores/modelStore';
import { buildStateTimeline, getStateAtTime, getTimelineDuration, StateFrame } from '../../services/replayTimelineBuilder';

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10, 25];

function formatSimTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function ReplayController() {
  const { lastResult } = useSimulationStore();
  const { model } = useModelStore();
  const {
    isReplaying,
    replaySpeed,
    replayPaused,
    replayTime,
    replayDuration,
    startReplay,
    stopReplay,
    setReplaySpeed,
    setReplayPaused,
    updateFromReplayFrame,
    addReplayEvents,
  } = useLiveSimulationStore();

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const replayTimeRef = useRef<number>(0);
  const framesRef = useRef<StateFrame[]>([]);

  // Build timeline from events
  const frames = useMemo(() => {
    if (!lastResult?.events) return [];
    const bufferCaps: Record<string, number> = {};
    for (const buf of model.buffers) {
      bufferCaps[buf.name] = buf.capacity;
    }
    return buildStateTimeline(lastResult.events, bufferCaps);
  }, [lastResult?.events, model.buffers]);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const duration = useMemo(() => {
    if (lastResult?.duration) return lastResult.duration;
    return getTimelineDuration(frames);
  }, [frames, lastResult?.duration]);

  // Track last emitted frame index to collect events between ticks
  const lastFrameIdxRef = useRef(0);

  const tick = useCallback(
    (timestamp: number) => {
      const state = useLiveSimulationStore.getState();
      if (!state.isReplaying || state.replayPaused) {
        rafRef.current = null;
        return;
      }

      const dt = lastTickRef.current > 0 ? (timestamp - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = timestamp;

      const prevTime = replayTimeRef.current;
      const newTime = prevTime + dt * state.replaySpeed;

      if (newTime >= state.replayDuration) {
        const lastFrame = framesRef.current[framesRef.current.length - 1];
        if (lastFrame) {
          updateFromReplayFrame(lastFrame);
        }
        useLiveSimulationStore.getState().setReplayPaused(true);
        rafRef.current = null;
        return;
      }

      replayTimeRef.current = newTime;

      const frame = getStateAtTime(framesRef.current, newTime);
      if (frame) {
        updateFromReplayFrame({ ...frame, time: newTime });
      }

      // Collect events from frames between prevTime and newTime for animation
      const allFrames = framesRef.current;
      const eventsToEmit: typeof allFrames[0]['events'] = [];
      for (let i = lastFrameIdxRef.current; i < allFrames.length; i++) {
        const f = allFrames[i];
        if (f.time > newTime) break;
        if (f.time > prevTime && f.time <= newTime && f.events.length > 0) {
          eventsToEmit.push(...f.events);
          lastFrameIdxRef.current = i + 1;
        }
      }
      if (eventsToEmit.length > 0) {
        addReplayEvents(eventsToEmit);
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [updateFromReplayFrame, addReplayEvents]
  );

  useEffect(() => {
    if (isReplaying && !replayPaused) {
      lastTickRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isReplaying, replayPaused, tick]);

  const handleStartReplay = () => {
    if (frames.length === 0) return;
    replayTimeRef.current = 0;
    lastTickRef.current = 0;
    lastFrameIdxRef.current = 0;
    startReplay(duration);
    const first = frames[0];
    if (first) {
      updateFromReplayFrame({ ...first, time: 0 });
    }
  };

  const handleStopReplay = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    replayTimeRef.current = 0;
    lastTickRef.current = 0;
    stopReplay();
  };

  const handleTogglePause = () => {
    if (replayPaused) {
      lastTickRef.current = 0;
      setReplayPaused(false);
    } else {
      setReplayPaused(true);
    }
  };

  // Step forward/backward by finding the next/prev frame
  const handleStepForward = () => {
    if (!replayPaused) setReplayPaused(true);
    const currentIdx = framesRef.current.findIndex((f) => f.time > replayTimeRef.current);
    if (currentIdx >= 0 && currentIdx < framesRef.current.length) {
      const frame = framesRef.current[currentIdx];
      replayTimeRef.current = frame.time;
      updateFromReplayFrame({ ...frame, time: frame.time });
    }
  };

  const handleStepBackward = () => {
    if (!replayPaused) setReplayPaused(true);
    let idx = -1;
    for (let i = framesRef.current.length - 1; i >= 0; i--) {
      if (framesRef.current[i].time < replayTimeRef.current - 0.01) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      const frame = framesRef.current[idx];
      replayTimeRef.current = frame.time;
      updateFromReplayFrame({ ...frame, time: frame.time });
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    const newTime = pct * duration;
    replayTimeRef.current = newTime;

    // Reset frame index to match scrubbed position
    lastFrameIdxRef.current = frames.findIndex((f) => f.time > newTime);
    if (lastFrameIdxRef.current < 0) lastFrameIdxRef.current = frames.length;

    const frame = getStateAtTime(frames, newTime);
    if (frame) {
      updateFromReplayFrame({ ...frame, time: newTime });
    }
  };

  // Estimated real-time remaining
  const remaining = replayDuration > 0 && replaySpeed > 0
    ? (replayDuration - replayTime) / replaySpeed
    : 0;

  if (!isReplaying) {
    return (
      <button
        onClick={handleStartReplay}
        disabled={frames.length === 0}
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Replay
      </button>
    );
  }

  const progressPct = replayDuration > 0 ? (replayTime / replayDuration) * 100 : 0;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-white">
      {/* Top row: controls + time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5">
          {/* Step backward */}
          <button
            onClick={handleStepBackward}
            title="Step backward"
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={handleTogglePause}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors"
          >
            {replayPaused ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            )}
          </button>

          {/* Step forward */}
          <button
            onClick={handleStepForward}
            title="Step forward"
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 6h-2v12h2V6zm-3.5 6L6 6v12l8.5-6z" />
            </svg>
          </button>

          {/* Stop */}
          <button
            onClick={handleStopReplay}
            title="Stop replay"
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors ml-1"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6V6z" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-600 mx-1" />

          {/* Speed selector */}
          <div className="flex items-center space-x-0.5">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => setReplaySpeed(speed)}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                  replaySpeed === speed
                    ? 'bg-indigo-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {speed < 1 ? speed.toString() : speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Time display */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="font-mono text-slate-300">
            {formatSimTime(replayTime)}
          </span>
          <span className="text-slate-500">/</span>
          <span className="font-mono text-slate-400">
            {formatSimTime(replayDuration)}
          </span>
          {remaining > 0 && !replayPaused && (
            <span className="text-slate-500 text-[10px]">
              (~{formatDuration(Math.floor(remaining))} left)
            </span>
          )}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={replayDuration > 0 ? replayTime / replayDuration : 0}
          onChange={handleScrub}
          className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #6366f1 ${progressPct}%, #334155 ${progressPct}%)`,
          }}
        />
      </div>
    </div>
  );
}
