import { useRef, useEffect } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { useSimulationStore } from '../../stores/simulationStore';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import { captureScreenshot, captureToBase64 } from '../../services/screenshotService';
import { registerElement, setCachedImage } from '../../services/elementRegistry';
import type { Order } from '../../types';

interface DisplayOrder extends Order {
  productName: string;
  completedQuantity: number;
}

interface DeliveryPredictionsProps {
  orders: DisplayOrder[];
}

interface PredictionRow {
  order: DisplayOrder;
  remaining: number;
  throughputRate: number;
  estimatedHours: number;
  predictedCompletion: Date;
  dueDate: Date;
  status: 'on-track' | 'at-risk' | 'late';
}

export function DeliveryPredictions({ orders }: DeliveryPredictionsProps) {
  const { lastResult } = useSimulationStore();
  const { model } = useModelStore();
  const { addToast } = useAppStore();
  const predictionsRef = useRef<HTMLDivElement>(null);

  // Register element for cross-tab screenshot access
  useEffect(() => {
    registerElement('delivery-predictions', predictionsRef.current);
    return () => registerElement('delivery-predictions', null);
  }, []);

  // Cache screenshot when predictions render (for artifact saving)
  useEffect(() => {
    if (!predictionsRef.current) return;
    const timer = setTimeout(() => {
      if (predictionsRef.current) {
        captureToBase64(predictionsRef.current)
          .then((base64) => setCachedImage('delivery-predictions', base64))
          .catch(() => {});
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [lastResult, orders]);

  const hasSimData = !!lastResult?.kpis;
  const kpis = lastResult?.kpis;

  const handleScreenshot = async () => {
    if (!predictionsRef.current) return;
    try {
      await captureScreenshot(predictionsRef.current, `delivery-predictions-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`);
      addToast({ type: 'success', message: 'Screenshot saved' });
    } catch {
      addToast({ type: 'error', message: 'Failed to capture screenshot' });
    }
  };

  // Calculate throughput rate
  const overallRate = kpis?.throughput?.ratePerHour || estimateFromModel(model);
  const productRates = kpis?.throughput?.byProduct || {};

  const predictions: PredictionRow[] = orders
    .filter((o) => o.status !== 'completed')
    .map((order) => {
      const remaining = order.quantity - order.completedQuantity;
      const rate = productRates[order.productId] || overallRate;
      const effectiveRate = Math.max(rate, 0.1); // avoid division by zero
      const estimatedHours = remaining / effectiveRate;

      const now = new Date();
      const predictedCompletion = new Date(now.getTime() + estimatedHours * 3600 * 1000);
      const dueDate = new Date(order.dueDate);

      // Determine status
      let status: 'on-track' | 'at-risk' | 'late';
      if (predictedCompletion > dueDate) {
        status = 'late';
      } else {
        const buffer = (dueDate.getTime() - predictedCompletion.getTime()) / (1000 * 3600);
        status = buffer < 4 ? 'at-risk' : 'on-track';
      }

      return {
        order,
        remaining,
        throughputRate: effectiveRate,
        estimatedHours,
        predictedCompletion,
        dueDate,
        status,
      };
    });

  const statusCounts = {
    onTrack: predictions.filter((p) => p.status === 'on-track').length,
    atRisk: predictions.filter((p) => p.status === 'at-risk').length,
    late: predictions.filter((p) => p.status === 'late').length,
  };

  return (
    <div className="space-y-4" ref={predictionsRef}>
      {/* Header with screenshot */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleScreenshot} icon={<CameraIcon className="w-4 h-4" />}>
          Screenshot
        </Button>
      </div>

      {/* Data source notice */}
      {!hasSimData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          No simulation data available. Estimates are based on model parameters.
          Run a simulation for more accurate predictions.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="On Track"
          value={statusCounts.onTrack}
          color="green"
        />
        <SummaryCard
          label="At Risk"
          value={statusCounts.atRisk}
          color="yellow"
        />
        <SummaryCard
          label="Late"
          value={statusCounts.late}
          color="red"
        />
      </div>

      {/* Predictions Table */}
      <Card>
        <CardHeader
          title="Delivery Predictions"
          subtitle={`Based on ${hasSimData ? 'simulation' : 'estimated'} throughput of ${overallRate.toFixed(1)} units/hr`}
        />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Product</th>
                <th>Remaining Qty</th>
                <th>Rate (units/hr)</th>
                <th>Est. Hours</th>
                <th>Predicted Completion</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-500 py-8">
                    No active orders to predict
                  </td>
                </tr>
              ) : (
                predictions.map((p) => (
                  <tr key={p.order.id}>
                    <td className="font-mono text-sm">{p.order.id}</td>
                    <td>{p.order.productName}</td>
                    <td>{p.remaining}</td>
                    <td>{p.throughputRate.toFixed(1)}</td>
                    <td>{p.estimatedHours.toFixed(1)}</td>
                    <td>{formatDateTime(p.predictedCompletion)}</td>
                    <td>{p.order.dueDate}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function estimateFromModel(model: any): number {
  if (!model?.stations || model.stations.length === 0) return 10;
  // Use the slowest station cycle time as the bottleneck
  const maxCycleTime = Math.max(
    ...model.stations.map((s: any) => {
      const params = s.cycleTime?.parameters || {};
      return (params.value as number) || (params.mean as number) || 60;
    })
  );
  // Convert seconds/unit to units/hour
  return maxCycleTime > 0 ? 3600 / maxCycleTime : 10;
}

function StatusBadge({ status }: { status: 'on-track' | 'at-risk' | 'late' }) {
  const styles = {
    'on-track': 'bg-green-100 text-green-800',
    'at-risk': 'bg-yellow-100 text-yellow-800',
    'late': 'bg-red-100 text-red-800',
  };
  const labels = {
    'on-track': 'On Track',
    'at-risk': 'At Risk',
    'late': 'Late',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
