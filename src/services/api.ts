import type {
  WorkOrder,
  PaginatedResponse,
  ApiResponse,
  CalendarEvent,
  DashboardStats,
  WorkloadEntry,
  AssigneeStats,
  RevisionAlert,
  ConstructionMetric,
  ImportPreview,
  ImportReport,
  WorkOrderFilters,
  Version,
  ComponentInfo,
  ToolingExpenses,
  OpenPurchaseOrder,
  MatrixStockData,
  TimeTrackingData,
  TimeTrackingStatsData,
  ProshopMaterialStatus,
  NCR,
  NCRByAssigneeData,
  SideProject,
  KbCategory,
  KbArticle,
  KbComment,
  KbRevision,
  KbListParams,
  KbListResponse,
  KbFeaturedResponse,
  KbArticleAttachment,
  TvConfig,
} from '@/types';

const BASE_URL = '/api';
const TOKEN_KEY = 'auth_token';
const DEFAULT_TIMEOUT_MS = 25000;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function isDebugApi(): boolean {
  try {
    return localStorage.getItem('debugApi') === 'true' || !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  } catch {
    return false;
  }
}

type FetchJSONOptions = RequestInit & { timeoutMs?: number };

async function fetchJSON<T>(url: string, options?: FetchJSONOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _tm, ...requestInit } = options ?? {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = requestInit.signal ?? controller.signal;
  const debug = isDebugApi();
  const pathForLog = url.split('?')[0] || url;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: authHeaders(),
      ...requestInit,
      signal: requestSignal,
    });
    clearTimeout(timeoutId);
    const duration = Date.now() - start;

    if (debug) {
      console.log(`[api] ${pathForLog} ${res.status} ${duration}ms`);
    }

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      const message = (body && typeof body === 'object' && 'error' in body && body.error) || `Request failed: ${res.status}`;
      const e = new Error(typeof message === 'string' ? message : String(message)) as Error & { status?: number; body?: unknown };
      e.status = res.status;
      e.body = body;
      if (debug) console.log(`[api] ${pathForLog} error ${duration}ms`, e.message);
      throw e;
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    const duration = Date.now() - start;
    if (err instanceof Error && err.name === 'AbortError') {
      const message = debug
        ? `Request timed out: ${requestInit?.method ?? 'GET'} ${pathForLog}. Check that the server is running and reachable.`
        : 'Request timed out. Check that the server is running and reachable.';
      if (debug) console.log(`[api] ${pathForLog} timeout ${duration}ms`);
      throw new Error(message);
    }
    if (debug) console.log(`[api] ${pathForLog} error ${duration}ms`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** Type guard: error from fetchJSON when backend returned 503 with PROSHOP_RATE_LIMIT */
export function isProshopRateLimitError(err: unknown): err is Error & { status: number; body?: { code?: string } } {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { status?: number; body?: { code?: string } };
  return e.status === 503 || e.body?.code === 'PROSHOP_RATE_LIMIT';
}

/** ProShop 200 + error payload when rate limited (no cache). */
export interface ProshopUnavailableResponse {
  error: true;
  reason: 'rate_limited';
  message: string;
}

/** Type guard: backend returned 200 with { error: true, reason: 'rate_limited' } */
export function isProshopUnavailableResponse(res: unknown): res is ProshopUnavailableResponse {
  return (
    typeof res === 'object' &&
    res !== null &&
    (res as { error?: boolean }).error === true &&
    (res as { reason?: string }).reason === 'rate_limited'
  );
}

// --- Work Orders ---

export async function getWorkOrders(filters: WorkOrderFilters = {}): Promise<PaginatedResponse<WorkOrder>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) {
      params.set(key, String(value));
    }
  }
  return fetchJSON(`${BASE_URL}/work-orders?${params}`);
}

export async function getWorkOrder(id: string): Promise<ApiResponse<WorkOrder>> {
  return fetchJSON(`${BASE_URL}/work-orders/${id}`);
}

export async function createWorkOrder(data: Partial<WorkOrder>): Promise<ApiResponse<WorkOrder>> {
  return fetchJSON(`${BASE_URL}/work-orders`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkOrder(id: string, data: Partial<WorkOrder>): Promise<ApiResponse<WorkOrder>> {
  return fetchJSON(`${BASE_URL}/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Calendar (Google Calendar iCal feed) ---

export interface CalendarEventsResponse {
  success: boolean;
  data: CalendarEvent[];
  error?: string;
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({ start, end });
  return fetchJSON(`${BASE_URL}/calendar/events?${params}`);
}

export async function deleteWorkOrder(id: string): Promise<ApiResponse<void>> {
  return fetchJSON(`${BASE_URL}/work-orders/${id}`, {
    method: 'DELETE',
  });
}

// --- Stats ---

export async function getDashboardStats(assignee?: string): Promise<ApiResponse<DashboardStats>> {
  const params = new URLSearchParams();
  if (assignee) {
    params.set('assignee', assignee);
  }
  const queryString = params.toString();
  return fetchJSON(`${BASE_URL}/stats/dashboard${queryString ? `?${queryString}` : ''}`);
}

export async function getWorkloadStats(): Promise<ApiResponse<WorkloadEntry[]>> {
  return fetchJSON(`${BASE_URL}/stats/workload`);
}

export async function getAssigneeStats(): Promise<ApiResponse<AssigneeStats[]>> {
  return fetchJSON(`${BASE_URL}/stats/assignees`);
}

// --- Revision Alerts ---

export async function getRevisionAlerts(): Promise<ApiResponse<RevisionAlert[]>> {
  return fetchJSON(`${BASE_URL}/revision-alerts`);
}

// --- Construction Metrics ---

export async function getConstructionMetrics(): Promise<ApiResponse<ConstructionMetric[]>> {
  return fetchJSON(`${BASE_URL}/construction-metrics`);
}

// --- Import ---

export async function uploadFile(file: File): Promise<ApiResponse<ImportPreview>> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/import/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function confirmImport(filePath: string, mode: 'replace' | 'append' = 'replace'): Promise<ApiResponse<ImportReport>> {
  return fetchJSON(`${BASE_URL}/import/confirm`, {
    method: 'POST',
    body: JSON.stringify({ filePath, mode }),
  });
}

export async function importFromProshop(): Promise<ApiResponse<ImportReport>> {
  return fetchJSON(`${BASE_URL}/proshop/import-work-orders`, {
    method: 'POST',
  });
}

export async function debugProshopWorkOrders(): Promise<ApiResponse<any>> {
  return fetchJSON(`${BASE_URL}/proshop/debug-work-orders`);
}

export function getProshopWorkOrdersCsvUrl(): string {
  const token = getToken();
  const base = `${BASE_URL}/proshop/export-work-orders-csv`;
  return token ? `${base}?token=${token}` : base;
}

export async function testProshopQuery(fields: string[]): Promise<ApiResponse<any>> {
  const fieldsParam = fields.join(',');
  return fetchJSON(`${BASE_URL}/proshop/test-query?fields=${encodeURIComponent(fieldsParam)}`);
}

export interface CostAnalysisData {
  woNumber: string;
  materialCost: number | null;
  quotedPrice: number | null;
  costWithoutMaterial: number | null;
  pricePerHour: number | null;
  estimatedTotalMinutes: number | null;
  estimatedHours: number | null;
  partNumber: string | null;
  partName: string | null;
  customer: string | null;
}

/** Cost-analysis can take 60s+ when Proshop returns many ops pages and POs. */
const COST_ANALYSIS_TIMEOUT_MS = 120 * 1000;
const TIME_TRACKING_RANGE_TIMEOUT_MS = 90 * 1000;

export async function getCostAnalysis(woNumber: string): Promise<ApiResponse<CostAnalysisData>> {
  const params = new URLSearchParams({ woNumber: woNumber.trim() });
  return fetchJSON<ApiResponse<CostAnalysisData>>(`${BASE_URL}/proshop/cost-analysis?${params}`, {
    timeoutMs: COST_ANALYSIS_TIMEOUT_MS,
  });
}

// --- NCR (Non-Conformance Reports) ---

const NCR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const recentNcrsCache: Record<number, { data: NCR[]; timestamp: number }> = {};
let last24hNcrsCache: { data: NCR[]; timestamp: number } | null = null;
let byAssigneeNcrCache: { data: NCRByAssigneeData; timestamp: number } | null = null;

export function getCachedNcrsRecent(limit = 10): NCR[] | null {
  const entry = recentNcrsCache[limit];
  if (!entry?.data) return null;
  if (Date.now() - entry.timestamp > NCR_CACHE_TTL) return null;
  return entry.data;
}

export function getCachedNcrsLast24h(): NCR[] | null {
  if (!last24hNcrsCache?.data) return null;
  if (Date.now() - last24hNcrsCache.timestamp > NCR_CACHE_TTL) return null;
  return last24hNcrsCache.data;
}

export function getCachedNcrsByAssignee(): NCRByAssigneeData | null {
  if (!byAssigneeNcrCache?.data) return null;
  if (Date.now() - byAssigneeNcrCache.timestamp > NCR_CACHE_TTL) return null;
  return byAssigneeNcrCache.data;
}

export async function getNcrsRecent(limit = 10): Promise<ApiResponse<NCR[]>> {
  const params = new URLSearchParams();
  params.set('_', String(Date.now()));
  if (limit !== 10) params.set('limit', String(limit));
  const result = await fetchJSON<ApiResponse<NCR[]>>(`${BASE_URL}/proshop/ncrs/recent?${params}`);
  if (result.success && result.data) {
    recentNcrsCache[limit] = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

export async function getNcrsLast24h(): Promise<ApiResponse<NCR[]>> {
  const result = await fetchJSON<ApiResponse<NCR[]>>(`${BASE_URL}/proshop/ncrs/last24h?_=${Date.now()}`);
  if (result.success && result.data) {
    last24hNcrsCache = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

export async function getNcrsByAssignee(): Promise<ApiResponse<NCRByAssigneeData>> {
  const result = await fetchJSON<ApiResponse<NCRByAssigneeData>>(
    `${BASE_URL}/proshop/ncrs/by-assignee?_=${Date.now()}`
  );
  if (result.success && result.data) {
    byAssigneeNcrCache = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

// --- Time Tracking ---

const TT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const timeTrackingCache: Record<string, { data: TimeTrackingData; timestamp: number }> = {};
let timeTrackingLatestDateCache: { data: { date: string }; timestamp: number } | null = null;
let timeTrackingStatsCache: { data: TimeTrackingStatsData; timestamp: number } | null = null;

export function getCachedTimeTracking(date?: string, userId?: string): TimeTrackingData | null {
  const key = `${date ?? ''}:${userId ?? 'all'}`;
  const entry = timeTrackingCache[key];
  if (!entry?.data) return null;
  if (Date.now() - entry.timestamp > TT_CACHE_TTL) return null;
  return entry.data;
}

export function getCachedTimeTrackingLatestDate(): { date: string } | null {
  if (!timeTrackingLatestDateCache?.data) return null;
  if (Date.now() - timeTrackingLatestDateCache.timestamp > TT_CACHE_TTL) return null;
  return timeTrackingLatestDateCache.data;
}

export function getCachedTimeTrackingStats(): TimeTrackingStatsData | null {
  if (!timeTrackingStatsCache?.data) return null;
  if (Date.now() - timeTrackingStatsCache.timestamp > TT_CACHE_TTL) return null;
  return timeTrackingStatsCache.data;
}

export async function getTimeTracking(date?: string, userId?: string): Promise<ApiResponse<TimeTrackingData>> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (userId) params.set('userId', userId);
  const qs = params.toString();
  const result = await fetchJSON<ApiResponse<TimeTrackingData>>(
    `${BASE_URL}/proshop/time-tracking${qs ? `?${qs}` : ''}`
  );
  if (result.success && result.data) {
    const key = `${date ?? ''}:${userId ?? 'all'}`;
    timeTrackingCache[key] = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

export async function getTimeTrackingRange(
  startDate: string,
  endDate: string,
  userId?: string
): Promise<ApiResponse<TimeTrackingData>> {
  const params = new URLSearchParams();
  params.set('startDate', startDate);
  params.set('endDate', endDate);
  if (userId) params.set('userId', userId);
  const result = await fetchJSON<ApiResponse<TimeTrackingData>>(
    `${BASE_URL}/proshop/time-tracking?${params.toString()}`,
    { timeoutMs: TIME_TRACKING_RANGE_TIMEOUT_MS }
  );
  return result;
}

export async function getTimeTrackingLatestDate(): Promise<ApiResponse<{ date: string }>> {
  const result = await fetchJSON<ApiResponse<{ date: string }>>(
    `${BASE_URL}/proshop/time-tracking/latest-date`
  );
  if (result.success && result.data) {
    timeTrackingLatestDateCache = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

export async function getTimeTrackingStats(): Promise<ApiResponse<TimeTrackingStatsData>> {
  const result = await fetchJSON<ApiResponse<TimeTrackingStatsData>>(
    `${BASE_URL}/proshop/time-tracking/stats`
  );
  if (result.success && result.data) {
    timeTrackingStatsCache = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

// --- Export ---

export function getExportUrl(format: 'xlsx' | 'csv'): string {
  const token = getToken();
  const base = `${BASE_URL}/export/${format}`;
  return token ? `${base}?token=${token}` : base;
}

// --- Health ---

export async function getHealth(): Promise<{ status: string; timestamp: string; workOrderCount: number }> {
  return fetchJSON(`${BASE_URL}/health`);
}

// --- TV Config (GET is public for TV page; PUT requires auth + admin) ---

export async function getTvConfig(): Promise<ApiResponse<TvConfig>> {
  return fetchJSON(`${BASE_URL}/tv/config`);
}

export async function saveTvConfig(config: TvConfig): Promise<ApiResponse<TvConfig>> {
  return fetchJSON(`${BASE_URL}/tv/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// --- Versions ---

export async function createVersion(name: string, description?: string): Promise<ApiResponse<Version>> {
  return fetchJSON(`${BASE_URL}/versions`, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function getVersions(): Promise<ApiResponse<Version[]>> {
  return fetchJSON(`${BASE_URL}/versions`);
}

export async function getVersion(versionNumber: number): Promise<ApiResponse<Version>> {
  return fetchJSON(`${BASE_URL}/versions/${versionNumber}`);
}

export async function restoreVersion(versionNumber: number): Promise<ApiResponse<{ message: string; warning?: string }>> {
  return fetchJSON(`${BASE_URL}/versions/${versionNumber}/restore`, {
    method: 'POST',
  });
}

export async function deleteVersion(versionNumber: number): Promise<ApiResponse<{ message: string }>> {
  return fetchJSON(`${BASE_URL}/versions/${versionNumber}`, {
    method: 'DELETE',
  });
}

// --- User Preferences ---

export interface UserPreferences {
  theme?: 'light' | 'dark';
  [key: string]: unknown;
}

export async function getUserPreferences(): Promise<ApiResponse<UserPreferences>> {
  return fetchJSON(`${BASE_URL}/auth/preferences`);
}

export async function updateUserPreferences(preferences: UserPreferences): Promise<ApiResponse<UserPreferences>> {
  return fetchJSON(`${BASE_URL}/auth/preferences`, {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  });
}

// --- Side Projects (admin list/create/update/delete; everyone can get "mine") ---

export async function getProjects(): Promise<ApiResponse<SideProject[]>> {
  return fetchJSON(`${BASE_URL}/projects`);
}

export async function getMyProjects(): Promise<ApiResponse<SideProject[]>> {
  return fetchJSON(`${BASE_URL}/projects/mine`);
}

export async function createProject(data: { title: string; description?: string; assignee: string; dueDate?: string }): Promise<ApiResponse<SideProject>> {
  return fetchJSON(`${BASE_URL}/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: number,
  data: { title?: string; description?: string; assignee?: string; status?: 'active' | 'done'; dueDate?: string | null }
): Promise<ApiResponse<SideProject>> {
  return fetchJSON(`${BASE_URL}/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: number): Promise<ApiResponse<void>> {
  return fetchJSON(`${BASE_URL}/projects/${id}`, {
    method: 'DELETE',
  });
}

// --- C-ID Lookup ---

// FastAPI server base URL - can be configured via environment variable
// Default to production server, fallback to localhost for development
const CID_API_BASE_URL = (import.meta as any).env?.VITE_CID_API_URL || 'http://192.168.1.193:5055';

/**
 * Normalizes C-ID format. If input is just a number (e.g., "214"), adds "C-" prefix.
 * If it already starts with "C-", returns as-is.
 */
function normalizeCID(cid: string): string {
  const trimmed = cid.trim();
  // If it's just a number, prepend "C-"
  if (/^\d+$/.test(trimmed)) {
    return `C-${trimmed}`;
  }
  return trimmed;
}

/**
 * Lookup component information by C-ID from the ZOLLER database.
 * 
 * @param cid - Component ID (e.g., "C-214" or "214")
 * @returns ComponentInfo with component details
 * @throws Error if C-ID format is invalid, component not found, or server error
 */
export async function lookupCID(cid: string): Promise<ComponentInfo> {
  // Normalize C-ID format
  const normalizedCID = normalizeCID(cid);
  
  // Validate format
  if (!normalizedCID.startsWith('C-')) {
    throw new Error('Invalid C-ID format. Must start with "C-" or be a number.');
  }
  
  // Encode C-ID for URL
  const encodedCID = encodeURIComponent(normalizedCID);
  
  try {
    const response = await fetch(`${CID_API_BASE_URL}/cid/${encodedCID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`C-ID "${normalizedCID}" not found in database.`);
      } else if (response.status === 400) {
        const errorData = await response.json().catch(() => ({ detail: 'Invalid C-ID format' }));
        throw new Error(errorData.detail || 'Invalid C-ID format.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }
    
    const data = await response.json();
    return data as ComponentInfo;
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw known errors
      throw error;
    }
    // Network or other errors
    throw new Error('Server offline or network error. Please check if the C-ID lookup server is running.');
  }
}

/**
 * Search components by description (partial match, case-insensitive).
 * 
 * @param description - Search term to match against component descriptions
 * @returns Array of ComponentInfo objects matching the description
 * @throws Error if search term is empty, server error, or network error
 */
export async function searchByDescription(description: string): Promise<ComponentInfo[]> {
  const trimmed = description.trim();
  
  // Validate search term
  if (!trimmed) {
    throw new Error('Please enter a search term.');
  }
  
  // Encode description for URL
  const encodedDescription = encodeURIComponent(trimmed);
  
  try {
    const response = await fetch(`${CID_API_BASE_URL}/search/description/${encodedDescription}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({ detail: 'Invalid search term' }));
        throw new Error(errorData.detail || 'Invalid search term.');
      } else if (response.status === 404) {
        throw new Error('Description search endpoint not found. The FastAPI server may need to be restarted to load the new endpoint.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }
    
    const data = await response.json();
    return data as ComponentInfo[];
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw known errors
      throw error;
    }
    // Network or other errors
    throw new Error('Server offline or network error. Please check if the C-ID lookup server is running.');
  }
}

// --- Tooling Expenses ---

const TOOLING_EXPENSES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let toolingExpensesCache: { data: ToolingExpenses; timestamp: number } | null = null;

/** Return cached tooling expenses if still valid (for stale-while-revalidate in Analytics). */
export function getCachedToolingExpenses(): ToolingExpenses | null {
  if (!toolingExpensesCache?.data) return null;
  if (Date.now() - toolingExpensesCache.timestamp > TOOLING_EXPENSES_CACHE_TTL) return null;
  return toolingExpensesCache.data;
}

/**
 * Get tooling expenses for current month from Proshop API.
 * Returns total expense for Rocket Supply vendor POs in the current month.
 *
 * @returns ToolingExpenses with total expense, month, and PO count
 * @throws Error if API request fails or server error
 */
export async function getToolingExpenses(): Promise<ApiResponse<ToolingExpenses>> {
  try {
    const response = await fetch(`${BASE_URL}/proshop/tooling-expenses`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      if (response.status === 500) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || 'Failed to fetch tooling expenses from Proshop API.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }

    const result = await response.json();
    if (result.success && result.data) {
      toolingExpensesCache = { data: result.data, timestamp: Date.now() };
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Server offline or network error. Please check if the server is running.');
  }
}

// --- Open Purchase Orders ---

const OPEN_POS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let openPOsCache: { data: OpenPurchaseOrder[]; timestamp: number } | null = null;

/** Return cached open POs if still valid (for stale-while-revalidate in Analytics). */
export function getCachedOpenPurchaseOrders(): OpenPurchaseOrder[] | null {
  if (!openPOsCache?.data) return null;
  if (Date.now() - openPOsCache.timestamp > OPEN_POS_CACHE_TTL) return null;
  return openPOsCache.data;
}

/**
 * Get open purchase orders for Rocket Supply vendor.
 * Returns POs with status "Outstanding" or "Partially Released".
 *
 * @returns Array of OpenPurchaseOrder objects
 * @throws Error if API request fails or server error
 */
export async function getOpenPurchaseOrders(): Promise<ApiResponse<OpenPurchaseOrder[]>> {
  try {
    const response = await fetch(`${BASE_URL}/proshop/open-pos`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      if (response.status === 500) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || 'Failed to fetch open purchase orders from Proshop API.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }

    const result = await response.json();
    if (result.success && result.data) {
      openPOsCache = { data: result.data, timestamp: Date.now() };
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Server offline or network error. Please check if the server is running.');
  }
}

// --- Machines (VMC queues) ---

export interface MachineWorkOrder {
  workOrderNumber: string;
  partNumber: string;
  customer: string;
  dueDate: string | null;
  scheduledOps: unknown[];
  totalEstimatedHours: number;
}

export type MachinesData = Record<string, MachineWorkOrder[]>;

export type MachinesApiResponse =
  | { success: true; data: MachinesData | null; lastUpdated?: string }
  | { error: true; reason: 'rate_limited'; message: string };

/**
 * Get VMC work queue data (VMX 84-1, VMX 64-1, VMX 64-2). Cache-only; never calls ProShop from route.
 */
export async function getMachinesData(): Promise<MachinesApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}/machines`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      if (response.status === 500) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || 'Failed to fetch machines data.');
      }
      throw new Error(`Server error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Server offline or network error. Please check if the server is running.');
  }
}

// --- Stock Grid ---

/**
 * Get Matrix stock report data from EST100 database.
 * Returns table with items, stock levels, and 3-year usage data for charts.
 * 
 * @returns MatrixStockData with items, summary, and monthly usage data
 * @throws Error if API request fails or server error
 */
export async function getStockGrid(): Promise<ApiResponse<MatrixStockData>> {
  try {
    const response = await fetch(`${BASE_URL}/stock-grid`, {
      method: 'GET',
      headers: authHeaders(),
    });
    
    if (!response.ok) {
      if (response.status === 500) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || 'Failed to fetch stock grid data from EST100 database.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw known errors
      throw error;
    }
    // Network or other errors
    throw new Error('Server offline or network error. Please check if the server is running.');
  }
}

// --- Proshop Material Status ---

const MATERIAL_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const materialStatusCache: Record<string, { data: ProshopMaterialStatus[]; timestamp: number }> = {};

export function getCachedProshopMaterialStatus(woNumbers?: string): ProshopMaterialStatus[] | null {
  const key = woNumbers ?? 'default';
  const entry = materialStatusCache[key];
  if (!entry?.data) return null;
  if (Date.now() - entry.timestamp > MATERIAL_STATUS_CACHE_TTL) return null;
  return entry.data;
}

/**
 * Get material status for scheduled work orders from Proshop ERP.
 * Combines local schedule WO numbers with Proshop work orders (partStockStatuses)
 * and purchase order line items (Due at Dock, received date).
 *
 * @param woNumbers - Optional comma-separated WO numbers; if omitted, uses all non-completed WOs from DB
 * @returns ProshopMaterialStatus[] with materialStatus and stockDetails per WO
 */
export async function getProshopMaterialStatus(
  woNumbers?: string
): Promise<ApiResponse<ProshopMaterialStatus[]>> {
  const params = new URLSearchParams();
  if (woNumbers) params.set('woNumbers', woNumbers);
  const qs = params.toString();
  const result = await fetchJSON<ApiResponse<ProshopMaterialStatus[]>>(
    `${BASE_URL}/proshop/material-status${qs ? `?${qs}` : ''}`
  );
  if (result.success && result.data) {
    const key = woNumbers ?? 'default';
    materialStatusCache[key] = { data: result.data, timestamp: Date.now() };
  }
  return result;
}

// --- Knowledge Base ---

export async function getKbCategories(): Promise<ApiResponse<KbCategory[]>> {
  return fetchJSON(`${BASE_URL}/knowledge/categories`);
}

export async function getKbArticles(params: KbListParams = {}): Promise<KbListResponse> {
  const searchParams = new URLSearchParams();
  if (params.q != null && params.q !== '') searchParams.set('q', String(params.q));
  if (params.categoryId != null && params.categoryId !== '') searchParams.set('categoryId', String(params.categoryId));
  if (params.tags != null && params.tags !== '') searchParams.set('tags', String(params.tags));
  if (params.status != null && params.status !== '') searchParams.set('status', String(params.status));
  if (params.ownerUserId != null && params.ownerUserId !== '') searchParams.set('ownerUserId', String(params.ownerUserId));
  if (params.order != null) searchParams.set('order', String(params.order));
  if (params.limit != null) searchParams.set('limit', String(params.limit));
  if (params.offset != null) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  return fetchJSON(`${BASE_URL}/knowledge${qs ? `?${qs}` : ''}`);
}

export async function getKbArticleBySlug(slug: string): Promise<ApiResponse<KbArticle>> {
  return fetchJSON(`${BASE_URL}/knowledge/by-slug/${encodeURIComponent(slug)}`);
}

export async function getKbRecent(limit = 10): Promise<ApiResponse<KbArticle[]>> {
  return fetchJSON(`${BASE_URL}/knowledge/recent?limit=${limit}`);
}

export async function getKbFeatured(): Promise<KbFeaturedResponse> {
  return fetchJSON(`${BASE_URL}/knowledge/featured`);
}

export async function createKbArticle(data: {
  title: string;
  categoryId: number;
  tags?: string[] | string;
  summary?: string;
  body?: string;
  status?: 'draft' | 'reviewed' | 'standard';
}): Promise<ApiResponse<KbArticle>> {
  return fetchJSON(`${BASE_URL}/knowledge`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateKbArticle(
  id: number,
  data: {
    title?: string;
    categoryId?: number;
    tags?: string[] | string;
    summary?: string;
    body?: string;
    status?: 'draft' | 'reviewed' | 'standard';
    reviewDueAt?: string | null;
  }
): Promise<ApiResponse<KbArticle>> {
  return fetchJSON(`${BASE_URL}/knowledge/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteKbArticle(id: number): Promise<ApiResponse<void>> {
  return fetchJSON(`${BASE_URL}/knowledge/${id}`, { method: 'DELETE' });
}

export async function postKbHelpful(id: number, helpful: boolean): Promise<ApiResponse<{ helpfulYes: number; helpfulNo: number }>> {
  return fetchJSON(`${BASE_URL}/knowledge/${id}/helpful`, {
    method: 'POST',
    body: JSON.stringify({ helpful }),
  });
}

export async function getKbComments(articleId: number): Promise<ApiResponse<KbComment[]>> {
  return fetchJSON(`${BASE_URL}/knowledge/${articleId}/comments`);
}

export async function postKbComment(
  articleId: number,
  type: 'comment' | 'edit_suggestion',
  body: string
): Promise<ApiResponse<KbComment>> {
  return fetchJSON(`${BASE_URL}/knowledge/${articleId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ type, body }),
  });
}

export async function getKbRevisions(articleId: number): Promise<ApiResponse<KbRevision[]>> {
  return fetchJSON(`${BASE_URL}/knowledge/${articleId}/revisions`);
}

export async function uploadKbAttachments(articleId: number, files: File[]): Promise<ApiResponse<KbArticleAttachment[]>> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/knowledge/${articleId}/attachments`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export function getKbAttachmentUrl(articleId: number, filename: string): string {
  const token = getToken();
  const path = `${BASE_URL}/knowledge/attachments/${articleId}/${encodeURIComponent(filename)}`;
  return token ? `${path}?token=${token}` : path;
}
