import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useModelStore } from '../../stores/modelStore';
import { ModelManager } from './ModelManager';

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
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Toggle Sidebar"
          >
            <MenuIcon />
          </button>

          <div className="flex items-center space-x-2">
            <FactoryIcon className="w-6 h-6 text-blue-600" />
            <span className="font-semibold text-lg text-gray-900">FactorySim</span>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* Inline editable model name */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleConfirmEdit}
              onKeyDown={handleKeyDown}
              className="text-sm text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
            />
          ) : (
            <button
              onClick={handleStartEdit}
              className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors"
              title="Click to rename"
            >
              {model.name || 'Untitled Model'}
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Save Model"
          >
            <SaveIcon className="w-4 h-4 text-gray-500" />
          </button>

          {/* Models button */}
          <button
            onClick={() => setShowModelManager(true)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Saved Models"
          >
            <FolderIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex items-center space-x-4">
          {isSimulating && (
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${simulationProgress * 100}%` }}
                />
              </div>
              <span className="text-sm text-blue-600 font-medium">
                {Math.round(simulationProgress * 100)}%
              </span>
              <span className="text-xs text-gray-500">Simulating...</span>
            </div>
          )}

          <button
            onClick={() => setShowHelp(true)}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
            title="Quick Help (F1)"
          >
            <span className="text-sm font-semibold text-gray-500">?</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {currentUser?.displayName?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-sm">
              <div className="font-medium text-gray-900">{currentUser?.displayName || 'User'}</div>
              <div className="text-xs text-gray-500 capitalize">{currentUser?.role || 'Engineer'}</div>
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
              <h2 className="text-lg font-bold text-gray-900">Quick Help</h2>
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
                    <li>Press <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Delete</kbd> to remove selected elements</li>
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
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl+Z</kbd> Undo</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl+Y</kbd> Redo</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl+F</kbd> Search nodes</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> Exit fullscreen / close</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Delete</kbd> Remove selected</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">F1</kbd> Open this help</span>
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

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function FactoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}
