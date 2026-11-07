import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';
import type { OPCUANodeInfo, OPCUAReadResult } from '../../types';
import { Cpu, ChevronDown, ChevronUp, ChevronRight, FolderOpen, RefreshCw, Trash2 } from 'lucide-react';

interface OPCUAConnectionForm {
  endpoint: string;
  username: string;
  password: string;
  securityPolicy: string;
}

const DEFAULT_FORM: OPCUAConnectionForm = {
  endpoint: 'opc.tcp://localhost:4840',
  username: '',
  password: '',
  securityPolicy: '',
};

const SECURITY_POLICIES = [
  { value: '', label: 'None (no security)' },
  { value: 'Basic128Rsa15', label: 'Basic128Rsa15' },
  { value: 'Basic256', label: 'Basic256' },
  { value: 'Basic256Sha256', label: 'Basic256Sha256' },
];

interface BrowseEntry extends OPCUANodeInfo {
  children?: BrowseEntry[];
  expanded?: boolean;
  loading?: boolean;
}

interface ReadEntry {
  nodeId: string;
  value: unknown;
  dataType: string;
  timestamp: string;
  error?: string;
}

export function OPCUAConnector() {
  const { addToast } = useAppStore();
  const [form, setForm] = useState<OPCUAConnectionForm>(() => {
    try {
      const saved = localStorage.getItem('factorysim-opcua-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_FORM, ...parsed };
      }
    } catch { /* ignore */ }
    return DEFAULT_FORM;
  });

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  // Node browser state
  const [browseTree, setBrowseTree] = useState<BrowseEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Read node state
  const [readNodeId, setReadNodeId] = useState('');
  const [readResults, setReadResults] = useState<ReadEntry[]>([]);
  const [reading, setReading] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [watchedNodes, setWatchedNodes] = useState<string[]>([]);

  const persistConfig = useCallback((config: OPCUAConnectionForm) => {
    try {
      const { password, ...safe } = config;
      localStorage.setItem('factorysim-opcua-config', JSON.stringify(safe));
    } catch { /* ignore */ }
  }, []);

  const updateField = <K extends keyof OPCUAConnectionForm>(key: K, value: OPCUAConnectionForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      persistConfig(next);
      return next;
    });
  };

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !connected || watchedNodes.length === 0) return;

    const interval = setInterval(async () => {
      const api = window.factorySim?.opcua;
      if (!api) return;

      for (const nodeId of watchedNodes) {
        try {
          const result: OPCUAReadResult = await api.read({ nodeId });
          if (result.success) {
            setReadResults(prev => {
              const existing = prev.findIndex(r => r.nodeId === nodeId);
              const entry: ReadEntry = {
                nodeId,
                value: result.value,
                dataType: result.dataType || 'unknown',
                timestamp: result.timestamp || new Date().toISOString(),
              };
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = entry;
                return next;
              }
              return [...prev, entry];
            });
          }
        } catch { /* ignore polling errors */ }
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, connected, watchedNodes, refreshInterval]);

  const handleConnect = async () => {
    const api = window.factorySim?.opcua;
    if (!api) {
      addToast({ type: 'error', message: 'OPC-UA API not available (Electron bridge required)' });
      return;
    }

    setConnecting(true);
    try {
      const result = await api.connect({
        endpoint: form.endpoint,
        username: form.username || undefined,
        password: form.password || undefined,
        securityPolicy: form.securityPolicy || undefined,
      });

      if (result.status === 'connected') {
        setConnected(true);
        setShowSettings(false);
        addToast({ type: 'success', message: `Connected to ${form.endpoint}` });
        // Auto-browse root
        await browseRoot();
      } else {
        addToast({ type: 'error', message: `Connection failed: ${result.error || 'Unknown error'}` });
      }
    } catch (err) {
      addToast({ type: 'error', message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const api = window.factorySim?.opcua;
    if (!api) return;

    try {
      await api.disconnect();
      setConnected(false);
      setBrowseTree([]);
      setReadResults([]);
      setWatchedNodes([]);
      setAutoRefresh(false);
      addToast({ type: 'info', message: 'Disconnected from OPC-UA server' });
    } catch (err) {
      addToast({ type: 'error', message: `Disconnect error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
  };

  const browseRoot = async () => {
    const api = window.factorySim?.opcua;
    if (!api) return;

    setBrowseLoading(true);
    try {
      const result = await api.browse();
      if (result.success && result.children) {
        setBrowseTree(result.children.map(c => ({
          ...c,
          expanded: false,
          loading: false,
        })));
      } else {
        addToast({ type: 'error', message: result.error || 'Browse failed' });
      }
    } catch (err) {
      addToast({ type: 'error', message: `Browse error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setBrowseLoading(false);
    }
  };

  const browseNode = async (nodeId: string, path: number[]) => {
    const api = window.factorySim?.opcua;
    if (!api) return;

    // Set loading state
    setBrowseTree(prev => updateTreeNode(prev, path, { loading: true }));

    try {
      const result = await api.browse({ nodeId });
      if (result.success && result.children) {
        const children: BrowseEntry[] = result.children.map(c => ({
          ...c,
          expanded: false,
          loading: false,
        }));
        setBrowseTree(prev => updateTreeNode(prev, path, {
          expanded: true,
          loading: false,
          children,
        }));
      } else {
        setBrowseTree(prev => updateTreeNode(prev, path, { loading: false }));
        addToast({ type: 'error', message: result.error || 'Browse failed' });
      }
    } catch {
      setBrowseTree(prev => updateTreeNode(prev, path, { loading: false }));
    }
  };

  const toggleNode = (nodeId: string, path: number[], isExpanded: boolean) => {
    if (isExpanded) {
      // Collapse
      setBrowseTree(prev => updateTreeNode(prev, path, { expanded: false }));
    } else {
      // Expand — browse children
      browseNode(nodeId, path);
    }
  };

  const handleReadNode = async () => {
    if (!readNodeId.trim()) return;
    const api = window.factorySim?.opcua;
    if (!api) return;

    setReading(true);
    try {
      const result: OPCUAReadResult = await api.read({ nodeId: readNodeId.trim() });
      const entry: ReadEntry = {
        nodeId: readNodeId.trim(),
        value: result.success ? result.value : undefined,
        dataType: result.dataType || 'unknown',
        timestamp: result.timestamp || new Date().toISOString(),
        error: result.success ? undefined : result.error,
      };
      setReadResults(prev => [entry, ...prev].slice(0, 50));
    } catch (err) {
      setReadResults(prev => [{
        nodeId: readNodeId.trim(),
        value: undefined,
        dataType: 'error',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      }, ...prev].slice(0, 50));
    } finally {
      setReading(false);
    }
  };

  const addToWatch = (nodeId: string) => {
    setWatchedNodes(prev => {
      if (prev.includes(nodeId)) return prev;
      return [...prev, nodeId];
    });
    addToast({ type: 'info', message: `Watching ${nodeId}` });
  };

  const removeFromWatch = (nodeId: string) => {
    setWatchedNodes(prev => prev.filter(n => n !== nodeId));
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection Header */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              connected ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <Cpu className={`w-5 h-5 ${connected ? 'text-green-600' : 'text-gray-400'}`} strokeWidth={1.75} />
            </div>
            <div>
              <div className="font-medium text-gray-900">
                OPC-UA Connector
                {connected && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    Connected
                  </span>
                )}
                {!connected && !connecting && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    Disconnected
                  </span>
                )}
                {connecting && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                    Connecting...
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {connected
                  ? form.endpoint
                  : 'Connect to an OPC-UA server for industrial machine data'
                }
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              title={showSettings ? 'Hide settings' : 'Show settings'}
            >
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {connected ? (
              <Button variant="secondary" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} disabled={connecting || !form.endpoint}>
                {connecting ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>

        {/* Settings Form */}
        {showSettings && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input
                  type="text"
                  className="input"
                  value={form.endpoint}
                  onChange={(e) => updateField('endpoint', e.target.value)}
                  placeholder="opc.tcp://localhost:4840"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={form.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder="Leave blank if not required"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Leave blank if not required"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Security Policy</label>
                <select
                  className="input"
                  value={form.securityPolicy}
                  onChange={(e) => updateField('securityPolicy', e.target.value)}
                  disabled={connected}
                >
                  {SECURITY_POLICIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Connected features */}
      {connected && (
        <>
          {/* Node Browser + Read Value side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Node Browser */}
            <Card>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div>
                  <div className="font-medium text-gray-900">Namespace Browser</div>
                  <div className="text-sm text-gray-500">Browse the OPC-UA server namespace</div>
                </div>
                <Button variant="ghost" size="sm" onClick={browseRoot} title="Refresh">
                  <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>

              <div className="max-h-80 overflow-y-auto border-t border-gray-100 p-2">
                {browseLoading ? (
                  <div className="text-center py-8 text-gray-400 text-sm">Loading namespace...</div>
                ) : browseTree.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No nodes found</div>
                ) : (
                  <div className="space-y-0.5">
                    {browseTree.map((node, i) => (
                      <TreeNode
                        key={node.nodeId}
                        node={node}
                        path={[i]}
                        depth={0}
                        onToggle={toggleNode}
                        onRead={(nodeId) => { setReadNodeId(nodeId); handleReadNodeDirect(nodeId); }}
                        onWatch={addToWatch}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Read Value */}
            <Card>
              <CardHeader
                title="Read Node Value"
                subtitle="Enter a node ID to read its current value"
              />
              <div className="px-4 pb-4 space-y-3">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    className="input flex-1"
                    value={readNodeId}
                    onChange={(e) => setReadNodeId(e.target.value)}
                    placeholder='e.g. ns=2;i=1234 or ns=2;s="Temperature"'
                    onKeyDown={(e) => e.key === 'Enter' && handleReadNode()}
                  />
                  <Button size="sm" onClick={handleReadNode} disabled={reading || !readNodeId.trim()}>
                    {reading ? 'Reading...' : 'Read'}
                  </Button>
                </div>

                {/* Results */}
                <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg">
                  {readResults.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      No values read yet
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {readResults.map((entry, i) => (
                        <div key={i} className="px-3 py-2 hover:bg-gray-50 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-blue-600 text-xs">{entry.nodeId}</span>
                            <span className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</span>
                          </div>
                          {entry.error ? (
                            <div className="text-red-600 text-xs mt-0.5">{entry.error}</div>
                          ) : (
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-gray-700 font-mono text-xs break-all">
                                {formatValue(entry.value)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{entry.dataType}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Auto-refresh / Watched Nodes */}
          <Card>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <div className="font-medium text-gray-900">Watched Nodes</div>
                <div className="text-sm text-gray-500">
                  {watchedNodes.length} node{watchedNodes.length !== 1 ? 's' : ''} watched
                  {autoRefresh && ` | refreshing every ${refreshInterval}s`}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600">Interval (s):</label>
                  <input
                    type="number"
                    className="input w-16 text-sm"
                    min={1}
                    max={60}
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Math.max(1, parseInt(e.target.value) || 5))}
                  />
                </div>
                <Button
                  size="sm"
                  variant={autoRefresh ? 'secondary' : 'primary'}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  disabled={watchedNodes.length === 0}
                >
                  {autoRefresh ? 'Stop' : 'Auto-Refresh'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setWatchedNodes([]); setAutoRefresh(false); }}
                  title="Clear all watched nodes"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>

            <div className="border-t border-gray-100">
              {watchedNodes.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  Click the eye icon on a node in the browser to watch it
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {watchedNodes.map(nodeId => {
                    const latest = readResults.find(r => r.nodeId === nodeId);
                    return (
                      <div key={nodeId} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-blue-600 text-xs">{nodeId}</span>
                          {latest && !latest.error && (
                            <div className="text-sm text-gray-700 font-mono mt-0.5">
                              {formatValue(latest.value)}
                              <span className="text-xs text-gray-400 ml-2">{latest.dataType}</span>
                              <span className="text-xs text-gray-400 ml-2">{formatTimestamp(latest.timestamp)}</span>
                            </div>
                          )}
                          {latest?.error && (
                            <div className="text-xs text-red-600 mt-0.5">{latest.error}</div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromWatch(nodeId)}
                          title="Stop watching"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );

  // Helper: read a node directly (used from tree click)
  async function handleReadNodeDirect(nodeId: string) {
    const api = window.factorySim?.opcua;
    if (!api) return;

    try {
      const result: OPCUAReadResult = await api.read({ nodeId });
      const entry: ReadEntry = {
        nodeId,
        value: result.success ? result.value : undefined,
        dataType: result.dataType || 'unknown',
        timestamp: result.timestamp || new Date().toISOString(),
        error: result.success ? undefined : result.error,
      };
      setReadResults(prev => [entry, ...prev.filter(r => r.nodeId !== nodeId)].slice(0, 50));
    } catch (err) {
      setReadResults(prev => [{
        nodeId,
        value: undefined,
        dataType: 'error',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      }, ...prev.filter(r => r.nodeId !== nodeId)].slice(0, 50));
    }
  }
}

// Helper: update a node in the tree by path
function updateTreeNode(tree: BrowseEntry[], path: number[], updates: Partial<BrowseEntry>): BrowseEntry[] {
  if (path.length === 0) return tree;
  const result = [...tree];
  const [idx, ...rest] = path;

  if (rest.length === 0) {
    result[idx] = { ...result[idx], ...updates };
  } else {
    result[idx] = {
      ...result[idx],
      children: updateTreeNode(result[idx].children || [], rest, updates),
    };
  }
  return result;
}

// Tree node component for namespace browser
function TreeNode({
  node,
  path,
  depth,
  onToggle,
  onRead,
  onWatch,
}: {
  node: BrowseEntry;
  path: number[];
  depth: number;
  onToggle: (nodeId: string, path: number[], isExpanded: boolean) => void;
  onRead: (nodeId: string) => void;
  onWatch: (nodeId: string) => void;
}) {
  return (
    <div>
      <div
        className="flex items-center py-1 px-1 hover:bg-blue-50 rounded text-sm group cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <button
          className="w-4 h-4 flex items-center justify-center mr-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
          onClick={() => onToggle(node.nodeId, path, !!node.expanded)}
        >
          {node.loading ? (
            <RefreshCw className="w-3 h-3 animate-spin" strokeWidth={2} />
          ) : node.expanded ? (
            <ChevronDown className="w-3 h-3" strokeWidth={2} />
          ) : (
            <ChevronRight className="w-3 h-3" strokeWidth={2} />
          )}
        </button>

        <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-amber-500 flex-shrink-0" strokeWidth={1.75} />

        <span
          className="text-gray-800 truncate flex-1"
          title={`${node.displayName} (${node.nodeId})`}
          onClick={() => onToggle(node.nodeId, path, !!node.expanded)}
        >
          {node.displayName}
        </span>

        <span className="text-xs text-gray-400 ml-1 hidden group-hover:inline font-mono truncate max-w-[140px]">
          {node.nodeId}
        </span>

        <div className="hidden group-hover:flex items-center space-x-1 ml-1 flex-shrink-0">
          <button
            className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
            onClick={(e) => { e.stopPropagation(); onRead(node.nodeId); }}
            title="Read value"
          >
            Read
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
            onClick={(e) => { e.stopPropagation(); onWatch(node.nodeId); }}
            title="Watch node"
          >
            Watch
          </button>
        </div>
      </div>

      {node.expanded && node.children && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode
              key={child.nodeId}
              node={child}
              path={[...path, i]}
              depth={depth + 1}
              onToggle={onToggle}
              onRead={onRead}
              onWatch={onWatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
