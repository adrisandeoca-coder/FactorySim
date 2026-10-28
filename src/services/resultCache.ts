import type { FactoryModel, SimulationOptions, SimulationResult } from '../types';

/**
 * In-memory simulation result cache.
 *
 * Hashes the simulation-relevant parts of the model + options into a cache key.
 * Position/layout data is excluded since it doesn't affect simulation output.
 * Cached entries expire after 30 minutes.
 */

function hashConfig(model: FactoryModel, options: SimulationOptions): string {
  // Build a deterministic object from simulation-relevant config only
  const relevant = {
    stations: model.stations.map(s => ({
      id: s.id, cycleTime: s.cycleTime, setupTime: s.setupTime,
      mtbf: s.mtbf, mttr: s.mttr, scrapRate: s.scrapRate,
      batchSize: s.batchSize, productCycleTimes: s.productCycleTimes,
      shifts: s.shifts, costPerHour: s.costPerHour, costPerUnit: s.costPerUnit,
      reworkTarget: s.reworkTarget, reworkRate: s.reworkRate,
    })),
    buffers: model.buffers.map(b => ({ id: b.id, capacity: b.capacity, queueRule: b.queueRule })),
    connections: model.connections.map(c => ({ source: c.source, target: c.target, probability: c.probability })),
    products: model.products.map(p => ({ id: p.id, routing: p.routing, arrivalRate: p.arrivalRate, priority: p.priority })),
    orders: model.orders,
    options: {
      duration: options.duration,
      warmupPeriod: options.warmupPeriod,
      seed: options.seed,
      replications: options.replications,
    },
  };

  // djb2 hash of JSON string
  const str = JSON.stringify(relevant);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

const MAX_CACHE_SIZE = 20;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, { result: SimulationResult; timestamp: number }>();

export function getCachedResult(model: FactoryModel, options: SimulationOptions): SimulationResult | null {
  const key = hashConfig(model, options);
  const entry = cache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.result;
    }
    // Expired
    cache.delete(key);
  }
  return null;
}

export function cacheResult(model: FactoryModel, options: SimulationOptions, result: SimulationResult): void {
  const key = hashConfig(model, options);
  // Evict oldest if at capacity — O(n) single-pass instead of O(n log n) sort
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { result, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
