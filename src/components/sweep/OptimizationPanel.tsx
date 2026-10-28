import { useState, useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useOptimizationStore } from '../../stores/optimizationStore';
import { getParametersForEntityType } from '../../services/scenarioModelBuilder';
import { applyOverrides } from '../../services/scenarioModelBuilder';
import { KPI_OPTIONS } from '../../services/sweepService';
import type { ScenarioParameterOverride } from '../../types';
import type { OptimizationParameter, OptimizationConstraint, OptimizationConfig } from '../../services/optimizationEngine';

const ENTITY_TYPES: { value: ScenarioParameterOverride['entityType']; label: string }[] = [
  { value: 'station', label: 'Station' },
  { value: 'buffer', label: 'Buffer' },
  { value: 'source', label: 'Source' },
  { value: 'product', label: 'Product' },
  { value: 'conveyor', label: 'Conveyor' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'palletize', label: 'Palletize' },
  { value: 'depalletize', label: 'Depalletize' },
];

const CONSTRAINT_OPERATORS: { value: OptimizationConstraint['operator']; label: string }[] = [
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
];

export function OptimizationPanel() {
  const { model } = useModelStore();
  const { defaultOptions } = useSimulationStore();
  const { isRunning, progress, result, error, startOptimization, stopOptimization, clearResults } =
    useOptimizationStore();

  // Parameter definition state
  const [parameters, setParameters] = useState<OptimizationParameter[]>([]);
  const [objectiveKpi, setObjectiveKpi] = useState('oee.overall');
  const [direction, setDirection] = useState<'maximize' | 'minimize'>('maximize');
  const [constraints, setConstraints] = useState<OptimizationConstraint[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // GA settings
  const [populationSize, setPopulationSize] = useState(20);
  const [generations, setGenerations] = useState(15);
  const [mutationRate, setMutationRate] = useState(0.2);
  const [crossoverRate, setCrossoverRate] = useState(0.7);
  const [eliteCount, setEliteCount] = useState(2);

  // Add parameter form state
  const [addEntityType, setAddEntityType] = useState<string>('station');
  const [addEntityId, setAddEntityId] = useState('');
  const [addParameter, setAddParameter] = useState('');
  const [addMin, setAddMin] = useState('');
  const [addMax, setAddMax] = useState('');
  const [addIsInteger, setAddIsInteger] = useState(false);

  // Constraint form state
  const [constraintKpi, setConstraintKpi] = useState('throughput.total');
  const [constraintOp, setConstraintOp] = useState<OptimizationConstraint['operator']>('>=');
  const [constraintVal, setConstraintVal] = useState('');

  // Get entities for selected type
  const entities = useMemo(() => {
    switch (addEntityType) {
      case 'station':
        return model.stations.map((s) => ({ id: s.id, name: s.name }));
      case 'buffer':
        return model.buffers.map((b) => ({ id: b.id, name: b.name }));
      case 'product':
        return model.products.map((p) => ({ id: p.id, name: p.name }));
      default:
        return (model.extraNodes || [])
          .filter((n) => n.type === addEntityType)
          .map((n) => ({ id: n.id, name: (n.data as any).name || n.id }));
    }
  }, [addEntityType, model]);

  const availableParams = useMemo(() => {
    return getParametersForEntityType(addEntityType).filter(
      (p) => !['shifts', 'feedMode', 'splitType', 'mergeType', 'inspectionType'].includes(p.key.split('.').pop()!)
    );
  }, [addEntityType]);

  const totalSimEstimate = populationSize + (populationSize - eliteCount) * generations;

  const handleAddParameter = () => {
    const entity = entities.find((e) => e.id === addEntityId);
    const param = availableParams.find((p) => p.key === addParameter);
    if (!entity || !param || !addMin || !addMax) return;

    setParameters([
      ...parameters,
      {
        entityType: addEntityType as ScenarioParameterOverride['entityType'],
        entityId: addEntityId,
        entityName: entity.name,
        parameter: addParameter,
        parameterLabel: param.label,
        min: parseFloat(addMin),
        max: parseFloat(addMax),
        isInteger: addIsInteger,
      },
    ]);

    setAddMin('');
    setAddMax('');
    setAddIsInteger(false);
  };

  const handleRemoveParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleAddConstraint = () => {
    if (!constraintVal) return;
    setConstraints([
      ...constraints,
      { kpiPath: constraintKpi, operator: constraintOp, value: parseFloat(constraintVal) },
    ]);
    setConstraintVal('');
  };

  const handleRemoveConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  const handleStart = () => {
    const config: OptimizationConfig = {
      parameters,
      objective: { kpiPath: objectiveKpi, direction },
      constraints: constraints.length > 0 ? constraints : undefined,
      populationSize,
      generations,
      mutationRate,
      crossoverRate,
      eliteCount,
      baseOptions: defaultOptions,
    };
    startOptimization(config);
  };

  const handleApplyToModel = () => {
    if (!result) return;
    const overrides: ScenarioParameterOverride[] = parameters.map((p) => ({
      entityType: p.entityType,
      entityId: p.entityId,
      entityName: p.entityName,
      parameter: p.parameter,
      originalValue: p.min,
      overrideValue: result.bestParams[`${p.entityId}.${p.parameter}`],
    }));
    const newModel = applyOverrides(model, overrides);
    useModelStore.getState().setModel(newModel);
  };

  const objectiveLabel = KPI_OPTIONS.find((k) => k.key === objectiveKpi)?.label || objectiveKpi;

  // Convergence chart dimensions
  const chartW = 500;
  const chartH = 200;
  const chartPad = { top: 20, right: 20, bottom: 30, left: 60 };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Optimization Configuration</h2>

        {/* Add Parameter Form */}
        <div className="grid grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity Type</label>
            <select
              value={addEntityType}
              onChange={(e) => {
                setAddEntityType(e.target.value);
                setAddEntityId('');
                setAddParameter('');
              }}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
            <select
              value={addEntityId}
              onChange={(e) => setAddEntityId(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Parameter</label>
            <select
              value={addParameter}
              onChange={(e) => setAddParameter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {availableParams.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min</label>
              <input
                type="number"
                value={addMin}
                onChange={(e) => setAddMin(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max</label>
              <input
                type="number"
                value={addMax}
                onChange={(e) => setAddMax(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="opt-is-integer"
              checked={addIsInteger}
              onChange={(e) => setAddIsInteger(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="opt-is-integer" className="text-xs text-gray-600">
              Integer
            </label>
          </div>
          <div>
            <button
              onClick={handleAddParameter}
              disabled={!addEntityId || !addParameter || !addMin || !addMax}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Add Parameter
            </button>
          </div>
        </div>

        {/* Parameters List */}
        {parameters.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Entity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Parameter</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Min</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Max</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{p.entityName}</td>
                    <td className="px-3 py-2">{p.parameterLabel}</td>
                    <td className="px-3 py-2">{p.min}</td>
                    <td className="px-3 py-2">{p.max}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.isInteger ? 'Integer' : 'Continuous'}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemoveParameter(i)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Objective */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Objective KPI</label>
            <select
              value={objectiveKpi}
              onChange={(e) => setObjectiveKpi(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {KPI_OPTIONS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'maximize' | 'minimize')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="maximize">Maximize</option>
              <option value="minimize">Minimize</option>
            </select>
          </div>
        </div>

        {/* Constraints */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Constraints (optional)</h3>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">KPI</label>
              <select
                value={constraintKpi}
                onChange={(e) => setConstraintKpi(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              >
                {KPI_OPTIONS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Operator</label>
              <select
                value={constraintOp}
                onChange={(e) => setConstraintOp(e.target.value as OptimizationConstraint['operator'])}
                className="border rounded px-2 py-1.5 text-sm"
              >
                {CONSTRAINT_OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
              <input
                type="number"
                value={constraintVal}
                onChange={(e) => setConstraintVal(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm w-28"
              />
            </div>
            <button
              onClick={handleAddConstraint}
              disabled={!constraintVal}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {constraints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {constraints.map((c, i) => {
                const label = KPI_OPTIONS.find((k) => k.key === c.kpiPath)?.label || c.kpiPath;
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800"
                  >
                    {label} {c.operator} {c.value}
                    <button
                      onClick={() => handleRemoveConstraint(i)}
                      className="text-amber-500 hover:text-amber-700 ml-1"
                    >
                      x
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Advanced GA Settings */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-5 gap-3 mt-2 p-3 bg-gray-50 rounded">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Population Size</label>
                <input
                  type="number"
                  value={populationSize}
                  onChange={(e) => setPopulationSize(parseInt(e.target.value) || 20)}
                  min={4}
                  max={100}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Generations</label>
                <input
                  type="number"
                  value={generations}
                  onChange={(e) => setGenerations(parseInt(e.target.value) || 15)}
                  min={1}
                  max={100}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mutation Rate</label>
                <input
                  type="number"
                  value={mutationRate}
                  onChange={(e) => setMutationRate(parseFloat(e.target.value) || 0.2)}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Crossover Rate</label>
                <input
                  type="number"
                  value={crossoverRate}
                  onChange={(e) => setCrossoverRate(parseFloat(e.target.value) || 0.7)}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Elite Count</label>
                <input
                  type="number"
                  value={eliteCount}
                  onChange={(e) => setEliteCount(parseInt(e.target.value) || 2)}
                  min={1}
                  max={10}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Run Controls */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex-1 text-sm text-gray-500">
            {parameters.length > 0 && `~${totalSimEstimate} simulations estimated`}
          </div>

          {isRunning ? (
            <button
              onClick={stopOptimization}
              className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={parameters.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              Optimize
            </button>
          )}
        </div>

        {/* Progress */}
        {isRunning && progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Generation {progress.generation} of {progress.totalGenerations}
              </span>
              <span>
                Best: {progress.bestFitness.toFixed(4)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{
                  width: `${
                    progress.totalGenerations > 0
                      ? (progress.generation / progress.totalGenerations) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">Optimization Results</h2>
            <div className="flex-1" />
            <button onClick={clearResults} className="text-sm text-gray-500 hover:text-red-600">
              Clear
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="text-xs text-green-700 font-medium">Best {objectiveLabel}</div>
              <div className="text-2xl font-bold text-green-900">{result.bestFitness.toFixed(4)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <div className="text-xs text-blue-700 font-medium">Total Simulations</div>
              <div className="text-2xl font-bold text-blue-900">{result.totalSimulations}</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded p-3">
              <div className="text-xs text-purple-700 font-medium">Generations</div>
              <div className="text-2xl font-bold text-purple-900">{result.generations.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-700 font-medium">Elapsed Time</div>
              <div className="text-2xl font-bold text-gray-900">
                {(result.elapsedMs / 1000).toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Best Parameters */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Optimal Parameters</h3>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Entity</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Parameter</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Optimal Value</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((p, i) => {
                    const key = `${p.entityId}.${p.parameter}`;
                    const val = result.bestParams[key];
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{p.entityName}</td>
                        <td className="px-3 py-2">{p.parameterLabel}</td>
                        <td className="px-3 py-2 font-medium text-green-700">
                          {val != null ? val.toFixed(p.isInteger ? 0 : 2) : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {p.min} - {p.max}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Convergence Chart (SVG) */}
          {result.generations.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Convergence</h3>
              <div className="border rounded p-2 bg-gray-50">
                <svg
                  width={chartW}
                  height={chartH}
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full"
                  style={{ maxWidth: chartW }}
                >
                  <ConvergenceChart
                    generations={result.generations}
                    width={chartW}
                    height={chartH}
                    padding={chartPad}
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Apply Button */}
          <div className="flex justify-end">
            <button
              onClick={handleApplyToModel}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Apply to Model
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple SVG convergence line chart */
function ConvergenceChart({
  generations,
  width,
  height,
  padding,
}: {
  generations: { generation: number; bestFitness: number; avgFitness: number }[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}) {
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allValues = generations.flatMap((g) => [g.bestFitness, g.avgFitness]).filter(isFinite);
  if (allValues.length === 0) return null;

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const xScale = (gen: number) => padding.left + (gen / Math.max(generations.length - 1, 1)) * plotW;
  const yScale = (val: number) => padding.top + plotH - ((val - minVal) / range) * plotH;

  const bestLine = generations
    .map((g, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(g.bestFitness).toFixed(1)}`)
    .join(' ');

  const avgLine = generations
    .map((g, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(g.avgFitness).toFixed(1)}`)
    .join(' ');

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => minVal + (range * i) / (yTicks - 1));

  return (
    <g>
      {/* Grid lines */}
      {yTickValues.map((v, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke="#e5e7eb"
            strokeDasharray="2,2"
          />
          <text x={padding.left - 5} y={yScale(v) + 3} textAnchor="end" fontSize={10} fill="#6b7280">
            {v.toFixed(3)}
          </text>
        </g>
      ))}

      {/* X-axis label */}
      <text x={padding.left + plotW / 2} y={height - 4} textAnchor="middle" fontSize={10} fill="#6b7280">
        Generation
      </text>

      {/* Avg fitness line */}
      <path d={avgLine} fill="none" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4,3" />

      {/* Best fitness line */}
      <path d={bestLine} fill="none" stroke="#16a34a" strokeWidth={2} />

      {/* Dots on best */}
      {generations.map((g, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(g.bestFitness)} r={3} fill="#16a34a" />
      ))}

      {/* Legend */}
      <line x1={width - padding.right - 100} x2={width - padding.right - 80} y1={padding.top + 5} y2={padding.top + 5} stroke="#16a34a" strokeWidth={2} />
      <text x={width - padding.right - 76} y={padding.top + 9} fontSize={10} fill="#374151">Best</text>
      <line x1={width - padding.right - 100} x2={width - padding.right - 80} y1={padding.top + 20} y2={padding.top + 20} stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4,3" />
      <text x={width - padding.right - 76} y={padding.top + 24} fontSize={10} fill="#374151">Avg</text>
    </g>
  );
}
