import { create } from 'zustand';
import { useModelStore } from './modelStore';
import { runOptimization } from '../services/optimizationEngine';
import type { OptimizationConfig, OptimizationResult } from '../services/optimizationEngine';

interface OptimizationProgress {
  generation: number;
  totalGenerations: number;
  bestFitness: number;
}

interface OptimizationState {
  isRunning: boolean;
  progress: OptimizationProgress | null;
  result: OptimizationResult | null;
  error: string | null;
  cancelToken: { cancelled: boolean } | null;

  startOptimization: (config: OptimizationConfig) => Promise<void>;
  stopOptimization: () => void;
  clearResults: () => void;
}

export const useOptimizationStore = create<OptimizationState>((set, get) => ({
  isRunning: false,
  progress: null,
  result: null,
  error: null,
  cancelToken: null,

  startOptimization: async (config) => {
    const model = useModelStore.getState().model;
    const token = { cancelled: false };
    set({
      isRunning: true,
      error: null,
      progress: { generation: 0, totalGenerations: config.generations ?? 15, bestFitness: 0 },
      result: null,
      cancelToken: token,
    });

    try {
      const result = await runOptimization(
        model,
        config,
        (gen, totalGens, best) => {
          set({ progress: { generation: gen, totalGenerations: totalGens, bestFitness: best } });
        },
        token
      );
      set({ result, isRunning: false, progress: null, cancelToken: null });
    } catch (err: any) {
      set({
        error: err.message || 'Optimization failed',
        isRunning: false,
        progress: null,
        cancelToken: null,
      });
    }
  },

  stopOptimization: () => {
    const { cancelToken } = get();
    if (cancelToken) {
      cancelToken.cancelled = true;
    }
    set({ isRunning: false, progress: null, cancelToken: null });
  },

  clearResults: () => set({ result: null, error: null }),
}));
