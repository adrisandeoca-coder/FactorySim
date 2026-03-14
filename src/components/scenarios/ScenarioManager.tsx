import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useSimulationStore } from '../../stores/simulationStore';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import type { Scenario, ScenarioParameterOverride, SimulationResult } from '../../types';
import { applyOverrides, getNestedValue, getParametersForEntityType } from '../../services/scenarioModelBuilder';
import { captureScreenshot, captureToBase64, downloadEventLog, downloadEventLogCSV } from '../../services/screenshotService';
import { saveRunArtifacts } from '../../services/artifactService';
import { captureAllTabScreenshots } from '../../services/tabScreenshotCapture';
import { registerElement, setCachedImage, clearCachedImage, getElement, getCachedImage } from '../../services/elementRegistry';
import { v4 as uuidv4 } from 'uuid';
import { Camera, AlertTriangle, TrendingUp, Clock, Box, FolderOpen, Trash2, X, Shield, Zap, Maximize2, Truck, Wrench, TrendingDown } from 'lucide-react';

const SCENARIO_SEED = 42; // fixed seed for reproducible baseline comparisons

// Per-scenario simulation durations (in seconds)
const SCENARIO_DURATIONS: Record<string, number> = {
  'machine-failure': 28800,           // 8h — failures happen quickly
  'demand-increase': 28800,           // 8h
  'add-shift': 86400,                 // 24h — need a full day to see shift effects
  'reduce-batch': 28800,              // 8h
  'quality-drop': 28800,              // 8h
  'slower-cycle': 28800,              // 8h
  'bigger-buffers': 28800,            // 8h
  'supply-disruption': 28800,         // 8h
  'preventive-maintenance': 604800,   // 7 days — MTBF is long, need time for failures
  'speed-boost': 28800,               // 8h
};
const DEFAULT_SCENARIO_DURATION = 28800;

export function ScenarioManager() {
  const { scenarios, addScenario, removeScenario, updateScenarioResults, selectedScenarioIds, selectScenario, deselectScenario, comparisonMode, toggleComparisonMode } = useSimulationStore();
  const { model } = useModelStore();
  const { addToast } = useAppStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQuickScenario, setShowQuickScenario] = useState(false);
  const [activeQuickScenario, setActiveQuickScenario] = useState<string | null>(null);
  const [quickScenarioResults, setQuickScenarioResults] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  const [runAllProgress, setRunAllProgress] = useState<{ current: number; total: number } | null>(null);
  const runAllCancelRef = useRef(false);
  const scenarioRef = useRef<HTMLDivElement>(null);
  const quickResultsRef = useRef<HTMLDivElement>(null);

  // Context-aware scenario relevance check
  const isScenarioRelevant = (scenarioId: string): boolean => {
    switch (scenarioId) {
      case 'reduce-batch':
        return (model.stations || []).some(s => (s.batchSize ?? 1) > 1);
      case 'machine-failure':
      case 'preventive-maintenance':
        return (model.stations || []).some(s => s.mtbf != null && s.mtbf > 0);
      case 'add-shift':
        return (model.stations || []).some(s => (s as any).shiftSchedule != null);
      default:
        return true;
    }
  };

  const stationCount = model.stations?.length || 1;
  const getEstimate = (scenarioId: string): string => {
    const duration = SCENARIO_DURATIONS[scenarioId] || DEFAULT_SCENARIO_DURATION;
    const estSeconds = Math.max(1, Math.round(stationCount * duration / 10000));
    return estSeconds >= 60 ? `~${Math.round(estSeconds / 60)}m` : `~${estSeconds}s`;
  };

  // Register scenarios tab for cross-tab screenshot capture
  useEffect(() => {
    registerElement('scenarios-tab', scenarioRef.current);
    return () => {
      if (scenarioRef.current) {
        captureToBase64(scenarioRef.current)
          .then((base64) => setCachedImage('scenarios-tab', base64))
          .catch(() => {});
      }
      registerElement('scenarios-tab', null);
    };
  }, []);

  // Cache quick scenario results panel as "dashboard" screenshot for artifact saving
  useEffect(() => {
    if (!quickScenarioResults || isRunning) return;
    const timer = setTimeout(() => {
      if (quickResultsRef.current) {
        captureToBase64(quickResultsRef.current)
          .then((base64) => setCachedImage('dashboard', base64))
          .catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [quickScenarioResults, isRunning]);

  // New scenario form state
  const [newScenarioName, setNewScenarioName] = useState('');
  const [scenarioDuration, setScenarioDuration] = useState(28800);
  const [overrides, setOverrides] = useState<ScenarioParameterOverride[]>([]);
  const [applyToAll, setApplyToAll] = useState<Record<number, boolean>>({});

  const resetCreateForm = () => {
    setNewScenarioName('');
    setScenarioDuration(28800);
    setOverrides([]);
    setApplyToAll({});
  };

  // Extra node types that can appear in the entity type dropdown
  const EXTRA_NODE_TYPES = ['conveyor', 'inspection', 'assembly', 'splitter', 'merge', 'disassembly', 'palletize', 'depalletize', 'matchbuffer'] as const;

  // Get all entity options for a given type
  const getEntitiesForType = (entityType: string) => {
    switch (entityType) {
      case 'station':
        return model.stations.map((s) => ({ id: s.id, name: s.name }));
      case 'buffer':
        return model.buffers.map((b) => ({ id: b.id, name: b.name }));
      case 'source':
        return model.extraNodes
          .filter((n) => n.type === 'source')
          .map((n) => ({ id: n.id, name: n.data.name }));
      case 'product':
        return model.products.map((p) => ({ id: p.id, name: p.name }));
      default:
        // Handle extra node types (conveyor, inspection, assembly, etc.)
        return model.extraNodes
          .filter((n) => n.type === entityType)
          .map((n) => ({ id: n.id, name: n.data.name }));
    }
  };

  // Build entity type options dynamically — only show types that exist in the model
  const getEntityTypeOptions = () => {
    const options: { value: string; label: string }[] = [];
    if (model.stations.length > 0) options.push({ value: 'station', label: 'Station' });
    if (model.buffers.length > 0) options.push({ value: 'buffer', label: 'Buffer' });
    if (model.extraNodes.some((n) => n.type === 'source')) options.push({ value: 'source', label: 'Source' });
    if (model.products.length > 0) options.push({ value: 'product', label: 'Product' });
    for (const t of EXTRA_NODE_TYPES) {
      if (model.extraNodes.some((n) => n.type === t)) {
        const label = t.charAt(0).toUpperCase() + t.slice(1).replace(/buffer/i, ' Buffer');
        options.push({ value: t, label });
      }
    }
    return options;
  };

  // Get original value for a specific entity+parameter
  const getOriginalValue = (entityType: string, entityId: string, parameter: string): unknown => {
    let entity: any;
    switch (entityType) {
      case 'station':
        entity = model.stations.find((s) => s.id === entityId);
        break;
      case 'buffer':
        entity = model.buffers.find((b) => b.id === entityId);
        break;
      case 'source':
        entity = model.extraNodes.find((n) => n.id === entityId)?.data;
        break;
      case 'product':
        entity = model.products.find((p) => p.id === entityId);
        break;
      default:
        // Extra node types — value lives in node.data
        entity = model.extraNodes.find((n) => n.id === entityId && n.type === entityType)?.data;
        break;
    }
    return entity ? getNestedValue(entity, parameter) : undefined;
  };

  const addOverride = () => {
    const entityType = 'station';
    const entities = getEntitiesForType(entityType);
    const params = getParametersForEntityType(entityType);

    if (entities.length === 0 || params.length === 0) {
      addToast({ type: 'warning', message: 'No stations available to override. Add stations first.' });
      return;
    }

    const firstEntity = entities[0];
    const firstParam = params[0];
    const originalValue = getOriginalValue(entityType, firstEntity.id, firstParam.key);

    setOverrides([
      ...overrides,
      {
        entityType: entityType as any,
        entityId: firstEntity.id,
        entityName: firstEntity.name,
        parameter: firstParam.key,
        originalValue,
        overrideValue: originalValue ?? 0,
      },
    ]);
  };

  const updateOverride = (index: number, updates: Partial<ScenarioParameterOverride>) => {
    const newOverrides = [...overrides];
    newOverrides[index] = { ...newOverrides[index], ...updates };
    setOverrides(newOverrides);
  };

  const removeOverride = (index: number) => {
    setOverrides(overrides.filter((_, i) => i !== index));
  };

  // Run simulation via Python engine
  const runSimulation = async (modifiedModel: any, scenarioId: string, duration: number = 28800) => {
    setIsRunning(true);
    setRunningScenarioId(scenarioId);
    clearCachedImage('dashboard');
    clearCachedImage('code-editor-tab');
    clearCachedImage('orders-tab');

    // Pre-capture factory model screenshot NOW, before canvas may unmount
    let modelScreenshot: string | undefined;
    const factoryEl = getElement('factory-canvas');
    if (factoryEl) {
      try {
        modelScreenshot = await captureToBase64(factoryEl) || getCachedImage('factory-canvas') || undefined;
      } catch {
        modelScreenshot = getCachedImage('factory-canvas') || undefined;
      }
    } else {
      modelScreenshot = getCachedImage('factory-canvas') || undefined;
    }

    try {
      if (!window.factorySim?.simulation?.runSimulation) {
        throw new Error('Simulation engine not available');
      }

      const simOptions = { duration, warmupPeriod: 0, replications: 1, seed: SCENARIO_SEED };

      const result: SimulationResult = await window.factorySim.simulation.runSimulation(
        modifiedModel,
        simOptions
      );

      updateScenarioResults(scenarioId, result);
      addToast({ type: 'success', message: 'Simulation completed' });

      // Auto-save run artifacts — capture screenshot directly to avoid cache races
      setTimeout(async () => {
        let dashboardScreenshot: string | undefined;
        if (quickResultsRef.current) {
          try {
            dashboardScreenshot = await captureToBase64(quickResultsRef.current);
          } catch { /* non-critical */ }
        }
        try { await captureAllTabScreenshots(); } catch { /* non-critical */ }
        const scenario = scenarios.find(s => s.id === scenarioId);
        saveRunArtifacts({
          model: modifiedModel,
          result,
          simOptions,
          scenarioName: scenario?.name || scenarioId,
          dashboardScreenshot,
          modelScreenshot,
        }).then((savedPath) => {
          if (savedPath) {
            addToast({ type: 'info', message: 'Run artifacts saved' });
          }
        }).catch(() => {});
      }, 800);
    } catch (error) {
      addToast({ type: 'error', message: `Simulation error: ${error}` });
    } finally {
      setIsRunning(false);
      setRunningScenarioId(null);
    }
  };

  const handleCreateScenario = () => {
    if (!newScenarioName.trim()) {
      addToast({ type: 'warning', message: 'Please enter a scenario name' });
      return;
    }

    // Expand "apply to all" overrides into individual per-entity overrides
    const expandedOverrides: ScenarioParameterOverride[] = [];
    overrides.forEach((override, index) => {
      if (applyToAll[index]) {
        const entities = getEntitiesForType(override.entityType);
        entities.forEach((entity) => {
          const origVal = getOriginalValue(override.entityType, entity.id, override.parameter);
          expandedOverrides.push({
            ...override,
            entityId: entity.id,
            entityName: entity.name,
            originalValue: origVal,
          });
        });
      } else {
        expandedOverrides.push(override);
      }
    });

    const scenario: Scenario = {
      id: uuidv4(),
      modelId: model.id || 'current',
      name: newScenarioName,
      parameters: {
        stations: model.stations,
        buffers: model.buffers,
        connections: model.connections,
        duration: scenarioDuration,
      },
      overrides: expandedOverrides.length > 0 ? expandedOverrides : undefined,
      createdAt: new Date().toISOString(),
    };

    addScenario(scenario);

    // If there are overrides, automatically run the simulation
    if (expandedOverrides.length > 0) {
      const modifiedModel = applyOverrides(model, expandedOverrides);
      runSimulation(modifiedModel, scenario.id, scenarioDuration);
    }

    resetCreateForm();
    setShowCreateModal(false);
    addToast({ type: 'success', message: 'Scenario created' });
  };

  const handleRunScenario = (scenario: Scenario) => {
    const scenarioOverrides = scenario.overrides || [];
    const modifiedModel = applyOverrides(model, scenarioOverrides);
    const duration = (scenario.parameters as any)?.duration || DEFAULT_SCENARIO_DURATION;
    runSimulation(modifiedModel, scenario.id, duration);
  };

  const handleDeleteScenario = (id: string) => {
    removeScenario(id);
    addToast({ type: 'info', message: 'Scenario deleted' });
  };

  const handleToggleSelect = (id: string) => {
    if (selectedScenarioIds.includes(id)) {
      deselectScenario(id);
    } else {
      selectScenario(id);
    }
  };

  const handleRunQuickScenario = (scenarioId: string) => {
    setActiveQuickScenario(scenarioId);
    setShowQuickScenario(true);
    setIsRunning(true);
    setQuickScenarioResults(null);
    // Clear stale cached dashboard image from any previous scenario run,
    // so the fallback path in saveRunArtifacts can't pick up a wrong screenshot.
    clearCachedImage('dashboard');
    clearCachedImage('code-editor-tab');
    clearCachedImage('orders-tab');

    // Build overrides based on quick scenario type, then run through simulation
    const quickOverrides = buildQuickScenarioOverrides(scenarioId);
    const modifiedModel = applyOverrides(model, quickOverrides);

    // Run the simulation
    const runQuick = async () => {
      // Pre-capture factory model screenshot NOW, before canvas may unmount
      let quickModelScreenshot: string | undefined;
      const quickFactoryEl = getElement('factory-canvas');
      if (quickFactoryEl) {
        try {
          quickModelScreenshot = await captureToBase64(quickFactoryEl) || getCachedImage('factory-canvas') || undefined;
        } catch {
          quickModelScreenshot = getCachedImage('factory-canvas') || undefined;
        }
      } else {
        quickModelScreenshot = getCachedImage('factory-canvas') || undefined;
      }
      try {
        if (!window.factorySim?.simulation?.runSimulation) {
          throw new Error('Simulation engine not available');
        }

        const scenarioDuration = SCENARIO_DURATIONS[scenarioId] || DEFAULT_SCENARIO_DURATION;

        // Run scenario simulation (same seed for reproducibility)
        const result: SimulationResult = await window.factorySim.simulation.runSimulation(
          modifiedModel,
          { duration: scenarioDuration, warmupPeriod: 0, replications: 1, seed: SCENARIO_SEED }
        );

        // Run baseline simulation for comparison (same seed & duration)
        const baselineResult: SimulationResult = await window.factorySim.simulation.runSimulation(
          model,
          { duration: scenarioDuration, warmupPeriod: 0, replications: 1, seed: SCENARIO_SEED }
        );

        setQuickScenarioResults(
          formatQuickResults(scenarioId, baselineResult, result, scenarioDuration)
        );

        // Auto-save quick scenario artifacts.
        // Wait for React to render the results panel, then capture its screenshot
        // directly (bypassing the shared cache to avoid race conditions when
        // scenarios run in rapid succession).
        const snapshots = (result as any).diagSnapshots || [];
        setTimeout(async () => {
          let dashboardScreenshot: string | undefined;
          if (quickResultsRef.current) {
            try {
              dashboardScreenshot = await captureToBase64(quickResultsRef.current);
            } catch { /* non-critical */ }
          }
          try { await captureAllTabScreenshots(); } catch { /* non-critical */ }
          saveRunArtifacts({
            model: modifiedModel,
            result,
            simOptions: { duration: scenarioDuration, warmupPeriod: 0, replications: 1, seed: SCENARIO_SEED },
            scenarioName: `quick_${scenarioId}`,
            dashboardScreenshot,
            modelScreenshot: quickModelScreenshot,
            diagSnapshots: snapshots,
          }).then((savedPath) => {
            if (savedPath) {
              addToast({ type: 'info', message: 'Run artifacts saved' });
            }
          }).catch(() => {});
        }, 800);
      } catch (error) {
        addToast({ type: 'error', message: `Simulation error: ${error}` });
        setShowQuickScenario(false);
      } finally {
        setIsRunning(false);
      }
    };

    runQuick();
  };

  const buildQuickScenarioOverrides = (scenarioId: string): ScenarioParameterOverride[] => {
    const overrides: ScenarioParameterOverride[] = [];

    switch (scenarioId) {
      case 'machine-failure':
        // Reduce MTBF on first station to simulate frequent failures
        if (model.stations.length > 0) {
          const targetStation = model.stations[0];
          overrides.push({
            entityType: 'station',
            entityId: targetStation.id,
            entityName: targetStation.name,
            parameter: 'mtbf',
            originalValue: targetStation.mtbf || 100,
            overrideValue: 0.1, // 6 min MTBF = very frequent failures (~10/hr)
          });
          overrides.push({
            entityType: 'station',
            entityId: targetStation.id,
            entityName: targetStation.name,
            parameter: 'mttr',
            originalValue: targetStation.mttr || 1,
            overrideValue: 0.05, // 3 min mean repair time
          });
        }
        break;

      case 'demand-increase':
        // Increase arrival rate by 20% on all products
        model.products.forEach((p) => {
          const currentRate = p.arrivalRate || 120;
          overrides.push({
            entityType: 'product',
            entityId: p.id,
            entityName: p.name,
            parameter: 'arrivalRate',
            originalValue: currentRate,
            overrideValue: Math.round(currentRate * 0.8), // faster arrivals = more demand
          });
        });
        // Also adjust source nodes
        model.extraNodes.filter((n) => n.type === 'source').forEach((n) => {
          const data = n.data as any;
          overrides.push({
            entityType: 'source',
            entityId: n.id,
            entityName: data.name,
            parameter: 'arrivalRate',
            originalValue: data.arrivalRate || 120,
            overrideValue: Math.round((data.arrivalRate || 120) * 0.8),
          });
        });
        break;

      case 'add-shift':
        // Add actual shift schedules to stations
        model.stations.forEach((s) => {
          const existingShifts = s.shifts || [];
          if (existingShifts.length >= 2) return; // Already has 2+ shifts, skip

          let newShifts;
          if (existingShifts.length === 0) {
            // No shifts (24/7) -> add two 8-hour weekday shifts
            newShifts = [
              { name: 'Day Shift', startHour: 6, endHour: 14, days: [0, 1, 2, 3, 4] },
              { name: 'Evening Shift', startHour: 14, endHour: 22, days: [0, 1, 2, 3, 4] },
            ];
          } else {
            // Has 1 shift -> add a second adjacent shift
            const existing = existingShifts[0];
            const nextStart = existing.endHour;
            const nextEnd = Math.min(nextStart + 8, 24);
            newShifts = [
              ...existingShifts,
              { name: 'Added Shift', startHour: nextStart, endHour: nextEnd, days: existing.days },
            ];
          }

          overrides.push({
            entityType: 'station',
            entityId: s.id,
            entityName: s.name,
            parameter: 'shifts',
            originalValue: existingShifts.length > 0 ? existingShifts : undefined,
            overrideValue: newShifts,
          });
        });
        break;

      case 'reduce-batch':
        // Reduce batch size on stations — halve any existing batchSize,
        // or set batchSize=1 (pure one-piece flow) if none is configured.
        // Also halve buffer capacities to reflect smaller lot WIP.
        model.stations.forEach((s) => {
          const currentBatch = s.batchSize || 1;
          overrides.push({
            entityType: 'station',
            entityId: s.id,
            entityName: s.name,
            parameter: 'batchSize',
            originalValue: currentBatch,
            overrideValue: Math.max(1, Math.floor(currentBatch / 2)),
          });
        });
        model.buffers.forEach((b) => {
          overrides.push({
            entityType: 'buffer',
            entityId: b.id,
            entityName: b.name,
            parameter: 'capacity',
            originalValue: b.capacity,
            overrideValue: Math.max(1, Math.floor(b.capacity / 2)),
          });
        });
        break;

      case 'quality-drop':
        // Increase scrap rate on all stations to simulate quality degradation
        model.stations.forEach((s) => {
          const currentScrap = (s as any).scrapRate || 0;
          overrides.push({
            entityType: 'station',
            entityId: s.id,
            entityName: s.name,
            parameter: 'scrapRate',
            originalValue: currentScrap,
            overrideValue: Math.min(1, currentScrap + 0.1), // +10% scrap rate
          });
        });
        break;

      case 'slower-cycle':
        // Increase cycle times by 30% on all stations
        model.stations.forEach((s) => {
          const dist = s.cycleTime;
          if (dist && typeof dist === 'object') {
            const params = { ...dist.parameters };
            if (params.mean != null) params.mean = +(Number(params.mean) * 1.3).toFixed(2);
            if (params.value != null) params.value = +(Number(params.value) * 1.3).toFixed(2);
            if (params.min != null) params.min = +(Number(params.min) * 1.3).toFixed(2);
            if (params.max != null) params.max = +(Number(params.max) * 1.3).toFixed(2);
            overrides.push({
              entityType: 'station',
              entityId: s.id,
              entityName: s.name,
              parameter: 'cycleTime',
              originalValue: dist,
              overrideValue: { ...dist, parameters: params },
            });
          }
        });
        break;

      case 'bigger-buffers':
        // Double buffer capacities to reduce blocking
        model.buffers.forEach((b) => {
          overrides.push({
            entityType: 'buffer',
            entityId: b.id,
            entityName: b.name,
            parameter: 'capacity',
            originalValue: b.capacity,
            overrideValue: b.capacity * 2,
          });
        });
        break;

      case 'supply-disruption':
        // Slow arrivals by 50% (double inter-arrival time)
        model.products.forEach((p) => {
          const currentRate = p.arrivalRate || 120;
          overrides.push({
            entityType: 'product',
            entityId: p.id,
            entityName: p.name,
            parameter: 'arrivalRate',
            originalValue: currentRate,
            overrideValue: Math.round(currentRate * 2), // slower = longer inter-arrival
          });
        });
        model.extraNodes.filter((n) => n.type === 'source').forEach((n) => {
          const data = n.data as any;
          overrides.push({
            entityType: 'source',
            entityId: n.id,
            entityName: data.name,
            parameter: 'arrivalRate',
            originalValue: data.arrivalRate || 120,
            overrideValue: Math.round((data.arrivalRate || 120) * 2),
          });
        });
        break;

      case 'preventive-maintenance':
        // Better MTBF (3x) but add scheduled maintenance windows via shifts
        model.stations.forEach((s) => {
          const currentMtbf = (s as any).mtbf || 100;
          overrides.push({
            entityType: 'station',
            entityId: s.id,
            entityName: s.name,
            parameter: 'mtbf',
            originalValue: currentMtbf,
            overrideValue: +(currentMtbf * 3).toFixed(1), // 3x more reliable
          });
          const currentMttr = (s as any).mttr || 1;
          overrides.push({
            entityType: 'station',
            entityId: s.id,
            entityName: s.name,
            parameter: 'mttr',
            originalValue: currentMttr,
            overrideValue: +(currentMttr * 0.5).toFixed(2), // faster repairs
          });
        });
        break;

      case 'speed-boost':
        // 25% faster processing on the bottleneck station (longest cycle time)
        if (model.stations.length > 0) {
          const bottleneck = model.stations.reduce((worst, s) => {
            const getMean = (st: typeof s) => {
              const p = st.cycleTime?.parameters;
              if (!p) return 0;
              return Number(p.mean ?? p.value ?? p.mode ?? 0);
            };
            return getMean(s) > getMean(worst) ? s : worst;
          }, model.stations[0]);
          const dist = bottleneck.cycleTime;
          if (dist && typeof dist === 'object') {
            const params = { ...dist.parameters };
            if (params.mean != null) params.mean = +(Number(params.mean) * 0.75).toFixed(2);
            if (params.value != null) params.value = +(Number(params.value) * 0.75).toFixed(2);
            if (params.min != null) params.min = +(Number(params.min) * 0.75).toFixed(2);
            if (params.max != null) params.max = +(Number(params.max) * 0.75).toFixed(2);
            overrides.push({
              entityType: 'station',
              entityId: bottleneck.id,
              entityName: bottleneck.name,
              parameter: 'cycleTime',
              originalValue: dist,
              overrideValue: { ...dist, parameters: params },
            });
          }
        }
        break;
    }

    return overrides;
  };

  const formatQuickResults = (
    scenarioId: string,
    baseline: SimulationResult,
    scenario: SimulationResult,
    duration: number = DEFAULT_SCENARIO_DURATION
  ): Record<string, unknown> => {
    const titles: Record<string, string> = {
      'machine-failure': 'Machine Failure Impact',
      'demand-increase': 'Demand Increase Analysis',
      'add-shift': 'Additional Shift Analysis',
      'reduce-batch': 'Batch Size Reduction',
      'quality-drop': 'Quality Degradation Impact',
      'slower-cycle': 'Cycle Time Increase Analysis',
      'bigger-buffers': 'Buffer Capacity Expansion',
      'supply-disruption': 'Supply Disruption Impact',
      'preventive-maintenance': 'Preventive Maintenance Trade-off',
      'speed-boost': 'Machine Speed Investment',
    };

    const failureTarget = model.stations.length > 0 ? model.stations[0].name : 'first station';
    const descriptions: Record<string, string> = {
      'machine-failure': `Frequent breakdowns on ${failureTarget} (MTBF 6min, MTTR 3min)`,
      'demand-increase': 'Simulated 20% increase in product arrival rate',
      'add-shift': 'Added shift schedules to stations for extended operating hours',
      'reduce-batch': 'Halved batch sizes on all stations and reduced buffer capacities by 50%',
      'quality-drop': 'Simulated +10% scrap rate on all stations',
      'slower-cycle': 'Simulated 30% slower processing across all stations',
      'bigger-buffers': 'Doubled all buffer capacities to reduce blocking',
      'supply-disruption': 'Simulated 50% slower material arrivals (supply shortage)',
      'preventive-maintenance': 'Traded scheduled maintenance for 3x higher MTBF and 50% faster repairs',
      'speed-boost': 'Simulated 25% faster processing on bottleneck station',
    };

    const baseKpis = {
      oee: +(baseline.kpis.oee.overall * 100).toFixed(1),
      throughput: baseline.kpis.throughput.total,
      cycleTime: +baseline.kpis.cycleTime.mean.toFixed(0),
      wip: baseline.kpis.wip.total,
    };

    const scenKpis = {
      oee: +(scenario.kpis.oee.overall * 100).toFixed(1),
      throughput: scenario.kpis.throughput.total,
      cycleTime: +scenario.kpis.cycleTime.mean.toFixed(0),
      wip: scenario.kpis.wip.total,
    };

    // Generate insights from actual differences
    const insights: Array<{ type: string; text: string }> = [];
    const oeeDiff = scenKpis.oee - baseKpis.oee;
    const tpDiff = scenKpis.throughput - baseKpis.throughput;
    const ctDiff = scenKpis.cycleTime - baseKpis.cycleTime;
    const wipDiff = scenKpis.wip - baseKpis.wip;

    if (Math.abs(oeeDiff) > 5) {
      // OEE can rise due to overload (stations saturated) — check if throughput/WIP degraded
      const systemDegraded = tpDiff < -20 || wipDiff > 10 || ctDiff > 100;
      if (oeeDiff > 5 && systemDegraded) {
        insights.push({
          type: 'warning',
          text: `OEE rises by ${Math.abs(oeeDiff).toFixed(1)}% due to station saturation, but system performance degrades`,
        });
      } else if (oeeDiff > 5 && ctDiff > 10) {
        // OEE rose because stations are busier (slower cycle times = less idle), not a real improvement
        insights.push({
          type: 'info',
          text: `OEE rises by ${Math.abs(oeeDiff).toFixed(1)}% because slower cycle times reduce idle ratio — not a system improvement`,
        });
      } else if (oeeDiff < -5 && tpDiff < -20) {
        // OEE dropped with throughput loss — supply disruption or capacity loss
        insights.push({
          type: 'critical',
          text: `OEE drops by ${Math.abs(oeeDiff).toFixed(1)}% with throughput loss of ${Math.abs(tpDiff)} units`,
        });
      } else {
        insights.push({
          type: oeeDiff < -5 ? 'critical' : 'success',
          text: `OEE ${oeeDiff > 0 ? 'improves' : 'drops'} by ${Math.abs(oeeDiff).toFixed(1)}%`,
        });
      }
    } else if (Math.abs(oeeDiff) > 1) {
      insights.push({
        type: 'warning',
        text: `OEE changes by ${oeeDiff > 0 ? '+' : ''}${oeeDiff.toFixed(1)}%`,
      });
    }

    if (Math.abs(tpDiff) > 50) {
      insights.push({
        type: tpDiff > 0 ? 'success' : 'warning',
        text: `Throughput ${tpDiff > 0 ? 'increases' : 'decreases'} by ${Math.abs(tpDiff)} units`,
      });
    }

    if (Math.abs(ctDiff) > 10) {
      // If cycle time decreased but throughput also dropped significantly,
      // the decrease is survivorship bias (fewer parts flowing through a
      // less congested line), not a genuine improvement.
      const survivorshipBias = ctDiff < 0 && tpDiff < -10;
      insights.push({
        type: survivorshipBias ? 'warning' : (ctDiff > 0 ? 'warning' : 'success'),
        text: survivorshipBias
          ? `Cycle time decreases by ${Math.abs(ctDiff)}s, but only because throughput dropped — surviving parts flow faster through an emptier line (not a real improvement)`
          : `Cycle time ${ctDiff > 0 ? 'increases' : 'decreases'} by ${Math.abs(ctDiff)}s`,
      });
    }

    if (Math.abs(wipDiff) > 5) {
      insights.push({
        type: wipDiff > 0 ? 'warning' : 'success',
        text: `WIP ${wipDiff > 0 ? 'increases' : 'decreases'} by ${Math.abs(wipDiff)} items`,
      });
    }

    // Scenario-specific insights
    if (scenarioId === 'add-shift' && wipDiff > 20) {
      insights.push({
        type: 'warning',
        text: 'Source generates parts 24/7 but stations are shifted — demand exceeds shifted capacity, causing WIP buildup',
      });
    }

    if (scenarioId === 'preventive-maintenance' && Math.abs(oeeDiff) < 1 && Math.abs(tpDiff) < 5) {
      insights.push({
        type: 'info',
        text: `MTBF is much longer than the simulation duration — failures are statistically unlikely. Consider running a longer simulation.`,
      });
    }

    if ((scenarioId === 'reduce-batch' || scenarioId === 'bigger-buffers') &&
        Math.abs(oeeDiff) < 0.5 && Math.abs(tpDiff) < 5 && Math.abs(wipDiff) < 2) {
      insights.push({
        type: 'info',
        text: 'Buffer capacity changes had no observable impact — buffers rarely fill in this model',
      });
    }

    if (insights.length === 0) {
      insights.push({ type: 'info', text: 'Minimal impact detected with current configuration' });
    }

    return {
      title: titles[scenarioId] || 'Scenario Analysis',
      description: descriptions[scenarioId] || '',
      baseline: baseKpis,
      scenario: scenKpis,
      insights,
      recommendation: generateRecommendation(scenarioId, oeeDiff, tpDiff, wipDiff),
      simulationResult: scenario,
      simulatedDuration: duration,
    };
  };

  const generateRecommendation = (scenarioId: string, oeeDiff: number, tpDiff: number, wipDiff: number = 0): string => {
    switch (scenarioId) {
      case 'machine-failure':
        return oeeDiff < -10
          ? 'Significant impact detected. Consider adding redundancy or predictive maintenance.'
          : 'Moderate impact. Current buffer capacity helps absorb the disruption.';
      case 'demand-increase':
        return tpDiff > 0
          ? 'System can partially absorb the demand increase. Monitor bottleneck utilization closely.'
          : 'Capacity limit reached. Consider adding parallel stations at bottleneck.';
      case 'add-shift':
        return wipDiff > 20
          ? 'Note: Source/arrivals run 24/7 while stations are shifted. In production, match arrival rates to shifted capacity to avoid WIP buildup.'
          : 'Evaluate staffing costs against throughput gains for ROI analysis.';
      case 'reduce-batch':
        return 'Smaller batches improve flow but increase changeover frequency. Invest in quick changeover.';
      case 'quality-drop':
        return oeeDiff < -5
          ? 'Quality has major throughput impact. Invest in SPC, Poka-Yoke, or upstream inspection.'
          : 'System tolerates moderate scrap. Still worth monitoring first-pass yield.';
      case 'slower-cycle':
        return tpDiff < -50
          ? 'Cycle time is a critical lever. Prioritize time studies and process improvement (Kaizen).'
          : 'Moderate impact. System has some slack to absorb slower processing.';
      case 'bigger-buffers':
        return tpDiff > 50
          ? 'Larger buffers significantly reduce blocking. Consider expanding strategic buffer locations.'
          : 'Marginal gains from extra capacity. Bottleneck is elsewhere (machine speed or failures).';
      case 'supply-disruption':
        return tpDiff < -100
          ? 'Supply chain is a critical vulnerability. Build safety stock or diversify suppliers.'
          : 'System can partially absorb supply fluctuations. Monitor buffer levels in real-time.';
      case 'preventive-maintenance':
        return oeeDiff > 2
          ? 'Preventive maintenance pays off. Higher uptime outweighs the scheduled stops.'
          : 'Marginal gains. Current failure rates may already be manageable.';
      case 'speed-boost':
        return tpDiff > 50
          ? 'Speed investment shows strong ROI. Bottleneck station is the right target.'
          : 'Limited gains. The bottleneck may have shifted to another station or buffer.';
      default:
        return '';
    }
  };

  const guidedScenarios = [
    {
      id: 'machine-failure',
      name: 'What if a machine fails?',
      description: 'Simulate the impact of an unplanned machine breakdown',
      icon: WarningIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      id: 'demand-increase',
      name: 'What if demand increases 20%?',
      description: 'Test capacity with higher product arrival rates',
      icon: TrendUpIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      id: 'add-shift',
      name: 'What if we add a shift?',
      description: 'Evaluate the benefit of extended operating hours',
      icon: ClockIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      id: 'reduce-batch',
      name: 'What if we reduce batch size?',
      description: 'Analyze smaller batch production impact',
      icon: BoxIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      id: 'quality-drop',
      name: 'What if quality degrades?',
      description: 'Simulate higher scrap rates across all stations',
      icon: ShieldIcon,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      id: 'slower-cycle',
      name: 'What if cycle times increase?',
      description: 'Test impact of 30% slower processing on throughput',
      icon: TrendDownIcon,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    {
      id: 'bigger-buffers',
      name: 'What if we double buffer capacity?',
      description: 'Evaluate if larger buffers reduce blocking',
      icon: ExpandIcon,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      id: 'supply-disruption',
      name: 'What if supply slows down?',
      description: 'Simulate 50% slower material arrivals',
      icon: TruckIcon,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      id: 'preventive-maintenance',
      name: 'What if we add preventive maintenance?',
      description: 'Trade small scheduled stops for fewer breakdowns',
      icon: WrenchIcon,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      id: 'speed-boost',
      name: 'What if we invest in faster machines?',
      description: 'Simulate 25% faster processing on bottleneck station',
      icon: BoltIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
  ];

  // Get selected scenarios for comparison that have results
  const comparisonScenarios = selectedScenarioIds
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s): s is Scenario => s != null && s.results != null);

  const handleScreenshot = async () => {
    if (!scenarioRef.current) return;
    try {
      await captureScreenshot(scenarioRef.current, `scenarios-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`);
      addToast({ type: 'success', message: 'Screenshot saved' });
    } catch {
      addToast({ type: 'error', message: 'Failed to capture screenshot' });
    }
  };

  const handleDownloadScenarioLog = (scenario: Scenario, format: 'json' | 'csv') => {
    const events = scenario.results?.events;
    if (!events || events.length === 0) {
      addToast({ type: 'warning', message: 'No events in this scenario result' });
      return;
    }
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const safeName = scenario.name.replace(/[^a-zA-Z0-9]/g, '-');
    if (format === 'json') {
      downloadEventLog(events as unknown as Array<Record<string, unknown>>, `scenario-${safeName}-${ts}.json`);
    } else {
      downloadEventLogCSV(events as unknown as Array<Record<string, unknown>>, `scenario-${safeName}-${ts}.csv`);
    }
    addToast({ type: 'success', message: `Scenario log downloaded (${format.toUpperCase()})` });
  };

  return (
    <div className="space-y-6" ref={scenarioRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scenarios</h1>
          <p className="text-gray-500">Compare what-if scenarios and analyze results</p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleScreenshot}
            icon={<CameraIcon className="w-4 h-4" />}
          >
            Screenshot
          </Button>
          <Button
            variant={comparisonMode ? 'primary' : 'secondary'}
            onClick={toggleComparisonMode}
            disabled={selectedScenarioIds.length < 2}
          >
            {comparisonMode ? 'Exit Comparison' : 'Compare Selected'}
            {selectedScenarioIds.length > 0 && ` (${selectedScenarioIds.length})`}
          </Button>
          <Button onClick={() => { resetCreateForm(); setShowCreateModal(true); }}>
            + New Scenario
          </Button>
        </div>
      </div>

      {/* Guided Scenarios */}
      <Card>
        <CardHeader
          title="Quick Scenarios"
          subtitle="Pre-built templates for common what-if questions"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...guidedScenarios].sort((a, b) => {
            const aRel = isScenarioRelevant(a.id) ? 0 : 1;
            const bRel = isScenarioRelevant(b.id) ? 0 : 1;
            return aRel - bRel;
          }).map((scenario) => {
            const relevant = isScenarioRelevant(scenario.id);
            return (
              <button
                key={scenario.id}
                onClick={() => handleRunQuickScenario(scenario.id)}
                disabled={isRunning}
                className={`p-4 border border-gray-200 rounded-lg hover:border-blue-500 ${scenario.bgColor} hover:shadow-md transition-all text-left group disabled:opacity-50 ${!relevant ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <scenario.icon className={`w-8 h-8 ${scenario.color}`} />
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">{getEstimate(scenario.id)}</span>
                    <span className="text-xs text-gray-400 group-hover:text-blue-500">Click to run</span>
                  </div>
                </div>
                <div className="font-medium text-gray-900">{scenario.name}</div>
                <div className="text-sm text-gray-500 mt-1">{scenario.description}</div>
                {!relevant && <div className="text-xs text-gray-400 mt-1 italic">(not applicable to current model)</div>}
              </button>
            );
          })}
        </div>

        {/* Run All Quick Scenarios */}
        <div className="mt-4 flex items-center space-x-3">
          <Button
            variant="secondary"
            onClick={async () => {
              if (runAllProgress) {
                runAllCancelRef.current = true;
                return;
              }
              runAllCancelRef.current = false;
              const total = guidedScenarios.length;
              setRunAllProgress({ current: 0, total });
              for (let i = 0; i < total; i++) {
                if (runAllCancelRef.current) break;
                setRunAllProgress({ current: i + 1, total });
                await new Promise<void>((resolve) => {
                  const origOnComplete = handleRunQuickScenario;
                  origOnComplete(guidedScenarios[i].id);
                  // Wait for isRunning to become false
                  const check = setInterval(() => {
                    // Poll isRunning state — scenario run sets it false when done
                    if (!document.querySelector('[data-scenario-running="true"]')) {
                      clearInterval(check);
                      resolve();
                    }
                  }, 500);
                  // Safety timeout after 120s per scenario
                  setTimeout(() => { clearInterval(check); resolve(); }, 120000);
                });
              }
              setRunAllProgress(null);
              if (!runAllCancelRef.current) {
                addToast({ type: 'success', message: 'All quick scenarios completed' });
              }
            }}
            disabled={isRunning && !runAllProgress}
          >
            {runAllProgress
              ? `Running scenario ${runAllProgress.current} of ${runAllProgress.total}...`
              : 'Run All Quick Scenarios'}
          </Button>
          {runAllProgress && (
            <Button variant="ghost" size="sm" onClick={() => { runAllCancelRef.current = true; }}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      {/* Saved Scenarios */}
      <Card>
        <CardHeader
          title="Saved Scenarios"
          subtitle={`${scenarios.length} scenarios created`}
        />

        {scenarios.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FolderIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No scenarios saved yet.</p>
            <p className="text-sm">Create a scenario with parameter overrides to test different configurations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className={`p-4 border rounded-lg transition-colors ${
                  selectedScenarioIds.includes(scenario.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedScenarioIds.includes(scenario.id)}
                      onChange={() => handleToggleSelect(scenario.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{scenario.name}</div>
                      <div className="text-sm text-gray-500">
                        Created {new Date(scenario.createdAt).toLocaleDateString()}
                        {scenario.overrides && scenario.overrides.length > 0 && (
                          <span className="ml-2 text-blue-600">
                            ({scenario.overrides.length} override{scenario.overrides.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isRunning && runningScenarioId === scenario.id ? (
                      <div className="flex items-center space-x-2 text-sm text-blue-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                        <span>Running...</span>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRunScenario(scenario)}
                        disabled={isRunning}
                      >
                        Run
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteScenario(scenario.id)}
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Show overrides summary */}
                {scenario.overrides && scenario.overrides.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {scenario.overrides.map((o, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {o.entityName}: {o.parameter.split('.').pop()} = {String(o.overrideValue)}
                      </span>
                    ))}
                  </div>
                )}

                {scenario.results && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">OEE</div>
                        <div className="font-medium">{(scenario.results.kpis.oee.overall * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Throughput</div>
                        <div className="font-medium">{scenario.results.kpis.throughput.total} units</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Cycle Time</div>
                        <div className="font-medium">{scenario.results.kpis.cycleTime.mean.toFixed(0)}s</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center space-x-2">
                      <button
                        onClick={() => handleDownloadScenarioLog(scenario, 'json')}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Download Log (JSON)
                      </button>
                      <button
                        onClick={() => handleDownloadScenarioLog(scenario, 'csv')}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Download Log (CSV)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Comparison View - uses real scenario results */}
      {comparisonMode && comparisonScenarios.length >= 2 && (
        <Card>
          <CardHeader title="Scenario Comparison" />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {comparisonScenarios.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">OEE</td>
                  {comparisonScenarios.map((s) => (
                    <td key={s.id}>{(s.results!.kpis.oee.overall * 100).toFixed(1)}%</td>
                  ))}
                  <td className={getComparisonColor(
                    comparisonScenarios.map((s) => s.results!.kpis.oee.overall * 100),
                    true
                  )}>
                    {getComparisonDiff(comparisonScenarios.map((s) => s.results!.kpis.oee.overall * 100))}%
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">Throughput</td>
                  {comparisonScenarios.map((s) => (
                    <td key={s.id}>{s.results!.kpis.throughput.total.toLocaleString()} units</td>
                  ))}
                  <td className={getComparisonColor(
                    comparisonScenarios.map((s) => s.results!.kpis.throughput.total),
                    true
                  )}>
                    {getComparisonDiff(comparisonScenarios.map((s) => s.results!.kpis.throughput.total))} units
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">Avg Cycle Time</td>
                  {comparisonScenarios.map((s) => (
                    <td key={s.id}>{s.results!.kpis.cycleTime.mean.toFixed(0)}s</td>
                  ))}
                  <td className={getComparisonColor(
                    comparisonScenarios.map((s) => s.results!.kpis.cycleTime.mean),
                    false
                  )}>
                    {getComparisonDiff(comparisonScenarios.map((s) => s.results!.kpis.cycleTime.mean))}s
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">WIP Level</td>
                  {comparisonScenarios.map((s) => (
                    <td key={s.id}>{s.results!.kpis.wip.total} items</td>
                  ))}
                  <td className={getComparisonColor(
                    comparisonScenarios.map((s) => s.results!.kpis.wip.total),
                    false
                  )}>
                    {getComparisonDiff(comparisonScenarios.map((s) => s.results!.kpis.wip.total))} items
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {comparisonMode && comparisonScenarios.length < 2 && selectedScenarioIds.length >= 2 && (
        <Card>
          <div className="text-center py-8 text-gray-500">
            <p>Some selected scenarios don't have results yet.</p>
            <p className="text-sm">Run simulations on selected scenarios before comparing.</p>
          </div>
        </Card>
      )}

      {/* Create Scenario Modal with Parameter Overrides */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Scenario"
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Scenario Name</label>
            <input
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="e.g., Increased Capacity Test"
              className="input"
              autoFocus
            />
          </div>

          {/* Simulation Duration */}
          <div>
            <label className="input-label">Simulation Duration</label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min={1}
                step={1}
                className="input text-sm w-24"
                value={+(scenarioDuration / 3600).toFixed(2)}
                onChange={(e) => setScenarioDuration(Math.max(3600, Number(e.target.value) * 3600))}
              />
              <span className="text-sm text-gray-500">hours</span>
              <div className="flex space-x-1 ml-2">
                {[
                  { label: '8h', seconds: 28800 },
                  { label: '24h', seconds: 86400 },
                  { label: '3d', seconds: 259200 },
                  { label: '7d', seconds: 604800 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setScenarioDuration(preset.seconds)}
                    className={`px-2 py-1 text-xs rounded border ${
                      scenarioDuration === preset.seconds
                        ? 'bg-blue-100 border-blue-400 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Overrides */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="input-label mb-0">Parameter Overrides</label>
              <button
                onClick={addOverride}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                + Add Override
              </button>
            </div>

            {overrides.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded text-center">
                No overrides. The scenario will use current model parameters.
                <br />
                <span className="text-xs">Click "+ Add Override" to modify parameters for this scenario.</span>
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {overrides.map((override, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Override #{index + 1}</span>
                      <button
                        onClick={() => removeOverride(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Entity Type */}
                      <div>
                        <label className="text-xs text-gray-500">Entity Type</label>
                        <select
                          className="input text-sm"
                          value={override.entityType}
                          onChange={(e) => {
                            const entityType = e.target.value;
                            const entities = getEntitiesForType(entityType);
                            const params = getParametersForEntityType(entityType);
                            if (entities.length > 0 && params.length > 0) {
                              const origVal = getOriginalValue(entityType, entities[0].id, params[0].key);
                              updateOverride(index, {
                                entityType: entityType as any,
                                entityId: entities[0].id,
                                entityName: entities[0].name,
                                parameter: params[0].key,
                                originalValue: origVal,
                                overrideValue: origVal ?? 0,
                              });
                              setApplyToAll((prev) => ({ ...prev, [index]: false }));
                            }
                          }}
                        >
                          {getEntityTypeOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Entity Selector */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-gray-500">Entity</label>
                          {getEntitiesForType(override.entityType).length > 1 && (
                            <label className="flex items-center space-x-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!applyToAll[index]}
                                onChange={(e) => setApplyToAll((prev) => ({ ...prev, [index]: e.target.checked }))}
                                className="w-3 h-3 text-blue-600 border-gray-300 rounded"
                              />
                              <span className="text-xs text-blue-600">All {override.entityType}s</span>
                            </label>
                          )}
                        </div>
                        <select
                          className="input text-sm"
                          value={override.entityId}
                          disabled={!!applyToAll[index]}
                          onChange={(e) => {
                            const entity = getEntitiesForType(override.entityType).find(
                              (en) => en.id === e.target.value
                            );
                            const origVal = getOriginalValue(
                              override.entityType,
                              e.target.value,
                              override.parameter
                            );
                            updateOverride(index, {
                              entityId: e.target.value,
                              entityName: entity?.name || '',
                              originalValue: origVal,
                            });
                          }}
                        >
                          {getEntitiesForType(override.entityType).map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Parameter */}
                      <div>
                        <label className="text-xs text-gray-500">Parameter</label>
                        <select
                          className="input text-sm"
                          value={override.parameter}
                          onChange={(e) => {
                            const origVal = getOriginalValue(
                              override.entityType,
                              override.entityId,
                              e.target.value
                            );
                            updateOverride(index, {
                              parameter: e.target.value,
                              originalValue: origVal,
                              overrideValue: origVal ?? 0,
                            });
                          }}
                        >
                          {getParametersForEntityType(override.entityType).map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Values */}
                      <div className="space-y-1">
                        <div>
                          <label className="text-xs text-gray-500">Original</label>
                          <input
                            type="text"
                            className="input text-sm bg-gray-100"
                            value={String(override.originalValue ?? '—')}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">New Value</label>
                      <input
                        type="number"
                        className="input text-sm"
                        value={override.overrideValue as number}
                        onChange={(e) =>
                          updateOverride(index, { overrideValue: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateScenario}>
              {overrides.length > 0 ? 'Create & Run' : 'Create Scenario'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Scenario Results Modal */}
      <Modal
        isOpen={showQuickScenario}
        onClose={() => setShowQuickScenario(false)}
        title={quickScenarioResults?.title as string || 'Running Scenario...'}
      >
        {isRunning ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Running simulation...</p>
            <p className="text-sm text-gray-400 mt-2">Analyzing {model.stations.length} stations via simulation engine</p>
          </div>
        ) : quickScenarioResults ? (
          <div ref={quickResultsRef} className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-gray-600">{quickScenarioResults.description as string}</p>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded whitespace-nowrap ml-4">
                Simulated: {(() => {
                  const d = (quickScenarioResults.simulatedDuration as number) || 28800;
                  if (d >= 86400) return `${(d / 86400).toFixed(0)} day${d >= 172800 ? 's' : ''}`;
                  return `${(d / 3600).toFixed(0)}h`;
                })()}
              </span>
            </div>

            {/* Comparison Table */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Impact Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="font-medium text-gray-500">Metric</div>
                <div className="font-medium text-gray-500">Baseline</div>
                <div className="font-medium text-gray-500">Scenario</div>

                {['oee', 'throughput', 'cycleTime', 'wip'].map((key) => {
                  const base = (quickScenarioResults.baseline as unknown as Record<string, number>)[key];
                  const scen = (quickScenarioResults.scenario as unknown as Record<string, number>)[key];
                  const diff = scen - base;
                  const isPositive = key === 'wip' || key === 'cycleTime' ? diff < 0 : diff > 0;

                  return (
                    <React.Fragment key={key}>
                      <div className="capitalize">{key === 'oee' ? 'OEE' : key === 'wip' ? 'WIP' : key.replace(/([A-Z])/g, ' $1')}</div>
                      <div>{base}{key === 'oee' ? '%' : key === 'cycleTime' ? 's' : ''}</div>
                      <div className="flex items-center">
                        <span>{scen}{key === 'oee' ? '%' : key === 'cycleTime' ? 's' : ''}</span>
                        <span className={`ml-2 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Insights */}
            <div>
              <h4 className="font-medium mb-3">Key Insights</h4>
              <div className="space-y-2">
                {(quickScenarioResults.insights as Array<{type: string; text: string}>)?.map((insight, i) => (
                  <div
                    key={i}
                    className={`flex items-start space-x-2 p-2 rounded ${
                      insight.type === 'critical' ? 'bg-red-50 text-red-800' :
                      insight.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
                      insight.type === 'success' ? 'bg-green-50 text-green-800' :
                      'bg-blue-50 text-blue-800'
                    }`}
                  >
                    <span className="text-lg">
                      {insight.type === 'critical' ? '!' :
                       insight.type === 'warning' ? '⚠' :
                       insight.type === 'success' ? '✓' : 'ℹ'}
                    </span>
                    <span className="text-sm">{insight.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendation */}
            {(quickScenarioResults.recommendation as string) ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-1">Recommendation</h4>
                <p className="text-sm text-blue-800">{quickScenarioResults.recommendation as string}</p>
              </div>
            ) : null}

            {/* Log download for quick scenario */}
            {(quickScenarioResults.simulationResult as SimulationResult)?.events?.length > 0 && (
              <div className="flex items-center space-x-3 pt-2">
                <span className="text-xs text-gray-500">Download event logs:</span>
                <button
                  onClick={() => {
                    const events = (quickScenarioResults.simulationResult as SimulationResult).events;
                    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                    downloadEventLog(events as unknown as Array<Record<string, unknown>>, `quick-scenario-${activeQuickScenario}-${ts}.json`);
                    addToast({ type: 'success', message: 'Log downloaded (JSON)' });
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  JSON
                </button>
                <button
                  onClick={() => {
                    const events = (quickScenarioResults.simulationResult as SimulationResult).events;
                    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                    downloadEventLogCSV(events as unknown as Array<Record<string, unknown>>, `quick-scenario-${activeQuickScenario}-${ts}.csv`);
                    addToast({ type: 'success', message: 'Log downloaded (CSV)' });
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  CSV
                </button>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="secondary" onClick={() => setShowQuickScenario(false)}>
                Close
              </Button>
              <Button onClick={() => {
                const scenario: Scenario = {
                  id: uuidv4(),
                  modelId: model.id || 'current',
                  name: quickScenarioResults.title as string,
                  parameters: { ...model },
                  overrides: buildQuickScenarioOverrides(activeQuickScenario || ''),
                  createdAt: new Date().toISOString(),
                  results: quickScenarioResults.simulationResult as SimulationResult,
                };
                addScenario(scenario);
                addToast({ type: 'success', message: 'Scenario saved with simulation results' });
              }}>
                Save as Scenario
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// Comparison helpers
function getComparisonDiff(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const diff = max - min;
  return diff > 0 ? `+${diff.toFixed(1)}` : '0';
}

function getComparisonColor(values: number[], higherIsBetter: boolean): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const diff = max - min;
  if (diff < 0.01) return 'text-gray-600';
  return higherIsBetter ? 'text-green-600' : 'text-red-600';
}


// Icons
function CameraIcon({ className }: { className?: string }) {
  return <Camera className={className} strokeWidth={1.75} />;
}

function WarningIcon({ className }: { className?: string }) {
  return <AlertTriangle className={className} strokeWidth={1.75} />;
}

function TrendUpIcon({ className }: { className?: string }) {
  return <TrendingUp className={className} strokeWidth={1.75} />;
}

function ClockIcon({ className }: { className?: string }) {
  return <Clock className={className} strokeWidth={1.75} />;
}

function BoxIcon({ className }: { className?: string }) {
  return <Box className={className} strokeWidth={1.75} />;
}

function FolderIcon({ className }: { className?: string }) {
  return <FolderOpen className={className} strokeWidth={1.75} />;
}

function TrashIcon({ className }: { className?: string }) {
  return <Trash2 className={className} strokeWidth={1.75} />;
}

function CloseIcon({ className }: { className?: string }) {
  return <X className={className} strokeWidth={1.75} />;
}

function ShieldIcon({ className }: { className?: string }) {
  return <Shield className={className} strokeWidth={1.75} />;
}

function BoltIcon({ className }: { className?: string }) {
  return <Zap className={className} strokeWidth={1.75} />;
}

function ExpandIcon({ className }: { className?: string }) {
  return <Maximize2 className={className} strokeWidth={1.75} />;
}

function TruckIcon({ className }: { className?: string }) {
  return <Truck className={className} strokeWidth={1.75} />;
}

function WrenchIcon({ className }: { className?: string }) {
  return <Wrench className={className} strokeWidth={1.75} />;
}

function TrendDownIcon({ className }: { className?: string }) {
  return <TrendingDown className={className} strokeWidth={1.75} />;
}
