import html2canvas from 'html2canvas';

/**
 * Capture a DOM element as a PNG image and trigger download.
 */
export async function captureScreenshot(
  element: HTMLElement,
  filename: string = 'screenshot.png'
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2, // retina quality
    useCORS: true,
    logging: false,
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Capture a DOM element and return a base64 PNG string (no download).
 * Pass backgroundColor to override (null = use element's own background).
 */
export async function captureToBase64(
  element: HTMLElement,
  backgroundColor: string | null = '#ffffff',
): Promise<string> {
  const canvas = await html2canvas(element, {
    backgroundColor,
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/png');
}

/**
 * Download simulation event logs as a JSON file.
 */
export function downloadEventLog(
  events: Array<Record<string, unknown>>,
  filename: string = 'simulation-log.json'
): void {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Convert simulation events to a CSV string with flattened detail columns.
 */
export function eventsToCSV(events: Array<Record<string, unknown>>): string {
  if (events.length === 0) return '';

  // Collect all unique detail keys across events for flat columns
  const detailKeys = new Set<string>();
  for (const event of events) {
    if (event.details && typeof event.details === 'object') {
      Object.keys(event.details as object).forEach(k => detailKeys.add(k));
    }
  }
  const sortedDetailKeys = Array.from(detailKeys).sort();

  const header = ['time', 'type', 'entityId', ...sortedDetailKeys];
  const rows: string[] = [header.join(',')];

  for (const event of events) {
    const details = (event.details && typeof event.details === 'object')
      ? event.details as Record<string, unknown>
      : {};

    const detailValues = sortedDetailKeys.map(key => {
      const val = details[key];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });

    rows.push([
      event.time ?? '',
      `"${event.type ?? ''}"`,
      `"${event.entity_id ?? event.entityId ?? ''}"`,
      ...detailValues,
    ].join(','));
  }

  return rows.join('\n');
}

/**
 * Download simulation event logs as a CSV file with flattened detail columns.
 */
export function downloadEventLogCSV(
  events: Array<Record<string, unknown>>,
  filename: string = 'simulation-log.csv'
): void {
  const csv = eventsToCSV(events);
  if (!csv) return;

  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Export KPI data as CSV for external analysis.
 */
export function downloadKPICSV(kpis: any, stations: any[], filename?: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const fname = filename || `kpi-export-${ts}.csv`;

  const rows: string[] = [];

  // Summary
  rows.push('Section,Metric,Value');
  rows.push(`Summary,Overall OEE,${(kpis.oee.overall * 100).toFixed(1)}%`);
  rows.push(`Summary,Availability,${(kpis.oee.availability * 100).toFixed(1)}%`);
  rows.push(`Summary,Performance,${(kpis.oee.performance * 100).toFixed(1)}%`);
  rows.push(`Summary,Quality,${(kpis.oee.quality * 100).toFixed(1)}%`);
  rows.push(`Summary,Total Throughput,${kpis.throughput.total}`);
  rows.push(`Summary,Throughput/hr,${kpis.throughput.ratePerHour?.toFixed(1) || ''}`);
  rows.push(`Summary,Avg Cycle Time (s),${kpis.cycleTime.mean.toFixed(1)}`);
  rows.push(`Summary,Total WIP,${kpis.wip.total}`);
  rows.push('');

  // Station-level
  rows.push('Station,Utilization,Availability,Performance,Quality,OEE');
  for (const station of stations) {
    const sk = kpis.oee.byStation[station.id] || {};
    const util = kpis.utilization.byStation[station.id]?.busy ?? 0;
    rows.push([
      `"${station.name}"`,
      (util * 100).toFixed(1) + '%',
      ((sk.availability || 0) * 100).toFixed(1) + '%',
      ((sk.performance || 0) * 100).toFixed(1) + '%',
      ((sk.quality || 0) * 100).toFixed(1) + '%',
      ((sk.oee || 0) * 100).toFixed(1) + '%',
    ].join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.download = fname;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
