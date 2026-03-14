import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader } from './common/Card';
import { Button } from './common/Button';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { captureToBase64 } from '../services/screenshotService';
import { registerElement, setCachedImage } from '../services/elementRegistry';
import { Check, X, ChevronDown } from 'lucide-react';

export function Settings() {
  const { currentUser, addToast } = useAppStore();
  const { defaultOptions, setDefaultOptions } = useSimulationStore();
  const settingsRef = useRef<HTMLDivElement>(null);

  // Register settings tab for cross-tab screenshot capture
  useEffect(() => {
    registerElement('settings-tab', settingsRef.current);
    return () => {
      if (settingsRef.current) {
        captureToBase64(settingsRef.current)
          .then((base64) => setCachedImage('settings-tab', base64))
          .catch(() => {});
      }
      registerElement('settings-tab', null);
    };
  }, []);

  const [duration, setDuration] = useState(defaultOptions.duration);
  const [seed, setSeed] = useState(defaultOptions.seed || '');
  const [simStartDate, setSimStartDate] = useState(() => {
    if (defaultOptions.simulationStartDate) return defaultOptions.simulationStartDate;
    // Default: today at 06:00
    const d = new Date();
    d.setHours(6, 0, 0, 0);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM" for datetime-local
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSaveSimSettings = () => {
    setDefaultOptions({
      duration,
      seed: seed ? Number(seed) : undefined,
      replications: 1,
      simulationStartDate: simStartDate,
    });
    addToast({ type: 'success', message: 'Simulation settings saved' });
  };

  // Check if user has seen this version's release notes
  const CURRENT_VERSION = '1.1.0';
  const [seenVersion] = useState(() => {
    try { return localStorage.getItem('factorysim_seen_version'); } catch { return null; }
  });
  const isNewVersion = seenVersion !== CURRENT_VERSION;
  const markVersionSeen = () => {
    try { localStorage.setItem('factorysim_seen_version', CURRENT_VERSION); } catch {}
  };

  return (
    <div className="space-y-6 max-w-4xl" ref={settingsRef}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure application preferences</p>
      </div>

      {/* User Profile */}
      <Card>
        <CardHeader title="User Profile" subtitle="Your account information" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Username</label>
            <input
              type="text"
              value={currentUser?.username || ''}
              readOnly
              className="input bg-gray-50"
            />
          </div>
          <div>
            <label className="input-label">Role</label>
            <input
              type="text"
              value={currentUser?.role || 'Engineer'}
              readOnly
              className="input bg-gray-50 capitalize"
            />
          </div>
          <div className="col-span-2">
            <label className="input-label">Display Name</label>
            <input
              type="text"
              value={currentUser?.displayName || ''}
              className="input"
              placeholder="Your display name"
            />
          </div>
        </div>
      </Card>

      {/* Simulation Defaults */}
      <Card>
        <CardHeader
          title="Simulation Defaults"
          subtitle="Default settings for new simulation runs"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Default Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="input"
              >
                <option value={3600}>1 hour</option>
                <option value={14400}>4 hours</option>
                <option value={28800}>8 hours (shift)</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>1 week</option>
              </select>
            </div>
            <div>
              <label className="input-label">Replications</label>
              <input
                type="number"
                value={1}
                disabled
                className="input bg-gray-50 text-gray-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Multi-replication support coming soon.{' '}
                <a href="https://github.com/adrisandeoca-coder/FactorySim/discussions" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
                  Vote for this feature
                </a>
              </p>
            </div>
          </div>

          <div>
            <label className="input-label">Simulation Start Date & Time</label>
            <input
              type="datetime-local"
              value={simStartDate}
              onChange={(e) => setSimStartDate(e.target.value)}
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">
              Sets the calendar date shown during simulation. The sim clock will advance from this point.
            </p>
          </div>

          <div>
            <label className="input-label">Random Seed (optional)</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g., 42 — for reproducible results"
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">
              Set a fixed seed for reproducible results across runs. Leave empty to use a different random sequence each time.
            </p>
          </div>

          <Button onClick={handleSaveSimSettings}>Save Settings</Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" subtitle="Customize the look and feel" />
        <div className="space-y-4">
          <div>
            <label className="input-label">Theme</label>
            <select className="input" defaultValue="light">
              <option value="light">Light</option>
              <option value="dark">Dark (Coming Soon)</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label className="input-label">Language</label>
            <select className="input" defaultValue="en">
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
              <option value="sv">Svenska</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Data & Storage */}
      <Card>
        <CardHeader title="Data & Storage" subtitle="Manage local data" />
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="font-medium">Local Database</div>
              <div className="text-sm text-gray-500">Models, scenarios, and results</div>
            </div>
            <div className="text-sm text-gray-600">~2.4 MB</div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="font-medium">Simulation Results</div>
              <div className="text-sm text-gray-500">Historical run data</div>
            </div>
            <div className="text-sm text-gray-600">~15.2 MB</div>
          </div>

          <div className="flex space-x-2">
            <Button
              variant="secondary"
              onClick={() => addToast({ type: 'info', message: 'Exporting data...' })}
            >
              Export All Data
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowClearConfirm(true)}
            >
              Clear Cache
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={() => {
          addToast({ type: 'warning', message: 'Cache cleared' });
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear Cache"
        message="Clear all cached data? This will remove all simulation results and cannot be undone."
        confirmLabel="Clear Cache"
        variant="danger"
      />

      {/* Role Permissions */}
      <Card>
        <CardHeader title="Role Permissions" subtitle="Access levels by user role" />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
          These are the default permission levels for reference. Role assignments are managed at the organization level.
        </div>
        <p className="text-xs text-gray-400 mb-3">Read-only — default permission levels</p>
        <table className="table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Operator</th>
              <th>Analyst</th>
              <th>Engineer</th>
              <th>Developer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>View Dashboards</td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
            <tr>
              <td>Run Guided Scenarios</td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
            <tr>
              <td>Build Custom Scenarios</td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
            <tr>
              <td>Edit Model Parameters</td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
            <tr>
              <td>Access Code Editor</td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
            <tr>
              <td>Configure Data Connectors</td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><XIcon className="w-5 h-5 text-gray-300" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
              <td><CheckIcon className="w-5 h-5 text-green-500" /></td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* About */}
      <Card>
        <CardHeader title="About FactorySim" />
        <div className="space-y-2 text-sm text-gray-600">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Build:</strong> 2026.02.13</p>
          <p><strong>Engine:</strong> SimPy 4.1 &middot; Python 3.11+</p>
          <p className="pt-2">
            FactorySim is a desktop digital twin platform for manufacturing simulation.
          </p>
        </div>
      </Card>

      {/* Third-Party Licenses */}
      <Card>
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Third-Party Licenses</h3>
              <p className="text-xs text-gray-500 mt-0.5">Open-source software used by FactorySim</p>
            </div>
            <ChevronIcon className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-4 space-y-3 text-xs text-gray-600">
            <p className="text-sm text-gray-700 pb-2 border-b border-gray-100">
              FactorySim is built on the following open-source libraries. We are grateful to their authors and communities.
            </p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-1.5 pr-4 font-semibold text-gray-800 text-xs">Library</th>
                  <th className="py-1.5 pr-4 font-semibold text-gray-800 text-xs">License</th>
                  <th className="py-1.5 font-semibold text-gray-800 text-xs">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { name: 'SimPy', license: 'MIT', purpose: 'Discrete-event simulation engine (Python)' },
                  { name: 'NumPy', license: 'BSD-3-Clause', purpose: 'Numerical computing for statistical distributions' },
                  { name: 'Python', license: 'PSF License', purpose: 'Simulation runtime environment' },
                  { name: 'React', license: 'MIT', purpose: 'User interface framework' },
                  { name: 'Electron', license: 'MIT', purpose: 'Desktop application shell' },
                  { name: 'Three.js', license: 'MIT', purpose: '3D visualization engine' },
                  { name: '@react-three/fiber', license: 'MIT', purpose: 'React renderer for Three.js' },
                  { name: '@react-three/drei', license: 'MIT', purpose: 'Three.js helper components' },
                  { name: 'React Flow', license: 'MIT', purpose: 'Node-based graph editor (Factory Builder)' },
                  { name: 'Zustand', license: 'MIT', purpose: 'State management' },
                  { name: 'Plotly.js', license: 'MIT', purpose: 'Interactive charts and graphs' },
                  { name: 'D3.js', license: 'ISC', purpose: 'Data visualization utilities' },
                  { name: 'Monaco Editor', license: 'MIT', purpose: 'Code editor component' },
                  { name: 'Vite', license: 'MIT', purpose: 'Build tool and dev server' },
                  { name: 'TypeScript', license: 'Apache-2.0', purpose: 'Type-safe JavaScript' },
                  { name: 'Tailwind CSS', license: 'MIT', purpose: 'Utility-first CSS framework' },
                  { name: 'Lucide React', license: 'ISC', purpose: 'Icon library' },
                  { name: 'PapaParse', license: 'MIT', purpose: 'CSV parsing for data import' },
                  { name: 'SheetJS (xlsx)', license: 'Apache-2.0', purpose: 'Excel file import/export' },
                  { name: 'sql.js', license: 'MIT', purpose: 'SQLite database (in-browser)' },
                  { name: 'html2canvas', license: 'MIT', purpose: 'Screenshot capture' },
                  { name: 'Lodash', license: 'MIT', purpose: 'Utility functions' },
                  { name: 'date-fns', license: 'MIT', purpose: 'Date formatting' },
                  { name: 'uuid', license: 'MIT', purpose: 'Unique ID generation' },
                  { name: 'Winston', license: 'MIT', purpose: 'Logging framework' },
                  { name: 'React Router', license: 'MIT', purpose: 'Client-side routing' },
                  { name: 'electron-store', license: 'MIT', purpose: 'Persistent local storage' },
                ].map(dep => (
                  <tr key={dep.name}>
                    <td className="py-1.5 pr-4 font-medium text-gray-800">{dep.name}</td>
                    <td className="py-1.5 pr-4">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[10px]">{dep.license}</span>
                    </td>
                    <td className="py-1.5 text-gray-500">{dep.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-3 text-[11px] text-gray-400 border-t border-gray-100">
              Full license texts are available in the <code className="bg-gray-100 px-1 rounded">node_modules/</code> directory of each respective package and in the <code className="bg-gray-100 px-1 rounded">python/</code> environment for Python dependencies.
            </p>
          </div>
        </details>
      </Card>

      {/* Documentation */}
      <Card>
        <CardHeader title="Documentation" subtitle="How to use FactorySim" />
        <div className="space-y-2 text-sm text-gray-600">
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Factory Builder
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <p className="pb-3 pl-1">Drag stations, buffers, sources, and sinks onto the canvas. Connect them with edges to define material flow. Click any node to edit its parameters (cycle time, capacity, shifts, failures, etc.).</p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Running Simulations
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <p className="pb-3 pl-1">Go to the Dashboard tab and click <strong>Run Simulation</strong>. Configure duration, random seed, and start time. Results appear as KPI cards, utilization charts, and bottleneck analysis. All artifacts (logs, screenshots, code) are auto-saved to the <code className="bg-gray-100 px-1 rounded">runs/</code> folder.</p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Scenarios
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <p className="pb-3 pl-1">Use the Scenarios tab to run what-if analyses. Quick scenarios test common situations (machine failure, demand increase, shift changes). Custom scenarios let you override any parameter and compare results side by side.</p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Code Editor
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <p className="pb-3 pl-1">Export your model as standalone Python/SimPy code. The generated script is fully runnable — install <code className="bg-gray-100 px-1 rounded">simpy</code> and <code className="bg-gray-100 px-1 rounded">numpy</code>, then run <code className="bg-gray-100 px-1 rounded">python simulation-code.py</code>.</p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Node Types
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <ul className="list-disc list-inside space-y-1 ml-2 pb-3">
              <li><strong>Station</strong> — processes parts (cycle time, setup, failures, shifts, scrap)</li>
              <li><strong>Buffer</strong> — queues between stations (FIFO/LIFO/priority, finite capacity)</li>
              <li><strong>Source</strong> — generates parts at a fixed arrival rate</li>
              <li><strong>Sink</strong> — collects finished parts and records throughput</li>
              <li><strong>Conveyor / Inspection / Assembly / Splitter / Merge</strong> — special processing nodes</li>
            </ul>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-800 py-2 hover:text-blue-600 list-none flex items-center justify-between">
              Key Metrics
              <ChevronIcon className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <ul className="list-disc list-inside space-y-1 ml-2 pb-3">
              <li><strong>OEE</strong> — Availability x Performance x Quality (based on bottleneck station)</li>
              <li><strong>Throughput</strong> — parts completed per hour</li>
              <li><strong>Cycle Time</strong> — total time from entry to exit</li>
              <li><strong>WIP</strong> — work-in-progress inventory levels</li>
              <li><strong>Utilization</strong> — busy / idle / blocked / failed / off-shift breakdown per station</li>
            </ul>
          </details>
        </div>
      </Card>

      {/* Release Notes */}
      <Card>
        <details
          className="group"
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open && isNewVersion) markVersionSeen();
          }}
        >
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900">Release Notes — v1.0.0</h3>
              {isNewVersion && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">New</span>
              )}
            </div>
            <ChevronIcon className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="space-y-4 text-sm text-gray-600 mt-4">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-gray-800">v1.0.0</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Current</span>
              </div>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Full discrete-event simulation engine with SimPy backend</li>
                <li>Visual factory builder with drag-and-drop node editor</li>
                <li>10 quick what-if scenarios with baseline comparison</li>
                <li>Custom scenario builder with parameter overrides</li>
                <li>Automatic artifact saving (logs, screenshots, Python code) after every run</li>
                <li>Shift scheduling with day/hour configuration per station</li>
                <li>OEE, throughput, cycle time, WIP, and utilization KPIs</li>
                <li>Bottleneck detection with flow and grid visualizations</li>
                <li>Standalone Python code export (SimPy/NumPy)</li>
                <li>Source/Sink nodes, conveyors, inspection, assembly, splitter, merge</li>
                <li>Operator resources with efficiency modeling</li>
                <li>Multi-product routing with per-product arrival rates</li>
                <li>CSV/Excel data import for model parameters</li>
              </ul>
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} strokeWidth={1.75} />;
}

function XIcon({ className }: { className?: string }) {
  return <X className={className} strokeWidth={1.75} />;
}

function ChevronIcon({ className }: { className?: string }) {
  return <ChevronDown className={className} strokeWidth={1.75} />;
}
