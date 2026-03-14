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
};
