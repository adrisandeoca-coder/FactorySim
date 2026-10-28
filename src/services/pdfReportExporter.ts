/**
 * PDF report exporter — generates a comprehensive print-optimized HTML document.
 * Reuses section renderers from reportExporter for consistency, with print-specific CSS.
 */
import type { SimulationResult, FactoryModel } from '../types';
import { generateHTMLReport } from './reportExporter';

/**
 * Wrap the standard HTML report with print-optimized CSS overrides.
 */
function wrapForPrint(html: string): string {
  const printCSS = `
    <style>
      /* Print overrides */
      @page { size: A4; margin: 15mm 12mm; }
      @media print {
        body { font-size: 10px !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
        .report-header { margin: -15mm -12mm 20px -12mm !important; padding: 18px 24px !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .report-header h1 { font-size: 18px !important; }
        h2 { font-size: 12px !important; margin-top: 18px !important; break-after: avoid; }
        h3 { font-size: 11px !important; break-after: avoid; }
        table { font-size: 9px !important; break-inside: avoid; }
        th, td { padding: 4px 6px !important; }
        .kpi-grid { gap: 8px !important; }
        .kpi-card { padding: 8px !important; }
        .kpi-val { font-size: 16px !important; }
        .kpi-lbl { font-size: 8px !important; }
        .config-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .config-card { font-size: 9px !important; }
        .rec-list li { font-size: 10px !important; break-inside: avoid; }
        .hour-chart { height: 50px !important; }
        .sparkline { height: 30px !important; }
        .wf-row { margin: 2px 0 !important; }
        .wf-track { height: 18px !important; }
        .wf-bar { font-size: 8px !important; }
        .footer { font-size: 8px !important; }

        /* Ensure backgrounds print */
        .kpi-card.hl, .kpi-card.warn, .rec-list li, .stacked-bar > div,
        .bar-fill, .cost-stacked > div, .hour-bar, .spark-bar, .wf-bar,
        .legend-dot, .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  `;

  // Inject print CSS before </head>
  return html.replace('</head>', printCSS + '</head>');
}

/**
 * Export as PDF by opening a print dialog on a styled HTML document.
 */
export async function downloadPDFReport(result: SimulationResult, model: FactoryModel): Promise<void> {
  const baseHtml = generateHTMLReport(result, model.name || 'Factory', model);
  const html = wrapForPrint(baseHtml);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not access iframe document');
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  await new Promise(resolve => setTimeout(resolve, 500));
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 2000);
}
