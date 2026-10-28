import { useState, useMemo, useCallback } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { Button } from '../common/Button';
import type { ScriptEntry, ScriptHook } from '../../types';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Code2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Save,
} from 'lucide-react';

const HOOK_OPTIONS: { value: ScriptHook; label: string; description: string }[] = [
  { value: 'on_enter', label: 'On Enter', description: 'Runs when an entity enters the node' },
  { value: 'on_exit', label: 'On Exit', description: 'Runs when an entity exits the node' },
  { value: 'on_failure', label: 'On Failure', description: 'Runs when the node fails / breaks down' },
  { value: 'on_setup', label: 'On Setup', description: 'Runs during setup / changeover' },
  { value: 'on_create', label: 'On Create', description: 'Runs once when the node is initialized' },
];

const PLACEHOLDER_CODE = `# SimTalk-equivalent script
# Available variables: entity, node, sim
# Example:
#   entity.priority = 1
#   node.cycle_time = 30
#   sim.log("Entity processed")
`;

interface ScriptFormData {
  nodeId: string;
  hook: ScriptHook;
  code: string;
  enabled: boolean;
}

const emptyForm: ScriptFormData = {
  nodeId: '',
  hook: 'on_enter',
  code: '',
  enabled: true,
};

interface ScriptEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScriptEditor({ isOpen, onClose }: ScriptEditorProps) {
  const model = useModelStore((s) => s.model);
  const setModel = useModelStore((s) => s.setModel);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ScriptFormData>({ ...emptyForm });

  const scripts: ScriptEntry[] = model.scripts ?? [];

  // Build a flat list of all nodes (stations + buffers + extraNodes) for the selector
  const allNodes = useMemo(() => {
    const nodes: { id: string; name: string; type: string }[] = [];
    for (const s of model.stations) {
      nodes.push({ id: s.id, name: s.name, type: 'Station' });
    }
    for (const b of model.buffers) {
      nodes.push({ id: b.id, name: b.name, type: 'Buffer' });
    }
    for (const n of model.extraNodes) {
      nodes.push({ id: n.id, name: n.data.name, type: n.type });
    }
    return nodes;
  }, [model.stations, model.buffers, model.extraNodes]);

  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of allNodes) map.set(n.id, n.name);
    return map;
  }, [allNodes]);

  // Persist scripts array to the model
  const saveScripts = useCallback(
    (updated: ScriptEntry[]) => {
      setModel({ ...model, scripts: updated });
    },
    [model, setModel],
  );

  const handleToggleEnabled = useCallback(
    (index: number) => {
      const updated = scripts.map((s, i) =>
        i === index ? { ...s, enabled: !s.enabled } : s,
      );
      saveScripts(updated);
    },
    [scripts, saveScripts],
  );

  const handleDelete = useCallback(
    (index: number) => {
      saveScripts(scripts.filter((_, i) => i !== index));
    },
    [scripts, saveScripts],
  );

  const handleEdit = useCallback(
    (index: number) => {
      const s = scripts[index];
      setForm({
        nodeId: s.nodeId,
        hook: s.hook,
        code: s.code,
        enabled: s.enabled ?? true,
      });
      setEditingIndex(index);
      setShowForm(true);
    },
    [scripts],
  );

  const handleAddNew = useCallback(() => {
    setForm({ ...emptyForm, nodeId: allNodes[0]?.id ?? '' });
    setEditingIndex(null);
    setShowForm(true);
  }, [allNodes]);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingIndex(null);
    setForm({ ...emptyForm });
  }, []);

  const handleSave = useCallback(() => {
    if (!form.nodeId || !form.code.trim()) return;

    const entry: ScriptEntry = {
      nodeId: form.nodeId,
      hook: form.hook,
      code: form.code,
      enabled: form.enabled,
    };

    if (editingIndex !== null) {
      const updated = scripts.map((s, i) => (i === editingIndex ? entry : s));
      saveScripts(updated);
    } else {
      saveScripts([...scripts, entry]);
    }
    handleCancel();
  }, [form, editingIndex, scripts, saveScripts, handleCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 720,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code2 size={18} style={{ color: 'var(--blue)' }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              Script Editor
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                background: 'var(--surface-elevated)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {scripts.length} script{scripts.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* Script list */}
          {!showForm && (
            <>
              {scripts.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--text-tertiary)',
                    fontSize: 13,
                  }}
                >
                  <Code2 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p>No scripts defined yet.</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>
                    Scripts let you add custom logic to simulation nodes.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scripts.map((script, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: 'var(--surface-elevated)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        opacity: script.enabled === false ? 0.55 : 1,
                      }}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleEnabled(index)}
                        title={script.enabled !== false ? 'Disable' : 'Enable'}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color:
                            script.enabled !== false
                              ? 'var(--data-green)'
                              : 'var(--text-tertiary)',
                          display: 'flex',
                          alignItems: 'center',
                          padding: 0,
                        }}
                      >
                        {script.enabled !== false ? (
                          <ToggleRight size={20} />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </button>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {nodeNameMap.get(script.nodeId) ?? script.nodeId}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          <span
                            style={{
                              background: 'var(--blue)',
                              color: '#fff',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              marginRight: 6,
                            }}
                          >
                            {script.hook}
                          </span>
                          {script.code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length}{' '}
                          line{script.code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length !== 1 ? 's' : ''}{' '}
                          of code
                        </div>
                      </div>

                      {/* Actions */}
                      <button
                        onClick={() => handleEdit(index)}
                        title="Edit"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: 4,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(index)}
                        title="Delete"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--red)',
                          padding: 4,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Add / Edit form */}
          {showForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {editingIndex !== null ? 'Edit Script' : 'Add Script'}
              </div>

              {/* Node selector */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Node
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={form.nodeId}
                    onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 32px 8px 10px',
                      fontSize: 13,
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      appearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>
                      Select a node...
                    </option>
                    {allNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.type})
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                </div>
              </div>

              {/* Hook selector */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Hook
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={form.hook}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hook: e.target.value as ScriptHook }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 32px 8px 10px',
                      fontSize: 13,
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      appearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {HOOK_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label} — {h.description}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                </div>
              </div>

              {/* Enabled toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: form.enabled ? 'var(--data-green)' : 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                >
                  {form.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {form.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Code textarea */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Code
                </label>
                <div
                  style={{
                    position: 'relative',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  {/* Line numbers gutter */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: 36,
                      height: '100%',
                      background: 'var(--surface-elevated)',
                      borderRight: '1px solid var(--border)',
                      padding: '10px 0',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      pointerEvents: 'none',
                    }}
                  >
                    {(form.code || '\n').split('\n').map((_, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          lineHeight: '20px',
                          fontFamily: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
                          color: 'var(--text-tertiary)',
                          textAlign: 'right',
                          paddingRight: 8,
                          userSelect: 'none',
                        }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder={PLACEHOLDER_CODE}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      minHeight: 220,
                      padding: '10px 12px 10px 44px',
                      fontSize: 12,
                      lineHeight: '20px',
                      fontFamily: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
                      border: 'none',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      resize: 'vertical',
                      outline: 'none',
                      tabSize: 4,
                      boxSizing: 'border-box',
                      whiteSpace: 'pre',
                      overflowWrap: 'normal',
                      overflowX: 'auto',
                    }}
                    onKeyDown={(e) => {
                      // Tab inserts spaces instead of moving focus
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const target = e.currentTarget;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const spaces = '    ';
                        const updated = form.code.substring(0, start) + spaces + form.code.substring(end);
                        setForm((f) => ({ ...f, code: updated }));
                        // Restore cursor position after React re-render
                        requestAnimationFrame(() => {
                          target.selectionStart = target.selectionEnd = start + spaces.length;
                        });
                      }
                    }}
                  />
                </div>
              </div>

              {/* Form actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <Button variant="secondary" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Save size={14} />}
                  onClick={handleSave}
                  disabled={!form.nodeId || !form.code.trim()}
                >
                  {editingIndex !== null ? 'Update Script' : 'Add Script'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — add button when in list view */}
        {!showForm && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={handleAddNew}
              disabled={allNodes.length === 0}
            >
              Add Script
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
