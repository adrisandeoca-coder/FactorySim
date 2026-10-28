/** Default configuration of a new Warehouse element (see engine/warehouse.py). */
export type Dist = { type: string; parameters: Record<string, number> };
export type Sku = {
  id: string; name: string; productId?: string; class?: string;
  unitsPerPallet?: number; initialPallets?: number; reorderPoint?: number;
  orderQuantity?: number; leadTime?: Dist; demandShare?: number;
};

export const WAREHOUSE_DEFAULTS = {
  layout: { aisles: 4, baysPerAisle: 10, levels: 4, palletsPerBay: 2, bayWidth: 2.7, levelHeight: 1.5, aisleWidth: 3.5, rackDepth: 1.1, frontClearance: 4 },
  slotting: 'closest',
  /** 'racks' = selective racking with forklifts; 'asrs' = high-bay with one stacker crane per aisle. */
  storageType: 'racks' as 'racks' | 'asrs',
  /** maxPerAisle: forklifts allowed in one aisle at a time (0 = no limit). */
  forklifts: { count: 2, speed: 2.0, liftSpeed: 0.4, handlingTime: 15, maxPerAisle: 1 },
  cranes: { speed: 3.0, liftSpeed: 1.0, handlingTime: 10, conveyorSpeed: 0.5 },
  /** Shifts/breaks use HH:MM clock times; empty shifts = pickers always available. */
  pickers: { count: 3, walkSpeed: 1.0, timePerLine: 10, timePerUnit: 2, setupTime: 30,
    shifts: [] as { start: string; end: string }[], breaks: [] as { start: string; minutes: number }[] },
  inbound: { enabled: false, interarrival: ({ type: 'exponential', parameters: { mean: 3600 } } as Dist), palletsPerTruck: ({ type: 'constant', parameters: { value: 20 } } as Dist), doors: 2, unloadTimePerPallet: ({ type: 'constant', parameters: { value: 60 } } as Dist) },
  orders: { enabled: false, interarrival: ({ type: 'exponential', parameters: { mean: 300 } } as Dist), linesPerOrder: ({ type: 'triangular', parameters: { min: 1, mode: 3, max: 8 } } as Dist), unitsPerLine: ({ type: 'triangular', parameters: { min: 1, mode: 2, max: 6 } } as Dist), packStations: 1, packTime: ({ type: 'constant', parameters: { value: 120 } } as Dist), departureInterval: 0 },
  outbound: { loadTimePerOrder: ({ type: 'constant', parameters: { value: 20 } } as Dist) },
  crossDock: false,
  lineSupply: { callOffShare: 0.2 },
  store: { dwellTime: ({ type: 'constant', parameters: { value: 0 } } as Dist) },
  skus: [] as Sku[],
};

