import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/dashboards/Dashboard';
import { FactoryBuilder } from './components/factory-builder/FactoryBuilder';
import { ScenarioManager } from './components/scenarios/ScenarioManager';
import { CodeEditor } from './components/code-editor/CodeEditor';
import { DataSync } from './components/data-sync/DataSync';
import { OrderManager } from './components/orders/OrderManager';
import { Settings } from './components/Settings';
import { useAppStore } from './stores/appStore';
import { useModelStore } from './stores/modelStore';
import { useLiveSimulationStore } from './stores/liveSimulationStore';
import { LiveSimulationView } from './components/dashboards/LiveSimulationView';

// P9 — Standalone popout animation view
function PopoutAnimationView() {
  const progress = useLiveSimulationStore((s) =>
    s.simDuration > 0 ? s.currentTime / s.simDuration : 0
  );
  const simDuration = useLiveSimulationStore((s) => s.simDuration);

  // Set up event stream listeners for popout window
  React.useEffect(() => {
    const cleanupProgress = window.factorySim?.app?.onSimulationProgress?.((prog) => {
      useLiveSimulationStore.getState().updateFromDiagnostics(prog.diagnostics!, prog.currentTime);
    });
    const cleanupEvents = window.factorySim?.app?.onSimulationEvent?.((event) => {
      useLiveSimulationStore.getState().addStreamedEvent(event as any);
    });
    return () => {
      cleanupProgress?.();
      cleanupEvents?.();
    };
  }, []);

  return (
    <div style={{ height: '100vh', background: '#0f172a' }}>
      <LiveSimulationView
        progress={progress}
        elapsedSeconds={0}
        simDuration={simDuration}
      />
    </div>
  );
}

function App() {
  const { isInitialized, initialize, addToast } = useAppStore();
  const navigate = useNavigate();

  // P9 — Check for popout query param
  const isPopout = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('popout') === 'animation';
  }, []);

  React.useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Listen for Electron menu actions
  React.useEffect(() => {
    if (isPopout) return; // Skip menu actions in popout
    const win = window as unknown as { factorySim?: { app?: { onMenuAction?: (cb: (action: string, payload?: unknown) => void) => () => void } } };
    if (!win.factorySim?.app?.onMenuAction) return;

    const cleanup = win.factorySim.app.onMenuAction((action, payload) => {
      switch (action) {
        case 'menu:new-model':
          useModelStore.getState().resetModel();
          navigate('/builder');
          addToast({ type: 'info', message: 'New model created' });
          break;
        case 'menu:save-model':
          useModelStore.getState().saveModel().then(() => {
            addToast({ type: 'success', message: 'Model saved' });
          }).catch(() => {
            addToast({ type: 'error', message: 'Failed to save model' });
          });
          break;
        case 'menu:navigate':
          if (typeof payload === 'string') {
            navigate(payload);
          }
          break;
      }
    });

    return cleanup;
  }, [navigate, addToast, isPopout]);

  // P9 — Render standalone animation in popout mode
  if (isPopout) {
    return <PopoutAnimationView />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/builder" element={<FactoryBuilder />} />
        <Route path="/scenarios" element={<ScenarioManager />} />
        <Route path="/orders" element={<OrderManager />} />
        <Route path="/code" element={<CodeEditor />} />
        <Route path="/data" element={<DataSync />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;
