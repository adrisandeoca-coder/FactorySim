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
import { useSimulationStore, formatPercentage } from '../../stores/simulationStore';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { LiveSimulationView } from './LiveSimulationView';
import { ReplayController } from './ReplayController';
import { captureScreenshot, captureToBase64, downloadEventLog, downloadEventLogCSV, downloadKPICSV } from '../../services/screenshotService';
import { registerElement, getElement, getCachedImage, setCachedImage, clearCachedImage } from '../../services/elementRegistry';
import { saveRunArtifacts } from '../../services/artifactService';
import { captureAllTabScreenshots } from '../../services/tabScreenshotCapture';
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
};

function WarningBanners({ warnings }: { warnings: Array<{ severity: string; message: string; type?: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 3;
  const shown = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const hidden = warnings.length - MAX_VISIBLE;

  return (
    <div className="space-y-2">
      {shown.map((w, i) => (
        <div key={i} className={`flex items-start gap-2 px-4 py-3 rounded-lg border ${
          w.severity === 'error' ? 'bg-red-50 border-red-200 text-red-800'
            : w.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <span className="text-lg mt-0.5">{w.severity === 'error' ? '\u26A0' : w.severity === 'warning' ? '\u26A0' : '\u2139'}</span>
          <span className="text-sm">{w.message}</span>
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-1"
        >
          + {hidden} more warning{hidden !== 1 ? 's' : ''}...
        </button>
      )}
      {expanded && warnings.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-1"
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
  const { lastResult, isRunning, defaultOptions, setResult, clearResults, startSimulation, stopSimulation } = useSimulationStore();
  const { addToast, setSimulating, setSimulationProgress, simulationProgress, dashboardWidgets } = useAppStore();

  const navigateToStation = useCallback((stationId: string) => {
    setSelectedNode(stationId);
    navigate('/builder');
  }, [setSelectedNode, navigate]);
  const [duration, setDuration] = useState(defaultOptions.duration);
  const [startDayOfWeek, setStartDayOfWeek] = useState(0);
  const [startHour, setStartHour] = useState(0);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [showLogMenu, setShowLogMenu] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all');
  const modelScreenshotRef = useRef<string | undefined>(undefined);
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

    // Pre-capture at 500ms as early fallback (charts may be partially rendered)
    let earlyCaptureBase64: string | undefined;
    setTimeout(async () => {
      if (dashboardRef.current) {
        try {
          earlyCaptureBase64 = await captureToBase64(dashboardRef.current);
        } catch { /* non-critical */ }
      }
    }, 500);

    // Main capture at 2000ms, with retry + early fallback
    artifactTimerRef.current = setTimeout(async () => {
      let dashScreenshot: string | undefined;
      if (dashboardRef.current) {
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
          } catch { /* retry */ }
        }
      }
      // Fall back to early capture if live captures all failed
      if (!dashScreenshot && earlyCaptureBase64) {
        dashScreenshot = earlyCaptureBase64;
      }

      // Pre-capture tab screenshots offscreen (scenarios, orders, code, data, settings)
      try { await captureAllTabScreenshots(); } catch { /* non-critical */ }

      try {
        const savedPath = await saveRunArtifacts({
          model: modelSnap,
          result: resultSnap,
          simOptions: optsSnap,
          dashboardScreenshot: dashScreenshot,
          modelScreenshot: modelScreenshotRef.current,
        });
        if (savedPath) {
          addToast({ type: 'info', message: 'Run artifacts saved' });
        }
      } catch { /* non-critical */ }
    }, 2000);

    // Do NOT return cleanup — let the timer complete even if lastResult
    // changes from the next run.  Each result gets its own save.
  }, [lastResult]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const handleRunSimulation = async () => {
    if (model.stations.length === 0) {
      addToast({ type: 'warning', message: 'Add stations to your model before running simulation' });
      return;
    }

    abortRef.current = false;
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
    // Try live element first, fall back to cache (set by FactoryBuilder on model changes).
    const factoryEl = getElement('factory-canvas');
    if (factoryEl) {
      captureToBase64(factoryEl)
        .then((base64) => { modelScreenshotRef.current = base64; })
        .catch(() => { modelScreenshotRef.current = getCachedImage('factory-canvas') || undefined; });
    } else {
      modelScreenshotRef.current = getCachedImage('factory-canvas') || undefined;
    }
    setSimulating(true);
    setSimulationProgress(0);
    setElapsedSeconds(0);
    useLiveSimulationStore.getState().reset();
    useLiveSimulationStore.getState().setSimDuration(duration);
    startSimulation();
    addToast({ type: 'info', message: 'Starting simulation...' });

    // Start elapsed time counter
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      if (!window.factorySim?.simulation?.runSimulation) {
        throw new Error('Simulation engine not available');
      }

      // Set up progress listener for live UI updates
      const cleanupProgress = window.factorySim.app?.onSimulationProgress?.((progress) => {
        setSimulationProgress(progress.progress);
        if (progress.diagnostics) {
          useLiveSimulationStore.getState().updateFromDiagnostics(progress.diagnostics, progress.currentTime);
        }
      });

      // Set up event stream listener for live animation
      const cleanupEvents = window.factorySim.app?.onSimulationEvent?.((event) => {
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

      cleanupProgress?.();
      cleanupEvents?.();

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
      console.log(`[FrameCapture] Result contains ${diagSnapshots.length} snapshots`);

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
            if (base64 && base64.length > 5000) {
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
      addToast({ type: 'success', message: 'Simulation completed!' });

      // Artifact save is now handled by the lastResult useEffect above,
      // which captures the screenshot and saves atomically at 2000ms.
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg !== 'Simulation stopped') {
        addToast({ type: 'error', message: `Simulation error: ${msg}` });
      }
    } finally {
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

  // P0 — In fullscreen mode, render only the live simulation view
  if (isAnimationFullscreen && isSimRunning) {
    return (
      <div ref={dashboardRef}>
        <LiveSimulationView
          progress={simulationProgress}
          elapsedSeconds={elapsedSeconds}
          simDuration={duration}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={dashboardRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Monitor your factory performance</p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Screenshot */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleScreenshot}
            icon={<CameraIcon className="w-4 h-4" />}
            title="Capture dashboard as PNG"
          >
            Screenshot
          </Button>

          {/* Replay */}
          {lastResult && !isSimRunning && !isReplaying && (
            <ReplayController />
          )}

          {/* Download Logs */}
          {lastResult && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLogMenu(!showLogMenu)}
                icon={<DownloadIcon className="w-4 h-4" />}
                title="Download simulation event log"
              >
                Logs
              </Button>
              {showLogMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => handleDownloadLog('json')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-lg"
                  >
                    Download as JSON
                  </button>
                  <button
                    onClick={() => handleDownloadLog('csv')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg"
                  >
                    Download as CSV
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Export KPIs */}
          {kpis && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadKPICSV(kpis, model.stations)}
              icon={<ExportIcon className="w-4 h-4" />}
              title="Export KPI data as CSV"
            >
              Export
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfigurator(true)}
            icon={<CustomizeIcon className="w-4 h-4" />}
            title="Choose which widgets to display"
          >
            Customize
          </Button>

          <div className="flex items-center space-x-2" title="Set simulation duration">
            <label className="text-sm text-gray-600">Duration:</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="input w-32"
              disabled={isSimRunning}
            >
              <option value={3600}>1 hour</option>
              <option value={14400}>4 hours</option>
              <option value={28800}>8 hours</option>
              <option value={86400}>24 hours</option>
              <option value={604800}>1 week</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Start:</label>
            <select
              value={startDayOfWeek}
              onChange={(e) => setStartDayOfWeek(Number(e.target.value))}
              className="input w-24"
              disabled={isSimRunning}
            >
              <option value={0}>Mon</option>
              <option value={1}>Tue</option>
              <option value={2}>Wed</option>
              <option value={3}>Thu</option>
              <option value={4}>Fri</option>
              <option value={5}>Sat</option>
              <option value={6}>Sun</option>
            </select>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="input w-24"
              disabled={isSimRunning}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>

          {isSimRunning ? (
            <Button
              variant="secondary"
              onClick={handleStopSimulation}
              icon={<StopIcon className="w-4 h-4" />}
            >
              Stop
            </Button>
          ) : (
            <Button
              onClick={handleRunSimulation}
              icon={<PlayIcon className="w-4 h-4" />}
            >
              Run Simulation
            </Button>
          )}

          {/* Run history button — opens run history picker */}
          <div className="relative">
            <Button
              variant="secondary"
              onClick={() => { setShowRunHistory(!showRunHistory); setRunHistory([]); }}
              title="View previous simulation runs"
            >
              Run History
            </Button>
            {showRunHistory && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-xl w-80 max-h-64 overflow-y-auto">
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
        </div>
      </div>

      {/* Section Tab Bar */}
      {kpis && !isSimRunning && (
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 -mx-6 px-6 py-1 flex items-center gap-0.5 overflow-x-auto">
          <button
            onClick={() => setActiveSection('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
              activeSection === 'all' ? 'text-blue-600 border-blue-600 bg-blue-50' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {statWidgets.length > 0 && (
            <button
              onClick={() => setActiveSection('overview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
                activeSection === 'overview' ? 'text-blue-600 border-blue-600 bg-blue-50' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Overview
            </button>
          )}
          {otherWidgets.map(w => (
            <button key={w.id}
              onClick={() => setActiveSection(w.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
                activeSection === w.id ? 'text-blue-600 border-blue-600 bg-blue-50' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {WIDGET_LABELS[w.type] || w.type}
            </button>
          ))}
        </div>
      )}

      {/* Live Simulation View */}
      {isSimRunning && (
        <LiveSimulationView
          progress={simulationProgress}
          elapsedSeconds={elapsedSeconds}
          simDuration={duration}
        />
      )}

      {/* Replay View */}
      {!isSimRunning && isReplaying && (
        <div className="space-y-3">
          <LiveSimulationView
            progress={replayProgress}
            elapsedSeconds={0}
            simDuration={replayDuration}
          />
          <ReplayController />
        </div>
      )}

      {/* No results message */}
      {!kpis && !isSimRunning && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <PlayIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No simulation results yet</p>
          <p className="text-sm text-gray-400 mt-1">Run a simulation to see KPIs and charts</p>
        </div>
      )}

      {/* Simulation Warnings — collapsible when >3 */}
      {kpis?.warnings && kpis.warnings.length > 0 && (activeSection === 'all' || activeSection === 'overview') && (
        <WarningBanners warnings={kpis.warnings} />
      )}

      {/* Stat Cards Row */}
      {kpis && statWidgets.length > 0 && (activeSection === 'all' || activeSection === 'overview') && (
        <div id="dash-overview" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 scroll-mt-12">
          {statWidgets.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult))}
          {kpis.delivery && kpis.delivery.onTimeRate != null && kpis.delivery.onTimeRate < 1.0 && (
            <StatCard
              key="delivery-summary"
              title="On-Time Delivery"
              value={formatPercentage(kpis.delivery.onTimeRate)}
              status={kpis.delivery.onTimeRate >= 0.95 ? 'good' : kpis.delivery.onTimeRate >= 0.80 ? 'warning' : 'bad'}
              icon={<ClockIcon className="w-6 h-6 text-indigo-600" />}
            />
          )}
        </div>
      )}

      {/* Other Widgets — filtered by active tab */}
      {kpis && lgRows.map((row, i) => {
        // In tab mode, only show the matching widget(s)
        const visibleRow = activeSection === 'all'
          ? row
          : row.filter(w => w.id === activeSection);
        if (visibleRow.length === 0) return null;

        if (visibleRow.length === 2) {
          return (
            <div key={`row-${i}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {visibleRow.map((w) => <div key={w.id} id={`dash-${w.id}`} className="scroll-mt-12">{renderWidget(w, displayKpis, model, navigateToStation, lastResult)}</div>)}
            </div>
          );
        }
        return (
          <div key={`row-${i}`} id={`dash-${visibleRow[0].id}`} className="scroll-mt-12">
            {visibleRow.map((w) => renderWidget(w, displayKpis, model, navigateToStation, lastResult))}
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
                <tr key={row.id} className={row.oee < 0.1 && row.oee > 0 ? 'bg-red-50' : row.oee < 0.3 && row.oee > 0 ? 'bg-amber-50' : ''}>
                  <td className="font-medium" title={`${row.name} — Click to view in editor`}>
                    <span
                      className={onStationClick ? 'cursor-pointer text-blue-600 hover:underline' : ''}
                      onClick={() => onStationClick?.(row.id)}
                    >
                      {shortName(row.name)}
                    </span>
                    {row.oee > 0 && row.oee < 0.1 && (
                      <span className="ml-1.5 px-1 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded">LOW</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className="w-10 text-right">{formatPercentage(row.utilization)}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[60px]">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, row.utilization * 100)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>{formatPercentage(row.availability)}</td>
                  <td title={row.performanceNote === 'constant_ct' ? 'P = 100% is expected for constant cycle times (no speed variation)' : undefined}>
                    {formatPercentage(row.performance)}
                    {row.performanceNote === 'constant_ct' && (
                      <span className="ml-1 text-[9px] text-blue-500 cursor-help" title="P = 100% expected for constant cycle time">*</span>
                    )}
                  </td>
                  <td>{formatPercentage(row.quality)}</td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className={`font-semibold w-10 text-right ${row.oee >= 0.8 ? 'text-green-600' : row.oee >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                        {formatPercentage(row.oee)}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[60px]">
                        <div className={`h-full rounded-full ${row.oee >= 0.8 ? 'bg-green-400' : row.oee >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, row.oee * 100)}%` }} />
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

function renderWidget(config: DashboardWidgetConfig, kpis: KPIData, model: any, onStationClick?: (id: string) => void, result?: SimulationResult | null) {
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
          icon={<GaugeIcon className="w-6 h-6 text-blue-600" />}
        />
      );
    }
    case 'throughput-summary':
      return (
        <StatCard
          key={config.id}
          title="Throughput"
          value={`${kpis.throughput.total} units`}
          change={12}
          changeLabel={kpis.throughput.inProgress ? `+${kpis.throughput.inProgress} in-flight` : 'vs baseline'}
          icon={<TrendUpIcon className="w-6 h-6 text-green-600" />}
        />
      );
    case 'cycle-time-summary':
      return (
        <StatCard
          key={config.id}
          title="Avg Cycle Time"
          value={`${kpis.cycleTime.mean.toFixed(0)}s`}
          icon={<ClockIcon className="w-6 h-6 text-purple-600" />}
        />
      );
    case 'wip-summary':
      return (
        <StatCard
          key={config.id}
          title="WIP Level"
          value={`${kpis.wip.total} items`}
          status={kpis.wip.total < 50 ? 'good' : kpis.wip.total < 100 ? 'warning' : 'bad'}
          icon={<BoxIcon className="w-6 h-6 text-orange-600" />}
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
          icon={<QualityIcon className="w-6 h-6 text-rose-600" />}
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
              wipEvents.push({ time: e.time, label: 'Fail', color: '#ef4444' });
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
    default:
      return null;
  }
}

// Icons
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CustomizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
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

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

