import type { DashboardWidgetType } from '../../types';

export interface WidgetRegistryEntry {
  label: string;
  description: string;
  defaultSize: 'sm' | 'md' | 'lg' | 'full';
  icon: string; // SVG path
}

export const widgetRegistry: Record<DashboardWidgetType, WidgetRegistryEntry> = {
  'oee-summary': {
    label: 'OEE Summary',
    description: 'Overall Equipment Effectiveness stat card',
    defaultSize: 'sm',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  'throughput-summary': {
    label: 'Throughput Summary',
    description: 'Total throughput stat card',
    defaultSize: 'sm',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  'cycle-time-summary': {
    label: 'Cycle Time Summary',
    description: 'Average cycle time stat card',
    defaultSize: 'sm',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  'wip-summary': {
    label: 'WIP Summary',
    description: 'Work-in-progress level stat card',
    defaultSize: 'sm',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  'quality-summary': {
    label: 'Quality / Scrap',
    description: 'Quality rate and scrap count stat card',
    defaultSize: 'sm',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  'oee-chart': {
    label: 'OEE Chart',
    description: 'Bar chart showing Availability, Performance, Quality breakdown',
    defaultSize: 'lg',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  'throughput-chart': {
    label: 'Throughput Chart',
    description: 'Hourly throughput bar chart',
    defaultSize: 'lg',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  'bottleneck-heatmap': {
    label: 'Bottleneck Heatmap',
    description: 'Station utilization heatmap with bottleneck detection',
    defaultSize: 'full',
    icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
  },
  'station-table': {
    label: 'Station Table',
    description: 'Detailed station performance table',
    defaultSize: 'full',
    icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  },
  'utilization-chart': {
    label: 'Utilization Chart',
    description: 'Horizontal bar chart of station busy/idle/blocked/failed breakdown',
    defaultSize: 'full',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  },
  'wip-trend-chart': {
    label: 'WIP Trend Chart',
    description: 'Line chart of WIP levels over time',
    defaultSize: 'lg',
    icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16',
  },
  'quality-chart': {
    label: 'Quality / Scrap Chart',
    description: 'Horizontal bar chart showing per-station quality vs scrap rates',
    defaultSize: 'lg',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  'gantt-schedule': {
    label: 'Schedule Gantt',
    description: 'Gantt-style timeline with swimlanes per station, job tracking, and playhead animation',
    defaultSize: 'full',
    icon: 'M3 6h18M3 12h12M3 18h18M8 6v12',
  },
  'sankey-flow': {
    label: 'Material Flow Sankey',
    description: 'Sankey diagram showing material flow from sources through stations and buffers to sinks',
    defaultSize: 'full',
    icon: 'M4 4v16h16M4 12h4l3-6 4 10 3-4h2',
  },
  'cycle-time-pareto': {
    label: 'Cycle Time Pareto',
    description: 'Stations ranked by processing time contribution with cumulative % line and 80% threshold',
    defaultSize: 'lg',
    icon: 'M3 3v18h18M7 17V9m4 8V5m4 12v-5m4 5v-3',
  },
  'throughput-waterfall': {
    label: 'Throughput Waterfall',
    description: 'OEE waterfall: Theoretical Max → Availability/Performance/Quality losses → Actual Output',
    defaultSize: 'lg',
    icon: 'M3 3v18h18M7 8v9m4-6v6m4-4v4m4-9v9',
  },
  'buffer-sparklines': {
    label: 'Buffer Sparklines',
    description: 'Compact grid of buffer fill-level sparklines over time',
    defaultSize: 'full',
    icon: 'M4 4v16h16M4 12h4l3-6 4 10 3-4h2',
  },
  'cost-summary': {
    label: 'Cost Summary',
    description: 'Cost breakdown by station with operating, variable, and scrap costs',
    defaultSize: 'lg',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  'energy-chart': {
    label: 'Energy Consumption',
    description: 'Energy usage (kWh) per station with cost and CO2 summary',
    defaultSize: 'lg',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  'maintenance-chart': {
    label: 'Maintenance Overview',
    description: 'Planned vs unplanned downtime by station',
    defaultSize: 'lg',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  },
  'value-stream-map': {
    label: 'Value Stream Map',
    description: 'VSM diagram showing process flow, cycle times, WIP inventory, and lead time breakdown',
    defaultSize: 'full',
    icon: 'M4 4v16h16M4 12h4l3-6 4 10 3-4h2',
  },
  'experiment-results': {
    label: 'Experiment Results',
    description: 'Parameter sweep / optimization / replication results with best configuration',
    defaultSize: 'full',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 2h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 8.172V3L8 2z',
  },
};
