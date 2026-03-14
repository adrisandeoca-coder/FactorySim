// @ts-expect-error no type declarations for react-plotly.js
import Plot from 'react-plotly.js';
import type { SweepResult, SweepParameterDef } from '../../types';
import { extractKpiValue } from '../../services/sweepService';

interface SweepLineChartProps {
  result: SweepResult;
  parameters: SweepParameterDef[];
  kpiPath: string;
  kpiLabel: string;
}

export function SweepLineChart({ result, parameters, kpiPath, kpiLabel }: SweepLineChartProps) {
  const traces = parameters.map((p, idx) => {
    const key = `${p.entityId}.${p.parameter}`;
    // Get all unique values for this parameter
    const paramValues = [...new Set(result.pointResults.map((pr) => pr.parameterValues[key]))].sort(
      (a, b) => a - b
    );

    const kpiValues = paramValues.map((val) => {
      // Find the point with this parameter value (and baseline for others in OAT)
      const point = result.pointResults.find((pr) => pr.parameterValues[key] === val);
      return point ? extractKpiValue(point.kpis, kpiPath) : 0;
    });

    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

    return {
      x: paramValues,
      y: kpiValues,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: `${p.entityName}: ${p.parameterLabel}`,
      marker: { color: colors[idx % colors.length] },
    };
  });

  return (
    <Plot
      data={traces}
      layout={{
        title: `${kpiLabel} vs Parameter Values`,
        height: 400,
        margin: { l: 60, r: 40, t: 40, b: 60 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'Inter, system-ui, sans-serif', color: '#374151', size: 11 },
        xaxis: { title: 'Parameter Value', gridcolor: '#f1f5f9', zerolinecolor: '#e2e8f0' },
        yaxis: { title: kpiLabel, gridcolor: '#f1f5f9', zerolinecolor: '#e2e8f0' },
        legend: { orientation: 'h', y: -0.2 },
      }}
      config={{ responsive: true }}
      style={{ width: '100%' }}
    />
  );
}
