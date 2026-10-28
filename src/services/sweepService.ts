import type { FactoryModel, SweepConfig, SweepParameterDef, SweepPointResult, SweepResult, KPIData, ScenarioParameterOverride, SweepMode } from '../types';
import { applyOverrides } from './scenarioModelBuilder';
import { createLogger } from './logger';

const log = createLogger('SweepService');

let cancelFlag = false;

export function cancelSweep(): void {
  cancelFlag = true;
}

/**
 * Generate parameter grid points.
 * OAT: vary one parameter at a time, others at midpoint.
 * Full: Cartesian product of all parameter ranges.
 */
export function generateGrid(
  params: SweepParameterDef[],
  mode: 'oat' | 'full'
): Record<string, number>[] {
  const paramRanges = params.map((p) => {
    const values: number[] = [];
    for (let i = 0; i < p.steps; i++) {
      values.push(p.min + (p.max - p.min) * (i / Math.max(p.steps - 1, 1)));
    }
    return { key: `${p.entityId}.${p.parameter}`, values };
  });

  const midpoints: Record<string, number> = {};
  for (const pr of paramRanges) {
    midpoints[pr.key] = pr.values[Math.floor(pr.values.length / 2)];
  }

  if (mode === 'oat') {
    const points: Record<string, number>[] = [];
    // Baseline point (all midpoints)
    points.push({ ...midpoints });
    for (const pr of paramRanges) {
      for (const val of pr.values) {
        if (val === midpoints[pr.key]) continue;
        points.push({ ...midpoints, [pr.key]: val });
      }
    }
    return points;
  }

  // Full grid: Cartesian product
  let points: Record<string, number>[] = [{}];
  for (const pr of paramRanges) {
    const next: Record<string, number>[] = [];
    for (const existing of points) {
      for (const val of pr.values) {
        next.push({ ...existing, [pr.key]: val });
      }
    }
    points = next;
  }
  return points;
}

/**
 * Generate Latin Hypercube Sampling points.
 * Creates n equally-spaced strata per parameter and randomly samples one point per stratum.
 */
export function generateLHSSamples(
  parameters: SweepParameterDef[],
  sampleCount: number
): Record<string, number>[] {
  const n = sampleCount;
  const k = parameters.length;

  // Create permuted index arrays for each parameter (Fisher-Yates shuffle)
  const permutations: number[][] = [];
  for (let i = 0; i < k; i++) {
    const perm = Array.from({ length: n }, (_, j) => j);
    for (let j = n - 1; j > 0; j--) {
      const r = Math.floor(Math.random() * (j + 1));
      [perm[j], perm[r]] = [perm[r], perm[j]];
    }
    permutations.push(perm);
  }

  const samples: Record<string, number>[] = [];
  for (let i = 0; i < n; i++) {
    const sample: Record<string, number> = {};
    for (let j = 0; j < k; j++) {
      const param = parameters[j];
      const stratum = permutations[j][i];
      // Random point within the stratum
      const u = (stratum + Math.random()) / n;
      sample[`${param.entityId}.${param.parameter}`] =
        param.min + u * (param.max - param.min);
    }
    samples.push(sample);
  }

  return samples;
}

/**
 * Generate Monte Carlo (pure random) sampling points.
 */
export function generateMonteCarloSamples(
  parameters: SweepParameterDef[],
  sampleCount: number
): Record<string, number>[] {
  const samples: Record<string, number>[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const sample: Record<string, number> = {};
    for (const param of parameters) {
      const key = `${param.entityId}.${param.parameter}`;
      sample[key] = param.min + Math.random() * (param.max - param.min);
    }
    samples.push(sample);
  }
  return samples;
}

/**
 * Generate experiment points for any sweep mode.
 */
export function generateSweepPoints(
  params: SweepParameterDef[],
  mode: SweepMode,
  sampleCount: number
): Record<string, number>[] {
  switch (mode) {
    case 'oat':
    case 'full':
      return generateGrid(params, mode === 'full' ? 'full' : 'oat');
    case 'lhs':
      return generateLHSSamples(params, sampleCount);
    case 'montecarlo':
      return generateMonteCarloSamples(params, sampleCount);
    default:
      return generateGrid(params, 'oat');
  }
}

/**
 * Build ScenarioParameterOverride[] from a grid point.
 */
function buildOverrides(
  params: SweepParameterDef[],
  point: Record<string, number>
): ScenarioParameterOverride[] {
  return params.map((p) => ({
    entityType: p.entityType,
    entityId: p.entityId,
    entityName: p.entityName,
    parameter: p.parameter,
    originalValue: p.min,
    overrideValue: point[`${p.entityId}.${p.parameter}`],
  }));
}

/**
 * Run a full parameter sweep.
 */
export async function runSweep(
  model: FactoryModel,
  config: SweepConfig,
  onProgress: (current: number, total: number) => void
): Promise<SweepResult> {
  cancelFlag = false;
  const grid = generateSweepPoints(config.parameters, config.mode, config.sampleCount);
  const startedAt = new Date().toISOString();
  const pointResults: SweepPointResult[] = [];

  for (let i = 0; i < grid.length; i++) {
    if (cancelFlag) break;

    onProgress(i, grid.length);

    const point = grid[i];
    const overrides = buildOverrides(config.parameters, point);
    const modifiedModel = applyOverrides(model, overrides);

    try {
      const result = await window.factorySim!.simulation!.runSimulation(
        modifiedModel,
        config.baseOptions
      );
      pointResults.push({
        parameterValues: point,
        kpis: result.kpis,
        runId: result.runId,
      });
    } catch (err) {
      log.error(`Sweep run ${i + 1} failed`, err);
    }
  }

  onProgress(grid.length, grid.length);

  return {
    configId: config.id,
    startedAt,
    completedAt: new Date().toISOString(),
    totalRuns: grid.length,
    pointResults,
  };
}

/**
 * Extract a KPI value by dot-path from KPIData.
 */
export function extractKpiValue(kpis: KPIData, kpiPath: string): number {
  const parts = kpiPath.split('.');
  let current: any = kpis;
  for (const part of parts) {
    if (current == null) return 0;
    current = current[part];
  }
  return typeof current === 'number' ? current : 0;
}

export const KPI_OPTIONS = [
  { key: 'oee.overall', label: 'OEE (Overall)' },
  { key: 'oee.availability', label: 'OEE Availability' },
  { key: 'oee.performance', label: 'OEE Performance' },
  { key: 'oee.quality', label: 'OEE Quality' },
  { key: 'throughput.total', label: 'Throughput (Total)' },
  { key: 'throughput.ratePerHour', label: 'Throughput (Per Hour)' },
  { key: 'cycleTime.mean', label: 'Cycle Time (Mean)' },
  { key: 'wip.total', label: 'WIP (Total)' },
];
