/**
 * Ribbon primitives (engineering-desktop style: ANSYS / COMSOL / MATLAB).
 *
 * The app shell renders one ribbon. Each page puts its own commands into it
 * with <RibbonContent> (a React portal), so command logic stays in the page
 * component that owns the state. Pages that don't provide ribbon content get
 * the shell's default groups (see AppRibbon).
 */
import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

const RibbonSlotContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });

export function RibbonSlotProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <RibbonSlotContext.Provider value={{ slot, setSlot }}>{children}</RibbonSlotContext.Provider>;
}

/** Where page content is rendered (used by the shell only). */
export function RibbonSlot() {
  const { setSlot } = useContext(RibbonSlotContext);
  return <div ref={setSlot} className="ribbon-slot" />;
}

/** Render children into the app ribbon. */
export function RibbonContent({ children }: { children: React.ReactNode }) {
  const { slot } = useContext(RibbonSlotContext);
  return slot ? createPortal(children, slot) : null;
}

export function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-body">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

interface RibbonButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  icon: React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  dropdown?: boolean;
}

/** Large button: 26px icon above a (max two-line) label. */
export function RibbonButton({ icon, label, active, dropdown, className = '', ...props }: RibbonButtonProps) {
  return (
    <button type="button" className={`ribbon-btn ${active ? 'is-active' : ''} ${className}`} {...props}>
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-label">
        {label}
        {dropdown && <span className="ribbon-caret" aria-hidden>▾</span>}
      </span>
    </button>
  );
}

/** Small button: 16px icon left of a one-line label; stack up to three in a RibbonStack. */
export function RibbonSmallButton({ icon, label, active, dropdown, className = '', ...props }: RibbonButtonProps) {
  return (
    <button type="button" className={`ribbon-sbtn ${active ? 'is-active' : ''} ${className}`} {...props}>
      <span className="ribbon-sbtn-icon">{icon}</span>
      <span>{label}</span>
      {dropdown && <span className="ribbon-caret" aria-hidden>▾</span>}
    </button>
  );
}

export function RibbonStack({ children }: { children: React.ReactNode }) {
  return <div className="ribbon-stack">{children}</div>;
}

/** Docked panel with an ANSYS-style title strip. */
export function DockPanel({
  title,
  actions,
  children,
  className = '',
  style,
  bodyStyle,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <section className={`dock-panel ${className}`} style={style}>
      <header className="dock-panel-title">
        <span>{title}</span>
        {actions && <span className="dock-panel-actions">{actions}</span>}
      </header>
      <div className="dock-panel-body" style={bodyStyle}>{children}</div>
    </section>
  );
}
