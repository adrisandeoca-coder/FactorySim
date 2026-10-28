import { useState, useEffect } from 'react';
import { X, Keyboard, Play, Save, FileDown } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useAppStore } from '../../stores/appStore';
import { downloadKPICSV } from '../../services/screenshotService';
import { createLogger } from '../../services/logger';

const log = createLogger('KeyboardShortcuts');

interface Shortcut {
  keys: string;
  description: string;
  group: string;
  icon?: React.ReactNode;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: 'Ctrl + /', group: 'Navigation', description: 'Toggle keyboard shortcuts panel' },
  { keys: 'F1', group: 'Navigation', description: 'Open help' },
  { keys: 'Escape', group: 'Navigation', description: 'Close modal or panel' },

  // Editing
  { keys: 'Ctrl + S', group: 'Editing', description: 'Save model', icon: <Save className="w-3 h-3" /> },
  { keys: 'Ctrl + F', group: 'Editing', description: 'Search nodes' },
  { keys: 'Ctrl + Z', group: 'Editing', description: 'Undo' },
  { keys: 'Ctrl + Y', group: 'Editing', description: 'Redo' },
  { keys: 'Delete', group: 'Editing', description: 'Delete selected node or edge' },

  // Simulation
  { keys: 'Ctrl + Enter', group: 'Simulation', description: 'Run simulation', icon: <Play className="w-3 h-3" /> },
  { keys: 'Ctrl + Shift + E', group: 'Simulation', description: 'Export results as CSV', icon: <FileDown className="w-3 h-3" /> },

  // View / Replay
  { keys: 'Space', group: 'View', description: 'Play / Pause replay' },
  { keys: '\u2190 / \u2192', group: 'View', description: 'Seek backward / forward 5s' },
  { keys: 'Home / End', group: 'View', description: 'Jump to start / end' },
];

const GROUP_ORDER = ['Navigation', 'Editing', 'Simulation', 'View'];

const GROUP_COLORS: Record<string, string> = {
  Navigation: 'text-blue-500',
  Editing: 'text-amber-500',
  Simulation: 'text-green-500',
  View: 'text-purple-500',
};

const GROUP_ICONS: Record<string, string> = {
  Navigation: '🧭',
  Editing: '✏️',
  Simulation: '▶️',
  View: '👁️',
};

export function KeyboardShortcutsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Toggle shortcuts panel: Ctrl + /
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      // Ctrl+S — Save model
      if (e.key === 's' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { saveModel } = useModelStore.getState();
        saveModel().then(() => {
          useAppStore.getState().addToast({ type: 'success', message: 'Model saved' });
        }).catch((err) => {
          log.error('Failed to save model', err);
          useAppStore.getState().addToast({ type: 'error', message: 'Failed to save model' });
        });
        return;
      }

      // Ctrl+Enter — Run simulation
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { isRunning } = useSimulationStore.getState();
        if (isRunning) {
          useAppStore.getState().addToast({ type: 'warning', message: 'Simulation already running' });
          return;
        }
        // Trigger simulation via the IPC bridge (same as Dashboard handleRunSimulation)
        const model = useModelStore.getState().model;
        const options = useSimulationStore.getState().defaultOptions;
        if (!window.factorySim?.simulation?.runSimulation) {
          useAppStore.getState().addToast({ type: 'error', message: 'Simulation engine not available' });
          return;
        }
        useSimulationStore.getState().startSimulation();
        window.factorySim.simulation.runSimulation(model, options).then((result) => {
          useSimulationStore.getState().setResult(result);
          useAppStore.getState().addToast({ type: 'success', message: 'Simulation complete' });
        }).catch((err) => {
          log.error('Simulation failed', err);
          useSimulationStore.getState().stopSimulation();
          useAppStore.getState().addToast({ type: 'error', message: `Simulation failed: ${(err as Error).message}` });
        });
        return;
      }

      // Ctrl+Shift+E — Export results as CSV
      if (e.key === 'E' && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { lastResult } = useSimulationStore.getState();
        if (!lastResult?.kpis) {
          useAppStore.getState().addToast({ type: 'warning', message: 'No results to export. Run a simulation first.' });
          return;
        }
        const stations = useModelStore.getState().model.stations;
        downloadKPICSV(lastResult.kpis, stations);
        useAppStore.getState().addToast({ type: 'success', message: 'KPI data exported as CSV' });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!isOpen) return null;

  const groups = GROUP_ORDER.filter((g) => SHORTCUTS.some((s) => s.group === g));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-[500px] max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-900">Keyboard Shortcuts</h2>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded-md transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body — grouped shortcuts */}
        <div className="p-5 space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-sm">{GROUP_ICONS[group]}</span>
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${GROUP_COLORS[group] || 'text-gray-400'}`}>
                  {group}
                </h3>
                <div className="flex-1 h-px bg-gray-100 ml-2" />
              </div>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-700 flex items-center gap-2">
                      {shortcut.icon}
                      {shortcut.description}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.keys.split(' + ').map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-gray-300 mx-0.5">+</span>}
                          <kbd className="inline-block px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-600 rounded border border-gray-200 shadow-sm min-w-[24px] text-center">
                            {key.trim()}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 text-center bg-gray-50/50 rounded-b-xl">
          <span className="text-xs text-gray-400">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500 font-mono text-[10px]">Ctrl</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500 font-mono text-[10px]">/</kbd>
            {' '}to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
