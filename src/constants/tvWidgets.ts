import type { TvConfig } from '@/types';

export interface TvWidgetMeta {
  id: string;
  name: string;
  description: string;
}

/** All available TV widgets (registry for config UI and TV renderer) */
export const TV_WIDGETS: TvWidgetMeta[] = [
  { id: 'clock', name: 'Clock (Eastern)', description: 'Eastern time, 12-hour format' },
  { id: 'work-orders', name: 'Work Orders', description: 'Count of active work orders (excl. hold)' },
  { id: 'on-hold', name: 'On Hold', description: 'Count of work orders on hold' },
  { id: 'material-arrived', name: 'Material Arrived', description: 'Count where material has arrived' },
  { id: 'tooling-cost', name: 'Tooling Cost', description: 'Current month tooling spend' },
  { id: 'status-breakdown', name: 'Status Breakdown', description: 'Bar chart by status' },
  { id: 'workload-distribution', name: 'Workload Distribution', description: 'Jobs and hours by assignee' },
  { id: 'calendar-this-week', name: 'Calendar This Week', description: 'Events this week' },
  { id: 'hot-jobs', name: 'Hot Jobs', description: 'List of hot jobs with due dates' },
  { id: 'weather-footer', name: 'Weather & Last Updated', description: 'Brodhead weather and data timestamp' },
  { id: 'basketball-score', name: 'Scores', description: 'Live Kentucky vs LSU score (ESPN)' },
];

/** Default config matching current TV layout (16×8 grid for finer resizing) */
export const DEFAULT_TV_CONFIG: TvConfig = {
  activeWidgetIds: TV_WIDGETS.map((w) => w.id),
  layout: [
    { widgetId: 'clock', gridCol: 2, gridRow: 2, gridColSpan: 4, gridRowSpan: 2 },
    { widgetId: 'work-orders', gridCol: 6, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'on-hold', gridCol: 8, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'material-arrived', gridCol: 10, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'tooling-cost', gridCol: 12, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'basketball-score', gridCol: 14, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'status-breakdown', gridCol: 2, gridRow: 4, gridColSpan: 8, gridRowSpan: 2 },
    { widgetId: 'workload-distribution', gridCol: 10, gridRow: 4, gridColSpan: 6, gridRowSpan: 2 },
    { widgetId: 'calendar-this-week', gridCol: 2, gridRow: 6, gridColSpan: 8, gridRowSpan: 2 },
    { widgetId: 'hot-jobs', gridCol: 10, gridRow: 6, gridColSpan: 6, gridRowSpan: 2 },
    { widgetId: 'weather-footer', gridCol: 2, gridRow: 8, gridColSpan: 14, gridRowSpan: 1 },
  ],
};

/** Grid size: more columns/rows = smaller cells = finer resize steps */
export const TV_GRID_COLS = 16;
export const TV_GRID_ROWS = 8;
