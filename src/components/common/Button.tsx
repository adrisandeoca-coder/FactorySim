import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary:   { background: 'var(--blue)', color: '#fff' },
  secondary: { background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  success:   { background: 'var(--data-green)', color: '#fff' },
  danger:    { background: 'var(--red)', color: '#fff' },
  ghost:     { background: 'transparent', color: 'var(--text-secondary)' },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '4px 8px', fontSize: 11 },
  md: { padding: '6px 12px', fontSize: 13 },
  lg: { padding: '8px 16px', fontSize: 13 },
};

export function Button({
  children, variant = 'primary', size = 'md', loading = false,
  icon, className = '', disabled, style, ...props
}: ButtonProps) {
  return (
    <button
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        // Never wrap button labels ("Run Simulation" was breaking onto two lines)
        whiteSpace: 'nowrap', flexShrink: 0,
        borderRadius: 3, fontWeight: 600, border: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s', opacity: disabled || loading ? 0.5 : 1,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="spinner" style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
          <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {icon && !loading && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  );
}
