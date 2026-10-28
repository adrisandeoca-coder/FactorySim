import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useModelStore } from '../../stores/modelStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { ModelManager } from './ModelManager';
import { RibbonSlot, RibbonGroup, RibbonButton } from './Ribbon';
import {
  Save, FolderOpen, HelpCircle, FilePlus2, Settings as SettingsIcon, Boxes, Play, BarChart3,
  RefreshCw, Clock, Terminal, Zap, FlaskConical, GitBranch,
} from 'lucide-react';

/**
 * App shell header in engineering-desktop style: title bar with quick-access
 * buttons, a File menu, page tabs, and the ribbon (filled by the active page
 * via <RibbonContent>, or default groups when a page provides none).
 */

type Tab = { id: string; label: string; path: string; match: string[]; expertOnly?: boolean };

const TABS: Tab[] = [
  { id: 'build', label: 'Build', path: '/builder', match: ['/builder'] },
  { id: 'run', label: 'Run & Results', path: '/dashboard', match: ['/dashboard'] },
  { id: 'compare', label: 'Compare', path: '/scenarios', match: ['/scenarios'] },
  { id: 'world', label: '3D World', path: '/world', match: ['/world'], expertOnly: true },
  { id: 'orders', label: 'Orders', path: '/orders', match: ['/orders'], expertOnly: true },
  { id: 'tools', label: 'Tools', path: '/sweep', match: ['/data', '/sweep', '/code', '/plugins', '/experiments', '/hierarchy'], expertOnly: true },
];

const TOOL_PAGES = [
  { path: '/sweep', label: 'Parameter Sweep', icon: <Clock size={24} color="#2563EB" /> },
  { path: '/experiments', label: 'Experiments', icon: <FlaskConical size={24} color="#7C3AED" /> },
  { path: '/data', label: 'Data Sync', icon: <RefreshCw size={24} color="#059669" /> },
  { path: '/code', label: 'Code Editor', icon: <Terminal size={24} color="#334155" /> },
  { path: '/plugins', label: 'Plugins', icon: <Zap size={24} color="#D97706" /> },
  { path: '/hierarchy', label: 'Hierarchy', icon: <GitBranch size={24} color="#0891B2" /> },
];

/* Inline brand mark — no external image needed */
function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="5" fill="#2563EB" />
      <circle cx="5.5" cy="14" r="2.5" fill="white" fillOpacity="0.75" />
      <path d="M8 14h3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="11.5" y="10.5" width="5" height="7" rx="1" fill="white" />
      <path d="M16.5 14h3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="22.5" cy="14" r="2.5" fill="white" fillOpacity="0.45" />
    </svg>
  );
}

export function Header() {
  const { isSimulating, simulationProgress, addToast, simpleMode, setSimpleMode } = useAppStore();
  const { model, setModelName, saveModel, resetModel } = useModelStore();
  const isReplaying = useLiveSimulationStore((s) => s.isReplaying);

  const location = useLocation();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(model.name);
  const [showModelManager, setShowModelManager] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowHelp(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleStartEdit = () => { setEditValue(model.name); setIsEditing(true); };
  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== model.name) setModelName(trimmed);
    setIsEditing(false);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmEdit();
    else if (e.key === 'Escape') setIsEditing(false);
  };
  const handleSave = async () => {
    try { await saveModel(); addToast({ type: 'success', message: 'Model saved' }); }
    catch { addToast({ type: 'error', message: 'Failed to save model' }); }
  };
  const handleNew = () => {
    resetModel();
    navigate('/builder');
    addToast({ type: 'info', message: 'New model created' });
  };

  const tabs = TABS.filter((t) => !simpleMode || !t.expertOnly);
  const activeTab = TABS.find((t) => t.match.some((m) => location.pathname.startsWith(m)));

  return (
    <>
      {/* ── Title bar ── */}
      <div className="app-titlebar">
        <div className="app-titlebar-left">
          <BrandMark />
          <button className="qa-btn" onClick={handleSave} title="Save model (Ctrl+S)" aria-label="Save model"><Save size={14} /></button>
          <button className="qa-btn" onClick={() => setShowModelManager(true)} title="Open saved models" aria-label="Open model"><FolderOpen size={14} /></button>
          <span className="app-titlebar-sep" />
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleConfirmEdit}
              onKeyDown={handleKeyDown}
              className="app-titlebar-input"
            />
          ) : (
            <button className="app-titlebar-title" onClick={handleStartEdit} title="Click to rename model">
              {model.name || 'Untitled Model'}
            </button>
          )}
          <span className="app-titlebar-app">— FactorySim</span>
        </div>
        <div className="app-titlebar-right">
          {isSimulating && (
            <span className="app-titlebar-status">
              <span className="status-dot status-dot-good" style={{ background: '#3B82F6' }} />
              Simulating {Math.round(simulationProgress * 100)}%
            </span>
          )}
          {isReplaying && !isSimulating && <span className="app-titlebar-status">Replay</span>}
          <label className="titlebar-switch" title="Simple mode shows the essential workflow. Switch off for all expert tools.">
            <span>Simple mode</span>
            <input type="checkbox" role="switch" checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} />
          </label>
          <button className="qa-btn" onClick={() => setShowHelp(true)} title="Help (F1)" aria-label="Help"><HelpCircle size={15} /></button>
        </div>
      </div>

      {/* ── Tab row ── */}
      <nav className="ribbon-tabs" aria-label="Main">
        <div style={{ position: 'relative' }}>
          <button className="ribbon-file-tab" onClick={() => setFileMenuOpen((v) => !v)} aria-expanded={fileMenuOpen}>File</button>
          {fileMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setFileMenuOpen(false)} />
              <div className="file-menu" role="menu">
                {[
                  { label: 'New model', icon: <FilePlus2 size={15} />, fn: handleNew },
                  { label: 'Open…', icon: <FolderOpen size={15} />, fn: () => setShowModelManager(true) },
                  { label: 'Save', icon: <Save size={15} />, fn: handleSave },
                  { label: 'Settings', icon: <SettingsIcon size={15} />, fn: () => navigate('/settings') },
                  { label: 'Help', icon: <HelpCircle size={15} />, fn: () => setShowHelp(true) },
                ].map((item) => (
                  <button key={item.label} role="menuitem" className="file-menu-item" onClick={() => { setFileMenuOpen(false); item.fn(); }}>
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`ribbon-tab ${activeTab?.id === t.id ? 'is-active' : ''}`}
            onClick={() => navigate(t.path)}
            aria-current={activeTab?.id === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
        {/* Simulation progress runs along the bottom of the tab row */}
        {isSimulating && (
          <div className="ribbon-progress"><div style={{ width: `${simulationProgress * 100}%` }} /></div>
        )}
      </nav>

      {/* ── Ribbon body ── */}
      <div className="ribbon">
        <RibbonSlot />
        <div className="ribbon-fallback">
          {activeTab?.id === 'tools' ? (
            <RibbonGroup label="Analysis tools">
              {TOOL_PAGES.map((p) => (
                <RibbonButton
                  key={p.path}
                  icon={p.icon}
                  label={p.label}
                  active={location.pathname.startsWith(p.path)}
                  onClick={() => navigate(p.path)}
                />
              ))}
            </RibbonGroup>
          ) : (
            <>
              <RibbonGroup label="Model">
                <RibbonButton icon={<FilePlus2 size={24} color="#334155" />} label="New" onClick={handleNew} />
                <RibbonButton icon={<FolderOpen size={24} color="#D97706" />} label="Open" onClick={() => setShowModelManager(true)} />
                <RibbonButton icon={<Save size={24} color="#2563EB" />} label="Save" onClick={handleSave} />
              </RibbonGroup>
              <RibbonGroup label="Workflow">
                <RibbonButton icon={<Boxes size={24} color="#2563EB" />} label="Build line" onClick={() => navigate('/builder')} />
                <RibbonButton icon={<Play size={24} color="#059669" />} label="Run" onClick={() => navigate('/dashboard')} />
                <RibbonButton icon={<BarChart3 size={24} color="#7C3AED" />} label="Compare" onClick={() => navigate('/scenarios')} />
              </RibbonGroup>
            </>
          )}
        </div>
      </div>

      <ModelManager isOpen={showModelManager} onClose={() => setShowModelManager(false)} />

      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setShowHelp(false)}>
          <div className="card" style={{ width: 440, maxHeight: '70vh', overflowY: 'auto', padding: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="text-title">Quick Help</span>
              <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {location.pathname.includes('dashboard') && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-title" style={{ marginBottom: 4 }}>Dashboard</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    <li>Set the run length under Settings in the ribbon, then press Run simulation</li>
                    <li>The Results summary names the bottleneck and what to try</li>
                    <li>Click a station name to open it in the builder</li>
                    <li>Customize (ribbon, View group) adds or removes panels</li>
                  </ul>
                </div>
              )}
              {location.pathname.includes('builder') && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-title" style={{ marginBottom: 4 }}>Factory Builder</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    <li>Add elements from the ribbon (Add element group)</li>
                    <li>Drag from a handle to connect two elements</li>
                    <li>Select an element in the Outline or on the canvas to edit its details</li>
                    <li>Press Delete to remove the selected element</li>
                  </ul>
                </div>
              )}
              <div>
                <div className="text-title" style={{ marginBottom: 4 }}>Shortcuts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                  {[
                    ['Ctrl+Z', 'Undo'],
                    ['Ctrl+Y', 'Redo'],
                    ['Del', 'Remove'],
                    ['F1', 'This help'],
                    ['Ctrl+F', 'Search nodes'],
                    ['Ctrl+S', 'Save model'],
                  ].map(([key, label]) => (
                    <span key={key}>
                      <kbd style={{ padding: '1px 5px', background: 'var(--gray-100)', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', border: '1px solid var(--border)' }}>{key}</kbd>
                      {' '}{label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
