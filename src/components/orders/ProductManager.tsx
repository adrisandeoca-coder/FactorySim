import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import type { Product } from '../../types';

export function ProductManager() {
  const { model, addProduct, updateProduct, removeProduct } = useModelStore();
  const { addToast } = useAppStore();

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    routing: [] as string[],
    arrivalRate: 120,
    priority: 1,
  });

  const stations = model.stations;

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', routing: [], arrivalRate: 120, priority: 1 });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      routing: product.routing || [],
      arrivalRate: product.arrivalRate || 120,
      priority: product.priority || 1,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      addToast({ type: 'warning', message: 'Please enter a product name' });
      return;
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: formData.name,
        routing: formData.routing,
        arrivalRate: formData.arrivalRate,
        priority: formData.priority,
      });
      addToast({ type: 'success', message: 'Product updated' });
    } else {
      addProduct({
        name: formData.name,
        routing: formData.routing,
        arrivalRate: formData.arrivalRate,
        priority: formData.priority,
      });
      addToast({ type: 'success', message: 'Product created' });
    }

    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    removeProduct(id);
    setDeleteConfirm(null);
    addToast({ type: 'info', message: 'Product deleted' });
  };

  const addRoutingStep = () => {
    if (stations.length === 0) return;
    setFormData({
      ...formData,
      routing: [...formData.routing, stations[0].id],
    });
  };

  const removeRoutingStep = (index: number) => {
    setFormData({
      ...formData,
      routing: formData.routing.filter((_, i) => i !== index),
    });
  };

  const updateRoutingStep = (index: number, stationId: string) => {
    const newRouting = [...formData.routing];
    newRouting[index] = stationId;
    setFormData({ ...formData, routing: newRouting });
  };

  const getStationName = (id: string) => {
    return stations.find((s) => s.id === id)?.name || id;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500">Define products with routing and arrival rates</p>
        </div>
        <Button onClick={openCreateModal}>
          <PlusIcon className="w-4 h-4 mr-2" />
          New Product
        </Button>
      </div>

      {/* Product List */}
      {model.products.length === 0 ? (
        <Card>
          <div className="text-center py-8 text-gray-500">
            <BoxIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No products defined yet.</p>
            <p className="text-sm mt-1">Create a product to define its routing through stations.</p>
            {stations.length === 0 && (
              <p className="text-sm text-amber-600 mt-2">
                Tip: Add stations in the Factory Builder first, then define product routings.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {model.products.map((product) => (
            <Card key={product.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                      Priority {product.priority || 0}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    Arrival: every {product.arrivalRate || '—'}s
                  </div>
                  {product.routing && product.routing.length > 0 && (
                    <div className="mt-2 flex items-center flex-wrap gap-1">
                      <span className="text-xs text-gray-400 mr-1">Routing:</span>
                      {product.routing.map((stationId, i) => (
                        <React.Fragment key={i}>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                            {getStationName(stationId)}
                          </span>
                          {i < product.routing.length - 1 && (
                            <ArrowRightIcon className="w-3 h-3 text-gray-400" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    className="p-1.5 hover:bg-gray-100 rounded"
                    title="Edit"
                    onClick={() => openEditModal(product)}
                  >
                    <PencilIcon className="w-4 h-4 text-gray-500" />
                  </button>
                  {deleteConfirm === product.id ? (
                    <div className="flex items-center space-x-1">
                      <button
                        className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                        onClick={() => handleDelete(product.id)}
                      >
                        Confirm
                      </button>
                      <button
                        className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="p-1.5 hover:bg-gray-100 rounded"
                      title="Delete"
                      onClick={() => setDeleteConfirm(product.id)}
                    >
                      <TrashIcon className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">
              {editingProduct ? 'Edit Product' : 'Create New Product'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="input-label">Product Name</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Standard Widget"
                  autoFocus
                />
              </div>

              <div>
                <label className="input-label">Arrival Rate (seconds between arrivals)</label>
                <input
                  type="number"
                  className="input"
                  value={formData.arrivalRate}
                  onChange={(e) =>
                    setFormData({ ...formData, arrivalRate: Number(e.target.value) || 120 })
                  }
                  min={1}
                />
              </div>

              <div>
                <label className="input-label">Priority (1 = highest)</label>
                <select
                  className="input"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: Number(e.target.value) })
                  }
                >
                  <option value={1}>1 - Highest</option>
                  <option value={2}>2 - High</option>
                  <option value={3}>3 - Medium</option>
                  <option value={4}>4 - Low</option>
                  <option value={5}>5 - Lowest</option>
                </select>
              </div>

              {/* Routing Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="input-label mb-0">Routing (station sequence)</label>
                  <button
                    type="button"
                    onClick={addRoutingStep}
                    disabled={stations.length === 0}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                  >
                    + Add Step
                  </button>
                </div>

                {stations.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                    No stations available. Add stations in the Factory Builder first.
                  </p>
                ) : formData.routing.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded text-center">
                    No routing steps defined. Click "+ Add Step" to build the routing.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {formData.routing.map((stationId, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="text-xs text-gray-400 w-5 text-right">{index + 1}.</span>
                        <select
                          className="input flex-1"
                          value={stationId}
                          onChange={(e) => updateRoutingStep(index, e.target.value)}
                        >
                          {stations.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeRoutingStep(index)}
                          className="p-1 hover:bg-red-50 rounded text-red-500"
                          title="Remove step"
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingProduct ? 'Save Changes' : 'Create Product'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
