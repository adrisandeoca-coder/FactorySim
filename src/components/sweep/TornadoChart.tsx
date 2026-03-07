// @ts-expect-error no type declarations for react-plotly.js
import Plot from 'react-plotly.js';
import type { SweepResult, SweepParameterDef } from '../../types';
import { extractKpiValue } from '../../services/sweepService';

interface TornadoChartProps {
  result: SweepResult;
  parameters: SweepParameterDef[];
  kpiPath: string;
  kpiLabel: string;
}

export function TornadoChart({ result, parameters, kpiPath, kpiLabel }: TornadoChartProps) {
  // For each parameter, find the min and max KPI values across its range
  const baselinePoint = result.pointResults[0];
  if (!baselinePoint) return <div className="text-gray-500 text-sm">No results</div>;

  const baselineKpi = extractKpiValue(baselinePoint.kpis, kpiPath);

  const impacts = parameters.map((p) => {
    const key = `${p.entityId}.${p.parameter}`;
    const points = result.pointResults.filter((pr) => {
      // Find points where only this parameter varies from baseline
      return Object.entries(pr.parameterValues).some(
        ([k, v]) => k === key && v !== baselinePoint.parameterValues[key]
      );
    });

    const kpiValues = points.map((pr) => extractKpiValue(pr.kpis, kpiPath));
    const minKpi = Math.min(...kpiValues, baselineKpi);
    const maxKpi = Math.max(...kpiValues, baselineKpi);

    return {
      label: `${p.entityName}: ${p.parameterLabel}`,
      low: minKpi - baselineKpi,
      high: maxKpi - baselineKpi,
      range: maxKpi - minKpi,
    };
  });

  // Sort by impact magnitude
  impacts.sort((a, b) => b.range - a.range);

  const labels = impacts.map((i) => i.label);
  const lowValues = impacts.map((i) => i.low);
  const highValues = impacts.map((i) => i.high);

  return (
    <Plot
      data={[
        {
          type: 'bar',
          y: labels,
          x: lowValues,
          orientation: 'h',
          name: 'Low',
          marker: { color: '#ef4444' },
        },
        {
          type: 'bar',
          y: labels,
          x: highValues,
          orientation: 'h',
          name: 'High',
          marker: { color: '#22c55e' },
        },
      ]}
      layout={{
        title: `Sensitivity: ${kpiLabel}`,
        barmode: 'overlay',
        xaxis: { title: `Change from baseline (${baselineKpi.toFixed(2)})` },
        yaxis: { automargin: true },
        height: Math.max(300, impacts.length * 50 + 100),
        margin: { l: 200, r: 40, t: 40, b: 60 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#374151' },
      }}
      config={{ responsive: true }}
      style={{ width: '100%' }}
    />
  );
}
