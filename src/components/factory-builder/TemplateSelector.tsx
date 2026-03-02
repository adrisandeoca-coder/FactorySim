import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import type { Template } from '../../types';
import { masterTestTemplate } from './masterTemplate';

const templates: Template[] = [
  {
    id: 'flow-line',
    name: 'Flow Line',
    description: 'Linear production line with 3 stations, buffers, and a single product',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's1', name: 'Cutting', cycleTime: { type: 'normal', parameters: { mean: 60, std: 5 } }, position: { x: 250, y: 250 } },
        { id: 's2', name: 'Welding', cycleTime: { type: 'normal', parameters: { mean: 55, std: 8 } }, position: { x: 500, y: 250 } },
        { id: 's3', name: 'Finishing', cycleTime: { type: 'normal', parameters: { mean: 65, std: 6 } }, position: { x: 750, y: 250 } },
      ],
      buffers: [
        { id: 'b1', name: 'Buffer 1-2', capacity: 10, queueRule: 'FIFO', position: { x: 375, y: 250 } },
        { id: 'b2', name: 'Buffer 2-3', capacity: 10, queueRule: 'FIFO', position: { x: 625, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's1' },
        { id: 'c1', source: 's1', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's2' },
        { id: 'c3', source: 's2', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's3' },
        { id: 'c5', source: 's3', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Part A', routing: ['s1', 's2', 's3'], arrivalRate: 70 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 70, feedMode: 'interval' }, position: { x: 50, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 950, y: 250 } },
      ],
    },
  },
  {
    id: 'job-shop',
    name: 'Job Shop',
    description: 'Flexible routing with parallel milling, turning, and assembly',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's1', name: 'Milling 1', cycleTime: { type: 'triangular', parameters: { min: 30, mode: 45, max: 60 } }, position: { x: 300, y: 100 } },
        { id: 's2', name: 'Milling 2', cycleTime: { type: 'triangular', parameters: { min: 30, mode: 45, max: 60 } }, position: { x: 300, y: 350 } },
        { id: 's3', name: 'Turning', cycleTime: { type: 'exponential', parameters: { mean: 40 } }, position: { x: 550, y: 225 } },
        { id: 's4', name: 'Assembly', cycleTime: { type: 'normal', parameters: { mean: 50, std: 10 } }, position: { x: 800, y: 225 } },
      ],
      buffers: [
        { id: 'b1', name: 'Input Queue', capacity: 50, queueRule: 'FIFO', position: { x: 150, y: 225 } },
        { id: 'b2', name: 'WIP Buffer', capacity: 30, queueRule: 'FIFO', position: { x: 425, y: 225 } },
        { id: 'b3', name: 'Assembly Queue', capacity: 20, queueRule: 'FIFO', position: { x: 675, y: 225 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b1' },
        { id: 'c1', source: 'b1', target: 'split-1' },
        { id: 'c2', source: 'split-1', target: 's1' },
        { id: 'c3', source: 'split-1', target: 's2' },
        { id: 'c4', source: 's1', target: 'b2' },
        { id: 'c5', source: 's2', target: 'b2' },
        { id: 'c6', source: 'b2', target: 's3' },
        { id: 'c7', source: 's3', target: 'b3' },
        { id: 'c8', source: 'b3', target: 's4' },
        { id: 'c9', source: 's4', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Shaft', routing: ['s1', 's3', 's4'], arrivalRate: 90 },
        { id: 'p2', name: 'Housing', routing: ['s2', 's3', 's4'], arrivalRate: 90 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 90, feedMode: 'interval' }, position: { x: 50, y: 225 } },
        { id: 'split-1', type: 'splitter', data: { id: 'split-1', name: 'Router', outputs: 2, splitType: 'equal' }, position: { x: 150, y: 100 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 1000, y: 225 } },
      ],
    },
  },
  {
    id: 'assembly-cell',
    name: 'Assembly Cell',
    description: 'Two sub-assembly lines merging into final assembly and testing',
    category: 'assembly',
    template: {
      stations: [
        { id: 's1', name: 'Sub-Assembly A', cycleTime: { type: 'normal', parameters: { mean: 30, std: 5 } }, position: { x: 250, y: 100 } },
        { id: 's2', name: 'Sub-Assembly B', cycleTime: { type: 'normal', parameters: { mean: 35, std: 5 } }, position: { x: 250, y: 350 } },
        { id: 's3', name: 'Final Assembly', cycleTime: { type: 'normal', parameters: { mean: 45, std: 8 } }, position: { x: 550, y: 225 } },
        { id: 's4', name: 'Testing', cycleTime: { type: 'exponential', parameters: { mean: 20 } }, scrapRate: 0.02, position: { x: 750, y: 225 } },
      ],
      buffers: [
        { id: 'b1', name: 'Buffer A', capacity: 15, queueRule: 'FIFO', position: { x: 400, y: 100 } },
        { id: 'b2', name: 'Buffer B', capacity: 15, queueRule: 'FIFO', position: { x: 400, y: 350 } },
        { id: 'b3', name: 'Test Queue', capacity: 10, queueRule: 'FIFO', position: { x: 650, y: 225 } },
      ],
      connections: [
        { id: 'c0a', source: 'src-a', target: 's1' },
        { id: 'c0b', source: 'src-b', target: 's2' },
        { id: 'c1', source: 's1', target: 'b1' },
        { id: 'c2', source: 's2', target: 'b2' },
        { id: 'c3', source: 'b1', target: 's3' },
        { id: 'c4', source: 'b2', target: 's3' },
        { id: 'c5', source: 's3', target: 'b3' },
        { id: 'c6', source: 'b3', target: 's4' },
        { id: 'c7', source: 's4', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Component A', routing: ['s1', 's3', 's4'], arrivalRate: 60 },
        { id: 'p2', name: 'Component B', routing: ['s2', 's3', 's4'], arrivalRate: 60 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-a', type: 'source', data: { id: 'src-a', name: 'Source A', arrivalRate: 60, feedMode: 'interval' }, position: { x: 50, y: 100 } },
        { id: 'src-b', type: 'source', data: { id: 'src-b', name: 'Source B', arrivalRate: 60, feedMode: 'interval' }, position: { x: 50, y: 350 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 950, y: 225 } },
      ],
    },
  },
  {
    id: 'u-cell',
    name: 'U-Cell',
    description: 'U-shaped lean manufacturing cell with 6 operations and inspection',
    category: 'lean',
    template: {
      stations: [
        { id: 's1', name: 'Op 10', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 200, y: 100 } },
        { id: 's2', name: 'Op 20', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 400, y: 100 } },
        { id: 's3', name: 'Op 30', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 600, y: 100 } },
        { id: 's4', name: 'Op 40', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 600, y: 350 } },
        { id: 's5', name: 'Op 50', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 400, y: 350 } },
        { id: 's6', name: 'Op 60', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 200, y: 350 } },
      ],
      buffers: [],
      connections: [
        { id: 'c0', source: 'src-1', target: 's1' },
        { id: 'c1', source: 's1', target: 's2' },
        { id: 'c2', source: 's2', target: 's3' },
        { id: 'c3', source: 's3', target: 's4' },
        { id: 'c4', source: 's4', target: 's5' },
        { id: 'c5', source: 's5', target: 's6' },
        { id: 'c6', source: 's6', target: 'insp-1' },
        { id: 'c7', source: 'insp-1', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Widget', routing: ['s1', 's2', 's3', 's4', 's5', 's6'], arrivalRate: 30 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 30, feedMode: 'interval' }, position: { x: 50, y: 100 } },
        { id: 'insp-1', type: 'inspection', data: { id: 'insp-1', name: 'Final Inspection', inspectionTime: 15, defectRate: 3, inspectionType: 'visual' }, position: { x: 200, y: 500 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 400, y: 500 } },
      ],
    },
  },
  {
    id: 'batch-process',
    name: 'Batch Processing',
    description: 'Batch-based mixing, heating, and cooling with large buffers',
    category: 'process',
    template: {
      stations: [
        { id: 's1', name: 'Mixing', cycleTime: { type: 'constant', parameters: { value: 120 } }, batchSize: 10, position: { x: 250, y: 225 } },
        { id: 's2', name: 'Heating', cycleTime: { type: 'constant', parameters: { value: 180 } }, batchSize: 10, position: { x: 500, y: 225 } },
        { id: 's3', name: 'Cooling', cycleTime: { type: 'constant', parameters: { value: 90 } }, batchSize: 10, position: { x: 750, y: 225 } },
      ],
      buffers: [
        { id: 'b1', name: 'Raw Materials', capacity: 50, queueRule: 'FIFO', position: { x: 150, y: 225 } },
        { id: 'b2', name: 'Heat Queue', capacity: 20, queueRule: 'FIFO', position: { x: 375, y: 225 } },
        { id: 'b3', name: 'Cool Queue', capacity: 20, queueRule: 'FIFO', position: { x: 625, y: 225 } },
        { id: 'b4', name: 'Finished Goods', capacity: 100, queueRule: 'FIFO', position: { x: 875, y: 225 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b1' },
        { id: 'c1', source: 'b1', target: 's1' },
        { id: 'c2', source: 's1', target: 'b2' },
        { id: 'c3', source: 'b2', target: 's2' },
        { id: 'c4', source: 's2', target: 'b3' },
        { id: 'c5', source: 'b3', target: 's3' },
        { id: 'c6', source: 's3', target: 'b4' },
        { id: 'c7', source: 'b4', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Batch Product', routing: ['s1', 's2', 's3'], arrivalRate: 120 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 120, feedMode: 'interval' }, position: { x: 50, y: 225 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 1050, y: 225 } },
      ],
    },
  },
  // ── New templates covering all component types ──
  {
    id: 'conveyor-line',
    name: 'Conveyor Line',
    description: 'Production line using conveyors for transport between stations',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's1', name: 'Stamping', cycleTime: { type: 'normal', parameters: { mean: 40, std: 4 } }, position: { x: 200, y: 250 } },
        { id: 's2', name: 'Bending', cycleTime: { type: 'normal', parameters: { mean: 35, std: 3 } }, position: { x: 500, y: 250 } },
        { id: 's3', name: 'Drilling', cycleTime: { type: 'normal', parameters: { mean: 50, std: 6 } }, position: { x: 800, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Input Queue', capacity: 20, queueRule: 'FIFO', position: { x: 100, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's1' },
        { id: 'c2', source: 's1', target: 'conv-1' },
        { id: 'c3', source: 'conv-1', target: 's2' },
        { id: 'c4', source: 's2', target: 'conv-2' },
        { id: 'c5', source: 'conv-2', target: 's3' },
        { id: 'c6', source: 's3', target: 'insp-1' },
        { id: 'c7', source: 'insp-1', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Metal Part', routing: ['s1', 's2', 's3'], arrivalRate: 55 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 55, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'conv-1', type: 'conveyor', data: { id: 'conv-1', name: 'Conveyor A', length: 5, speed: 1, capacity: 5 }, position: { x: 350, y: 250 } },
        { id: 'conv-2', type: 'conveyor', data: { id: 'conv-2', name: 'Conveyor B', length: 8, speed: 1.5, capacity: 8 }, position: { x: 650, y: 250 } },
        { id: 'insp-1', type: 'inspection', data: { id: 'insp-1', name: 'Final QC', inspectionTime: 10, defectRate: 2, inspectionType: 'visual' }, position: { x: 950, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 1100, y: 250 } },
      ],
    },
  },
  {
    id: 'product-routing',
    name: 'Product-Based Routing',
    description: 'Splitter routes different products to dedicated lines, then merge for shipping',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-small', name: 'Small Parts Line', cycleTime: { type: 'normal', parameters: { mean: 30, std: 3 } }, position: { x: 450, y: 100 } },
        { id: 's-large', name: 'Large Parts Line', cycleTime: { type: 'normal', parameters: { mean: 60, std: 8 } }, position: { x: 450, y: 400 } },
        { id: 's-pack', name: 'Packing', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 850, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Incoming', capacity: 30, queueRule: 'FIFO', position: { x: 150, y: 250 } },
        { id: 'b-pack', name: 'Pack Queue', capacity: 20, queueRule: 'FIFO', position: { x: 700, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 'split-1' },
        { id: 'c2', source: 'split-1', target: 's-small' },
        { id: 'c3', source: 'split-1', target: 's-large' },
        { id: 'c4', source: 's-small', target: 'merge-1' },
        { id: 'c5', source: 's-large', target: 'merge-1' },
        { id: 'c6', source: 'merge-1', target: 'b-pack' },
        { id: 'c7', source: 'b-pack', target: 's-pack' },
        { id: 'c8', source: 's-pack', target: 'sink-1' },
      ],
      products: [
        { id: 'p-small', name: 'Small Widget', routing: ['s-small', 's-pack'], arrivalRate: 40 },
        { id: 'p-large', name: 'Large Widget', routing: ['s-large', 's-pack'], arrivalRate: 80 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 40, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'split-1', type: 'splitter', data: { id: 'split-1', name: 'Product Router', outputs: 2, splitType: 'product-based', productRouting: { 'p-small': 0, 'p-large': 1 } }, position: { x: 300, y: 250 } },
        { id: 'merge-1', type: 'merge', data: { id: 'merge-1', name: 'Merge', inputs: 2, mergeType: 'fifo' }, position: { x: 600, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Shipping' }, position: { x: 1050, y: 250 } },
      ],
    },
  },
  {
    id: 'assembly-disassembly',
    name: 'Assembly & Disassembly',
    description: 'Incoming units are disassembled, reworked, and reassembled with per-product inputs',
    category: 'assembly',
    template: {
      stations: [
        { id: 's-prep', name: 'Prep Station', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 250, y: 250 } },
        { id: 's-rework-a', name: 'Rework Frame', cycleTime: { type: 'normal', parameters: { mean: 40, std: 5 } }, position: { x: 600, y: 100 } },
        { id: 's-rework-b', name: 'Rework Motor', cycleTime: { type: 'normal', parameters: { mean: 50, std: 8 } }, position: { x: 600, y: 400 } },
        { id: 's-test', name: 'Final Test', cycleTime: { type: 'constant', parameters: { value: 25 } }, scrapRate: 0.01, position: { x: 1000, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Incoming', capacity: 20, queueRule: 'FIFO', position: { x: 150, y: 250 } },
        { id: 'b-prep-out', name: 'Prep Output', capacity: 15, queueRule: 'FIFO', position: { x: 420, y: 250 } },
        { id: 'b-rework-out', name: 'Rework Output', capacity: 15, queueRule: 'FIFO', position: { x: 800, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-prep' },
        { id: 'c2', source: 's-prep', target: 'disasm-1' },
        { id: 'c3', source: 'disasm-1', target: 's-rework-a' },
        { id: 'c4', source: 'disasm-1', target: 's-rework-b' },
        { id: 'c5', source: 's-rework-a', target: 'assy-1' },
        { id: 'c6', source: 's-rework-b', target: 'assy-1' },
        { id: 'c7', source: 'assy-1', target: 's-test' },
        { id: 'c8', source: 's-test', target: 'sink-1' },
        // Simulation wiring (engine only sees Station↔Buffer)
        { id: 'cs1', source: 's-prep', target: 'b-prep-out' },
        { id: 'cs2', source: 'b-prep-out', target: 's-rework-a' },
        { id: 'cs3', source: 'b-prep-out', target: 's-rework-b' },
        { id: 'cs4', source: 's-rework-a', target: 'b-rework-out' },
        { id: 'cs5', source: 's-rework-b', target: 'b-rework-out' },
        { id: 'cs6', source: 'b-rework-out', target: 's-test' },
      ],
      products: [
        { id: 'p-unit', name: 'Motor Unit', routing: ['s-prep'], arrivalRate: 90 },
        { id: 'p-frame', name: 'Frame', routing: ['s-rework-a', 's-test'] },
        { id: 'p-motor', name: 'Motor', routing: ['s-rework-b', 's-test'] },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 90, feedMode: 'interval', productFilter: 'p-unit' }, position: { x: 30, y: 250 } },
        { id: 'disasm-1', type: 'disassembly', data: { id: 'disasm-1', name: 'Disassembly', cycleTime: 30, outputParts: [{ productId: 'p-frame', productName: 'Frame', quantity: 1 }, { productId: 'p-motor', productName: 'Motor', quantity: 1 }] }, position: { x: 400, y: 150 } },
        { id: 'assy-1', type: 'assembly', data: { id: 'assy-1', name: 'Reassembly', cycleTime: 45, inputParts: 2, inputPartsByProduct: [{ productId: 'p-frame', productName: 'Frame', quantity: 1 }, { productId: 'p-motor', productName: 'Motor', quantity: 1 }] }, position: { x: 800, y: 150 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 1150, y: 250 } },
      ],
    },
  },
  {
    id: 'pallet-line',
    name: 'Palletize & Depalletize',
    description: 'Items are palletized for transport, then depalletized for final processing',
    category: 'process',
    template: {
      stations: [
        { id: 's-fill', name: 'Filling', cycleTime: { type: 'constant', parameters: { value: 15 } }, position: { x: 200, y: 250 } },
        { id: 's-label', name: 'Labeling', cycleTime: { type: 'constant', parameters: { value: 10 } }, position: { x: 900, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Raw Materials', capacity: 50, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-mid', name: 'Transfer Buffer', capacity: 30, queueRule: 'FIFO', position: { x: 550, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-fill' },
        { id: 'c2', source: 's-fill', target: 'pall-1' },
        { id: 'c3', source: 'pall-1', target: 'conv-1' },
        { id: 'c4', source: 'conv-1', target: 'depall-1' },
        { id: 'c5', source: 'depall-1', target: 's-label' },
        { id: 'c6', source: 's-label', target: 'sink-1' },
        // Simulation wiring (engine only sees Station↔Buffer)
        { id: 'cs1', source: 's-fill', target: 'b-mid' },
        { id: 'cs2', source: 'b-mid', target: 's-label' },
      ],
      products: [
        { id: 'p-bottle', name: 'Bottle', routing: ['s-fill', 's-label'], arrivalRate: 20 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 20, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'pall-1', type: 'palletize', data: { id: 'pall-1', name: 'Palletizer', defaultPalletSize: 12, cycleTime: 30 }, position: { x: 350, y: 250 } },
        { id: 'conv-1', type: 'conveyor', data: { id: 'conv-1', name: 'Transfer Conveyor', length: 10, speed: 2, capacity: 10 }, position: { x: 550, y: 150 } },
        { id: 'depall-1', type: 'depalletize', data: { id: 'depall-1', name: 'Depalletizer', cycleTime: 5 }, position: { x: 750, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Shipping' }, position: { x: 1050, y: 250 } },
      ],
    },
  },
  {
    id: 'match-buffer-sync',
    name: 'Match Buffer Sync',
    description: 'Two production lines feed a match buffer that synchronizes parts before assembly',
    category: 'assembly',
    template: {
      stations: [
        { id: 's-left-a', name: 'Machine Left A', cycleTime: { type: 'normal', parameters: { mean: 35, std: 4 } }, position: { x: 250, y: 100 } },
        { id: 's-left-b', name: 'Machine Left B', cycleTime: { type: 'normal', parameters: { mean: 40, std: 5 } }, position: { x: 450, y: 100 } },
        { id: 's-right-a', name: 'Machine Right A', cycleTime: { type: 'normal', parameters: { mean: 30, std: 3 } }, position: { x: 250, y: 400 } },
        { id: 's-right-b', name: 'Machine Right B', cycleTime: { type: 'normal', parameters: { mean: 45, std: 6 } }, position: { x: 450, y: 400 } },
        { id: 's-final', name: 'Final Assembly', cycleTime: { type: 'normal', parameters: { mean: 55, std: 7 } }, position: { x: 900, y: 250 } },
      ],
      buffers: [
        { id: 'b-l1', name: 'Left Buffer 1', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 100 } },
        { id: 'b-r1', name: 'Right Buffer 1', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 400 } },
        { id: 'b-merge', name: 'Merge Buffer', capacity: 20, queueRule: 'FIFO', position: { x: 700, y: 250 } },
      ],
      connections: [
        { id: 'c0a', source: 'src-left', target: 's-left-a' },
        { id: 'c1a', source: 's-left-a', target: 'b-l1' },
        { id: 'c2a', source: 'b-l1', target: 's-left-b' },
        { id: 'c3a', source: 's-left-b', target: 'match-1' },
        { id: 'c0b', source: 'src-right', target: 's-right-a' },
        { id: 'c1b', source: 's-right-a', target: 'b-r1' },
        { id: 'c2b', source: 'b-r1', target: 's-right-b' },
        { id: 'c3b', source: 's-right-b', target: 'match-1' },
        { id: 'c4', source: 'match-1', target: 's-final' },
        { id: 'c5', source: 's-final', target: 'insp-1' },
        { id: 'c6', source: 'insp-1', target: 'sink-1' },
        // Simulation wiring (engine only sees Station↔Buffer)
        { id: 'cs1', source: 's-left-b', target: 'b-merge' },
        { id: 'cs2', source: 's-right-b', target: 'b-merge' },
        { id: 'cs3', source: 'b-merge', target: 's-final' },
      ],
      products: [
        { id: 'p-left', name: 'Left Panel', routing: ['s-left-a', 's-left-b', 's-final'], arrivalRate: 50 },
        { id: 'p-right', name: 'Right Panel', routing: ['s-right-a', 's-right-b', 's-final'], arrivalRate: 50 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-left', type: 'source', data: { id: 'src-left', name: 'Left Source', arrivalRate: 50, feedMode: 'interval' }, position: { x: 50, y: 100 } },
        { id: 'src-right', type: 'source', data: { id: 'src-right', name: 'Right Source', arrivalRate: 50, feedMode: 'interval' }, position: { x: 50, y: 400 } },
        { id: 'match-1', type: 'matchbuffer', data: { id: 'match-1', name: 'Part Sync', capacity: 20, matchKey: 'batch', requiredParts: [{ productId: 'p-left', productName: 'Left Panel', quantity: 1 }, { productId: 'p-right', productName: 'Right Panel', quantity: 1 }], timeout: 600 }, position: { x: 680, y: 250 } },
        { id: 'insp-1', type: 'inspection', data: { id: 'insp-1', name: 'Final QC', inspectionTime: 15, defectRate: 1.5, inspectionType: 'automated' }, position: { x: 1050, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Finished Goods' }, position: { x: 1200, y: 250 } },
      ],
    },
  },
  // ── Industry-specific realistic scenarios ──
  {
    id: 'automotive-paint-shop',
    name: 'Automotive Paint Shop',
    description: 'Multi-stage car body painting: pretreatment, e-coat, primer, base coat, clear coat with oven curing and defect inspection',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-pretreat', name: 'Pretreatment', cycleTime: { type: 'constant', parameters: { value: 180 } }, position: { x: 150, y: 250 } },
        { id: 's-ecoat', name: 'E-Coat', cycleTime: { type: 'constant', parameters: { value: 240 } }, position: { x: 350, y: 250 } },
        { id: 's-primer', name: 'Primer Booth', cycleTime: { type: 'normal', parameters: { mean: 300, std: 20 } }, scrapRate: 0.02, position: { x: 550, y: 250 } },
        { id: 's-oven1', name: 'Primer Oven', cycleTime: { type: 'constant', parameters: { value: 600 } }, position: { x: 750, y: 250 } },
        { id: 's-base', name: 'Base Coat Booth', cycleTime: { type: 'normal', parameters: { mean: 360, std: 30 } }, scrapRate: 0.03, mtbf: 8, mttr: 0.5, position: { x: 950, y: 250 } },
        { id: 's-clear', name: 'Clear Coat', cycleTime: { type: 'normal', parameters: { mean: 300, std: 25 } }, scrapRate: 0.01, position: { x: 1150, y: 250 } },
        { id: 's-oven2', name: 'Final Oven', cycleTime: { type: 'constant', parameters: { value: 600 } }, position: { x: 1350, y: 250 } },
      ],
      buffers: [
        { id: 'b1', name: 'Pre-Ecoat', capacity: 5, queueRule: 'FIFO', position: { x: 250, y: 250 } },
        { id: 'b2', name: 'Pre-Primer', capacity: 5, queueRule: 'FIFO', position: { x: 450, y: 250 } },
        { id: 'b3', name: 'Pre-Oven', capacity: 3, queueRule: 'FIFO', position: { x: 650, y: 250 } },
        { id: 'b4', name: 'Pre-Base', capacity: 5, queueRule: 'FIFO', position: { x: 850, y: 250 } },
        { id: 'b5', name: 'Pre-Clear', capacity: 5, queueRule: 'FIFO', position: { x: 1050, y: 250 } },
        { id: 'b6', name: 'Pre-FinalOven', capacity: 3, queueRule: 'FIFO', position: { x: 1250, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-pretreat' },
        { id: 'c1', source: 's-pretreat', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-ecoat' },
        { id: 'c3', source: 's-ecoat', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-primer' },
        { id: 'c5', source: 's-primer', target: 'b3' },
        { id: 'c6', source: 'b3', target: 's-oven1' },
        { id: 'c7', source: 's-oven1', target: 'b4' },
        { id: 'c8', source: 'b4', target: 's-base' },
        { id: 'c9', source: 's-base', target: 'b5' },
        { id: 'c10', source: 'b5', target: 's-clear' },
        { id: 'c11', source: 's-clear', target: 'b6' },
        { id: 'c12', source: 'b6', target: 's-oven2' },
        { id: 'c13', source: 's-oven2', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Car Body', routing: ['s-pretreat', 's-ecoat', 's-primer', 's-oven1', 's-base', 's-clear', 's-oven2'], arrivalRate: 300 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Body-in-White', arrivalRate: 300, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'To Assembly' }, position: { x: 1500, y: 250 } },
      ],
    },
  },
  {
    id: 'smt-pcb-line',
    name: 'SMT / PCB Assembly',
    description: 'Surface-mount electronics line: solder paste printing, pick-and-place, reflow oven, AOI inspection with high-volume output',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-print', name: 'Solder Paste Printer', cycleTime: { type: 'normal', parameters: { mean: 15, std: 2 } }, scrapRate: 0.005, position: { x: 200, y: 250 } },
        { id: 's-pnp1', name: 'Pick & Place 1', cycleTime: { type: 'normal', parameters: { mean: 25, std: 3 } }, mtbf: 4, mttr: 0.25, position: { x: 400, y: 250 } },
        { id: 's-pnp2', name: 'Pick & Place 2', cycleTime: { type: 'normal', parameters: { mean: 20, std: 2 } }, mtbf: 4, mttr: 0.25, position: { x: 600, y: 250 } },
        { id: 's-reflow', name: 'Reflow Oven', cycleTime: { type: 'constant', parameters: { value: 180 } }, position: { x: 800, y: 250 } },
        { id: 's-aoi', name: 'AOI Inspection', cycleTime: { type: 'constant', parameters: { value: 10 } }, scrapRate: 0.03, position: { x: 1000, y: 250 } },
      ],
      buffers: [
        { id: 'b1', name: 'Post-Print', capacity: 8, queueRule: 'FIFO', position: { x: 300, y: 250 } },
        { id: 'b2', name: 'Post-PnP1', capacity: 8, queueRule: 'FIFO', position: { x: 500, y: 250 } },
        { id: 'b3', name: 'Pre-Reflow', capacity: 4, queueRule: 'FIFO', position: { x: 700, y: 250 } },
        { id: 'b4', name: 'Post-Reflow', capacity: 10, queueRule: 'FIFO', position: { x: 900, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-print' },
        { id: 'c1', source: 's-print', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-pnp1' },
        { id: 'c3', source: 's-pnp1', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-pnp2' },
        { id: 'c5', source: 's-pnp2', target: 'b3' },
        { id: 'c6', source: 'b3', target: 's-reflow' },
        { id: 'c7', source: 's-reflow', target: 'b4' },
        { id: 'c8', source: 'b4', target: 's-aoi' },
        { id: 'c9', source: 's-aoi', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'PCB Board', routing: ['s-print', 's-pnp1', 's-pnp2', 's-reflow', 's-aoi'], arrivalRate: 20 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Bare PCB Loader', arrivalRate: 20, feedMode: 'interval' }, position: { x: 50, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Good Boards' }, position: { x: 1150, y: 250 } },
      ],
    },
  },
  {
    id: 'cnc-setup-heavy',
    name: 'CNC Machine Shop',
    description: 'High-mix shop with 3 CNC machines producing 3 product families requiring setup changeovers between types',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-cnc1', name: 'CNC Lathe', cycleTime: { type: 'normal', parameters: { mean: 90, std: 10 } }, setupTime: { type: 'constant', parameters: { value: 120 } }, mtbf: 6, mttr: 0.5, position: { x: 300, y: 100 } },
        { id: 's-cnc2', name: 'CNC Mill', cycleTime: { type: 'normal', parameters: { mean: 120, std: 15 } }, setupTime: { type: 'constant', parameters: { value: 180 } }, mtbf: 6, mttr: 0.5, position: { x: 300, y: 250 } },
        { id: 's-cnc3', name: 'CNC Grinder', cycleTime: { type: 'normal', parameters: { mean: 75, std: 8 } }, setupTime: { type: 'constant', parameters: { value: 90 } }, position: { x: 300, y: 400 } },
        { id: 's-deburr', name: 'Deburr & Wash', cycleTime: { type: 'constant', parameters: { value: 45 } }, position: { x: 600, y: 250 } },
        { id: 's-cmm', name: 'CMM Inspection', cycleTime: { type: 'normal', parameters: { mean: 60, std: 10 } }, scrapRate: 0.04, position: { x: 800, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Raw Stock', capacity: 50, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-post-cnc', name: 'Post-CNC', capacity: 20, queueRule: 'FIFO', position: { x: 450, y: 250 } },
        { id: 'b-post-deburr', name: 'Post-Deburr', capacity: 15, queueRule: 'FIFO', position: { x: 700, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-cnc1' },
        { id: 'c2', source: 'b-in', target: 's-cnc2' },
        { id: 'c3', source: 'b-in', target: 's-cnc3' },
        { id: 'c4', source: 's-cnc1', target: 'b-post-cnc' },
        { id: 'c5', source: 's-cnc2', target: 'b-post-cnc' },
        { id: 'c6', source: 's-cnc3', target: 'b-post-cnc' },
        { id: 'c7', source: 'b-post-cnc', target: 's-deburr' },
        { id: 'c8', source: 's-deburr', target: 'b-post-deburr' },
        { id: 'c9', source: 'b-post-deburr', target: 's-cmm' },
        { id: 'c10', source: 's-cmm', target: 'sink-1' },
      ],
      products: [
        { id: 'p-shaft', name: 'Shaft', routing: ['s-cnc1', 's-deburr', 's-cmm'], arrivalRate: 150 },
        { id: 'p-housing', name: 'Housing', routing: ['s-cnc2', 's-deburr', 's-cmm'], arrivalRate: 200 },
        { id: 'p-gear', name: 'Gear', routing: ['s-cnc3', 's-deburr', 's-cmm'], arrivalRate: 120 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Raw Material', arrivalRate: 120, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Finished Parts' }, position: { x: 1000, y: 250 } },
      ],
    },
  },
  {
    id: 'pharma-packaging',
    name: 'Pharma Packaging Line',
    description: 'High-speed pharmaceutical packaging: tablet filling, capping, labeling, cartoning, and case packing with strict quality checks',
    category: 'process',
    template: {
      stations: [
        { id: 's-fill', name: 'Bottle Filler', cycleTime: { type: 'normal', parameters: { mean: 8, std: 1 } }, scrapRate: 0.005, position: { x: 200, y: 250 } },
        { id: 's-cap', name: 'Capping Machine', cycleTime: { type: 'normal', parameters: { mean: 6, std: 0.5 } }, mtbf: 2, mttr: 0.15, position: { x: 400, y: 250 } },
        { id: 's-label', name: 'Labeler', cycleTime: { type: 'normal', parameters: { mean: 5, std: 0.5 } }, scrapRate: 0.01, position: { x: 600, y: 250 } },
        { id: 's-vision', name: 'Vision Inspection', cycleTime: { type: 'constant', parameters: { value: 3 } }, scrapRate: 0.02, position: { x: 800, y: 250 } },
        { id: 's-carton', name: 'Cartoner', cycleTime: { type: 'normal', parameters: { mean: 10, std: 1 } }, mtbf: 3, mttr: 0.2, position: { x: 1000, y: 250 } },
        { id: 's-case', name: 'Case Packer', cycleTime: { type: 'constant', parameters: { value: 15 } }, position: { x: 1200, y: 250 } },
      ],
      buffers: [
        { id: 'b1', name: 'Post-Fill', capacity: 30, queueRule: 'FIFO', position: { x: 300, y: 250 } },
        { id: 'b2', name: 'Post-Cap', capacity: 30, queueRule: 'FIFO', position: { x: 500, y: 250 } },
        { id: 'b3', name: 'Post-Label', capacity: 20, queueRule: 'FIFO', position: { x: 700, y: 250 } },
        { id: 'b4', name: 'Post-Inspect', capacity: 20, queueRule: 'FIFO', position: { x: 900, y: 250 } },
        { id: 'b5', name: 'Post-Carton', capacity: 15, queueRule: 'FIFO', position: { x: 1100, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-fill' },
        { id: 'c1', source: 's-fill', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-cap' },
        { id: 'c3', source: 's-cap', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-label' },
        { id: 'c5', source: 's-label', target: 'b3' },
        { id: 'c6', source: 'b3', target: 's-vision' },
        { id: 'c7', source: 's-vision', target: 'b4' },
        { id: 'c8', source: 'b4', target: 's-carton' },
        { id: 'c9', source: 's-carton', target: 'b5' },
        { id: 'c10', source: 'b5', target: 's-case' },
        { id: 'c11', source: 's-case', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Pill Bottle', routing: ['s-fill', 's-cap', 's-label', 's-vision', 's-carton', 's-case'], arrivalRate: 10 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Empty Bottles', arrivalRate: 10, feedMode: 'interval' }, position: { x: 50, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Warehouse' }, position: { x: 1350, y: 250 } },
      ],
    },
  },
  {
    id: 'food-bottling',
    name: 'Beverage Bottling',
    description: 'High-speed beverage bottling: rinse, fill, cap, pasteurize, label, and pack with tight buffers and frequent changeovers',
    category: 'process',
    template: {
      stations: [
        { id: 's-rinse', name: 'Rinser', cycleTime: { type: 'constant', parameters: { value: 4 } }, position: { x: 200, y: 200 } },
        { id: 's-fill', name: 'Filler', cycleTime: { type: 'normal', parameters: { mean: 5, std: 0.5 } }, scrapRate: 0.008, position: { x: 400, y: 200 } },
        { id: 's-cap', name: 'Capper', cycleTime: { type: 'constant', parameters: { value: 3 } }, mtbf: 1.5, mttr: 0.1, position: { x: 600, y: 200 } },
        { id: 's-past', name: 'Pasteurizer', cycleTime: { type: 'constant', parameters: { value: 120 } }, position: { x: 800, y: 200 } },
        { id: 's-label', name: 'Labeler', cycleTime: { type: 'normal', parameters: { mean: 4, std: 0.3 } }, setupTime: { type: 'constant', parameters: { value: 300 } }, scrapRate: 0.01, position: { x: 1000, y: 200 } },
        { id: 's-pack', name: 'Case Packer', cycleTime: { type: 'constant', parameters: { value: 12 } }, position: { x: 1200, y: 200 } },
      ],
      buffers: [
        { id: 'b1', name: 'Rinse-Fill', capacity: 20, queueRule: 'FIFO', position: { x: 300, y: 200 } },
        { id: 'b2', name: 'Fill-Cap', capacity: 20, queueRule: 'FIFO', position: { x: 500, y: 200 } },
        { id: 'b3', name: 'Cap-Past', capacity: 10, queueRule: 'FIFO', position: { x: 700, y: 200 } },
        { id: 'b4', name: 'Past-Label', capacity: 50, queueRule: 'FIFO', position: { x: 900, y: 200 } },
        { id: 'b5', name: 'Label-Pack', capacity: 24, queueRule: 'FIFO', position: { x: 1100, y: 200 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-rinse' },
        { id: 'c1', source: 's-rinse', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-fill' },
        { id: 'c3', source: 's-fill', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-cap' },
        { id: 'c5', source: 's-cap', target: 'b3' },
        { id: 'c6', source: 'b3', target: 's-past' },
        { id: 'c7', source: 's-past', target: 'b4' },
        { id: 'c8', source: 'b4', target: 's-label' },
        { id: 'c9', source: 's-label', target: 'b5' },
        { id: 'c10', source: 'b5', target: 's-pack' },
        { id: 'c11', source: 's-pack', target: 'sink-1' },
      ],
      products: [
        { id: 'p-juice', name: 'Orange Juice', routing: ['s-rinse', 's-fill', 's-cap', 's-past', 's-label', 's-pack'], arrivalRate: 5 },
        { id: 'p-water', name: 'Sparkling Water', routing: ['s-rinse', 's-fill', 's-cap', 's-past', 's-label', 's-pack'], arrivalRate: 4 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Empty Bottles', arrivalRate: 4, feedMode: 'interval' }, position: { x: 50, y: 200 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Palletizing' }, position: { x: 1350, y: 200 } },
      ],
    },
  },
  {
    id: 'unreliable-bottleneck',
    name: 'Reliability Stress Test',
    description: 'Deliberately unbalanced line with one unreliable bottleneck, high scrap, and tight buffers to study blocking, starving, and OEE',
    category: 'lean',
    template: {
      stations: [
        { id: 's-fast1', name: 'Fast Station A', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 200, y: 250 } },
        { id: 's-bottleneck', name: 'Unreliable Bottleneck', cycleTime: { type: 'normal', parameters: { mean: 90, std: 15 } }, mtbf: 1, mttr: 0.25, scrapRate: 0.08, position: { x: 500, y: 250 } },
        { id: 's-fast2', name: 'Fast Station B', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 800, y: 250 } },
      ],
      buffers: [
        { id: 'b1', name: 'Pre-Bottleneck', capacity: 4, queueRule: 'FIFO', position: { x: 350, y: 250 } },
        { id: 'b2', name: 'Post-Bottleneck', capacity: 4, queueRule: 'FIFO', position: { x: 650, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-fast1' },
        { id: 'c1', source: 's-fast1', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-bottleneck' },
        { id: 'c3', source: 's-bottleneck', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-fast2' },
        { id: 'c5', source: 's-fast2', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Part', routing: ['s-fast1', 's-bottleneck', 's-fast2'], arrivalRate: 30 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 30, feedMode: 'interval' }, position: { x: 50, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 1000, y: 250 } },
      ],
    },
  },
  {
    id: 'parallel-redundant',
    name: 'Parallel Redundant Lines',
    description: 'Two identical parallel production lines fed by one splitter and merged before final QC, modeling redundancy for capacity',
    category: 'lean',
    template: {
      stations: [
        { id: 's-a1', name: 'Line A - Machine', cycleTime: { type: 'normal', parameters: { mean: 60, std: 5 } }, position: { x: 400, y: 100 } },
        { id: 's-a2', name: 'Line A - Finish', cycleTime: { type: 'normal', parameters: { mean: 45, std: 4 } }, position: { x: 650, y: 100 } },
        { id: 's-b1', name: 'Line B - Machine', cycleTime: { type: 'normal', parameters: { mean: 60, std: 5 } }, position: { x: 400, y: 400 } },
        { id: 's-b2', name: 'Line B - Finish', cycleTime: { type: 'normal', parameters: { mean: 45, std: 4 } }, position: { x: 650, y: 400 } },
        { id: 's-qc', name: 'Final QC', cycleTime: { type: 'constant', parameters: { value: 20 } }, scrapRate: 0.02, position: { x: 950, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Incoming', capacity: 30, queueRule: 'FIFO', position: { x: 150, y: 250 } },
        { id: 'b-a', name: 'Line A WIP', capacity: 8, queueRule: 'FIFO', position: { x: 525, y: 100 } },
        { id: 'b-b', name: 'Line B WIP', capacity: 8, queueRule: 'FIFO', position: { x: 525, y: 400 } },
        { id: 'b-merge', name: 'Pre-QC Merge', capacity: 15, queueRule: 'FIFO', position: { x: 800, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 'split-1' },
        { id: 'c2', source: 'split-1', target: 's-a1' },
        { id: 'c3', source: 'split-1', target: 's-b1' },
        { id: 'c4', source: 's-a1', target: 'b-a' },
        { id: 'c5', source: 'b-a', target: 's-a2' },
        { id: 'c6', source: 's-b1', target: 'b-b' },
        { id: 'c7', source: 'b-b', target: 's-b2' },
        { id: 'c8', source: 's-a2', target: 'merge-1' },
        { id: 'c9', source: 's-b2', target: 'merge-1' },
        { id: 'c10', source: 'merge-1', target: 'b-merge' },
        { id: 'c11', source: 'b-merge', target: 's-qc' },
        { id: 'c12', source: 's-qc', target: 'sink-1' },
        // Engine wiring
        { id: 'cs1', source: 'b-in', target: 's-a1' },
        { id: 'cs2', source: 'b-in', target: 's-b1' },
        { id: 'cs3', source: 's-a2', target: 'b-merge' },
        { id: 'cs4', source: 's-b2', target: 'b-merge' },
      ],
      products: [
        { id: 'p-a', name: 'Product (Line A)', routing: ['s-a1', 's-a2', 's-qc'], arrivalRate: 70 },
        { id: 'p-b', name: 'Product (Line B)', routing: ['s-b1', 's-b2', 's-qc'], arrivalRate: 70 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 35, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'split-1', type: 'splitter', data: { id: 'split-1', name: 'Line Splitter', outputs: 2, splitType: 'equal' }, position: { x: 250, y: 250 } },
        { id: 'merge-1', type: 'merge', data: { id: 'merge-1', name: 'Line Merge', inputs: 2, mergeType: 'fifo' }, position: { x: 750, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Finished Goods' }, position: { x: 1100, y: 250 } },
      ],
    },
  },
  // ── Feature-coverage templates ──────────────────────────────
  {
    id: 'operator-staffed-line',
    name: 'Operator-Staffed Line',
    description: 'Production line where stations require shared operator resources with efficiency modeling and skill-based assignment',
    category: 'workforce',
    template: {
      stations: [
        { id: 's-load', name: 'Loading', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 200, y: 250 } },
        { id: 's-machine', name: 'CNC Machine', cycleTime: { type: 'normal', parameters: { mean: 60, std: 8 } }, mtbf: 4, mttr: 0.3, position: { x: 500, y: 250 } },
        { id: 's-inspect', name: 'Manual Inspect', cycleTime: { type: 'lognormal', parameters: { mean: 2.5, std: 0.4 } }, scrapRate: 0.03, position: { x: 800, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Input Queue', capacity: 15, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-mid', name: 'WIP Buffer', capacity: 8, queueRule: 'FIFO', position: { x: 350, y: 250 } },
        { id: 'b-out', name: 'Inspect Queue', capacity: 10, queueRule: 'FIFO', position: { x: 650, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-load' },
        { id: 'c2', source: 's-load', target: 'b-mid' },
        { id: 'c3', source: 'b-mid', target: 's-machine' },
        { id: 'c4', source: 's-machine', target: 'b-out' },
        { id: 'c5', source: 'b-out', target: 's-inspect' },
        { id: 'c6', source: 's-inspect', target: 'sink-1' },
        { id: 'c-op1-load', source: 'op-loader', target: 's-load' },
        { id: 'c-op1-insp', source: 'op-loader', target: 's-inspect' },
        { id: 'c-op2-machine', source: 'op-machinist', target: 's-machine' },
      ],
      products: [
        { id: 'p1', name: 'Precision Part', routing: ['s-load', 's-machine', 's-inspect'], arrivalRate: 45 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Raw Material', arrivalRate: 45, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'op-loader', type: 'operator', data: { id: 'op-loader', name: 'Loader/Inspector', count: 2, efficiency: 85 }, position: { x: 500, y: 100 } },
        { id: 'op-machinist', type: 'operator', data: { id: 'op-machinist', name: 'CNC Operator', count: 1, efficiency: 95 }, position: { x: 500, y: 400 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Finished Goods' }, position: { x: 1000, y: 250 } },
      ],
    },
  },
  {
    id: 'priority-queue-line',
    name: 'Priority Queue Line',
    description: 'Multi-product line using PRIORITY queue buffers where urgent orders are processed first, with per-product cycle time overrides',
    category: 'lean',
    template: {
      stations: [
        { id: 's-prep', name: 'Preparation', cycleTime: { type: 'uniform', parameters: { min: 20, max: 40 } }, productCycleTimes: { 'p-express': { type: 'constant', parameters: { value: 15 } }, 'p-standard': { type: 'normal', parameters: { mean: 35, std: 5 } } }, position: { x: 300, y: 250 } },
        { id: 's-process', name: 'Processing', cycleTime: { type: 'normal', parameters: { mean: 50, std: 10 } }, productCycleTimes: { 'p-express': { type: 'constant', parameters: { value: 30 } }, 'p-bulk': { type: 'constant', parameters: { value: 70 } } }, position: { x: 600, y: 250 } },
        { id: 's-finish', name: 'Finishing', cycleTime: { type: 'triangular', parameters: { min: 15, mode: 25, max: 40 } }, scrapRate: 0.01, position: { x: 900, y: 250 } },
      ],
      buffers: [
        { id: 'b-prio1', name: 'Priority Input', capacity: 30, queueRule: 'PRIORITY', position: { x: 150, y: 250 } },
        { id: 'b-prio2', name: 'Priority WIP', capacity: 15, queueRule: 'PRIORITY', position: { x: 450, y: 250 } },
        { id: 'b-prio3', name: 'Priority Finish', capacity: 15, queueRule: 'PRIORITY', position: { x: 750, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-prio1' },
        { id: 'c1', source: 'b-prio1', target: 's-prep' },
        { id: 'c2', source: 's-prep', target: 'b-prio2' },
        { id: 'c3', source: 'b-prio2', target: 's-process' },
        { id: 'c4', source: 's-process', target: 'b-prio3' },
        { id: 'c5', source: 'b-prio3', target: 's-finish' },
        { id: 'c6', source: 's-finish', target: 'sink-1' },
      ],
      products: [
        { id: 'p-express', name: 'Express Order', routing: ['s-prep', 's-process', 's-finish'], arrivalRate: 120, priority: 10 },
        { id: 'p-standard', name: 'Standard Order', routing: ['s-prep', 's-process', 's-finish'], arrivalRate: 60, priority: 5 },
        { id: 'p-bulk', name: 'Bulk Order', routing: ['s-prep', 's-process', 's-finish'], arrivalRate: 90, priority: 1 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Order Intake', arrivalRate: 45, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Dispatch' }, position: { x: 1100, y: 250 } },
      ],
    },
  },
  {
    id: 'lifo-warehouse-line',
    name: 'LIFO Stack Buffer',
    description: 'Warehouse-style line with LIFO buffers simulating stack-based material handling (last pallet in is first out)',
    category: 'process',
    template: {
      stations: [
        { id: 's-receive', name: 'Receiving', cycleTime: { type: 'weibull', parameters: { shape: 2, scale: 30 } }, position: { x: 200, y: 250 } },
        { id: 's-store', name: 'Storage Handler', cycleTime: { type: 'constant', parameters: { value: 15 } }, position: { x: 500, y: 250 } },
        { id: 's-ship', name: 'Shipping', cycleTime: { type: 'uniform', parameters: { min: 10, max: 25 } }, position: { x: 800, y: 250 } },
      ],
      buffers: [
        { id: 'b-dock', name: 'Dock Queue', capacity: 10, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-stack', name: 'Pallet Stack (LIFO)', capacity: 40, queueRule: 'LIFO', position: { x: 350, y: 250 } },
        { id: 'b-ship', name: 'Ship Queue', capacity: 12, queueRule: 'FIFO', position: { x: 650, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-dock' },
        { id: 'c1', source: 'b-dock', target: 's-receive' },
        { id: 'c2', source: 's-receive', target: 'b-stack' },
        { id: 'c3', source: 'b-stack', target: 's-store' },
        { id: 'c4', source: 's-store', target: 'b-ship' },
        { id: 'c5', source: 'b-ship', target: 's-ship' },
        { id: 'c6', source: 's-ship', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Pallet', routing: ['s-receive', 's-store', 's-ship'], arrivalRate: 40 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Truck Dock', arrivalRate: 40, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Outbound Dock' }, position: { x: 1000, y: 250 } },
      ],
    },
  },
  {
    id: 'order-driven-production',
    name: 'Order-Driven Production',
    description: 'Make-to-order line where a source uses orders feed mode. Products have different priorities and due dates, with operators and setup times between product families',
    category: 'workforce',
    template: {
      stations: [
        { id: 's-cut', name: 'Laser Cutter', cycleTime: { type: 'normal', parameters: { mean: 45, std: 5 } }, setupTime: { type: 'triangular', parameters: { min: 30, mode: 60, max: 120 } }, position: { x: 300, y: 250 } },
        { id: 's-bend', name: 'Press Brake', cycleTime: { type: 'normal', parameters: { mean: 55, std: 8 } }, setupTime: { type: 'constant', parameters: { value: 45 } }, position: { x: 600, y: 250 } },
        { id: 's-weld', name: 'Weld Cell', cycleTime: { type: 'lognormal', parameters: { mean: 3.5, std: 0.5 } }, scrapRate: 0.02, position: { x: 900, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Order Queue', capacity: 25, queueRule: 'PRIORITY', position: { x: 150, y: 250 } },
        { id: 'b-mid1', name: 'Cut-Bend Buffer', capacity: 10, queueRule: 'PRIORITY', position: { x: 450, y: 250 } },
        { id: 'b-mid2', name: 'Bend-Weld Buffer', capacity: 10, queueRule: 'FIFO', position: { x: 750, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-orders', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-cut' },
        { id: 'c2', source: 's-cut', target: 'b-mid1' },
        { id: 'c3', source: 'b-mid1', target: 's-bend' },
        { id: 'c4', source: 's-bend', target: 'b-mid2' },
        { id: 'c5', source: 'b-mid2', target: 's-weld' },
        { id: 'c6', source: 's-weld', target: 'sink-1' },
        { id: 'c-op', source: 'op-tech', target: 's-weld' },
      ],
      products: [
        { id: 'p-rush', name: 'Rush Frame', routing: ['s-cut', 's-bend', 's-weld'], arrivalRate: 120, priority: 10, dueDate: 300 },
        { id: 'p-normal', name: 'Standard Frame', routing: ['s-cut', 's-bend', 's-weld'], arrivalRate: 80, priority: 3, dueDate: 900 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-orders', type: 'source', data: { id: 'src-orders', name: 'Order Queue', arrivalRate: 60, feedMode: 'orders' }, position: { x: 30, y: 250 } },
        { id: 'op-tech', type: 'operator', data: { id: 'op-tech', name: 'Weld Technician', count: 1, efficiency: 90 }, position: { x: 900, y: 400 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Shipping' }, position: { x: 1100, y: 250 } },
      ],
    },
  },
  {
    id: 'filtered-sources',
    name: 'Multi-Source Product Filter',
    description: 'Multiple dedicated sources each filtered to produce a specific product type, feeding into a shared line with different cycle times per product',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-prep', name: 'Preparation', cycleTime: { type: 'constant', parameters: { value: 25 } }, productCycleTimes: { 'p-steel': { type: 'constant', parameters: { value: 35 } }, 'p-alum': { type: 'constant', parameters: { value: 20 } }, 'p-copper': { type: 'constant', parameters: { value: 30 } } }, position: { x: 400, y: 250 } },
        { id: 's-coat', name: 'Coating', cycleTime: { type: 'exponential', parameters: { mean: 40 } }, position: { x: 700, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Shared Input', capacity: 30, queueRule: 'FIFO', position: { x: 250, y: 250 } },
        { id: 'b-mid', name: 'Coating Queue', capacity: 15, queueRule: 'FIFO', position: { x: 550, y: 250 } },
      ],
      connections: [
        { id: 'c-src1', source: 'src-steel', target: 'b-in' },
        { id: 'c-src2', source: 'src-alum', target: 'b-in' },
        { id: 'c-src3', source: 'src-copper', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-prep' },
        { id: 'c2', source: 's-prep', target: 'b-mid' },
        { id: 'c3', source: 'b-mid', target: 's-coat' },
        { id: 'c4', source: 's-coat', target: 'sink-1' },
      ],
      products: [
        { id: 'p-steel', name: 'Steel Part', routing: ['s-prep', 's-coat'], arrivalRate: 50 },
        { id: 'p-alum', name: 'Aluminum Part', routing: ['s-prep', 's-coat'], arrivalRate: 35 },
        { id: 'p-copper', name: 'Copper Part', routing: ['s-prep', 's-coat'], arrivalRate: 70 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-steel', type: 'source', data: { id: 'src-steel', name: 'Steel Supply', arrivalRate: 50, feedMode: 'interval', productFilter: 'p-steel' }, position: { x: 50, y: 100 } },
        { id: 'src-alum', type: 'source', data: { id: 'src-alum', name: 'Aluminum Supply', arrivalRate: 35, feedMode: 'interval', productFilter: 'p-alum' }, position: { x: 50, y: 250 } },
        { id: 'src-copper', type: 'source', data: { id: 'src-copper', name: 'Copper Supply', arrivalRate: 70, feedMode: 'interval', productFilter: 'p-copper' }, position: { x: 50, y: 400 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Warehouse' }, position: { x: 900, y: 250 } },
      ],
    },
  },
  {
    id: 'distribution-showcase',
    name: 'Distribution Showcase',
    description: 'Demonstrates all distribution types: constant, normal, exponential, triangular, uniform, Weibull, and lognormal across different stations',
    category: 'lean',
    template: {
      stations: [
        { id: 's-const', name: 'Constant (30s)', cycleTime: { type: 'constant', parameters: { value: 30 } }, position: { x: 200, y: 100 } },
        { id: 's-normal', name: 'Normal (40s ±5)', cycleTime: { type: 'normal', parameters: { mean: 40, std: 5 } }, position: { x: 400, y: 100 } },
        { id: 's-expo', name: 'Exponential (35s)', cycleTime: { type: 'exponential', parameters: { mean: 35 } }, position: { x: 600, y: 100 } },
        { id: 's-tri', name: 'Triangular (20-30-50)', cycleTime: { type: 'triangular', parameters: { min: 20, mode: 30, max: 50 } }, position: { x: 200, y: 400 } },
        { id: 's-uni', name: 'Uniform (25-45)', cycleTime: { type: 'uniform', parameters: { min: 25, max: 45 } }, position: { x: 400, y: 400 } },
        { id: 's-weib', name: 'Weibull (shape=2)', cycleTime: { type: 'weibull', parameters: { shape: 2, scale: 35 } }, position: { x: 600, y: 400 } },
      ],
      buffers: [
        { id: 'b1', name: 'Buffer 1-2', capacity: 15, queueRule: 'FIFO', position: { x: 300, y: 100 } },
        { id: 'b2', name: 'Buffer 2-3', capacity: 15, queueRule: 'FIFO', position: { x: 500, y: 100 } },
        { id: 'b-cross', name: 'Cross Buffer', capacity: 20, queueRule: 'FIFO', position: { x: 400, y: 250 } },
        { id: 'b4', name: 'Buffer 4-5', capacity: 15, queueRule: 'FIFO', position: { x: 300, y: 400 } },
        { id: 'b5', name: 'Buffer 5-6', capacity: 15, queueRule: 'FIFO', position: { x: 500, y: 400 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 's-const' },
        { id: 'c1', source: 's-const', target: 'b1' },
        { id: 'c2', source: 'b1', target: 's-normal' },
        { id: 'c3', source: 's-normal', target: 'b2' },
        { id: 'c4', source: 'b2', target: 's-expo' },
        { id: 'c5', source: 's-expo', target: 'b-cross' },
        { id: 'c6', source: 'b-cross', target: 's-tri' },
        { id: 'c7', source: 's-tri', target: 'b4' },
        { id: 'c8', source: 'b4', target: 's-uni' },
        { id: 'c9', source: 's-uni', target: 'b5' },
        { id: 'c10', source: 'b5', target: 's-weib' },
        { id: 'c11', source: 's-weib', target: 'sink-1' },
      ],
      products: [
        { id: 'p1', name: 'Test Part', routing: ['s-const', 's-normal', 's-expo', 's-tri', 's-uni', 's-weib'], arrivalRate: 35 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 35, feedMode: 'interval' }, position: { x: 30, y: 100 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Sink' }, position: { x: 800, y: 400 } },
      ],
    },
  },
  {
    id: 'percentage-splitter-line',
    name: 'Percentage Splitter',
    description: 'Uses a percentage-based splitter to randomly distribute work across 3 parallel lines, demonstrating probabilistic routing',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-intake', name: 'Intake', cycleTime: { type: 'constant', parameters: { value: 15 } }, position: { x: 200, y: 250 } },
        { id: 's-line-a', name: 'Line A', cycleTime: { type: 'normal', parameters: { mean: 50, std: 5 } }, position: { x: 500, y: 80 } },
        { id: 's-line-b', name: 'Line B', cycleTime: { type: 'normal', parameters: { mean: 55, std: 6 } }, scrapRate: 0.03, position: { x: 500, y: 250 } },
        { id: 's-line-c', name: 'Line C', cycleTime: { type: 'normal', parameters: { mean: 45, std: 4 } }, mtbf: 3, mttr: 0.2, position: { x: 500, y: 420 } },
        { id: 's-pack', name: 'Packing', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 850, y: 250 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Intake Queue', capacity: 30, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-a', name: 'Line A Queue', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 80 } },
        { id: 'b-b', name: 'Line B Queue', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 250 } },
        { id: 'b-c', name: 'Line C Queue', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 420 } },
        { id: 'b-pack', name: 'Pack Queue', capacity: 20, queueRule: 'FIFO', position: { x: 700, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-intake' },
        { id: 'c2', source: 's-intake', target: 'split-pct' },
        { id: 'c3a', source: 'split-pct', target: 'b-a' },
        { id: 'c3b', source: 'split-pct', target: 'b-b' },
        { id: 'c3c', source: 'split-pct', target: 'b-c' },
        { id: 'c4a', source: 'b-a', target: 's-line-a' },
        { id: 'c4b', source: 'b-b', target: 's-line-b' },
        { id: 'c4c', source: 'b-c', target: 's-line-c' },
        { id: 'c5a', source: 's-line-a', target: 'merge-1' },
        { id: 'c5b', source: 's-line-b', target: 'merge-1' },
        { id: 'c5c', source: 's-line-c', target: 'merge-1' },
        { id: 'c6', source: 'merge-1', target: 'b-pack' },
        { id: 'c7', source: 'b-pack', target: 's-pack' },
        { id: 'c8', source: 's-pack', target: 'sink-1' },
        // Engine wiring
        { id: 'cs1a', source: 's-intake', target: 'b-a' },
        { id: 'cs1b', source: 's-intake', target: 'b-b' },
        { id: 'cs1c', source: 's-intake', target: 'b-c' },
        { id: 'cs2a', source: 's-line-a', target: 'b-pack' },
        { id: 'cs2b', source: 's-line-b', target: 'b-pack' },
        { id: 'cs2c', source: 's-line-c', target: 'b-pack' },
      ],
      products: [
        { id: 'p1', name: 'Product', routing: ['s-intake', 's-line-a', 's-pack'], arrivalRate: 25 },
        { id: 'p2', name: 'Product B', routing: ['s-intake', 's-line-b', 's-pack'], arrivalRate: 25 },
        { id: 'p3', name: 'Product C', routing: ['s-intake', 's-line-c', 's-pack'], arrivalRate: 25 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Source', arrivalRate: 20, feedMode: 'interval' }, position: { x: 30, y: 250 } },
        { id: 'split-pct', type: 'splitter', data: { id: 'split-pct', name: 'Random Distributor', outputs: 3, splitType: 'percentage', percentages: [50, 30, 20] }, position: { x: 350, y: 165 } },
        { id: 'merge-1', type: 'merge', data: { id: 'merge-1', name: 'Collector', inputs: 3, mergeType: 'fifo' }, position: { x: 650, y: 165 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Shipping' }, position: { x: 1050, y: 250 } },
      ],
    },
  },
  {
    id: 'all-extra-nodes',
    name: 'All Extra Nodes Demo',
    description: 'Comprehensive demo exercising every extra node type in one model: source, conveyor, inspection, splitter, merge, assembly, disassembly, palletize, depalletize, matchbuffer, sink',
    category: 'assembly',
    template: {
      stations: [
        { id: 's-prep', name: 'Preparation', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 200, y: 200 } },
        { id: 's-sub-a', name: 'Sub-Line A', cycleTime: { type: 'normal', parameters: { mean: 30, std: 3 } }, position: { x: 500, y: 80 } },
        { id: 's-sub-b', name: 'Sub-Line B', cycleTime: { type: 'normal', parameters: { mean: 35, std: 4 } }, position: { x: 500, y: 380 } },
        { id: 's-final', name: 'Final Process', cycleTime: { type: 'constant', parameters: { value: 25 } }, scrapRate: 0.01, position: { x: 1100, y: 200 } },
      ],
      buffers: [
        { id: 'b-in', name: 'Input', capacity: 20, queueRule: 'FIFO', position: { x: 100, y: 200 } },
        { id: 'b-a', name: 'Sub A Buffer', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 80 } },
        { id: 'b-b', name: 'Sub B Buffer', capacity: 10, queueRule: 'FIFO', position: { x: 350, y: 380 } },
        { id: 'b-merge', name: 'Assembly Queue', capacity: 15, queueRule: 'FIFO', position: { x: 750, y: 200 } },
        { id: 'b-final', name: 'Final Buffer', capacity: 10, queueRule: 'FIFO', position: { x: 1000, y: 200 } },
      ],
      connections: [
        { id: 'c0', source: 'src-1', target: 'b-in' },
        { id: 'c1', source: 'b-in', target: 's-prep' },
        // Prep → splitter → two sub-lines
        { id: 'c2', source: 's-prep', target: 'split-1' },
        { id: 'c3a', source: 'split-1', target: 'b-a' },
        { id: 'c3b', source: 'split-1', target: 'b-b' },
        { id: 'c4a', source: 'b-a', target: 's-sub-a' },
        { id: 'c4b', source: 'b-b', target: 's-sub-b' },
        // Sub-lines → conveyors → merge
        { id: 'c5a', source: 's-sub-a', target: 'conv-a' },
        { id: 'c5b', source: 's-sub-b', target: 'conv-b' },
        { id: 'c6a', source: 'conv-a', target: 'merge-1' },
        { id: 'c6b', source: 'conv-b', target: 'merge-1' },
        // Merge → matchbuffer → inspection → final
        { id: 'c7', source: 'merge-1', target: 'match-1' },
        { id: 'c8', source: 'match-1', target: 'b-merge' },
        { id: 'c9', source: 'b-merge', target: 'insp-1' },
        { id: 'c10', source: 'insp-1', target: 'b-final' },
        { id: 'c11', source: 'b-final', target: 's-final' },
        { id: 'c12', source: 's-final', target: 'sink-1' },
        // Engine wiring
        { id: 'cs1', source: 's-prep', target: 'b-a' },
        { id: 'cs2', source: 's-prep', target: 'b-b' },
        { id: 'cs3', source: 's-sub-a', target: 'b-merge' },
        { id: 'cs4', source: 's-sub-b', target: 'b-merge' },
      ],
      products: [
        { id: 'p-a', name: 'Part A', routing: ['s-prep', 's-sub-a', 's-final'], arrivalRate: 50 },
        { id: 'p-b', name: 'Part B', routing: ['s-prep', 's-sub-b', 's-final'], arrivalRate: 50 },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-1', type: 'source', data: { id: 'src-1', name: 'Material In', arrivalRate: 40, feedMode: 'interval' }, position: { x: 30, y: 200 } },
        { id: 'split-1', type: 'splitter', data: { id: 'split-1', name: 'Line Router', outputs: 2, splitType: 'equal' }, position: { x: 300, y: 200 } },
        { id: 'conv-a', type: 'conveyor', data: { id: 'conv-a', name: 'Conveyor A', length: 8, speed: 2, capacity: 5 }, position: { x: 650, y: 80 } },
        { id: 'conv-b', type: 'conveyor', data: { id: 'conv-b', name: 'Conveyor B', length: 8, speed: 2, capacity: 5 }, position: { x: 650, y: 380 } },
        { id: 'merge-1', type: 'merge', data: { id: 'merge-1', name: 'Merge Point', inputs: 2, mergeType: 'fifo' }, position: { x: 750, y: 130 } },
        { id: 'match-1', type: 'matchbuffer', data: { id: 'match-1', name: 'Part Sync', capacity: 10, matchKey: 'batch', requiredParts: [{ productId: 'p-a', productName: 'Part A', quantity: 1 }, { productId: 'p-b', productName: 'Part B', quantity: 1 }], timeout: 300 }, position: { x: 850, y: 200 } },
        { id: 'insp-1', type: 'inspection', data: { id: 'insp-1', name: 'QC Check', inspectionTime: 12, defectRate: 2.5, inspectionType: 'automated' }, position: { x: 900, y: 130 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Finished' }, position: { x: 1300, y: 200 } },
      ],
    },
  },
  {
    id: 'wip-injection',
    name: 'WIP Injection (Mid-Line Start)',
    description: 'Simulates work-in-progress entering mid-line: one source feeds from the start, another product type uses arrivalRate to enter directly at a later station (modeling WIP already on the shop floor)',
    category: 'manufacturing',
    template: {
      stations: [
        { id: 's-raw', name: 'Raw Processing', cycleTime: { type: 'normal', parameters: { mean: 40, std: 5 } }, position: { x: 200, y: 250 } },
        { id: 's-machining', name: 'Machining', cycleTime: { type: 'weibull', parameters: { shape: 3, scale: 50 } }, position: { x: 500, y: 250 } },
        { id: 's-assembly', name: 'Assembly', cycleTime: { type: 'triangular', parameters: { min: 30, mode: 45, max: 70 } }, position: { x: 800, y: 250 } },
        { id: 's-test', name: 'Final Test', cycleTime: { type: 'constant', parameters: { value: 20 } }, scrapRate: 0.015, position: { x: 1100, y: 250 } },
      ],
      buffers: [
        { id: 'b-raw', name: 'Raw Queue', capacity: 20, queueRule: 'FIFO', position: { x: 100, y: 250 } },
        { id: 'b-mach', name: 'Machining Queue', capacity: 12, queueRule: 'FIFO', position: { x: 350, y: 250 } },
        { id: 'b-assy', name: 'Assembly Queue', capacity: 12, queueRule: 'FIFO', position: { x: 650, y: 250 } },
        { id: 'b-test', name: 'Test Queue', capacity: 8, queueRule: 'FIFO', position: { x: 950, y: 250 } },
      ],
      connections: [
        { id: 'c0', source: 'src-new', target: 'b-raw' },
        { id: 'c1', source: 'b-raw', target: 's-raw' },
        { id: 'c2', source: 's-raw', target: 'b-mach' },
        { id: 'c3', source: 'b-mach', target: 's-machining' },
        { id: 'c4', source: 's-machining', target: 'b-assy' },
        { id: 'c5', source: 'b-assy', target: 's-assembly' },
        { id: 'c6', source: 's-assembly', target: 'b-test' },
        { id: 'c7', source: 'b-test', target: 's-test' },
        { id: 'c8', source: 's-test', target: 'sink-1' },
        { id: 'c9', source: 'src-wip', target: 'b-assy' },
      ],
      products: [
        { id: 'p-new', name: 'New Order', routing: ['s-raw', 's-machining', 's-assembly', 's-test'], arrivalRate: 60 },
        { id: 'p-wip', name: 'WIP (mid-line)', routing: ['s-assembly', 's-test'] },
      ],
      resources: [],
      extraNodes: [
        { id: 'src-new', type: 'source', data: { id: 'src-new', name: 'New Orders', arrivalRate: 60, feedMode: 'interval', productFilter: 'p-new' }, position: { x: 30, y: 200 } },
        { id: 'src-wip', type: 'source', data: { id: 'src-wip', name: 'WIP Entry (Mid-Line)', arrivalRate: 90, feedMode: 'interval', productFilter: 'p-wip' }, position: { x: 550, y: 400 } },
        { id: 'sink-1', type: 'sink', data: { id: 'sink-1', name: 'Ship Dock' }, position: { x: 1300, y: 250 } },
      ],
    },
  },
  masterTestTemplate,
];

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TemplateSelector({ isOpen, onClose }: TemplateSelectorProps) {
  const { loadTemplate } = useModelStore();
  const { addToast } = useAppStore();

  const handleSelect = (template: Template) => {
    loadTemplate(template);
    addToast({ type: 'success', message: `Loaded "${template.name}" template` });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Template" size="lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[32rem] overflow-y-auto">
        {templates.map((template) => (
          <div
            key={template.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
            onClick={() => handleSelect(template)}
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-gray-900">{template.name}</h4>
                <p className="text-sm text-gray-500 mt-1">{template.description}</p>
              </div>
              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                {template.category}
              </span>
            </div>
            <div className="mt-3 text-xs text-gray-400">
              {template.template.stations?.length || 0} stations,{' '}
              {template.template.buffers?.length || 0} buffers,{' '}
              {template.template.products?.length || 0} products,{' '}
              {template.template.extraNodes?.length || 0} extra nodes
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
