import { BarChart3 } from 'lucide-react';

interface ChartEmptyStateProps {
  message?: string;
  icon?: React.ReactNode;
  height?: string;
}

/**
 * Reusable empty/error state for dashboard chart widgets.
 * Shows a centered icon + message when data is unavailable.
 */
export function ChartEmptyState({
  message = 'No data available',
  icon,
  height = 'h-64',
}: ChartEmptyStateProps) {
  return (
    <div className={`${height} flex flex-col items-center justify-center text-gray-400`}>
      <div className="mb-3 text-gray-300">
        {icon ?? <BarChart3 className="w-10 h-10" strokeWidth={1.5} />}
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
