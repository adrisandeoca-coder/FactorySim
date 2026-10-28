import * as XLSX from 'xlsx';
import type {
  FactoryModel,
  DistributionConfig,
  ShiftSchedule,
  ExtraNodeEntry,
  SourceNodeData,
  SinkNodeData,
  ConveyorNodeData,
  OperatorNodeData,
  InspectionNodeData,
  AssemblyNodeData,
  SplitterNodeData,
  MergeNodeData,
  DisassemblyNodeData,
  PalletizeNodeData,
  DepalletizeNodeData,
  MatchBufferNodeData,
} from '../types';

// ─── Distribution helpers ────────────────────────────────────────────

/** Extract the primary value from a DistributionConfig for the "Cycle Time (s)" column. */
function distValue(d: DistributionConfig): number | string {
  const p = d.parameters;
  switch (d.type) {
    case 'constant': return p.value as number ?? '';
    case 'normal': return p.mean as number ?? '';
    case 'exponential': return p.mean as number ?? '';
    case 'triangular': return p.mode as number ?? '';
    case 'uniform': {
      const uMin = p.min as number | undefined;
      const uMax = p.max as number | undefined;
      if (uMin != null && uMax != null) return (uMin + uMax) / 2;
      if (uMin != null) return uMin;
      if (uMax != null) return uMax;
      return p.value as number ?? 60;
    }
    case 'lognormal': return p.mean as number ?? '';
    case 'weibull': return p.scale as number ?? '';
    case 'empirical': {
      const data = p.data as number[] | undefined;
      return data && data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 60;
    }
    default: return '';
  }
}

function distStdDev(d: DistributionConfig): number | string {
  const p = d.parameters;
  if (d.type === 'normal' || d.type === 'lognormal') return p.std as number ?? '';
  return '';
}

function distMin(d: DistributionConfig): number | string {
  const p = d.parameters;
  if (d.type === 'triangular' || d.type === 'uniform') return p.min as number ?? '';
  return '';
}

function distMax(d: DistributionConfig): number | string {
  const p = d.parameters;
  if (d.type === 'triangular' || d.type === 'uniform') return p.max as number ?? '';
  return '';
}

function shiftsJson(shifts?: ShiftSchedule[]): string {
  if (!shifts || shifts.length === 0) return '';
  return JSON.stringify(shifts);
}

/** Convert productCycleTimes Record<string, DistributionConfig> → JSON string of simple values. */
function productCycleTimesJson(pct?: Record<string, DistributionConfig>): string {
  if (!pct || Object.keys(pct).length === 0) return '';
  const simple: Record<string, number> = {};
  for (const [pid, dist] of Object.entries(pct)) {
    const v = distValue(dist);
    if (typeof v === 'number') simple[pid] = v;
  }
  return Object.keys(simple).length > 0 ? JSON.stringify(simple) : '';
}

// ─── Workbook builder ────────────────────────────────────────────────

/** Build an Excel workbook from the actual model data. */
function buildModelWorkbook(model: FactoryModel): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Categorize extra nodes
  const sources: (ExtraNodeEntry & { data: SourceNodeData })[] = [];
  const sinks: (ExtraNodeEntry & { data: SinkNodeData })[] = [];
  const conveyors: (ExtraNodeEntry & { data: ConveyorNodeData })[] = [];
  const inspections: (ExtraNodeEntry & { data: InspectionNodeData })[] = [];
  const assemblies: (ExtraNodeEntry & { data: AssemblyNodeData })[] = [];
  const disassemblies: (ExtraNodeEntry & { data: DisassemblyNodeData })[] = [];
  const palletizers: (ExtraNodeEntry & { data: PalletizeNodeData })[] = [];
  const depalletizers: (ExtraNodeEntry & { data: DepalletizeNodeData })[] = [];
  const splitters: (ExtraNodeEntry & { data: SplitterNodeData })[] = [];
  const merges: (ExtraNodeEntry & { data: MergeNodeData })[] = [];
  const operators: (ExtraNodeEntry & { data: OperatorNodeData })[] = [];
  const matchBuffers: (ExtraNodeEntry & { data: MatchBufferNodeData })[] = [];

  for (const node of (model.extraNodes || [])) {
    switch (node.type) {
      case 'source': sources.push(node as typeof sources[0]); break;
      case 'sink': sinks.push(node as typeof sinks[0]); break;
      case 'conveyor': conveyors.push(node as typeof conveyors[0]); break;
      case 'inspection': inspections.push(node as typeof inspections[0]); break;
      case 'assembly': assemblies.push(node as typeof assemblies[0]); break;
      case 'disassembly': disassemblies.push(node as typeof disassemblies[0]); break;
      case 'palletize': palletizers.push(node as typeof palletizers[0]); break;
      case 'depalletize': depalletizers.push(node as typeof depalletizers[0]); break;
      case 'splitter': splitters.push(node as typeof splitters[0]); break;
      case 'merge': merges.push(node as typeof merges[0]); break;
      case 'operator': operators.push(node as typeof operators[0]); break;
      case 'matchbuffer': matchBuffers.push(node as typeof matchBuffers[0]); break;
    }
  }

  // ── Sheet 1: Stations ──────────────────────────────────────────────
  {
    const header = [
      'ID', 'Name',
      'Cycle Time (s)', 'Dist. Type', 'Std Dev', 'Min', 'Max',
      'Setup Time (s)', 'Setup Dist. Type', 'Setup Std Dev', 'Setup Min', 'Setup Max',
      'MTBF (hours)', 'MTTR (hours)', 'Scrap Rate (%)', 'Batch Size',
      'Product Cycle Times (JSON)', 'Shifts (JSON)',
    ];
    const rows: unknown[][] = [header];
    for (const st of model.stations) {
      const ct = st.cycleTime;
      const su = st.setupTime;
      rows.push([
        st.id, st.name,
        distValue(ct), ct.type, distStdDev(ct), distMin(ct), distMax(ct),
        su ? distValue(su) : '', su ? su.type : '', su ? distStdDev(su) : '', su ? distMin(su) : '', su ? distMax(su) : '',
        st.mtbf ?? '', st.mttr ?? '', st.scrapRate != null ? st.scrapRate * 100 : '', st.batchSize ?? '',
        productCycleTimesJson(st.productCycleTimes), shiftsJson(st.shifts),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 18 },
      { wch: 14 }, { wch: 13 }, { wch: 9 }, { wch: 7 }, { wch: 7 },
      { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 11 },
      { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 11 },
      { wch: 34 }, { wch: 70 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Stations');
  }

  // ── Sheet 2: Buffers (includes match buffers) ─────────────────────
  {
    const header = ['ID', 'Name', 'Type (buffer/matchbuffer)', 'Capacity', 'Queue Rule',
      'Match Key', 'Required Parts (JSON)', 'Timeout (s)'];
    const rows: unknown[][] = [header];
    for (const buf of model.buffers) {
      rows.push([buf.id, buf.name, 'buffer', buf.capacity, buf.queueRule || 'FIFO', '', '', '']);
    }
    for (const mb of matchBuffers) {
      const d = mb.data;
      rows.push([
        d.id, d.name, 'matchbuffer', d.capacity, '',
        d.matchKey || 'order',
        d.requiredParts ? JSON.stringify(d.requiredParts) : '',
        d.timeout ?? '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 12 },
      { wch: 11 }, { wch: 60 }, { wch: 11 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Buffers');
  }

  // ── Sheet 3: Sources & Sinks ──────────────────────────────────────
  {
    const header = ['ID', 'Name', 'Type (source/sink)', 'Arrival Rate (s)',
      'Feed Mode (interval/orders)', 'Product Filter', 'Product Batch Size'];
    const rows: unknown[][] = [header];
    for (const s of sources) {
      const d = s.data;
      rows.push([
        d.id, d.name, 'source',
        d.arrivalRate ?? 120,
        d.feedMode || 'interval',
        d.productFilter || '',
        (d as SourceNodeData).productBatchSize ?? '',
      ]);
    }
    for (const s of sinks) {
      rows.push([s.data.id, s.data.name, 'sink', '', '', '', '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Sources & Sinks');
  }

  // ── Sheet 4: Conveyors ────────────────────────────────────────────
  {
    const header = ['ID', 'Name', 'Length (m)', 'Speed (m/s)', 'Capacity'];
    const rows: unknown[][] = [header];
    for (const c of conveyors) {
      const d = c.data;
      rows.push([d.id, d.name, d.length, d.speed, d.capacity]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Conveyors');
  }

  // ── Sheet 5: Inspections ──────────────────────────────────────────
  {
    const header = ['ID', 'Name', 'Inspection Time (s)', 'Defect Rate (%)',
      'Inspection Type (visual/automated/sampling)'];
    const rows: unknown[][] = [header];
    for (const ins of inspections) {
      const d = ins.data;
      rows.push([d.id, d.name, d.inspectionTime, d.defectRate, d.inspectionType || 'visual']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 42 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Inspections');
  }

  // ── Sheet 6: Assembly Operations ──────────────────────────────────
  {
    const header = ['ID', 'Name', 'Type (assembly/disassembly/palletize/depalletize)',
      'Cycle Time (s)', 'Input Parts', 'Pallet Size', 'Parts Config (JSON)'];
    const rows: unknown[][] = [header];
    for (const a of assemblies) {
      const d = a.data;
      rows.push([
        d.id, d.name, 'assembly', d.cycleTime, d.inputParts ?? 2, '',
        d.inputPartsByProduct ? JSON.stringify(d.inputPartsByProduct) : '',
      ]);
    }
    for (const a of disassemblies) {
      const d = a.data;
      rows.push([
        d.id, d.name, 'disassembly', d.cycleTime, '', '',
        d.outputParts ? JSON.stringify(d.outputParts) : '',
      ]);
    }
    for (const a of palletizers) {
      const d = a.data;
      rows.push([
        d.id, d.name, 'palletize', d.cycleTime, '', d.defaultPalletSize ?? 10,
        d.palletSizeByProduct ? JSON.stringify(d.palletSizeByProduct) : '',
      ]);
    }
    for (const a of depalletizers) {
      const d = a.data;
      rows.push([d.id, d.name, 'depalletize', d.cycleTime, '', '', '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 44 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 70 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Assembly Operations');
  }

  // ── Sheet 7: Flow Control (splitters + merges) ────────────────────
  {
    const header = ['ID', 'Name', 'Type (splitter/merge)', 'Ports', 'Routing Type',
      'Product Routing (JSON)', 'Percentages'];
    const rows: unknown[][] = [header];
    for (const s of splitters) {
      const d = s.data;
      const pctArr = (d as unknown as Record<string, unknown>).percentages as number[] | undefined;
      rows.push([
        d.id, d.name, 'splitter', d.outputs ?? 2, d.splitType || 'equal',
        d.productRouting ? JSON.stringify(d.productRouting) : '',
        pctArr ? pctArr.join(',') : '',
      ]);
    }
    for (const m of merges) {
      const d = m.data;
      rows.push([d.id, d.name, 'merge', d.inputs ?? 2, d.mergeType || 'fifo', '', '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 18 }, { wch: 24 }, { wch: 8 }, { wch: 16 },
      { wch: 44 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Flow Control');
  }

  // ── Sheet 8: Connections ──────────────────────────────────────────
  {
    const header = ['ID', 'Source ID', 'Target ID', 'Probability'];
    const rows: unknown[][] = [header];
    for (const c of model.connections) {
      rows.push([c.id, c.source, c.target, c.probability ?? '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Connections');
  }

  // ── Sheet 9: Products ─────────────────────────────────────────────
  {
    const header = ['ID', 'Name', 'Routing (comma-separated station IDs)', 'Arrival Rate (s)', 'Priority', 'Due Date Offset (s)'];
    const rows: unknown[][] = [header];
    for (const p of model.products) {
      rows.push([p.id, p.name, p.routing.join(','), p.arrivalRate ?? '', p.priority ?? '', p.dueDate ?? '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 18 }, { wch: 55 }, { wch: 16 }, { wch: 10 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
  }

  // ── Sheet 10: Orders ────────────────────────────────────────────────
  {
    const header = ['ID', 'Product ID', 'Quantity', 'Priority', 'Due Date', 'Status', 'Is WIP', 'Initial Station ID'];
    const rows: unknown[][] = [header];
    for (const o of model.orders ?? []) {
      rows.push([o.id, o.productId, o.quantity, o.priority, o.dueDate, o.status, o.isWip, o.initialStationId ?? '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  }

  // ── Sheet 11: Resources (includes operator nodes) ─────────────────
  {
    const header = ['ID', 'Name', 'Role (resource/operator-node)', 'Type (operator/machine/tool)',
      'Capacity', 'Efficiency (%)', 'Skills (comma-separated)', 'Shifts (JSON)'];
    const rows: unknown[][] = [header];
    for (const r of (model.resources || [])) {
      rows.push([
        r.id, r.name, 'resource', r.type || 'operator',
        r.capacity ?? 1, '',
        r.skills ? r.skills.join(',') : '',
        shiftsJson(r.shifts),
      ]);
    }
    for (const op of operators) {
      const d = op.data;
      rows.push([
        d.id, d.name, 'operator-node', '',
        d.count ?? 1, d.efficiency ?? 100,
        d.skill || '', '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 28 },
      { wch: 10 }, { wch: 16 }, { wch: 28 }, { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Resources');
  }

  // ── Sheet 12: Reference ───────────────────────────────────────────
  {
    const referenceData = [
      ['Parameter Reference — DO NOT import this sheet'],
      [''],
      ['SHEET OVERVIEW'],
      ['Sheet', 'What it contains'],
      ['Stations', 'Manufacturing workstations with cycle time distributions'],
      ['Buffers', 'Queues/buffers (type=buffer) and match buffers (type=matchbuffer)'],
      ['Sources & Sinks', 'Material entry points (source) and exit points (sink)'],
      ['Conveyors', 'Transport conveyors with length, speed, capacity'],
      ['Inspections', 'Quality inspection stations'],
      ['Assembly Operations', 'Assembly, disassembly, palletize, depalletize nodes'],
      ['Flow Control', 'Splitters and merges for routing material flow'],
      ['Connections', 'Directed edges between any two nodes'],
      ['Products', 'Product types with routing and arrival rates'],
      ['Orders', 'Production orders with quantities and due dates'],
      ['Resources', 'Shared resources (role=resource) and canvas operator nodes (role=operator-node)'],
      [''],
      ['DISTRIBUTION TYPES'],
      ['Type', 'Cycle Time (s) means', 'Std Dev', 'Min', 'Max'],
      ['constant', 'Fixed value', '', '', ''],
      ['normal', 'Mean', 'Std Dev', '', ''],
      ['exponential', 'Mean', '', '', ''],
      ['triangular', 'Mode', '', 'Min', 'Max'],
      ['uniform', '(ignored)', '', 'Min', 'Max'],
      ['lognormal', 'Mean', 'Std Dev', '', ''],
      ['weibull', 'Scale', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(referenceData);
    ws['!cols'] = [{ wch: 22 }, { wch: 60 }, { wch: 10 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Reference');
  }

  return wb;
}

/**
 * Generate an Excel workbook from a FactoryModel as a base64 string.
 * Used by artifactService to bundle a re-importable Excel with each run.
 */
export function generateModelExcelBase64(model: FactoryModel): string {
  const wb = buildModelWorkbook(model);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
}

/**
 * Download the current model as an Excel file via the browser.
 * Filename is derived from the model name.
 */
export function downloadModelExcel(model: FactoryModel): void {
  const wb = buildModelWorkbook(model);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const safeName = (model.name || 'FactorySim_Model').replace(/[^a-zA-Z0-9_-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
