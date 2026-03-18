import { useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, AlertTriangle, Clock, Flame,
  CheckCircle2, Loader2, Package, Timer,
  User, AlertCircle, FolderKanban, Info, ExternalLink, RefreshCw
} from 'lucide-react';
import { format as dateFnsFormat } from 'date-fns';
import { getDashboardStats, getWorkOrders, updateWorkOrder, getTimeTracking, getTimeTrackingStats, getNcrsByAssignee, getCachedTimeTracking, getCachedTimeTrackingStats, getMyProjects, getProshopMaterialStatus, getCachedProshopMaterialStatus, isProshopUnavailableResponse } from '@/services/api';
import type { DashboardStats, WorkOrder, TimeTrackingData, TimeTrackingStatsData, NCRByAssigneeData, NCRByAssigneeStats, SideProject, ProshopMaterialStatus } from '@/types';
import { cn, formatDate, isOverdue, statusColor, statusLabel, isAdmin, materialStatusColor, materialStatusLabel, erpWorkOrderUrl, erpQuoteUrl, assigneeColor } from '@/lib/utils';
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_OPTIONS, ASSIGNEES, MATERIAL_OPTIONS } from '@/types';
import { useSSE } from '@/hooks/useSSE';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MainScrollLockContext } from '@/components/Layout';
import WorkOrderDrawer from '@/components/WorkOrderDrawer';
import { MaterialStatusBadge, ProshopMaterialDetailPanel } from '@/components/MaterialTrackingContent';

function StatCard({ label, value, icon: Icon, color, subtext }: {
  label: string; value: number | string; icon: React.ElementType; color: string; subtext?: string;
}) {
  return (
    <div className="stat-card flex items-start gap-4">
      <div className={cn('p-2.5 rounded-lg', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
        <p className="text-sm text-zinc-400">{label}</p>
        {subtext && <p className="text-xs text-zinc-500 mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}

function AssigneeCell({ wo, onUpdate }: { wo: WorkOrder; onUpdate: (id: string, data: Partial<WorkOrder>) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 px-1.5 py-0.5 rounded transition-colors truncate max-w-[100px]"
      >
        {wo.currentBox || '—'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-1 min-w-[140px] max-h-64 overflow-y-auto"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            {ASSIGNEES.map(a => (
              <button
                key={a}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(wo.id, { currentBox: a });
                  setOpen(false);
                }}
                className={cn('block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-zinc-700 transition-colors', wo.currentBox === a ? 'bg-zinc-700 text-white' : 'text-zinc-300')}
              >
                {a}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MaterialCell({ wo, onUpdate }: { wo: WorkOrder; onUpdate: (id: string, data: Partial<WorkOrder>) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn('text-xs font-medium cursor-pointer hover:underline', materialStatusColor(wo.materialStatus))}
      >
        {materialStatusLabel(wo.materialStatus)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-1 min-w-[130px]"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
          >
            {MATERIAL_OPTIONS.map(m => (
              <button
                key={m.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(wo.id, { materialStatus: m.value as WorkOrder['materialStatus'] });
                  setOpen(false);
                }}
                className={cn('block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-zinc-700 transition-colors', wo.materialStatus === m.value ? 'bg-zinc-700 text-white' : 'text-zinc-300')}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusCell({ wo, onUpdate, isAdminUser }: { wo: WorkOrder; onUpdate: (id: string, data: Partial<WorkOrder>) => void; isAdminUser: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn('badge cursor-pointer hover:ring-2 hover:ring-white/20 transition-all', statusColor(wo.currentStatus))}
      >
        {statusLabel(wo.currentStatus)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-1 min-w-[160px]"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
          >
            {STATUS_OPTIONS.filter(s => isAdminUser || s.value !== 'completed').map(s => (
              <button
                key={s.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(wo.id, { currentStatus: s.value as WorkOrder['currentStatus'] });
                  setOpen(false);
                }}
                className={cn('block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-zinc-700 transition-colors', wo.currentStatus === s.value ? 'bg-zinc-700 text-white' : 'text-zinc-300')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PriorityCell({ wo, onUpdate }: { wo: WorkOrder; onUpdate: (id: string, data: Partial<WorkOrder>) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn('inline-flex items-center justify-center min-w-[36px] h-6 rounded text-xs font-bold text-white cursor-pointer hover:ring-2 hover:ring-white/20 transition-all', PRIORITY_COLORS[wo.priority])}
      >
        {PRIORITY_LABELS[wo.priority]}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-1 min-w-[120px] max-h-64 overflow-y-auto"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(wo.id, { priority: i, isHotJob: i === 11 });
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-zinc-700 transition-colors text-left',
                  wo.priority === i && 'bg-zinc-700'
                )}
              >
                <span className={cn('w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold', PRIORITY_COLORS[i])}>
                  {i === 0 ? '—' : i === 11 ? 'H' : i}
                </span>
                <span className="text-zinc-200">{PRIORITY_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProshopMaterialCell({ woNumber, proshop }: { woNumber: string; proshop: ProshopMaterialStatus | undefined }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!proshop) {
    return <span className="text-zinc-500 text-xs">—</span>;
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <MaterialStatusBadge status={proshop.materialStatus} bomOrdered={proshop.bomOrdered} bomArrived={proshop.bomArrived} />
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
        title="Proshop material details"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-4 min-w-[320px] max-w-[420px]"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            <p className="text-xs text-zinc-500 font-medium mb-2">Proshop material — {woNumber}</p>
            <ProshopMaterialDetailPanel row={proshop} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Personal summary (time tracking + NCR) for the logged-in employee
  const [timeTrackingToday, setTimeTrackingToday] = useState<TimeTrackingData | null>(null);
  const [timeTrackingStats, setTimeTrackingStats] = useState<TimeTrackingStatsData | null>(null);
  const [ncrByAssignee, setNcrByAssignee] = useState<NCRByAssigneeData | null>(null);
  const [myProjects, setMyProjects] = useState<SideProject[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  // My schedule work orders + ProShop material (for Material Arrived count and schedule table)
  const [myScheduleWorkOrders, setMyScheduleWorkOrders] = useState<WorkOrder[]>([]);
  const [proshopMaterial, setProshopMaterial] = useState<ProshopMaterialStatus[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [proshopUnavailableMessage, setProshopUnavailableMessage] = useState<string | null>(null);

  const setMainScrollLocked = useContext(MainScrollLockContext);
  const admin = isAdmin(user);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const assignee = !admin && user ? user.displayName : undefined;
      const statsRes = await getDashboardStats(assignee);
      if (statsRes.success) setStats(statsRes.data);
      else setStats(null);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [admin, user]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Load personal summary (time today, time stats, NCR by assignee) when user is logged in; show cache first
  const loadPersonalSummary = useCallback(async () => {
    if (!user?.displayName) return;
    const today = dateFnsFormat(new Date(), 'yyyy-MM-dd');
    const cachedTime = getCachedTimeTracking(today);
    const cachedStats = getCachedTimeTrackingStats();
    if (cachedTime) setTimeTrackingToday(cachedTime);
    if (cachedStats) setTimeTrackingStats(cachedStats);
    setLoadingPersonal(true);
    try {
      const [timeRes, statsRes, ncrRes, projectsRes] = await Promise.all([
        getTimeTracking(today),
        getTimeTrackingStats(),
        getNcrsByAssignee(),
        getMyProjects(),
      ]);
      if (timeRes.success && timeRes.data) setTimeTrackingToday(timeRes.data);
      else setTimeTrackingToday(null);
      if (statsRes.success && statsRes.data) setTimeTrackingStats(statsRes.data);
      else setTimeTrackingStats(null);
      if (isProshopUnavailableResponse(ncrRes)) {
        setNcrByAssignee(null);
        setProshopUnavailableMessage(ncrRes.message);
      } else if (ncrRes?.success && ncrRes?.data) {
        setNcrByAssignee(ncrRes.data);
        setProshopUnavailableMessage(null);
      } else setNcrByAssignee(null);
      if (projectsRes.success && projectsRes.data) setMyProjects(projectsRes.data);
      else setMyProjects([]);
    } catch {
      setTimeTrackingToday(null);
      setTimeTrackingStats(null);
      setNcrByAssignee(null);
      setMyProjects([]);
    } finally {
      setLoadingPersonal(false);
    }
  }, [user?.displayName]);

  useEffect(() => {
    loadPersonalSummary();
  }, [loadPersonalSummary]);

  // Load my work orders and ProShop material status (for Material Arrived stat and My schedule table)
  const loadMyScheduleData = useCallback(async () => {
    if (!user?.displayName) return;
    const cached = getCachedProshopMaterialStatus();
    if (cached) setProshopMaterial(cached);
    try {
      const [ordersRes, proshopRes] = await Promise.all([
        getWorkOrders({
          currentBox: user.displayName,
          currentStatus: '!completed',
          limit: 'all',
          sortBy: 'dueDate',
          sortOrder: 'asc',
        }),
        getProshopMaterialStatus(),
      ]);
      if (ordersRes.success) setMyScheduleWorkOrders(ordersRes.data);
      if (isProshopUnavailableResponse(proshopRes)) {
        setProshopUnavailableMessage(proshopRes.message);
      } else if (proshopRes?.success && proshopRes?.data) {
        setProshopMaterial(proshopRes.data);
        setProshopUnavailableMessage(null);
      }
    } catch {
      setMyScheduleWorkOrders([]);
    }
  }, [user?.displayName]);

  useEffect(() => {
    loadMyScheduleData();
  }, [loadMyScheduleData]);

  const proshopByWo = useMemo(
    () => new Map(proshopMaterial.map((p) => [p.workOrderNumber, p])),
    [proshopMaterial]
  );

  const materialArrivedCount = useMemo(() => {
    return myScheduleWorkOrders.filter(
      (wo) => proshopByWo.get(wo.woNumber)?.materialStatus === 'arrived'
    ).length;
  }, [myScheduleWorkOrders, proshopByWo]);

  // Silently refresh when server pushes work-order or import events
  useSSE(useCallback(() => { refreshData(); loadMyScheduleData(); }, [refreshData, loadMyScheduleData]));

  useEffect(() => {
    setMainScrollLocked?.(!!selectedWO);
    return () => setMainScrollLocked?.(false);
  }, [selectedWO, setMainScrollLocked]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<WorkOrder>) => {
    try {
      const res = await updateWorkOrder(id, updates);
      if (res.success) {
        setMyScheduleWorkOrders(prev => prev.map(wo => wo.id === id ? res.data : wo));
        if (selectedWO?.id === id) setSelectedWO(res.data);
        toast.success('Status updated successfully');
        refreshData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  }, [refreshData, selectedWO?.id]);

  const handleProshopRetry = useCallback(() => {
    setProshopUnavailableMessage(null);
    loadPersonalSummary();
    loadMyScheduleData();
  }, [loadPersonalSummary, loadMyScheduleData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
        <span className="text-sm">Loading dashboard...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 space-y-2">
        {loadError && (
          <p className="text-red-400 text-sm">{loadError}</p>
        )}
        <p className="text-zinc-400">
          No data loaded.{' '}
          <Link to="/import" className="text-accent hover:underline">Import an Excel file</Link> to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {proshopUnavailableMessage && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-200">
          <span>{proshopUnavailableMessage}</span>
          <button
            type="button"
            onClick={handleProshopRetry}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <Link to="/schedule" className="btn-primary">
          <ClipboardList className="w-4 h-4" /> View Schedule
        </Link>
      </div>

      {/* Personal summary: time tracking today, time summary, NCR for the logged-in employee */}
      {user && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <User className="w-5 h-5 text-zinc-400" />
              My summary
            </h2>
            <div className="flex items-center gap-2">
              <Link to="/time-tracking" className="text-sm text-accent hover:text-accent-hover transition-colors">Time tracking</Link>
              <span className="text-zinc-600">|</span>
              <Link to="/non-conformances" className="text-sm text-accent hover:text-accent-hover transition-colors">Non-conformances</Link>
            </div>
          </div>
          {loadingPersonal ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Time Charged (combined: This Week + optional Today) */}
              <div className="rounded-lg bg-zinc-800/50 border border-white/[0.06] p-4">
                <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                  <Timer className="w-4 h-4" /> Time Charged
                </h3>
                {(() => {
                  const myStats = timeTrackingStats?.users?.find(u => u.firstName === user.displayName);
                  const myUser = timeTrackingToday?.users?.find(u => u.firstName === user.displayName);
                  if (!myStats && !myUser) {
                    return <p className="text-sm text-zinc-500">No time stats available.</p>;
                  }
                  const weekHours = Number(myStats?.hoursThisWeek ?? 0).toFixed(1);
                  const todayHours = myUser && !myUser.error ? (myUser.totalLaborTime ?? 0).toFixed(2) : null;
                  return (
                    <div className="space-y-1">
                      {todayHours != null ? (
                        <>
                          <p className="text-zinc-100"><span className="text-zinc-400">Today:</span> <strong>{todayHours}h</strong></p>
                          <p className="text-xs text-zinc-500">This week: {weekHours}h</p>
                        </>
                      ) : (
                        <p className="text-zinc-100"><span className="text-zinc-400">This week:</span> <strong>{weekHours}h</strong></p>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Non-conformance summary and rate */}
              <div className="rounded-lg bg-zinc-800/50 border border-white/[0.06] p-4">
                <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Non-conformances
                </h3>
                {(() => {
                  const myNcrStats: NCRByAssigneeStats | undefined = ncrByAssignee?.byAssignee?.[user.displayName];
                  const myNcrList = ncrByAssignee?.allNcrsByAssignee?.[user.displayName] ?? [];
                  const uniqueWOs = timeTrackingStats?.users?.find(u => u.firstName === user.displayName)?.uniqueWorkOrdersThisYear ?? 0;
                  const ncrRatePct = myNcrStats && uniqueWOs > 0 ? (myNcrStats.year / uniqueWOs) * 100 : null;
                  if (!myNcrStats && myNcrList.length === 0) {
                    return <p className="text-sm text-zinc-500">No NCR data for you.</p>;
                  }
                  const s = myNcrStats ?? { year: 0, quarter: 0, month: 0, week: 0, monthlyAvg: 0, weeklyAvg: 0 };
                  return (
                    <div className="space-y-1">
                      <p className="text-zinc-100"><span className="text-zinc-400">YTD:</span> <strong>{s.year}</strong></p>
                      <p className="text-zinc-100"><span className="text-zinc-400">Quarter / Month / Week:</span> <strong>{s.quarter}</strong> / {s.month} / {s.week}</p>
                      {ncrRatePct != null && (
                        <p className="text-zinc-100"><span className="text-zinc-400">NCR rate:</span> <strong>{ncrRatePct.toFixed(1)}%</strong></p>
                      )}
                      {myNcrList.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1">{myNcrList.length} NCR(s) this year · <Link to={`/non-conformances?assignee=${encodeURIComponent(user.displayName)}`} className="text-accent hover:underline">View all</Link></p>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* My side projects */}
              <div className="rounded-lg bg-zinc-800/50 border border-white/[0.06] p-4">
                <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                  <FolderKanban className="w-4 h-4" /> My projects
                </h3>
                {myProjects.length === 0 ? (
                  <p className="text-sm text-zinc-500">No side projects assigned to you.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {myProjects.map((proj) => (
                      <li key={proj.id} className="text-sm">
                        <p className="text-zinc-100 font-medium">{proj.title}</p>
                        {proj.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">{proj.description}</p>
                        )}
                        {proj.dueDate && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Due {dateFnsFormat(new Date(proj.dueDate + 'T12:00:00'), 'MMM d, yyyy')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hero metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Active" value={stats.total} icon={ClipboardList} color="bg-blue-600" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="bg-red-600" />
        <StatCard label="Due This Week" value={stats.dueThisWeek} icon={Clock} color="bg-yellow-600" />
        <StatCard label="Hot Jobs" value={stats.hotJobs} icon={Flame} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="bg-green-600" />
        <StatCard label="In Progress" value={stats.inProgress} icon={Loader2} color="bg-purple-600" />
        <StatCard
          label="Material Arrived"
          value={user ? materialArrivedCount : 0}
          icon={Package}
          color="bg-emerald-600"
        />
      </div>

      {/* My schedule: work orders assigned to me, same layout as Schedule with ProShop material */}
      {user && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <ClipboardList className="w-5 h-5 text-zinc-400" />
              My schedule
            </h2>
            <Link to="/schedule" className="text-sm text-accent hover:text-accent-hover transition-colors">View full schedule</Link>
          </div>
          {myScheduleWorkOrders.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4">No work orders assigned to you.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-400 text-left border-b border-white/[0.06]">
                    <th className="pb-2 pr-2 font-medium">Priority</th>
                    <th className="pb-2 pr-2 font-medium">WO #</th>
                    <th className="pb-2 pr-2 font-medium">Quote #</th>
                    <th className="pb-2 pr-2 font-medium">Due Date</th>
                    <th className="pb-2 pr-2 font-medium">Part #</th>
                    <th className="pb-2 pr-2 font-medium">Part Name</th>
                    <th className="pb-2 pr-2 font-medium">Customer</th>
                    <th className="pb-2 pr-2 font-medium">Assignee</th>
                    <th className="pb-2 pr-2 font-medium">Status</th>
                    <th className="pb-2 pr-2 font-medium">Material</th>
                    <th className="pb-2 pr-2 font-medium">Material Due</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {myScheduleWorkOrders.map((wo) => (
                    <tr
                      key={wo.id}
                      onClick={() => setSelectedWO(wo)}
                      className={cn('hover:bg-zinc-800/50 transition-colors cursor-pointer', wo.isHotJob && 'bg-orange-500/5')}
                    >
                      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                        <PriorityCell wo={wo} onUpdate={handleUpdate} />
                      </td>
                      <td className="py-2.5">
                        <a href={erpWorkOrderUrl(wo.woNumber)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono text-xs inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {wo.woNumber} <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="py-2.5">
                        {wo.qn ? (
                          <a href={erpQuoteUrl(wo.qn)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono text-xs inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {wo.qn} <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                        ) : (
                          <span className="text-zinc-500 text-xs">—</span>
                        )}
                      </td>
                      <td className={cn('py-2.5 text-xs', isOverdue(wo.dueDate) && 'text-red-400 font-medium')}>
                        {formatDate(wo.dueDate)}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-zinc-300">{wo.partNumber || '—'}</td>
                      <td className="py-2.5 max-w-[220px] truncate text-xs text-zinc-200" title={wo.partName}>{wo.partName || '—'}</td>
                      <td className="py-2.5 text-xs font-medium text-zinc-300">{wo.customer || '—'}</td>
                      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                        <AssigneeCell wo={wo} onUpdate={handleUpdate} />
                      </td>
                      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                        <StatusCell wo={wo} onUpdate={handleUpdate} isAdminUser={admin} />
                      </td>
                      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                        <ProshopMaterialCell woNumber={wo.woNumber} proshop={proshopByWo.get(wo.woNumber)} />
                      </td>
                      <td className="py-2.5 text-xs text-zinc-300">
                        {proshopByWo.get(wo.woNumber)?.stockDetails?.[0]?.dueAtDock ?? '—'}
                      </td>
                      <td className="py-2.5 text-xs text-zinc-400 truncate max-w-[180px]" title={wo.notes || undefined}>{wo.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedWO && (
        <WorkOrderDrawer
          workOrder={selectedWO}
          onClose={() => setSelectedWO(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

