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
    <div className="stat-card flex items-start gap-4 p-5">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-display">{value}</p>
        <p className="text-caption">{label}</p>
        {subtext && <p className="text-caption mt-0.5">{subtext}</p>}
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
            className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-1 min-w-[140px] max-h-64 overflow-y-auto animate-fade-in"
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
                className={cn(
                  'block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-[var(--bg-hover)] transition-colors',
                  wo.currentBox === a ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                )}
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
            className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-1 min-w-[130px] animate-fade-in"
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
                className={cn(
                  'block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-[var(--bg-hover)] transition-colors',
                  wo.materialStatus === m.value ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                )}
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
            className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-1 min-w-[160px] animate-fade-in"
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
                className={cn(
                  'block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-[var(--bg-hover)] transition-colors',
                  wo.currentStatus === s.value ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                )}
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
            className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-1 min-w-[120px] max-h-64 overflow-y-auto animate-fade-in"
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
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-[var(--bg-hover)] transition-colors text-left',
                  wo.priority === i && 'bg-[var(--accent-muted)]'
                )}
              >
                <span className={cn('w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold', PRIORITY_COLORS[i])}>
                  {i === 0 ? '—' : i === 11 ? 'H' : i}
                </span>
                <span className={cn('text-[var(--text-primary)]', wo.priority === i && 'text-[var(--accent)]')}>{PRIORITY_LABELS[i]}</span>
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
        className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        title="Proshop material details"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-4 min-w-[320px] max-w-[420px] animate-fade-in"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            <p className="text-xs text-[var(--text-muted)] font-medium mb-2">Proshop material — {woNumber}</p>
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
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Overview of engineering activity</p>
          </div>
          <Link to="/schedule" className="btn-primary">
            <ClipboardList className="w-4 h-4" /> View Schedule
          </Link>
        </div>
      </div>

      {/* Personal summary: time tracking today, time summary, NCR for the logged-in employee */}
      {user && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--text-primary)]">
              <User className="w-5 h-5 text-[var(--text-muted)]" />
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
              <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                  <Timer className="w-4 h-4" /> Time Charged
                </h3>
                {(() => {
                  const myStats = timeTrackingStats?.users?.find(u => u.firstName === user.displayName);
                  const myUser = timeTrackingToday?.users?.find(u => u.firstName === user.displayName);
                  if (!myStats && !myUser) {
                    return <p className="text-sm text-[var(--text-muted)]">No time stats available.</p>;
                  }
                  const weekHours = Number(myStats?.hoursThisWeek ?? 0).toFixed(1);
                  const todayHours = myUser && !myUser.error ? (myUser.totalLaborTime ?? 0).toFixed(2) : null;
                  return (
                    <div className="space-y-1">
                      {todayHours != null ? (
                        <>
                          <p className="text-[var(--text-primary)]"><span className="text-[var(--text-secondary)]">Today:</span> <strong>{todayHours}h</strong></p>
                          <p className="text-xs text-[var(--text-muted)]">This week: {weekHours}h</p>
                        </>
                      ) : (
                        <p className="text-[var(--text-primary)]"><span className="text-[var(--text-secondary)]">This week:</span> <strong>{weekHours}h</strong></p>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Non-conformance summary and rate */}
              <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Non-conformances
                </h3>
                {(() => {
                  const myNcrStats: NCRByAssigneeStats | undefined = ncrByAssignee?.byAssignee?.[user.displayName];
                  const myNcrList = ncrByAssignee?.allNcrsByAssignee?.[user.displayName] ?? [];
                  const uniqueWOs = timeTrackingStats?.users?.find(u => u.firstName === user.displayName)?.uniqueWorkOrdersThisYear ?? 0;
                  const ncrRatePct = myNcrStats && uniqueWOs > 0 ? (myNcrStats.year / uniqueWOs) * 100 : null;
                  if (!myNcrStats && myNcrList.length === 0) {
                    return <p className="text-sm text-[var(--text-muted)]">No NCR data for you.</p>;
                  }
                  const s = myNcrStats ?? { year: 0, quarter: 0, month: 0, week: 0, monthlyAvg: 0, weeklyAvg: 0 };
                  return (
                    <div className="space-y-1">
                      <p className="text-[var(--text-primary)]"><span className="text-[var(--text-secondary)]">YTD:</span> <strong>{s.year}</strong></p>
                      <p className="text-[var(--text-primary)]"><span className="text-[var(--text-secondary)]">Quarter / Month / Week:</span> <strong>{s.quarter}</strong> / {s.month} / {s.week}</p>
                      {ncrRatePct != null && (
                        <p className="text-[var(--text-primary)]"><span className="text-[var(--text-secondary)]">NCR rate:</span> <strong>{ncrRatePct.toFixed(1)}%</strong></p>
                      )}
                      {myNcrList.length > 0 && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">{myNcrList.length} NCR(s) this year · <Link to={`/non-conformances?assignee=${encodeURIComponent(user.displayName)}`} className="text-accent hover:underline">View all</Link></p>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* My side projects */}
              <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                  <FolderKanban className="w-4 h-4" /> My projects
                </h3>
                {myProjects.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No side projects assigned to you.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {myProjects.map((proj) => (
                      <li key={proj.id} className="text-sm">
                        <p className="text-[var(--text-primary)] font-medium">{proj.title}</p>
                        {proj.description && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{proj.description}</p>
                        )}
                        {proj.dueDate && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
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
            <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Priority</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">WO #</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Quote #</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Due Date</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Part #</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Part Name</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Assignee</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Material</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Material Due</th>
                    <th className="px-4 py-3 text-caption font-medium uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {myScheduleWorkOrders.map((wo) => (
                    <tr
                      key={wo.id}
                      onClick={() => setSelectedWO(wo)}
                      className={cn('hover:bg-[var(--bg-hover)] transition-colors cursor-pointer', wo.isHotJob && 'bg-orange-500/5')}
                    >
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <PriorityCell wo={wo} onUpdate={handleUpdate} />
                      </td>
                      <td className="px-4 py-3.5">
                        <a href={erpWorkOrderUrl(wo.woNumber)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono text-xs inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {wo.woNumber} <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        {wo.qn ? (
                          <a href={erpQuoteUrl(wo.qn)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono text-xs inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {wo.qn} <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                        ) : (
                          <span className="text-zinc-500 text-xs">—</span>
                        )}
                      </td>
                      <td className={cn('px-4 py-3.5 text-xs', isOverdue(wo.dueDate) && 'text-red-400 font-medium')}>
                        {formatDate(wo.dueDate)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-zinc-300">{wo.partNumber || '—'}</td>
                      <td className="px-4 py-3.5 max-w-[220px] truncate text-xs text-zinc-200" title={wo.partName}>{wo.partName || '—'}</td>
                      <td className="px-4 py-3.5 text-xs font-medium text-zinc-300">{wo.customer || '—'}</td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <AssigneeCell wo={wo} onUpdate={handleUpdate} />
                      </td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <StatusCell wo={wo} onUpdate={handleUpdate} isAdminUser={admin} />
                      </td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <ProshopMaterialCell woNumber={wo.woNumber} proshop={proshopByWo.get(wo.woNumber)} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-zinc-300">
                        {proshopByWo.get(wo.woNumber)?.stockDetails?.[0]?.dueAtDock ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-zinc-400 truncate max-w-[180px]" title={wo.notes || undefined}>{wo.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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

