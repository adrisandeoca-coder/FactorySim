import { useMemo } from 'react';
import { extractKpiValue, KPI_OPTIONS } from '../../services/sweepService';
import type { SweepParameterDef, SweepResult } from '../../types';

interface SensitivityTableProps {
  result: SweepResult;
  parameters: SweepParameterDef[];
}

/**
 * Compute Pearson correlation coefficient between two arrays.
 */
function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Return a background color class based on correlation strength.
 */
function correlationColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  if (abs >= 0.4) return r > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700';
  return 'text-gray-500';
}

export function SensitivityTable({ result, parameters }: SensitivityTableProps) {
  const analysis = useMemo(() => {
    if (result.pointResults.length < 3 || parameters.length === 0) return null;

    const points = result.pointResults;

    // Build correlation matrix: parameter x KPI
    const rows: {
      paramLabel: string;
      correlations: { kpiKey: string; kpiLabel: string; r: number }[];
      maxAbsR: number;
    }[] = [];

    for (const param of parameters) {
      const paramKey = `${param.entityId}.${param.parameter}`;
      const xValues = points.map((p) => p.parameterValues[paramKey] ?? 0);

      const correlations: { kpiKey: string; kpiLabel: string; r: number }[] = [];
      let maxAbsR = 0;

      for (const kpi of KPI_OPTIONS) {
        const yValues = points.map((p) => extractKpiValue(p.kpis, kpi.key));
        const r = pearsonR(xValues, yValues);
        correlations.push({ kpiKey: kpi.key, kpiLabel: kpi.label, r });
        if (Math.abs(r) > maxAbsR) maxAbsR = Math.abs(r);
      }

      rows.push({
        paramLabel: `${param.entityName}: ${param.parameterLabel}`,
        correlations,
        maxAbsR,
      });
    }

    // Sort by max absolute correlation (most sensitive first)
    rows.sort((a, b) => b.maxAbsR - a.maxAbsR);

    return rows;
  }, [result, parameters]);

  if (!analysis) {
    return (
      <div className="text-sm text-gray-500 p-4">
        Not enough data points to compute sensitivity analysis. At least 3 completed runs are required.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Pearson correlation (r) between each parameter and KPI. Parameters are ranked by maximum |r| (sensitivity).
        Values near +1 or -1 indicate strong linear relationships.
      </div>

      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rank</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Parameter</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Max |r|</th>
              {KPI_OPTIONS.map((kpi) => (
                <th key={kpi.key} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                  {kpi.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.map((row, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-3 py-1.5 text-gray-400 font-mono">{idx + 1}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800">{row.paramLabel}</td>
                <td className="px-3 py-1.5 font-semibold text-gray-900">{row.maxAbsR.toFixed(3)}</td>
                {row.correlations.map((c) => (
                  <td key={c.kpiKey} className={`px-3 py-1.5 font-mono text-center rounded ${correlationColor(c.r)}`}>
                    {c.r.toFixed(3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100" /> Strong positive
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100" /> Strong negative
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-gray-100" /> Weak / none
        </span>
      </div>
    </div>
  );
}
