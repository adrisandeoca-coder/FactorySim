import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useSweepStore } from '../../stores/sweepStore';
import { getParametersForEntityType } from '../../services/scenarioModelBuilder';
import { generateGrid, KPI_OPTIONS, extractKpiValue } from '../../services/sweepService';
import { TornadoChart } from './TornadoChart';
import { SweepLineChart } from './SweepLineChart';
import { SweepHeatmap } from './SweepHeatmap';
import type { SweepParameterDef, SweepConfig, ScenarioParameterOverride } from '../../types';

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

export function ParameterSweep() {
  const { model } = useModelStore();
  const { defaultOptions } = useSimulationStore();
  const { sweepResult, isRunning, progress, error, startSweep, cancelSweep, clearResults, setSweepConfig } = useSweepStore();

  // Parameter definition state
  const [parameters, setParameters] = useState<SweepParameterDef[]>([]);
  const [mode, setMode] = useState<'oat' | 'full'>('oat');
  const [kpiTarget, setKpiTarget] = useState('oee.overall');
  const [resultTab, setResultTab] = useState<'tornado' | 'line' | 'heatmap' | 'table'>('tornado');

  // Add parameter form state
  const [addEntityType, setAddEntityType] = useState<string>('station');
  const [addEntityId, setAddEntityId] = useState('');
  const [addParameter, setAddParameter] = useState('');
  const [addMin, setAddMin] = useState('');
  const [addMax, setAddMax] = useState('');
  const [addSteps, setAddSteps] = useState('5');

  // Get entities for selected type
  const entities = useMemo(() => {
    switch (addEntityType) {
      case 'station':
        return model.stations.map((s) => ({ id: s.id, name: s.name }));
      case 'buffer':
        return model.buffers.map((b) => ({ id: b.id, name: b.name }));
      case 'product':
        return model.products.map((p) => ({ id: p.id, name: p.name }));
      default: {
        return (model.extraNodes || [])
          .filter((n) => n.type === addEntityType)
          .map((n) => ({ id: n.id, name: (n.data as any).name || n.id }));
      }
    }
  }, [addEntityType, model]);

  const availableParams = useMemo(() => {
    return getParametersForEntityType(addEntityType).filter(
      (p) => !['shifts', 'feedMode', 'splitType', 'mergeType', 'inspectionType'].includes(p.key.split('.').pop()!)
    );
  }, [addEntityType]);

  const gridSize = useMemo(() => {
    if (parameters.length === 0) return 0;
    return generateGrid(parameters, mode).length;
  }, [parameters, mode]);

  const handleAddParameter = () => {
    const entity = entities.find((e) => e.id === addEntityId);
    const param = availableParams.find((p) => p.key === addParameter);
    if (!entity || !param || !addMin || !addMax) return;

    setParameters([...parameters, {
      entityType: addEntityType as ScenarioParameterOverride['entityType'],
      entityId: addEntityId,
      entityName: entity.name,
      parameter: addParameter,
      parameterLabel: param.label,
      min: parseFloat(addMin),
      max: parseFloat(addMax),
      steps: parseInt(addSteps) || 5,
    }]);

    setAddMin('');
    setAddMax('');
  };

  const handleRemoveParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleStartSweep = () => {
    const config: SweepConfig = {
      id: uuidv4(),
      name: `Sweep ${new Date().toLocaleString()}`,
      parameters,
      mode,
      kpiTarget,
      baseOptions: defaultOptions,
    };
    setSweepConfig(config);
    startSweep();
  };

  const kpiLabel = KPI_OPTIONS.find((k) => k.key === kpiTarget)?.label || kpiTarget;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <h1 className="text-2xl font-bold text-gray-900">Parameter Sweep</h1>

      {/* Configuration Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Sweep Configuration</h2>

        {/* Add Parameter Form */}
        <div className="grid grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity Type</label>
            <select
              value={addEntityType}
              onChange={(e) => { setAddEntityType(e.target.value); setAddEntityId(''); setAddParameter(''); }}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
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
                <option key={e.id} value={e.id}>{e.name}</option>
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
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-1">
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Steps</label>
              <input
                type="number"
                value={addSteps}
                onChange={(e) => setAddSteps(e.target.value)}
                min="2"
                max="20"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="col-span-2">
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Steps</th>
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
                    <td className="px-3 py-2">{p.steps}</td>
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

        {/* Run Controls */}
        <div className="flex items-center gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'oat' | 'full')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="oat">One-at-a-Time (OAT)</option>
              <option value="full">Full Grid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target KPI</label>
            <select
              value={kpiTarget}
              onChange={(e) => setKpiTarget(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {KPI_OPTIONS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <div className="text-sm text-gray-500">
            {parameters.length > 0 && `${gridSize} simulation runs`}
          </div>

          {isRunning ? (
            <button
              onClick={cancelSweep}
              className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleStartSweep}
              disabled={parameters.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              Run Sweep
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {isRunning && progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Running simulation {progress.current + 1} of {progress.total}</span>
              <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
      </div>

      {/* Results Panel */}
      {sweepResult && sweepResult.pointResults.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">Results</h2>
            <span className="text-sm text-gray-500">
              {sweepResult.pointResults.length} / {sweepResult.totalRuns} runs completed
            </span>
            <div className="flex-1" />
            <div className="flex gap-1">
              {(['tornado', 'line', 'heatmap', 'table'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setResultTab(tab)}
                  disabled={tab === 'heatmap' && parameters.length < 2}
                  className={`px-3 py-1 rounded text-sm ${
                    resultTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40'
                  }`}
                >
                  {tab === 'tornado' ? 'Tornado' : tab === 'line' ? 'Line' : tab === 'heatmap' ? 'Heatmap' : 'Table'}
                </button>
              ))}
            </div>
            <button onClick={clearResults} className="text-sm text-gray-500 hover:text-red-600">
              Clear
            </button>
          </div>

          {resultTab === 'tornado' && (
            <TornadoChart result={sweepResult} parameters={parameters} kpiPath={kpiTarget} kpiLabel={kpiLabel} />
          )}
          {resultTab === 'line' && (
            <SweepLineChart result={sweepResult} parameters={parameters} kpiPath={kpiTarget} kpiLabel={kpiLabel} />
          )}
          {resultTab === 'heatmap' && (
            <SweepHeatmap result={sweepResult} parameters={parameters} kpiPath={kpiTarget} kpiLabel={kpiLabel} />
          )}
          {resultTab === 'table' && (
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    {parameters.map((p, i) => (
                      <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        {p.entityName}: {p.parameterLabel}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{kpiLabel}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Throughput</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">OEE</th>
                  </tr>
                </thead>
                <tbody>
                  {sweepResult.pointResults.map((pr, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>
                      {parameters.map((p, i) => (
                        <td key={i} className="px-3 py-1.5">
                          {pr.parameterValues[`${p.entityId}.${p.parameter}`]?.toFixed(2)}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 font-medium">
                        {extractKpiValue(pr.kpis, kpiTarget).toFixed(4)}
                      </td>
                      <td className="px-3 py-1.5">{pr.kpis.throughput?.total ?? '-'}</td>
                      <td className="px-3 py-1.5">{((pr.kpis.oee?.overall ?? 0) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
