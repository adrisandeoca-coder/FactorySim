import type { FactoryModel, ScenarioParameterOverride } from '../types';

/**
 * Apply scenario parameter overrides to a clone of the factory model.
 * Returns a modified FactoryModel ready to send to the Python simulation engine.
 */
export function applyOverrides(
  model: FactoryModel,
  overrides: ScenarioParameterOverride[]
): FactoryModel {
  // Deep clone the model
  const cloned: FactoryModel = JSON.parse(JSON.stringify(model));

  for (const override of overrides) {
    switch (override.entityType) {
      case 'station': {
        const station = cloned.stations.find((s) => s.id === override.entityId);
        if (station) {
          setNestedValue(station, override.parameter, override.overrideValue);
        }
        break;
      }
      case 'buffer': {
        const buffer = cloned.buffers.find((b) => b.id === override.entityId);
        if (buffer) {
          setNestedValue(buffer, override.parameter, override.overrideValue);
        }
        break;
      }
      case 'source': {
        const node = cloned.extraNodes.find(
          (n) => n.id === override.entityId && n.type === 'source'
        );
        if (node) {
          setNestedValue(node.data, override.parameter, override.overrideValue);
        }
        break;
      }
      case 'product': {
        const product = cloned.products.find((p) => p.id === override.entityId);
        if (product) {
          setNestedValue(product, override.parameter, override.overrideValue);
        }
        break;
      }
      case 'conveyor':
      case 'inspection':
      case 'assembly':
      case 'splitter':
      case 'merge':
      case 'disassembly':
      case 'palletize':
      case 'depalletize':
      case 'matchbuffer': {
        const extraNode = cloned.extraNodes.find(
          (n) => n.id === override.entityId && n.type === override.entityType
        );
        if (extraNode) {
          setNestedValue(extraNode.data, override.parameter, override.overrideValue);
        }
        break;
      }
    }
  }

  return cloned;
}

/**
 * Set a value at a nested path in an object.
 * Supports dot-notation paths like "cycleTime.parameters.value".
 */
function setNestedValue(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Get the value at a nested path in an object.
 */
export function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }

  return current;
}

/**
 * Get available parameters for an entity type.
 */
export function getParametersForEntityType(
  entityType: string
): { key: string; label: string }[] {
  switch (entityType) {
    case 'station':
      return [
        { key: 'cycleTime.parameters.value', label: 'Cycle Time — Value (constant)' },
        { key: 'cycleTime.parameters.mean', label: 'Cycle Time — Mean (normal/lognormal)' },
        { key: 'cycleTime.parameters.std', label: 'Cycle Time — Std Dev (normal/lognormal)' },
        { key: 'cycleTime.parameters.min', label: 'Cycle Time — Min (triangular/uniform)' },
        { key: 'cycleTime.parameters.max', label: 'Cycle Time — Max (triangular/uniform)' },
        { key: 'cycleTime.parameters.mode', label: 'Cycle Time — Mode (triangular)' },
        { key: 'mtbf', label: 'MTBF (hours)' },
        { key: 'mttr', label: 'MTTR (hours)' },
        { key: 'scrapRate', label: 'Scrap Rate' },
        { key: 'batchSize', label: 'Batch Size' },
        { key: 'shifts', label: 'Shift Schedule' },
      ];
    case 'buffer':
      return [
        { key: 'capacity', label: 'Capacity' },
      ];
    case 'source':
      return [
        { key: 'arrivalRate', label: 'Arrival Rate (s)' },
        { key: 'feedMode', label: 'Feed Mode' },
      ];
    case 'product':
      return [
        { key: 'arrivalRate', label: 'Arrival Rate (s)' },
        { key: 'priority', label: 'Priority' },
      ];
    case 'assembly':
      return [
        { key: 'cycleTime', label: 'Cycle Time (s)' },
        { key: 'inputParts', label: 'Input Parts' },
        { key: 'inputPartsByProduct', label: 'Input Parts by Product (JSON)' },
      ];
    case 'disassembly':
      return [
        { key: 'cycleTime', label: 'Cycle Time (s)' },
        { key: 'outputParts', label: 'Output Parts (JSON)' },
      ];
    case 'palletize':
      return [
        { key: 'defaultPalletSize', label: 'Default Pallet Size' },
        { key: 'palletSizeByProduct', label: 'Pallet Size by Product (JSON)' },
        { key: 'cycleTime', label: 'Cycle Time (s)' },
      ];
    case 'depalletize':
      return [
        { key: 'cycleTime', label: 'Cycle Time per Item (s)' },
      ];
    case 'matchbuffer':
      return [
        { key: 'capacity', label: 'Capacity' },
        { key: 'timeout', label: 'Timeout (s)' },
      ];
    case 'splitter':
      return [
        { key: 'outputs', label: 'Number of Outputs' },
        { key: 'splitType', label: 'Split Type' },
        { key: 'productRouting', label: 'Product Routing (JSON)' },
      ];
    case 'merge':
      return [
        { key: 'inputs', label: 'Number of Inputs' },
        { key: 'mergeType', label: 'Merge Type' },
      ];
    case 'conveyor':
      return [
        { key: 'length', label: 'Length' },
        { key: 'speed', label: 'Speed' },
        { key: 'capacity', label: 'Capacity' },
      ];
    case 'inspection':
      return [
        { key: 'inspectionTime', label: 'Inspection Time (s)' },
        { key: 'defectRate', label: 'Defect Rate' },
        { key: 'inspectionType', label: 'Inspection Type' },
      ];
    default:
      return [];
  }
}
