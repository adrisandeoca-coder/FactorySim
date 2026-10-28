import type { Template } from '../../types';

export const masterTestTemplate: Template = {
  id: 'master-test',
  name: 'Master Test Factory',
  description: 'Comprehensive test model: all 8 distributions, all extra nodes, all buffer modes (FIFO/LIFO/PRIORITY), all splitter types (product-based/percentage/equal), all merge types (fifo/priority/alternating), batch processing, setup times, failures, scrap, shifts, operators, inspections (visual/automated/sampling), orders, palletize/depalletize, conveyors, productCycleTimes, productBatchSize',
  category: 'manufacturing',
  template: {
    stations: [
      // ── ZONE A: Product-Based Split + Alternating Merge ──
      { id: 's-cnc', name: 'CNC Mill (Weibull)', cycleTime: { type: 'weibull', parameters: { shape: 2.5, scale: 45 } }, setupTime: { type: 'triangular', parameters: { min: 30, mode: 60, max: 120 } }, mtbf: 8, mttr: 0.5, scrapRate: 0.03, position: { x: 550, y: 30 } },
      { id: 's-grind', name: 'Grinder (Triangular)', cycleTime: { type: 'triangular', parameters: { min: 25, mode: 40, max: 60 } }, mtbf: 12, mttr: 0.3, position: { x: 550, y: 170 } },
      { id: 's-quality', name: 'Quality Check (Normal)', cycleTime: { type: 'normal', parameters: { mean: 30, std: 4 } }, position: { x: 1100, y: 100 } },

      // ── ZONE B: Percentage Split + FIFO Merge ──
      { id: 's-intake', name: 'Intake (Constant)', cycleTime: { type: 'constant', parameters: { value: 15 } }, position: { x: 330, y: 400 } },
      { id: 's-pct-a', name: 'Fast Line (Uniform)', cycleTime: { type: 'uniform', parameters: { min: 25, max: 45 } }, productCycleTimes: { 'p-fast': { type: 'constant', parameters: { value: 20 } } }, position: { x: 780, y: 300 } },
      { id: 's-pct-b', name: 'Medium Line (Empirical)', cycleTime: { type: 'empirical', parameters: { data: [30, 35, 40, 38, 42, 33, 37] } }, position: { x: 780, y: 400 } },
      { id: 's-pct-c', name: 'Slow Line (Normal+Shifts)', cycleTime: { type: 'normal', parameters: { mean: 55, std: 8 } }, shifts: [{ name: 'Day', startHour: 6, endHour: 14, days: [0, 1, 2, 3, 4] }, { name: 'Swing', startHour: 14, endHour: 22, days: [0, 1, 2, 3, 4] }], position: { x: 780, y: 500 } },
      { id: 's-pack-b', name: 'Packing (Constant)', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 1200, y: 400 } },

      // ── ZONE C: Equal Split + Priority Merge ──
      { id: 's-coat', name: 'Coating (Lognormal)', cycleTime: { type: 'lognormal', parameters: { mean: 3.2, std: 0.4 } }, scrapRate: 0.05, position: { x: 650, y: 640 } },
      { id: 's-heat', name: 'Heat Treat (Exponential)', cycleTime: { type: 'exponential', parameters: { mean: 40 } }, batchSize: 5, position: { x: 650, y: 760 } },
      { id: 's-test', name: 'Final Test (Constant)', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 1100, y: 700 } },

      // ── ZONE D: Disassembly → MatchBuffer → Assembly ──
      { id: 's-prep', name: 'Prep Station', cycleTime: { type: 'constant', parameters: { value: 20 } }, position: { x: 300, y: 990 } },
      { id: 's-prep-x', name: 'Process Sub-X (Uniform)', cycleTime: { type: 'uniform', parameters: { min: 20, max: 35 } }, position: { x: 720, y: 920 } },
      { id: 's-prep-y', name: 'Process Sub-Y (Exponential)', cycleTime: { type: 'exponential', parameters: { mean: 30 } }, position: { x: 720, y: 1060 } },
      { id: 's-finish', name: 'Finish (Normal)', cycleTime: { type: 'normal', parameters: { mean: 35, std: 5 } }, position: { x: 1250, y: 990 } },

      // ── ZONE E: Pallet Line ──
      { id: 's-fill', name: 'Filling (Constant)', cycleTime: { type: 'constant', parameters: { value: 12 } }, position: { x: 300, y: 1280 } },
      { id: 's-label', name: 'Labeling (Triangular)', cycleTime: { type: 'triangular', parameters: { min: 8, mode: 12, max: 20 } }, position: { x: 1050, y: 1280 } },

      // ── ZONE F: Orders + Rush Line ──
      { id: 's-rush', name: 'Rush Process (Constant)', cycleTime: { type: 'constant', parameters: { value: 30 } }, setupTime: { type: 'constant', parameters: { value: 45 } }, position: { x: 380, y: 1550 } },
      { id: 's-rush-fin', name: 'Rush Finish (Normal)', cycleTime: { type: 'normal', parameters: { mean: 40, std: 6 } }, position: { x: 700, y: 1550 } },
    ],

    buffers: [
      // ZONE A
      { id: 'buf-a-in', name: 'Zone A Input', capacity: 20, queueRule: 'FIFO', position: { x: 200, y: 100 } },
      { id: 'buf-a-qual', name: 'Quality Queue', capacity: 15, queueRule: 'FIFO', position: { x: 960, y: 100 } },
      // ZONE B
      { id: 'buf-b-in', name: 'Zone B Input', capacity: 25, queueRule: 'FIFO', position: { x: 180, y: 400 } },
      { id: 'buf-pa', name: 'Fast Queue', capacity: 10, queueRule: 'FIFO', position: { x: 630, y: 300 } },
      { id: 'buf-pb', name: 'Medium Queue', capacity: 10, queueRule: 'FIFO', position: { x: 630, y: 400 } },
      { id: 'buf-pc', name: 'Slow Queue', capacity: 10, queueRule: 'FIFO', position: { x: 630, y: 500 } },
      { id: 'buf-b-out', name: 'Zone B Merge', capacity: 15, queueRule: 'FIFO', position: { x: 1060, y: 400 } },
      // ZONE C
      { id: 'buf-c-in', name: 'Zone C Input', capacity: 20, queueRule: 'FIFO', position: { x: 200, y: 700 } },
      { id: 'buf-c-1', name: 'Coat Queue', capacity: 8, queueRule: 'FIFO', position: { x: 500, y: 640 } },
      { id: 'buf-c-2', name: 'Heat Queue', capacity: 30, queueRule: 'FIFO', position: { x: 500, y: 760 } },
      { id: 'buf-c-out', name: 'Zone C Merge', capacity: 12, queueRule: 'FIFO', position: { x: 950, y: 700 } },
      // ZONE D
      { id: 'buf-d-in', name: 'Disassembly Input', capacity: 15, queueRule: 'FIFO', position: { x: 150, y: 990 } },
      { id: 'buf-d-mid', name: 'Sub-Process Queue', capacity: 12, queueRule: 'FIFO', position: { x: 580, y: 990 } },
      { id: 'buf-d-sync', name: 'Sync Queue', capacity: 20, queueRule: 'FIFO', position: { x: 880, y: 990 } },
      // ZONE E
      { id: 'buf-e-in', name: 'Fill Input', capacity: 30, queueRule: 'FIFO', position: { x: 150, y: 1280 } },
      { id: 'buf-lifo', name: 'LIFO Staging', capacity: 40, queueRule: 'LIFO', position: { x: 900, y: 1280 } },
      // ZONE F
      { id: 'buf-priority', name: 'Priority Order Queue', capacity: 25, queueRule: 'PRIORITY', position: { x: 220, y: 1550 } },
      { id: 'buf-f-mid', name: 'Rush WIP', capacity: 10, queueRule: 'FIFO', position: { x: 540, y: 1550 } },
    ],

    connections: [
      // ── ZONE A: Product-Based Split + Alternating Merge + Conveyor ──
      { id: 'ca0a', source: 'src-a1', target: 'buf-a-in' },
      { id: 'ca0b', source: 'src-a2', target: 'buf-a-in' },
      { id: 'ca1', source: 'buf-a-in', target: 'split-product' },
      { id: 'ca2', source: 'split-product', target: 's-cnc' },
      { id: 'ca3', source: 'split-product', target: 's-grind' },
      { id: 'ca4', source: 's-cnc', target: 'merge-alt' },
      { id: 'ca5', source: 's-grind', target: 'merge-alt' },
      { id: 'ca6', source: 'merge-alt', target: 'conv-a' },
      { id: 'ca7', source: 'conv-a', target: 'buf-a-qual' },
      { id: 'ca8', source: 'buf-a-qual', target: 's-quality' },
      { id: 'ca9', source: 's-quality', target: 'insp-visual' },
      { id: 'ca10', source: 'insp-visual', target: 'sink-a' },
      { id: 'ca-op', source: 'op-quality', target: 's-quality' },
      // Engine wiring Zone A (bypass merge + conveyor)
      { id: 'csa1', source: 's-cnc', target: 'buf-a-qual' },
      { id: 'csa2', source: 's-grind', target: 'buf-a-qual' },

      // ── ZONE B: Percentage Split + FIFO Merge ──
      { id: 'cb0', source: 'src-b', target: 'buf-b-in' },
      { id: 'cb1', source: 'buf-b-in', target: 's-intake' },
      { id: 'cb2', source: 's-intake', target: 'split-pct' },
      { id: 'cb3a', source: 'split-pct', target: 'buf-pa' },
      { id: 'cb3b', source: 'split-pct', target: 'buf-pb' },
      { id: 'cb3c', source: 'split-pct', target: 'buf-pc' },
      { id: 'cb4a', source: 'buf-pa', target: 's-pct-a' },
      { id: 'cb4b', source: 'buf-pb', target: 's-pct-b' },
      { id: 'cb4c', source: 'buf-pc', target: 's-pct-c' },
      { id: 'cb5a', source: 's-pct-a', target: 'merge-fifo' },
      { id: 'cb5b', source: 's-pct-b', target: 'merge-fifo' },
      { id: 'cb5c', source: 's-pct-c', target: 'merge-fifo' },
      { id: 'cb6', source: 'merge-fifo', target: 'buf-b-out' },
      { id: 'cb7', source: 'buf-b-out', target: 's-pack-b' },
      { id: 'cb8', source: 's-pack-b', target: 'sink-b' },
      // Engine wiring Zone B
      { id: 'csb1a', source: 's-intake', target: 'buf-pa' },
      { id: 'csb1b', source: 's-intake', target: 'buf-pb' },
      { id: 'csb1c', source: 's-intake', target: 'buf-pc' },
      { id: 'csb2a', source: 's-pct-a', target: 'buf-b-out' },
      { id: 'csb2b', source: 's-pct-b', target: 'buf-b-out' },
      { id: 'csb2c', source: 's-pct-c', target: 'buf-b-out' },

      // ── ZONE C: Equal Split + Priority Merge ──
      { id: 'cc0a', source: 'src-c1', target: 'buf-c-in' },
      { id: 'cc0b', source: 'src-c2', target: 'buf-c-in' },
      { id: 'cc1', source: 'buf-c-in', target: 'split-equal' },
      { id: 'cc2a', source: 'split-equal', target: 'buf-c-1' },
      { id: 'cc2b', source: 'split-equal', target: 'buf-c-2' },
      { id: 'cc3a', source: 'buf-c-1', target: 's-coat' },
      { id: 'cc3b', source: 'buf-c-2', target: 's-heat' },
      { id: 'cc4a', source: 's-coat', target: 'merge-prio' },
      { id: 'cc4b', source: 's-heat', target: 'merge-prio' },
      { id: 'cc5', source: 'merge-prio', target: 'buf-c-out' },
      { id: 'cc6', source: 'buf-c-out', target: 's-test' },
      { id: 'cc7', source: 's-test', target: 'sink-c' },
      // Engine wiring Zone C
      { id: 'csc1a', source: 'buf-c-in', target: 's-coat' },
      { id: 'csc1b', source: 'buf-c-in', target: 's-heat' },
      { id: 'csc2a', source: 's-coat', target: 'buf-c-out' },
      { id: 'csc2b', source: 's-heat', target: 'buf-c-out' },

      // ── ZONE D: Disassembly → MatchBuffer → Assembly ──
      { id: 'cd0', source: 'src-d', target: 'buf-d-in' },
      { id: 'cd1', source: 'buf-d-in', target: 's-prep' },
      { id: 'cd2', source: 's-prep', target: 'disasm-1' },
      { id: 'cd3a', source: 'disasm-1', target: 's-prep-x' },
      { id: 'cd3b', source: 'disasm-1', target: 's-prep-y' },
      { id: 'cd4a', source: 's-prep-x', target: 'match-1' },
      { id: 'cd4b', source: 's-prep-y', target: 'match-1' },
      { id: 'cd5', source: 'match-1', target: 'assy-1' },
      { id: 'cd6', source: 'assy-1', target: 's-finish' },
      { id: 'cd7', source: 's-finish', target: 'insp-auto' },
      { id: 'cd8', source: 'insp-auto', target: 'sink-d' },
      // Engine wiring Zone D
      { id: 'csd1', source: 's-prep', target: 'buf-d-mid' },
      { id: 'csd2a', source: 'buf-d-mid', target: 's-prep-x' },
      { id: 'csd2b', source: 'buf-d-mid', target: 's-prep-y' },
      { id: 'csd3a', source: 's-prep-x', target: 'buf-d-sync' },
      { id: 'csd3b', source: 's-prep-y', target: 'buf-d-sync' },
      { id: 'csd4', source: 'buf-d-sync', target: 's-finish' },

      // ── ZONE E: Pallet Line ──
      { id: 'ce0', source: 'src-e', target: 'buf-e-in' },
      { id: 'ce1', source: 'buf-e-in', target: 's-fill' },
      { id: 'ce2', source: 's-fill', target: 'pall-1' },
      { id: 'ce3', source: 'pall-1', target: 'conv-e' },
      { id: 'ce4', source: 'conv-e', target: 'depall-1' },
      { id: 'ce5', source: 'depall-1', target: 'buf-lifo' },
      { id: 'ce6', source: 'buf-lifo', target: 's-label' },
      { id: 'ce7', source: 's-label', target: 'sink-e' },
      // Engine wiring Zone E (bypass pall + conv + depall)
      { id: 'cse1', source: 's-fill', target: 'buf-lifo' },

      // ── ZONE F: Orders + Rush Line ──
      { id: 'cf0', source: 'src-f', target: 'buf-priority' },
      { id: 'cf1', source: 'buf-priority', target: 's-rush' },
      { id: 'cf2', source: 's-rush', target: 'buf-f-mid' },
      { id: 'cf3', source: 'buf-f-mid', target: 's-rush-fin' },
      { id: 'cf4', source: 's-rush-fin', target: 'insp-sample' },
      { id: 'cf5', source: 'insp-sample', target: 'sink-f' },
      { id: 'cf-op', source: 'op-rush', target: 's-rush' },
    ],

    products: [
      // Zone A (spawned by filtered sources, no arrivalRate needed)
      { id: 'p-alpha', name: 'Product Alpha', routing: ['s-cnc', 's-quality'], priority: 5 },
      { id: 'p-beta', name: 'Product Beta', routing: ['s-grind', 's-quality'], priority: 3 },
      // Zone B (spawned by unfiltered src-b, need arrivalRate)
      { id: 'p-fast', name: 'Fast Product', routing: ['s-intake', 's-pct-a', 's-pack-b'], arrivalRate: 60 },
      { id: 'p-med', name: 'Medium Product', routing: ['s-intake', 's-pct-b', 's-pack-b'], arrivalRate: 60 },
      { id: 'p-slow', name: 'Slow Product', routing: ['s-intake', 's-pct-c', 's-pack-b'], arrivalRate: 60 },
      // Zone C (spawned by filtered sources)
      { id: 'p-line-1', name: 'Coat Line Product', routing: ['s-coat', 's-test'] },
      { id: 'p-line-2', name: 'Heat Line Product', routing: ['s-heat', 's-test'] },
      // Zone D (disassembly products)
      { id: 'p-raw', name: 'Raw Assembly', routing: ['s-prep'] },
      { id: 'p-sub-x', name: 'Sub-Component X', routing: ['s-prep-x', 's-finish'] },
      { id: 'p-sub-y', name: 'Sub-Component Y', routing: ['s-prep-y', 's-finish'] },
      // Zone E (pallet line)
      { id: 'p-bulk', name: 'Bulk Item', routing: ['s-fill', 's-label'] },
      // Zone F (orders mode)
      { id: 'p-rush', name: 'Rush Order', routing: ['s-rush', 's-rush-fin'], priority: 10, dueDate: 300 },
      { id: 'p-normal', name: 'Standard Order', routing: ['s-rush', 's-rush-fin'], priority: 3, dueDate: 900 },
    ],

    resources: [],

    extraNodes: [
      // ── Sources ──
      { id: 'src-a1', type: 'source', data: { id: 'src-a1', name: 'Alpha Supply', arrivalRate: 50, feedMode: 'interval', productFilter: 'p-alpha' } as any, position: { x: 30, y: 50 } },
      { id: 'src-a2', type: 'source', data: { id: 'src-a2', name: 'Beta Supply', arrivalRate: 50, feedMode: 'interval', productFilter: 'p-beta' } as any, position: { x: 30, y: 150 } },
      { id: 'src-b', type: 'source', data: { id: 'src-b', name: 'Pct Source (Batch=3)', arrivalRate: 25, feedMode: 'interval', productBatchSize: 3 } as any, position: { x: 30, y: 400 } },
      { id: 'src-c1', type: 'source', data: { id: 'src-c1', name: 'Coat Supply', arrivalRate: 40, feedMode: 'interval', productFilter: 'p-line-1' } as any, position: { x: 30, y: 640 } },
      { id: 'src-c2', type: 'source', data: { id: 'src-c2', name: 'Heat Supply', arrivalRate: 40, feedMode: 'interval', productFilter: 'p-line-2' } as any, position: { x: 30, y: 760 } },
      { id: 'src-d', type: 'source', data: { id: 'src-d', name: 'Raw Material', arrivalRate: 180, feedMode: 'interval', productFilter: 'p-raw' } as any, position: { x: 30, y: 990 } },
      { id: 'src-e', type: 'source', data: { id: 'src-e', name: 'Bulk Supply', arrivalRate: 20, feedMode: 'interval', productFilter: 'p-bulk' } as any, position: { x: 30, y: 1280 } },
      { id: 'src-f', type: 'source', data: { id: 'src-f', name: 'Order Queue', arrivalRate: 60, feedMode: 'orders' } as any, position: { x: 30, y: 1550 } },

      // ── Sinks ──
      { id: 'sink-a', type: 'sink', data: { id: 'sink-a', name: 'Ship A' } as any, position: { x: 1450, y: 100 } },
      { id: 'sink-b', type: 'sink', data: { id: 'sink-b', name: 'Ship B' } as any, position: { x: 1380, y: 400 } },
      { id: 'sink-c', type: 'sink', data: { id: 'sink-c', name: 'Ship C' } as any, position: { x: 1280, y: 700 } },
      { id: 'sink-d', type: 'sink', data: { id: 'sink-d', name: 'Ship D' } as any, position: { x: 1500, y: 990 } },
      { id: 'sink-e', type: 'sink', data: { id: 'sink-e', name: 'Ship E' } as any, position: { x: 1230, y: 1280 } },
      { id: 'sink-f', type: 'sink', data: { id: 'sink-f', name: 'Ship F' } as any, position: { x: 1060, y: 1550 } },

      // ── Splitters ──
      { id: 'split-product', type: 'splitter', data: { id: 'split-product', name: 'Product Router', outputs: 2, splitType: 'product-based', productRouting: { 'p-alpha': 0, 'p-beta': 1 } } as any, position: { x: 380, y: 100 } },
      { id: 'split-pct', type: 'splitter', data: { id: 'split-pct', name: 'Pct Distributor', outputs: 3, splitType: 'percentage', percentages: [50, 30, 20] } as any, position: { x: 500, y: 400 } },
      { id: 'split-equal', type: 'splitter', data: { id: 'split-equal', name: 'Equal Splitter', outputs: 2, splitType: 'equal' } as any, position: { x: 370, y: 700 } },

      // ── Merges ──
      { id: 'merge-alt', type: 'merge', data: { id: 'merge-alt', name: 'Alternating Merge', inputs: 2, mergeType: 'alternating' } as any, position: { x: 730, y: 100 } },
      { id: 'merge-fifo', type: 'merge', data: { id: 'merge-fifo', name: 'FIFO Merge', inputs: 3, mergeType: 'fifo' } as any, position: { x: 940, y: 400 } },
      { id: 'merge-prio', type: 'merge', data: { id: 'merge-prio', name: 'Priority Merge', inputs: 2, mergeType: 'priority' } as any, position: { x: 820, y: 700 } },

      // ── Conveyors ──
      { id: 'conv-a', type: 'conveyor', data: { id: 'conv-a', name: 'Main Conveyor', length: 6, speed: 2, capacity: 6 } as any, position: { x: 850, y: 50 } },
      { id: 'conv-e', type: 'conveyor', data: { id: 'conv-e', name: 'Pallet Conveyor', length: 10, speed: 3, capacity: 10 } as any, position: { x: 600, y: 1230 } },

      // ── Inspections ──
      { id: 'insp-visual', type: 'inspection', data: { id: 'insp-visual', name: 'Visual QC', inspectionTime: 15, defectRate: 3, inspectionType: 'visual' } as any, position: { x: 1280, y: 100 } },
      { id: 'insp-auto', type: 'inspection', data: { id: 'insp-auto', name: 'Auto Inspection', inspectionTime: 10, defectRate: 2, inspectionType: 'automated' } as any, position: { x: 1380, y: 990 } },
      { id: 'insp-sample', type: 'inspection', data: { id: 'insp-sample', name: 'Sampling QC', inspectionTime: 20, defectRate: 1.5, inspectionType: 'sampling' } as any, position: { x: 880, y: 1550 } },

      // ── Operators ──
      { id: 'op-quality', type: 'operator', data: { id: 'op-quality', name: 'QC Inspector', count: 2, efficiency: 90, skill: 'inspection' } as any, position: { x: 1100, y: 0 } },
      { id: 'op-rush', type: 'operator', data: { id: 'op-rush', name: 'Rush Operator', count: 1, efficiency: 85, skill: 'machining' } as any, position: { x: 380, y: 1450 } },

      // ── Disassembly ──
      { id: 'disasm-1', type: 'disassembly', data: { id: 'disasm-1', name: 'Disassembly', cycleTime: 25, outputParts: [{ productId: 'p-sub-x', productName: 'Sub-Component X', quantity: 1 }, { productId: 'p-sub-y', productName: 'Sub-Component Y', quantity: 1 }] } as any, position: { x: 460, y: 940 } },

      // ── MatchBuffer ──
      { id: 'match-1', type: 'matchbuffer', data: { id: 'match-1', name: 'Part Synchronizer', capacity: 20, matchKey: 'batch', requiredParts: [{ productId: 'p-sub-x', productName: 'Sub-Component X', quantity: 1 }, { productId: 'p-sub-y', productName: 'Sub-Component Y', quantity: 1 }], timeout: 600 } as any, position: { x: 900, y: 940 } },

      // ── Assembly ──
      { id: 'assy-1', type: 'assembly', data: { id: 'assy-1', name: 'Assembly', cycleTime: 40, inputParts: 2, inputPartsByProduct: [{ productId: 'p-sub-x', productName: 'Sub-Component X', quantity: 1 }, { productId: 'p-sub-y', productName: 'Sub-Component Y', quantity: 1 }] } as any, position: { x: 1060, y: 940 } },

      // ── Palletize ──
      { id: 'pall-1', type: 'palletize', data: { id: 'pall-1', name: 'Palletizer', defaultPalletSize: 12, palletSizeByProduct: { 'p-bulk': 8 }, cycleTime: 25 } as any, position: { x: 450, y: 1280 } },

      // ── Depalletize ──
      { id: 'depall-1', type: 'depalletize', data: { id: 'depall-1', name: 'Depalletizer', cycleTime: 4 } as any, position: { x: 750, y: 1280 } },
    ],

    orders: [
      { id: 'ord-1', productId: 'p-rush', quantity: 50, priority: 'urgent', dueDate: '2026-03-01', status: 'pending', isWip: false },
      { id: 'ord-2', productId: 'p-normal', quantity: 100, priority: 'medium', dueDate: '2026-03-15', status: 'pending', isWip: false },
      { id: 'ord-3', productId: 'p-rush', quantity: 30, priority: 'high', dueDate: '2026-02-28', status: 'in_progress', isWip: true, initialStationId: 's-rush' },
    ],
  },
};
