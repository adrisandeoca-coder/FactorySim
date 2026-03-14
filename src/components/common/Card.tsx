import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${padding ? 'p-3' : ''} ${className}`}
         style={{ boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)' }}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  subtitleStatus?: 'good' | 'warning' | 'bad' | 'neutral';
  icon?: React.ReactNode;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
}

const statusDotColors = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-gray-400',
};

export function StatCard({ title, value, change, changeLabel, subtitle, subtitleStatus, icon, status = 'neutral' }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColors[status]}`} />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider truncate">{title}</p>
          </div>
          <p className="text-xl font-semibold mt-1 font-mono tabular-nums text-gray-900">{value}</p>
          {subtitle && (
            <p className={`text-[11px] mt-0.5 ${subtitleStatus === 'warning' ? 'text-amber-600' : subtitleStatus === 'bad' ? 'text-red-600' : 'text-gray-500'}`}>
              {subtitle}
            </p>
          )}
          {change !== undefined && (
            <div className="flex items-center mt-1.5">
              <span className={`text-xs font-medium font-mono tabular-nums ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {change >= 0 ? '+' : ''}{Math.abs(change)}%
              </span>
              {changeLabel && (
                <span className="text-[11px] text-gray-400 ml-1">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-1.5 bg-gray-50 rounded-md">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
