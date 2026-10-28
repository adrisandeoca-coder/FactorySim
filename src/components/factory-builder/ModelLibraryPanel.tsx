import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import {
  MODEL_LIBRARY,
  MODEL_CATEGORIES,
  searchModels,
  getModelsByCategory,
  type ModelCategory,
  type ModelLibraryEntry,
} from '../factory-builder/3d/model-library/ModelLibraryRegistry';

// ── Tiny offscreen renderer for thumbnails ─────────────────────────────────

const THUMB_SIZE = 128;
let _renderer: THREE.WebGLRenderer | null = null;
let _scene: THREE.Scene | null = null;
let _camera: THREE.PerspectiveCamera | null = null;

function getThumbRenderer() {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    _renderer.setSize(THUMB_SIZE, THUMB_SIZE);
    _renderer.setPixelRatio(1);
    _renderer.outputColorSpace = THREE.SRGBColorSpace;
    _renderer.toneMapping = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = 1.2;
  }
  if (!_scene) {
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x1a1a2e);
    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    _scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    _scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.4);
    fill.position.set(-2, 3, -3);
    _scene.add(fill);
  }
  if (!_camera) {
    _camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  }
  return { renderer: _renderer, scene: _scene, camera: _camera };
}

function renderThumbnail(builder: () => THREE.Group): string {
  const { renderer, scene, camera } = getThumbRenderer();

  // Build model
  const group = builder();
  scene.add(group);

  // Compute bounding box and frame camera
  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2.2;
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.7);
  camera.lookAt(center);

  renderer.render(scene, camera);

  // Extract data URL
  const dataUrl = renderer.domElement.toDataURL('image/png');

  // Cleanup
  scene.remove(group);
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });

  return dataUrl;
}

// ── Thumbnail cache ─────────────────────────────────────────────────────────

const thumbnailCache = new Map<string, string>();

function getThumbnail(entry: ModelLibraryEntry): string {
  if (!thumbnailCache.has(entry.id)) {
    try {
      thumbnailCache.set(entry.id, renderThumbnail(entry.builder));
    } catch {
      thumbnailCache.set(entry.id, '');
    }
  }
  return thumbnailCache.get(entry.id) || '';
}

// ── Lazy Thumbnail Component ────────────────────────────────────────────────

function LazyThumbnail({ entry }: { entry: ModelLibraryEntry }) {
  const [src, setSrc] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thumbnailCache.has(entry.id)) {
      setSrc(thumbnailCache.get(entry.id)!);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSrc(getThumbnail(entry));
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [entry]);

  return (
    <div ref={ref} className="w-full aspect-square bg-gray-800 rounded overflow-hidden">
      {src ? (
        <img src={src} alt={entry.name} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
          Loading...
        </div>
      )}
    </div>
  );
}

// ── Model Library Panel ─────────────────────────────────────────────────────

interface ModelLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  currentModelId?: string;
  nodeType?: string;
  nodeName?: string;
}

export function ModelLibraryPanel({
  isOpen,
  onClose,
  onSelect,
  currentModelId,
  nodeType,
  nodeName,
}: ModelLibraryPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | 'all'>('all');

  const filteredModels = useMemo(() => {
    let results: ModelLibraryEntry[];
    if (search.trim()) {
      results = searchModels(search);
    } else if (selectedCategory === 'all') {
      results = MODEL_LIBRARY;
    } else {
      results = getModelsByCategory(selectedCategory);
    }
    return results;
  }, [search, selectedCategory]);

  const handleClear = useCallback(() => {
    onSelect('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col"
        style={{ width: 720, maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">3D Model Library</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {nodeName
                ? `Select a 3D model for "${nodeName}" (${nodeType})`
                : 'Browse and select 3D models for visualization'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + Categories */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setSelectedCategory('all'); setSearch(''); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === 'all' && !search
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({MODEL_LIBRARY.length})
            </button>
            {MODEL_CATEGORIES.map((cat) => {
              const count = getModelsByCategory(cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setSearch(''); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedCategory === cat.id && !search
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.icon} {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Selection */}
        {currentModelId && (
          <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <span className="text-xs text-blue-700">
              Current: <strong>{MODEL_LIBRARY.find((m) => m.id === currentModelId)?.name || currentModelId}</strong>
            </span>
            <button
              onClick={handleClear}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Reset to default
            </button>
          </div>
        )}

        {/* Model Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filteredModels.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No models found for &ldquo;{search}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {filteredModels.map((entry) => {
                const isSelected = entry.id === currentModelId;
                return (
                  <button
                    key={entry.id}
                    onClick={() => onSelect(entry.id)}
                    className={`group flex flex-col rounded-lg border-2 overflow-hidden transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-blue-300 bg-white'
                    }`}
                  >
                    <LazyThumbnail entry={entry} />
                    <div className="px-2 py-1.5 text-left">
                      <div className="text-xs font-medium text-gray-800 truncate">
                        {entry.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {entry.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-between items-center">
          <span className="text-xs text-gray-400">
            {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Model Selector (for PropertyPanel) ──────────────────────────────

interface ModelSelectorInlineProps {
  nodeId: string;
  currentModelId?: string;
  nodeType: string;
  nodeName: string;
  onSelect: (modelId: string | undefined) => void;
}

export function ModelSelectorInline({
  nodeId: _nodeId,
  currentModelId,
  nodeType,
  nodeName,
  onSelect,
}: ModelSelectorInlineProps) {
  const [showLibrary, setShowLibrary] = useState(false);

  const currentModel = currentModelId
    ? MODEL_LIBRARY.find((m) => m.id === currentModelId)
    : null;

  return (
    <>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <label className="input-label">3D Model Override</label>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setShowLibrary(true)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            {currentModel ? (
              <span className="text-gray-800">{currentModel.name}</span>
            ) : (
              <span className="text-gray-400">Default ({nodeType})</span>
            )}
          </button>
          {currentModelId && (
            <button
              onClick={() => onSelect(undefined)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Reset to default model"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {currentModel && (
          <p className="text-[10px] text-gray-400 mt-1">{currentModel.description}</p>
        )}
      </div>

      <ModelLibraryPanel
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelect={(id) => {
          onSelect(id || undefined);
          setShowLibrary(false);
        }}
        currentModelId={currentModelId}
        nodeType={nodeType}
        nodeName={nodeName}
      />
    </>
  );
}
