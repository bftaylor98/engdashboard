export interface WorkOrder {
  id: string;
  woNumber: string;
  priority: number;
  isHotJob: boolean;
  dueDate: string | null;
  partNumber: string;
  revAlert: string | null;
  partName: string;
  project: string | null;
  qn: string | null;
  customer: string;
  estProgrammingHours: number | null;
  estEngineeringHours: number | null;
  price: number | null;
  materialStatus: 'not-ordered' | 'ordered' | 'arrived';
  notes: string | null;
  workOrderNotes: string | null;
  comments: string[];
  currentBox: string | null;
  machineScheduled: string | null;
  currentStatus: 'engineering' | 'engineering-completed' | 'programming' | 'programming-completed' | 'hold' | 'completed';
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string | true;
  message?: string;
  reason?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string | null;
}

export interface TimeTrackingEntry {
  id: string;
  category: string;
  categoryCode: string;
  workOrderNumber: string | null;
  operationNumber: string | null;
  workCell: string | null;
  timeIn: string | null;
  timeOut: string | null;
  percentLaborTime: number | null;
  percentResourceTime: number | null;
  pauseTime: number;
  laborTime: number | null;
  spentDoing: string | null;
  status: string | null;
}

export interface TimeTrackingUser {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  entries: TimeTrackingEntry[];
  totalEntries: number;
  totalLaborTime: number;
  error?: string;
}

export interface TimeTrackingData {
  date: string;
  endDate?: string;
  users: TimeTrackingUser[];
}

export interface TimeTrackingUserStats {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  uniqueWorkOrdersThisYear: number;
  uniqueWorkOrdersThisQuarter: number;
  uniqueWorkOrdersThisMonth: number;
  uniqueWorkOrdersThisWeek: number;
  hoursThisWeek: number;
  totalHoursYTD: number;
  averageWeeklyHoursYTD: number;
  error?: string;
}

export interface TimeTrackingStatsData {
  users: TimeTrackingUserStats[];
}

export interface DashboardStats {
  total: number;
  overdue: number;
  dueThisWeek: number;
  hotJobs: number;
  completed: number;
  inProgress: number;
  assigned: number;
  totalProgrammingHours: number;
  totalEngineeringHours: number;
  materialNotOrdered: number;
}

export interface WorkloadEntry {
  assignee: string;
  jobCount: number;
  programmingHours: number;
  engineeringHours: number;
  overdueCount: number;
}

export interface AssigneeStats {
  assignee: string;
  total: number;
  engineering?: number;
  'engineering-completed'?: number;
  programming?: number;
  'programming-completed'?: number;
  hold?: number;
}

export interface RevisionAlert {
  id: number;
  partNumber: string;
  partName: string | null;
  revisionDate: string | null;
  linkedWorkOrders: { id: string; woNumber: string; partName: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionMetric {
  id: number;
  boxName: string;
  percentageOfJobs: number | null;
  jobsToGo: number | null;
  jobsScheduled: number | null;
  totalJobs: number | null;
  assigneeCounts: Record<string, number>;
  snapshotDate: string;
  createdAt: string;
}

export interface ImportSheetPreview {
  headerRow: number;
  headers: string[];
  mappings: ColumnMapping[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export interface ImportPreview {
  filename: string;
  filePath: string;
  sheets: Record<string, ImportSheetPreview>;
}

export interface ColumnMapping {
  index: number;
  original: string;
  normalized: string;
  dbColumn: string | null;
  mapped: boolean;
}

export interface ImportReport {
  schedule: { imported: number; updated?: number; skipped: number; errors: { wo: string; error: string }[] };
  revisions: { imported: number };
  construction: { imported: number };
}

export type WorkOrderFilters = {
  search?: string;
  priority?: number | '';
  customer?: string;
  currentBox?: string;
  currentStatus?: string;
  materialStatus?: string;
  isHotJob?: boolean | '';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number | 'all';
};

export const ASSIGNEES = ['Brad', 'Alex', 'Damien', 'Rob', 'Thad'] as const;

/** Side project (admin-managed, assigned to a user; e.g. "buy a tool") */
export interface SideProject {
  id: number;
  title: string;
  description: string | null;
  assignee: string;
  status: 'active' | 'done';
  createdAt: string;
  updatedAt: string;
  /** When the project was assigned to the current assignee (ISO string) */
  assignedAt: string;
  /** Optional due date (YYYY-MM-DD) */
  dueDate: string | null;
}

export const CUSTOMERS = ['EST', 'SSP', 'PFI', 'ICI', 'AICHI', 'MERITOR', 'AAM'] as const;

export const STATUS_OPTIONS = [
  { value: 'engineering', label: 'Engineering' },
  { value: 'engineering-completed', label: 'Eng. Comp.' },
  { value: 'programming', label: 'Programming' },
  { value: 'programming-completed', label: 'Prog. Comp.' },
  { value: 'hold', label: 'Hold' },
  { value: 'completed', label: 'Completed' },
] as const;

export const MATERIAL_OPTIONS = [
  { value: 'not-ordered', label: 'Not Ordered' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'arrived', label: 'Arrived' },
] as const;

export const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-zinc-600',
  1: 'bg-red-600',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-blue-500',
  5: 'bg-indigo-500',
  6: 'bg-purple-500',
  7: 'bg-pink-500',
  8: 'bg-green-500',
  9: 'bg-teal-500',
  10: 'bg-cyan-500',
  11: 'bg-orange-600',
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
  5: 'P5',
  6: 'P6',
  7: 'P7',
  8: 'P8',
  9: 'P9',
  10: 'P10',
  11: 'Hot',
};

export interface Version {
  id: number;
  versionNumber: number;
  name: string;
  description: string | null;
  snapshotPath: string;
  customerAbbPath: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  recordCount: number | null;
  fileSize: number | null;
}

export interface ComponentInfo {
  cid: string;
  objId?: number;
  description?: string;
  partNo?: string;
  unitPrice?: number;
  stockQty: number;
  circulationQty: number;
  minStock?: number;
  maxStock?: number;
  storageLocation?: string;
}

export interface TypeBreakdown {
  Inserts: { totalExpense: number; poCount: number };
  'Zoller Replenishment': { totalExpense: number; poCount: number };
  Regrinds: { totalExpense: number; poCount: number };
  General: { totalExpense: number; poCount: number };
}

export interface TypeVerification {
  hasPO: boolean;
  firstPODate: string | null;
  poCount: number;
}

export interface ToolingExpenses {
  totalExpense: number;
  month: string; // e.g., "February 2026"
  poCount: number;
  typeBreakdown: TypeBreakdown;
  budget: {
    monthlyBudget: number;
    remaining: number;
    usedPercent: number; // 0-100
    daysRemaining: number;
  };
  rolling30Days: {
    totalExpense: number;
    poCount: number;
    typeBreakdown: TypeBreakdown;
  };
  lastMonth: {
    totalExpense: number;
    month: string; // e.g., "January 2026"
    poCount: number;
    typeBreakdown: TypeBreakdown;
  };
  sixMonthHistory: Array<{
    month: string;
    totalExpense: number;
    poCount: number;
    monthIndex: number; // 0 = current month, 1 = last month, etc.
    typeBreakdown: TypeBreakdown;
  }>;
  sixMonthAverage: number;
  verification: {
    Inserts: TypeVerification;
    'Zoller Replenishment': TypeVerification;
    Regrinds: TypeVerification;
  };
  currency?: string; // Default: "USD"
}

export interface PurchaseOrderLineItem {
  id?: string;
  description?: string;
  quantity?: string | number;
  unitPrice?: number;
  totalPrice?: number;
  partNumber?: string;
  itemNumber?: string;
  orderNumber?: string;
  statusStatus?: string | null;
  statusQty?: number | null;
  statusDate?: string | null;
  releasedQty?: string | number | null;
  releasedDate?: string | null;
  releasedBy?: string | null;
  receivedQty?: number | null;
  receivedDate?: string | null;
}

export interface OpenPurchaseOrder {
  id: string;
  poNumber: string;
  cost: number;
  date: string;
  orderStatus: string;
  poType: string;
  supplier: string; // Kept for backend compatibility, but not displayed in UI
  lineItems?: PurchaseOrderLineItem[] | null; // May be null if not available through API
}

// Matrix Stock Report Types
export interface MonthlyUsageData {
  month: string; // e.g., "Jan. 25'"
  monthSort: string; // e.g., "2025-01"
  qty: number;
}

export interface MatrixStockItem {
  itemDescription: string;
  itemCode: string;
  itemKey: number;
  stockQty: number;
  minQty: number;
  maxQty: number;
  shortage: number;
  isBelowMinimum: boolean;
  itemPrice: number;
  costToReplenish: number;
  monthlyData: MonthlyUsageData[];
  avgMonthlyUse: number;
  maxUsage: number;
}

export interface MatrixStockSummary {
  totalItems: number;
  totalBelowMinimum: number;
  totalShortage: number;
  totalCost: number;
}

export interface MatrixStockData {
  items: MatrixStockItem[];
  summary: MatrixStockSummary;
  generatedAt: string;
}

// Proshop Material Tracking (live from Proshop API)
export interface ProshopStockDetail {
  material: string | null;
  materialGrade: string | null;
  stockType: string | null;
  poNumber: string | null;
  dueAtDock: string | null;
  eta: string | null;
  actualArrived: string | null;
  receivedDate: string | null;
  receivedQty: number | null;
  quantityOrdered: number | null;
  sizeOrdered: string | null;
  supplier: string | null;
  dimensions: string | null;
}

export interface ProshopBomLine {
  poNumber: string;
  description: string | null;
  partNumber: string | null;
  orderNumber: string | null;
}

export interface ProshopBomDetails {
  poNumbers: string[];
  lines: ProshopBomLine[];
}

export interface ProshopMaterialStatus {
  workOrderNumber: string;
  status: string | null;
  dueDate: string | null;
  partNumber: string | null;
  customer: string | null;
  partstockNote: string | null;
  materialStatus: 'not-ordered' | 'requested' | 'ordered' | 'arrived' | 'unknown' | 'not-applicable';
  stockDetails: ProshopStockDetail[];
  bomOrdered?: boolean;
  bomArrived?: boolean;
  bomDetails?: ProshopBomDetails;
}

// NCR (Non-Conformance Report) from ProShop
export interface NCR {
  ncrRefNumber: string | null;
  createdTime: string | null;
  assignedToPlainText: string | null;
  notes: string | null;
  status: string | null;
  workOrderNumber: string | null;
  partNumber: string | null;
}

export interface NCRByAssigneeStats {
  year: number;
  quarter: number;
  month: number;
  week: number;
  monthlyAvg: number;
  weeklyAvg: number;
}

export interface NCRByAssigneeData {
  byAssignee: Record<string, NCRByAssigneeStats>;
  allNcrsByAssignee: Record<string, NCR[]>;
}

// Knowledge Base
export interface KbCategory {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  children?: KbCategory[];
}

export type KbArticleStatus = 'draft' | 'reviewed' | 'standard';

export interface KbArticleAttachment {
  name: string;
  path?: string;
  url?: string;
}

export interface KbArticle {
  id: number;
  title: string;
  slug: string;
  categoryId: number;
  categoryName: string | null;
  tags: string[];
  summary: string | null;
  body: string;
  status: KbArticleStatus;
  ownerUserId: string;
  ownerDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  reviewDueAt: string | null;
  viewsCount: number;
  helpfulYes: number;
  helpfulNo: number;
  attachments: KbArticleAttachment[];
  relatedArticleIds: number[];
  pinned: boolean;
}

export interface KbComment {
  id: number;
  articleId: number;
  userId: string;
  userDisplayName: string | null;
  type: 'comment' | 'edit_suggestion';
  body: string;
  createdAt: string;
}

export interface KbRevision {
  id: number;
  articleId: number;
  userId: string;
  userDisplayName: string | null;
  snapshot: string;
  createdAt: string;
  note: string | null;
}

export interface KbListParams {
  q?: string;
  categoryId?: number | string;
  tags?: string;
  status?: KbArticleStatus | string;
  ownerUserId?: string;
  order?: 'recent' | 'views' | 'helpful';
  limit?: number;
  offset?: number;
}

export interface KbListResponse {
  success: boolean;
  data: KbArticle[];
  pagination: { limit: number; offset: number; total: number };
}

export interface KbFeaturedResponse {
  success: true;
  data: { pinned: KbArticle[]; faq: KbArticle[] };
}

/** TV dashboard layout: one entry per widget placement on the grid */
export interface TvWidgetLayoutItem {
  widgetId: string;
  gridCol: number;
  gridRow: number;
  gridColSpan: number;
  gridRowSpan: number;
}

/** TV dashboard config (active widgets + grid positions) */
export interface TvConfig {
  activeWidgetIds: string[];
  layout: TvWidgetLayoutItem[];
}

