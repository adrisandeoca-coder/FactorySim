import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';

interface SavedModelSummary {
  id: string;
  name: string;
  description?: string;
  stationCount: number;
  updatedAt: string;
}

interface ModelManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModelManager({ isOpen, onClose }: ModelManagerProps) {
  const { setModel, resetModel } = useModelStore();
  const { addToast } = useAppStore();
  const [savedModels, setSavedModels] = useState<SavedModelSummary[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      listSavedModels().then(setSavedModels);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoad = async (id: string) => {
    try {
      const loaded = await loadModelFromStorage(id);
      if (loaded) {
        setModel(loaded);
        addToast({ type: 'success', message: `Loaded "${loaded.name}"` });
        onClose();
      }
    } catch {
      addToast({ type: 'error', message: 'Failed to load model' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteModelFromStorage(id);
      setSavedModels(savedModels.filter((m) => m.id !== id));
      setDeleteConfirm(null);
      addToast({ type: 'success', message: 'Model deleted' });
    } catch {
      addToast({ type: 'error', message: 'Failed to delete model' });
    }
  };

  const handleNewModel = () => {
    resetModel();
    addToast({ type: 'info', message: 'New empty model created' });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Saved Models</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {savedModels.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FolderIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No saved models yet</p>
              <p className="text-xs mt-1">Save your current model using the save button in the header</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {m.stationCount} stations &middot; Updated {formatDate(m.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 ml-3">
                    {deleteConfirm === m.id ? (
                      <>
                        <span className="text-xs text-red-600 mr-1">Delete?</span>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(m.id)}>
                          Yes
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDeleteConfirm(null)}>
                          No
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => handleLoad(m.id)}>
                          Load
                        </Button>
                        <button
                          onClick={() => setDeleteConfirm(m.id)}
                          className="p-1.5 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <Button variant="secondary" size="sm" onClick={handleNewModel}>
            New Model
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// Storage helpers

async function listSavedModels(): Promise<SavedModelSummary[]> {
  try {
    const win = window as any;
    if (win.factorySim?.model?.listModels) {
      return await win.factorySim.model.listModels();
    }
  } catch { /* fallback */ }

  // localStorage fallback
  try {
    const indexJson = localStorage.getItem('factorysim-model-index');
    if (indexJson) {
      return JSON.parse(indexJson) as SavedModelSummary[];
    }
  } catch { /* ignore */ }
  return [];
}

async function loadModelFromStorage(id: string): Promise<any | null> {
  try {
    const win = window as any;
    if (win.factorySim?.model?.loadModel) {
      return await win.factorySim.model.loadModel(id);
    }
  } catch { /* fallback */ }

  try {
    const json = localStorage.getItem(`factorysim-models-${id}`);
    if (json) return JSON.parse(json);
  } catch { /* ignore */ }
  return null;
}

async function deleteModelFromStorage(id: string): Promise<void> {
  try {
    const win = window as any;
    if (win.factorySim?.model?.deleteModel) {
      await win.factorySim.model.deleteModel(id);
      return;
    }
  } catch { /* fallback */ }

  // localStorage fallback
  localStorage.removeItem(`factorysim-models-${id}`);
  try {
    const indexJson = localStorage.getItem('factorysim-model-index');
    if (indexJson) {
      const index = JSON.parse(indexJson) as SavedModelSummary[];
      localStorage.setItem(
        'factorysim-model-index',
        JSON.stringify(index.filter((m) => m.id !== id))
      );
    }
  } catch { /* ignore */ }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
