import * as XLSX from 'xlsx';
import type {
  Station,
  Buffer,
  Connection,
  Product,
  Resource,
  DistributionConfig,
  ShiftSchedule,
  ExtraNodeEntry,
  ExtraNodeData,
  NodeType,
} from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function numReq(v: unknown, fallback: number): number {
  return num(v) ?? fallback;
}

function parseJson<T>(v: unknown): T | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

/** Build a DistributionConfig from the column group. */
function buildDistribution(
  value: unknown,
  type: unknown,
  stdDev: unknown,
  min: unknown,
  max: unknown,
): DistributionConfig {
  const distType = (str(type) || 'constant') as DistributionConfig['type'];
  const v = numReq(value, 60);
  const sd = num(stdDev);
  const mn = num(min);
  const mx = num(max);

  switch (distType) {
    case 'normal':
      return { type: 'normal', parameters: { mean: v, std: sd ?? v * 0.1 } };
    case 'exponential':
      return { type: 'exponential', parameters: { mean: v } };
    case 'triangular':
      return { type: 'triangular', parameters: { min: mn ?? v * 0.8, mode: v, max: mx ?? v * 1.2 } };
    case 'uniform':
      return { type: 'uniform', parameters: { min: mn ?? v * 0.8, max: mx ?? v * 1.2 } };
    case 'lognormal':
      return { type: 'lognormal', parameters: { mean: v, std: sd ?? v * 0.1 } };
    case 'weibull':
      return { type: 'weibull', parameters: { scale: v } };
    case 'empirical':
      return { type: 'empirical', parameters: { data: [v] } };
    case 'constant':
    default:
      return { type: 'constant', parameters: { value: v } };
  }
}

// Column index lookup: header text (lowercased) → column index
function headerMap(row: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((cell, i) => {
    if (cell != null) map[str(cell).toLowerCase()] = i;
  });
  return map;
}

/** Find column index by trying several header labels. */
function col(h: Record<string, number>, ...names: string[]): number {
  for (const n of names) {
    const idx = h[n.toLowerCase()];
    if (idx !== undefined) return idx;
  }
  return -1;
}

function cellAt(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : undefined;
}

// ─── Auto-layout ────────────────────────────────────────────────────

let autoX = 200;
let autoY = 100;
function nextPos() {
  const pos = { x: autoX, y: autoY };
  autoX += 200;
  if (autoX > 1000) { autoX = 200; autoY += 150; }
  return pos;
}

function resetAutoLayout() {
  autoX = 200;
  autoY = 100;
}

// ─── Sheet Parsers ──────────────────────────────────────────────────

export function parseStations(rows: unknown[][]): Station[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id')));
    const name = str(cellAt(r, col(h, 'name')));

    const cycleTime = buildDistribution(
      cellAt(r, col(h, 'cycle time (s)', 'cycle time', 'cycletime')),
      cellAt(r, col(h, 'dist. type', 'dist type', 'distribution type', 'type')),
      cellAt(r, col(h, 'std dev', 'stddev', 'std')),
      cellAt(r, col(h, 'min')),
      cellAt(r, col(h, 'max')),
    );

    // Setup time (optional)
    const setupVal = num(cellAt(r, col(h, 'setup time (s)', 'setup time', 'setuptime')));
    let setupTime: DistributionConfig | undefined;
    if (setupVal !== undefined) {
      setupTime = buildDistribution(
        setupVal,
        cellAt(r, col(h, 'setup dist. type', 'setup dist type', 'setup distribution type')),
        cellAt(r, col(h, 'setup std dev', 'setup stddev', 'setup std')),
        cellAt(r, col(h, 'setup min')),
        cellAt(r, col(h, 'setup max')),
      );
    }

    const mtbf = num(cellAt(r, col(h, 'mtbf (hours)', 'mtbf')));
    const mttr = num(cellAt(r, col(h, 'mttr (hours)', 'mttr')));
    const scrapRate = num(cellAt(r, col(h, 'scrap rate (%)', 'scrap rate', 'scraprate')));
    const batchSize = num(cellAt(r, col(h, 'batch size', 'batchsize')));

    // Product cycle times (JSON: { "PRD-001": 45 } → Record<string, DistributionConfig>)
    const pctRaw = parseJson<Record<string, number>>(cellAt(r, col(h, 'product cycle times (json)', 'product cycle times')));
    let productCycleTimes: Record<string, DistributionConfig> | undefined;
    if (pctRaw && Object.keys(pctRaw).length > 0) {
      productCycleTimes = {};
      for (const [pid, val] of Object.entries(pctRaw)) {
        productCycleTimes[pid] = { type: 'constant', parameters: { value: val } };
      }
    }

    // Shifts
    const shifts = parseJson<ShiftSchedule[]>(cellAt(r, col(h, 'shifts (json)', 'shifts')));

    const station: Station = {
      id: id || `stn-${Math.random().toString(36).slice(2, 8)}`,
      name: name || 'Imported Station',
      cycleTime,
      position: nextPos(),
    };
    if (setupTime) station.setupTime = setupTime;
    if (mtbf !== undefined) station.mtbf = mtbf;
    if (mttr !== undefined) station.mttr = mttr;
    if (scrapRate !== undefined) station.scrapRate = scrapRate / 100;
    if (batchSize !== undefined) station.batchSize = batchSize;
    if (productCycleTimes) station.productCycleTimes = productCycleTimes;
    if (shifts && shifts.length > 0) station.shifts = shifts;
    return station;
  });
}

/**
 * Parse the Buffers sheet. Rows with type=buffer → Buffer[],
 * rows with type=matchbuffer → ExtraNodeEntry[].
 */
export function parseBuffersSheet(rows: unknown[][]): { buffers: Buffer[]; matchBuffers: ExtraNodeEntry[] } {
  if (rows.length < 2) return { buffers: [], matchBuffers: [] };
  const h = headerMap(rows[0]);
  resetAutoLayout();

  const buffers: Buffer[] = [];
  const matchBuffers: ExtraNodeEntry[] = [];

  for (const r of rows.slice(1)) {
    if (!str(r[0])) continue;
    const id = str(cellAt(r, col(h, 'id'))) || `buf-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Buffer';
    const typeRaw = str(cellAt(r, col(h, 'type (buffer/matchbuffer)', 'type'))).toLowerCase();

    if (typeRaw === 'matchbuffer') {
      const capacity = numReq(cellAt(r, col(h, 'capacity')), 10);
      const matchKey = (str(cellAt(r, col(h, 'match key', 'matchkey'))) || 'order') as 'order' | 'batch';
      const requiredParts = parseJson<{ productId: string; productName: string; quantity: number }[]>(
        cellAt(r, col(h, 'required parts (json)', 'required parts'))
      ) || [];
      const timeout = num(cellAt(r, col(h, 'timeout (s)', 'timeout')));

      const data: ExtraNodeData = { id, name, capacity, matchKey, requiredParts, ...(timeout !== undefined && { timeout }) } as ExtraNodeData;
      matchBuffers.push({ id, type: 'matchbuffer', data, position: nextPos() });
    } else {
      buffers.push({
        id,
        name,
        capacity: numReq(cellAt(r, col(h, 'capacity')), 10),
        queueRule: (str(cellAt(r, col(h, 'queue rule', 'queuerule'))) || 'FIFO').toUpperCase() as Buffer['queueRule'],
        position: nextPos(),
      });
    }
  }

  return { buffers, matchBuffers };
}

/** Legacy buffer parser (no Type column — all rows are plain buffers). */
export function parseBuffers(rows: unknown[][]): Buffer[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => ({
    id: str(cellAt(r, col(h, 'id'))) || `buf-${Math.random().toString(36).slice(2, 8)}`,
    name: str(cellAt(r, col(h, 'name'))) || 'Imported Buffer',
    capacity: numReq(cellAt(r, col(h, 'capacity')), 10),
    queueRule: (str(cellAt(r, col(h, 'queue rule', 'queuerule'))) || 'FIFO').toUpperCase() as Buffer['queueRule'],
    position: nextPos(),
  }));
}

/** Parse Sources & Sinks sheet → ExtraNodeEntry[] */
export function parseSourcesSinks(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `node-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Node';
    const typeRaw = str(cellAt(r, col(h, 'type (source/sink)', 'type'))).toLowerCase();
    const isSink = typeRaw === 'sink';

    if (isSink) {
      const data: ExtraNodeData = { id, name } as ExtraNodeData;
      return { id, type: 'sink' as NodeType, data, position: nextPos() };
    }

    const arrivalRate = numReq(cellAt(r, col(h, 'arrival rate (s)', 'arrival rate', 'arrivalrate')), 120);
    const feedMode = (str(cellAt(r, col(h, 'feed mode (interval/orders)', 'feed mode', 'feedmode'))) || 'interval') as 'interval' | 'orders';
    const productFilter = str(cellAt(r, col(h, 'product filter', 'productfilter'))) || undefined;
    const productBatchSize = num(cellAt(r, col(h, 'product batch size', 'productbatchsize')));

    const data: ExtraNodeData = {
      id, name, arrivalRate, feedMode,
      ...(productFilter && { productFilter }),
      ...(productBatchSize && productBatchSize > 1 && { productBatchSize }),
    } as ExtraNodeData;
    return { id, type: 'source' as NodeType, data, position: nextPos() };
  });
}

/** Parse Conveyors sheet → ExtraNodeEntry[] */
export function parseConveyors(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `cnv-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Conveyor';
    const length = numReq(cellAt(r, col(h, 'length (m)', 'length')), 10);
    const speed = numReq(cellAt(r, col(h, 'speed (m/s)', 'speed')), 1);
    const capacity = numReq(cellAt(r, col(h, 'capacity')), 10);

    const data: ExtraNodeData = { id, name, length, speed, capacity } as ExtraNodeData;
    return { id, type: 'conveyor' as NodeType, data, position: nextPos() };
  });
}

/** Parse Inspections sheet → ExtraNodeEntry[] */
export function parseInspections(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `ins-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Inspection';
    const inspectionTime = numReq(cellAt(r, col(h, 'inspection time (s)', 'inspection time', 'inspectiontime')), 30);
    const defectRate = numReq(cellAt(r, col(h, 'defect rate (%)', 'defect rate', 'defectrate')), 0);
    const inspectionType = (str(cellAt(r, col(h, 'inspection type (visual/automated/sampling)', 'inspection type', 'inspectiontype'))) || 'visual') as 'visual' | 'automated' | 'sampling';

    const data: ExtraNodeData = { id, name, inspectionTime, defectRate, inspectionType } as ExtraNodeData;
    return { id, type: 'inspection' as NodeType, data, position: nextPos() };
  });
}

/** Parse Assembly Operations sheet → ExtraNodeEntry[] (assembly/disassembly/palletize/depalletize) */
export function parseAssemblyOperations(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `asm-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Assembly Op';
    const typeRaw = str(cellAt(r, col(h, 'type (assembly/disassembly/palletize/depalletize)', 'type'))).toLowerCase() as NodeType;
    const cycleTime = numReq(cellAt(r, col(h, 'cycle time (s)', 'cycle time', 'cycletime')), 60);

    const validTypes: NodeType[] = ['assembly', 'disassembly', 'palletize', 'depalletize'];
    const nodeType: NodeType = validTypes.includes(typeRaw) ? typeRaw : 'assembly';

    let data: ExtraNodeData;

    switch (nodeType) {
      case 'assembly': {
        const inputParts = numReq(cellAt(r, col(h, 'input parts', 'inputparts')), 2);
        const inputPartsByProduct = parseJson<{ productId: string; productName: string; quantity: number }[]>(
          cellAt(r, col(h, 'parts config (json)', 'parts config'))
        );
        data = { id, name, cycleTime, inputParts, ...(inputPartsByProduct && { inputPartsByProduct }) } as ExtraNodeData;
        break;
      }
      case 'disassembly': {
        const outputParts = parseJson<{ productId: string; productName: string; quantity: number }[]>(
          cellAt(r, col(h, 'parts config (json)', 'parts config'))
        ) || [];
        data = { id, name, cycleTime, outputParts } as ExtraNodeData;
        break;
      }
      case 'palletize': {
        const defaultPalletSize = numReq(cellAt(r, col(h, 'pallet size', 'palletsize')), 10);
        const palletSizeByProduct = parseJson<Record<string, number>>(
          cellAt(r, col(h, 'parts config (json)', 'parts config'))
        );
        data = { id, name, cycleTime, defaultPalletSize, ...(palletSizeByProduct && { palletSizeByProduct }) } as ExtraNodeData;
        break;
      }
      case 'depalletize': {
        data = { id, name, cycleTime } as ExtraNodeData;
        break;
      }
      default:
        data = { id, name, cycleTime, inputParts: 2 } as ExtraNodeData;
    }

    return { id, type: nodeType, data, position: nextPos() };
  });
}

/** Parse Flow Control sheet → ExtraNodeEntry[] (splitter/merge) */
export function parseFlowControl(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `fc-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Flow Control';
    const typeRaw = str(cellAt(r, col(h, 'type (splitter/merge)', 'type'))).toLowerCase();
    const isMerge = typeRaw === 'merge';
    const ports = numReq(cellAt(r, col(h, 'ports')), 2);

    if (isMerge) {
      const mergeType = (str(cellAt(r, col(h, 'routing type', 'routingtype'))) || 'fifo') as 'fifo' | 'priority' | 'alternating';
      const data: ExtraNodeData = { id, name, inputs: ports, mergeType } as ExtraNodeData;
      return { id, type: 'merge' as NodeType, data, position: nextPos() };
    }

    // Splitter
    const splitType = (str(cellAt(r, col(h, 'routing type', 'routingtype'))) || 'equal') as 'equal' | 'percentage' | 'conditional' | 'product-based';
    const productRouting = parseJson<Record<string, number>>(
      cellAt(r, col(h, 'product routing (json)', 'product routing'))
    );
    const percentagesStr = str(cellAt(r, col(h, 'percentages')));
    const percentages = percentagesStr
      ? percentagesStr.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
      : undefined;

    const data: Record<string, unknown> = { id, name, outputs: ports, splitType };
    if (productRouting) data.productRouting = productRouting;
    if (percentages && percentages.length > 0) data.percentages = percentages;

    return { id, type: 'splitter' as NodeType, data: data as unknown as ExtraNodeData, position: nextPos() };
  });
}

export function parseConnections(rows: unknown[][]): Connection[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const probability = num(cellAt(r, col(h, 'probability')));
    const conn: Connection = {
      id: str(cellAt(r, col(h, 'id'))) || `con-${Math.random().toString(36).slice(2, 8)}`,
      source: str(cellAt(r, col(h, 'source id', 'source', 'from'))),
      target: str(cellAt(r, col(h, 'target id', 'target', 'to'))),
    };
    if (probability !== undefined) conn.probability = probability;
    return conn;
  }).filter(c => c.source && c.target);
}

export function parseProducts(rows: unknown[][]): Product[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const routingStr = str(cellAt(r, col(h, 'routing (comma-separated station ids)', 'routing')));
    const routing = routingStr ? routingStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const arrivalRate = num(cellAt(r, col(h, 'arrival rate (s)', 'arrival rate', 'arrivalrate')));
    const priority = num(cellAt(r, col(h, 'priority')));
    const dueDate = num(cellAt(r, col(h, 'due date offset (s)', 'due date offset', 'duedateoffset', 'duedate')));
    const product: Product = {
      id: str(cellAt(r, col(h, 'id'))) || `prd-${Math.random().toString(36).slice(2, 8)}`,
      name: str(cellAt(r, col(h, 'name'))) || 'Imported Product',
      routing,
    };
    if (arrivalRate !== undefined) product.arrivalRate = arrivalRate;
    if (priority !== undefined) product.priority = priority;
    if (dueDate !== undefined) product.dueDate = dueDate;
    return product;
  });
}

export interface ParsedOrder {
  id: string;
  productId: string;
  quantity: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  status: 'pending' | 'in_progress';
  isWip: boolean;
  initialStationId?: string;
}

export function parseOrders(rows: unknown[][]): ParsedOrder[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const isWipRaw = cellAt(r, col(h, 'is wip', 'iswip'));
    const isWip = isWipRaw === true || str(isWipRaw).toLowerCase() === 'true';
    const initialStation = str(cellAt(r, col(h, 'initial station id', 'initialstationid')));
    return {
      id: str(cellAt(r, col(h, 'id'))) || `ord-${Math.random().toString(36).slice(2, 8)}`,
      productId: str(cellAt(r, col(h, 'product id', 'productid'))),
      quantity: numReq(cellAt(r, col(h, 'quantity')), 1),
      priority: (str(cellAt(r, col(h, 'priority'))) || 'medium') as ParsedOrder['priority'],
      dueDate: str(cellAt(r, col(h, 'due date', 'duedate'))) || new Date().toISOString().slice(0, 10),
      status: (str(cellAt(r, col(h, 'status'))) || 'pending') as ParsedOrder['status'],
      isWip,
      initialStationId: initialStation || undefined,
    };
  });
}

/**
 * Parse Resources sheet. Rows with role=resource → Resource[],
 * rows with role=operator-node → ExtraNodeEntry[] (operator).
 */
export function parseResourcesSheet(rows: unknown[][]): { resources: Resource[]; operatorNodes: ExtraNodeEntry[] } {
  if (rows.length < 2) return { resources: [], operatorNodes: [] };
  const h = headerMap(rows[0]);
  resetAutoLayout();

  const resources: Resource[] = [];
  const operatorNodes: ExtraNodeEntry[] = [];

  for (const r of rows.slice(1)) {
    if (!str(r[0])) continue;
    const id = str(cellAt(r, col(h, 'id'))) || `res-${Math.random().toString(36).slice(2, 8)}`;
    const name = str(cellAt(r, col(h, 'name'))) || 'Imported Resource';
    const role = str(cellAt(r, col(h, 'role (resource/operator-node)', 'role'))).toLowerCase();

    if (role === 'operator-node') {
      const count = numReq(cellAt(r, col(h, 'capacity')), 1);
      const efficiency = numReq(cellAt(r, col(h, 'efficiency (%)', 'efficiency')), 100);
      const skillsStr = str(cellAt(r, col(h, 'skills (comma-separated)', 'skills')));
      const skill = skillsStr ? skillsStr.split(',')[0].trim() : '';

      const data: ExtraNodeData = { id, name, count, efficiency, skill } as ExtraNodeData;
      operatorNodes.push({ id, type: 'operator', data, position: nextPos() });
    } else {
      // Standard resource
      const skillsStr = str(cellAt(r, col(h, 'skills (comma-separated)', 'skills')));
      const skills = skillsStr ? skillsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const shifts = parseJson<ShiftSchedule[]>(cellAt(r, col(h, 'shifts (json)', 'shifts')));

      const resource: Resource = {
        id,
        name,
        type: (str(cellAt(r, col(h, 'type (operator/machine/tool)', 'type'))) || 'operator') as Resource['type'],
        capacity: numReq(cellAt(r, col(h, 'capacity')), 1),
      };
      if (skills) resource.skills = skills;
      if (shifts && shifts.length > 0) resource.shifts = shifts;
      resources.push(resource);
    }
  }

  return { resources, operatorNodes };
}

/** Legacy resource parser (no Role column — all rows are resources). */
export function parseResources(rows: unknown[][]): Resource[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const skillsStr = str(cellAt(r, col(h, 'skills (comma-separated)', 'skills')));
    const skills = skillsStr ? skillsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const shifts = parseJson<ShiftSchedule[]>(cellAt(r, col(h, 'shifts (json)', 'shifts')));

    // Support legacy separate shift start/end columns
    const shiftStart = num(cellAt(r, col(h, 'shift start (hour)', 'shift start')));
    const shiftEnd = num(cellAt(r, col(h, 'shift end (hour)', 'shift end')));
    let finalShifts = shifts;
    if (!finalShifts && shiftStart !== undefined && shiftEnd !== undefined) {
      finalShifts = [{ name: 'Shift', startHour: shiftStart, endHour: shiftEnd, days: [0, 1, 2, 3, 4] }];
    }

    const resource: Resource = {
      id: str(cellAt(r, col(h, 'id'))) || `res-${Math.random().toString(36).slice(2, 8)}`,
      name: str(cellAt(r, col(h, 'name'))) || 'Imported Resource',
      type: (str(cellAt(r, col(h, 'type (operator/machine/tool)', 'type'))) || 'operator') as Resource['type'],
      capacity: numReq(cellAt(r, col(h, 'capacity')), 1),
    };
    if (skills) resource.skills = skills;
    if (finalShifts && finalShifts.length > 0) resource.shifts = finalShifts;
    return resource;
  });
}

// ─── Legacy Extra Nodes parser (backward compat) ────────────────────

const VALID_NODE_TYPES: NodeType[] = [
  'source', 'sink', 'conveyor', 'operator', 'inspection',
  'assembly', 'splitter', 'merge', 'disassembly',
  'palletize', 'depalletize', 'matchbuffer',
];

export function parseExtraNodes(rows: unknown[][]): ExtraNodeEntry[] {
  if (rows.length < 2) return [];
  const h = headerMap(rows[0]);
  resetAutoLayout();

  return rows.slice(1).filter(r => str(r[0])).map(r => {
    const id = str(cellAt(r, col(h, 'id'))) || `node-${Math.random().toString(36).slice(2, 8)}`;
    const type = str(cellAt(r, col(h, 'type'))).toLowerCase() as NodeType;
    const name = str(cellAt(r, col(h, 'name'))) || type;
    const config = parseJson<Record<string, unknown>>(cellAt(r, col(h, 'config (json)', 'config'))) || {};

    const data = { id, name, ...config } as ExtraNodeData;
    return {
      id,
      type: VALID_NODE_TYPES.includes(type) ? type : 'source' as NodeType,
      data,
      position: nextPos(),
    };
  });
}

// ─── Full Workbook Import ────────────────────────────────────────────

export interface ImportResult {
  stations: Station[];
  buffers: Buffer[];
  connections: Connection[];
  products: Product[];
  orders: ParsedOrder[];
  resources: Resource[];
  extraNodes: ExtraNodeEntry[];
  sheetsFound: string[];
}

function sheetToRows(wb: XLSX.WorkBook, name: string): unknown[][] | null {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
}

/** Try to find a sheet by several name variants (case-insensitive). */
function findSheet(wb: XLSX.WorkBook, ...names: string[]): unknown[][] | null {
  const sheetNames = wb.SheetNames.map(s => s.toLowerCase());
  for (const name of names) {
    const idx = sheetNames.indexOf(name.toLowerCase());
    if (idx >= 0) return sheetToRows(wb, wb.SheetNames[idx]);
  }
  return null;
}

/** Check if the Buffers sheet has the new Type column. */
function buffersSheetHasTypeColumn(rows: unknown[][]): boolean {
  if (rows.length < 1) return false;
  const h = headerMap(rows[0]);
  return col(h, 'type (buffer/matchbuffer)', 'type') >= 0
    && str(rows[0][col(h, 'type (buffer/matchbuffer)', 'type')]).toLowerCase().includes('buffer');
}

/** Check if the Resources sheet has the new Role column. */
function resourcesSheetHasRoleColumn(rows: unknown[][]): boolean {
  if (rows.length < 1) return false;
  const h = headerMap(rows[0]);
  return col(h, 'role (resource/operator-node)', 'role') >= 0;
}

export function importWorkbook(buffer: ArrayBuffer): ImportResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetsFound: string[] = [...wb.SheetNames];

  // ── Stations (unchanged) ──────────────────────────────────────────
  const stationRows = findSheet(wb, 'Stations', 'Station');

  // ── Buffers — detect new format (with Type column) vs legacy ──────
  const bufferRows = findSheet(wb, 'Buffers', 'Buffer');
  let buffers: Buffer[] = [];
  const extraNodes: ExtraNodeEntry[] = [];

  if (bufferRows) {
    if (buffersSheetHasTypeColumn(bufferRows)) {
      const parsed = parseBuffersSheet(bufferRows);
      buffers = parsed.buffers;
      extraNodes.push(...parsed.matchBuffers);
    } else {
      buffers = parseBuffers(bufferRows);
    }
  }

  // ── New per-type sheets ───────────────────────────────────────────
  const sourceSinkRows = findSheet(wb, 'Sources & Sinks', 'Sources and Sinks', 'SourcesSinks');
  if (sourceSinkRows) extraNodes.push(...parseSourcesSinks(sourceSinkRows));

  const conveyorRows = findSheet(wb, 'Conveyors', 'Conveyor');
  if (conveyorRows) extraNodes.push(...parseConveyors(conveyorRows));

  const inspectionRows = findSheet(wb, 'Inspections', 'Inspection');
  if (inspectionRows) extraNodes.push(...parseInspections(inspectionRows));

  const assemblyRows = findSheet(wb, 'Assembly Operations', 'AssemblyOperations', 'Assembly');
  if (assemblyRows) extraNodes.push(...parseAssemblyOperations(assemblyRows));

  const flowControlRows = findSheet(wb, 'Flow Control', 'FlowControl');
  if (flowControlRows) extraNodes.push(...parseFlowControl(flowControlRows));

  // ── Connections, Products, Orders (unchanged) ─────────────────────
  const connectionRows = findSheet(wb, 'Connections', 'Connection');
  const productRows = findSheet(wb, 'Products', 'Product');
  const orderRows = findSheet(wb, 'Orders', 'Order');

  // ── Resources — detect new format (with Role column) vs legacy ────
  const resourceRows = findSheet(wb, 'Resources', 'Resource');
  let resources: Resource[] = [];

  if (resourceRows) {
    if (resourcesSheetHasRoleColumn(resourceRows)) {
      const parsed = parseResourcesSheet(resourceRows);
      resources = parsed.resources;
      extraNodes.push(...parsed.operatorNodes);
    } else {
      resources = parseResources(resourceRows);
    }
  }

  // ── Legacy "Extra Nodes" fallback ─────────────────────────────────
  // Only used if none of the new per-type sheets were found
  const hasNewSheets = sourceSinkRows || conveyorRows || inspectionRows || assemblyRows || flowControlRows;
  if (!hasNewSheets) {
    const extraNodeRows = findSheet(wb, 'Extra Nodes', 'ExtraNodes', 'Extra');
    if (extraNodeRows) extraNodes.push(...parseExtraNodes(extraNodeRows));
  }

  return {
    stations: stationRows ? parseStations(stationRows) : [],
    buffers,
    connections: connectionRows ? parseConnections(connectionRows) : [],
    products: productRows ? parseProducts(productRows) : [],
    orders: orderRows ? parseOrders(orderRows) : [],
    resources,
    extraNodes,
    sheetsFound,
  };
}
