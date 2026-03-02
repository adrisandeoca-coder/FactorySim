import { useState } from 'react';
import { Button } from '../common/Button';
import { useAppStore, getDefaultDashboardWidgets } from '../../stores/appStore';
import { widgetRegistry } from './widgetRegistry';
import type { DashboardWidgetConfig, DashboardWidgetType } from '../../types';

interface WidgetConfiguratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WidgetConfigurator({ isOpen, onClose }: WidgetConfiguratorProps) {
  const { dashboardWidgets, setDashboardWidgets } = useAppStore();
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>([...dashboardWidgets]);

  if (!isOpen) return null;

  const activeTypes = new Set(widgets.map((w) => w.type));
  const availableTypes = (Object.keys(widgetRegistry) as DashboardWidgetType[]).filter(
    (type) => !activeTypes.has(type)
  );

  const handleAdd = (type: DashboardWidgetType) => {
    const entry = widgetRegistry[type];
    const newWidget: DashboardWidgetConfig = {
      id: `w-${type}-${Date.now()}`,
      type,
      label: entry.label,
      size: entry.defaultSize,
    };
    setWidgets([...widgets, newWidget]);
  };

  const handleRemove = (id: string) => {
    setWidgets(widgets.filter((w) => w.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...widgets];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setWidgets(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === widgets.length - 1) return;
    const updated = [...widgets];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setWidgets(updated);
  };

  const handleSave = () => {
    setDashboardWidgets(widgets);
    onClose();
  };

  const handleReset = () => {
    setWidgets(getDefaultDashboardWidgets());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Customize Dashboard</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Active Widgets */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Active Widgets</h3>
              <div className="space-y-2">
                {widgets.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">No widgets added</p>
                )}
                {widgets.map((widget, index) => (
                  <div
                    key={widget.id}
                    className="flex items-center p-2.5 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <WidgetIcon path={widgetRegistry[widget.type]?.icon} />
                    <div className="flex-1 min-w-0 ml-2.5">
                      <div className="text-sm font-medium text-gray-900 truncate">{widget.label}</div>
                      <div className="text-xs text-gray-500">{widget.size}</div>
                    </div>
                    <div className="flex items-center space-x-1 ml-2">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        title="Move up"
                      >
                        <ChevronUpIcon className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === widgets.length - 1}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        title="Move down"
                      >
                        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleRemove(widget.id)}
                        className="p-1 hover:bg-red-100 rounded"
                        title="Remove"
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Widgets */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Available Widgets</h3>
              <div className="space-y-2">
                {availableTypes.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">All widgets are active</p>
                )}
                {availableTypes.map((type) => {
                  const entry = widgetRegistry[type];
                  return (
                    <div
                      key={type}
                      className="flex items-center p-2.5 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                    >
                      <WidgetIcon path={entry.icon} />
                      <div className="flex-1 min-w-0 ml-2.5">
                        <div className="text-sm font-medium text-gray-900">{entry.label}</div>
                        <div className="text-xs text-gray-500">{entry.description}</div>
                      </div>
                      <button
                        onClick={() => handleAdd(type)}
                        className="ml-2 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to Default
          </Button>
          <div className="flex space-x-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save Layout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WidgetIcon({ path }: { path?: string }) {
  return (
    <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path || 'M4 6h16'} />
      </svg>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
