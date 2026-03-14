import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useModelStore } from '../../stores/modelStore';
import { ModelManager } from './ModelManager';
import { Menu, Factory, Save, FolderOpen, HelpCircle } from 'lucide-react';

export function Header() {
  const { toggleSidebar, currentUser, isSimulating, simulationProgress, addToast } = useAppStore();
  const { model, setModelName, saveModel } = useModelStore();

  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(model.name);
  const [showModelManager, setShowModelManager] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // F1 shortcut for help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowHelp(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleStartEdit = () => {
    setEditValue(model.name);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== model.name) {
      setModelName(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleSave = async () => {
    try {
      await saveModel();
      addToast({ type: 'success', message: 'Model saved' });
    } catch {
      addToast({ type: 'error', message: 'Failed to save model' });
    }
  };

  return (
    <>
      <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
            title="Toggle Sidebar"
          >
            <Menu className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
          </button>

          <div className="flex items-center space-x-2">
            <Factory className="w-5 h-5 text-blue-600" strokeWidth={1.75} />
            <span className="font-semibold text-sm text-gray-900 tracking-tight">FactorySim</span>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Inline editable model name */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleConfirmEdit}
              onKeyDown={handleKeyDown}
              className="text-xs text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-44"
            />
          ) : (
            <button
              onClick={handleStartEdit}
              className="text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors"
              title="Click to rename"
            >
              {model.name || 'Untitled Model'}
            </button>
          )}

          <button
            onClick={handleSave}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            title="Save Model"
          >
            <Save className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
          </button>

          <button
            onClick={() => setShowModelManager(true)}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            title="Saved Models"
          >
            <FolderOpen className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {isSimulating && (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${simulationProgress * 100}%` }}
                />
              </div>
              <span className="text-xs text-blue-600 font-mono font-medium tabular-nums">
                {Math.round(simulationProgress * 100)}%
              </span>
            </div>
          )}

          <button
            onClick={() => setShowHelp(true)}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            title="Quick Help (F1)"
          >
            <HelpCircle className="w-4 h-4 text-gray-400" strokeWidth={1.75} />
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-white">
                {currentUser?.displayName?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-xs leading-tight">
              <div className="font-medium text-gray-900">{currentUser?.displayName || 'User'}</div>
              <div className="text-gray-400">{currentUser?.role || 'Engineer'}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Model Manager Modal */}
      <ModelManager isOpen={showModelManager} onClose={() => setShowModelManager(false)} />

      {/* Help Overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="text-sm font-bold text-gray-900">Quick Help</h2>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm">
              {/* Context-sensitive tips */}
              {location.pathname.includes('builder') && (
                <section>
                  <h3 className="font-semibold text-gray-800 mb-1">Factory Builder</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>Click palette icons to add stations, buffers, and other elements</li>
                    <li>Drag from a node handle to another to create connections</li>
                    <li>Select a node to edit its properties in the right panel</li>
                    <li>Toggle "Zones" to see auto-detected zone groupings</li>
                    <li>Press <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Delete</kbd> to remove selected elements</li>
                  </ul>
                </section>
              )}
              {location.pathname.includes('dashboard') && (
                <section>
                  <h3 className="font-semibold text-gray-800 mb-1">Dashboard</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>Click "Run Simulation" to start — the live animation shows real-time state</li>
                    <li>Use the section nav bar to jump between chart widgets</li>
                    <li>Click station names in the performance table to navigate to the editor</li>
                    <li>Use "Export" to download KPI data as CSV</li>
                    <li>Use "Customize" to add/remove/reorder dashboard widgets</li>
                  </ul>
                </section>
              )}
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Keyboard Shortcuts</h3>
                <div className="grid grid-cols-2 gap-1 text-gray-600">
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+Z</kbd> Undo</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+Y</kbd> Redo</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+F</kbd> Search nodes</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Esc</kbd> Exit fullscreen / close</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Delete</kbd> Remove selected</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">F1</kbd> Open this help</span>
                </div>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Getting Started</h3>
                <ol className="space-y-1 text-gray-600 list-decimal list-inside">
                  <li>Load a template or build your factory in the Builder</li>
                  <li>Configure station cycle times, buffer capacities, and connections</li>
                  <li>Go to Dashboard and click "Run Simulation"</li>
                  <li>Watch the live animation, then analyze KPI charts</li>
                  <li>Use Scenarios to compare different configurations</li>
                </ol>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
