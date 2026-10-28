import { describe, it, expect } from 'vitest';

// Re-implement the transform functions here for unit testing since they're
// not exported from ipc-handlers.ts (which is an Electron main-process file).
// These mirror the production code exactly.

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

const KEY_ALIASES: Record<string, string> = {
  processing: 'busy',
};

function transformKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      let camelKey = snakeToCamel(key);
      camelKey = KEY_ALIASES[camelKey] ?? camelKey;
      result[camelKey] = transformKeys(value);
    }
    return result;
  }
  return obj;
}

describe('snakeToCamel', () => {
  it('converts simple snake_case to camelCase', () => {
    expect(snakeToCamel('cycle_time')).toBe('cycleTime');
  });

  it('converts multi-word snake_case', () => {
    expect(snakeToCamel('total_cycle_time')).toBe('totalCycleTime');
  });

  it('leaves already camelCase unchanged', () => {
    expect(snakeToCamel('cycleTime')).toBe('cycleTime');
  });

  it('leaves single words unchanged', () => {
    expect(snakeToCamel('name')).toBe('name');
  });

  it('handles numeric segments', () => {
    expect(snakeToCamel('station_1_name')).toBe('station1Name');
  });

  it('capitalizes after leading underscores (regex behavior)', () => {
    // The regex matches _[a-z0-9] globally, including leading underscores.
    // This matches production behavior in ipc-handlers.ts.
    expect(snakeToCamel('_private')).toBe('Private');
  });
});

describe('KEY_ALIASES', () => {
  it('maps processing to busy', () => {
    expect(KEY_ALIASES['processing']).toBe('busy');
  });
});

describe('transformKeys', () => {
  it('converts snake_case keys to camelCase', () => {
    const input = { cycle_time: 60, station_name: 'S1' };
    expect(transformKeys(input)).toEqual({ cycleTime: 60, stationName: 'S1' });
  });

  it('applies KEY_ALIASES (processing → busy)', () => {
    const input = { processing: 0.85 };
    expect(transformKeys(input)).toEqual({ busy: 0.85 });
  });

  it('converts off_shift → offShift via snakeToCamel', () => {
    const input = { off_shift: 0.1 };
    expect(transformKeys(input)).toEqual({ offShift: 0.1 });
  });

  it('handles nested objects', () => {
    const input = {
      station_data: {
        cycle_time: 60,
        setup_time: 10,
      },
    };
    expect(transformKeys(input)).toEqual({
      stationData: {
        cycleTime: 60,
        setupTime: 10,
      },
    });
  });

  it('handles arrays of objects', () => {
    const input = [
      { station_id: '1', total_count: 100 },
      { station_id: '2', total_count: 200 },
    ];
    expect(transformKeys(input)).toEqual([
      { stationId: '1', totalCount: 100 },
      { stationId: '2', totalCount: 200 },
    ]);
  });

  it('handles arrays nested in objects', () => {
    const input = {
      time_series: [
        { time_step: 1, wip_level: 5 },
        { time_step: 2, wip_level: 8 },
      ],
    };
    expect(transformKeys(input)).toEqual({
      timeSeries: [
        { timeStep: 1, wipLevel: 5 },
        { timeStep: 2, wipLevel: 8 },
      ],
    });
  });

  it('returns null as-is', () => {
    expect(transformKeys(null)).toBeNull();
  });

  it('returns undefined as-is', () => {
    expect(transformKeys(undefined)).toBeUndefined();
  });

  it('returns primitive values as-is', () => {
    expect(transformKeys(42)).toBe(42);
    expect(transformKeys('hello')).toBe('hello');
    expect(transformKeys(true)).toBe(true);
  });

  it('handles empty objects', () => {
    expect(transformKeys({})).toEqual({});
  });

  it('handles empty arrays', () => {
    expect(transformKeys([])).toEqual([]);
  });

  it('applies alias inside nested utilization data', () => {
    const input = {
      utilization: {
        by_station: {
          s1: { processing: 0.7, idle: 0.2, blocked: 0.1 },
        },
      },
    };
    const result = transformKeys(input) as Record<string, unknown>;
    const util = result.utilization as Record<string, unknown>;
    const byStation = util.byStation as Record<string, Record<string, number>>;
    expect(byStation.s1.busy).toBe(0.7);
    expect(byStation.s1.idle).toBe(0.2);
    expect(byStation.s1.blocked).toBe(0.1);
    expect(byStation.s1).not.toHaveProperty('processing');
  });

  it('handles deeply nested structures', () => {
    const input = {
      level_one: {
        level_two: {
          level_three: {
            deep_value: 42,
          },
        },
      },
    };
    expect(transformKeys(input)).toEqual({
      levelOne: {
        levelTwo: {
          levelThree: {
            deepValue: 42,
          },
        },
      },
    });
  });
});
