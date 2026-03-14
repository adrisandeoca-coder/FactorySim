import { create } from 'zustand';

export interface StreamedEvent {
  time: number;
  type: string;
  entity_id: string;
  details: Record<string, unknown>;
}

export interface StationProductInfo {
  productType: string;
  productId: string;
  cycleTime: number;
  startTime: number; // sim time when processing started
}

export interface LiveSimulationState {
  // Live state from diagnostics
  stationStates: Record<string, string>;
  bufferLevels: Record<string, { level: number; capacity: number }>;
  activeProducts: number;
  completedProducts: number;
  currentTime: number;
  simDuration: number;

  // Per-station product tracking
  stationProducts: Record<string, StationProductInfo>;
  stationProcessedCounts: Record<string, number>;
  batchQueueCounts: Record<string, number>;

  // Source/sink counters
  sourceGeneratedCounts: Record<string, number>;
  sinkExitedCounts: Record<string, number>;

  // Product type tracking (array for Zustand reactivity)
  productTypes: string[];

  // Streamed events for animation
  recentEvents: StreamedEvent[];

  // P1: Station utilization tracking
  stationUtilizations: Record<string, number>;
  stationStateTimes: Record<string, Record<string, number>>;
  stationLastStateChange: Record<string, { state: string; time: number }>;

  // P2: Per-edge flow counts (key: "srcId->tgtId")
  edgeFlowCounts: Record<string, number>;

  // Captured animation frames (base64 PNGs keyed by progress %)
  capturedFrames: Array<{
    progress: number;
    base64: string;
    metadata?: {
      simTime: number;
      diagnostics: Record<string, unknown>;
      trigger?: string;  // "first_activity" or undefined (threshold)
    };
  }>;

  // 3D camera fly-to signal (increments on each click)
  flyToBottleneck3DSignal: number;
  triggerFlyToBottleneck3D: () => void;

  // Replay state
  isReplaying: boolean;
  replaySpeed: number;
  replayPaused: boolean;
  replayProgress: number; // 0-1
  replayTime: number;
  replayDuration: number;

  // Actions
  updateFromDiagnostics: (
    diagnostics: {
      activeProducts: number;
      completedProducts: number;
      stationStates: Record<string, string>;
      bufferLevels: Record<string, { level: number; capacity: number }>;
      stationUtilizations?: Record<string, number>;
      stationProcessedCounts?: Record<string, number>;
      batchQueueCounts?: Record<string, number>;
      sourceGenerated?: Record<string, number>;
      sinkExited?: Record<string, number>;
    },
    currentTime: number
  ) => void;
  addStreamedEvent: (event: StreamedEvent) => void;
  addReplayEvents: (events: StreamedEvent[]) => void;
  updateFromReplayFrame: (frame: {
    stationStates: Record<string, string>;
    bufferLevels: Record<string, { level: number; capacity: number }>;
    time: number;
  }) => void;
  incrementEdgeFlow: (key: string) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayPaused: (paused: boolean) => void;
  setReplayProgress: (progress: number) => void;
  startReplay: (duration: number) => void;
  stopReplay: () => void;
  addCapturedFrame: (progress: number, base64: string, metadata?: {
    simTime: number;
    diagnostics: Record<string, unknown>;
    trigger?: string;
  }) => void;
  replayEventBatch: (events: StreamedEvent[]) => void;
  setSimDuration: (duration: number) => void;
  reset: () => void;
}

const MAX_RECENT_EVENTS = 80;

const initialState = {
  stationStates: {} as Record<string, string>,
  bufferLevels: {} as Record<string, { level: number; capacity: number }>,
  activeProducts: 0,
  completedProducts: 0,
  currentTime: 0,
  simDuration: 0,
  stationProducts: {} as Record<string, StationProductInfo>,
  stationProcessedCounts: {} as Record<string, number>,
  batchQueueCounts: {} as Record<string, number>,
  sourceGeneratedCounts: {} as Record<string, number>,
  sinkExitedCounts: {} as Record<string, number>,
  productTypes: [] as string[],
  recentEvents: [] as StreamedEvent[],
  stationUtilizations: {} as Record<string, number>,
  stationStateTimes: {} as Record<string, Record<string, number>>,
  stationLastStateChange: {} as Record<string, { state: string; time: number }>,
  edgeFlowCounts: {} as Record<string, number>,
  flyToBottleneck3DSignal: 0,
  capturedFrames: [] as Array<{ progress: number; base64: string; metadata?: { simTime: number; diagnostics: Record<string, unknown>; trigger?: string } }>,
  isReplaying: false,
  replaySpeed: 1,
  replayPaused: false,
  replayProgress: 0,
  replayTime: 0,
  replayDuration: 0,
};

export const useLiveSimulationStore = create<LiveSimulationState>((set) => ({
  ...initialState,

  updateFromDiagnostics: (diagnostics, currentTime) => {
    set({
      stationStates: diagnostics.stationStates,
      bufferLevels: diagnostics.bufferLevels,
      activeProducts: diagnostics.activeProducts,
      completedProducts: diagnostics.completedProducts,
      currentTime,
      // Consume station utilization and processed counts from Python engine
      ...(diagnostics.stationUtilizations ? { stationUtilizations: diagnostics.stationUtilizations } : {}),
      ...(diagnostics.stationProcessedCounts ? { stationProcessedCounts: diagnostics.stationProcessedCounts } : {}),
      ...(diagnostics.batchQueueCounts ? { batchQueueCounts: diagnostics.batchQueueCounts } : {}),
      ...(diagnostics.sourceGenerated ? { sourceGeneratedCounts: diagnostics.sourceGenerated } : {}),
      ...(diagnostics.sinkExited ? { sinkExitedCounts: diagnostics.sinkExited } : {}),
    });
  },

  addStreamedEvent: (event) => {
    set((state) => {
      // Apply state changes inline for real-time updates
      let stationStates = state.stationStates;
      let bufferLevels = state.bufferLevels;
      let stationProducts = state.stationProducts;
      let stationProcessedCounts = state.stationProcessedCounts;
      let sourceGeneratedCounts = state.sourceGeneratedCounts;
      let sinkExitedCounts = state.sinkExitedCounts;
      let productTypes = state.productTypes;
      let stationStateTimes = state.stationStateTimes;
      let stationLastStateChange = state.stationLastStateChange;
      let stationUtilizations = state.stationUtilizations;

      const addProductType = (pt: string) => {
        if (!productTypes.includes(pt)) {
          productTypes = [...productTypes, pt];
        }
      };

      if (event.type === 'state_change') {
        const station = (event.details.station as string) || event.entity_id;
        const stateVal = event.details.state as string;
        if (station && stateVal) {
          // Track cumulative time in each state for utilization
          const prev = stationLastStateChange[station];
          if (prev) {
            const elapsed = event.time - prev.time;
            if (elapsed > 0) {
              const prevTimes = stationStateTimes[station] || {};
              stationStateTimes = {
                ...stationStateTimes,
                [station]: { ...prevTimes, [prev.state]: (prevTimes[prev.state] || 0) + elapsed },
              };
              // Compute utilization = processing_time / total_tracked_time
              const updatedTimes = stationStateTimes[station];
              const totalTime = Object.values(updatedTimes).reduce((a, b) => a + b, 0);
              if (totalTime > 0) {
                stationUtilizations = {
                  ...stationUtilizations,
                  [station]: ((updatedTimes['processing'] || 0) + (updatedTimes['setup'] || 0) + (updatedTimes['failed'] || 0)) / totalTime,
                };
              }
            }
          }
          stationLastStateChange = {
            ...stationLastStateChange,
            [station]: { state: stateVal, time: event.time },
          };

          stationStates = { ...stationStates, [station]: stateVal };
          // Clear product from station when not processing
          if (stateVal !== 'processing' && stationProducts[station]) {
            stationProducts = { ...stationProducts };
            delete stationProducts[station];
          }
        }
      } else if (event.type === 'processing_start') {
        const station = (event.details.station as string) || event.entity_id;
        const productType = (event.details.product_type as string) || 'product';
        const productId = (event.details.product_id as string) || '';
        const cycleTime = (event.details.cycle_time as number) || 0;
        if (station) {
          stationProducts = {
            ...stationProducts,
            [station]: { productType, productId, cycleTime, startTime: event.time },
          };
          addProductType(productType);
        }
      } else if (event.type === 'processing_complete') {
        const station = (event.details.station as string) || event.entity_id;
        if (station) {
          stationProcessedCounts = {
            ...stationProcessedCounts,
            [station]: (stationProcessedCounts[station] || 0) + 1,
          };
          // Clear current product
          if (stationProducts[station]) {
            stationProducts = { ...stationProducts };
            delete stationProducts[station];
          }
        }
      } else if (event.type === 'buffer_put' || event.type === 'buffer_get') {
        const bufName = event.details.buffer as string;
        const level = event.details.level as number;
        if (bufName && level !== undefined) {
          const prev = bufferLevels[bufName];
          bufferLevels = {
            ...bufferLevels,
            [bufName]: { level, capacity: prev?.capacity ?? 999 },
          };
        }
      } else if (event.type === 'source_generate') {
        const source = (event.details.source as string) || event.entity_id;
        const productType = event.details.product_type as string;
        if (source) {
          sourceGeneratedCounts = {
            ...sourceGeneratedCounts,
            [source]: (sourceGeneratedCounts[source] || 0) + 1,
          };
        }
        if (productType) addProductType(productType);
      } else if (event.type === 'sink_exit') {
        const sink = (event.details.sink as string) || event.entity_id;
        if (sink) {
          sinkExitedCounts = {
            ...sinkExitedCounts,
            [sink]: (sinkExitedCounts[sink] || 0) + 1,
          };
        }
      }

      const newEvents = [...state.recentEvents, event];
      return {
        recentEvents: newEvents.length > MAX_RECENT_EVENTS
          ? newEvents.slice(-MAX_RECENT_EVENTS)
          : newEvents,
        stationStates,
        bufferLevels,
        stationProducts,
        stationProcessedCounts,
        sourceGeneratedCounts,
        sinkExitedCounts,
        productTypes,
        stationStateTimes,
        stationLastStateChange,
        stationUtilizations,
        currentTime: event.time,
      };
    });
  },

  addReplayEvents: (events) => {
    if (events.length === 0) return;
    set((state) => {
      let stationProducts = state.stationProducts;
      let stationProcessedCounts = state.stationProcessedCounts;
      let sourceGeneratedCounts = state.sourceGeneratedCounts;
      let sinkExitedCounts = state.sinkExitedCounts;
      let productTypes = state.productTypes;
      let stationStateTimes = state.stationStateTimes;
      let stationLastStateChange = state.stationLastStateChange;
      let stationUtilizations = state.stationUtilizations;

      const addProductType = (pt: string) => {
        if (!productTypes.includes(pt)) {
          productTypes = [...productTypes, pt];
        }
      };

      for (const event of events) {
        if (event.type === 'state_change') {
          const station = (event.details.station as string) || event.entity_id;
          const stateVal = event.details.state as string;
          if (station && stateVal) {
            const prev = stationLastStateChange[station];
            if (prev) {
              const elapsed = event.time - prev.time;
              if (elapsed > 0) {
                const prevTimes = stationStateTimes[station] || {};
                stationStateTimes = {
                  ...stationStateTimes,
                  [station]: { ...prevTimes, [prev.state]: (prevTimes[prev.state] || 0) + elapsed },
                };
                const updatedTimes = stationStateTimes[station];
                const totalTime = Object.values(updatedTimes).reduce((a, b) => a + b, 0);
                if (totalTime > 0) {
                  stationUtilizations = {
                    ...stationUtilizations,
                    [station]: ((updatedTimes['processing'] || 0) + (updatedTimes['setup'] || 0) + (updatedTimes['failed'] || 0)) / totalTime,
                  };
                }
              }
            }
            stationLastStateChange = {
              ...stationLastStateChange,
              [station]: { state: stateVal, time: event.time },
            };
          }
        } else if (event.type === 'processing_start') {
          const station = (event.details.station as string) || event.entity_id;
          const productType = (event.details.product_type as string) || 'product';
          const productId = (event.details.product_id as string) || '';
          const cycleTime = (event.details.cycle_time as number) || 0;
          if (station) {
            stationProducts = { ...stationProducts, [station]: { productType, productId, cycleTime, startTime: event.time } };
            addProductType(productType);
          }
        } else if (event.type === 'processing_complete') {
          const station = (event.details.station as string) || event.entity_id;
          if (station) {
            stationProcessedCounts = { ...stationProcessedCounts, [station]: (stationProcessedCounts[station] || 0) + 1 };
            if (stationProducts[station]) {
              stationProducts = { ...stationProducts };
              delete stationProducts[station];
            }
          }
        } else if (event.type === 'source_generate') {
          const source = (event.details.source as string) || event.entity_id;
          if (source) sourceGeneratedCounts = { ...sourceGeneratedCounts, [source]: (sourceGeneratedCounts[source] || 0) + 1 };
          const pt = event.details.product_type as string;
          if (pt) addProductType(pt);
        } else if (event.type === 'sink_exit') {
          const sink = (event.details.sink as string) || event.entity_id;
          if (sink) sinkExitedCounts = { ...sinkExitedCounts, [sink]: (sinkExitedCounts[sink] || 0) + 1 };
        }
      }

      const newEvents = [...state.recentEvents, ...events];
      return {
        recentEvents: newEvents.length > MAX_RECENT_EVENTS ? newEvents.slice(-MAX_RECENT_EVENTS) : newEvents,
        stationProducts,
        stationProcessedCounts,
        sourceGeneratedCounts,
        sinkExitedCounts,
        productTypes,
        stationStateTimes,
        stationLastStateChange,
        stationUtilizations,
      };
    });
  },

  updateFromReplayFrame: (frame) => {
    set((state) => ({
      stationStates: frame.stationStates,
      bufferLevels: frame.bufferLevels,
      currentTime: frame.time,
      replayTime: frame.time,
      replayProgress: state.replayDuration > 0 ? frame.time / state.replayDuration : 0,
    }));
  },

  incrementEdgeFlow: (key) => {
    set((state) => ({
      edgeFlowCounts: { ...state.edgeFlowCounts, [key]: (state.edgeFlowCounts[key] || 0) + 1 },
    }));
  },

  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  setReplayPaused: (paused) => set({ replayPaused: paused }),
  setReplayProgress: (progress) => set({ replayProgress: progress }),

  startReplay: (duration) =>
    set({
      isReplaying: true,
      replayPaused: false,
      replayProgress: 0,
      replayTime: 0,
      replayDuration: duration,
      replaySpeed: 1,
    }),

  stopReplay: () =>
    set({
      isReplaying: false,
      replayPaused: false,
      replayProgress: 0,
      replayTime: 0,
      stationStates: {},
      bufferLevels: {},
    }),

  addCapturedFrame: (progress, base64, metadata) =>
    set((state) => ({
      capturedFrames: [...state.capturedFrames, { progress, base64, metadata }],
    })),

  // Batch replay: processes an array of events in one set() call.
  // Used for seeking — replays thousands of events efficiently.
  replayEventBatch: (events) => {
    if (events.length === 0) return;
    set((state) => {
      let stationStates = state.stationStates;
      let bufferLevels = state.bufferLevels;
      let stationProducts = state.stationProducts;
      let stationProcessedCounts = state.stationProcessedCounts;
      let sourceGeneratedCounts = state.sourceGeneratedCounts;
      let sinkExitedCounts = state.sinkExitedCounts;
      let productTypes = state.productTypes;
      let stationStateTimes = state.stationStateTimes;
      let stationLastStateChange = state.stationLastStateChange;
      let stationUtilizations = state.stationUtilizations;
      let activeProducts = state.activeProducts;
      let completedProducts = state.completedProducts;
      let lastTime = state.currentTime;

      const addProductType = (pt: string) => {
        if (!productTypes.includes(pt)) {
          productTypes = [...productTypes, pt];
        }
      };

      for (const event of events) {
        lastTime = event.time;

        if (event.type === 'state_change') {
          const station = (event.details.station as string) || event.entity_id;
          const stateVal = event.details.state as string;
          if (station && stateVal) {
            // Track utilization
            const prev = stationLastStateChange[station];
            if (prev) {
              const elapsed = event.time - prev.time;
              if (elapsed > 0) {
                const prevTimes = stationStateTimes[station] || {};
                stationStateTimes = {
                  ...stationStateTimes,
                  [station]: { ...prevTimes, [prev.state]: (prevTimes[prev.state] || 0) + elapsed },
                };
                const updatedTimes = stationStateTimes[station];
                const totalTime = Object.values(updatedTimes).reduce((a, b) => a + b, 0);
                if (totalTime > 0) {
                  stationUtilizations = {
                    ...stationUtilizations,
                    [station]: ((updatedTimes['processing'] || 0) + (updatedTimes['setup'] || 0) + (updatedTimes['failed'] || 0)) / totalTime,
                  };
                }
              }
            }
            stationLastStateChange = {
              ...stationLastStateChange,
              [station]: { state: stateVal, time: event.time },
            };
            stationStates = { ...stationStates, [station]: stateVal };
            if (stateVal !== 'processing' && stationProducts[station]) {
              stationProducts = { ...stationProducts };
              delete stationProducts[station];
            }
          }
        } else if (event.type === 'processing_start') {
          const station = (event.details.station as string) || event.entity_id;
          const productType = (event.details.product_type as string) || 'product';
          const productId = (event.details.product_id as string) || '';
          const cycleTime = (event.details.cycle_time as number) || 0;
          if (station) {
            stationProducts = {
              ...stationProducts,
              [station]: { productType, productId, cycleTime, startTime: event.time },
            };
            addProductType(productType);
          }
        } else if (event.type === 'processing_complete') {
          const station = (event.details.station as string) || event.entity_id;
          if (station) {
            stationProcessedCounts = {
              ...stationProcessedCounts,
              [station]: (stationProcessedCounts[station] || 0) + 1,
            };
            if (stationProducts[station]) {
              stationProducts = { ...stationProducts };
              delete stationProducts[station];
            }
          }
          completedProducts++;
        } else if (event.type === 'buffer_put' || event.type === 'buffer_get') {
          const bufName = event.details.buffer as string;
          const level = event.details.level as number;
          if (bufName && level !== undefined) {
            const prev = bufferLevels[bufName];
            bufferLevels = {
              ...bufferLevels,
              [bufName]: { level, capacity: prev?.capacity ?? 999 },
            };
          }
        } else if (event.type === 'source_generate') {
          const source = (event.details.source as string) || event.entity_id;
          const productType = event.details.product_type as string;
          if (source) {
            sourceGeneratedCounts = {
              ...sourceGeneratedCounts,
              [source]: (sourceGeneratedCounts[source] || 0) + 1,
            };
          }
          if (productType) addProductType(productType);
          activeProducts++;
        } else if (event.type === 'sink_exit') {
          const sink = (event.details.sink as string) || event.entity_id;
          if (sink) {
            sinkExitedCounts = {
              ...sinkExitedCounts,
              [sink]: (sinkExitedCounts[sink] || 0) + 1,
            };
          }
          activeProducts = Math.max(0, activeProducts - 1);
        }
      }

      // Only keep last N recent events for animation overlay
      const newEvents = [...state.recentEvents, ...events.slice(-MAX_RECENT_EVENTS)];

      return {
        stationStates,
        bufferLevels,
        stationProducts,
        stationProcessedCounts,
        sourceGeneratedCounts,
        sinkExitedCounts,
        productTypes,
        stationStateTimes,
        stationLastStateChange,
        stationUtilizations,
        activeProducts,
        completedProducts,
        currentTime: lastTime,
        replayTime: lastTime,
        replayProgress: state.replayDuration > 0 ? lastTime / state.replayDuration : 0,
        recentEvents: newEvents.length > MAX_RECENT_EVENTS
          ? newEvents.slice(-MAX_RECENT_EVENTS)
          : newEvents,
      };
    });
  },

  setSimDuration: (duration) => set({ simDuration: duration }),

  triggerFlyToBottleneck3D: () => set((s) => ({ flyToBottleneck3DSignal: s.flyToBottleneck3DSignal + 1 })),

  reset: () => set(initialState),
}));
