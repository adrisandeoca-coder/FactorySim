import { IpcMain, Dialog, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { PythonBridge } from './python-bridge';
import { DatabaseManager } from './database';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Recursively converts all snake_case keys in an object to camelCase.
 * Also maps Python-specific field names to TypeScript conventions:
 *  - utilization "processing" → "busy"
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

// Keys that should be renamed after camelCase conversion
const KEY_ALIASES: Record<string, string> = {
  processing: 'busy',  // station state breakdown: "processing" → "busy"
};

function transformKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Preserve internal engine identifiers (e.g., __arrival_s1) —
      // these are entity names used as dictionary keys, not API fields.
      let camelKey = key.startsWith('__') ? key : snakeToCamel(key);
      camelKey = KEY_ALIASES[camelKey] ?? camelKey;
      result[camelKey] = transformKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * Post-transform fixups for field names / shapes that differ
 * between the Python engine and the TypeScript types.
 */
function fixPythonResult(result: Record<string, unknown>): void {
  const kpis = result.kpis as Record<string, unknown> | undefined;
  if (!kpis) return;

  // Utilization: rename "processing" → "busy", drop starved/setup
  const utilization = kpis.utilization as Record<string, unknown> | undefined;
  if (utilization) {
    const byStation = utilization.byStation as Record<string, Record<string, number>> | undefined;
    if (byStation) {
      for (const stationId of Object.keys(byStation)) {
        const s = byStation[stationId];
        if (s && 'processing' in s) {
          s.busy = s.processing;
          delete s.processing;
        }
      }
    }
  }

  // WIP timeSeries: rename "level" → "wip"
  const wip = kpis.wip as Record<string, unknown> | undefined;
  if (wip) {
    const timeSeries = wip.timeSeries as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(timeSeries)) {
      for (const entry of timeSeries) {
        if ('level' in entry) {
          entry.wip = entry.level;
          delete entry.level;
        }
      }
    }
  }
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  pythonBridge: PythonBridge,
  dbManager: DatabaseManager,
  dialog: Dialog,
  mainWindow: BrowserWindow | null,
  shell: Electron.Shell
): void {
  // ============ Simulation Handlers ============

  ipcMain.handle('simulation:run', async (_event, model: object, options: object) => {
    const runId = uuidv4();

    try {
      // Save run to database
      dbManager.createSimulationRun(
        runId,
        (model as { id?: string }).id || 'temp',
        null,
        JSON.stringify(options)
      );

      // Set up progress handler (broadcast to all windows for popout support)
      const broadcastToAll = (channel: string, ...args: unknown[]) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(channel, ...args);
          }
        }
      };

      const progressHandler = (progress: { runId: string; progress: number; currentTime: number; message?: string }) => {
        if (progress.runId === runId) {
          broadcastToAll('simulation:progress', progress);
        }
      };
      pythonBridge.on('progress', progressHandler);

      // Set up event stream handler (for live animation)
      const eventHandler = (data: { runId: string; event: object }) => {
        if (data.runId === runId) {
          broadcastToAll('simulation:event', data.event);
        }
      };
      pythonBridge.on('simulation_event', eventHandler);

      // Run simulation
      const rawResult = await pythonBridge.runSimulation(model, options);

      // Clean up handlers
      pythonBridge.off('progress', progressHandler);
      pythonBridge.off('simulation_event', eventHandler);

      // Transform snake_case keys from Python to camelCase for TypeScript
      const result = transformKeys(rawResult) as Record<string, unknown>;
      fixPythonResult(result);

      // Update database
      dbManager.updateSimulationRun(runId, 'completed', undefined, JSON.stringify((result as { kpis?: object }).kpis));

      return { runId, ...result };
    } catch (error) {
      dbManager.updateSimulationRun(runId, 'error');
      throw error;
    }
  });

  ipcMain.handle('simulation:validate', async (_event, model: object) => {
    return pythonBridge.validateModel(model);
  });

  ipcMain.handle('simulation:stop', async (_event, runId: string) => {
    return pythonBridge.stopSimulation(runId);
  });

  ipcMain.handle('simulation:status', async (_event, runId: string) => {
    return pythonBridge.getSimulationStatus(runId);
  });

  // ============ Model Handlers ============

  ipcMain.handle('model:save', async (_event, model: { id?: string; name: string; description?: string }) => {
    const id = model.id || uuidv4();
    dbManager.saveModel(id, model.name, model.description || null, JSON.stringify(model));
    return id;
  });

  ipcMain.handle('model:load', async (_event, id: string) => {
    const row = dbManager.loadModel(id);
    if (!row) {
      throw new Error(`Model not found: ${id}`);
    }
    return JSON.parse(row.model_json);
  });

  ipcMain.handle('model:list', async () => {
    const models = dbManager.listModels();
    return models.map(m => {
      const modelData = JSON.parse((dbManager.loadModel(m.id) as { model_json: string }).model_json);
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        stationCount: modelData.stations?.length || 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      };
    });
  });

  ipcMain.handle('model:delete', async (_event, id: string) => {
    dbManager.deleteModel(id);
  });

  ipcMain.handle('model:export', async (_event, id: string, format: 'json' | 'python') => {
    const row = dbManager.loadModel(id);
    if (!row) {
      throw new Error(`Model not found: ${id}`);
    }

    if (format === 'json') {
      return row.model_json;
    } else if (format === 'python') {
      const model = JSON.parse(row.model_json);
      return pythonBridge.exportToPython(model);
    }

    throw new Error(`Unknown format: ${format}`);
  });

  // ============ Scenario Handlers ============

  ipcMain.handle('scenario:create', async (_event, modelId: string, name: string, parameters: object) => {
    const id = uuidv4();
    dbManager.createScenario(id, modelId, name, JSON.stringify(parameters));
    return id;
  });

  ipcMain.handle('scenario:load', async (_event, id: string) => {
    const row = dbManager.loadScenario(id);
    if (!row) {
      throw new Error(`Scenario not found: ${id}`);
    }
    return {
      id: row.id,
      modelId: row.model_id,
      name: row.name,
      parameters: JSON.parse(row.parameters_json),
      createdAt: row.created_at,
    };
  });

  ipcMain.handle('scenario:list', async (_event, modelId?: string) => {
    const scenarios = dbManager.listScenarios(modelId);
    return scenarios.map(s => ({
      id: s.id,
      name: s.name,
      modelId: s.model_id,
      createdAt: s.created_at,
      hasResults: false, // TODO: Check if results exist
    }));
  });

  ipcMain.handle('scenario:delete', async (_event, id: string) => {
    dbManager.deleteScenario(id);
  });

  ipcMain.handle('scenario:compare', async (_event, ids: string[]) => {
    const scenarios = ids.map(id => {
      const row = dbManager.loadScenario(id);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        modelId: row.model_id,
        createdAt: row.created_at,
      };
    }).filter(Boolean);

    // Load KPIs for each scenario's most recent completed run
    const scenarioKpis: Array<{ scenarioId: string; kpis: Record<string, unknown> }> = [];
    for (const id of ids) {
      const run = dbManager.getSimulationRunByScenario(id);
      if (run?.kpis_json) {
        try {
          scenarioKpis.push({ scenarioId: id, kpis: JSON.parse(run.kpis_json) });
        } catch {
          // Skip scenarios with invalid KPI data
        }
      }
    }

    // Build kpiComparison array
    interface KpiEntry {
      kpiName: string;
      values: Array<{ scenarioId: string; value: number }>;
      min: number;
      max: number;
      range: number;
      percentChange: number | null;
    }

    const kpiComparison: KpiEntry[] = [];

    const kpiExtractors: Array<{ name: string; extract: (kpis: Record<string, unknown>) => number | undefined }> = [
      {
        name: 'OEE',
        extract: (kpis) => {
          const oee = kpis.oee as Record<string, unknown> | undefined;
          return oee?.overall as number | undefined;
        },
      },
      {
        name: 'Throughput',
        extract: (kpis) => {
          const throughput = kpis.throughput as Record<string, unknown> | undefined;
          return (throughput?.total ?? throughput?.totalParts ?? throughput?.completedParts) as number | undefined;
        },
      },
      {
        name: 'Avg Cycle Time',
        extract: (kpis) => {
          const cycleTime = kpis.cycleTime as Record<string, unknown> | undefined;
          return (cycleTime?.average ?? cycleTime?.mean) as number | undefined;
        },
      },
      {
        name: 'Total WIP',
        extract: (kpis) => {
          const wip = kpis.wip as Record<string, unknown> | undefined;
          return (wip?.average ?? wip?.current ?? wip?.total) as number | undefined;
        },
      },
    ];

    for (const { name, extract } of kpiExtractors) {
      const values: Array<{ scenarioId: string; value: number }> = [];
      for (const { scenarioId, kpis } of scenarioKpis) {
        const value = extract(kpis);
        if (value !== undefined) {
          values.push({ scenarioId, value });
        }
      }

      if (values.length === 0) continue;

      const nums = values.map(v => v.value);
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const baseline = values[0]?.value;
      const last = values[values.length - 1]?.value;
      const percentChange = baseline && baseline !== 0
        ? ((last - baseline) / baseline) * 100
        : null;

      kpiComparison.push({ kpiName: name, values, min, max, range: max - min, percentChange });
    }

    return {
      scenarios,
      kpiComparison,
      statisticalTests: [],
    };
  });

  // ============ Data Handlers ============

  ipcMain.handle('data:importCSV', async (_event, filePath: string, options: object) => {
    return pythonBridge.importCSV(filePath, options);
  });

  ipcMain.handle('data:importExcel', async (_event, filePath: string, options: object) => {
    return pythonBridge.importExcel(filePath, options);
  });

  ipcMain.handle('data:exportReport', async (_event, runId: string, format: string) => {
    const savePath = await dialog.showSaveDialog({
      title: 'Export Report',
      defaultPath: `simulation-report.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] },
      ],
    });

    if (savePath.canceled || !savePath.filePath) {
      throw new Error('Export cancelled');
    }

    const run = dbManager.getSimulationRun(runId);
    if (!run) {
      throw new Error(`Simulation run not found: ${runId}`);
    }

    const kpis = run.kpis_json ? JSON.parse(run.kpis_json) : {};

    if (format === 'json') {
      const report = {
        runId: run.id,
        modelId: run.model_id,
        scenarioId: run.scenario_id,
        status: run.status,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        kpis,
      };
      fs.writeFileSync(savePath.filePath, JSON.stringify(report, null, 2), 'utf-8');
    } else if (format === 'csv') {
      const lines: string[] = [];

      // Section 1: Summary
      lines.push('Section,Metric,Value');
      const oee = kpis.oee || {};
      lines.push(`Summary,OEE,${oee.overall ?? ''}`);
      lines.push(`Summary,Availability,${oee.availability ?? ''}`);
      lines.push(`Summary,Performance,${oee.performance ?? ''}`);
      lines.push(`Summary,Quality,${oee.quality ?? ''}`);

      const throughput = kpis.throughput || {};
      lines.push(`Summary,Throughput,${throughput.total ?? throughput.totalParts ?? throughput.completedParts ?? ''}`);

      const cycleTime = kpis.cycleTime || {};
      lines.push(`Summary,Avg Cycle Time,${cycleTime.average ?? cycleTime.mean ?? ''}`);

      const wip = kpis.wip || {};
      lines.push(`Summary,Avg WIP,${wip.average ?? wip.current ?? ''}`);

      // Section 2: Station Utilization
      const utilization = kpis.utilization || {};
      const byStation = utilization.byStation || {};
      const stationIds = Object.keys(byStation);
      if (stationIds.length > 0) {
        lines.push('');
        lines.push('Station,Busy,Idle,Blocked,Starved,Failed');
        for (const stationId of stationIds) {
          const s = byStation[stationId];
          lines.push(`${stationId},${s.busy ?? s.processing ?? ''},${s.idle ?? ''},${s.blocked ?? ''},${s.starved ?? ''},${s.failed ?? ''}`);
        }
      }

      // Section 3: Hourly Throughput
      const hourly = throughput.hourly || throughput.timeSeries || [];
      if (Array.isArray(hourly) && hourly.length > 0) {
        lines.push('');
        lines.push('Hour,Throughput');
        for (const entry of hourly) {
          const hour = entry.hour ?? entry.time ?? entry.t ?? '';
          const value = entry.count ?? entry.throughput ?? entry.value ?? '';
          lines.push(`${hour},${value}`);
        }
      }

      fs.writeFileSync(savePath.filePath, lines.join('\n'), 'utf-8');
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    return savePath.filePath;
  });

  // Returns offline status — connector integration (MES/MQTT/OPC-UA) is optional
  // and site-specific. Override this handler when adding a real connector.
  ipcMain.handle('data:syncStatus', async () => {
    return {
      connected: false,
      lastSync: null,
      nextSync: null,
      connectorType: null,
    };
  });

  // Connector configuration placeholder — implement when adding a real
  // data connector (MES, MQTT, OPC-UA, etc.).
  ipcMain.handle('data:configureSync', async (_event, _config: object) => {
    // No-op until a connector is integrated
  });

  // ============ Template Handlers ============

  ipcMain.handle('template:list', async (_event, category?: string) => {
    return dbManager.listTemplates(category);
  });

  ipcMain.handle('template:load', async (_event, id: string) => {
    const template = dbManager.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      template: JSON.parse(template.template_json),
    };
  });

  // ============ Dialog Handlers ============

  ipcMain.handle('dialog:open', async (_event, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths;
  });

  ipcMain.handle('dialog:save', async (_event, options: Electron.SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(options);
    return result.canceled ? undefined : result.filePath;
  });

  ipcMain.handle('dialog:message', async (_event, options: Electron.MessageBoxOptions) => {
    const result = await dialog.showMessageBox(options);
    return result.response;
  });

  // ============ App Handlers ============

  ipcMain.on('app:version', (event) => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
    );
    event.returnValue = packageJson.version;
  });

  ipcMain.handle('app:userDataPath', async () => {
    const { app } = await import('electron');
    return app.getPath('userData');
  });

  // ============ Code Execution (Advanced) ============

  ipcMain.handle('code:execute', async (_event, code: string) => {
    return pythonBridge.executeCode(code);
  });

  ipcMain.handle('code:exportModel', async (_event, model: object, options?: object) => {
    return pythonBridge.exportToPython(model, options);
  });

  // ============ Artifact Handlers ============

  ipcMain.handle('artifacts:saveRunBundle', async (_event, bundle: {
    folderName: string;
    files: Array<{ name: string; content: string; encoding?: string }>;
  }) => {
    const { app: electronApp } = await import('electron');
    const userDataPath = electronApp.getPath('userData');
    const runsDir = path.join(userDataPath, 'runs');
    const runDir = path.join(runsDir, bundle.folderName);

    // Ensure directories exist
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Write each file
    for (const file of bundle.files) {
      const filePath = path.join(runDir, file.name);
      if (file.encoding === 'base64') {
        // Strip data URL prefix if present
        const base64Data = file.content.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      } else {
        fs.writeFileSync(filePath, file.content, 'utf-8');
      }
    }

    return runDir;
  });

  ipcMain.handle('artifacts:openRunFolder', async (_event, folderPath: string) => {
    shell.openPath(folderPath);
  });

  // ============ Help Handlers ============

  ipcMain.handle('help:open', async () => {
    const { app: electronApp } = await import('electron');
    const isDev = !electronApp.isPackaged;
    const helpPath = isDev
      ? path.join(__dirname, '../../public/help.html')
      : path.join(__dirname, '../renderer/help.html');
    shell.openPath(helpPath);
  });

  ipcMain.handle('artifacts:listRuns', async () => {
    const { app: electronApp } = await import('electron');
    const userDataPath = electronApp.getPath('userData');
    const runsDir = path.join(userDataPath, 'runs');

    if (!fs.existsSync(runsDir)) {
      return [];
    }

    const entries = fs.readdirSync(runsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        path: path.join(runsDir, e.name),
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first
  });

  // Load animation frames + sidecars from a run folder for replay
  ipcMain.handle('artifacts:loadRunFrames', async (_event, runPath: string) => {
    if (!fs.existsSync(runPath)) return { frames: [] };

    const files = fs.readdirSync(runPath);
    const framePngs = files.filter(f => f.startsWith('animation-frame-') && f.endsWith('.png')).sort();

    const frames: Array<{
      progress: number;
      imageBase64: string;
      sidecar: Record<string, unknown> | null;
    }> = [];

    for (const png of framePngs) {
      const pctMatch = png.match(/animation-frame-(\d+)pct\.png/);
      if (!pctMatch) continue;
      const pct = parseInt(pctMatch[1], 10);

      // Read PNG as base64
      const imageBuffer = fs.readFileSync(path.join(runPath, png));
      const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      // Read corresponding JSON sidecar if it exists
      const jsonName = png.replace('.png', '.json');
      let sidecar: Record<string, unknown> | null = null;
      const jsonPath = path.join(runPath, jsonName);
      if (fs.existsSync(jsonPath)) {
        try {
          sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch { /* skip */ }
      }

      frames.push({ progress: pct, imageBase64, sidecar });
    }

    // Also include JSON-only sidecars (frames without PNGs, e.g. data-only captures)
    const existingPcts = new Set(frames.map(f => f.progress));
    const jsonFiles = files.filter(f => f.startsWith('animation-frame-') && f.endsWith('.json')).sort();
    for (const jsonFile of jsonFiles) {
      const pctMatch = jsonFile.match(/animation-frame-(\d+)pct\.json/);
      if (!pctMatch) continue;
      const pct = parseInt(pctMatch[1], 10);
      if (existingPcts.has(pct)) continue; // already have a PNG frame for this
      let sidecar: Record<string, unknown> | null = null;
      try {
        sidecar = JSON.parse(fs.readFileSync(path.join(runPath, jsonFile), 'utf-8'));
      } catch { /* skip */ }
      if (sidecar) {
        frames.push({ progress: pct, imageBase64: '', sidecar });
      }
    }
    // Re-sort by progress after merging
    frames.sort((a, b) => a.progress - b.progress);

    // Also load run-info.json if present
    let runInfo: Record<string, unknown> | null = null;
    const runInfoPath = path.join(runPath, 'run-info.json');
    if (fs.existsSync(runInfoPath)) {
      try {
        runInfo = JSON.parse(fs.readFileSync(runInfoPath, 'utf-8'));
      } catch { /* skip */ }
    }

    // Also load model.json for live replay rendering
    let model: Record<string, unknown> | null = null;
    const modelPath = path.join(runPath, 'model.json');
    if (fs.existsSync(modelPath)) {
      try {
        model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
      } catch { /* skip */ }
    }

    return { frames, runInfo, model };
  });

  // Load event log from a run folder for event-driven replay
  ipcMain.handle('artifacts:loadRunEventLog', async (_event, runPath: string) => {
    if (!fs.existsSync(runPath)) return { events: [], runInfo: null, model: null };

    // Load event log
    let events: unknown[] = [];
    const eventLogPath = path.join(runPath, 'event-log.json');
    if (fs.existsSync(eventLogPath)) {
      try {
        events = JSON.parse(fs.readFileSync(eventLogPath, 'utf-8'));
      } catch { /* skip */ }
    }

    // Load run-info.json
    let runInfo: Record<string, unknown> | null = null;
    const runInfoPath = path.join(runPath, 'run-info.json');
    if (fs.existsSync(runInfoPath)) {
      try {
        runInfo = JSON.parse(fs.readFileSync(runInfoPath, 'utf-8'));
      } catch { /* skip */ }
    }

    // Load model.json
    let model: Record<string, unknown> | null = null;
    const modelPath = path.join(runPath, 'model.json');
    if (fs.existsSync(modelPath)) {
      try {
        model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
      } catch { /* skip */ }
    }

    return { events, runInfo, model };
  });
}
