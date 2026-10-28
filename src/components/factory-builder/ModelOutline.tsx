import { useState } from 'react';
import { useModelStore } from '../../stores/modelStore';

/**
 * Model tree ("Outline") — the left-docked tree familiar from ANSYS /
 * COMSOL model builders. Lists every element by category; clicking a row
 * selects that element on the canvas and opens its properties.
 */
const EXTRA_LABELS: Record<string, string> = {
  conveyor: 'Conveyors', inspection: 'Inspections', assembly: 'Assemblies', operator: 'Operators',
  splitter: 'Splitters', merge: 'Merges', disassembly: 'Disassembly', palletize: 'Palletizers',
  depalletize: 'Depalletizers', matchbuffer: 'Match buffers',
};

type Row = { id: string; name: string; selectable: boolean };
type Group = { key: string; label: string; color: string; rows: Row[] };

export function ModelOutline({ onSelect }: { onSelect: (id: string) => void }) {
  const { model, selectedNodeId } = useModelStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const extras = model.extraNodes || [];
  const byType = (t: string) => extras.filter((e) => e.type === t);
  const extraName = (e: (typeof extras)[number]) => (e.data as { name?: string })?.name || e.id;

  const otherTypes = Array.from(new Set(extras.map((e) => e.type).filter((t) => t !== 'source' && t !== 'sink')));

  const groups: Group[] = [
    { key: 'products', label: 'Products', color: '#64748B', rows: model.products.map((p) => ({ id: p.id, name: p.name, selectable: false })) },
    { key: 'source', label: 'Sources', color: '#059669', rows: byType('source').map((e) => ({ id: e.id, name: extraName(e), selectable: true })) },
    { key: 'stations', label: 'Stations', color: '#2563EB', rows: model.stations.map((s) => ({ id: s.id, name: s.name, selectable: true })) },
    { key: 'buffers', label: 'Buffers', color: '#D97706', rows: model.buffers.map((b) => ({ id: b.id, name: b.name, selectable: true })) },
    ...otherTypes.map((t) => ({
      key: t,
      label: EXTRA_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1),
      color: '#7C3AED',
      rows: byType(t).map((e) => ({ id: e.id, name: extraName(e), selectable: true })),
    })),
    { key: 'sink', label: 'Sinks', color: '#DC2626', rows: byType('sink').map((e) => ({ id: e.id, name: extraName(e), selectable: true })) },
  ];

  return (
    <div className="model-outline" role="tree" aria-label="Model outline">
      <div className="outline-row" style={{ paddingLeft: 4, fontWeight: 600 }}>
        <span className="outline-swatch" style={{ background: '#1F5FAD' }} />
        {model.name || 'Untitled model'}
      </div>
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key];
        return (
          <div key={g.key} role="group">
            <div className="outline-row" style={{ paddingLeft: 12 }}>
              <button
                type="button"
                className="outline-toggle"
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                aria-label={isCollapsed ? `Expand ${g.label}` : `Collapse ${g.label}`}
                disabled={g.rows.length === 0}
              >
                {g.rows.length === 0 ? '' : isCollapsed ? '▸' : '▾'}
              </button>
              <span className="outline-swatch" style={{ background: g.color }} />
              <span>{g.label}</span>
              <span className="outline-count">({g.rows.length})</span>
            </div>
            {!isCollapsed && g.rows.map((r) => (
              <div
                key={r.id}
                role="treeitem"
                aria-selected={selectedNodeId === r.id}
                className={`outline-row ${selectedNodeId === r.id ? 'is-selected' : ''}`}
                style={{ paddingLeft: 44, cursor: r.selectable ? 'pointer' : 'default' }}
                onClick={() => r.selectable && onSelect(r.id)}
                title={r.selectable ? `Select ${r.name}` : r.name}
              >
                {r.name}
              </div>
            ))}
          </div>
        );
      })}
      <div className="outline-row" style={{ paddingLeft: 12, color: '#64748B' }}>
        <span style={{ width: 14 }} />
        <span className="outline-swatch" style={{ background: '#94A3B8' }} />
        Connections <span className="outline-count">({model.connections.length})</span>
      </div>
    </div>
  );
}
