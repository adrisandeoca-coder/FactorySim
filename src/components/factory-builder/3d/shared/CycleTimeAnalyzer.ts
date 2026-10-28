/**
 * CycleTimeAnalyzer — measures pick-to-place cycle times from RobotTargetDriver
 * waypoint events. Signature VC / RobotStudio feature: tells the user how
 * fast each robot is actually working in the simulation.
 *
 * Hook-up:
 *   1. Wrap (or replace) the driver's `onWaypoint` callback so it forwards to
 *      `analyzer.recordWaypoint(robotId, idx, wp)`.
 *   2. Call `analyzer.snapshot(robotId)` whenever you need stats.
 *
 * Cycles are bounded by tool actions: a `close` starts a cycle, the next
 * `open` ends it, and the closed-loop duration is the cycle time. We track
 * a rolling window of the last N cycles plus running mean / min / max.
 */

export interface CycleSnapshot {
  /** Last N cycle durations in seconds. */
  recent: number[];
  /** Total completed cycles. */
  count: number;
  /** Running mean (s). */
  mean: number;
  /** Min cycle (s). */
  min: number;
  /** Max cycle (s). */
  max: number;
  /** Items per minute, derived from mean. */
  itemsPerMinute: number;
}

const EMPTY_SNAPSHOT: CycleSnapshot = {
  recent: [],
  count: 0,
  mean: 0,
  min: 0,
  max: 0,
  itemsPerMinute: 0,
};

interface RobotRecord {
  pickStartedAt: number | null;   // performance.now() at last close
  cycleDurations: number[];       // ms
  count: number;
  sum: number;
  min: number;
  max: number;
}

const MAX_RECENT = 16;

export class CycleTimeAnalyzer {
  private records = new Map<string, RobotRecord>();

  /**
   * Record a waypoint event for a given robot. `now` is the wall-clock time
   * in ms (defaults to performance.now()) — passing it explicitly lets the
   * caller use sim time for replay-driven analysis.
   */
  recordWaypoint(
    robotId: string,
    _waypointIndex: number,
    wp: { toolAction?: 'open' | 'close' | null },
    now: number = performance.now(),
  ): void {
    let rec = this.records.get(robotId);
    if (!rec) {
      rec = { pickStartedAt: null, cycleDurations: [], count: 0, sum: 0, min: Infinity, max: 0 };
      this.records.set(robotId, rec);
    }

    if (wp.toolAction === 'close') {
      rec.pickStartedAt = now;
    } else if (wp.toolAction === 'open') {
      if (rec.pickStartedAt !== null) {
        const dur = now - rec.pickStartedAt;
        rec.cycleDurations.push(dur);
        if (rec.cycleDurations.length > MAX_RECENT) rec.cycleDurations.shift();
        rec.count++;
        rec.sum += dur;
        if (dur < rec.min) rec.min = dur;
        if (dur > rec.max) rec.max = dur;
        rec.pickStartedAt = null;
      }
    }
  }

  /** Get the latest snapshot for a robot. Returns zeros if no cycles yet. */
  snapshot(robotId: string): CycleSnapshot {
    const rec = this.records.get(robotId);
    if (!rec || rec.count === 0) return EMPTY_SNAPSHOT;
    const meanSec = (rec.sum / rec.count) / 1000;
    return {
      recent: rec.cycleDurations.map(d => d / 1000),
      count: rec.count,
      mean: meanSec,
      min: rec.min / 1000,
      max: rec.max / 1000,
      itemsPerMinute: meanSec > 0 ? 60 / meanSec : 0,
    };
  }

  /** Snapshots for every robot the analyzer has seen. */
  snapshotAll(): Record<string, CycleSnapshot> {
    const out: Record<string, CycleSnapshot> = {};
    for (const id of this.records.keys()) out[id] = this.snapshot(id);
    return out;
  }

  /** Reset all measurements (e.g. when reloading a scenario). */
  reset(): void {
    this.records.clear();
  }
}
