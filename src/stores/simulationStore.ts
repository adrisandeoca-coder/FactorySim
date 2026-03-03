import { create } from 'zustand';
import type { SimulationResult, SimulationOptions, KPIData, Scenario } from '../types';
import { useModelStore } from './modelStore';

interface SimulationState {
  // Current simulation
  isRunning: boolean;
  progress: number;
  currentRunId: string | null;

  // Results
  lastResult: SimulationResult | null;
  resultHistory: SimulationResult[];
  /** runId of the last result whose artifacts were saved — prevents duplicate saves on remount */
  lastSavedRunId: string | null;

  // Scenarios
  scenarios: Scenario[];
  selectedScenarioIds: string[];
  comparisonMode: boolean;

  // Options
  defaultOptions: SimulationOptions;

  // Actions
  startSimulation: (options?: Partial<SimulationOptions>) => void;
  stopSimulation: () => void;
  setProgress: (progress: number, runId: string) => void;
  setResult: (result: SimulationResult) => void;
  clearResults: () => void;
  markRunSaved: (runId: string) => void;

  // Scenario actions
  addScenario: (scenario: Scenario) => void;
  updateScenarioResults: (id: string, results: SimulationResult) => void;
  removeScenario: (id: string) => void;
  selectScenario: (id: string) => void;
  deselectScenario: (id: string) => void;
  toggleComparisonMode: () => void;
  clearScenarioSelection: () => void;

  // Options actions
  setDefaultOptions: (options: Partial<SimulationOptions>) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  isRunning: false,
  progress: 0,
  currentRunId: null,
  lastResult: null,
  resultHistory: [],
  lastSavedRunId: null,
  scenarios: [],
  selectedScenarioIds: [],
  comparisonMode: false,
  defaultOptions: {
    duration: 28800, // 8 hours in seconds
    warmupPeriod: 0,
    seed: undefined,
    replications: 1,
    traceMode: false,
    confidenceLevel: 0.95,
    streamEvents: false,
  },

  startSimulation: (options) => {
    const runId = Math.random().toString(36).substring(2, 9);
    set({
      isRunning: true,
      progress: 0,
      currentRunId: runId,
    });

    // In a real implementation, this would call the Python bridge
    console.log('Starting simulation with options:', {
      ...get().defaultOptions,
      ...options,
    });
  },

  stopSimulation: () => {
    set({
      isRunning: false,
      progress: 0,
      currentRunId: null,
    });
  },

  setProgress: (progress, runId) => {
    if (get().currentRunId === runId) {
      set({ progress });
    }
  },

  setResult: (result) => {
    set((state) => ({
      isRunning: false,
      progress: 100,
      lastResult: result,
      resultHistory: [result, ...state.resultHistory].slice(0, 10),
    }));
  },

  clearResults: () => {
    set({
      lastResult: null,
      resultHistory: [],
      lastSavedRunId: null,
    });
  },

  markRunSaved: (runId: string) => {
    set({ lastSavedRunId: runId });
  },

  addScenario: (scenario) => {
    set((state) => ({
      scenarios: [...state.scenarios, scenario],
    }));
  },

  updateScenarioResults: (id, results) => {
    set((state) => ({
      scenarios: state.scenarios.map((s) =>
        s.id === id ? { ...s, results } : s
      ),
    }));
  },

  removeScenario: (id) => {
    set((state) => ({
      scenarios: state.scenarios.filter((s) => s.id !== id),
      selectedScenarioIds: state.selectedScenarioIds.filter((sId) => sId !== id),
    }));
  },

  selectScenario: (id) => {
    set((state) => {
      if (state.selectedScenarioIds.includes(id)) {
        return state;
      }
      // Limit to 4 scenarios for comparison
      const newSelection = [...state.selectedScenarioIds, id].slice(-4);
      return { selectedScenarioIds: newSelection };
    });
  },

  deselectScenario: (id) => {
    set((state) => ({
      selectedScenarioIds: state.selectedScenarioIds.filter((sId) => sId !== id),
    }));
  },

  toggleComparisonMode: () => {
    set((state) => ({ comparisonMode: !state.comparisonMode }));
  },

  clearScenarioSelection: () => {
    set({ selectedScenarioIds: [] });
  },

  setDefaultOptions: (options) => {
    set((state) => ({
      defaultOptions: { ...state.defaultOptions, ...options },
    }));
  },
}));

// --- Cross-store subscription ---
// Clear stale simulation results whenever the model changes, even when
// Dashboard is unmounted.  This prevents the artifact-save useEffect from
// re-saving the previous model's KPIs on Dashboard remount.
let _prevModelId: string | undefined;
useModelStore.subscribe((state) => {
  const newId = state.model?.id;
  if (_prevModelId !== undefined && newId !== _prevModelId) {
    useSimulationStore.getState().clearResults();
  }
  _prevModelId = newId;
});

// Helper functions for KPI analysis
export function getKPIStatus(kpis: KPIData): {
  oee: 'good' | 'warning' | 'bad';
  throughput: 'good' | 'warning' | 'bad';
  quality: 'good' | 'warning' | 'bad';
} {
  return {
    oee: kpis.oee.overall >= 0.85 ? 'good' : kpis.oee.overall >= 0.65 ? 'warning' : 'bad',
    throughput: kpis.throughput.total > 0 ? 'good' : 'warning',
    quality: kpis.oee.quality >= 0.95 ? 'good' : kpis.oee.quality >= 0.85 ? 'warning' : 'bad',
  };
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
