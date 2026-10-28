import * as XLSX from 'xlsx';
import {
  type ScenarioInput,
  type ScenarioEntity,
  type ScenarioType,
} from '../components/factory-builder/3d/shared/ScenarioRenderer';
import { ScaleLevel } from '../components/factory-builder/3d/shared/MultiScale';
import type { VisualOverrides } from '../components/factory-builder/3d/shared/Overrides';

/**
 * Excel → ScenarioInput parser.
 *
 * Adds two sheet conventions on top of the existing FactorySim Excel format:
 *
 *   1. "Scenario" sheet (single row of metadata)
 *      Columns: ScenarioType, ScaleLevel
 *      Values:  ScenarioType ∈ {factory, warehouse, supply-chain, mixed}
 *               ScaleLevel   ∈ {detailed, abstract, building} (optional override)
 *
 *   2. "Layout" sheet (one row per visual entity)
 *      Columns: ID, ModelKey, X, Y, Z, RotY (deg), Scale,
 *               ScaleLevel, Color, Opacity, Emissive, EmissiveIntensity
 *
 *      ID         — stable identifier
 *      ModelKey   — matches an entry in MODEL_LIBRARY (e.g. 'cobot', 'warehouse-shell')
 *      X/Y/Z      — world position (units = meters)
 *      RotY       — yaw in *degrees* (Excel-friendly)
 *      Scale      — uniform scale (default 1)
 *      ScaleLevel — per-entity override of scenario scale
 *      Color      — '#rrggbb' or '0xRRGGBB' or '0xRRGGBB' or numeric hex
 *      Opacity    — 0..1
 *      Emissive   — same format as Color
 *      EmissiveIntensity — number, default 0
 *
 * Round-trips with `buildDemoScenarioWorkbook()` so users have a starting
 * template they can edit.
 */

// ─── Helpers (kept local; small enough not to import excelImporter's internals)

function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function headerMap(row: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((cell, i) => {
    if (cell != null) map[str(cell).toLowerCase()] = i;
  });
  return map;
}

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

function findSheet(wb: XLSX.WorkBook, ...names: string[]): unknown[][] | null {
  const sheetNames = wb.SheetNames.map(s => s.toLowerCase());
  for (const name of names) {
    const idx = sheetNames.indexOf(name.toLowerCase());
    if (idx >= 0) {
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[idx]], {
        header: 1,
        defval: '',
      }) as unknown[][];
    }
  }
  return null;
}

function parseScaleLevel(v: unknown): ScaleLevel | undefined {
  const s = str(v).toLowerCase();
  if (s === 'detailed' || s === 'detail' || s === 'high') return ScaleLevel.DETAILED;
  if (s === 'abstract' || s === 'mid' || s === 'medium') return ScaleLevel.ABSTRACT;
  if (s === 'building' || s === 'shell' || s === 'macro') return ScaleLevel.BUILDING;
  return undefined;
}

function parseScenarioType(v: unknown): ScenarioType {
  const s = str(v).toLowerCase().replace(/\s+/g, '-');
  if (s === 'factory') return 'factory';
  if (s === 'warehouse') return 'warehouse';
  if (s === 'supply-chain' || s === 'supplychain') return 'supply-chain';
  if (s === 'mixed') return 'mixed';
  return 'factory';
}

function parseColor(v: unknown): number | string | undefined {
  const s = str(v);
  if (!s) return undefined;
  // Accept '#rrggbb', '0xRRGGBB', 'RRGGBB', or decimal numbers.
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^0x[0-9a-f]{6}$/i.test(s)) return s;
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parseScenarioMeta(rows: unknown[][] | null): {
  type: ScenarioType;
  scaleLevel?: ScaleLevel;
} {
  if (!rows || rows.length < 2) return { type: 'factory' };
  const h = headerMap(rows[0]);
  const r = rows[1];
  return {
    type: parseScenarioType(cellAt(r, col(h, 'scenariotype', 'scenario type', 'type'))),
    scaleLevel: parseScaleLevel(cellAt(r, col(h, 'scalelevel', 'scale level', 'scale'))),
  };
}

function parseLayoutRows(rows: unknown[][] | null): ScenarioEntity[] {
  if (!rows || rows.length < 2) return [];
  const h = headerMap(rows[0]);
  const out: ScenarioEntity[] = [];
  let idx = 0;

  for (const r of rows.slice(1)) {
    const id = str(cellAt(r, col(h, 'id'))) || `entity-${idx++}`;
    const modelKey = str(cellAt(r, col(h, 'modelkey', 'model key', 'model')));
    if (!modelKey) continue;

    const x = num(cellAt(r, col(h, 'x'))) ?? 0;
    const y = num(cellAt(r, col(h, 'y'))) ?? 0;
    const z = num(cellAt(r, col(h, 'z'))) ?? 0;
    const rotYDeg = num(cellAt(r, col(h, 'roty', 'rotation y', 'yaw (deg)', 'yaw'))) ?? 0;
    const scale = num(cellAt(r, col(h, 'scale'))) ?? 1;

    const ent: ScenarioEntity = {
      id,
      modelKey,
      position: { x, y, z },
      rotation: { x: 0, y: (rotYDeg * Math.PI) / 180, z: 0 },
      scale,
    };

    const scaleLevel = parseScaleLevel(cellAt(r, col(h, 'scalelevel', 'scale level', 'scale')));
    if (scaleLevel) ent.scaleLevel = scaleLevel;

    const overrides: VisualOverrides = {};
    const color = parseColor(cellAt(r, col(h, 'color', 'colour')));
    if (color !== undefined) overrides.color = color;
    const opacity = num(cellAt(r, col(h, 'opacity', 'alpha')));
    if (opacity !== undefined) overrides.opacity = opacity;
    const emissive = parseColor(cellAt(r, col(h, 'emissive', 'glow')));
    if (emissive !== undefined) overrides.emissive = emissive;
    const emissiveIntensity = num(cellAt(r, col(h, 'emissiveintensity', 'glow intensity')));
    if (emissiveIntensity !== undefined) overrides.emissiveIntensity = emissiveIntensity;

    if (Object.keys(overrides).length > 0) ent.overrides = overrides;

    out.push(ent);
  }
  return out;
}

// ─── Public entry points ────────────────────────────────────────────────────

export function importScenarioFromWorkbook(buffer: ArrayBuffer): ScenarioInput {
  const wb = XLSX.read(buffer, { type: 'array' });
  const meta = parseScenarioMeta(findSheet(wb, 'Scenario', 'Meta'));
  const entities = parseLayoutRows(findSheet(wb, 'Layout', 'Entities', 'Visuals'));
  return { type: meta.type, scaleLevel: meta.scaleLevel, entities };
}

/** Build a starter workbook the user can download, edit, and re-upload. */
export function buildDemoScenarioWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const scenario = [
    ['ScenarioType', 'ScaleLevel'],
    ['factory', 'detailed'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scenario), 'Scenario');

  const layout = [
    ['ID', 'ModelKey', 'X', 'Y', 'Z', 'RotY', 'Scale', 'ScaleLevel', 'Color', 'Opacity'],
    // Two rigged robots flanking a feed conveyor — both reach onto the belt
    // for the auto-loop pick-and-place demo.
    ['cobot-cell',   'cobot',            -1.4, 0, 0,    0, 1, '', '#2266ff', 1],
    ['kuka-cell',    'industrial-robot',  1.4, 0, 0,    0, 1, '', '#e6711a', 1],
    // Belt running along X between the two robots, slightly forward.
    ['feed-belt',    'belt-conveyor',     0,   0, 0.6, 90, 1.6, '', '', 1],
    // Drop-off pallet behind the robots
    ['drop-pallet',  'pallet-stack',     -1.4, 0, -1.0, 0, 1, '', '', 1],
    ['drop-pallet-2','pallet-stack',      1.4, 0, -1.0, 0, 1, '', '', 1],
    // Background facilities at building scale — visible if the user pans out.
    ['warehouse-1',  'warehouse-shell',  -14,  0, -8,   0, 1, 'building', '#a8b0bc', 1],
    ['hq',           'office-shell',      14,  0, -8,   0, 1, 'building', '#5a8cb8', 1],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(layout), 'Layout');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
