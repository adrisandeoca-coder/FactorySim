import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${padding ? 'p-4' : ''} ${className}`}>
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
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
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

export function StatCard({ title, value, change, changeLabel, subtitle, subtitleStatus, icon, status = 'neutral' }: StatCardProps) {
  const statusColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    bad: 'text-red-600',
    neutral: 'text-gray-900',
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-2xl font-semibold mt-1 ${statusColors[status]}`}>{value}</p>
          {subtitle && (
            <p className={`text-xs mt-1 ${subtitleStatus === 'warning' ? 'text-amber-600' : subtitleStatus === 'bad' ? 'text-red-600' : 'text-gray-500'}`}>
              {subtitle}
            </p>
          )}
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change >= 0 ? (
                <ArrowUpIcon className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowDownIcon className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm ml-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(change)}%
              </span>
              {changeLabel && (
                <span className="text-sm text-gray-500 ml-1">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-gray-100 rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}
