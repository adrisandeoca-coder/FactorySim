import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useModelStore } from '../../stores/modelStore';
import { buildStateTimeline, getStateAtTime, getTimelineDuration, StateFrame } from '../../services/replayTimelineBuilder';

export function ReplayController() {
  const { lastResult } = useSimulationStore();
  const { model } = useModelStore();
  const {
    isReplaying,
    replayPaused,
    startReplay,
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

  const simDuration = useSimulationStore((s) => s.defaultOptions.duration) ?? 28800;
  const duration = useMemo(() => {
    if (simDuration > 0) return simDuration;
    return getTimelineDuration(frames);
  }, [frames, simDuration]);

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

  // When not replaying, show just the Replay button
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

  // Replay engine runs via useEffect hooks above — no visible UI
  // InlineReplayControls in LiveSimulationView handles play/pause/speed
  return null;
}
