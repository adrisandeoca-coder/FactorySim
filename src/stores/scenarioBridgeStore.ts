import { create } from 'zustand';
import type { ScenarioInput } from '../components/factory-builder/3d/shared/ScenarioRenderer';

/**
 * scenarioBridgeStore — transient handoff between Factory Builder and 3D World.
 *
 * Factory Builder calls `setPending(scenarioInput)` and navigates to /world.
 * The 3D World viewer reads `pending` on mount, consumes it (sets to null),
 * and renders. This avoids prop drilling and keeps the 3D World a stand-alone
 * page that also accepts inbound scenarios.
 */

interface ScenarioBridgeState {
  pending: ScenarioInput | null;
  setPending: (s: ScenarioInput | null) => void;
  consume: () => ScenarioInput | null;
}

export const useScenarioBridgeStore = create<ScenarioBridgeState>((set, get) => ({
  pending: null,
  setPending: (s) => set({ pending: s }),
  consume: () => {
    const cur = get().pending;
    if (cur) set({ pending: null });
    return cur;
  },
}));
