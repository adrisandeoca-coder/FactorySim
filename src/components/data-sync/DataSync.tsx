import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useAppStore } from '../../stores/appStore';
import { useModelStore } from '../../stores/modelStore';
import { downloadDemoExcelTemplate } from '../../services/demoExcelGenerator';
import { downloadModelExcel } from '../../services/modelExcelExporter';
import { importWorkbook, type ImportResult } from '../../services/excelImporter';
import { captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';

type ImportMode = 'replace' | 'merge';

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

interface Connector {
  id: string;
  name: string;
  type: 'csv' | 'mes' | 'erp' | 'mqtt' | 'opcua';
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  config: Record<string, unknown>;
}

export function DataSync() {
  const { addToast } = useAppStore();
  const modelStore = useModelStore();
  const dataSyncRef = useRef<HTMLDivElement>(null);

  // Register data sync tab for cross-tab screenshot capture
  useEffect(() => {
    registerElement('data-sync-tab', dataSyncRef.current);
    return () => {
      if (dataSyncRef.current) {
        captureToBase64(dataSyncRef.current)
          .then((base64) => setCachedImage('data-sync-tab', base64))
          .catch(() => {});
      }
      registerElement('data-sync-tab', null);
    };
  }, []);

  const [connectors, setConnectors] = useState<Connector[]>([
    {
      id: '1',
      name: 'Production Data (CSV)',
      type: 'csv',
      status: 'connected',
      lastSync: new Date().toISOString(),
      config: { filePath: '/data/production.csv' },
    },
  ]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddConnector, setShowAddConnector] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [notifiedTypes, setNotifiedTypes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('factorysim-notify-interest');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  /** Read the selected file and show a preview of what will be imported. */
  const previewFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const result = importWorkbook(buffer);
      setImportPreview(result);
    } catch (err) {
      addToast({ type: 'error', message: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}` });
      setImportPreview(null);
    }
  };

  const handleImport = async () => {
    if (!importFile || !importPreview) {
      addToast({ type: 'warning', message: 'Please select a file' });
      return;
    }

    setImporting(true);
    try {
      const { stations, buffers, connections, products, resources, extraNodes, orders } = importPreview;

      if (importMode === 'replace') {
        // Build a new model from imported data
        const newModel = {
          ...modelStore.model,
          stations,
          buffers,
          connections,
          products,
          resources,
          extraNodes,
          orders: orders.map(o => ({
            id: o.id,
            productId: o.productId,
            quantity: o.quantity,
            priority: o.priority,
            dueDate: o.dueDate,
            status: o.status,
            isWip: o.isWip,
            initialStationId: o.initialStationId,
          })),
        };
        modelStore.setModel(newModel);
      } else {
        // Merge: add imported items to existing model
        stations.forEach(s => modelStore.addStation(s));
        buffers.forEach(b => modelStore.addBuffer(b));
        connections.forEach(c => modelStore.addConnection(c));
        products.forEach(p => modelStore.addProduct(p));
        resources.forEach(r => modelStore.addResource(r));
        extraNodes.forEach(n => modelStore.addExtraNode(n.type, n.data, n.position));
        if (orders.length) {
          const existing = modelStore.model.orders || [];
          modelStore.setOrders([...existing, ...orders.map(o => ({
            id: o.id,
            productId: o.productId,
            quantity: o.quantity,
            priority: o.priority,
            dueDate: o.dueDate,
            status: o.status as 'pending' | 'in_progress' | 'completed' | 'late',
            isWip: o.isWip,
            initialStationId: o.initialStationId,
          }))]);
        }
      }

      const parts: string[] = [];
      if (stations.length) parts.push(`${stations.length} stations`);
      if (buffers.length) parts.push(`${buffers.length} buffers`);
      if (connections.length) parts.push(`${connections.length} connections`);
      if (products.length) parts.push(`${products.length} products`);
      if (resources.length) parts.push(`${resources.length} resources`);
      if (extraNodes.length) parts.push(`${extraNodes.length} extra nodes`);
      if (orders.length) parts.push(`${orders.length} orders (view in Order Manager)`);

      addToast({
        type: 'success',
        message: parts.length > 0
          ? `Imported: ${parts.join(', ')}`
          : 'No data found in file',
      });

      setShowImportModal(false);
      setImportFile(null);
      setImportPreview(null);
    } catch (err) {
      addToast({ type: 'error', message: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setImporting(false);
    }
  };

  const handleSync = (connectorId: string) => {
    const connector = connectors.find((c) => c.id === connectorId);
    if (connector) {
      addToast({ type: 'info', message: `Syncing ${connector.name}...` });

      setTimeout(() => {
        setConnectors((prev) =>
          prev.map((c) =>
            c.id === connectorId
              ? { ...c, lastSync: new Date().toISOString(), status: 'connected' }
              : c
          )
        );
        addToast({ type: 'success', message: 'Sync completed' });
      }, 1000);
    }
  };

  const connectorTypes = [
    { type: 'csv', name: 'CSV / Excel', description: 'Import from local files', icon: FileIcon },
    { type: 'mes', name: 'MES (REST API)', description: 'Connect to Manufacturing Execution System', icon: ServerIcon },
    { type: 'mqtt', name: 'IoT (MQTT)', description: 'Real-time sensor data via MQTT', icon: WifiIcon },
    { type: 'opcua', name: 'OPC-UA', description: 'Industrial protocol for machine data', icon: CpuIcon },
  ];

  return (
    <div className="space-y-6" ref={dataSyncRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Sync</h1>
          <p className="text-gray-500">Connect to external data sources and import data</p>
        </div>

        <div className="flex items-center space-x-3">
          {modelStore.model && (
            <Button variant="ghost" onClick={() => {
              downloadModelExcel(modelStore.model!);
              addToast({ type: 'success', message: 'Model exported to Excel' });
            }}>
              <DownloadIcon className="w-4 h-4 mr-2" />
              Export Model
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowImportModal(true)}>
            <UploadIcon className="w-4 h-4 mr-2" />
            Import Data
          </Button>
          <Button onClick={() => setShowAddConnector(true)}>
            + Add Connector
          </Button>
        </div>
      </div>

      {/* Quick Import */}
      <Card>
        <CardHeader
          title="Quick Import"
          subtitle="Drag and drop files or click to browse"
        />
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
          onClick={() => document.getElementById('file-input')?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) {
              setImportFile(file);
              setShowImportModal(true);
              previewFile(file);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <UploadIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Drop CSV or Excel files here</p>
          <p className="text-sm text-gray-400 mt-1">Supports .csv, .xlsx, .xls</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadDemoExcelTemplate();
              addToast({ type: 'success', message: 'Demo template downloaded' });
            }}
            className="text-sm text-blue-600 hover:text-blue-800 underline mt-2 inline-block"
          >
            Download template with sample data
          </button>
          <input
            id="file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setImportFile(file);
                setShowImportModal(true);
                previewFile(file);
              }
            }}
          />
        </div>
      </Card>

      {/* Active Connectors */}
      <Card>
        <CardHeader
          title="Active Connectors"
          subtitle={`${connectors.length} connector(s) configured`}
        />

        {connectors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <PlugIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No connectors configured</p>
            <p className="text-sm">Add a connector to sync data from external sources</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    connector.status === 'connected' ? 'bg-green-100' :
                    connector.status === 'error' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <ConnectorIcon type={connector.type} className={`w-5 h-5 ${
                      connector.status === 'connected' ? 'text-green-600' :
                      connector.status === 'error' ? 'text-red-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{connector.name}</div>
                    <div className="text-sm text-gray-500" title={connector.lastSync ? new Date(connector.lastSync).toLocaleString() : undefined}>
                      {connector.lastSync
                        ? `Last sync: ${relativeTime(connector.lastSync)}`
                        : 'Never synced'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    connector.status === 'connected' ? 'bg-green-100 text-green-700' :
                    connector.status === 'error' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {connector.status}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleSync(connector.id)} title="Sync now">
                    <RefreshIcon className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Connector settings">
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Available Connector Types */}
      <Card>
        <CardHeader
          title="Available Connectors"
          subtitle="Connect to various data sources"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {connectorTypes.map((type) => {
            const isAvailable = type.type === 'csv';
            return (
              <div
                key={type.type}
                className={`p-4 border border-gray-200 rounded-lg transition-colors ${
                  isAvailable
                    ? 'hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                    : 'opacity-75'
                }`}
                onClick={isAvailable ? () => setShowAddConnector(true) : undefined}
              >
                <div className="flex items-start justify-between">
                  <type.icon className={`w-8 h-8 ${isAvailable ? 'text-blue-600' : 'text-gray-400'} mb-2`} />
                  {!isAvailable && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      Coming Soon
                    </span>
                  )}
                </div>
                <div className="font-medium text-gray-900">{type.name}</div>
                <div className="text-sm text-gray-500 mt-1">{type.description}</div>
                {!isAvailable && (
                  <button
                    className={`mt-2 text-xs px-2 py-1 rounded ${
                      notifiedTypes.has(type.type)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    } transition-colors`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (notifiedTypes.has(type.type)) return;
                      const next = new Set(notifiedTypes);
                      next.add(type.type);
                      setNotifiedTypes(next);
                      try { localStorage.setItem('factorysim-notify-interest', JSON.stringify([...next])); } catch {}
                      addToast({ type: 'success', message: `We'll notify you when ${type.name} is available` });
                    }}
                  >
                    {notifiedTypes.has(type.type) ? 'Requested \u2713' : 'Notify Me'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportFile(null);
          setImportPreview(null);
        }}
        title="Import Data"
      >
        <div className="space-y-4">
          {importFile && (
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <FileIcon className="w-8 h-8 text-blue-600" />
              <div>
                <div className="font-medium">{importFile.name}</div>
                <div className="text-sm text-gray-500">
                  {(importFile.size / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>
          )}

          {/* Import mode */}
          <div>
            <label className="input-label">Import Mode</label>
            <select
              className="input"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
            >
              <option value="replace">Replace current model</option>
              <option value="merge">Merge into current model</option>
            </select>
          </div>

          {/* Preview */}
          {importPreview && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-gray-700">Detected Sheets</div>
              <div className="text-xs text-gray-500 mb-2">
                {importPreview.sheetsFound.join(', ')}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {importPreview.stations.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stations</span>
                    <span className="font-medium">{importPreview.stations.length}</span>
                  </div>
                )}
                {importPreview.buffers.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Buffers</span>
                    <span className="font-medium">{importPreview.buffers.length}</span>
                  </div>
                )}
                {importPreview.connections.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Connections</span>
                    <span className="font-medium">{importPreview.connections.length}</span>
                  </div>
                )}
                {importPreview.products.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Products</span>
                    <span className="font-medium">{importPreview.products.length}</span>
                  </div>
                )}
                {importPreview.orders.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Orders</span>
                    <span className="font-medium">{importPreview.orders.length}</span>
                  </div>
                )}
                {importPreview.resources.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Resources</span>
                    <span className="font-medium">{importPreview.resources.length}</span>
                  </div>
                )}
                {importPreview.extraNodes.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Extra Nodes</span>
                    <span className="font-medium">{importPreview.extraNodes.length}</span>
                  </div>
                )}
              </div>
              {importPreview.stations.length === 0 &&
               importPreview.buffers.length === 0 &&
               importPreview.extraNodes.length === 0 && (
                <div className="text-sm text-amber-600">
                  No recognized sheets found. Make sure sheet names match: Stations, Buffers, Connections, Products, Orders, Resources, Extra Nodes
                </div>
              )}
            </div>
          )}

          {!importPreview && importFile && (
            <div className="text-sm text-gray-500 text-center py-2">
              Reading file...
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={() => {
              setShowImportModal(false);
              setImportFile(null);
              setImportPreview(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importPreview || importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Connector Modal */}
      <Modal
        isOpen={showAddConnector}
        onClose={() => setShowAddConnector(false)}
        title="Add Connector"
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Connector Type</label>
            <select className="input">
              <option value="csv">CSV / Excel</option>
              <option value="mes">MES (REST API)</option>
              <option value="mqtt">IoT (MQTT)</option>
              <option value="opcua">OPC-UA</option>
            </select>
          </div>

          <div>
            <label className="input-label">Name</label>
            <input type="text" className="input" placeholder="e.g., Production MES" />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={() => setShowAddConnector(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              addToast({ type: 'success', message: 'Connector added' });
              setShowAddConnector(false);
            }}>
              Add Connector
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ConnectorIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'csv':
      return <FileIcon className={className} />;
    case 'mes':
      return <ServerIcon className={className} />;
    case 'mqtt':
      return <WifiIcon className={className} />;
    case 'opcua':
      return <CpuIcon className={className} />;
    default:
      return <PlugIcon className={className} />;
  }
}

// Icons
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  );
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

