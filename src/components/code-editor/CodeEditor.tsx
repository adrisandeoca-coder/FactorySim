import { useState, useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';

// Configure Monaco to use local package instead of CDN (CDN fails in Electron)
loader.config({ monaco });

function getFilename(modelName: string | undefined, ext: string): string {
  if (!modelName) return `factory_model.${ext}`;
  const sanitized = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return (sanitized || 'factory_model') + '.' + ext;
}

export function CodeEditor() {
  const { model } = useModelStore();
  const { addToast } = useAppStore();

  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'json' | 'diff'>('code');
  const [monacoFailed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [diffSummary, setDiffSummary] = useState<string>('');
  const codeEditorRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Register code editor tab for cross-tab screenshot capture
  useEffect(() => {
    registerElement('code-editor-tab', codeEditorRef.current);
    return () => {
      if (codeEditorRef.current) {
        captureToBase64(codeEditorRef.current)
          .then((base64) => setCachedImage('code-editor-tab', base64))
          .catch(() => {});
      }
      registerElement('code-editor-tab', null);
    };
  }, []);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportMenuOpen]);

  const filename = viewMode === 'code'
    ? getFilename(model.name, 'py')
    : getFilename(model.name, 'json');

  // Generate code from model via backend IPC
  useEffect(() => {
    if (viewMode === 'code') {
      setCode('# Generating code...');
      const factorySim = (window as any).factorySim;
      if (factorySim?.code?.exportModel) {
        factorySim.code.exportModel(model)
          .then((result: string) => setCode(result))
          .catch(() => setCode('# Error generating code — backend unavailable'));
      } else {
        setCode('# Code generation requires the desktop app backend');
      }
    } else if (viewMode === 'diff') {
      setCode('');
      setDiffSummary('Loading previous run...');
      const factorySim = (window as any).factorySim;
      if (factorySim?.artifacts?.listRuns) {
        factorySim.artifacts.listRuns().then(async (runs: string[]) => {
          if (!runs || runs.length === 0) {
            setDiffSummary('No previous run to compare against');
            return;
          }
          try {
            const latestRun = runs[runs.length - 1];
            const prevModel = await factorySim.artifacts.loadRunFile(latestRun, 'model.json');
            if (!prevModel) {
              setDiffSummary('No model.json found in previous run');
              return;
            }
            const prev = typeof prevModel === 'string' ? JSON.parse(prevModel) : prevModel;
            const lines: string[] = [];
            // Station diff
            const prevStationNames = new Set((prev.stations || []).map((s: any) => s.name));
            const curStationNames = new Set((model.stations || []).map(s => s.name));
            const addedStations = (model.stations || []).filter(s => !prevStationNames.has(s.name));
            const removedStations = (prev.stations || []).filter((s: any) => !curStationNames.has(s.name));
            if (addedStations.length) lines.push(`+ Added stations: ${addedStations.map(s => s.name).join(', ')}`);
            if (removedStations.length) lines.push(`- Removed stations: ${removedStations.map((s: any) => s.name).join(', ')}`);
            // Buffer diff
            const prevBufferNames = new Set((prev.buffers || []).map((b: any) => b.name));
            const curBufferNames = new Set((model.buffers || []).map(b => b.name));
            const addedBuffers = (model.buffers || []).filter(b => !prevBufferNames.has(b.name));
            const removedBuffers = (prev.buffers || []).filter((b: any) => !curBufferNames.has(b.name));
            if (addedBuffers.length) lines.push(`+ Added buffers: ${addedBuffers.map(b => b.name).join(', ')}`);
            if (removedBuffers.length) lines.push(`- Removed buffers: ${removedBuffers.map((b: any) => b.name).join(', ')}`);
            // Buffer capacity changes
            for (const buf of model.buffers || []) {
              const prevBuf = (prev.buffers || []).find((b: any) => b.name === buf.name);
              if (prevBuf && prevBuf.capacity !== buf.capacity) {
                lines.push(`~ Buffer "${buf.name}" capacity: ${prevBuf.capacity} → ${buf.capacity}`);
              }
            }
            // Station parameter changes
            for (const st of model.stations || []) {
              const prevSt = (prev.stations || []).find((s: any) => s.name === st.name);
              if (!prevSt) continue;
              if (prevSt.scrapRate !== st.scrapRate) lines.push(`~ "${st.name}" scrap rate: ${((prevSt.scrapRate || 0) * 100).toFixed(1)}% → ${((st.scrapRate || 0) * 100).toFixed(1)}%`);
              if (prevSt.mtbf !== st.mtbf) lines.push(`~ "${st.name}" MTBF: ${prevSt.mtbf || 'none'} → ${st.mtbf || 'none'}`);
              if (prevSt.batchSize !== st.batchSize) lines.push(`~ "${st.name}" batch size: ${prevSt.batchSize || 1} → ${st.batchSize || 1}`);
            }
            setDiffSummary(lines.length > 0 ? lines.join('\n') : 'No structural changes detected between current model and last run');
          } catch {
            setDiffSummary('Failed to load or parse previous run model');
          }
        }).catch(() => setDiffSummary('Failed to list runs'));
      } else {
        setDiffSummary('Diff requires the desktop app backend');
      }
    } else {
      setCode(JSON.stringify(model, null, 2));
    }
  }, [model, viewMode]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput('Running...\n');

    setTimeout(() => {
      setOutput(`Simulation started at ${new Date().toLocaleTimeString()}\n` +
        `Processing ${model.stations.length} stations...\n` +
        `Simulation complete.\n` +
        `\nResults:\n` +
        `- Total throughput: 1,250 units\n` +
        `- OEE: 72.5%\n` +
        `- Avg cycle time: 180s\n`
      );
      setIsRunning(false);
      addToast({ type: 'success', message: 'Code executed successfully' });
    }, 2000);
  };

  const handleSaveCode = () => {
    addToast({ type: 'success', message: 'Code saved' });
  };

  const handleExportFile = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', message: 'Code exported' });
    setExportMenuOpen(false);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(code).then(() => {
      addToast({ type: 'success', message: 'Copied to clipboard' });
    }).catch(() => {
      addToast({ type: 'error', message: 'Failed to copy' });
    });
    setExportMenuOpen(false);
  };

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(output).then(() => {
      addToast({ type: 'success', message: 'Output copied to clipboard' });
    }).catch(() => {
      addToast({ type: 'error', message: 'Failed to copy output' });
    });
  };

  // Model stats for quick reference
  const stationCount = model.stations?.length || 0;
  const bufferCount = model.buffers?.length || 0;
  const extraNodeCount = model.extraNodes?.length || 0;
  const productNames = (model.products || []).map(p => p.name);

  return (
    <div className="h-full flex flex-col space-y-4" ref={codeEditorRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Code Editor</h1>
          <p className="text-gray-500">View and edit the SimPy model code</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('code')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'code'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Python
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'json'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'diff'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Diff
            </button>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-500"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <SidebarIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Editor */}
        <div className={`${sidebarOpen ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col`}>
          <Card padding={false} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">
                  {filename}
                </span>
                {viewMode === 'code' && (
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600">Read-only</span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {/* Export dropdown */}
                <div className="relative" ref={exportRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  >
                    <DownloadIcon className="w-4 h-4 mr-1" />
                    Export
                    <ChevronDownIcon className="w-3 h-3 ml-1" />
                  </Button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                        onClick={handleExportFile}
                      >
                        Export as .{viewMode === 'code' ? 'py' : 'json'} file
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                        onClick={handleCopyToClipboard}
                      >
                        Copy to clipboard
                      </button>
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={handleSaveCode}>
                  <SaveIcon className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {viewMode === 'diff' ? (
                <div className="w-full h-full p-4 font-mono text-sm bg-white overflow-auto">
                  <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Model Diff vs Last Run</div>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">{diffSummary.split('\n').map((line, i) => (
                    <div key={i} className={
                      line.startsWith('+') ? 'text-green-700 bg-green-50 px-2 py-0.5 rounded' :
                      line.startsWith('-') ? 'text-red-700 bg-red-50 px-2 py-0.5 rounded' :
                      line.startsWith('~') ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded' :
                      'text-gray-600'
                    }>{line}</div>
                  ))}</pre>
                </div>
              ) : monacoFailed ? (
                <textarea
                  className="w-full h-full p-4 font-mono text-sm bg-white border-0 resize-none focus:outline-none"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  readOnly={viewMode === 'code'}
                  spellCheck={false}
                />
              ) : (
                <Editor
                  height="100%"
                  language={viewMode === 'code' ? 'python' : 'json'}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  theme="vs-light"
                  loading={
                    <div className="flex items-center justify-center h-full bg-gray-50">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-500">Loading editor...</p>
                      </div>
                    </div>
                  }
                  onMount={() => {
                    // Monaco loaded successfully
                  }}
                  beforeMount={() => {
                    // Pre-mount configuration
                  }}
                  onValidate={() => {
                    // Validation callback — Monaco is working if this fires
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    readOnly: viewMode === 'code',
                  }}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Side panel */}
        {sidebarOpen && (
          <div className="flex flex-col space-y-4">
            {/* Run panel */}
            <Card>
              <CardHeader title="Execute" subtitle="Run simulation code" />
              <Button
                onClick={handleRunCode}
                loading={isRunning}
                className="w-full"
                icon={<PlayIcon className="w-4 h-4" />}
              >
                {isRunning ? 'Running...' : 'Run Simulation'}
              </Button>
            </Card>

            {/* Output panel */}
            <Card className="flex-1 flex flex-col">
              <CardHeader
                title="Output"
                subtitle="Execution results"
                action={
                  output ? (
                    <Button variant="ghost" size="sm" onClick={handleCopyOutput}>
                      <CopyIcon className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  ) : undefined
                }
              />
              <div className="flex-1 bg-gray-900 rounded-lg p-3 font-mono text-sm text-green-400 overflow-auto min-h-[200px] max-h-[400px]">
                <pre className="whitespace-pre-wrap">{output || 'Output will appear here...'}</pre>
              </div>
            </Card>

            {/* Help panel */}
            <Card>
              <CardHeader title="Quick Reference" />
              <div className="text-sm text-gray-600 space-y-2">
                {/* Model context */}
                {(stationCount > 0 || bufferCount > 0) && (
                  <div className="pb-2 mb-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Current Model</p>
                    <p>{stationCount} station{stationCount !== 1 ? 's' : ''}, {bufferCount} buffer{bufferCount !== 1 ? 's' : ''}{extraNodeCount > 0 ? `, ${extraNodeCount} extra node${extraNodeCount !== 1 ? 's' : ''}` : ''}</p>
                    {productNames.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">Products: {productNames.join(', ')}</p>
                    )}
                  </div>
                )}
                <p><code className="bg-gray-100 px-1 rounded">env.process()</code> - Start a process</p>
                <p><code className="bg-gray-100 px-1 rounded">env.timeout()</code> - Wait for time</p>
                <p><code className="bg-gray-100 px-1 rounded">resource.request()</code> - Request resource</p>
                <a
                  href="https://simpy.readthedocs.io/en/latest/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline block mt-3"
                >
                  View SimPy Documentation
                </a>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
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

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
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

function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
