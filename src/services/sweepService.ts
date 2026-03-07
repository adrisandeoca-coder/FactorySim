import type { FactoryModel, SweepConfig, SweepParameterDef, SweepPointResult, SweepResult, KPIData } from '../types';
import { applyOverrides } from './scenarioModelBuilder';
import type { ScenarioParameterOverride } from '../types';

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
  const grid = generateGrid(config.parameters, config.mode);
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
      console.error(`Sweep run ${i + 1} failed:`, err);
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
