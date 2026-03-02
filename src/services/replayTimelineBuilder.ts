import type { SimulationEvent } from '../types';
import type { StreamedEvent } from '../stores/liveSimulationStore';

export interface StateFrame {
  time: number;
  stationStates: Record<string, string>;
  bufferLevels: Record<string, { level: number; capacity: number }>;
  events: StreamedEvent[]; // events at this frame time for animation
}

/**
 * Build a sorted timeline of state frames from the simulation event log.
 * Each frame captures all cumulative station/buffer state at that point in time.
 */
export function buildStateTimeline(
  events: SimulationEvent[],
  bufferCapacities: Record<string, number>
): StateFrame[] {
  if (!events || events.length === 0) return [];

  // Current state accumulators
  const currentStations: Record<string, string> = {};
  const currentBuffers: Record<string, { level: number; capacity: number }> = {};

  // Initialize buffer capacities
  for (const [name, cap] of Object.entries(bufferCapacities)) {
    currentBuffers[name] = { level: 0, capacity: cap };
  }

  const frames: StateFrame[] = [];
  let lastFrameTime = -1;

  // Event types that contribute to animation
  const animationEventTypes = new Set([
    'state_change', 'buffer_put', 'buffer_get', 'processing_start',
    'processing_complete', 'source_generate', 'sink_exit',
  ]);

  // Events should already be sorted by time, but ensure it
  const sorted = [...events].sort((a, b) => a.time - b.time);

  for (const event of sorted) {
    const details = event.details || {};
    let changed = false;

    if (event.type === 'state_change') {
      const station = (details.station as string) || event.entityId;
      const state = details.state as string;
      if (station && state) {
        currentStations[station] = state;
        changed = true;
      }
    } else if (event.type === 'buffer_put' || event.type === 'buffer_get') {
      const bufferName = (details.buffer as string) || event.entityId;
      const level = details.level as number;
      if (bufferName && level !== undefined) {
        const cap = currentBuffers[bufferName]?.capacity ?? bufferCapacities[bufferName] ?? 999;
        currentBuffers[bufferName] = { level, capacity: cap };
        changed = true;
      }
    } else if (animationEventTypes.has(event.type)) {
      changed = true;
    }

    // Build streamed event for animation replay
    const streamedEvent: StreamedEvent = {
      time: event.time,
      type: event.type,
      entity_id: event.entityId || '',
      details: details as Record<string, unknown>,
    };

    if (changed) {
      // Coalesce events at the same time into one frame
      if (event.time === lastFrameTime && frames.length > 0) {
        const lastFrame = frames[frames.length - 1];
        lastFrame.stationStates = { ...currentStations };
        lastFrame.bufferLevels = { ...currentBuffers };
        if (animationEventTypes.has(event.type)) {
          lastFrame.events.push(streamedEvent);
        }
      } else {
        frames.push({
          time: event.time,
          stationStates: { ...currentStations },
          bufferLevels: { ...currentBuffers },
          events: animationEventTypes.has(event.type) ? [streamedEvent] : [],
        });
        lastFrameTime = event.time;
      }
    }
  }

  return frames;
}

/**
 * Binary search for the frame at or just before the given time.
 */
export function getStateAtTime(frames: StateFrame[], time: number): StateFrame | null {
  if (frames.length === 0) return null;
  if (time <= frames[0].time) return frames[0];
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1];

  let lo = 0;
  let hi = frames.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].time <= time) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return frames[hi];
}

/**
 * Get the total simulation duration from the event log.
 */
export function getTimelineDuration(frames: StateFrame[]): number {
  if (frames.length === 0) return 0;
  return frames[frames.length - 1].time;
}
