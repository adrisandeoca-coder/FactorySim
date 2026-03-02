import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from '../stores/modelStore';

// Reset store state before each test
beforeEach(() => {
  useModelStore.getState().resetModel();
});

describe('modelStore — stations', () => {
  it('starts with an empty stations array', () => {
    expect(useModelStore.getState().model.stations).toEqual([]);
  });

  it('adds a station with defaults', () => {
    useModelStore.getState().addStation({ name: 'Milling' });
    const stations = useModelStore.getState().model.stations;
    expect(stations).toHaveLength(1);
    expect(stations[0].name).toBe('Milling');
    expect(stations[0].id).toBeTruthy();
    expect(stations[0].cycleTime).toBeDefined();
  });

  it('updates a station', () => {
    useModelStore.getState().addStation({ id: 's1', name: 'Milling' });
    useModelStore.getState().updateStation('s1', { name: 'Turning' });
    expect(useModelStore.getState().model.stations[0].name).toBe('Turning');
  });

  it('removes a station and its connections', () => {
    useModelStore.getState().addStation({ id: 's1', name: 'S1' });
    useModelStore.getState().addStation({ id: 's2', name: 'S2' });
    useModelStore.getState().addConnection({ id: 'c1', source: 's1', target: 's2' });

    useModelStore.getState().removeStation('s1');
    expect(useModelStore.getState().model.stations).toHaveLength(1);
    expect(useModelStore.getState().model.connections).toHaveLength(0);
  });

  it('clears selectedNodeId when the selected station is removed', () => {
    useModelStore.getState().addStation({ id: 's1', name: 'S1' });
    useModelStore.getState().setSelectedNode('s1');
    expect(useModelStore.getState().selectedNodeId).toBe('s1');

    useModelStore.getState().removeStation('s1');
    expect(useModelStore.getState().selectedNodeId).toBeNull();
  });
});

describe('modelStore — buffers', () => {
  it('adds a buffer with defaults', () => {
    useModelStore.getState().addBuffer({ name: 'Queue 1' });
    const buffers = useModelStore.getState().model.buffers;
    expect(buffers).toHaveLength(1);
    expect(buffers[0].name).toBe('Queue 1');
    expect(buffers[0].capacity).toBe(10);
    expect(buffers[0].queueRule).toBe('FIFO');
  });

  it('removes a buffer and its connections', () => {
    useModelStore.getState().addStation({ id: 's1', name: 'S1' });
    useModelStore.getState().addBuffer({ id: 'b1', name: 'B1' });
    useModelStore.getState().addConnection({ id: 'c1', source: 's1', target: 'b1' });

    useModelStore.getState().removeBuffer('b1');
    expect(useModelStore.getState().model.buffers).toHaveLength(0);
    expect(useModelStore.getState().model.connections).toHaveLength(0);
  });
});

describe('modelStore — connections', () => {
  it('adds a connection', () => {
    useModelStore.getState().addConnection({ source: 's1', target: 'b1' });
    expect(useModelStore.getState().model.connections).toHaveLength(1);
  });

  it('prevents duplicate connections', () => {
    useModelStore.getState().addConnection({ source: 's1', target: 'b1' });
    useModelStore.getState().addConnection({ source: 's1', target: 'b1' });
    expect(useModelStore.getState().model.connections).toHaveLength(1);
  });

  it('removes a connection', () => {
    useModelStore.getState().addConnection({ id: 'c1', source: 's1', target: 'b1' });
    useModelStore.getState().removeConnection('c1');
    expect(useModelStore.getState().model.connections).toHaveLength(0);
  });
});

describe('modelStore — undo/redo', () => {
  it('can undo an add-station operation', () => {
    // saveToHistory on the initial empty model so undo has something to go back to
    useModelStore.getState().saveToHistory();
    useModelStore.getState().addStation({ name: 'S1' });
    expect(useModelStore.getState().model.stations).toHaveLength(1);

    useModelStore.getState().undo();
    expect(useModelStore.getState().model.stations).toHaveLength(0);
  });

  it('can redo after undo', () => {
    useModelStore.getState().saveToHistory();
    useModelStore.getState().addStation({ name: 'S1' });

    useModelStore.getState().undo();
    expect(useModelStore.getState().model.stations).toHaveLength(0);

    useModelStore.getState().redo();
    expect(useModelStore.getState().model.stations).toHaveLength(1);
  });

  it('does nothing on undo when no history', () => {
    const modelBefore = useModelStore.getState().model;
    useModelStore.getState().undo();
    expect(useModelStore.getState().model).toBe(modelBefore);
  });

  it('does nothing on redo at the end of history', () => {
    useModelStore.getState().addStation({ name: 'S1' });
    const modelBefore = useModelStore.getState().model;
    useModelStore.getState().redo();
    expect(useModelStore.getState().model).toBe(modelBefore);
  });
});

describe('modelStore — model lifecycle', () => {
  it('resets to empty model', () => {
    useModelStore.getState().addStation({ name: 'S1' });
    useModelStore.getState().resetModel();
    expect(useModelStore.getState().model.stations).toHaveLength(0);
    expect(useModelStore.getState().model.name).toBe('New Factory Model');
    expect(useModelStore.getState().history).toHaveLength(0);
    expect(useModelStore.getState().historyIndex).toBe(-1);
  });

  it('setModelName updates the name', () => {
    useModelStore.getState().setModelName('My Line');
    expect(useModelStore.getState().model.name).toBe('My Line');
  });

  it('loadTemplate sets model from template', () => {
    useModelStore.getState().loadTemplate({
      id: 't1',
      name: 'Test Template',
      description: 'A test',
      category: 'test',
      template: {
        stations: [
          { id: 's1', name: 'Station 1', cycleTime: { type: 'constant', parameters: { value: 60 } }, position: { x: 0, y: 0 } },
        ],
        buffers: [],
        connections: [],
      },
    });

    expect(useModelStore.getState().model.name).toBe('Test Template');
    expect(useModelStore.getState().model.stations).toHaveLength(1);
  });

  it('default model includes source and sink extra nodes', () => {
    expect(useModelStore.getState().model.extraNodes).toHaveLength(2);
    const types = useModelStore.getState().model.extraNodes.map(n => n.type);
    expect(types).toContain('source');
    expect(types).toContain('sink');
  });
});
