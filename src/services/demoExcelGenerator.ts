import * as XLSX from 'xlsx';

/**
 * Generate a demo Excel template with sample data for all component types
 * and trigger a browser download.
 *
 * 12 sheets: Stations, Buffers, Sources & Sinks, Conveyors, Inspections,
 * Assembly Operations, Flow Control, Connections, Products, Orders,
 * Resources, Reference.
 */
/** Build the demo template workbook (shared by download and artifact save). */
function buildDemoWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Stations ──────────────────────────────────────────────
  const stationsData = [
    [
      'ID', 'Name',
      'Cycle Time (s)', 'Dist. Type', 'Std Dev', 'Min', 'Max',
      'Setup Time (s)', 'Setup Dist. Type', 'Setup Std Dev', 'Setup Min', 'Setup Max',
      'MTBF (hours)', 'MTTR (hours)', 'Scrap Rate (%)', 'Batch Size',
      'Product Cycle Times (JSON)', 'Shifts (JSON)',
    ],
    ['STN-001', 'CNC Lathe 1',     45, 'constant', '', '', '',   '', '', '', '', '',   200, 2,   1.5, 1,
      '{"PRD-001": 45, "PRD-002": 60}', ''],
    ['STN-002', 'Milling Machine',  60, 'normal', 10, '', '',   120, 'constant', '', '', '',   150, 3,   2.0, 1,
      '', ''],
    ['STN-003', 'Assembly Station',  90, 'constant', '', '', '',   '', '', '', '', '',   500, 1,   0.5, 5,
      '{"PRD-003": 70}',
      '[{"name":"Day","startHour":6,"endHour":14,"days":[0,1,2,3,4]},{"name":"Night","startHour":14,"endHour":22,"days":[0,1,2,3,4]}]'],
    ['STN-004', 'Quality Inspect.',  30, 'constant', '', '', '',   '', '', '', '', '',   '', '',  0.0, 1, '', ''],
    ['STN-005', 'Welding Robot',     55, 'triangular', '', 40, 70,   '', '', '', '', '',   300, 2.5, 1.0, 1, '', ''],
    ['STN-006', 'Paint Booth',      120, 'exponential', '', '', '',  60, 'triangular', '', 30, 90,  400, 4,   3.0, 10, '', ''],
    ['STN-007', 'Packaging',         20, 'uniform', '', 15, 25,   '', '', '', '', '',   '', '',  0.0, 1, '', ''],
    ['STN-008', 'Heat Treatment',    45, 'lognormal', 8, '', '',   '', '', '', '', '',   600, 1.5, 0.2, 1, '', ''],
  ];
  const wsStations = XLSX.utils.aoa_to_sheet(stationsData);
  wsStations['!cols'] = [
    { wch: 10 }, { wch: 18 },
    { wch: 14 }, { wch: 13 }, { wch: 9 }, { wch: 7 }, { wch: 7 },
    { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 11 },
    { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 11 },
    { wch: 34 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStations, 'Stations');

  // ── Sheet 2: Buffers (includes match buffers) ─────────────────────
  const buffersData = [
    ['ID', 'Name', 'Type (buffer/matchbuffer)', 'Capacity', 'Queue Rule',
     'Match Key', 'Required Parts (JSON)', 'Timeout (s)'],
    // Regular buffers
    ['BUF-001', 'Raw Material Queue',   'buffer', 50, 'FIFO', '', '', ''],
    ['BUF-002', 'Pre-Assembly Buffer',  'buffer', 20, 'FIFO', '', '', ''],
    ['BUF-003', 'Inspection Queue',     'buffer', 15, 'PRIORITY', '', '', ''],
    ['BUF-004', 'Paint Queue',          'buffer', 30, 'FIFO', '', '', ''],
    ['BUF-005', 'Packaging Buffer',     'buffer', 25, 'LIFO', '', '', ''],
    ['BUF-006', 'Finished Goods',       'buffer', 100, 'FIFO', '', '', ''],
    // Match buffer
    ['MBF-001', 'Kit Buffer',           'matchbuffer', 20, '', 'order',
      '[{"productId":"PRD-001","productName":"Standard Widget","quantity":1},{"productId":"PRD-002","productName":"Premium Widget","quantity":1}]',
      300],
  ];
  const wsBuffers = XLSX.utils.aoa_to_sheet(buffersData);
  wsBuffers['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 12 },
    { wch: 11 }, { wch: 60 }, { wch: 11 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBuffers, 'Buffers');

  // ── Sheet 3: Sources & Sinks ──────────────────────────────────────
  const sourceSinkData = [
    ['ID', 'Name', 'Type (source/sink)', 'Arrival Rate (s)', 'Feed Mode (interval/orders)', 'Product Filter'],
    ['SRC-001', 'Main Source',         'source', 120, 'interval', ''],
    ['SRC-002', 'Order Source',        'source', '',  'orders',   'PRD-001'],
    ['SNK-001', 'Finished Goods Sink', 'sink',   '',  '',         ''],
  ];
  const wsSourceSink = XLSX.utils.aoa_to_sheet(sourceSinkData);
  wsSourceSink['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSourceSink, 'Sources & Sinks');

  // ── Sheet 4: Conveyors ────────────────────────────────────────────
  const conveyorsData = [
    ['ID', 'Name', 'Length (m)', 'Speed (m/s)', 'Capacity'],
    ['CNV-001', 'Transfer Conveyor', 10, 1.5, 15],
  ];
  const wsConveyors = XLSX.utils.aoa_to_sheet(conveyorsData);
  wsConveyors['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsConveyors, 'Conveyors');

  // ── Sheet 5: Inspections ──────────────────────────────────────────
  const inspectionsData = [
    ['ID', 'Name', 'Inspection Time (s)', 'Defect Rate (%)', 'Inspection Type (visual/automated/sampling)'],
    ['INS-001', 'Visual QC',         30, 3, 'visual'],
    ['INS-002', 'Automated Scanner', 10, 1, 'automated'],
  ];
  const wsInspections = XLSX.utils.aoa_to_sheet(inspectionsData);
  wsInspections['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(wb, wsInspections, 'Inspections');

  // ── Sheet 6: Assembly Operations ──────────────────────────────────
  const assemblyData = [
    ['ID', 'Name', 'Type (assembly/disassembly/palletize/depalletize)',
     'Cycle Time (s)', 'Input Parts', 'Pallet Size', 'Parts Config (JSON)'],
    // assembly with flat input parts
    ['ASM-001', 'Main Assembly',        'assembly',     60, 3,  '', ''],
    // assembly with per-product input parts override
    ['ASM-002', 'Per-Product Assembly', 'assembly',     45, 2,  '',
      '[{"productId":"PRD-001","productName":"Standard Widget","quantity":2},{"productId":"PRD-002","productName":"Premium Widget","quantity":3}]'],
    // disassembly
    ['DAS-001', 'Teardown Station',     'disassembly',  30, '', '',
      '[{"productId":"PRD-001","productName":"Standard Widget","quantity":2}]'],
    // palletize
    ['PAL-001', 'Pallet Loader',        'palletize',    15, '', 10,
      '{"PRD-001": 12, "PRD-002": 8}'],
    // depalletize
    ['DPL-001', 'Pallet Unloader',      'depalletize',   5, '', '', ''],
  ];
  const wsAssembly = XLSX.utils.aoa_to_sheet(assemblyData);
  wsAssembly['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 44 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAssembly, 'Assembly Operations');

  // ── Sheet 7: Flow Control (splitters + merges) ────────────────────
  const flowControlData = [
    ['ID', 'Name', 'Type (splitter/merge)', 'Ports', 'Routing Type',
     'Product Routing (JSON)', 'Percentages'],
    // splitter: product-based
    ['SPL-001', 'Product Router',  'splitter', 3, 'product-based',
      '{"PRD-001": 0, "PRD-002": 1, "PRD-003": 2}', ''],
    // splitter: percentage
    ['SPL-002', '50/50 Split',     'splitter', 2, 'percentage', '', '50,50'],
    // merge: fifo
    ['MRG-001', 'Line Merge',     'merge', 2, 'fifo',     '', ''],
    // merge: priority
    ['MRG-002', 'Priority Merge', 'merge', 3, 'priority', '', ''],
  ];
  const wsFlowControl = XLSX.utils.aoa_to_sheet(flowControlData);
  wsFlowControl['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 24 }, { wch: 8 }, { wch: 16 },
    { wch: 44 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFlowControl, 'Flow Control');

  // ── Sheet 8: Connections ──────────────────────────────────────────
  const connectionsData = [
    ['ID', 'Source ID', 'Target ID', 'Probability'],
    ['CON-001', 'SRC-001',  'BUF-001', ''],
    ['CON-002', 'BUF-001',  'STN-001', ''],
    ['CON-003', 'STN-001',  'BUF-002', ''],
    ['CON-004', 'BUF-002',  'STN-002', ''],
    ['CON-005', 'STN-002',  'BUF-003', ''],
    ['CON-006', 'BUF-003',  'STN-003', ''],
    ['CON-007', 'STN-003',  'STN-004', ''],
    ['CON-008', 'STN-004',  'SPL-001', ''],
    ['CON-009', 'SPL-001',  'STN-005', 0.4],
    ['CON-010', 'SPL-001',  'STN-007', 0.6],
    ['CON-011', 'STN-005',  'BUF-004', ''],
    ['CON-012', 'BUF-004',  'STN-006', ''],
    ['CON-013', 'STN-006',  'STN-007', ''],
    ['CON-014', 'STN-007',  'SNK-001', ''],
  ];
  const wsConnections = XLSX.utils.aoa_to_sheet(connectionsData);
  wsConnections['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsConnections, 'Connections');

  // ── Sheet 9: Products ─────────────────────────────────────────────
  const productsData = [
    ['ID', 'Name', 'Routing (comma-separated station IDs)', 'Arrival Rate (s)', 'Priority'],
    ['PRD-001', 'Standard Widget', 'STN-001,STN-002,STN-003,STN-004,STN-007',                   120, 2],
    ['PRD-002', 'Premium Widget',  'STN-001,STN-002,STN-005,STN-003,STN-004,STN-006,STN-007',   300, 1],
    ['PRD-003', 'Economy Widget',  'STN-001,STN-003,STN-007',                                    90, 3],
  ];
  const wsProducts = XLSX.utils.aoa_to_sheet(productsData);
  wsProducts['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 55 }, { wch: 16 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');

  // ── Sheet 10: Orders ──────────────────────────────────────────────
  const ordersData = [
    ['ID', 'Product ID', 'Quantity', 'Priority', 'Due Date', 'Status', 'Is WIP', 'Initial Station ID'],
    ['ORD-001', 'PRD-001', 100, 'medium',  '2026-02-20', 'pending',     false, ''],
    ['ORD-002', 'PRD-002',  50, 'high',    '2026-02-15', 'in_progress', false, ''],
    ['ORD-003', 'PRD-003', 200, 'low',     '2026-02-28', 'pending',     false, ''],
    ['ORD-004', 'PRD-001', 150, 'urgent',  '2026-02-13', 'in_progress', true,  'STN-003'],
    ['ORD-005', 'PRD-002',  75, 'medium',  '2026-02-25', 'pending',     false, ''],
  ];
  const wsOrders = XLSX.utils.aoa_to_sheet(ordersData);
  wsOrders['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Orders');

  // ── Sheet 11: Resources (includes operator nodes) ─────────────────
  const resourcesData = [
    ['ID', 'Name', 'Role (resource/operator-node)', 'Type (operator/machine/tool)',
     'Capacity', 'Efficiency (%)', 'Skills (comma-separated)', 'Shifts (JSON)'],
    // Standard resources
    ['RES-001', 'Operator A',   'resource', 'operator', 1, '', 'CNC,Milling',
      '[{"name":"Day","startHour":6,"endHour":14,"days":[0,1,2,3,4]}]'],
    ['RES-002', 'Operator B',   'resource', 'operator', 1, '', 'Assembly,Welding',
      '[{"name":"Day","startHour":6,"endHour":14,"days":[0,1,2,3,4]}]'],
    ['RES-003', 'Operator C',   'resource', 'operator', 1, '', 'Inspection,Packaging',
      '[{"name":"Day","startHour":6,"endHour":14,"days":[0,1,2,3,4]}]'],
    ['RES-004', 'Robot Arm 1',  'resource', 'machine',  1, '', 'Welding',   ''],
    ['RES-005', 'Paint System', 'resource', 'machine',  2, '', 'Painting',
      '[{"name":"Extended","startHour":6,"endHour":22,"days":[0,1,2,3,4,5]}]'],
    ['RES-006', 'Forklift 1',  'resource', 'tool',     1, '', 'Transport',
      '[{"name":"Extended","startHour":6,"endHour":22,"days":[0,1,2,3,4,5]}]'],
    // Operator nodes (canvas)
    ['OPR-001', 'Senior Machinist', 'operator-node', '', 2, 95, 'CNC', ''],
    ['OPR-002', 'Assembly Tech',    'operator-node', '', 1, 85, 'Assembly', ''],
  ];
  const wsResources = XLSX.utils.aoa_to_sheet(resourcesData);
  wsResources['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 28 },
    { wch: 10 }, { wch: 16 }, { wch: 28 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResources, 'Resources');

  // ── Sheet 12: Reference (read-only help) ──────────────────────────
  const referenceData = [
    ['Parameter Reference — DO NOT import this sheet'],
    [''],
    ['SHEET OVERVIEW'],
    ['Sheet',              'What it contains'],
    ['Stations',           'Manufacturing workstations with cycle time distributions'],
    ['Buffers',            'Queues/buffers (type=buffer) and match buffers (type=matchbuffer)'],
    ['Sources & Sinks',    'Material entry points (source) and exit points (sink)'],
    ['Conveyors',          'Transport conveyors with length, speed, capacity'],
    ['Inspections',        'Quality inspection stations'],
    ['Assembly Operations','Assembly, disassembly, palletize, depalletize nodes'],
    ['Flow Control',       'Splitters and merges for routing material flow'],
    ['Connections',        'Directed edges between any two nodes'],
    ['Products',           'Product types with routing and arrival rates'],
    ['Orders',             'Production orders with quantities and due dates'],
    ['Resources',          'Shared resources (role=resource) and canvas operator nodes (role=operator-node)'],
    [''],
    ['DISTRIBUTION TYPES'],
    ['Type', 'Cycle Time (s) means', 'Std Dev', 'Min', 'Max'],
    ['constant',     'Fixed value',       '',          '', ''],
    ['normal',       'Mean',              'Std Dev',   '', ''],
    ['exponential',  'Mean',              '',          '', ''],
    ['triangular',   'Mode',              '',          'Min', 'Max'],
    ['uniform',      '(ignored)',         '',          'Min', 'Max'],
    ['lognormal',    'Mean',              'Std Dev',   '', ''],
    ['weibull',      'Scale',             '',          '', ''],
    [''],
    ['BUFFER TYPES'],
    ['Type',        'Uses columns'],
    ['buffer',      'Capacity, Queue Rule'],
    ['matchbuffer', 'Capacity, Match Key, Required Parts (JSON), Timeout'],
    [''],
    ['ASSEMBLY OPERATION TYPES'],
    ['Type',          'Uses columns'],
    ['assembly',      'Cycle Time, Input Parts. Parts Config = inputPartsByProduct'],
    ['disassembly',   'Cycle Time. Parts Config = outputParts [{productId, productName, quantity}]'],
    ['palletize',     'Cycle Time, Pallet Size. Parts Config = palletSizeByProduct {productId: size}'],
    ['depalletize',   'Cycle Time only'],
    [''],
    ['FLOW CONTROL TYPES'],
    ['Type',      'Ports mean', 'Routing Type options'],
    ['splitter',  '# outputs',  'equal, percentage, conditional, product-based'],
    ['merge',     '# inputs',   'fifo, priority, alternating'],
    [''],
    ['RESOURCE ROLES'],
    ['Role',           'Description'],
    ['resource',       'Shared resource pool (Type, Capacity, Skills, Shifts)'],
    ['operator-node',  'Canvas operator node (Capacity=count, Efficiency %, first Skill)'],
    [''],
    ['QUEUE RULES: FIFO, LIFO, PRIORITY'],
    ['RESOURCE TYPES: operator, machine, tool'],
    ['ORDER PRIORITIES: low, medium, high, urgent'],
    ['ORDER STATUSES: pending, in_progress'],
    ['FEED MODES: interval (timed arrivals), orders (order-driven)'],
    [''],
    ['SHIFTS JSON FORMAT'],
    ['[{"name": "Day", "startHour": 6, "endHour": 14, "days": [0,1,2,3,4]}]'],
    ['days: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun'],
    ['Omit shifts for 24/7 operation.'],
  ];
  const wsReference = XLSX.utils.aoa_to_sheet(referenceData);
  wsReference['!cols'] = [
    { wch: 22 }, { wch: 60 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsReference, 'Reference');

  return wb;
}

/**
 * Generate the demo Excel template and trigger a browser download.
 */
export function downloadDemoExcelTemplate(): void {
  const wb = buildDemoWorkbook();
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'FactorySim_Import_Template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate the demo Excel template as a base64 string (for artifact bundling).
 */
export function generateDemoTemplateBase64(): string {
  const wb = buildDemoWorkbook();
  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
}
