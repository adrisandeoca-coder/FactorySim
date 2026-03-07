// @ts-expect-error no type declarations for react-plotly.js
import Plot from 'react-plotly.js';
import type { SweepResult, SweepParameterDef } from '../../types';
import { extractKpiValue } from '../../services/sweepService';

interface SweepHeatmapProps {
  result: SweepResult;
  parameters: SweepParameterDef[];
  kpiPath: string;
  kpiLabel: string;
}

export function SweepHeatmap({ result, parameters, kpiPath, kpiLabel }: SweepHeatmapProps) {
  if (parameters.length < 2) {
    return <div className="text-gray-500 text-sm p-4">Heatmap requires exactly 2 parameters.</div>;
  }

  const p1 = parameters[0];
  const p2 = parameters[1];
  const key1 = `${p1.entityId}.${p1.parameter}`;
  const key2 = `${p2.entityId}.${p2.parameter}`;

  const xValues = [...new Set(result.pointResults.map((pr) => pr.parameterValues[key1]))].sort(
    (a, b) => a - b
  );
  const yValues = [...new Set(result.pointResults.map((pr) => pr.parameterValues[key2]))].sort(
    (a, b) => a - b
  );

  // Build z-matrix
  const zMatrix = yValues.map((yv) =>
    xValues.map((xv) => {
      const point = result.pointResults.find(
        (pr) => pr.parameterValues[key1] === xv && pr.parameterValues[key2] === yv
      );
      return point ? extractKpiValue(point.kpis, kpiPath) : 0;
    })
  );

  return (
    <Plot
      data={[
        {
          z: zMatrix,
          x: xValues,
          y: yValues,
          type: 'heatmap',
          colorscale: 'Viridis',
          colorbar: { title: kpiLabel },
        },
      ]}
      layout={{
        title: `${kpiLabel}: ${p1.entityName} vs ${p2.entityName}`,
        xaxis: { title: `${p1.entityName}: ${p1.parameterLabel}` },
        yaxis: { title: `${p2.entityName}: ${p2.parameterLabel}` },
        height: 450,
        margin: { l: 80, r: 40, t: 40, b: 60 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#374151' },
      }}
      config={{ responsive: true }}
      style={{ width: '100%' }}
    />
  );
}
