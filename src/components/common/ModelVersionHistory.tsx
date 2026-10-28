import { useState, useEffect } from 'react';
import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

interface ModelVersion {
  id: string;
  modelId: string;
  name: string;
  timestamp: string;
  stationCount: number;
  trigger: string; // 'manual' | 'pre-simulation' | 'auto'
}

const VERSION_STORAGE_KEY = 'factorysim-model-versions';

function loadVersions(modelId: string): ModelVersion[] {
  try {
    const all = JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) || '{}');
    return (all[modelId] || []) as ModelVersion[];
  } catch {
    return [];
  }
}

function saveVersions(modelId: string, versions: ModelVersion[]) {
  try {
    const all = JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) || '{}');
    all[modelId] = versions.slice(0, 20); // Keep last 20 versions
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Save a version snapshot of the current model.
 * Call this before simulation runs or on manual save.
 */
export function saveModelVersion(
  modelId: string,
  modelName: string,
  modelJson: string,
  trigger: string = 'manual'
) {
  const versions = loadVersions(modelId);
  const version: ModelVersion = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    modelId,
    name: modelName,
    timestamp: new Date().toISOString(),
    stationCount: 0,
    trigger,
  };

  try {
    const parsed = JSON.parse(modelJson);
    version.stationCount = parsed.stations?.length || 0;
  } catch { /* ignore */ }

  // Store the full model JSON separately (keyed by version ID)
  try {
    localStorage.setItem(`factorysim-version-${version.id}`, modelJson);
  } catch {
    // Storage full — skip
    return;
  }

  versions.unshift(version);
  saveVersions(modelId, versions);
}

/**
 * Load a specific version's model JSON.
 */
export function loadModelVersion(versionId: string): string | null {
  return localStorage.getItem(`factorysim-version-${versionId}`);
}

interface ModelVersionHistoryProps {
  modelId: string;
  onRevert: (modelJson: string) => void;
}

export function ModelVersionHistory({ modelId, onRevert }: ModelVersionHistoryProps) {
  const { addToast } = useAppStore();
  const [versions, setVersions] = useState<ModelVersion[]>([]);

  useEffect(() => {
    setVersions(loadVersions(modelId));
  }, [modelId]);

  const handleRevert = (version: ModelVersion) => {
    const json = loadModelVersion(version.id);
    if (json) {
      onRevert(json);
      addToast({ type: 'success', message: `Reverted to version from ${new Date(version.timestamp).toLocaleString()}` });
    } else {
      addToast({ type: 'error', message: 'Version data not found' });
    }
  };

  const handleDelete = (versionId: string) => {
    const updated = versions.filter((v) => v.id !== versionId);
    saveVersions(modelId, updated);
    setVersions(updated);
    localStorage.removeItem(`factorysim-version-${versionId}`);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  };

  const triggerLabel: Record<string, string> = {
    'pre-simulation': 'Before sim run',
    manual: 'Manual save',
    auto: 'Auto-save',
  };

  if (versions.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        No version history yet. Versions are saved automatically before each simulation run.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {versions.map((version) => (
        <div key={version.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
          <div className="flex items-center space-x-3 min-w-0">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-700 truncate">
                {formatTime(version.timestamp)}
              </div>
              <div className="text-xs text-gray-400">
                {triggerLabel[version.trigger] || version.trigger} · {version.stationCount} stations
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            <button
              onClick={() => handleRevert(version)}
              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="Revert to this version"
              aria-label={`Revert to version from ${version.timestamp}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(version.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              title="Delete this version"
              aria-label={`Delete version from ${version.timestamp}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
