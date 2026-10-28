import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`card ${padding ? '' : 'p-0'} ${className}`} style={padding ? {} : { padding: 0 }}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/** Panel title strip (engineering-desktop style): "Title — subtitle  [action]". */
export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="panel-titlebar">
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span>{title}</span>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </span>
      {action && <span style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>{action}</span>}
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

const dataColors = {
  good: 'var(--data-green)',
  warning: 'var(--data-amber)',
  bad: 'var(--red)',
  neutral: 'var(--text-tertiary)',
};

export function StatCard({ title, value, change, changeLabel, subtitle, subtitleStatus, status = 'neutral' }: StatCardProps) {
  const isDanger = status === 'bad';

  return (
    <div className="card" style={isDanger ? { borderColor: 'var(--red)' } : {}}>
      {/* Label */}
      <div className="card-header">{title}</div>

      {/* Value */}
      <div className="card-value" style={isDanger ? { color: 'var(--red)' } : {}}>
        {value}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize: 11,
          marginTop: 4,
          color: subtitleStatus ? dataColors[subtitleStatus] : 'var(--text-secondary)',
        }}>
          {subtitle}
        </div>
      )}

      {/* Change */}
      {change !== undefined && (
        <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: change >= 0 ? 'var(--data-green)' : 'var(--red)' }}>
            {change >= 0 ? '+' : ''}{Math.abs(change)}%
          </span>
          {changeLabel && (
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
