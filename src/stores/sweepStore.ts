import { create } from 'zustand';
import type { SweepConfig, SweepResult } from '../types';
import { runSweep, cancelSweep as cancelSweepService } from '../services/sweepService';
import { useModelStore } from './modelStore';

interface SweepState {
  sweepConfig: SweepConfig | null;
  sweepResult: SweepResult | null;
  isRunning: boolean;
  progress: { current: number; total: number } | null;
  error: string | null;

  setSweepConfig: (config: SweepConfig) => void;
  startSweep: () => Promise<void>;
  cancelSweep: () => void;
  clearResults: () => void;
}

export const useSweepStore = create<SweepState>((set, get) => ({
  sweepConfig: null,
  sweepResult: null,
  isRunning: false,
  progress: null,
  error: null,

  setSweepConfig: (config) => set({ sweepConfig: config }),

  startSweep: async () => {
    const { sweepConfig } = get();
    if (!sweepConfig) return;

    const model = useModelStore.getState().model;
    set({ isRunning: true, error: null, progress: { current: 0, total: 0 }, sweepResult: null });

    try {
      const result = await runSweep(model, sweepConfig, (current, total) => {
        set({ progress: { current, total } });
      });
      set({ sweepResult: result, isRunning: false, progress: null });
    } catch (err: any) {
      set({ error: err.message || 'Sweep failed', isRunning: false, progress: null });
    }
  },

  cancelSweep: () => {
    cancelSweepService();
    set({ isRunning: false, progress: null });
  },

  clearResults: () => set({ sweepResult: null, error: null }),
}));
