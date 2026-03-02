import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole, Toast, FactoryModel, DashboardWidgetConfig } from '../types';

interface AppState {
  // Initialization
  isInitialized: boolean;
  isLoading: boolean;

  // User
  currentUser: User | null;

  // Current model
  currentModel: FactoryModel | null;
  modelDirty: boolean;

  // UI state
  sidebarOpen: boolean;
  toasts: Toast[];

  // Dashboard widgets
  dashboardWidgets: DashboardWidgetConfig[];

  // Simulation state
  isSimulating: boolean;
  simulationProgress: number;
  lastSimulationResult: unknown | null;

  // Animation fullscreen (not persisted)
  isAnimationFullscreen: boolean;

  // Actions
  initialize: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setCurrentUser: (user: User | null) => void;
  setCurrentModel: (model: FactoryModel | null) => void;
  setModelDirty: (dirty: boolean) => void;
  toggleSidebar: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setSimulating: (simulating: boolean) => void;
  setSimulationProgress: (progress: number) => void;
  setSimulationResult: (result: unknown) => void;
  setAnimationFullscreen: (fullscreen: boolean) => void;

  // Dashboard widget actions
  setDashboardWidgets: (widgets: DashboardWidgetConfig[]) => void;
  addDashboardWidget: (widget: DashboardWidgetConfig) => void;
  removeDashboardWidget: (id: string) => void;
  reorderDashboardWidgets: (widgets: DashboardWidgetConfig[]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isInitialized: false,
      isLoading: false,
      currentUser: null,
      currentModel: null,
      modelDirty: false,
      sidebarOpen: true,
      toasts: [],
      dashboardWidgets: getDefaultDashboardWidgets(),
      isSimulating: false,
      simulationProgress: 0,
      lastSimulationResult: null,
      isAnimationFullscreen: false,

      // Actions
      initialize: async () => {
        set({ isLoading: true });

        try {
          // Get current user from system
          const username = await getCurrentUsername();
          const user: User = {
            id: '1',
            username,
            displayName: username,
            role: 'engineer' as UserRole,
            preferences: {
              theme: 'light',
              language: 'en',
              dashboardLayout: ['oee', 'throughput', 'bottleneck'],
              defaultDuration: 28800,
            },
          };

          set({
            isInitialized: true,
            currentUser: user,
            isLoading: false,
          });
        } catch (error) {
          console.error('Failed to initialize app:', error);
          set({ isLoading: false });
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setCurrentUser: (user) => set({ currentUser: user }),

      setCurrentModel: (model) => set({ currentModel: model, modelDirty: false }),

      setModelDirty: (dirty) => set({ modelDirty: dirty }),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast = { ...toast, id };

        set((state) => ({ toasts: [...state.toasts, newToast] }));

        // Auto-remove after duration
        const duration = toast.duration || 5000;
        setTimeout(() => {
          get().removeToast(id);
        }, duration);
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      setSimulating: (simulating) => {
        set({ isSimulating: simulating });
        if (!simulating) {
          set({ simulationProgress: 0 });
        }
      },

      setSimulationProgress: (progress) => set({ simulationProgress: progress }),

      setSimulationResult: (result) => set({ lastSimulationResult: result }),

      setAnimationFullscreen: (fullscreen) => set({ isAnimationFullscreen: fullscreen }),

      // Dashboard widget actions
      setDashboardWidgets: (widgets) => set({ dashboardWidgets: widgets }),

      addDashboardWidget: (widget) => {
        set((state) => ({
          dashboardWidgets: [...state.dashboardWidgets, widget],
        }));
      },

      removeDashboardWidget: (id) => {
        set((state) => ({
          dashboardWidgets: state.dashboardWidgets.filter((w) => w.id !== id),
        }));
      },

      reorderDashboardWidgets: (widgets) => set({ dashboardWidgets: widgets }),
    }),
    {
      name: 'factorysim-storage',
      version: 2,
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        dashboardWidgets: state.dashboardWidgets,
      }),
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v2: add quality-summary widget if missing
          const widgets = persisted?.dashboardWidgets || [];
          const hasQuality = widgets.some((w: any) => w.type === 'quality-summary');
          if (!hasQuality) {
            widgets.push({ id: 'w-quality-summary', type: 'quality-summary', label: 'Quality / Scrap', size: 'sm' });
          }
          return { ...persisted, dashboardWidgets: widgets };
        }
        return persisted;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>;
        const merged = { ...current, ...p };
        // Ensure any new default widgets are added to existing persisted lists
        if (p.dashboardWidgets) {
          const existingTypes = new Set(p.dashboardWidgets.map(w => w.type));
          const defaults = getDefaultDashboardWidgets();
          const missing = defaults.filter(w => !existingTypes.has(w.type));
          if (missing.length > 0) {
            merged.dashboardWidgets = [...p.dashboardWidgets, ...missing];
          }
        }
        return merged as AppState;
      },
    }
  )
);

// Default dashboard widget configuration
export function getDefaultDashboardWidgets(): DashboardWidgetConfig[] {
  return [
    { id: 'w-oee-summary', type: 'oee-summary', label: 'Overall OEE', size: 'sm' },
    { id: 'w-throughput-summary', type: 'throughput-summary', label: 'Throughput', size: 'sm' },
    { id: 'w-cycle-time-summary', type: 'cycle-time-summary', label: 'Avg Cycle Time', size: 'sm' },
    { id: 'w-wip-summary', type: 'wip-summary', label: 'WIP Level', size: 'sm' },
    { id: 'w-quality-summary', type: 'quality-summary', label: 'Quality / Scrap', size: 'sm' },
    { id: 'w-oee-chart', type: 'oee-chart', label: 'OEE Breakdown', size: 'lg' },
    { id: 'w-quality-chart', type: 'quality-chart', label: 'Quality / Scrap Chart', size: 'lg' },
    { id: 'w-throughput-chart', type: 'throughput-chart', label: 'Throughput by Hour', size: 'lg' },
    { id: 'w-bottleneck-heatmap', type: 'bottleneck-heatmap', label: 'Bottleneck Analysis', size: 'full' },
    { id: 'w-station-table', type: 'station-table', label: 'Station Performance', size: 'full' },
  ];
}

// Helper to get username
async function getCurrentUsername(): Promise<string> {
  // In Electron, we could get this from the system
  // For now, return a default
  if (typeof window !== 'undefined' && (window as unknown as { factorySim?: { app?: { getPlatform?: () => string } } }).factorySim?.app) {
    return 'User';
  }
  return 'User';
}
