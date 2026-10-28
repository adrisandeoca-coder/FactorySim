import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Strip distribution type: "CNC Mill (Weibull)" → "CNC Mill"
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}
import { Card, CardHeader, StatCard } from '../common/Card';
import { Button } from '../common/Button';
import { OEEChart } from './OEEChart';
import { ThroughputChart } from './ThroughputChart';
import { BottleneckHeatmap } from './BottleneckHeatmap';
import { UtilizationChart } from './UtilizationChart';
import { QualityScrapChart } from './QualityScrapChart';
import { WipTrendChart } from './WipTrendChart';
import { WidgetConfigurator } from './WidgetConfigurator';
import { GanttScheduleView } from './GanttScheduleView';
import { SankeyChart } from './SankeyChart';
import { CycleTimePareto } from './CycleTimePareto';
import { ThroughputWaterfall } from './ThroughputWaterfall';
import { BufferSparklines } from './BufferSparklines';
import { CostSummary } from './CostSummary';
import { EnergyChart } from './EnergyChart';
import { MaintenanceChart } from './MaintenanceChart';
import { ValueStreamMap } from './ValueStreamMap';
import { exportTimelapse } from '../../services/timelapseExporter';
import { downloadPDFReport } from '../../services/pdfReportExporter';
import { downloadPPTXReport } from '../../services/pptxReportExporter';
import { useSimulationStore, formatPercentage, formatDuration } from '../../stores/simulationStore';
import { ResultsSummary } from './ResultsSummary';
import { WarehouseResults } from './WarehouseResults';
import { RibbonContent, RibbonGroup, RibbonButton, RibbonSmallButton, RibbonStack } from '../layout/Ribbon';
import { Play, Square, RotateCcw, History, Camera, FileDown, SlidersHorizontal } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { LiveSimulationView } from './LiveSimulationView';
import { SimulationBriefView } from './SimulationBriefView';
import { ReplayController } from './ReplayController';
import { captureScreenshot, captureToBase64, whenIdle, downloadEventLog, downloadEventLogCSV, downloadKPICSV } from '../../services/screenshotService';
import { registerElement, getElement, getCachedImage, setCachedImage, clearCachedImage } from '../../services/elementRegistry';
import { saveRunArtifacts } from '../../services/artifactService';
import { saveModelVersion } from '../common/ModelVersionHistory';
import { downloadReport } from '../../services/reportExporter';
import { captureAllTabScreenshots } from '../../services/tabScreenshotCapture';
import { buildStateTimeline, getTimelineDuration } from '../../services/replayTimelineBuilder';
import { getCachedResult, cacheResult } from '../../services/resultCache';
import { createLogger } from '../../services/logger';

const log = createLogger('Dashboard');
import { ReplayPlayer } from './ReplayPlayer';
import type { DashboardWidgetConfig, KPIData, SimulationResult } from '../../types';

const WIDGET_LABELS: Record<string, string> = {
  'oee-summary': 'OEE',
  'throughput-summary': 'Throughput',
  'cycle-time-summary': 'Cycle Time',
  'wip-summary': 'WIP',
  'oee-chart': 'OEE Chart',
  'throughput-chart': 'Throughput Chart',
  'bottleneck-heatmap': 'Bottleneck Analysis',
  'station-table': 'Station Table',
  'quality-summary': 'Quality',
  'utilization-chart': 'Utilization',
  'wip-trend-chart': 'WIP Trend',
  'quality-chart': 'Quality Chart',
  'gantt-schedule': 'Schedule Gantt',
  'experiment-results': 'Experiments',
};

function WarningBanners({ warnings }: { warnings: Array<{ severity: string; message: string; type?: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 3;
  const shown = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const hidden = warnings.length - MAX_VISIBLE;

  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      {shown.map((w, i) => (
        <div key={i} className={`alert-banner ${
          w.severity === 'error' ? 'alert-critical'
            : w.severity === 'warning' ? 'alert-warning'
            : 'alert-info'
        }`}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="flex-shrink-0" style={{ marginTop: 2, color: w.severity === 'error' ? 'var(--red)' : w.severity === 'warning' ? 'var(--amber)' : 'var(--blue)' }}>
            <path d="M7 2L12.5 12H1.5L7 2z"/>
            <path d="M7 6v3"/>
            <circle cx="7" cy="10.5" r=".75" fill="currentColor" stroke="none"/>
          </svg>
          <div style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: w.message }} />
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm font-medium px-4 py-1"
          style={{ color: 'var(--t3)' }}
        >
          + {hidden} more warning{hidden !== 1 ? 's' : ''}...
        </button>
      )}
      {expanded && warnings.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm font-medium px-4 py-1"
          style={{ color: 'var(--t3)' }}
        >
          Show fewer warnings
        </button>
      )}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { model } = useModelStore();
  const { setSelectedNode } = useModelStore();
  const { lastResult, isRunning, defaultOptions, setResult, setError, clearResults, startSimulation, stopSimulation } = useSimulationStore();
  const { addToast, setSimulating, setSimulationProgress, simulationProgress, dashboardWidgets } = useAppStore();

  const navigateToStation = useCallback((stationId: string) => {
    setSelectedNode(stationId);
    navigate('/builder');
  }, [setSelectedNode, navigate]);
  const [duration, setDuration] = useState(defaultOptions.duration);
  const [startDayOfWeek, setStartDayOfWeek] = useState(0);
  const [startHour, setStartHour] = useState(0);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const simpleMode = useAppStore((st) => st.simpleMode);
  const [layoutMode, setLayoutMode] = useState<'3d-focus' | 'balanced' | 'dashboard-focus'>('balanced');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [showLogMenu, setShowLogMenu] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all');
  const modelScreenshotRef = useRef<{ image?: string; modelId?: string } | undefined>(undefined);
  const isReplaying = useLiveSimulationStore((s) => s.isReplaying);
  const replayProgress = useLiveSimulationStore((s) => s.replayProgress);
  const replayDuration = useLiveSimulationStore((s) => s.replayDuration);

  // Replay player state
  const [replayRunPath, setReplayRunPath] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Array<{ name: string; path: string }>>([]);
  const [showRunHistory, setShowRunHistory] = useState(false);


  // Load run history on demand
  useEffect(() => {
    if (showRunHistory && runHistory.length === 0) {
      window.factorySim?.artifacts?.listRuns().then(runs => setRunHistory(runs || [])).catch(() => {});
    }
  }, [showRunHistory, runHistory.length]);

  // Clear stale results when model changes to prevent saving wrong KPIs
  const prevModelIdRef = useRef(model.id);
  useEffect(() => {
    if (model.id !== prevModelIdRef.current) {
      prevModelIdRef.current = model.id;
      clearResults();
    }
  }, [model.id, clearResults]);

  // Register dashboard element in registry for cross-tab screenshot access
  useEffect(() => {
    registerElement('dashboard', dashboardRef.current);
    return () => registerElement('dashboard', null);
  }, []);

  // Capture dashboard screenshot and save artifacts after results render.
  // Snapshot model/result/options at effect time so model changes from the
  // next sequential run can't corrupt the saved data.  The timer is NOT
  // cleaned up on re-render — each result gets its own independent save.
  const artifactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const earlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!lastResult || !dashboardRef.current) return;

    // Deduplicate: skip if this result was already saved (e.g. Dashboard
    // unmounted and remounted with the same lastResult still in the store).
    const { lastSavedRunId, markRunSaved } = useSimulationStore.getState();
    if (lastResult.runId && lastResult.runId === lastSavedRunId) return;

    // Mark as pending-save immediately so concurrent remounts don't double-save
    if (lastResult.runId) {
      markRunSaved(lastResult.runId);
    }

    // Snapshot everything NOW (before next model can load)
    const modelSnap = model;
    const resultSnap = lastResult;
    const optsSnap = {
      duration,
      warmupPeriod: defaultOptions.warmupPeriod || 0,
      seed: defaultOptions.seed,
      startDayOfWeek,
      startHour,
    };
    // Snapshot animation frames and model screenshot at result time to prevent cross-contamination
    const framesSnap = [...useLiveSimulationStore.getState().capturedFrames];
    const diagSnapshotsSnap: Array<Record<string, unknown>> = (resultSnap as any).diagSnapshots || [];
    // Verify model screenshot belongs to this model — skip if model changed (missing > wrong)
    const screenshotData = modelScreenshotRef.current;
    const modelScreenshotSnap = (screenshotData && screenshotData.modelId === modelSnap.id)
      ? screenshotData.image
      : undefined;

    // Clear any pending timer from a previous run before starting a new one
    if (artifactTimerRef.current) {
      clearTimeout(artifactTimerRef.current);
      artifactTimerRef.current = null;
    }
    if (earlyTimerRef.current) {
      clearTimeout(earlyTimerRef.current);
      earlyTimerRef.current = null;
    }

    // Artifact screenshots are background work: wait for an idle moment and
    // skip the expensive page captures while a replay is playing (they froze
    // the replay). The early 500 ms capture was dropped — it doubled the cost.
    const earlyCaptureBase64: string | undefined = undefined;
    const replaying = () => useLiveSimulationStore.getState().isReplaying;

    artifactTimerRef.current = setTimeout(async () => {
      let dashScreenshot: string | undefined;
      await whenIdle();
      if (dashboardRef.current && !replaying()) {
        // Try live capture up to 2 times with backoff
        const retryDelays = [0, 1500];
        for (const delay of retryDelays) {
          if (delay > 0) await new Promise(r => setTimeout(r, delay));
          if (!dashboardRef.current) break;
          try {
            const base64 = await captureToBase64(dashboardRef.current);
            if (base64) {
              setCachedImage('dashboard', base64);
              dashScreenshot = base64;
              break;
            }
          } catch (e) { log.warn('Dashboard screenshot capture failed, retrying...', e); }
        }
      }
      // Fall back to early capture if live captures all failed
      if (!dashScreenshot && earlyCaptureBase64) {
        dashScreenshot = earlyCaptureBase64;
      }

      // Pre-capture tab screenshots offscreen (scenarios, orders, code, data, settings)
      if (!replaying()) {
        await whenIdle();
        try { await captureAllTabScreenshots(); } catch { /* non-critical */ }
      }

      try {
        const savedPath = await saveRunArtifacts({
          model: modelSnap,
          result: resultSnap,
          simOptions: optsSnap,
          dashboardScreenshot: dashScreenshot,
          modelScreenshot: modelScreenshotSnap,
          capturedFrames: framesSnap,
          diagSnapshots: diagSnapshotsSnap,
        });
        if (savedPath) {
          addToast({ type: 'info', message: 'Run artifacts saved' });
        }
      } catch { /* non-critical */ }
    }, 2000);

    // No per-render cleanup — timers are cleared at the TOP of the next
    // invocation and on unmount below.  Each result gets its own save.
  }, [lastResult]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (artifactTimerRef.current) clearTimeout(artifactTimerRef.current);
      if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
    };
  }, []);

  // Production charts (OEE, throughput, bottlenecks…) only mean something with stations
  const hasStations = model.stations.length > 0;
  // A model can be a pure warehouse / distribution centre with no stations
  const hasSimulatableElements = model.stations.length > 0 ||
    model.extraNodes.some((e) => e.type === 'warehouse' || e.type === 'coldstorage');

  const handleRunSimulation = async () => {
    if (!hasSimulatableElements) {
      addToast({ type: 'warning', message: 'Add stations or a warehouse to your model before running simulation' });
      return;
    }

    abortRef.current = false;

    // Save model version before simulation run (for version history)
    try {
      saveModelVersion(model.id || 'current', model.name || 'Untitled', JSON.stringify(model), 'pre-simulation');
    } catch { /* non-critical */ }

    // Clear stale dashboard screenshot so previous-run image can't leak into artifacts.
    // Note: factory-canvas is NOT cleared — the model hasn't changed, and clearing it
    // causes early runs to lose their model screenshot before the cache is repopulated.
    clearCachedImage('dashboard');
    // Clear tab caches so they're re-rendered with the current model
    clearCachedImage('code-editor-tab');
    clearCachedImage('orders-tab');
    clearCachedImage('scenarios-tab');
    clearCachedImage('data-sync-tab');
    clearCachedImage('settings-tab');

    // Pre-capture factory model screenshot NOW, before FactoryBuilder may unmount.
    // AWAIT the capture to prevent race conditions in sequential runs — if we
    // don't wait, a second run's async capture can overwrite the ref with stale data.
    // Tag with model ID so the artifact save effect can verify it matches.
    const captureModelId = model.id;
    const factoryEl = getElement('factory-canvas');
    if (factoryEl) {
      try {
        const base64 = await captureToBase64(factoryEl);
        if (base64) {
          modelScreenshotRef.current = { image: base64, modelId: captureModelId };
        } else {
          modelScreenshotRef.current = { image: getCachedImage('factory-canvas') || undefined, modelId: captureModelId };
        }
      } catch {
        modelScreenshotRef.current = { image: getCachedImage('factory-canvas') || undefined, modelId: captureModelId };
      }
    } else {
      modelScreenshotRef.current = { image: getCachedImage('factory-canvas') || undefined, modelId: captureModelId };
    }
    setSimulating(true);
    setSimulationProgress(0);
    setElapsedSeconds(0);
    useLiveSimulationStore.getState().reset();
    useLiveSimulationStore.getState().setSimDuration(duration);
    startSimulation();
    addToast({ type: 'info', message: 'Starting simulation...' });

    // Check result cache before running
    const simOptions: Record<string, unknown> = {
      duration,
      warmupPeriod: defaultOptions.warmupPeriod || 0,
      seed: defaultOptions.seed,
      replications: defaultOptions.replications || 1,
    };
    const cached = getCachedResult(model, simOptions as any);
    if (cached) {
      setResult(cached);
      addToast({ type: 'info', message: 'Using cached result' });
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setSimulating(false);
      stopSimulation();
      return;
    }

    // Start elapsed time counter
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    let cleanupProgress: (() => void) | undefined;
    let cleanupEvents: (() => void) | undefined;
    try {
      if (!window.factorySim?.simulation?.runSimulation) {
        throw new Error(
          'Simulation engine not available. ' +
          (!window.factorySim ? 'Electron bridge not loaded — are you running outside the desktop app?' :
           !window.factorySim.simulation ? 'Python simulation bridge not initialized — the engine may have failed to start.' :
           'runSimulation method not found on bridge.')
        );
      }

      // Set up progress listener for live UI updates
      cleanupProgress = window.factorySim.app?.onSimulationProgress?.((progress) => {
        setSimulationProgress(progress.progress);
        if (progress.diagnostics) {
          useLiveSimulationStore.getState().updateFromDiagnostics(progress.diagnostics, progress.currentTime);
        }
      });

      // Set up event stream listener for live animation
      cleanupEvents = window.factorySim.app?.onSimulationEvent?.((event) => {
        useLiveSimulationStore.getState().addStreamedEvent(event as any);
      });

      const result = await window.factorySim.simulation.runSimulation(model, {
        duration,
        warmupPeriod: defaultOptions.warmupPeriod || 0,
        seed: defaultOptions.seed,
        replications: defaultOptions.replications || 1,
        startDayOfWeek: startDayOfWeek,
        startHour: startHour,
        streamEvents: true,
      }) as SimulationResult;

      // Extract diagnostic snapshots from result (collected by Python engine
      // at 10/20/40/60/80/100% progress thresholds + adaptive first_activity —
      // included in the result to bypass unreliable IPC progress events).
      type DiagSnapshot = {
        threshold: number;
        currentTime: number;
        trigger?: string;
        diagnostics: {
          activeProducts: number;
          completedProducts: number;
          stationStates: Record<string, string>;
          bufferLevels: Record<string, { level: number; capacity: number }>;
          simTimeSec?: number;
          simTimeFormatted?: string;
          wipByStation?: Record<string, number>;
          totalGenerated?: number;
          sourceGenerated?: Record<string, number>;
          sinkExited?: Record<string, number>;
        };
      };
      const diagSnapshots: DiagSnapshot[] = (result as any).diagSnapshots || [];
      log.info(`Result contains ${diagSnapshots.length} snapshots for frame capture`);

      // Replay each snapshot through the store, render, then capture frame
      const waitForRender = () => new Promise<void>(resolve =>
        requestAnimationFrame(() => setTimeout(resolve, 80))
      );

      for (const snap of diagSnapshots) {
        useLiveSimulationStore.getState().updateFromDiagnostics(snap.diagnostics, snap.currentTime);
        setSimulationProgress(snap.threshold);
        await waitForRender();
        const container = getElement('live-simulation');
        if (container) {
          try {
            const base64 = await captureToBase64(container, null);
            if (base64 && base64.length > 1000) {
              useLiveSimulationStore.getState().addCapturedFrame(snap.threshold * 100, base64, {
                simTime: snap.currentTime,
                diagnostics: snap.diagnostics as Record<string, unknown>,
                trigger: snap.trigger,
              });
            }
          } catch { /* non-critical */ }
        }
      }

      setResult(result);
      cacheResult(model, simOptions as any, result);
      addToast({ type: 'success', message: 'Simulation completed!' });

      // Auto-start replay after simulation completes (expert mode only — in
      // Simple mode results come first; the Replay button stays available)
      if (!useAppStore.getState().simpleMode && result.events && result.events.length > 0) {
        // Build buffer capacity map from model
        const bufCaps: Record<string, number> = {};
        for (const b of model.buffers || []) {
          bufCaps[b.name || b.id] = b.capacity ?? 999;
        }
        const timeline = buildStateTimeline(result.events, bufCaps);
        const replayDur = getTimelineDuration(timeline);
        if (replayDur > 0) {
          // Small delay to let result render, then start replay
          setTimeout(() => {
            useLiveSimulationStore.getState().startReplay(replayDur);
          }, 500);
        }
      }

      // Artifact save is now handled by the lastResult useEffect above,
      // which captures the screenshot and saves atomically at 2000ms.
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg !== 'Simulation stopped') {
        setError(msg);
        addToast({ type: 'error', message: `Simulation error: ${msg}` });
      }
    } finally {
      cleanupProgress?.();
      cleanupEvents?.();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setSimulating(false);
      stopSimulation();
    }
  };

  const handleStopSimulation = () => {
    abortRef.current = true;
    // Also try to stop via Python bridge
    const runId = useSimulationStore.getState().currentRunId;
    if (runId && window.factorySim?.simulation?.stopSimulation) {
      window.factorySim.simulation.stopSimulation(runId).catch(() => {});
    }
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setSimulating(false);
    stopSimulation();
    addToast({ type: 'info', message: 'Simulation stopped' });
  };

  const handleScreenshot = async () => {
    if (!dashboardRef.current) return;
    try {
      await captureScreenshot(dashboardRef.current, `dashboard-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`);
      addToast({ type: 'success', message: 'Screenshot saved' });
    } catch {
      addToast({ type: 'error', message: 'Failed to capture screenshot' });
    }
  };

  const handleDownloadLog = (format: 'json' | 'csv') => {
    setShowLogMenu(false);
    if (!lastResult?.events || lastResult.events.length === 0) {
      addToast({ type: 'warning', message: 'No simulation events to download' });
      return;
    }
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    if (format === 'json') {
      downloadEventLog(lastResult.events as unknown as Array<Record<string, unknown>>, `simulation-log-${ts}.json`);
    } else {
      downloadEventLogCSV(lastResult.events as unknown as Array<Record<string, unknown>>, `simulation-log-${ts}.csv`);
    }
    addToast({ type: 'success', message: `Event log downloaded (${format.toUpperCase()})` });
  };

  const kpis = lastResult?.kpis || null;

  // Group widgets: stat cards (sm/md) go into grid rows, larger ones render individually
  const statWidgets = dashboardWidgets.filter((w) => w.size === 'sm' || w.size === 'md');
  const otherWidgets = dashboardWidgets.filter((w) => w.size !== 'sm' && w.size !== 'md');

  // Pair lg widgets into rows of 2
  const lgRows: DashboardWidgetConfig[][] = [];
  let currentRow: DashboardWidgetConfig[] = [];
  for (const w of otherWidgets) {
    if (w.size === 'lg') {
      currentRow.push(w);
      if (currentRow.length === 2) {
        lgRows.push(currentRow);
        currentRow = [];
      }
    } else {
      if (currentRow.length > 0) {
        lgRows.push(currentRow);
        currentRow = [];
      }
      lgRows.push([w]);
    }
  }
  if (currentRow.length > 0) lgRows.push(currentRow);

  // If no results yet, show placeholder KPIs
  const displayKpis: KPIData = kpis || {
    oee: { overall: 0, availability: 0, performance: 0, quality: 0, byStation: {} },
    throughput: { total: 0, ratePerHour: 0, byProduct: {}, byHour: [] },
    utilization: { byStation: {}, byResource: {} },
    wip: { total: 0, byBuffer: {}, timeSeries: [] },
    cycleTime: { mean: 0, std: 0, min: 0, max: 0, byProduct: {} },
  };

  const isSimRunning = isRunning || useAppStore.getState().isSimulating;
  const isAnimationFullscreen = useAppStore((s) => s.isAnimationFullscreen);

  // P0 — In fullscreen mode, render only the simulation brief view
  if (isAnimationFullscreen && isSimRunning) {
    return (
      <div ref={dashboardRef}>
        <SimulationBriefView
          progress={simulationProgress}
          elapsedSeconds={elapsedSeconds}
          simDuration={duration}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={dashboardRef}>
      {/* Commands live in the app ribbon (engineering-desktop style) */}
      <RibbonContent>
        <RibbonGroup label="Simulation">
          {isSimRunning ? (
            <RibbonButton icon={<Square size={26} color="#DC2626" fill="#DC2626" />} label="Stop" onClick={handleStopSimulation} title="Stop the running simulation" />
          ) : (
            <RibbonButton icon={<Play size={26} color="#059669" fill="#059669" />} label="Run simulation" onClick={handleRunSimulation} title="Run the simulation with the settings shown" />
          )}
        </RibbonGroup>

        <RibbonGroup label="Settings">
          <RibbonStack>
            <label className="ribbon-field" title="Simulated duration">
              <span>Run length</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={isSimRunning}>
                <option value={3600}>1 hour</option>
                <option value={14400}>4 hours</option>
                <option value={28800}>8 hours (1 shift)</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>1 week</option>
              </select>
            </label>
            <label className="ribbon-field" title="Simulated start day — affects shift calendars">
              <span>Start day</span>
              <select value={startDayOfWeek} onChange={(e) => setStartDayOfWeek(Number(e.target.value))} disabled={isSimRunning}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </label>
            <label className="ribbon-field" title="Simulated start hour — affects shift calendars">
              <span>Start time</span>
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} disabled={isSimRunning}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
          </RibbonStack>
        </RibbonGroup>

        <RibbonGroup label="Results">
          <RibbonStack>
            {isReplaying ? (
              <RibbonSmallButton icon={<Square size={12} />} label="Stop replay" onClick={() => useLiveSimulationStore.getState().stopReplay()} title="Stop the replay and show the results" />
            ) : lastResult && !isSimRunning ? <ReplayController /> : (
              <RibbonSmallButton icon={<RotateCcw size={14} />} label="Replay" disabled title={isSimRunning ? 'Available when the run finishes' : 'Run a simulation first'} />
            )}
            <div className="relative">
              <RibbonSmallButton
                icon={<History size={14} />}
                label="Run history"
                dropdown
                active={showRunHistory}
                onClick={() => { setShowRunHistory(!showRunHistory); setRunHistory([]); }}
                title="View previous simulation runs"
              />
            {showRunHistory && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-300 shadow-xl w-80 max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">Recent Runs</span>
                </div>
                {runHistory.length === 0 ? (
                  <div className="p-3 text-sm text-slate-400">Loading...</div>
                ) : (
                  runHistory.slice(0, 15).map(run => (
                    <button
                      key={run.path}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm text-slate-700 truncate border-b border-slate-100 last:border-0"
                      onClick={() => {
                        setReplayRunPath(run.path);
                        setShowRunHistory(false);
                      }}
                    >
                      {run.name}
                    </button>
                  ))
                )}
              </div>
            )}
            </div>
          {/* Timelapse export */}
          {(() => {
            const frames = useLiveSimulationStore.getState().capturedFrames;
            return frames.length > 0 && !isSimRunning && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportTimelapse(frames, { filename: `${model.name || 'factory'}-timelapse` })}
                icon={<FilmIcon className="w-4 h-4" />}
                title="Export animation as WebM video"
              >
                Timelapse
              </Button>
            );
          })()}

          </RibbonStack>
        </RibbonGroup>

        <RibbonGroup label="Export">
          {/* Export — one menu for reports and data (was five separate buttons) */}
          {kpis && (
            <div className="relative">
              <RibbonButton
                icon={<FileDown size={26} color="#1F5FAD" />}
                label="Export"
                dropdown
                active={showLogMenu}
                onClick={() => setShowLogMenu(!showLogMenu)}
                title="Export reports and data"
              />
              {showLogMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLogMenu(false)} />
                  <div className="absolute left-0 mt-1 w-60 bg-white border border-gray-300 shadow-lg z-50 py-1">
                    {lastResult && (<>
                      <div className="px-3 pt-2 pb-1 text-label">Report</div>
                      {([
                        ['PDF report', 'Executive summary via print dialog', () => downloadPDFReport(lastResult, model)],
                        ['PowerPoint', 'Slides with KPIs and charts', () => downloadPPTXReport(lastResult, model)],
                        ['HTML report', 'Standalone page with charts', () => downloadReport(lastResult, model.name || 'Factory', model)],
                      ] as const).map(([label, hint, fn]) => (
                        <button key={label} onClick={() => { fn(); setShowLogMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
                          <div className="text-sm text-gray-800">{label}</div>
                          <div className="text-xs text-gray-500">{hint}</div>
                        </button>
                      ))}
                    </>)}
                    <div className="px-3 pt-2 pb-1 text-label border-t border-gray-100 mt-1">Data</div>
                    <button onClick={() => { downloadKPICSV(kpis, model.stations); setShowLogMenu(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">KPIs (CSV)</button>
                    {lastResult && (<>
                      <button onClick={() => { handleDownloadLog('csv'); setShowLogMenu(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">Event log (CSV)</button>
                      <button onClick={() => { handleDownloadLog('json'); setShowLogMenu(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">Event log (JSON)</button>
                    </>)}
                  </div>
                </>
              )}
            </div>
          )}

          <RibbonButton icon={<Camera size={26} color="#475569" />} label="Screenshot" onClick={handleScreenshot} title="Capture the dashboard as PNG" />
        </RibbonGroup>

        <RibbonGroup label="View">
          <RibbonButton icon={<SlidersHorizontal size={26} color="#475569" />} label="Customize" onClick={() => setShowConfigurator(true)} title="Choose which panels to show" />
        </RibbonGroup>
      </RibbonContent>

      {/* Section Tab Bar */}
      {kpis && !isSimRunning && hasStations && (
        <div
          className="sticky top-0 z-30 flex items-center overflow-x-auto"
          style={{
            height: 38,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            margin: '0 -12px',
            padding: '0 12px',
            gap: 4,
          }}
        >
          {[
            { id: 'all', label: 'All' },
            ...(statWidgets.length > 0 ? [{ id: 'overview', label: 'Overview' }] : []),
            ...otherWidgets.map(w => ({ id: w.id, label: WIDGET_LABELS[w.type] || w.type })),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                padding: '4px 11px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: 'nowrap' as const,
                transition: 'all 0.15s',
                cursor: 'pointer',
                border: activeSection === tab.id ? '1px solid var(--border)' : '1px solid transparent',
                background: activeSection === tab.id ? 'var(--page-bg)' : 'transparent',
                color: activeSection === tab.id ? 'var(--t1)' : 'var(--t3)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Layout mode selector — visible during replay */}
      {(!isSimRunning && isReplaying) && (
        <div
          className="flex items-center"
          style={{
            height: 38,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            margin: '0 -12px',
            padding: '0 12px',
            gap: 4,
          }}
        >
          {(['3d-focus', 'balanced', 'dashboard-focus'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setLayoutMode(mode)}
              style={{
                padding: '4px 11px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.15s',
                cursor: 'pointer',
                border: layoutMode === mode ? '1px solid var(--border)' : '1px solid transparent',
                background: layoutMode === mode ? 'var(--page-bg)' : 'transparent',
                color: layoutMode === mode ? 'var(--t1)' : 'var(--t3)',
              }}
            >
              {mode === '3d-focus' ? '3D Focus' : mode === 'balanced' ? 'Balanced' : 'Dashboard'}
            </button>
          ))}
        </div>
      )}

      {/* Live Simulation View — layout depends on mode */}
      {isSimRunning && (
        <SimulationBriefView
          progress={simulationProgress}
          elapsedSeconds={elapsedSeconds}
          simDuration={duration}
          height="calc(100vh - 180px)"
        />
      )}

      {/* Replay View */}
      {!isSimRunning && isReplaying && layoutMode === '3d-focus' && (
        <div className="space-y-3">
          <LiveSimulationView
            progress={replayProgress}
            elapsedSeconds={0}
            simDuration={replayDuration}
            height="calc(100vh - 220px)"
          />
          <ReplayController />
        </div>
      )}
      {!isSimRunning && isReplaying && layoutMode === 'balanced' && (
        <div className="space-y-3">
          <div className="flex gap-4" style={{ height: 'calc(100vh - 260px)' }}>
            <div className="flex-[7] min-w-0">
              <LiveSimulationView
                progress={replayProgress}
                elapsedSeconds={0}
                simDuration={replayDuration}
                height="100%"
              />
            </div>
            <div className="flex-[3] min-w-[280px] max-w-[400px] overflow-y-auto space-y-3">
              <div className="flex items-center gap-2 px-1 pb-1 border-b border-gray-100">
                <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Final Results</span>
              </div>
              {kpis && hasStations && statWidgets.length > 0 && (
                <div className="grid grid-cols-1 gap-3">
                  {statWidgets.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult, { startDayOfWeek, startHour }))}
                </div>
              )}
              {kpis?.warehouses && !hasStations && (
                <WarehouseResults compact warehouses={kpis.warehouses}
                  names={Object.fromEntries(model.extraNodes.map((e) => [e.id, ((e.data as { name?: string })?.name) || e.id]))} />
              )}
            </div>
          </div>
          <ReplayController />
        </div>
      )}
      {!isSimRunning && isReplaying && layoutMode === 'dashboard-focus' && (
        <div className="space-y-3">
          <div className="flex gap-4" style={{ height: 'calc(100vh - 260px)' }}>
            <div className="flex-[3] min-w-[200px] max-w-[320px]">
              <LiveSimulationView
                progress={replayProgress}
                elapsedSeconds={0}
                simDuration={replayDuration}
                height="100%"
              />
            </div>
            <div className="flex-[7] min-w-0 overflow-y-auto space-y-4">
              <div className="flex items-center gap-2 px-1 pb-1 border-b border-gray-100">
                <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Final Results</span>
              </div>
              {kpis?.warehouses && !hasStations && (
                <WarehouseResults warehouses={kpis.warehouses}
                  names={Object.fromEntries(model.extraNodes.map((e) => [e.id, ((e.data as { name?: string })?.name) || e.id]))} />
              )}
              {kpis && hasStations && statWidgets.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {statWidgets.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult, { startDayOfWeek, startHour }))}
                </div>
              )}
            </div>
          </div>
          <ReplayController />
        </div>
      )}

      {/* No results — empty state with call-to-action */}
      {!kpis && !isSimRunning && (
        <div className="space-y-6">
          {/* Guided empty state: tells a first-time user exactly what to do next */}
          <div className="dock-panel" style={{ padding: '22px 24px 20px' }}>
            {!hasSimulatableElements ? (
              <>
                <div className="text-label" style={{ marginBottom: 6 }}>Get started</div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t1)', margin: 0, letterSpacing: '-0.3px' }}>Build your production line, then run it here</h2>
                <ol className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', listStyle: 'none', padding: 0, margin: '20px 0 0' }}>
                  {[
                    ['Build', 'Place a source, your stations and buffers, and a sink. Or start from a ready-made template.'],
                    ['Run', 'Choose the run length under Settings in the ribbon (e.g. one 8-hour shift) and press Run simulation.'],
                    ['Improve', 'See output, the bottleneck and what to change. Save variants as scenarios and compare.'],
                  ].map(([t, d], i) => (
                    <li key={t} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 12, background: i === 0 ? 'var(--blue)' : 'var(--gray-100)', color: i === 0 ? '#fff' : 'var(--t2)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{t}</div>
                        <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2, lineHeight: 1.45 }}>{d}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2 mt-6">
                  <Button onClick={() => navigate('/builder')}>Open the builder</Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div>
                  <div className="text-label" style={{ marginBottom: 6 }}>Ready to run</div>
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t1)', margin: 0, letterSpacing: '-0.3px' }}>{model.name || 'Untitled model'}</h2>
                  <p style={{ fontSize: 13, color: 'var(--t2)', margin: '4px 0 0' }}>
                    {model.stations.length} station{model.stations.length === 1 ? '' : 's'} · {model.buffers.length} buffer{model.buffers.length === 1 ? '' : 's'} · {model.products.length} product{model.products.length === 1 ? '' : 's'}
                    {' — '}simulating {duration >= 86400 ? `${duration / 86400} day${duration === 86400 ? '' : 's'}` : `${duration / 3600} hour${duration === 3600 ? '' : 's'}`}. Change it under Settings in the ribbon.
                  </p>
                  {!simpleMode && (
                    <p style={{ fontSize: 12, color: 'var(--t3)', margin: '6px 0 0' }}>Results include OEE, throughput, bottlenecks, WIP trends and a schedule Gantt.</p>
                  )}
                </div>
                <Button size="lg" onClick={handleRunSimulation} icon={<PlayIcon className="w-4 h-4" />}>Run simulation</Button>
              </div>
            )}
          </div>

          {/* No skeletons here: nothing is loading until the user clicks Run. */}
        </div>
      )}

      {/* Plain-language summary of the run */}
      {kpis && !isSimRunning && (activeSection === 'all' || activeSection === 'overview') && (
        <ResultsSummary kpis={kpis} model={model} durationSeconds={duration} onStationClick={navigateToStation} />
      )}

      {/* Warehouse elements (racks, forklifts, orders, inventory) */}
      {kpis && !isSimRunning && kpis.warehouses && (activeSection === 'all' || activeSection === 'overview') && (
        <WarehouseResults
          warehouses={kpis.warehouses}
          names={Object.fromEntries(model.extraNodes.map((e) => [e.id, ((e.data as { name?: string })?.name) || e.id]))}
        />
      )}

      {/* Simulation Warnings — collapsible when >3 */}
      {kpis?.warnings && kpis.warnings.length > 0 && (activeSection === 'all' || activeSection === 'overview') && (
        <WarningBanners warnings={kpis.warnings} />
      )}

      {/* Stat Cards Row */}
      {kpis && hasStations && statWidgets.length > 0 && (activeSection === 'all' || activeSection === 'overview') && (
        <div id="dash-overview" className="grid gap-4 scroll-mt-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {statWidgets.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult, { startDayOfWeek, startHour }))}
          {kpis.delivery && kpis.delivery.onTimeRate != null && kpis.delivery.onTimeRate < 1.0 && (
            <StatCard
              key="delivery-summary"
              title="On-Time Delivery"
              value={formatPercentage(kpis.delivery.onTimeRate)}
              status={kpis.delivery.onTimeRate >= 0.95 ? 'good' : kpis.delivery.onTimeRate >= 0.80 ? 'warning' : 'bad'}
              icon={<ClockIcon className="w-6 h-6 text-[#2563EB]" />}
            />
          )}
        </div>
      )}

      {/* Other Widgets — filtered by active tab */}
      {kpis && hasStations && lgRows.map((row, i) => {
        // In tab mode, only show the matching widget(s)
        const visibleRow = activeSection === 'all'
          ? row
          : row.filter(w => w.id === activeSection);
        if (visibleRow.length === 0) return null;

        if (visibleRow.length === 2) {
          return (
            <div key={`row-${i}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {visibleRow.map((w) => <div key={w.id} id={`dash-${w.id}`} className="scroll-mt-12">{renderWidget(w, displayKpis, model, navigateToStation, lastResult, { startDayOfWeek, startHour })}</div>)}
            </div>
          );
        }
        return (
          <div key={`row-${i}`} id={`dash-${visibleRow[0].id}`} className="scroll-mt-12">
            {visibleRow.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult, { startDayOfWeek, startHour }))}
          </div>
        );
      })}

      {/* Widget Configurator Modal */}
      <WidgetConfigurator isOpen={showConfigurator} onClose={() => setShowConfigurator(false)} />

      {/* Replay Player — fullscreen overlay */}
      {replayRunPath && (
        <ReplayPlayer
          runPath={replayRunPath}
          onClose={() => setReplayRunPath(null)}
        />
      )}
    </div>
  );
}

// Sortable, searchable station performance table
function StationPerformanceTable({ kpis, model, onStationClick }: { kpis: KPIData; model: any; onStationClick?: (id: string) => void }) {
  const [sortCol, setSortCol] = useState<string>('oee');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');

  const columns = [
    { key: 'name', label: 'Station' },
    { key: 'utilization', label: 'Utilization' },
    { key: 'availability', label: 'Availability' },
    { key: 'performance', label: 'Performance' },
    { key: 'quality', label: 'Quality' },
    { key: 'oee', label: 'OEE' },
  ];

  const rows = model.stations.map((station: any) => {
    const sk = kpis.oee.byStation[station.id] || { availability: 0, performance: 0, quality: 0, oee: 0 };
    const util = kpis.utilization.byStation[station.id]?.busy ?? 0;
    return { id: station.id, name: station.name, utilization: util, availability: sk.availability, performance: sk.performance, quality: sk.quality, oee: sk.oee, performanceNote: (sk as any).performanceNote };
  }).filter((r: any) => !search || shortName(r.name).toLowerCase().includes(search.toLowerCase()));

  const sorted = [...rows].sort((a: any, b: any) => {
    const aVal = sortCol === 'name' ? shortName(a.name) : a[sortCol] ?? 0;
    const bVal = sortCol === 'name' ? shortName(b.name) : b[sortCol] ?? 0;
    if (typeof aVal === 'string') return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === 'name'); }
  };
  const arrow = (col: string) => sortCol === col ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  return (
    <>
      <div className="px-4 pb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stations..."
          className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      {sortCol === 'oee' && sortAsc && sorted.length > 0 && (
        <div className="px-4 pb-2 text-xs text-gray-500">
          Showing {sorted.length} station{sorted.length !== 1 ? 's' : ''}, worst OEE first
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="cursor-pointer select-none hover:bg-gray-50">
                  {col.label}{arrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">
                  {model.stations.length === 0 ? 'No stations in model.' : 'No matching stations.'}
                </td>
              </tr>
            ) : (
              sorted.map((row: any) => (
                <tr key={row.id} style={row.oee < 0.1 && row.oee > 0 ? { background: 'var(--red-bg)' } : row.oee < 0.3 && row.oee > 0 ? { background: 'var(--amber-bg)' } : {}}>
                  <td className="font-medium" title={`${row.name} — Click to view in editor`}>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                        background: row.utilization > 0.9 ? 'var(--red)' : row.utilization > 0.7 ? 'var(--amber)' : 'var(--blue)',
                      }} />
                      <span
                        className={onStationClick ? 'cursor-pointer hover:underline' : ''}
                        style={{ color: onStationClick ? 'var(--blue)' : 'var(--t1)' }}
                        onClick={() => onStationClick?.(row.id)}
                      >
                        {shortName(row.name)}
                      </span>
                      {row.oee > 0 && row.oee < 0.1 && (
                        <span className="chip chip-red" style={{ fontSize: 9 }}>LOW</span>
                      )}
                      {row.utilization > 0.95 && (
                        <span className="chip chip-red" style={{ fontSize: 9 }}>Bottleneck</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className="w-10 text-right font-semibold tabular-nums" style={{
                        color: row.utilization > 0.9 ? 'var(--red)' : row.utilization > 0.7 ? 'var(--amber)' : 'var(--t2)',
                      }}>{formatPercentage(row.utilization)}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[60px]" style={{ background: 'var(--page-bg)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, row.utilization * 100)}%`,
                          background: row.utilization > 0.9 ? 'var(--red)' : row.utilization > 0.7 ? 'var(--amber)' : 'var(--blue)',
                        }} />
                      </div>
                    </div>
                  </td>
                  <td className="tabular-nums">{formatPercentage(row.availability)}</td>
                  <td className="tabular-nums" title={row.performanceNote === 'constant_ct' ? 'P = 100% is expected for constant cycle times (no speed variation)' : undefined}>
                    {formatPercentage(row.performance)}
                    {row.performanceNote === 'constant_ct' && (
                      <span className="ml-1 text-[9px] cursor-help" style={{ color: 'var(--blue)' }} title="P = 100% expected for constant cycle time">*</span>
                    )}
                  </td>
                  <td className="tabular-nums">{formatPercentage(row.quality)}</td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold w-10 text-right tabular-nums" style={{
                        color: row.oee >= 0.8 ? 'var(--green)' : row.oee >= 0.5 ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {formatPercentage(row.oee)}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[60px]" style={{ background: 'var(--page-bg)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, row.oee * 100)}%`,
                          background: row.oee >= 0.8 ? 'var(--green)' : row.oee >= 0.5 ? 'var(--amber)' : 'var(--red)',
                        }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function renderWidget(config: DashboardWidgetConfig, kpis: KPIData, model: any, onStationClick?: (id: string) => void, result?: SimulationResult | null, ganttOptions?: { startDayOfWeek: number; startHour: number }) {
  switch (config.type) {
    case 'oee-summary': {
      // Compute effective utilization (avg busy%) to contextualize OEE for batch models
      const stationUtils = Object.values(kpis.utilization.byStation);
      const hasBatch = stationUtils.some((s: any) => (s.batchWait || 0) > 0.05);
      const avgBusy = stationUtils.length > 0
        ? stationUtils.reduce((sum: number, s: any) => sum + (s.busy || 0), 0) / stationUtils.length
        : 0;
      const batchSubtitle = hasBatch && kpis.oee.overall > 0.90 && avgBusy < 0.50
        ? `Effective utilization: ${(avgBusy * 100).toFixed(0)}% (batch wait reduces productive time)`
        : undefined;
      return (
        <StatCard
          key={config.id}
          title="Overall OEE"
          value={formatPercentage(kpis.oee.overall)}
          status={kpis.oee.overall >= 0.85 ? 'good' : kpis.oee.overall >= 0.65 ? 'warning' : 'bad'}
          subtitle={batchSubtitle}
          subtitleStatus={batchSubtitle ? 'warning' : undefined}
          icon={<GaugeIcon className="w-6 h-6 text-[#2563EB]" />}
        />
      );
    }
    case 'throughput-summary':
      return (
        <StatCard
          key={config.id}
          title="Throughput"
          value={`${kpis.throughput.total} units`}
          changeLabel={kpis.throughput.inProgress ? `+${kpis.throughput.inProgress} still in system` : undefined}
          icon={<TrendUpIcon className="w-6 h-6 text-[#17C964]" />}
        />
      );
    case 'cycle-time-summary':
      return (
        <StatCard
          key={config.id}
          title="Avg Cycle Time"
          value={formatDuration(kpis.cycleTime.mean)}
          icon={<ClockIcon className="w-6 h-6 text-[#2563EB]" />}
        />
      );
    case 'wip-summary':
      return (
        <StatCard
          key={config.id}
          title="WIP at End"
          value={`${kpis.wip.total} items`}
          subtitle={kpis.wip.average != null ? `avg ${Number(kpis.wip.average).toFixed(1)} · peak ${kpis.wip.peak ?? '–'}` : undefined}
          status={kpis.wip.total < 50 ? 'good' : kpis.wip.total < 100 ? 'warning' : 'bad'}
          icon={<BoxIcon className="w-6 h-6 text-[#F5A524]" />}
        />
      );
    case 'quality-summary': {
      const totalScrapped = (result as any)?.totalScrapped ?? 0;
      const qualPct = kpis.oee.quality;
      return (
        <StatCard
          key={config.id}
          title="Quality / Scrap"
          value={formatPercentage(qualPct)}
          status={qualPct >= 0.98 ? 'good' : qualPct >= 0.95 ? 'warning' : 'bad'}
          changeLabel={`${totalScrapped} scrapped`}
          icon={<QualityIcon className="w-6 h-6 text-[#F31260]" />}
        />
      );
    }
    case 'oee-chart': {
      const oeeStationUtils = Object.values(kpis.utilization.byStation);
      const oeeHasBatch = oeeStationUtils.some((s: any) => (s.batchWait || 0) > 0.05);
      const oeeAvgBusy = oeeStationUtils.length > 0
        ? oeeStationUtils.reduce((sum: number, s: any) => sum + (s.busy || 0), 0) / oeeStationUtils.length
        : 0;
      return (
        <Card key={config.id}>
          <CardHeader title="OEE Breakdown" subtitle="Availability x Performance x Quality" />
          <OEEChart data={kpis.oee} />
          {oeeHasBatch && oeeAvgBusy < 0.50 && (
            <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <span className="font-semibold">Batch stations detected.</span>{' '}
              OEE reflects processing speed (correct per standard). Average productive utilization is{' '}
              <span className="font-bold">{(oeeAvgBusy * 100).toFixed(0)}%</span> — the remaining time is batch accumulation wait.
              See Station Utilization chart for the full breakdown.
            </div>
          )}
        </Card>
      );
    }
    case 'throughput-chart':
      return (
        <Card key={config.id}>
          <CardHeader title="Throughput by Hour" subtitle="Units produced per hour" />
          <ThroughputChart data={kpis.throughput} />
        </Card>
      );
    case 'bottleneck-heatmap':
      return (
        <Card key={config.id}>
          <CardHeader
            title="Bottleneck Analysis"
            subtitle="Station utilization heatmap"
          />
          <BottleneckHeatmap stations={model.stations} kpis={kpis} connections={model.connections} />
        </Card>
      );
    case 'station-table':
      return (
        <Card key={config.id}>
          <CardHeader title="Station Performance" />
          <StationPerformanceTable kpis={kpis} model={model} onStationClick={onStationClick} />
        </Card>
      );
    case 'utilization-chart':
      return (
        <Card key={config.id}>
          <CardHeader title="Station Utilization" subtitle="Busy / Idle / Blocked / Failed breakdown" />
          <UtilizationChart data={kpis.utilization} />
        </Card>
      );
    case 'quality-chart':
      return (
        <Card key={config.id}>
          <CardHeader title="Quality / Scrap by Station" subtitle="Sorted worst-first" />
          <QualityScrapChart data={kpis.oee} result={result} />
        </Card>
      );
    case 'wip-trend-chart': {
      // Extract failure events for markers
      const wipEvents: Array<{ time: number; label: string; color: string }> = [];
      if (result?.events) {
        const seen = new Set<string>();
        for (const e of result.events) {
          if (e.type === 'state_change' && e.details?.newState === 'failed') {
            const key = `fail-${Math.round(e.time / 300)}`; // dedupe within 5-min windows
            if (!seen.has(key)) {
              seen.add(key);
              wipEvents.push({ time: e.time, label: 'Fail', color: '#F31260' });
            }
          }
        }
      }
      return (
        <Card key={config.id}>
          <CardHeader title="WIP Over Time" subtitle="Work-in-progress trend" />
          <WipTrendChart data={kpis.wip} events={wipEvents} warnings={kpis.warnings} />
        </Card>
      );
    }
    case 'gantt-schedule':
      return (
        <Card key={config.id}>
          <CardHeader title="Schedule Gantt" subtitle="Swimlane timeline — click a job block to trace its route" />
          <GanttScheduleView
            result={result!}
            stations={model.stations}
            utilization={kpis.utilization?.byStation}
            startDayOfWeek={ganttOptions?.startDayOfWeek}
            startHour={ganttOptions?.startHour}
          />
        </Card>
      );
    case 'sankey-flow':
      return (
        <Card key={config.id}>
          <CardHeader title="Material Flow" subtitle="Sankey diagram — link width proportional to throughput" />
          <SankeyChart kpis={kpis} model={model} result={result ?? null} />
        </Card>
      );
    case 'cycle-time-pareto':
      return (
        <Card key={config.id}>
          <CardHeader title="Cycle Time Pareto" subtitle="Stations ranked by processing time contribution" />
          <CycleTimePareto kpis={kpis} model={model} />
        </Card>
      );
    case 'throughput-waterfall':
      return (
        <Card key={config.id}>
          <CardHeader title="Throughput Waterfall" subtitle="OEE loss cascade: Theoretical Max → Actual Output" />
          <ThroughputWaterfall kpis={kpis} model={model} />
        </Card>
      );
    case 'buffer-sparklines':
      return (
        <Card key={config.id}>
          <CardHeader title="Buffer Fill Levels" subtitle="Sparklines showing buffer utilization over time" />
          <BufferSparklines kpis={kpis} model={model} result={result ?? null} />
        </Card>
      );
    case 'cost-summary':
      return (
        <Card key={config.id}>
          <CardHeader title="Cost Summary" subtitle="Operating, variable, and scrap cost breakdown" />
          <CostSummary kpis={kpis} model={model} />
        </Card>
      );
    case 'energy-chart':
      return (
        <Card key={config.id}>
          <CardHeader title="Energy Consumption" subtitle="Energy usage (kWh), cost, and CO2 by station" />
          <EnergyChart kpis={kpis} model={model} />
        </Card>
      );
    case 'maintenance-chart':
      return (
        <Card key={config.id}>
          <CardHeader title="Maintenance Overview" subtitle="Planned vs unplanned downtime by station" />
          <MaintenanceChart kpis={kpis} model={model} />
        </Card>
      );
    case 'value-stream-map':
      return (
        <Card key={config.id}>
          <CardHeader title="Value Stream Map" subtitle="Process flow, cycle times, inventory, and lead time breakdown" />
          <ValueStreamMap kpis={kpis} model={model} />
        </Card>
      );
    default:
      return null;
  }
}

// Icons
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}


function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function QualityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}


function FilmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  );
}




