import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationStore, getKPIStatus, formatDuration, formatPercentage } from '../stores/simulationStore';
import type { SimulationResult, Scenario } from '../types';

beforeEach(() => {
  // Reset to initial state
  useSimulationStore.setState({
    isRunning: false,
    progress: 0,
    currentRunId: null,
    lastResult: null,
    resultHistory: [],
    scenarios: [],
    selectedScenarioIds: [],
    comparisonMode: false,
  });
});

const makeResult = (runId: string): SimulationResult => ({
  runId,
  status: 'completed',
  duration: 28800,
  kpis: {
    oee: { overall: 0.85, availability: 0.9, performance: 0.95, quality: 0.99, byStation: {} },
    throughput: { total: 100, ratePerHour: 12.5, byProduct: {}, byHour: [] },
    utilization: { byStation: {}, byResource: {} },
    wip: { total: 5, byBuffer: {}, timeSeries: [] },
    cycleTime: { mean: 120, std: 15, min: 100, max: 150, byProduct: {} },
  },
  events: [],
});

const makeScenario = (id: string, name: string): Scenario => ({
  id,
  name,
  modelId: 'model-1',
  parameters: {},
  createdAt: new Date().toISOString(),
});

describe('simulationStore — simulation lifecycle', () => {
  it('starts with isRunning = false', () => {
    expect(useSimulationStore.getState().isRunning).toBe(false);
  });

  it('startSimulation sets isRunning and generates a runId', () => {
    useSimulationStore.getState().startSimulation();
    const state = useSimulationStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.currentRunId).toBeTruthy();
    expect(state.progress).toBe(0);
  });

  it('stopSimulation resets running state', () => {
    useSimulationStore.getState().startSimulation();
    useSimulationStore.getState().stopSimulation();
    const state = useSimulationStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.currentRunId).toBeNull();
  });

  it('setProgress updates progress for current run', () => {
    useSimulationStore.getState().startSimulation();
    const runId = useSimulationStore.getState().currentRunId!;
    useSimulationStore.getState().setProgress(50, runId);
    expect(useSimulationStore.getState().progress).toBe(50);
  });

  it('setProgress ignores updates for wrong runId', () => {
    useSimulationStore.getState().startSimulation();
    useSimulationStore.getState().setProgress(50, 'wrong-id');
    expect(useSimulationStore.getState().progress).toBe(0);
  });

  it('setResult stores the result and adds to history', () => {
    const result = makeResult('run-1');
    useSimulationStore.getState().setResult(result);
    expect(useSimulationStore.getState().lastResult).toBe(result);
    expect(useSimulationStore.getState().resultHistory).toHaveLength(1);
    expect(useSimulationStore.getState().isRunning).toBe(false);
    expect(useSimulationStore.getState().progress).toBe(100);
  });

  it('resultHistory is limited to 10 entries', () => {
    for (let i = 0; i < 12; i++) {
      useSimulationStore.getState().setResult(makeResult(`run-${i}`));
    }
    expect(useSimulationStore.getState().resultHistory).toHaveLength(10);
    // Most recent should be first
    expect(useSimulationStore.getState().resultHistory[0].runId).toBe('run-11');
  });

  it('clearResults wipes lastResult and history', () => {
    useSimulationStore.getState().setResult(makeResult('run-1'));
    useSimulationStore.getState().clearResults();
    expect(useSimulationStore.getState().lastResult).toBeNull();
    expect(useSimulationStore.getState().resultHistory).toHaveLength(0);
  });
});

describe('simulationStore — scenarios', () => {
  it('adds a scenario', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    expect(useSimulationStore.getState().scenarios).toHaveLength(1);
    expect(useSimulationStore.getState().scenarios[0].name).toBe('Baseline');
  });

  it('removes a scenario and deselects it', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    useSimulationStore.getState().selectScenario('sc1');
    useSimulationStore.getState().removeScenario('sc1');
    expect(useSimulationStore.getState().scenarios).toHaveLength(0);
    expect(useSimulationStore.getState().selectedScenarioIds).not.toContain('sc1');
  });

  it('updates scenario results', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    const result = makeResult('run-1');
    useSimulationStore.getState().updateScenarioResults('sc1', result);
    expect(useSimulationStore.getState().scenarios[0].results).toBe(result);
  });

  it('selects up to 4 scenarios for comparison', () => {
    for (let i = 1; i <= 5; i++) {
      useSimulationStore.getState().addScenario(makeScenario(`sc${i}`, `Scenario ${i}`));
      useSimulationStore.getState().selectScenario(`sc${i}`);
    }
    expect(useSimulationStore.getState().selectedScenarioIds).toHaveLength(4);
  });

  it('does not double-select a scenario', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    useSimulationStore.getState().selectScenario('sc1');
    useSimulationStore.getState().selectScenario('sc1');
    expect(useSimulationStore.getState().selectedScenarioIds).toHaveLength(1);
  });

  it('deselects a scenario', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    useSimulationStore.getState().selectScenario('sc1');
    useSimulationStore.getState().deselectScenario('sc1');
    expect(useSimulationStore.getState().selectedScenarioIds).toHaveLength(0);
  });

  it('toggles comparison mode', () => {
    expect(useSimulationStore.getState().comparisonMode).toBe(false);
    useSimulationStore.getState().toggleComparisonMode();
    expect(useSimulationStore.getState().comparisonMode).toBe(true);
    useSimulationStore.getState().toggleComparisonMode();
    expect(useSimulationStore.getState().comparisonMode).toBe(false);
  });

  it('clearScenarioSelection empties the selection', () => {
    useSimulationStore.getState().addScenario(makeScenario('sc1', 'Baseline'));
    useSimulationStore.getState().selectScenario('sc1');
    useSimulationStore.getState().clearScenarioSelection();
    expect(useSimulationStore.getState().selectedScenarioIds).toHaveLength(0);
  });
});

describe('simulationStore — options', () => {
  it('has sensible default options', () => {
    const opts = useSimulationStore.getState().defaultOptions;
    expect(opts.duration).toBe(28800);
    expect(opts.replications).toBe(1);
    expect(opts.confidenceLevel).toBe(0.95);
  });

  it('setDefaultOptions merges partial updates', () => {
    useSimulationStore.getState().setDefaultOptions({ duration: 3600, seed: 42 });
    const opts = useSimulationStore.getState().defaultOptions;
    expect(opts.duration).toBe(3600);
    expect(opts.seed).toBe(42);
    expect(opts.replications).toBe(1); // unchanged
  });
});

describe('helper functions', () => {
  describe('getKPIStatus', () => {
    it('returns good for high OEE', () => {
      const kpis = makeResult('r1').kpis;
      expect(getKPIStatus(kpis).oee).toBe('good');
    });

    it('returns warning for mid-range OEE', () => {
      const kpis = makeResult('r1').kpis;
      kpis.oee.overall = 0.70;
      expect(getKPIStatus(kpis).oee).toBe('warning');
    });

    it('returns bad for low OEE', () => {
      const kpis = makeResult('r1').kpis;
      kpis.oee.overall = 0.50;
      expect(getKPIStatus(kpis).oee).toBe('bad');
    });
  });

  describe('formatDuration', () => {
    it('formats hours and minutes', () => {
      expect(formatDuration(3661)).toBe('1h 1m');
    });

    it('formats minutes only when < 1 hour', () => {
      expect(formatDuration(300)).toBe('5m');
    });
  });

  describe('formatPercentage', () => {
    it('formats decimal as percentage', () => {
      expect(formatPercentage(0.856)).toBe('85.6%');
    });
  });
});
