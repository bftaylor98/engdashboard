import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, BarChart3, Clock, TrendingUp, RefreshCw, AlertCircle, ChevronDown, ChevronRight, ArrowUpDown, Grid3x3, Package } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { getDashboardStats, getWorkOrders, getConstructionMetrics, getToolingExpenses, getOpenPurchaseOrders, getStockGrid, getCachedToolingExpenses, getCachedOpenPurchaseOrders, isProshopUnavailableResponse } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import type { DashboardStats, WorkOrder, ConstructionMetric, ToolingExpenses, OpenPurchaseOrder, MatrixStockData } from '@/types';
import { cn } from '@/lib/utils';
import { ASSIGNEES, STATUS_OPTIONS, PRIORITY_LABELS } from '@/types';

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [construction, setConstruction] = useState<ConstructionMetric[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Tooling Expenses state
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesData, setExpensesData] = useState<ToolingExpenses | null>(null);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0); // 0 = current month

  // Open Purchase Orders state
  const [openPOsLoading, setOpenPOsLoading] = useState(false);
  const [openPOs, setOpenPOs] = useState<OpenPurchaseOrder[]>([]);
  const [openPOsError, setOpenPOsError] = useState<string | null>(null);
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'poNumber' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isOpenPOSectionCollapsed, setIsOpenPOSectionCollapsed] = useState(true);

  // Matrix Stock Report state
  const [stockGridLoading, setStockGridLoading] = useState(false);
  const [stockGridData, setStockGridData] = useState<MatrixStockData | null>(null);
  const [stockGridError, setStockGridError] = useState<string | null>(null);
  const [isStockGridCollapsed, setIsStockGridCollapsed] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const refreshData = useCallback(async () => {
    try {
      const [statsRes, ordersRes, constRes] = await Promise.all([
        getDashboardStats(),
        getWorkOrders({ limit: 'all', currentStatus: '!completed' }),
        getConstructionMetrics(),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (ordersRes.success) setOrders(ordersRes.data);
      if (constRes.success) setConstruction(constRes.data);
    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Silently refresh when server pushes work-order or import events
  useSSE(useCallback(() => { refreshData(); }, [refreshData]));

  const RETRY_DELAY_MS = 2500;
  const MAX_ATTEMPTS = 3;

  // Load tooling expenses on mount and when refresh is clicked (stale-while-revalidate from client cache, with retries)
  const loadToolingExpenses = useCallback(async () => {
    const cached = getCachedToolingExpenses();
    const hasCache = cached != null;
    if (hasCache) setExpensesData(cached);
    if (!hasCache) setExpensesLoading(true);
    setExpensesError(null);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await getToolingExpenses();
        if (isProshopUnavailableResponse(response)) {
          setExpensesError(response.message);
          setExpensesLoading(false);
          return;
        }
        if (!response.success && response.warming) {
          setExpensesError('Tooling data is still loading — refresh in a moment.');
          setExpensesLoading(false);
          return;
        }
        if (response.success && response.data) {
          setExpensesData(response.data);
          setExpensesLoading(false);
          return;
        }
        throw new Error(response.error || 'Failed to load tooling expenses');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load tooling expenses');
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === MAX_ATTEMPTS) {
          setExpensesLoading(false);
        }
      }
    }
    const errorMessage = lastError?.message ?? 'Failed to load tooling expenses.';
    setExpensesError(errorMessage);
    setExpensesData(null);
    toast.error(errorMessage);
  }, []);

  useEffect(() => {
    loadToolingExpenses();
  }, [loadToolingExpenses]);

  // Load open purchase orders (stale-while-revalidate from client cache, with retries)
  const loadOpenPOs = useCallback(async () => {
    const cached = getCachedOpenPurchaseOrders();
    const hasCache = cached != null;
    if (hasCache) setOpenPOs(cached);
    if (!hasCache) setOpenPOsLoading(true);
    setOpenPOsError(null);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await getOpenPurchaseOrders();
        if (isProshopUnavailableResponse(response)) {
          setOpenPOsError(response.message);
          setOpenPOsLoading(false);
          return;
        }
        if (response.success && response.data) {
          setOpenPOs(response.data);
          setOpenPOsLoading(false);
          return;
        }
        throw new Error(response.error || 'Failed to load open purchase orders');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load open purchase orders');
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === MAX_ATTEMPTS) {
          setOpenPOsLoading(false);
        }
      }
    }
    const errorMessage = lastError?.message ?? 'Failed to load open purchase orders.';
    setOpenPOsError(errorMessage);
    setOpenPOs([]);
    toast.error(errorMessage);
  }, []);

  useEffect(() => {
    loadOpenPOs();
  }, [loadOpenPOs]);

  // Load stock grid data
  const loadStockGrid = useCallback(async () => {
    setStockGridLoading(true);
    setStockGridError(null);

    try {
      const response = await getStockGrid();
      if (response.success && response.data) {
        setStockGridData(response.data);
      } else {
        throw new Error(response.error || 'Failed to load stock grid data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load stock grid data.';
      setStockGridError(errorMessage);
      setStockGridData(null);
      toast.error(errorMessage);
    } finally {
      setStockGridLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStockGrid();
  }, [loadStockGrid]);

  // Toggle PO expansion
  const togglePOExpansion = (poId: string) => {
    setExpandedPOs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(poId)) {
        newSet.delete(poId);
      } else {
        newSet.add(poId);
      }
      return newSet;
    });
  };

  // Sort POs
  const sortedPOs = [...openPOs].sort((a, b) => {
    let comparison = 0;
    
    if (sortField === 'poNumber') {
      // Sort by PO number (numeric comparison)
      const numA = parseInt(a.poNumber) || 0;
      const numB = parseInt(b.poNumber) || 0;
      comparison = numA - numB;
    } else if (sortField === 'date') {
      // Sort by date
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      comparison = dateA.getTime() - dateB.getTime();
    }
    
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Handle sort field change
  const handleSortChange = (field: 'poNumber' | 'date') => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Calculate overdue and due this week work orders (must be before early return)
  const overdueOrders = useMemo(() => {
    try {
      const now = new Date();
      return orders.filter(o => {
        if (!o.dueDate) return false;
        try {
          const dueDate = new Date(o.dueDate);
          if (isNaN(dueDate.getTime())) return false;
          return dueDate < now && o.currentStatus !== 'engineering-completed' && o.currentStatus !== 'programming-completed' && o.currentStatus !== 'completed';
        } catch {
          return false;
        }
      });
    } catch (err) {
      console.error('Error calculating overdue orders:', err);
      return [];
    }
  }, [orders]);

  const dueThisWeekOrders = useMemo(() => {
    try {
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return orders.filter(o => {
        if (!o.dueDate) return false;
        try {
          const dueDate = new Date(o.dueDate);
          if (isNaN(dueDate.getTime())) return false;
          return dueDate >= now && dueDate <= weekEnd && o.currentStatus !== 'engineering-completed' && o.currentStatus !== 'programming-completed' && o.currentStatus !== 'completed';
        } catch {
          return false;
        }
      });
    } catch (err) {
      console.error('Error calculating due this week orders:', err);
      return [];
    }
  }, [orders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  // Compute analytics from real data
  const assigneeWorkload = ASSIGNEES.map(name => {
    const items = orders.filter(o => o.currentBox === name);
    const progHours = items.reduce((s, o) => s + (o.estProgrammingHours || 0), 0);
    const engHours = items.reduce((s, o) => s + (o.estEngineeringHours || 0), 0);
    const overdue = items.filter(o => {
      if (!o.dueDate) return false;
      return new Date(o.dueDate) < new Date() && o.currentStatus !== 'engineering-completed' && o.currentStatus !== 'programming-completed';
    }).length;
    return { name, count: items.length, progHours, engHours, overdue };
  }).filter(a => a.count > 0).sort((a, b) => b.count - a.count);

  const statusBreakdown = STATUS_OPTIONS.filter(s => s.value !== 'completed').map(s => ({
    ...s,
    count: orders.filter(o => o.currentStatus === s.value).length,
  }));

  const customerBreakdown = Array.from(
    orders.reduce((acc, o) => {
      const c = o.customer || 'Unknown';
      acc.set(c, (acc.get(c) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const priorityBreakdown = Array.from({ length: 12 }, (_, i) => ({
    priority: i,
    label: PRIORITY_LABELS[i],
    count: orders.filter(o => o.priority === i).length,
  })).filter(p => p.count > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Workload Analytics</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">All metrics computed from live database</p>
      </div>

      {/* Summary row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MiniStat label="Total Orders" value={stats.total} />
          <MiniStat 
            label="Overdue" 
            value={stats.overdue} 
            color="text-red-400" 
            workOrders={overdueOrders}
          />
          <MiniStat 
            label="Due This Week" 
            value={stats.dueThisWeek} 
            color="text-yellow-400" 
            workOrders={dueThisWeekOrders}
          />
          <MiniStat label="Completion Rate" value={`${stats.total ? Math.round((stats.completed / stats.total) * 100) : 0}%`} color="text-green-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assignee Workload */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" /> Workload by Assignee
          </h2>
          {assigneeWorkload.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">No assignee data available</p>
          ) : (
            <div className="space-y-3">
              {assigneeWorkload.map(a => {
                const maxCount = Math.max(...assigneeWorkload.map(x => x.count));
                return (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[var(--text-primary)] font-medium">{a.name}</span>
                      <span className="text-[var(--text-secondary)] text-xs">
                        {a.count} items · {a.progHours.toFixed(1)}h prog · {a.engHours.toFixed(1)}h eng
                        {a.overdue > 0 && <span className="text-red-400 ml-1">({a.overdue} overdue)</span>}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full transition-all"
                        style={{ width: `${(a.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status Breakdown */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" /> Status Breakdown
          </h2>
          <div className="space-y-2">
            {statusBreakdown.map(s => {
              const pct = orders.length ? Math.round((s.count / orders.length) * 100) : 0;
              return (
                <div key={s.value} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)] w-24 text-right">{s.label}</span>
                  <div className="flex-1 h-6 bg-[var(--bg-elevated)] rounded-lg overflow-hidden relative">
                    <div
                      className={cn('h-full rounded-lg transition-all', statusBarColor(s.value))}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/80">
                      {s.count} ({pct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Customer Breakdown */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" /> By Customer
          </h2>
          {customerBreakdown.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">No customer data available</p>
          ) : (
            <div className="space-y-2">
              {customerBreakdown.slice(0, 10).map(c => {
                const maxCount = customerBreakdown[0].count;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-secondary)] w-24 text-right truncate">{c.name}</span>
                    <div className="flex-1 h-5 bg-[var(--bg-elevated)] rounded overflow-hidden relative">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded transition-all" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/80">{c.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Priority Breakdown */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" /> Priority Distribution
          </h2>
          <div className="space-y-2">
            {priorityBreakdown.map(p => {
              const maxCount = Math.max(...priorityBreakdown.map(x => x.count));
              return (
                <div key={p.priority} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)] w-24 text-right">{p.label}</span>
                  <div className="flex-1 h-5 bg-[var(--bg-elevated)] rounded overflow-hidden relative">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded transition-all" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/80">{p.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Construction Metrics */}
      {construction.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Construction Metrics</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-secondary)] text-left border-b border-[var(--border-subtle)]">
                  <th className="pb-2 font-medium">Box Name</th>
                  <th className="pb-2 font-medium text-right">Total Jobs</th>
                  <th className="pb-2 font-medium text-right">Jobs Scheduled</th>
                  <th className="pb-2 font-medium text-right">Jobs To Go</th>
                  <th className="pb-2 font-medium text-right">% of Jobs</th>
                  <th className="pb-2 font-medium">Snapshot Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {construction.map(c => (
                  <tr key={c.id} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-2 text-[var(--text-primary)] font-medium">{c.boxName}</td>
                    <td className="py-2 text-[var(--text-primary)] text-right">{c.totalJobs ?? '—'}</td>
                    <td className="py-2 text-[var(--text-primary)] text-right">{c.jobsScheduled ?? '—'}</td>
                    <td className="py-2 text-[var(--text-primary)] text-right">{c.jobsToGo ?? '—'}</td>
                    <td className="py-2 text-[var(--text-primary)] text-right">{c.percentageOfJobs != null ? `${c.percentageOfJobs}%` : '—'}</td>
                    <td className="py-2 text-[var(--text-secondary)]">{c.snapshotDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tooling Expenses Widget */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Tooling Expenses
          </h2>
          <button
            onClick={loadToolingExpenses}
            disabled={expensesLoading}
            className={cn(
              'p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Refresh expenses"
          >
            <RefreshCw className={cn('w-4 h-4', expensesLoading && 'animate-spin')} />
          </button>
        </div>

        {expensesLoading && !expensesData && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {expensesError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-400 font-medium">Error loading expenses</p>
              <p className="text-xs text-red-400/80 mt-1">{expensesError}</p>
            </div>
          </div>
        )}

        {expensesData && !expensesLoading && (
          <div className="space-y-6">
            {/* Month Selector and 6-Month Average */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Month Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-[var(--text-secondary)]">View Month:</label>
                <select
                  value={selectedMonthIndex}
                  onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                  className="select px-3 py-1.5 text-sm"
                >
                  {expensesData.sixMonthHistory.map((month, idx) => (
                    <option key={idx} value={idx}>
                      {month.month} {idx === 0 ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6-Month Average Stat */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-4 py-2">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">6-Month Average</p>
                    <p className="text-xl font-semibold text-cyan-400">
                      ${expensesData.sixMonthAverage.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Focus: Selected Month Spending */}
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  {expensesData.sixMonthHistory[selectedMonthIndex]?.month}
                  {selectedMonthIndex === 0 && ' (Current Month)'}
                </p>
                <p className="text-6xl font-bold text-green-400 mb-2">
                  ${expensesData.sixMonthHistory[selectedMonthIndex]?.totalExpense.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {expensesData.sixMonthHistory[selectedMonthIndex]?.poCount} purchase order
                  {expensesData.sixMonthHistory[selectedMonthIndex]?.poCount !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Type Breakdown */}
              {expensesData.sixMonthHistory[selectedMonthIndex]?.typeBreakdown && (
                <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Cost Breakdown by PO Type</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(expensesData.sixMonthHistory[selectedMonthIndex].typeBreakdown).map(([type, stats]) => (
                      <div key={type} className="bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--border-subtle)]">
                        <p className="text-xs text-[var(--text-secondary)] mb-1">{type}</p>
                        <p className="text-lg font-semibold text-[var(--text-primary)]">
                          ${stats.totalExpense.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {stats.poCount} PO{stats.poCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification Section - Only for current month */}
              {selectedMonthIndex === 0 && expensesData.verification && (
                <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Required PO Type Verification</p>
                  <div className="space-y-2">
                    {Object.entries(expensesData.verification).map(([type, verification]) => (
                      <div
                        key={type}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border',
                          verification.hasPO
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-yellow-500/10 border-yellow-500/30'
                        )}
                      >
                        <span className={cn(
                          'text-lg font-bold',
                          verification.hasPO ? 'text-green-400' : 'text-yellow-400'
                        )}>
                          {verification.hasPO ? '✓' : '✗'}
                        </span>
                        <div className="flex-1">
                          <p className={cn(
                            'text-sm font-medium',
                            verification.hasPO ? 'text-green-300' : 'text-yellow-300'
                          )}>
                            {type}
                          </p>
                          {verification.hasPO ? (
                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                              First PO: {verification.firstPODate || 'N/A'} ({verification.poCount} PO{verification.poCount !== 1 ? 's' : ''} total)
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                              No PO this month
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Budget Information - Only show for current month */}
              {selectedMonthIndex === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[var(--border-subtle)]">
                  {/* Remaining Budget */}
                  <div className="bg-[var(--bg-surface)] rounded-lg p-4 border border-[var(--border-subtle)]">
                    <p className="text-xs text-[var(--text-secondary)] mb-1">Remaining Budget</p>
                    <p className={cn(
                      "text-3xl font-bold mb-1",
                      expensesData.budget.remaining > 5000 
                        ? "text-green-400" 
                        : expensesData.budget.remaining > 0 
                          ? "text-yellow-400" 
                          : "text-red-400"
                    )}>
                      ${expensesData.budget.remaining.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <div className="w-full bg-[var(--bg-elevated)] rounded-full h-2 mt-2">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          expensesData.budget.usedPercent < 50
                            ? "bg-green-500"
                            : expensesData.budget.usedPercent < 80
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${Math.min(100, expensesData.budget.usedPercent)}%` }}
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {expensesData.budget.usedPercent.toFixed(1)}% of ${expensesData.budget.monthlyBudget.toLocaleString('en-US')} budget used
                    </p>
                  </div>

                  {/* Days Remaining */}
                  <div className="bg-[var(--bg-surface)] rounded-lg p-4 border border-[var(--border-subtle)]">
                    <p className="text-xs text-[var(--text-secondary)] mb-1">Days Until Renewal</p>
                    <p className="text-3xl font-bold text-blue-400 mb-1">
                      {expensesData.budget.daysRemaining}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      Budget resets on the 1st
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Stats: Rolling 30 Days and Last Month */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rolling 30 Days */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4">
                <div className="text-center">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Last 30 Days</p>
                  <p className="text-2xl font-semibold text-blue-400 mb-1">
                    ${expensesData.rolling30Days.totalExpense.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {expensesData.rolling30Days.poCount} PO{expensesData.rolling30Days.poCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Last Month */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4">
                <div className="text-center">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Last Month</p>
                  <p className="text-2xl font-semibold text-purple-400 mb-1">
                    ${expensesData.lastMonth.totalExpense.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mb-1">{expensesData.lastMonth.month}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {expensesData.lastMonth.poCount} PO{expensesData.lastMonth.poCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Vendor Info */}
            <div className="flex items-center justify-center text-xs text-[var(--text-muted)]">
              <span>Vendor: Rocket Supply</span>
            </div>
          </div>
        )}

        {!expensesData && !expensesLoading && !expensesError && (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No expense data available</p>
          </div>
        )}
      </div>

      {/* Open Purchase Orders Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsOpenPOSectionCollapsed(!isOpenPOSectionCollapsed)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {isOpenPOSectionCollapsed ? (
              <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" />
            )}
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Open Rocket Supply Purchase Orders
            </h2>
          </button>
          <div className="flex items-center gap-2">
            {/* Sort Controls */}
            {openPOs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-elevated)]/50 rounded-lg border border-[var(--border-default)]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-xs text-[var(--text-secondary)]">Sort:</span>
                <button
                  onClick={() => handleSortChange('poNumber')}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    sortField === 'poNumber'
                      ? 'bg-accent/20 text-accent'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  )}
                >
                  PO #
                  {sortField === 'poNumber' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
                <button
                  onClick={() => handleSortChange('date')}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    sortField === 'date'
                      ? 'bg-accent/20 text-accent'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  )}
                >
                  Date
                  {sortField === 'date' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </div>
            )}
            <button
              onClick={loadOpenPOs}
              disabled={openPOsLoading}
              className={cn(
                'p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Refresh purchase orders"
            >
              <RefreshCw className={cn('w-4 h-4', openPOsLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {!isOpenPOSectionCollapsed && (
          <>
            {openPOsLoading && openPOs.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              </div>
            )}

            {openPOsError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-400 font-medium">Error loading purchase orders</p>
                  <p className="text-xs text-red-400/80 mt-1">{openPOsError}</p>
                </div>
              </div>
            )}

            {!openPOsLoading && !openPOsError && (
          <div className="overflow-x-auto">
            {openPOs.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <p className="text-sm">No open purchase orders found</p>
              </div>
            ) : (
              <>
                <div className="mb-3 text-xs text-[var(--text-muted)]">
                  Showing {openPOs.length} open purchase order{openPOs.length !== 1 ? 's' : ''} (Status: Outstanding or Partially Released)
                </div>
                <div className="space-y-2">
                  {sortedPOs.map((po) => {
                    const isExpanded = expandedPOs.has(po.id);
                    return (
                      <div key={po.id} className="border border-[var(--border-default)] rounded-lg overflow-hidden">
                        {/* PO Header Row - Clickable */}
                        <button
                          onClick={() => togglePOExpansion(po.id)}
                          className="w-full bg-[var(--bg-elevated)]/50 p-3 grid grid-cols-6 gap-4 items-center hover:bg-[var(--bg-elevated)]/70 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            )}
                            <div>
                              <span className="text-xs text-[var(--text-muted)]">PO #</span>
                              <a
                                href={`https://est.adionsystems.com/procnc/purchaseorders/${po.poNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--text-primary)] font-medium font-mono hover:text-accent hover:underline transition-colors"
                              >
                                {po.poNumber}
                              </a>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-[var(--text-muted)]">Total Cost</span>
                            <p className="text-[var(--text-primary)] font-medium">
                              ${po.cost.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-[var(--text-muted)]">Order Date</span>
                            <p className="text-[var(--text-secondary)]">{po.date}</p>
                          </div>
                          <div>
                            <span className="text-xs text-[var(--text-muted)]">Status</span>
                            <div>
                              <span
                                className={cn(
                                  'px-2 py-1 rounded text-xs font-medium',
                                  po.orderStatus === 'Outstanding'
                                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                )}
                              >
                                {po.orderStatus}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-[var(--text-muted)]">PO Type</span>
                            <p className="text-[var(--text-secondary)] font-medium">{po.poType}</p>
                          </div>
                          {po.lineItems && po.lineItems.length > 0 && (
                            <div className="text-right">
                              <span className="text-xs text-[var(--text-muted)]">Items</span>
                              <p className="text-[var(--text-secondary)]">{po.lineItems.length}</p>
                            </div>
                          )}
                        </button>
                        
                        {/* Line Items - Collapsible */}
                        {isExpanded && po.lineItems && po.lineItems.length > 0 && (
                          <div className="bg-[var(--bg-surface)]/30 p-3 border-t border-[var(--border-default)]">
                            <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">Line Items ({po.lineItems.length}):</p>
                            <div className="space-y-3">
                              {po.lineItems.map((item, idx) => {
                                // Determine line item status
                                const qtyOrdered = parseFloat(String(item.quantity || 0));
                                const qtyReleased = parseFloat(String(item.releasedQty || 0));
                                const qtyReceived = item.receivedQty || 0;
                                const qtyStatus = item.statusQty || 0;
                                
                                let lineStatus = 'Outstanding';
                                let statusColor = 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
                                
                                if (qtyReceived > 0 && qtyReceived >= qtyOrdered) {
                                  lineStatus = 'Received';
                                  statusColor = 'text-green-400 bg-green-500/20 border-green-500/30';
                                } else if (qtyReleased > 0 && qtyReleased >= qtyOrdered) {
                                  lineStatus = 'Released';
                                  statusColor = 'text-blue-400 bg-blue-500/20 border-blue-500/30';
                                } else if (qtyReleased > 0) {
                                  lineStatus = 'Partially Released';
                                  statusColor = 'text-orange-400 bg-orange-500/20 border-orange-500/30';
                                } else if (item.statusStatus) {
                                  lineStatus = item.statusStatus;
                                  statusColor = 'text-purple-400 bg-purple-500/20 border-purple-500/30';
                                }
                                
                                return (
                                  <div key={idx} className="border border-[var(--border-subtle)] rounded-lg p-3 bg-[var(--bg-elevated)]/30">
                                    <div className="grid grid-cols-6 gap-4 text-sm mb-2">
                                      <div className="col-span-2">
                                        <p className="text-[var(--text-secondary)] font-medium">{item.description}</p>
                                        {item.orderNumber && (
                                          <p className="text-xs text-[var(--text-muted)] mt-1">Order: {item.orderNumber}</p>
                                        )}
                                        {item.itemNumber && (
                                          <p className="text-xs text-[var(--text-muted)]">Item #: {item.itemNumber}</p>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[var(--text-muted)] text-xs">Qty Ordered</span>
                                        <p className="text-[var(--text-secondary)]">{item.quantity}</p>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[var(--text-muted)] text-xs">Unit Price</span>
                                        <p className="text-[var(--text-secondary)]">
                                          ${(item.unitPrice || 0).toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[var(--text-muted)] text-xs">Total</span>
                                        <p className="text-[var(--text-primary)] font-medium">
                                          ${(item.totalPrice || 0).toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Status Information */}
                                    <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={cn('px-2 py-1 rounded text-xs font-medium border', statusColor)}>
                                          {lineStatus}
                                        </span>
                                        {(qtyReleased > 0 || qtyReceived > 0 || qtyStatus > 0) && (
                                          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                                            {qtyReleased > 0 && (
                                              <span>
                                                Released: {qtyReleased}
                                                {item.releasedDate && ` (${item.releasedDate})`}
                                              </span>
                                            )}
                                            {qtyReceived > 0 && (
                                              <span>
                                                Received: {qtyReceived}
                                                {item.receivedDate && ` (${item.receivedDate})`}
                                              </span>
                                            )}
                                            {qtyStatus > 0 && qtyStatus !== qtyReleased && qtyStatus !== qtyReceived && (
                                              <span>
                                                Status Qty: {qtyStatus}
                                                {item.statusDate && ` (${item.statusDate})`}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      {item.releasedBy && (
                                        <p className="text-xs text-[var(--text-muted)]">Released by: {item.releasedBy}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Stock Grid Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsStockGridCollapsed(!isStockGridCollapsed)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {isStockGridCollapsed ? (
              <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" />
            )}
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Package className="w-5 h-5 text-accent" />
              Matrix Stock Report
            </h2>
          </button>
          <button
            onClick={loadStockGrid}
            disabled={stockGridLoading}
            className={cn(
              'p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Refresh stock report"
          >
            <RefreshCw className={cn('w-4 h-4', stockGridLoading && 'animate-spin')} />
          </button>
        </div>

        {!isStockGridCollapsed && (
          <>
            {stockGridLoading && !stockGridData && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              </div>
            )}

            {stockGridError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-400 font-medium">Error loading stock report</p>
                  <p className="text-xs text-red-400/80 mt-1">{stockGridError}</p>
                </div>
              </div>
            )}

            {stockGridData && !stockGridLoading && (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-subtle)] rounded-lg p-3 text-center">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Total Items</p>
                    <p className="text-xl font-semibold text-[var(--text-primary)]">{stockGridData.summary.totalItems}</p>
                  </div>
                  <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-subtle)] rounded-lg p-3 text-center">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Below Minimum</p>
                    <p className="text-xl font-semibold text-red-400">{stockGridData.summary.totalBelowMinimum}</p>
                  </div>
                  <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-subtle)] rounded-lg p-3 text-center">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Total Shortage</p>
                    <p className="text-xl font-semibold text-red-400">{stockGridData.summary.totalShortage.toFixed(0)}</p>
                  </div>
                  <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-subtle)] rounded-lg p-3 text-center">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Cost to Replenish</p>
                    <p className="text-xl font-semibold text-yellow-400">${stockGridData.summary.totalCost.toFixed(2)}</p>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[var(--text-secondary)] text-left border-b border-[var(--border-subtle)]">
                        <th className="pb-2 font-medium w-8"></th>
                        <th className="pb-2 font-medium">Item Description</th>
                        <th className="pb-2 font-medium">Item Code</th>
                        <th className="pb-2 font-medium text-right">Current Stock</th>
                        <th className="pb-2 font-medium text-right">Shortage</th>
                        <th className="pb-2 font-medium text-right">Minimum</th>
                        <th className="pb-2 font-medium text-right">Maximum</th>
                        <th className="pb-2 font-medium text-right">Unit Price</th>
                        <th className="pb-2 font-medium text-right">Cost to Replenish</th>
                        <th className="pb-2 font-medium text-right">Avg Monthly Use</th>
                        <th className="pb-2 font-medium text-right">Max Usage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {stockGridData.items.map((item, idx) => {
                        const isExpanded = expandedRows.has(idx);
                        return (
                          <>
                            <tr
                              key={idx}
                              className={cn(
                                'hover:bg-[var(--bg-elevated)]/50 cursor-pointer',
                                item.isBelowMinimum && 'bg-red-500/10'
                              )}
                              onClick={() => {
                                setExpandedRows((prev) => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(idx)) {
                                    newSet.delete(idx);
                                  } else {
                                    newSet.add(idx);
                                  }
                                  return newSet;
                                });
                              }}
                            >
                              <td className="py-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
                                )}
                              </td>
                              <td className="py-2 text-[var(--text-primary)]">{item.itemDescription}</td>
                              <td className="py-2 text-[var(--text-secondary)] font-mono">{item.itemCode}</td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">{item.stockQty.toFixed(0)}</td>
                              <td className="py-2 text-red-400 text-right font-mono font-bold">
                                {item.shortage > 0 ? item.shortage.toFixed(0) : '-'}
                              </td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">
                                {item.minQty > 0 ? item.minQty.toFixed(0) : '-'}
                              </td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">
                                {item.maxQty > 0 ? item.maxQty.toFixed(0) : '-'}
                              </td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">
                                {item.itemPrice > 0 ? `$${item.itemPrice.toFixed(2)}` : '-'}
                              </td>
                              <td className="py-2 text-yellow-400 text-right font-mono font-bold">
                                {item.costToReplenish > 0 ? `$${item.costToReplenish.toFixed(2)}` : '-'}
                              </td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">{item.avgMonthlyUse}</td>
                              <td className="py-2 text-[var(--text-primary)] text-right font-mono">{item.maxUsage}</td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${idx}-chart`} className="bg-[var(--bg-surface)]/50">
                                <td colSpan={11} className="py-4 px-4">
                                  <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
                                      Monthly Usage - {item.itemDescription}
                                    </h4>
                                    <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={item.monthlyData}>
                                          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                          <XAxis
                                            dataKey="month"
                                            stroke="#71717a"
                                            tick={{ fill: '#71717a', fontSize: 12 }}
                                            angle={-45}
                                            textAnchor="end"
                                            height={80}
                                          />
                                          <YAxis stroke="#71717a" tick={{ fill: '#71717a', fontSize: 12 }} />
                                          <Tooltip
                                            contentStyle={{
                                              backgroundColor: '#27272a',
                                              border: '1px solid #3f3f46',
                                              borderRadius: '6px',
                                            }}
                                            labelStyle={{ color: '#e4e4e7' }}
                                          />
                                          <Legend />
                                          <Line
                                            type="monotone"
                                            dataKey="qty"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ fill: '#3b82f6', r: 3 }}
                                            name="Quantity"
                                          />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Generated At */}
                <div className="text-xs text-[var(--text-muted)] text-center pt-2 border-t border-[var(--border-subtle)]">
                  Generated: {new Date(stockGridData.generatedAt).toLocaleString()}
                </div>
              </div>
            )}

            {!stockGridData && !stockGridLoading && !stockGridError && (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No stock report data available</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ 
  label, 
  value, 
  color, 
  workOrders 
}: { 
  label: string; 
  value: string | number; 
  color?: string;
  workOrders?: WorkOrder[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Position tooltip when it appears - always position below for consistency
  useEffect(() => {
    if (!showTooltip || !tooltipRef.current || !containerRef.current) return;
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (!tooltipRef.current || !containerRef.current) return;
      
      try {
        const containerRect = containerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Always position below the widget for consistency
        let top = containerRect.bottom + 8;
        let left = containerRect.left + (containerRect.width / 2) - (tooltipRect.width / 2);
        
        // If tooltip would go off bottom, position above instead
        if (top + tooltipRect.height > viewportHeight - 8) {
          top = containerRect.top - tooltipRect.height - 8;
          // If it would still go off top, position at top of viewport
          if (top < 8) {
            top = 8;
          }
        }
        
        // Adjust horizontal position if tooltip would go off screen
        if (left < 8) {
          left = 8;
        } else if (left + tooltipRect.width > viewportWidth - 8) {
          left = viewportWidth - tooltipRect.width - 8;
        }
        
        if (tooltipRef.current) {
          tooltipRef.current.style.top = `${top}px`;
          tooltipRef.current.style.left = `${left}px`;
          tooltipRef.current.style.transform = 'none';
        }
      } catch (err) {
        console.error('Error positioning tooltip:', err);
      }
    }, 10);
    
    return () => clearTimeout(timeoutId);
  }, [showTooltip]);

  const handleMouseEnter = useCallback(() => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Set a 1-second delay before hiding
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
      hideTimeoutRef.current = null;
    }, 1000);
  }, []);

  const handleWorkOrderClick = useCallback((wo: WorkOrder) => {
    navigate(`/schedule?wo=${wo.id}`);
  }, [navigate]);

  if (!workOrders || workOrders.length === 0) {
    return (
      <div className="stat-card">
        <p className={cn('text-2xl font-bold', color || 'text-[var(--text-primary)]')}>{value}</p>
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="stat-card relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <p className={cn('text-2xl font-bold', color || 'text-[var(--text-primary)]')}>{value}</p>
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-2xl p-3 min-w-[280px] max-w-[400px] max-h-96 overflow-y-auto"
          style={{ top: 0, left: 0 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide border-b border-[var(--border-default)] pb-2">
            {label} Work Orders
          </p>
          <div className="space-y-1 mt-2">
            {workOrders.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">No work orders found</p>
            ) : (
              workOrders.map((wo) => {
                let dueDateStr = '';
                try {
                  if (wo.dueDate) {
                    const date = new Date(wo.dueDate);
                    if (!isNaN(date.getTime())) {
                      dueDateStr = date.toLocaleDateString();
                    }
                  }
                } catch (err) {
                  console.error('Error parsing date:', err);
                }
                
                return (
                  <button
                    key={wo.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWorkOrderClick(wo);
                    }}
                    className="w-full text-left text-xs text-[var(--text-secondary)] py-1.5 px-2 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] rounded transition-colors"
                  >
                    {/* Line 1: WO Number + Due Date */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[var(--text-primary)] text-sm">
                        {wo.woNumber || wo.id}
                      </span>
                      <span className="text-[var(--text-muted)] ml-2 text-xs">
                        {dueDateStr ? `Due: ${dueDateStr}` : 'Due: N/A'}
                      </span>
                    </div>
                    {/* Line 2: Customer - always shown */}
                    <p className="text-[var(--text-muted)] text-xs mb-0.5">
                      Customer: {wo.customer || 'N/A'}
                    </p>
                    {/* Line 3: Assignee - always shown */}
                    <p className="text-[var(--text-muted)] text-xs">
                      Assignee: {wo.currentBox || 'N/A'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusBarColor(status: string): string {
  switch (status) {
    case 'engineering': return 'bg-blue-500';
    case 'engineering-completed': return 'bg-yellow-500';
    case 'programming': return 'bg-purple-500';
    case 'programming-completed': return 'bg-green-500';
    case 'hold': return 'bg-orange-500';
    default: return 'bg-[var(--bg-elevated)]';
  }
}

