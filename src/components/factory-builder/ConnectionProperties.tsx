import { useModelStore } from '../../stores/modelStore';
import type { TransportMode } from '../../types';

import { t } from '../../i18n';
/**
 * Properties of a connection between two elements: how material moves along
 * it. Not every link is a conveyor: parts are carried by hand between
 * neighbouring benches, pallets go by forklift, AGVs drive between cells, or
 * the part is simply passed on (direct). The 3D view draws the matching
 * equipment: a conveyor only for conveyor links, a walkway or a marked
 * vehicle route otherwise.
 */

export const TRANSPORT_MODES: { value: TransportMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatic', hint: 'Conveyor, or forklift / AGV when a pallet or vehicle element is involved.' },
  { value: 'conveyor', label: 'Conveyor', hint: 'Roller or belt conveyor between the two elements.' },
  { value: 'manual', label: 'Carried by an operator', hint: 'A person walks the part over. A walkway is marked on the floor.' },
  { value: 'forklift', label: 'Forklift / pallet jack', hint: 'Pallets moved on a marked vehicle route.' },
  { value: 'agv', label: 'AGV / AMR', hint: 'Automated vehicle on a marked route.' },
  { value: 'direct', label: 'Direct hand-over', hint: 'Elements side by side: the part passes straight on, nothing in between.' },
];

export function ConnectionProperties({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const conn = useModelStore((s) => s.model.connections.find((c) => c.id === connectionId));
  const model = useModelStore((s) => s.model);
  const updateConnection = useModelStore((s) => s.updateConnection);
  const removeConnection = useModelStore((s) => s.removeConnection);
  if (!conn) return null;

  const nameOf = (id: string) =>
    model.stations.find((s) => s.id === id)?.name
    ?? model.buffers.find((b) => b.id === id)?.name
    ?? (model.extraNodes.find((n) => n.id === id)?.data as { name?: string } | undefined)?.name
    ?? id;
  const mode = conn.transport ?? 'auto';
  const current = TRANSPORT_MODES.find((m) => m.value === mode) ?? TRANSPORT_MODES[0];

  return (
    <div className="details-panel" style={{
      width: 300, background: '#fff', borderLeft: '1px solid var(--chrome-border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
    }}>
      <div className="dock-panel-title">
        <span>{t('Connection')}</span>
        <button type="button" onClick={onClose} aria-label={t('Close')} title={t('Close')}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t3, #64748b)', fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '12px 14px', display: 'grid', gap: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, color: 'var(--t2, #475569)', fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
          {nameOf(conn.source)} <span style={{ color: 'var(--t3, #94a3b8)' }}>→</span> {nameOf(conn.target)}
        </div>
        <div>
          <label htmlFor="conn-transport" className="input-label">{t('Transport')}</label>
          <select id="conn-transport" className="input" value={mode}
            onChange={(e) => updateConnection(conn.id, { transport: e.target.value as TransportMode })}>
            {TRANSPORT_MODES.map((m) => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
          </select>
          <p style={{ fontSize: 11, color: 'var(--t3, #64748b)', lineHeight: 1.45, margin: '6px 0 0' }}>{t(current.hint)}</p>
          <p style={{ fontSize: 11, color: 'var(--t3, #64748b)', lineHeight: 1.45, margin: '6px 0 0' }}>
            Changes the layout and 3D animation. Transport time is not simulated: model it with a buffer or a station if it matters.
          </p>
        </div>
        <button type="button" className="ribbon-sbtn" style={{ justifySelf: 'start', color: 'var(--red, #dc2626)' }}
          onClick={() => { removeConnection(conn.id); onClose(); }}>
          Delete connection
        </button>
      </div>
    </div>
  );
}
