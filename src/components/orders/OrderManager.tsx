import { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useAppStore } from '../../stores/appStore';
import { ProductManager } from './ProductManager';
import { DeliveryPredictions } from './DeliveryPredictions';
import { Plus, Sparkles, Eye, Pencil, Trash2, ClipboardList } from 'lucide-react';
import { captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';
import type { Order } from '../../types';

/** Display-only extension with fields derived at render time */
interface DisplayOrder extends Order {
  productName: string;
  completedQuantity: number;
}

interface OrderGenerationConfig {
  productId: string;
  minQuantity: number;
  maxQuantity: number;
  frequency: 'hourly' | 'daily' | 'weekly';
  priorityDistribution: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
}

type SortColumn = 'id' | 'product' | 'quantity' | 'priority' | 'dueDate' | 'status';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'pending' | 'in_progress' | 'completed' | 'atRisk' | null;

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function OrderManager() {
  const modelStore = useModelStore();
  const { model } = modelStore;
  const { addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'predictions'>('orders');
  const ordersRef = useRef<HTMLDivElement>(null);

  // Register orders tab for cross-tab screenshot capture
  useEffect(() => {
    registerElement('orders-tab', ordersRef.current);
    return () => {
      if (ordersRef.current) {
        captureToBase64(ordersRef.current)
          .then((base64) => setCachedImage('orders-tab', base64))
          .catch(() => {});
      }
      registerElement('orders-tab', null);
    };
  }, []);

  const lastResult = useSimulationStore((s) => s.lastResult);
  const throughputByProduct = lastResult?.kpis?.throughput?.byProduct || {};

  const rawOrders = model.orders || [];
  const orders: DisplayOrder[] = rawOrders.map((o) => {
    const product = model.products.find((p) => p.id === o.productId);
    // Match production output to order: use product name or id as throughput key
    const productName = product?.name || o.productId;
    const produced = throughputByProduct[o.productId] || throughputByProduct[productName] || 0;
    // Distribute produced quantity across orders for same product proportionally
    const sameProductOrders = rawOrders.filter((r) => r.productId === o.productId);
    const totalOrderedForProduct = sameProductOrders.reduce((sum, r) => sum + r.quantity, 0);
    const share = totalOrderedForProduct > 0 ? o.quantity / totalOrderedForProduct : 0;
    const completedQuantity = Math.min(o.quantity, Math.round(produced * share));
    return {
      ...o,
      productName,
      completedQuantity,
      status: completedQuantity >= o.quantity ? 'completed' as const : o.status,
    };
  });

  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [newOrder, setNewOrder] = useState({
    productId: '',
    productName: '',
    quantity: 100,
    priority: 'medium' as const,
    dueDate: '',
    isWip: false,
    initialStationId: '',
  });

  const [generatorConfig, setGeneratorConfig] = useState<OrderGenerationConfig>({
    productId: '',
    minQuantity: 50,
    maxQuantity: 200,
    frequency: 'daily',
    priorityDistribution: { low: 30, medium: 50, high: 15, urgent: 5 },
  });

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('priority');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Status filter from clickable stat cards
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  // Batch selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const products = model?.products || [];

  const handleCreateOrder = () => {
    if (!newOrder.productId || !newOrder.dueDate) {
      addToast({ type: 'error', message: 'Please fill in all required fields' });
      return;
    }

    modelStore.addOrder({
      id: `order-${Date.now()}`,
      productId: newOrder.productId,
      quantity: newOrder.quantity,
      priority: newOrder.priority,
      dueDate: newOrder.dueDate,
      isWip: newOrder.isWip,
      initialStationId: newOrder.isWip ? newOrder.initialStationId || undefined : undefined,
      status: 'pending',
    });

    setShowNewOrder(false);
    setNewOrder({ productId: '', productName: '', quantity: 100, priority: 'medium', dueDate: '', isWip: false, initialStationId: '' });
    addToast({ type: 'success', message: 'Order created successfully' });
  };

  const handleGenerateOrders = () => {
    const count = generatorConfig.frequency === 'hourly' ? 8 :
                  generatorConfig.frequency === 'daily' ? 3 : 1;

    const priorities: ('low' | 'medium' | 'high' | 'urgent')[] = ['low', 'medium', 'high', 'urgent'];

    for (let i = 0; i < count; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const quantity = Math.floor(
        Math.random() * (generatorConfig.maxQuantity - generatorConfig.minQuantity) +
        generatorConfig.minQuantity
      );

      // Weighted random priority
      const rand = Math.random() * 100;
      let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
      let cumulative = 0;
      for (const p of priorities) {
        cumulative += generatorConfig.priorityDistribution[p];
        if (rand < cumulative) {
          priority = p;
          break;
        }
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 1);

      modelStore.addOrder({
        id: `order-${Date.now()}-${i}`,
        productId: product.id,
        quantity,
        priority,
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending',
        isWip: false,
      });
    }

    setShowGenerator(false);
    addToast({ type: 'success', message: `Generated ${count} orders` });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'late': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProgressColor = (order: DisplayOrder) => {
    const progress = order.completedQuantity / order.quantity;
    const daysUntilDue = Math.ceil((new Date(order.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (progress >= 1) return 'bg-green-500';
    if (daysUntilDue < 0) return 'bg-red-500';
    if (daysUntilDue < 2 && progress < 0.8) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  const isAtRisk = (o: DisplayOrder) => {
    const daysUntilDue = Math.ceil((new Date(o.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const progress = o.completedQuantity / o.quantity;
    return daysUntilDue < 3 && progress < 0.7 && o.status !== 'completed';
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
    atRisk: orders.filter(isAtRisk).length,
  };

  // Filter orders by status
  const filteredOrders = useMemo(() => {
    if (!statusFilter) return orders;
    switch (statusFilter) {
      case 'pending': return orders.filter(o => o.status === 'pending');
      case 'in_progress': return orders.filter(o => o.status === 'in_progress');
      case 'completed': return orders.filter(o => o.status === 'completed');
      case 'atRisk': return orders.filter(isAtRisk);
      default: return orders;
    }
  }, [orders, statusFilter]);

  // Sort filtered orders
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'id': cmp = a.id.localeCompare(b.id); break;
        case 'product': cmp = a.productName.localeCompare(b.productName); break;
        case 'quantity': cmp = a.quantity - b.quantity; break;
        case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4); break;
        case 'dueDate': cmp = a.dueDate.localeCompare(b.dueDate); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredOrders, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const SortArrow = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <span className="ml-1 text-gray-300">&#8597;</span>;
    return <span className="ml-1 text-blue-600 font-bold">{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  // Batch operations
  const toggleSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === sortedOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(sortedOrders.map(o => o.id)));
    }
  };

  const handleBulkDelete = () => {
    selectedOrderIds.forEach(id => modelStore.removeOrder(id));
    addToast({ type: 'success', message: `Deleted ${selectedOrderIds.size} order(s)` });
    setSelectedOrderIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  // Source node name for non-WIP orders
  const sourceName = model.extraNodes?.find(n => n.type === 'source')?.data.name || 'Source';

  return (
    <div className="space-y-6" ref={ordersRef}>
      {/* Header with Tabs */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
            <p className="text-gray-500">Create and track production orders and products</p>
          </div>
          {activeTab === 'orders' && (
            <div className="flex space-x-2">
              <Button variant="secondary" onClick={() => setShowGenerator(true)} title="Generate sample orders based on your model's product types and throughput capacity">
                <SparklesIcon className="w-4 h-4 mr-2" />
                Auto-Generate
              </Button>
              <Button onClick={() => setShowNewOrder(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                New Order
              </Button>
            </div>
          )}
          {activeTab === 'predictions' && (
            <div className="text-xs text-gray-400">Estimates based on simulation throughput</div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'orders'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Orders
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'products'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Products
            {model.products.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {model.products.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('predictions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'predictions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Delivery Predictions
          </button>
        </div>
      </div>

      {activeTab === 'products' && <ProductManager />}

      {activeTab === 'predictions' && <DeliveryPredictions orders={orders} />}

      {activeTab === 'orders' && <>
      {/* No products hint */}
      {products.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          No products defined yet. Switch to the <button onClick={() => setActiveTab('products')} className="underline font-medium">Products tab</button> to create products before making orders.
        </div>
      )}

      {/* Stats Cards — clickable to filter */}
      <div className="grid grid-cols-5 gap-4">
        <OrderStatCard
          label="Total Orders"
          value={stats.total}
          color="gray"
          active={statusFilter === null}
          onClick={() => setStatusFilter(null)}
        />
        <OrderStatCard
          label="Pending"
          value={stats.pending}
          color="gray"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter(statusFilter === 'pending' ? null : 'pending')}
        />
        <OrderStatCard
          label="In Progress"
          value={stats.inProgress}
          color="blue"
          active={statusFilter === 'in_progress'}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? null : 'in_progress')}
        />
        <OrderStatCard
          label="Completed"
          value={stats.completed}
          color="green"
          active={statusFilter === 'completed'}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? null : 'completed')}
        />
        <OrderStatCard
          label="At Risk"
          value={stats.atRisk}
          color="red"
          active={statusFilter === 'atRisk'}
          onClick={() => setStatusFilter(statusFilter === 'atRisk' ? null : 'atRisk')}
        />
      </div>

      {/* Empty state */}
      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardIcon className="w-12 h-12" />}
            title="No orders yet"
            description="Create orders to track production fulfillment against simulation results"
            action={
              <>
                <Button onClick={() => setShowNewOrder(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  New Order
                </Button>
                <Button variant="secondary" onClick={() => setShowGenerator(true)}>
                  <SparklesIcon className="w-4 h-4 mr-2" />
                  Auto-Generate
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          {/* Filter indicator */}
          {statusFilter && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Showing {filteredOrders.length} of {orders.length} orders</span>
              <button
                className="text-blue-600 hover:underline text-sm"
                onClick={() => setStatusFilter(null)}
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Batch action bar */}
          {selectedOrderIds.size > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-blue-800">
                {selectedOrderIds.size} selected
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                Delete Selected
              </Button>
            </div>
          )}

          {/* Orders Table */}
          <Card>
            <CardHeader title="Active Orders" subtitle="Production orders sorted by priority and due date" />
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        checked={sortedOrders.length > 0 && selectedOrderIds.size === sortedOrders.length}
                        onChange={toggleSelectAll}
                        className="rounded text-blue-600"
                      />
                    </th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'id' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('id')}>
                      Order ID<SortArrow col="id" />
                    </th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'product' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('product')}>
                      Product<SortArrow col="product" />
                    </th>
                    <th>Start</th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'quantity' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('quantity')}>
                      Quantity<SortArrow col="quantity" />
                    </th>
                    <th>Progress</th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'priority' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('priority')}>
                      Priority<SortArrow col="priority" />
                    </th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'dueDate' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('dueDate')}>
                      Due Date<SortArrow col="dueDate" />
                    </th>
                    <th className={`cursor-pointer select-none ${sortColumn === 'status' ? 'font-bold bg-blue-50/50' : ''}`} onClick={() => handleSort('status')}>
                      Status<SortArrow col="status" />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="rounded text-blue-600"
                        />
                      </td>
                      <td className="font-mono text-sm">{order.id}</td>
                      <td>{order.productName}</td>
                      <td>
                        {order.isWip ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                            {model.stations.find(s => s.id === order.initialStationId)?.name || 'Station'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">{sourceName}</span>
                        )}
                      </td>
                      <td>{order.completedQuantity} / {order.quantity}</td>
                      <td>
                        <div className="w-32">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{Math.round((order.completedQuantity / order.quantity) * 100)}%</span>
                          </div>
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getProgressColor(order)} transition-all`}
                              style={{ width: `${(order.completedQuantity / order.quantity) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(order.priority)}`}>
                          {order.priority.toUpperCase()}
                        </span>
                      </td>
                      <td>{order.dueDate}</td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="flex space-x-1">
                          <button className="p-1 hover:bg-gray-100 rounded" title="View Details">
                            <EyeIcon className="w-4 h-4 text-gray-500" />
                          </button>
                          <button className="p-1 hover:bg-gray-100 rounded" title="Edit">
                            <PencilIcon className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Delete"
                            onClick={() => setDeleteTarget({ id: order.id, label: order.id })}
                          >
                            <TrashIcon className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Single delete confirm */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onConfirm={() => {
          if (deleteTarget) {
            modelStore.removeOrder(deleteTarget.id);
            addToast({ type: 'success', message: 'Order deleted' });
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Order"
        message={`Delete order ${deleteTarget?.label}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        title="Delete Selected Orders"
        message={`Delete ${selectedOrderIds.size} selected order(s)? This cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
      />

      {/* New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Create New Order</h2>
            <div className="space-y-4">
              <div>
                <label className="input-label">Product</label>
                <select
                  className="input"
                  value={newOrder.productId}
                  onChange={(e) => {
                    const product = products.find(p => p.id === e.target.value);
                    setNewOrder({
                      ...newOrder,
                      productId: e.target.value,
                      productName: product?.name || ''
                    });
                  }}
                >
                  <option value="">Select a product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Quantity</label>
                <input
                  type="number"
                  className="input"
                  value={newOrder.quantity}
                  onChange={(e) => setNewOrder({ ...newOrder, quantity: parseInt(e.target.value) || 0 })}
                  min={1}
                />
              </div>
              <div>
                <label className="input-label">Priority</label>
                <select
                  className="input"
                  value={newOrder.priority}
                  onChange={(e) => setNewOrder({ ...newOrder, priority: e.target.value as any })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="input-label">Due Date</label>
                <input
                  type="date"
                  className="input"
                  value={newOrder.dueDate}
                  onChange={(e) => setNewOrder({ ...newOrder, dueDate: e.target.value })}
                />
              </div>
              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newOrder.isWip}
                    onChange={(e) => setNewOrder({ ...newOrder, isWip: e.target.checked, initialStationId: '' })}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Work in Progress (WIP)</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  When enabled, this order starts already at a station instead of from a source
                </p>
              </div>
              {newOrder.isWip && (
                <div>
                  <label className="input-label">Starting Station</label>
                  <select
                    className="input"
                    value={newOrder.initialStationId}
                    onChange={(e) => setNewOrder({ ...newOrder, initialStationId: e.target.value })}
                  >
                    <option value="">Select a station...</option>
                    {model.stations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="secondary" onClick={() => setShowNewOrder(false)}>Cancel</Button>
              <Button onClick={handleCreateOrder}>Create Order</Button>
            </div>
          </div>
        </div>
      )}

      {/* Generator Modal */}
      {showGenerator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Auto-Generate Orders</h2>
            <p className="text-sm text-gray-500 mb-4">
              Configure automatic order generation for simulation testing.
            </p>
            <div className="space-y-4">
              <div>
                <label className="input-label">Quantity Range</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    className="input"
                    placeholder="Min"
                    value={generatorConfig.minQuantity}
                    onChange={(e) => setGeneratorConfig({
                      ...generatorConfig,
                      minQuantity: parseInt(e.target.value) || 0
                    })}
                  />
                  <span className="self-center text-gray-500">to</span>
                  <input
                    type="number"
                    className="input"
                    placeholder="Max"
                    value={generatorConfig.maxQuantity}
                    onChange={(e) => setGeneratorConfig({
                      ...generatorConfig,
                      maxQuantity: parseInt(e.target.value) || 0
                    })}
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Generation Frequency</label>
                <select
                  className="input"
                  value={generatorConfig.frequency}
                  onChange={(e) => setGeneratorConfig({
                    ...generatorConfig,
                    frequency: e.target.value as any
                  })}
                >
                  <option value="hourly">Hourly (8 orders)</option>
                  <option value="daily">Daily (3 orders)</option>
                  <option value="weekly">Weekly (1 order)</option>
                </select>
              </div>
              <div>
                <label className="input-label">Priority Distribution (%)</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                    <div key={p}>
                      <label className="text-xs text-gray-500 capitalize">{p}</label>
                      <input
                        type="number"
                        className="input text-center"
                        value={generatorConfig.priorityDistribution[p]}
                        onChange={(e) => setGeneratorConfig({
                          ...generatorConfig,
                          priorityDistribution: {
                            ...generatorConfig.priorityDistribution,
                            [p]: parseInt(e.target.value) || 0
                          }
                        })}
                        min={0}
                        max={100}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="secondary" onClick={() => setShowGenerator(false)}>Cancel</Button>
              <Button onClick={handleGenerateOrders}>Generate Orders</Button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

function OrderStatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const isUrgent = color === 'red' && value > 0;
  const colorClasses = {
    gray: 'bg-gray-50 border-gray-200',
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    red: isUrgent ? 'bg-red-100 border-red-400 border-2' : 'bg-red-50 border-red-200',
  };

  return (
    <div
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        colorClasses[color as keyof typeof colorClasses]
      } ${active ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:shadow-md'}`}
      onClick={onClick}
    >
      <div className={`text-2xl font-bold font-mono tabular-nums ${isUrgent ? 'animate-pulse text-red-700' : ''}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return <Plus className={className} strokeWidth={1.75} />;
}

function SparklesIcon({ className }: { className?: string }) {
  return <Sparkles className={className} strokeWidth={1.75} />;
}

function EyeIcon({ className }: { className?: string }) {
  return <Eye className={className} strokeWidth={1.75} />;
}

function PencilIcon({ className }: { className?: string }) {
  return <Pencil className={className} strokeWidth={1.75} />;
}

function TrashIcon({ className }: { className?: string }) {
  return <Trash2 className={className} strokeWidth={1.75} />;
}

function ClipboardIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} strokeWidth={1.75} />;
}
