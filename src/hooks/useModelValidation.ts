import { useMemo } from 'react';
import type { FactoryModel } from '../types';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  nodeId?: string;
}

/**
 * Hook that validates a factory model in real-time and returns
 * inline warnings for the builder canvas. Runs client-side (no Python).
 */
export function useModelValidation(model: FactoryModel): ValidationIssue[] {
  return useMemo(() => {
    const issues: ValidationIssue[] = [];

    // Build connection lookup
    const connectedSources = new Set<string>();
    const connectedTargets = new Set<string>();
    for (const conn of model.connections) {
      connectedSources.add(conn.source);
      connectedTargets.add(conn.target);
    }

    // Station validations
    for (const station of model.stations) {
      const ct = station.cycleTime;
      if (ct?.type === 'constant' && ct.parameters?.value === 0) {
        issues.push({
          severity: 'error',
          code: 'STATION_ZERO_CT',
          message: `"${station.name}" has zero cycle time`,
          nodeId: station.id,
        });
      }

      if ((station.scrapRate ?? 0) < 0 || (station.scrapRate ?? 0) > 1) {
        issues.push({
          severity: 'error',
          code: 'STATION_SCRAP_RANGE',
          message: `"${station.name}" scrap rate outside [0, 1]`,
          nodeId: station.id,
        });
      }

      if (station.mtbf && !station.mttr) {
        issues.push({
          severity: 'warning',
          code: 'STATION_MTBF_NO_MTTR',
          message: `"${station.name}" has MTBF but no MTTR — failures won't be repaired`,
          nodeId: station.id,
        });
      }

      // Check if station is connected
      const isSource = connectedSources.has(station.id);
      const isTarget = connectedTargets.has(station.id);
      const inRouting = model.products.some((p) => p.routing?.includes(station.id));
      if (!isSource && !isTarget && !inRouting) {
        issues.push({
          severity: 'warning',
          code: 'STATION_ORPHAN',
          message: `"${station.name}" has no connections and is not in any routing`,
          nodeId: station.id,
        });
      }
    }

    // Buffer validations
    for (const buffer of model.buffers) {
      if (buffer.capacity <= 0) {
        issues.push({
          severity: 'error',
          code: 'BUFFER_CAPACITY',
          message: `"${buffer.name}" has non-positive capacity`,
          nodeId: buffer.id,
        });
      }

      const isConnected = connectedSources.has(buffer.id) || connectedTargets.has(buffer.id);
      if (!isConnected) {
        issues.push({
          severity: 'warning',
          code: 'BUFFER_ORPHAN',
          message: `"${buffer.name}" has no connections`,
          nodeId: buffer.id,
        });
      }
    }

    // Product validations
    for (const product of model.products) {
      if (!product.routing || product.routing.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'PRODUCT_NO_ROUTING',
          message: `Product "${product.name}" has no routing defined`,
        });
      }

      const stationIds = new Set(model.stations.map((s) => s.id));
      for (const sid of product.routing || []) {
        if (!stationIds.has(sid)) {
          issues.push({
            severity: 'error',
            code: 'PRODUCT_BAD_STATION',
            message: `Product "${product.name}" references unknown station "${sid}"`,
          });
        }
      }
    }

    // A warehouse runs on its own (distribution centre): no products/stations needed
    const hasWarehouse = model.extraNodes.some((e) => e.type === 'warehouse' || e.type === 'coldstorage');

    // No products defined
    if (model.products.length === 0 && !hasWarehouse) {
      issues.push({
        severity: 'warning',
        code: 'NO_PRODUCTS',
        message: 'No products defined — simulation needs at least one product with a routing',
      });
    }

    // No stations defined
    if (model.stations.length === 0 && !hasWarehouse) {
      issues.push({
        severity: 'info',
        code: 'NO_STATIONS',
        message: 'Add stations to the canvas to build your factory model',
      });
    }

    return issues;
  }, [
    model.stations,
    model.buffers,
    model.connections,
    model.products,
  ]);
}
