import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveSimulationView } from './LiveSimulationView';
import { useModelStore } from '../../stores/modelStore';
import { useLiveSimulationStore, StreamedEvent } from '../../stores/liveSimulationStore';
import type { FactoryModel } from '../../types';

interface ReplayPlayerProps {
  runPath: string;
  onClose: () => void;
}

// Convert saved event (camelCase from transformKeys) back to StreamedEvent format
function toStreamedEvent(raw: Record<string, unknown>): StreamedEvent {
  const details = (raw.details || {}) as Record<string, unknown>;
  // Convert camelCase detail keys back to snake_case where needed
  const snakeDetails: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(details)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    snakeDetails[snakeKey] = val;
  }
  return {
    time: (raw.time as number) || 0,
    type: (raw.type as string) || '',
    entity_id: (raw.entityId as string) || (raw.entity_id as string) || '',
    details: snakeDetails,
  };
}

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 50, 100, 500];

export function ReplayPlayer({ runPath, onClose }: ReplayPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Loading event log...');
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [simDuration, setSimDuration] = useState(28800);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(50);
  const [displayTime, setDisplayTime] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [runInfo, setRunInfo] = useState<Record<string, unknown> | null>(null);

  const playbackTimeRef = useRef(0);
  const eventIndexRef = useRef(0);
  const savedModelRef = useRef<FactoryModel | null>(null);
  const eventsRef = useRef<StreamedEvent[]>([]);

  // Load event log and model on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    window.factorySim?.artifacts?.loadRunEventLog(runPath).then((data) => {
      if (cancelled) return;

      setRunInfo(data.runInfo || null);
      const rawEvents = data.events || [];
      setLoadingMsg(`Converting ${rawEvents.length} events...`);

      // Convert events to StreamedEvent format (camelCase → snake_case)
      const converted = rawEvents.map(toStreamedEvent).filter(e => e.type !== '');
      // Sort by time (should already be sorted but ensure)
      converted.sort((a, b) => a.time - b.time);
      setEvents(converted);
      eventsRef.current = converted;
      setEventCount(converted.length);

      // Determine sim duration
      const ri = data.runInfo as Record<string, unknown> | null;
      const opts = ri?.simOptions as Record<string, unknown> | undefined;
      const dur = (opts?.duration as number) || (ri?.duration as number) || 28800;
      setSimDuration(dur);

      // Load model
      const runModel = data.model as FactoryModel | null;
      if (runModel) {
        savedModelRef.current = useModelStore.getState().model;
        useModelStore.getState().setModel(runModel);

        useLiveSimulationStore.getState().reset();
        useLiveSimulationStore.getState().setSimDuration(dur);
        useLiveSimulationStore.getState().startReplay(dur);

        setModelLoaded(true);
      }

      setLoading(false);
    }).catch((err) => {
      console.error('Failed to load event log:', err);
      if (!cancelled) {
        setLoadingMsg('Failed to load event log');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [runPath]);

  // Restore model on unmount
  useEffect(() => {
    return () => {
      if (savedModelRef.current) {
        useModelStore.getState().setModel(savedModelRef.current);
        savedModelRef.current = null;
      }
      useLiveSimulationStore.getState().stopReplay();
    };
  }, []);

  // Main playback loop — requestAnimationFrame
  useEffect(() => {
    if (!isPlaying || eventsRef.current.length === 0) return;

    let animId: number;
    let lastFrameTime = performance.now();
    let lastDisplayUpdate = 0;

    const tick = (now: number) => {
      const realDelta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Advance playback time by speed * realTimeDelta
      const simDelta = realDelta * playSpeed;
      playbackTimeRef.current = Math.min(
        playbackTimeRef.current + simDelta,
        simDuration
      );

      // Dispatch all events up to current playback time
      const allEvents = eventsRef.current;
      let idx = eventIndexRef.current;
      const startIdx = idx;
      while (idx < allEvents.length && allEvents[idx].time <= playbackTimeRef.current) {
        idx++;
      }

      if (idx > startIdx) {
        const batch = allEvents.slice(startIdx, idx);
        eventIndexRef.current = idx;
        // Use batch replay for efficiency (single set() call)
        useLiveSimulationStore.getState().replayEventBatch(batch);
      }

      // Update display at ~15fps to avoid re-render storm
      if (now - lastDisplayUpdate > 66) {
        setDisplayTime(playbackTimeRef.current);
        lastDisplayUpdate = now;
      }

      // Stop at end
      if (playbackTimeRef.current >= simDuration) {
        setIsPlaying(false);
        setDisplayTime(simDuration);
        return;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playSpeed, simDuration]);

  // Seek to a specific time — reset and replay all events up to that point
  const seekToTime = useCallback((targetTime: number) => {
    setIsPlaying(false);
    const allEvents = eventsRef.current;

    // Reset store
    useLiveSimulationStore.getState().reset();
    useLiveSimulationStore.getState().setSimDuration(simDuration);
    useLiveSimulationStore.getState().startReplay(simDuration);

    // Find events up to target time
    let idx = 0;
    while (idx < allEvents.length && allEvents[idx].time <= targetTime) {
      idx++;
    }

    // Replay batch
    if (idx > 0) {
      useLiveSimulationStore.getState().replayEventBatch(allEvents.slice(0, idx));
    }

    playbackTimeRef.current = targetTime;
    eventIndexRef.current = idx;
    setDisplayTime(targetTime);
  }, [simDuration]);

  const togglePlay = useCallback(() => {
    if (playbackTimeRef.current >= simDuration) {
      // Reset to beginning
      seekToTime(0);
      setTimeout(() => setIsPlaying(true), 50);
    } else {
      setIsPlaying(p => !p);
    }
  }, [simDuration, seekToTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') {
        seekToTime(Math.max(0, playbackTimeRef.current - simDuration * 0.05));
      }
      if (e.key === 'ArrowRight') {
        seekToTime(Math.min(simDuration, playbackTimeRef.current + simDuration * 0.05));
      }
      if (e.key === 'Home') seekToTime(0);
      if (e.key === 'End') seekToTime(simDuration);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, togglePlay, seekToTime, simDuration]);

  const progress = simDuration > 0 ? displayTime / simDuration : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-white text-lg">{loadingMsg}</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center">
        <div className="text-slate-400 text-lg mb-4">No event log found in this run.</div>
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" title="Close (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-white font-bold text-sm">Replay</span>
          {runInfo?.modelName ? (
            <span className="text-slate-400 text-xs">{String(runInfo.modelName)}</span>
          ) : null}
          <span className="text-slate-500 text-xs font-mono">{eventCount.toLocaleString()} events</span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-white font-mono font-bold text-sm">
            {formatHMS(displayTime)}
          </span>
          <span className="text-slate-500 text-xs font-mono">
            / {formatHMS(simDuration)}
          </span>
          <span className="text-emerald-400 font-mono font-bold text-sm">
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>

      {/* Live visualization */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {modelLoaded && (
          <LiveSimulationView
            progress={progress}
            elapsedSeconds={0}
            simDuration={simDuration}
            height="100%"
          />
        )}
      </div>

      {/* Transport controls */}
      <div className="bg-slate-900 border-t border-slate-700 px-4 py-3">
        {/* Timeline scrubber — continuous */}
        <div className="relative h-6 mb-3 group cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekToTime(pct * simDuration);
          }}
        >
          {/* Track */}
          <div className="absolute top-2.5 left-0 right-0 h-1.5 bg-slate-700 rounded-full" />
          {/* Filled portion */}
          <div
            className="absolute top-2.5 left-0 h-1.5 rounded-full transition-none"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
            }}
          />
          {/* Hour markers */}
          {Array.from({ length: Math.floor(simDuration / 3600) + 1 }, (_, i) => {
            const pct = (i * 3600 / simDuration) * 100;
            if (pct > 100) return null;
            return (
              <div key={i} className="absolute top-0" style={{ left: `${pct}%` }}>
                <div className="w-px h-3 bg-slate-600/60 mx-auto" />
                <span className="absolute top-3 text-[7px] text-slate-500 font-mono" style={{ transform: 'translateX(-50%)' }}>
                  {i}h
                </span>
              </div>
            );
          })}
          {/* Playhead */}
          <div
            className="absolute top-1 w-3.5 h-3.5 rounded-full bg-white shadow-lg border-2 border-blue-400 group-hover:scale-125 transition-transform"
            style={{
              left: `${progress * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-center space-x-3">
          {/* Skip to start */}
          <button onClick={() => seekToTime(0)} className="p-2 text-slate-400 hover:text-white transition-colors" title="Start (Home)">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" />
            </svg>
          </button>
          {/* Step back 5% */}
          <button
            onClick={() => seekToTime(Math.max(0, playbackTimeRef.current - simDuration * 0.05))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Back 5% (Left)"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors shadow-lg"
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          {/* Step forward 5% */}
          <button
            onClick={() => seekToTime(Math.min(simDuration, playbackTimeRef.current + simDuration * 0.05))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Forward 5% (Right)"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Skip to end */}
          <button onClick={() => seekToTime(simDuration)} className="p-2 text-slate-400 hover:text-white transition-colors" title="End (End)">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
              <path d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
            </svg>
          </button>

          {/* Speed selector */}
          <div className="ml-6 flex items-center space-x-1.5">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Speed</span>
            {SPEED_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setPlaySpeed(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                  playSpeed === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Events dispatched indicator */}
          <div className="ml-4 text-[10px] text-slate-500 font-mono">
            {eventIndexRef.current.toLocaleString()} / {eventCount.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
