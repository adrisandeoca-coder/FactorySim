import { useState, useCallback, useMemo } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import {
  Play, Plus, Trash2, FlaskConical, Settings2, Trophy,
  ChevronDown, ChevronUp, Target, Repeat, GitBranch,
} from 'lucide-react';
import type {
  ExperimentMode, ExperimentConfig, ExperimentParameterRange,
  ExperimentResult, ExperimentTrialResult, SimulationOptions,
} from '../../types';

// ── Objective KPI options ──

const OBJECTIVE_OPTIONS = [
  { value: 'throughput', label: 'Throughput' },
  { value: 'oee', label: 'OEE' },
  { value: 'cycle_time', label: 'Cycle Time' },
  { value: 'utilization', label: 'Utilization' },
  { value: 'wip', label: 'WIP' },
  { value: 'cost_per_unit', label: 'Cost per Unit' },
  { value: 'energy_per_unit', label: 'Energy per Unit' },
];

// ── Default configs ──

function defaultParameter(): ExperimentParameterRange {
  return { path: '', label: '', min: 0, max: 100, step: 10 };
}

function defaultConfig(): ExperimentConfig {
  return {
    mode: 'sweep',
    parameters: [defaultParameter()],
    replications: 5,
    confidenceLevel: 0.95,
    objective: 'throughput',
    maximize: true,
    populationSize: 20,
    generations: 10,
    mutationRate: 0.1,
    crossoverRate: 0.8,
    elitismCount: 2,
  };
}

// ── Helpers ──

function estimateTotalRuns(params: ExperimentParameterRange[]): number {
  if (params.length === 0) return 0;
  return params.reduce((acc, p) => {
    const steps = p.step > 0 ? Math.floor((p.max - p.min) / p.step) + 1 : 1;
    return acc * Math.max(steps, 1);
  }, 1);
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatNumber(v: number | undefined): string {
  if (v === undefined || v === null) return '-';
  return typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : String(v);
}

// ── Mode tab config ──

const MODE_TABS: { mode: ExperimentMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { mode: 'sweep', label: 'Parameter Sweep', icon: <GitBranch size={16} />, desc: 'Explore all combinations in a parameter grid' },
  { mode: 'optimize', label: 'Optimize (GA)', icon: <Target size={16} />, desc: 'Find optimal parameters via genetic algorithm' },
  { mode: 'replicate', label: 'Replicate', icon: <Repeat size={16} />, desc: 'Run multiple replications for confidence intervals' },
];

// ── Sub-components ──

function ModeSelector({ mode, onChange }: { mode: ExperimentMode; onChange: (m: ExperimentMode) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 8, padding: 4 }}>
      {MODE_TABS.map(tab => (
        <button
          key={tab.mode}
          onClick={() => onChange(tab.mode)}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 6, border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s',
            background: mode === tab.mode ? 'var(--blue)' : 'transparent',
            color: mode === tab.mode ? '#fff' : 'var(--text-secondary)',
          }}
          title={tab.desc}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface ParameterTableProps {
  parameters: ExperimentParameterRange[];
  onChange: (params: ExperimentParameterRange[]) => void;
}

function ParameterTable({ parameters, onChange }: ParameterTableProps) {
  const updateRow = (idx: number, field: keyof ExperimentParameterRange, value: string | number) => {
    const next = [...parameters];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const addRow = () => onChange([...parameters, defaultParameter()]);
  const removeRow = (idx: number) => onChange(parameters.filter((_, i) => i !== idx));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-primary)',
  };

  const thStyle: React.CSSProperties = {
    padding: '6px 8px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '4px 6px', borderBottom: '1px solid var(--border)',
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Path</th>
            <th style={thStyle}>Label</th>
            <th style={{ ...thStyle, width: 80 }}>Min</th>
            <th style={{ ...thStyle, width: 80 }}>Max</th>
            <th style={{ ...thStyle, width: 80 }}>Step</th>
            <th style={{ ...thStyle, width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((p, i) => (
            <tr key={i}>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  value={p.path}
                  onChange={e => updateRow(i, 'path', e.target.value)}
                  placeholder="stations.0.cycleTime.parameters.value"
                />
              </td>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  value={p.label}
                  onChange={e => updateRow(i, 'label', e.target.value)}
                  placeholder="Cycle Time"
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number" style={inputStyle}
                  value={p.min}
                  onChange={e => updateRow(i, 'min', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number" style={inputStyle}
                  value={p.max}
                  onChange={e => updateRow(i, 'max', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number" style={inputStyle}
                  value={p.step}
                  onChange={e => updateRow(i, 'step', parseFloat(e.target.value) || 1)}
                />
              </td>
              <td style={tdStyle}>
                <button
                  onClick={() => removeRow(i)}
                  disabled={parameters.length <= 1}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: parameters.length <= 1 ? 'var(--text-muted)' : 'var(--red)',
                    padding: 4,
                  }}
                  title="Remove parameter"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addRow}>
          Add Parameter
        </Button>
      </div>
    </div>
  );
}

function SweepSettings({ config }: { config: ExperimentConfig }) {
  const totalRuns = estimateTotalRuns(config.parameters);

  return (
    <Card>
      <CardHeader title="Sweep Grid Summary" subtitle="Full factorial parameter sweep" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 8, padding: 12, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Parameters</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{config.parameters.length}</div>
        </div>
        <div style={{
          background: 'var(--surface)', borderRadius: 8, padding: 12, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Estimated Runs</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{totalRuns.toLocaleString()}</div>
        </div>
        {config.parameters.map((p, i) => (
          <div key={i} style={{
            background: 'var(--surface)', borderRadius: 8, padding: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {p.label || p.path || `Param ${i + 1}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {p.min} - {p.max} (step {p.step})
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {p.step > 0 ? Math.floor((p.max - p.min) / p.step) + 1 : 1} levels
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface OptimizeSettingsProps {
  config: ExperimentConfig;
  onChange: (c: Partial<ExperimentConfig>) => void;
}

function OptimizeSettings({ config, onChange }: OptimizeSettingsProps) {
  const fieldRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 0', borderBottom: '1px solid var(--border)',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' };
  const inputStyle: React.CSSProperties = {
    width: 120, padding: '4px 8px', fontSize: 12, borderRadius: 4,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-primary)', textAlign: 'right',
  };

  return (
    <Card>
      <CardHeader title="Optimization Settings" subtitle="Genetic algorithm configuration" />
      <div style={fieldRow}>
        <span style={labelStyle}>Objective KPI</span>
        <select
          value={config.objective || 'throughput'}
          onChange={e => onChange({ objective: e.target.value })}
          style={{ ...inputStyle, width: 160, textAlign: 'left' }}
        >
          {OBJECTIVE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div style={fieldRow}>
        <span style={labelStyle}>Direction</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[true, false].map(max => (
            <button
              key={String(max)}
              onClick={() => onChange({ maximize: max })}
              style={{
                padding: '4px 12px', borderRadius: 4, border: 'none', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
                background: config.maximize === max ? 'var(--blue)' : 'var(--surface)',
                color: config.maximize === max ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {max ? 'Maximize' : 'Minimize'}
            </button>
          ))}
        </div>
      </div>
      <div style={fieldRow}>
        <span style={labelStyle}>Population Size</span>
        <input type="number" style={inputStyle} value={config.populationSize ?? 20}
          onChange={e => onChange({ populationSize: parseInt(e.target.value) || 20 })} min={4} max={200} />
      </div>
      <div style={fieldRow}>
        <span style={labelStyle}>Generations</span>
        <input type="number" style={inputStyle} value={config.generations ?? 10}
          onChange={e => onChange({ generations: parseInt(e.target.value) || 10 })} min={1} max={500} />
      </div>
      <div style={fieldRow}>
        <span style={labelStyle}>Mutation Rate</span>
        <input type="number" style={inputStyle} value={config.mutationRate ?? 0.1}
          onChange={e => onChange({ mutationRate: parseFloat(e.target.value) || 0.1 })} min={0} max={1} step={0.01} />
      </div>
      <div style={fieldRow}>
        <span style={labelStyle}>Crossover Rate</span>
        <input type="number" style={inputStyle} value={config.crossoverRate ?? 0.8}
          onChange={e => onChange({ crossoverRate: parseFloat(e.target.value) || 0.8 })} min={0} max={1} step={0.01} />
      </div>
      <div style={{ ...fieldRow, borderBottom: 'none' }}>
        <span style={labelStyle}>Elitism Count</span>
        <input type="number" style={inputStyle} value={config.elitismCount ?? 2}
          onChange={e => onChange({ elitismCount: parseInt(e.target.value) || 2 })} min={0} max={50} />
      </div>
    </Card>
  );
}

interface ReplicateSettingsProps {
  config: ExperimentConfig;
  onChange: (c: Partial<ExperimentConfig>) => void;
}

function ReplicateSettings({ config, onChange }: ReplicateSettingsProps) {
  const fieldRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0', borderBottom: '1px solid var(--border)',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' };
  const inputStyle: React.CSSProperties = {
    width: 120, padding: '4px 8px', fontSize: 12, borderRadius: 4,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-primary)', textAlign: 'right',
  };

  return (
    <Card>
      <CardHeader title="Replication Settings" subtitle="Statistical confidence via repeated runs" />
      <div style={fieldRow}>
        <span style={labelStyle}>Number of Replications</span>
        <input type="number" style={inputStyle} value={config.replications}
          onChange={e => onChange({ replications: parseInt(e.target.value) || 5 })} min={2} max={1000} />
      </div>
      <div style={{ ...fieldRow, borderBottom: 'none' }}>
        <span style={labelStyle}>Confidence Level</span>
        <select
          value={config.confidenceLevel}
          onChange={e => onChange({ confidenceLevel: parseFloat(e.target.value) })}
          style={{ ...inputStyle, textAlign: 'left' }}
        >
          <option value={0.9}>90%</option>
          <option value={0.95}>95%</option>
          <option value={0.99}>99%</option>
        </select>
      </div>
    </Card>
  );
}

interface ResultsDisplayProps {
  result: ExperimentResult;
}

function ResultsDisplay({ result }: ResultsDisplayProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const paramKeys = useMemo(() => {
    if (result.trials.length === 0) return [];
    return Object.keys(result.trials[0].parameters);
  }, [result.trials]);

  const sortedTrials = useMemo(() => {
    const trials = [...result.trials];
    if (!sortCol) return trials;
    return trials.sort((a, b) => {
      let va: number, vb: number;
      if (sortCol === '__objective') {
        va = a.objectiveValue ?? 0;
        vb = b.objectiveValue ?? 0;
      } else {
        va = a.parameters[sortCol] ?? 0;
        vb = b.parameters[sortCol] ?? 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
  }, [result.trials, sortCol, sortAsc]);

  const displayTrials = expanded ? sortedTrials : sortedTrials.slice(0, 20);
  const isBest = (t: ExperimentTrialResult) =>
    result.bestTrial && JSON.stringify(t.parameters) === JSON.stringify(result.bestTrial.parameters);

  const toggleSort = (col: string) => {
    if (sortCol === col) { setSortAsc(!sortAsc); }
    else { setSortCol(col); setSortAsc(true); }
  };

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'right', cursor: 'pointer',
    borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 12, textAlign: 'right',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <Card>
      <CardHeader
        title="Experiment Results"
        subtitle={`${result.totalRuns} runs completed in ${formatSeconds(result.elapsedSeconds)}`}
        action={
          result.bestTrial ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(var(--data-green-rgb, 34,197,94), 0.1)',
              border: '1px solid var(--data-green)',
              borderRadius: 6, padding: '4px 10px',
            }}>
              <Trophy size={14} style={{ color: 'var(--data-green)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--data-green)' }}>
                Best: {formatNumber(result.bestTrial.objectiveValue)}
              </span>
            </div>
          ) : undefined
        }
      />

      {/* Summary stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 8, marginBottom: 16,
      }}>
        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mode</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
            {result.mode}
          </div>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Runs</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>
            {result.totalRuns.toLocaleString()}
          </div>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Trials</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {result.trials.length}
          </div>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Elapsed</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatSeconds(result.elapsedSeconds)}
          </div>
        </div>
      </div>

      {/* Results table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'center', width: 40 }}>#</th>
              {paramKeys.map(k => (
                <th key={k} style={thStyle} onClick={() => toggleSort(k)}>
                  {k}
                  {sortCol === k && (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </th>
              ))}
              {result.trials.some(t => t.objectiveValue !== undefined) && (
                <th style={{ ...thStyle, color: 'var(--blue)' }} onClick={() => toggleSort('__objective')}>
                  Objective
                  {sortCol === '__objective' && (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </th>
              )}
              {result.mode === 'replicate' && (
                <>
                  <th style={thStyle}>CI Lower</th>
                  <th style={thStyle}>CI Upper</th>
                  <th style={thStyle}>Std Dev</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayTrials.map((trial, i) => {
              const best = isBest(trial);
              const rowBg = best
                ? 'rgba(var(--data-green-rgb, 34,197,94), 0.08)'
                : i % 2 === 0 ? 'transparent' : 'var(--surface)';
              return (
                <tr key={i} style={{ background: rowBg }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: best ? 700 : 400 }}>
                    {best && <Trophy size={12} style={{ color: 'var(--data-green)', marginRight: 2 }} />}
                    {i + 1}
                  </td>
                  {paramKeys.map(k => (
                    <td key={k} style={{ ...tdStyle, fontWeight: best ? 600 : 400 }}>
                      {formatNumber(trial.parameters[k])}
                    </td>
                  ))}
                  {trial.objectiveValue !== undefined && (
                    <td style={{ ...tdStyle, fontWeight: 600, color: best ? 'var(--data-green)' : 'var(--blue)' }}>
                      {formatNumber(trial.objectiveValue)}
                    </td>
                  )}
                  {result.mode === 'replicate' && trial.confidenceInterval && (
                    <>
                      <td style={tdStyle}>{formatNumber(trial.confidenceInterval.ci_lower)}</td>
                      <td style={tdStyle}>{formatNumber(trial.confidenceInterval.ci_upper)}</td>
                      <td style={tdStyle}>{formatNumber(trial.confidenceInterval.std)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedTrials.length > 20 && (
        <div style={{ textAlign: 'center', padding: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show Less' : `Show All ${sortedTrials.length} Trials`}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Main component ──

export function ExperimentManager() {
  const model = useModelStore(s => s.model);
  const [config, setConfig] = useState<ExperimentConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = useCallback((partial: Partial<ExperimentConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const handleModeChange = useCallback((mode: ExperimentMode) => {
    updateConfig({ mode });
  }, [updateConfig]);

  const handleParametersChange = useCallback((parameters: ExperimentParameterRange[]) => {
    updateConfig({ parameters });
  }, [updateConfig]);

  const canRun = useMemo(() => {
    if (running) return false;
    if (config.parameters.length === 0) return false;
    const allValid = config.parameters.every(p => p.path.trim() !== '' && p.max > p.min && p.step > 0);
    if (!allValid) return false;
    if (config.mode === 'optimize' && !config.objective) return false;
    return true;
  }, [running, config]);

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const simApi = window.factorySim?.simulation as any;
      if (!simApi?.runExperiment) {
        throw new Error('Experiment API not available. Make sure the Python bridge is connected.');
      }

      const simOptions: SimulationOptions = {
        duration: 28800,
        replications: config.mode === 'replicate' ? config.replications : 1,
        confidenceLevel: config.confidenceLevel,
      };

      const experimentResult: ExperimentResult = await simApi.runExperiment(model, simOptions, config);
      setResult(experimentResult);
    } catch (err: any) {
      setError(err?.message || 'Experiment failed');
    } finally {
      setRunning(false);
    }
  }, [canRun, model, config]);

  const totalEstimated = config.mode === 'sweep'
    ? estimateTotalRuns(config.parameters)
    : config.mode === 'optimize'
      ? (config.populationSize ?? 20) * (config.generations ?? 10)
      : config.replications;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FlaskConical size={22} style={{ color: 'var(--blue)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Experiment Manager
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Sweep parameters, optimize KPIs, or run replications for statistical confidence
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            ~{totalEstimated.toLocaleString()} runs
          </span>
          <Button
            variant="primary"
            size="lg"
            icon={<Play size={16} />}
            loading={running}
            disabled={!canRun}
            onClick={handleRun}
          >
            {running ? 'Running...' : 'Run Experiment'}
          </Button>
        </div>
      </div>

      {/* Mode selector */}
      <ModeSelector mode={config.mode} onChange={handleModeChange} />

      {/* Parameter configuration */}
      <Card>
        <CardHeader
          title="Parameters"
          subtitle="Define the parameter ranges to explore"
          action={
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--text-secondary)',
              }}
            >
              <Settings2 size={14} />
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </button>
          }
        />
        <ParameterTable parameters={config.parameters} onChange={handleParametersChange} />
      </Card>

      {/* Mode-specific settings */}
      {config.mode === 'sweep' && <SweepSettings config={config} />}
      {config.mode === 'optimize' && <OptimizeSettings config={config} onChange={updateConfig} />}
      {config.mode === 'replicate' && <ReplicateSettings config={config} onChange={updateConfig} />}

      {/* Advanced: common settings visible in all modes when toggled */}
      {showAdvanced && (config.mode === 'sweep' || config.mode === 'optimize') && (
        <Card>
          <CardHeader title="Replication per Trial" subtitle="Run multiple replications per parameter combination" />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Replications per trial
            </span>
            <input
              type="number"
              value={config.replications}
              onChange={e => updateConfig({ replications: parseInt(e.target.value) || 1 })}
              min={1} max={100}
              style={{
                width: 100, padding: '4px 8px', fontSize: 12, borderRadius: 4,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-primary)', textAlign: 'right',
              }}
            />
          </div>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)',
          color: 'var(--red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Progress indicator */}
      {running && (
        <Card>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: 32, gap: 12,
          }}>
            <div className="spinner" style={{ width: 32, height: 32 }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
                <circle opacity="0.25" cx="12" cy="12" r="10" stroke="var(--blue)" strokeWidth="4" />
                <path opacity="0.75" fill="var(--blue)"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Running experiment...
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Estimated ~{totalEstimated.toLocaleString()} simulation runs in {config.mode} mode
            </span>
          </div>
        </Card>
      )}

      {/* Results */}
      {result && !running && (
        <>
          <ResultsDisplay result={result} />

          {/* Best trial detail for optimize mode */}
          {result.bestTrial && result.mode === 'optimize' && (
            <Card>
              <CardHeader title="Optimal Configuration" subtitle="Best parameter set found by the genetic algorithm" />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
              }}>
                {Object.entries(result.bestTrial.parameters).map(([key, val]) => (
                  <div key={key} style={{
                    background: 'var(--surface)', borderRadius: 6, padding: 10,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {key}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatNumber(val)}
                    </div>
                  </div>
                ))}
                {result.bestTrial.objectiveValue !== undefined && (
                  <div style={{
                    background: 'rgba(var(--data-green-rgb, 34,197,94), 0.08)',
                    border: '1px solid var(--data-green)',
                    borderRadius: 6, padding: 10,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--data-green)', textTransform: 'uppercase' }}>
                      Objective Value
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--data-green)' }}>
                      {formatNumber(result.bestTrial.objectiveValue)}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Confidence intervals detail for replicate mode */}
          {result.mode === 'replicate' && result.trials.length > 0 && result.trials[0].confidenceInterval && (
            <Card>
              <CardHeader
                title="Confidence Intervals"
                subtitle={`${(config.confidenceLevel * 100).toFixed(0)}% confidence level across ${config.replications} replications`}
              />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}>
                {result.trials.map((trial, i) => {
                  const ci = trial.confidenceInterval;
                  if (!ci) return null;
                  const paramLabel = Object.entries(trial.parameters)
                    .map(([k, v]) => `${k}=${formatNumber(v)}`)
                    .join(', ');
                  return (
                    <div key={i} style={{
                      background: 'var(--surface)', borderRadius: 8, padding: 12,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        {paramLabel || `Trial ${i + 1}`}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {formatNumber(ci.mean)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        [{formatNumber(ci.ci_lower)}, {formatNumber(ci.ci_upper)}]
                      </div>
                      {ci.half_width !== undefined && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          Half-width: {formatNumber(ci.half_width)}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        Std: {formatNumber(ci.std)}
                      </div>
                      {/* Visual CI bar */}
                      <div style={{
                        marginTop: 8, height: 6, background: 'var(--border)',
                        borderRadius: 3, position: 'relative', overflow: 'hidden',
                      }}>
                        {(() => {
                          const range = ci.ci_upper - ci.ci_lower;
                          const meanPos = range > 0 ? ((ci.mean - ci.ci_lower) / range) * 100 : 50;
                          return (
                            <>
                              <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: '100%', background: 'var(--blue)', opacity: 0.25, borderRadius: 3,
                              }} />
                              <div style={{
                                position: 'absolute', left: `${meanPos}%`, top: -1,
                                width: 4, height: 8, background: 'var(--blue)',
                                borderRadius: 2, transform: 'translateX(-50%)',
                              }} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
