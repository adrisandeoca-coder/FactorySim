import { useState, useEffect, useCallback } from 'react';
import type { PluginInfo } from '../../types';

export function PluginManager() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const loadPlugins = useCallback(async () => {
    try {
      setLoading(true);
      const list = await window.factorySim?.plugins?.list();
      setPlugins(list || []);
    } catch (err) {
      console.error('Failed to load plugins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleToggle = async (plugin: PluginInfo) => {
    try {
      if (plugin.enabled) {
        await window.factorySim?.plugins?.disable(plugin.name);
      } else {
        await window.factorySim?.plugins?.enable(plugin.name);
      }
      await loadPlugins();
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
    }
  };

  const handleReload = async () => {
    try {
      await window.factorySim?.plugins?.reload();
      await loadPlugins();
    } catch (err) {
      console.error('Failed to reload plugins:', err);
    }
  };

  const handleViewLogs = async (name: string) => {
    setSelectedPlugin(name);
    try {
      const pluginLogs = await window.factorySim?.plugins?.getLogs(name);
      setLogs(pluginLogs || []);
    } catch {
      setLogs(['Failed to fetch logs']);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await window.factorySim?.plugins?.openFolder();
    } catch (err) {
      console.error('Failed to open plugins folder:', err);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Plugins</h1>
        <div className="flex gap-2">
          <button
            onClick={handleOpenFolder}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
          >
            Open Plugins Folder
          </button>
          <button
            onClick={handleReload}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Reload
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        Place Python plugins in the plugins folder. Each plugin should be a <code>.py</code> file
        with a class that extends <code>PluginBase</code>. Plugins can hook into simulation lifecycle
        events: <code>pre_run</code>, <code>post_run</code>, <code>on_event</code>, <code>custom_kpi</code>.
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading plugins...</div>
      ) : plugins.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-2">No plugins found</p>
          <p className="text-sm text-gray-400">
            Add Python files to the plugins folder and click Reload.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{plugin.name}</h3>
                  <span className="text-xs text-gray-400">v{plugin.version}</span>
                  {plugin.errors && plugin.errors.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Error</span>
                  )}
                </div>
                {plugin.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{plugin.description}</p>
                )}
                {plugin.hooks.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {plugin.hooks.map((hook) => (
                      <span
                        key={hook}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                      >
                        {hook}
                      </span>
                    ))}
                  </div>
                )}
                {plugin.errors && plugin.errors.length > 0 && (
                  <p className="text-xs text-red-600 mt-1">{plugin.errors.join(', ')}</p>
                )}
              </div>

              <button
                onClick={() => handleViewLogs(plugin.name)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logs
              </button>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={plugin.enabled}
                  onChange={() => handleToggle(plugin)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          ))}
        </div>
      )}

      {/* Log Viewer */}
      {selectedPlugin && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-800">Logs: {selectedPlugin}</h3>
            <button
              onClick={() => setSelectedPlugin(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <div className="bg-gray-900 rounded p-3 max-h-64 overflow-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-sm font-mono">No logs</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="text-green-400 text-xs font-mono leading-relaxed">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
