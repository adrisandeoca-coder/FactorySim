import { useState, useCallback } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { Button } from '../common/Button';
import type { SubModelInstance, SubModelPort, ModelTemplate } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface TemplateEditorProps {
  template: ModelTemplate | null;
  onSave: (template: ModelTemplate) => void;
  onCancel: () => void;
}

function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: template?.id || uuidv4(),
      name: name.trim(),
      description: description.trim() || undefined,
      model: template?.model || {
        name: name.trim(),
        stations: [],
        buffers: [],
        connections: [],
        products: [],
        resources: [],
        extraNodes: [],
        layout: { width: 600, height: 400 },
      },
      parameters: template?.parameters || {},
    });
  };

  return (
    <div className="p-4 border border-gray-600 rounded-lg bg-gray-800">
      <h3 className="text-sm font-semibold text-white mb-3">
        {template ? 'Edit Template' : 'New Template'}
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Template Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            placeholder="e.g., Assembly Cell A"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white resize-none"
            rows={2}
            placeholder="Optional description..."
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name.trim()}>
            {template ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SubModelEditorProps {
  instance: SubModelInstance | null;
  templates: ModelTemplate[];
  onSave: (instance: SubModelInstance) => void;
  onCancel: () => void;
}

function SubModelEditor({ instance, templates, onSave, onCancel }: SubModelEditorProps) {
  const [name, setName] = useState(instance?.name || '');
  const [templateId, setTemplateId] = useState(instance?.templateId || '');
  const [inputPorts, setInputPorts] = useState<SubModelPort[]>(instance?.inputPorts || []);
  const [outputPorts, setOutputPorts] = useState<SubModelPort[]>(instance?.outputPorts || []);

  const addPort = (direction: 'input' | 'output') => {
    const port: SubModelPort = {
      id: uuidv4(),
      name: `${direction} ${direction === 'input' ? inputPorts.length + 1 : outputPorts.length + 1}`,
      direction,
      linkedNodeId: '',
    };
    if (direction === 'input') setInputPorts([...inputPorts, port]);
    else setOutputPorts([...outputPorts, port]);
  };

  const removePort = (direction: 'input' | 'output', portId: string) => {
    if (direction === 'input') setInputPorts(inputPorts.filter((p) => p.id !== portId));
    else setOutputPorts(outputPorts.filter((p) => p.id !== portId));
  };

  const updatePort = (direction: 'input' | 'output', portId: string, updates: Partial<SubModelPort>) => {
    const setter = direction === 'input' ? setInputPorts : setOutputPorts;
    const ports = direction === 'input' ? inputPorts : outputPorts;
    setter(ports.map((p) => (p.id === portId ? { ...p, ...updates } : p)));
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const templateNodes = selectedTemplate
    ? [...selectedTemplate.model.stations.map((s) => ({ id: s.id, name: s.name })),
       ...selectedTemplate.model.extraNodes.map((n) => ({ id: n.id, name: (n.data as { name: string }).name }))]
    : [];

  const handleSave = () => {
    if (!name.trim() || !templateId) return;
    onSave({
      id: instance?.id || uuidv4(),
      templateId,
      name: name.trim(),
      position: instance?.position || { x: 200, y: 200 },
      inputPorts,
      outputPorts,
    });
  };

  const renderPorts = (ports: SubModelPort[], direction: 'input' | 'output') => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400 font-medium">
          {direction === 'input' ? 'Input' : 'Output'} Ports
        </label>
        <button
          onClick={() => addPort(direction)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + Add
        </button>
      </div>
      {ports.map((port) => (
        <div key={port.id} className="flex items-center gap-2">
          <input
            type="text"
            value={port.name}
            onChange={(e) => updatePort(direction, port.id, { name: e.target.value })}
            className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
            placeholder="Port name"
          />
          <select
            value={port.linkedNodeId}
            onChange={(e) => updatePort(direction, port.id, { linkedNodeId: e.target.value })}
            className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
          >
            <option value="">Link to node...</option>
            {templateNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <button
            onClick={() => removePort(direction, port.id)}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 border border-gray-600 rounded-lg bg-gray-800">
      <h3 className="text-sm font-semibold text-white mb-3">
        {instance ? 'Edit Sub-Model' : 'Add Sub-Model Instance'}
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Instance Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            placeholder="e.g., Assembly Cell 1"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Template</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {templateId && (
          <>
            {renderPorts(inputPorts, 'input')}
            {renderPorts(outputPorts, 'output')}
          </>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name.trim() || !templateId}>
            {instance ? 'Update' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function HierarchyManager() {
  const model = useModelStore((s) => s.model);
  const setModel = useModelStore((s) => s.setModel);

  const [editingTemplate, setEditingTemplate] = useState<ModelTemplate | null | 'new'>(null);
  const [editingInstance, setEditingInstance] = useState<SubModelInstance | null | 'new'>(null);

  const templates = model.templates || [];
  const subModels = model.subModels || [];

  const saveTemplate = useCallback((template: ModelTemplate) => {
    const existing = templates.findIndex((t) => t.id === template.id);
    const newTemplates = [...templates];
    if (existing >= 0) {
      newTemplates[existing] = template;
    } else {
      newTemplates.push(template);
    }
    setModel({ ...model, templates: newTemplates });
    setEditingTemplate(null);
  }, [model, templates, setModel]);

  const removeTemplate = useCallback((id: string) => {
    setModel({
      ...model,
      templates: templates.filter((t) => t.id !== id),
      subModels: subModels.filter((s) => s.templateId !== id),
    });
  }, [model, templates, subModels, setModel]);

  const saveInstance = useCallback((instance: SubModelInstance) => {
    const existing = subModels.findIndex((s) => s.id === instance.id);
    const newInstances = [...subModels];
    if (existing >= 0) {
      newInstances[existing] = instance;
    } else {
      newInstances.push(instance);
    }
    setModel({ ...model, subModels: newInstances });
    setEditingInstance(null);
  }, [model, subModels, setModel]);

  const removeInstance = useCallback((id: string) => {
    setModel({ ...model, subModels: subModels.filter((s) => s.id !== id) });
  }, [model, subModels, setModel]);

  const createTemplateFromSelection = useCallback(() => {
    // Create a template from the current model's content
    const template: ModelTemplate = {
      id: uuidv4(),
      name: `${model.name} Template`,
      description: `Template created from ${model.name}`,
      model: {
        name: model.name,
        stations: [...model.stations],
        buffers: [...model.buffers],
        connections: [...model.connections],
        products: [],
        resources: [...model.resources],
        extraNodes: model.extraNodes.filter((n) => n.type !== 'source' && n.type !== 'sink'),
        layout: { ...model.layout },
      },
      parameters: {},
    };
    saveTemplate(template);
  }, [model, saveTemplate]);

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Model Hierarchy</h2>
        <p className="text-xs text-gray-400">
          Create reusable templates and instantiate sub-models to build hierarchical factory layouts.
        </p>
      </div>

      {/* Templates Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Templates</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={createTemplateFromSelection}>
              From Current Model
            </Button>
            <Button variant="primary" size="sm" onClick={() => setEditingTemplate('new')}>
              New Template
            </Button>
          </div>
        </div>

        {editingTemplate && (
          <TemplateEditor
            template={editingTemplate === 'new' ? null : editingTemplate}
            onSave={saveTemplate}
            onCancel={() => setEditingTemplate(null)}
          />
        )}

        {templates.length === 0 && !editingTemplate ? (
          <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-700 rounded">
            No templates defined. Create one to start building hierarchical models.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
                <div>
                  <div className="text-sm text-white font-medium">{t.name}</div>
                  <div className="text-xs text-gray-400">
                    {t.model.stations.length} stations, {t.model.buffers.length} buffers
                    {t.description && ` — ${t.description}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTemplate(t)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeTemplate(t.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-Model Instances */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Sub-Model Instances</h3>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditingInstance('new')}
            disabled={templates.length === 0}
          >
            Add Instance
          </Button>
        </div>

        {editingInstance && (
          <SubModelEditor
            instance={editingInstance === 'new' ? null : editingInstance}
            templates={templates}
            onSave={saveInstance}
            onCancel={() => setEditingInstance(null)}
          />
        )}

        {subModels.length === 0 && !editingInstance ? (
          <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-700 rounded">
            No sub-model instances. Add instances of your templates to compose the hierarchy.
          </p>
        ) : (
          <div className="space-y-2">
            {subModels.map((s) => {
              const tmpl = templates.find((t) => t.id === s.templateId);
              return (
                <div key={s.id} className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
                  <div>
                    <div className="text-sm text-white font-medium">{s.name}</div>
                    <div className="text-xs text-gray-400">
                      Template: {tmpl?.name || 'Unknown'} |{' '}
                      {s.inputPorts.length} in, {s.outputPorts.length} out
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingInstance(s)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeInstance(s.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hierarchy Visualization */}
      {subModels.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Hierarchy Overview</h3>
          <div className="p-4 bg-gray-800 rounded border border-gray-700">
            <div className="text-sm text-white font-medium mb-2">{model.name}</div>
            <div className="ml-4 space-y-1">
              {subModels.map((s) => {
                const tmpl = templates.find((t) => t.id === s.templateId);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">├─</span>
                    <span className="text-blue-400">{s.name}</span>
                    <span className="text-gray-500">({tmpl?.name})</span>
                    <span className="text-gray-600">
                      [{s.inputPorts.length}→ {tmpl?.model.stations.length} stations →{s.outputPorts.length}]
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
