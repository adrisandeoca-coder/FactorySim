/**
 * Artifact service — automatically bundles and saves all run artifacts
 * after every simulation or scenario run.
 */

import { captureToBase64, eventsToCSV } from './screenshotService';
import { getElement, getCachedImage } from './elementRegistry';
import { generateModelExcelBase64 } from './modelExcelExporter';
import { useLiveSimulationStore } from '../stores/liveSimulationStore';
import type { FactoryModel, SimulationResult } from '../types';

export interface RunArtifactOptions {
  model: FactoryModel;
  result: SimulationResult;
  simOptions?: Record<string, unknown>;
  scenarioName?: string;
  /** Pre-captured dashboard screenshot (base64 PNG). Bypasses cache when provided. */
  dashboardScreenshot?: string;
  /** Pre-captured model/factory screenshot (base64 PNG). Bypasses cache when provided. */
  modelScreenshot?: string;
  /** Diagnostic snapshots from the simulation result. Saved as JSON sidecars
   *  even when no animation frame PNGs are available (e.g. quick scenarios). */
  diagSnapshots?: Array<Record<string, unknown>>;
}

/**
 * Capture a screenshot from a live DOM element, or fall back to a cached base64 image.
 */
async function getScreenshot(
  elementKey: string,
  cacheKey: string
): Promise<string | null> {
  const el = getElement(elementKey);
  if (el) {
    try {
      return await captureToBase64(el);
    } catch {
      // fall through to cache
    }
  }
  return getCachedImage(cacheKey);
}

/**
 * Save all run artifacts to a timestamped folder via IPC.
 * Gracefully handles missing elements or failed captures.
 */
export async function saveRunArtifacts(opts: RunArtifactOptions): Promise<string | null> {
  const { model, result, simOptions, scenarioName, dashboardScreenshot, modelScreenshot, diagSnapshots } = opts;

  if (!window.factorySim?.artifacts?.saveRunBundle) {
    console.warn('artifacts:saveRunBundle IPC not available');
    return null;
  }

  // Build timestamp-based folder name
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
  const safeName = (scenarioName || model.name || 'run').replace(/[^a-zA-Z0-9_-]/g, '_');
  const folderName = `${ts}_${safeName}`;

  const files: Array<{ name: string; content: string; encoding?: string }> = [];

  // 1. run-info.json — metadata
  const runInfo = {
    timestamp: new Date().toISOString(),
    modelName: model.name,
    modelId: model.id,
    scenarioName: scenarioName || null,
    runId: result.runId,
    duration: result.duration,
    simOptions: simOptions || null,
  };
  files.push({ name: 'run-info.json', content: JSON.stringify(runInfo, null, 2) });

  // 2. model.json — full model snapshot
  files.push({ name: 'model.json', content: JSON.stringify(model, null, 2) });

  // 3. simulation-code.py — Python code export (pass simOptions for correct duration/seed)
  try {
    if (window.factorySim?.code?.exportModel) {
      const pyCode = await window.factorySim.code.exportModel(model, simOptions || undefined);
      if (pyCode) {
        files.push({ name: 'simulation-code.py', content: pyCode });
      }
    }
  } catch {
    // non-critical, skip
  }

  // 4. kpis.json
  if (result.kpis) {
    files.push({ name: 'kpis.json', content: JSON.stringify(result.kpis, null, 2) });
  }

  // 5. event-log.json
  if (result.events && result.events.length > 0) {
    files.push({
      name: 'event-log.json',
      content: JSON.stringify(result.events, null, 2),
    });

    // 6. event-log.csv
    const csv = eventsToCSV(result.events as unknown as Array<Record<string, unknown>>);
    if (csv) {
      files.push({ name: 'event-log.csv', content: csv });
    }
  }

  // 7. FactorySim_Import_Template.xlsx — model-specific re-importable Excel
  try {
    const excelBase64 = generateModelExcelBase64(model);
    if (excelBase64) {
      files.push({ name: 'FactorySim_Import_Template.xlsx', content: excelBase64, encoding: 'base64' });
    }
  } catch {
    // non-critical
  }

  // 8. model-screenshot.png — factory canvas (pre-captured, live element, or cached)
  try {
    const modelImg = modelScreenshot || await getScreenshot('factory-canvas', 'factory-canvas');
    if (modelImg) {
      files.push({ name: 'model-screenshot.png', content: modelImg, encoding: 'base64' });
    }
  } catch {
    // non-critical
  }

  // 8. dashboard-screenshot.png — dashboard with charts (live element or cached)
  try {
    const dashImg = dashboardScreenshot || await getScreenshot('dashboard', 'dashboard');
    if (dashImg) {
      files.push({ name: 'dashboard-screenshot.png', content: dashImg, encoding: 'base64' });
    }
  } catch {
    // non-critical
  }

  // 9. delivery-predictions-screenshot.png — order delivery predictions (if available)
  try {
    const predImg = await getScreenshot('delivery-predictions', 'delivery-predictions');
    if (predImg) {
      files.push({ name: 'delivery-predictions-screenshot.png', content: predImg, encoding: 'base64' });
    }
  } catch {
    // non-critical
  }

  // 10. Tab screenshots — scenarios, orders, code editor, data sync, settings
  const tabScreenshots = [
    { elementKey: 'scenarios-tab', fileName: 'scenarios-screenshot.png' },
    { elementKey: 'orders-tab', fileName: 'orders-screenshot.png' },
    { elementKey: 'code-editor-tab', fileName: 'code-editor-screenshot.png' },
    { elementKey: 'data-sync-tab', fileName: 'data-sync-screenshot.png' },
    { elementKey: 'settings-tab', fileName: 'settings-screenshot.png' },
  ];
  for (const tab of tabScreenshots) {
    try {
      const img = await getScreenshot(tab.elementKey, tab.elementKey);
      if (img) {
        files.push({ name: tab.fileName, content: img, encoding: 'base64' });
      }
    } catch {
      // non-critical — tab may not have been visited this session
    }
  }

  // 11. Animation frames captured during live simulation (PNG + JSON sidecar)
  try {
    const { capturedFrames } = useLiveSimulationStore.getState();
    for (const frame of capturedFrames) {
      const label = String(Math.round(frame.progress)).padStart(2, '0');
      files.push({
        name: `animation-frame-${label}pct.png`,
        content: frame.base64,
        encoding: 'base64',
      });
      // Structured metadata sidecar
      if (frame.metadata) {
        files.push({
          name: `animation-frame-${label}pct.json`,
          content: JSON.stringify({
            progress: frame.progress,
            simTime: frame.metadata.simTime,
            trigger: frame.metadata.trigger || 'threshold',
            ...frame.metadata.diagnostics,
          }, null, 2),
        });
      }
    }

    // If no PNGs were captured (e.g. quick scenarios) but diagSnapshots are
    // available, save the structured data as JSON-only sidecars so the
    // simulation state progression is preserved for analysis.
    if (capturedFrames.length === 0 && diagSnapshots && diagSnapshots.length > 0) {
      for (const snap of diagSnapshots) {
        const pct = Math.round(((snap.threshold as number) ?? 0) * 100);
        const label = String(pct).padStart(2, '0');
        files.push({
          name: `animation-frame-${label}pct.json`,
          content: JSON.stringify({
            progress: pct,
            simTime: snap.currentTime,
            trigger: (snap as any).trigger || 'threshold',
            captureMode: 'data-only',
            ...(snap.diagnostics as Record<string, unknown> || {}),
          }, null, 2),
        });
      }
    }
  } catch {
    // non-critical
  }

  // Send bundle to main process
  try {
    const savedPath = await window.factorySim.artifacts.saveRunBundle({
      folderName,
      files,
    });
    return savedPath;
  } catch (err) {
    console.error('Failed to save run artifacts:', err);
    return null;
  }
}
