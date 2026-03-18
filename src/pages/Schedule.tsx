import { useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Search, ChevronUp, ChevronDown,
  Loader2, ExternalLink, X, Plus, Trash2, Copy, Clipboard, CheckCircle2, Info, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { getWorkOrders, updateWorkOrder, createWorkOrder, deleteWorkOrder, getProshopMaterialStatus, getCachedProshopMaterialStatus, isProshopUnavailableResponse } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import type { WorkOrder, WorkOrderFilters } from '@/types';
import { ASSIGNEES, CUSTOMERS, PRIORITY_COLORS, PRIORITY_LABELS, MATERIAL_OPTIONS, STATUS_OPTIONS } from '@/types';
import { cn, formatDate, isOverdue, erpWorkOrderUrl, erpQuoteUrl, isAdmin, assigneeColor } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { MainScrollLockContext } from '@/components/Layout';
import WorkOrderDrawer from '@/components/WorkOrderDrawer';
import { StatusCell } from '@/components/archived/ScheduleStatusCell';
import { MaterialStatusBadge, ProshopMaterialDetailPanel } from '@/components/MaterialTrackingContent';
import type { ProshopMaterialStatus } from '@/types';
import * as Dialog from '@radix-ui/react-dialog';

const columnHelper = createColumnHelper<WorkOrder>();

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
            className="dropdown-menu fixed z-[9999] min-w-[120px] max-h-64"
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
                className="dropdown-item flex items-center gap-2"
                data-active={wo.priority === i ? 'true' : undefined}
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
        className={cn('text-sm px-1.5 py-0.5 rounded transition-colors truncate max-w-[100px] border hover:ring-2 hover:ring-white/20', assigneeColor(wo.currentBox))}
      >
        {wo.currentBox || '—'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="dropdown-menu fixed z-[9999] min-w-[140px] max-h-64"
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
                className="dropdown-item"
                data-active={wo.currentBox === a ? 'true' : undefined}
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
    return <span className="text-[var(--text-muted)] text-xs">—</span>;
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
            className="dropdown-menu fixed z-[9999] p-4 min-w-[320px] max-w-[420px]"
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

export default function Schedule() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const setMainScrollLocked = useContext(MainScrollLockContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<WorkOrder[]>([]);
  const [proshopMaterial, setProshopMaterial] = useState<ProshopMaterialStatus[]>([]);
  const [proshopMaterialError, setProshopMaterialError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WorkOrderFilters>({
    limit: 'all', sortBy: 'dueDate', sortOrder: 'asc',
  });
  const [search, setSearch] = useState('');
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedProperty, setCopiedProperty] = useState<{ field: keyof WorkOrder; value: any } | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [pasting, setPasting] = useState(false);
  const appliedWoParamRef = useRef(false);
  const woParam = searchParams.get('wo');

  // Reset so a new ?wo= in URL can open that work order (e.g. after navigation)
  useEffect(() => {
    appliedWoParamRef.current = false;
  }, [woParam]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const apiFilters = { ...filters, search: search || undefined, currentStatus: filters.currentStatus || '!completed' };
      if (apiFilters.sortBy === 'materialDue') {
        apiFilters.sortBy = 'dueDate';
      }
      const res = await getWorkOrders(apiFilters);
      if (res.success) {
        setData(res.data);
        
        // Check for work order ID in URL params and select it (once per ?wo=)
        const woId = searchParams.get('wo');
        if (woId && !appliedWoParamRef.current) {
          const wo = res.data.find(o => o.id === woId);
          if (wo) {
            appliedWoParamRef.current = true;
            setSelectedWO(wo);
            // Clear the URL parameter after selecting
            setSearchParams({}, { replace: true });
          }
        }
      }
    } catch (err) {
      toast.error('Failed to load work orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, search, searchParams, setSearchParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Tell Layout to lock main scroll so opening the drawer doesn't scroll to top
  useEffect(() => {
    setMainScrollLocked?.(!!(selectedWO || isCreating));
    return () => setMainScrollLocked?.(false);
  }, [selectedWO, isCreating, setMainScrollLocked]);

  // Fetch Proshop material status for schedule WOs (inline material info); show cache first, then revalidate
  const loadProshopMaterial = useCallback(() => {
    setProshopMaterialError(null);
    const cached = getCachedProshopMaterialStatus();
    if (cached) setProshopMaterial(cached);
    getProshopMaterialStatus()
      .then((res) => {
        if (isProshopUnavailableResponse(res)) {
          setProshopMaterialError(res.message);
          return;
        }
        if (res.success) setProshopMaterial(res.data ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadProshopMaterial();
  }, [loadProshopMaterial]);

  const proshopByWo = useMemo(
    () => new Map(proshopMaterial.map((p) => [p.workOrderNumber, p])),
    [proshopMaterial]
  );

  const sortedData = useMemo(() => {
    if (filters.sortBy !== 'materialDue') return data;
    const order = filters.sortOrder === 'desc' ? 'desc' : 'asc';
    const getDue = (wo: WorkOrder) => {
      const proshop = proshopByWo.get(wo.woNumber);
      const due = proshop?.stockDetails?.[0]?.dueAtDock ?? null;
      return due ? new Date(due).getTime() : NaN;
    };
    return [...data].sort((a, b) => {
      const ta = getDue(a);
      const tb = getDue(b);
      const na = Number.isNaN(ta);
      const nb = Number.isNaN(tb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      const diff = order === 'asc' ? ta - tb : tb - ta;
      return diff;
    });
  }, [data, filters.sortBy, filters.sortOrder, proshopByWo]);

  // Silently refresh on real-time events (no loading spinner)
  useSSE(useCallback(() => {
    const apiFilters = { ...filters, search: search || undefined, currentStatus: filters.currentStatus || '!completed' };
    if (apiFilters.sortBy === 'materialDue') apiFilters.sortBy = 'dueDate';
    getWorkOrders(apiFilters).then(res => {
      if (res.success) {
        setData(res.data);
      }
    }).catch(err => console.error('SSE refresh failed:', err));
  }, [filters, search]));

  const handleUpdate = useCallback(async (id: string, updates: Partial<WorkOrder>) => {
    try {
      const res = await updateWorkOrder(id, updates);
      if (res.success) {
        setData(prev => prev.map(wo => wo.id === id ? res.data : wo));
        if (selectedWO?.id === id) setSelectedWO(res.data);
        toast.success('Updated successfully');
      }
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  }, [selectedWO]);

  const handleCreate = useCallback(async (data: Partial<WorkOrder>) => {
    try {
      const res = await createWorkOrder(data);
      if (res.success) {
        toast.success('Work order created successfully');
        setIsCreating(false);
        setSelectedWO(null);
        // Refresh the list
        await fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create work order');
    }
  }, [fetchData]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      setData(prev => prev.filter(wo => wo.id !== id));
      if (selectedWO?.id === id) {
        setSelectedWO(null);
      }
      await fetchData();
    } catch (err) {
      console.error('Delete handler error:', err);
    }
  }, [selectedWO, fetchData]);

  const toggleSelect = useCallback((id: string, index: number, shiftKey: boolean = false) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      
      if (shiftKey && lastSelectedIndex !== null) {
        // Range selection - select all rows from lastSelectedIndex to index (inclusive)
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        
        // Select all rows from start to end (inclusive) in displayed order
        for (let i = start; i <= end; i++) {
          if (i < sortedData.length) {
            next.add(sortedData[i].id);
          }
        }
      } else {
        // Single selection
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        setLastSelectedIndex(index);
      }
      
      return next;
    });
  }, [lastSelectedIndex, sortedData]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === sortedData.length) {
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedIds(new Set(sortedData.map(wo => wo.id)));
      setLastSelectedIndex(null);
    }
  }, [selectedIds.size, sortedData]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const deletePromises = idsArray.map(id => deleteWorkOrder(id));
      await Promise.all(deletePromises);
      toast.success(`Deleted ${idsArray.length} work order(s)`);
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete work orders');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkCompleted = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const idsArray = Array.from(selectedIds);
    try {
      // Optimistically update local state
      setData(prev => prev.map(wo => {
        if (idsArray.includes(wo.id)) {
          return { ...wo, currentStatus: 'completed' as WorkOrder['currentStatus'], currentBox: null };
        }
        return wo;
      }));

      const updatePromises = idsArray.map(id => 
        updateWorkOrder(id, { currentStatus: 'completed' as WorkOrder['currentStatus'], currentBox: null })
      );
      const results = await Promise.all(updatePromises);
      
      // Update with actual server responses
      setData(prev => prev.map(wo => {
        const result = results.find(r => r.success && r.data.id === wo.id);
        return result ? result.data : wo;
      }));

      // Update selectedWO if it's one of the completed items
      if (selectedWO && idsArray.includes(selectedWO.id)) {
        const result = results.find(r => r.success && r.data.id === selectedWO.id);
        if (result) {
          setSelectedWO(result.data);
        }
      }

      toast.success(`Marked ${results.filter(r => r.success).length} work order(s) as completed`);
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark work orders as completed');
      await fetchData(); // Refresh to revert optimistic update
    }
  }, [selectedIds, selectedWO, fetchData]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={sortedData.length > 0 && selectedIds.size === sortedData.length}
          onChange={toggleSelectAll}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-accent focus:ring-2 focus:ring-accent/50 cursor-pointer"
        />
      ),
      size: 40,
      cell: ({ row }) => {
        const rowIndex = sortedData.findIndex(wo => wo.id === row.original.id);
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={() => {}} // Handled by onClick
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(row.original.id, rowIndex, e.shiftKey);
            }}
            className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-accent focus:ring-2 focus:ring-accent/50 cursor-pointer"
          />
        );
      },
    }),
    columnHelper.accessor('priority', {
      header: 'Priority',
      size: 60,
      cell: ({ row }) => <PriorityCell wo={row.original} onUpdate={handleUpdate} />,
    }),
    columnHelper.accessor('woNumber', {
      header: 'WO #',
      size: 90,
      cell: ({ row }) => (
        <a href={erpWorkOrderUrl(row.original.woNumber)} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover font-mono text-xs inline-flex items-center gap-1">
          {row.original.woNumber} <ExternalLink className="w-3 h-3 opacity-50" />
        </a>
      ),
    }),
    columnHelper.accessor('qn', {
      header: 'Quote #',
      size: 100,
      cell: ({ row }) => {
        const qn = row.original.qn;
        if (!qn) return <span className="text-[var(--text-muted)] text-xs">—</span>;
        return (
          <a href={erpQuoteUrl(qn)} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover font-mono text-xs inline-flex items-center gap-1">
            {qn} <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
        );
      },
    }),
    columnHelper.accessor('dueDate', {
      header: 'Due Date',
      size: 100,
      cell: ({ row }) => {
        const overdue = isOverdue(row.original.dueDate);
        return (
          <span className={cn('text-xs', overdue ? 'text-red-400 font-medium' : 'text-[var(--text-secondary)]')}>
            {formatDate(row.original.dueDate)}
          </span>
        );
      },
    }),
    columnHelper.accessor('partNumber', {
      header: 'Part #',
      size: 120,
      cell: ({ getValue }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{getValue()}</span>,
    }),
    columnHelper.accessor('partName', {
      header: 'Part Name',
      size: 350,
      cell: ({ row }) => (
        <button onClick={() => setSelectedWO(row.original)} className="text-xs text-[var(--text-primary)] hover:text-[var(--text-primary)] hover:underline text-left block w-full" style={{ maxWidth: '350px' }} title={row.original.partName}>
          <span className="truncate block">{row.original.partName}</span>
        </button>
      ),
    }),
    columnHelper.accessor('customer', {
      header: 'Customer',
      size: 70,
      cell: ({ getValue }) => <span className="text-xs font-medium text-[var(--text-secondary)]">{getValue()}</span>,
    }),
    columnHelper.accessor('currentBox', {
      header: 'Assignee',
      size: 100,
      cell: ({ row }) => <AssigneeCell wo={row.original} onUpdate={handleUpdate} />,
    }),
    columnHelper.accessor('currentStatus', {
      header: 'Status',
      size: 130,
      cell: ({ row }) => <StatusCell wo={row.original} onUpdate={handleUpdate} isAdminUser={admin} />,
    }),
    columnHelper.display({
      id: 'material',
      header: 'Material',
      size: 140,
      cell: ({ row }) => (
        <ProshopMaterialCell woNumber={row.original.woNumber} proshop={proshopByWo.get(row.original.woNumber)} />
      ),
    }),
    columnHelper.display({
      id: 'materialDueDate',
      header: 'Material Due',
      size: 100,
      cell: ({ row }) => {
        const proshop = proshopByWo.get(row.original.woNumber);
        const due = proshop?.stockDetails?.[0]?.dueAtDock ?? null;
        return <span className="text-xs text-[var(--text-secondary)]">{due || '—'}</span>;
      },
    }),
    columnHelper.accessor('notes', {
      header: 'Notes',
      size: 220,
      cell: ({ getValue }) => <span className="text-xs text-white truncate max-w-[220px]" title={getValue() || undefined}>{getValue() || '—'}</span>,
    }),
  ], [handleUpdate, selectedIds, sortedData, toggleSelectAll, toggleSelect, proshopByWo, admin]);

  const table = useReactTable({
    data: sortedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: false,
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {proshopMaterialError && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-200">
          <span>{proshopMaterialError}</span>
          <button
            type="button"
            onClick={loadProshopMaterial}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Engineering Schedule</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {data.length} work orders
            {selectedIds.size > 0 && (
              <span className="ml-2 text-accent">({selectedIds.size} selected)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && admin && (
            <button
              onClick={handleMarkCompleted}
              className="btn-primary flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Completed ({selectedIds.size})
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setLastSelectedIndex(null);
              }}
              className="btn-secondary flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Clear Selection
            </button>
          )}
          {selectedIds.size > 0 && copiedProperty && (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const currentSelectedIds = Array.from(selectedIds);
                const currentCopiedProperty = copiedProperty;
                
                if (currentSelectedIds.length === 0 || !currentCopiedProperty || pasting) {
                  return;
                }
                
                setPasting(true);
                try {
                  // Optimistically update local state
                  setData(prev => prev.map(wo => {
                    if (currentSelectedIds.includes(wo.id)) {
                      const updated = { ...wo, [currentCopiedProperty.field]: currentCopiedProperty.value };
                      // If pasting status and it doesn't allow assignments, clear assignee
                      if (currentCopiedProperty.field === 'currentStatus' && 
                          currentCopiedProperty.value !== 'engineering' && 
                          currentCopiedProperty.value !== 'programming') {
                        updated.currentBox = null;
                      }
                      return updated;
                    }
                    return wo;
                  }));

                  const updatePromises = currentSelectedIds.map(id => {
                    const update: Partial<WorkOrder> = { [currentCopiedProperty.field]: currentCopiedProperty.value };
                    // If pasting status and it doesn't allow assignments, clear assignee
                    if (currentCopiedProperty.field === 'currentStatus' && 
                        currentCopiedProperty.value !== 'engineering' && 
                        currentCopiedProperty.value !== 'programming') {
                      update.currentBox = null;
                    }
                    return updateWorkOrder(id, update);
                  });
                  const results = await Promise.all(updatePromises);
                  
                  // Update with actual server responses
                  setData(prev => prev.map(wo => {
                    const result = results.find(r => r.success && r.data.id === wo.id);
                    return result ? result.data : wo;
                  }));

                  // Update selectedWO if it's one of the pasted items
                  if (selectedWO && currentSelectedIds.includes(selectedWO.id)) {
                    const result = results.find(r => r.success && r.data.id === selectedWO.id);
                    if (result) {
                      setSelectedWO(result.data);
                    }
                  }

                  const fieldLabel = currentCopiedProperty.field === 'project' ? 'Project' :
                                   currentCopiedProperty.field === 'customer' ? 'Customer' :
                                   currentCopiedProperty.field === 'notes' ? 'Notes' :
                                   currentCopiedProperty.field === 'qn' ? 'Quote Number' :
                                   currentCopiedProperty.field === 'machineScheduled' ? 'Machine Scheduled' :
                                   currentCopiedProperty.field === 'dueDate' ? 'Due Date' :
                                   currentCopiedProperty.field === 'currentStatus' ? 'Status' :
                                   currentCopiedProperty.field === 'currentBox' ? 'Assignee' : currentCopiedProperty.field;
                  toast.success(`Pasted ${fieldLabel} to ${currentSelectedIds.length} work order(s)`);
                  
                  // Refresh data to ensure consistency (SSE will also update, but this ensures immediate update)
                  await fetchData();
                } catch (err: any) {
                  console.error('Paste error:', err);
                  toast.error(err.message || 'Failed to paste property');
                } finally {
                  setPasting(false);
                }
              }}
              disabled={pasting}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pasting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pasting...
                </>
              ) : (
                <>
                  <Clipboard className="w-4 h-4" />
                  Paste {copiedProperty.field === 'project' ? 'Project' :
                         copiedProperty.field === 'customer' ? 'Customer' :
                         copiedProperty.field === 'notes' ? 'Notes' :
                         copiedProperty.field === 'qn' ? 'Quote Number' :
                         copiedProperty.field === 'machineScheduled' ? 'Machine Scheduled' :
                         copiedProperty.field === 'dueDate' ? 'Due Date' :
                         copiedProperty.field === 'currentStatus' ? 'Status' :
                         copiedProperty.field === 'currentBox' ? 'Assignee' : copiedProperty.field} ({selectedIds.size})
                </>
              )}
            </button>
          )}
          {selectedIds.size > 0 && (
            <Dialog.Root open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
              <Dialog.Trigger asChild>
                <button className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4" />
                  Delete Selected ({selectedIds.size})
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg shadow-lg p-6 z-[61] min-w-[400px]">
                  <Dialog.Title className="text-lg font-bold text-white mb-2">Delete Work Orders</Dialog.Title>
                  <Dialog.Description className="text-sm text-[var(--text-secondary)] mb-4">
                    Are you sure you want to delete <span className="font-bold text-accent">{selectedIds.size}</span> work order(s)?
                    <br />
                    <span className="text-[var(--text-muted)]">This action cannot be undone.</span>
                  </Dialog.Description>
                  <div className="flex items-center justify-end gap-3">
                    <Dialog.Close asChild>
                      <button className="btn-secondary text-xs" disabled={deleting}>Cancel</button>
                    </Dialog.Close>
                    <button onClick={handleBulkDelete} disabled={deleting} className="btn-primary text-xs bg-red-600 hover:bg-red-700">
                      {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete {selectedIds.size}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
          <button
            onClick={() => {
              setIsCreating(true);
              setSelectedWO(null);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Work Order
          </button>
        </div>
      </div>

      {/* Search & Filters bar */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search WO, part, customer, project..."
            className="input pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <select
          value={filters.sortBy}
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
          className="select max-w-[160px]"
        >
          <option value="dueDate">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="woNumber">Sort: WO Number</option>
          <option value="customer">Sort: Customer</option>
          <option value="currentBox">Sort: Assignee</option>
          <option value="materialDue">Sort: Material Due</option>
        </select>

        <button
          onClick={() => setFilters(f => ({ ...f, sortOrder: f.sortOrder === 'asc' ? 'desc' : 'asc' }))}
          className="btn-ghost"
          title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {filters.sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <select value={filters.customer ?? ''} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="select max-w-[140px]">
          <option value="">All Customers</option>
          {CUSTOMERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.currentBox ?? ''} onChange={e => setFilters(f => ({ ...f, currentBox: e.target.value }))} className="select max-w-[150px]">
          <option value="">All Assignees</option>
          {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          <option value="__unassigned__">Unassigned</option>
        </select>
        <select value={filters.currentStatus ?? ''} onChange={e => setFilters(f => ({ ...f, currentStatus: e.target.value }))} className="select max-w-[150px]">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(s => s.value !== 'completed').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filters.materialStatus ?? ''} onChange={e => setFilters(f => ({ ...f, materialStatus: e.target.value }))} className="select max-w-[140px]">
          <option value="">All Material</option>
          {MATERIAL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button onClick={() => { setFilters({ limit: 'all', sortBy: 'dueDate', sortOrder: 'asc', customer: '', currentBox: '', currentStatus: '', materialStatus: '' }); setSearch(''); }} className="btn-ghost text-xs">
          Clear All
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  {hg.headers.map(h => (
                    <th key={h.id} className="px-4 py-3 text-left text-caption font-medium uppercase tracking-wide whitespace-nowrap" style={{ width: h.getSize() }}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--text-muted)]" /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-12 text-[var(--text-muted)]">No work orders found</td></tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-[var(--border-subtle)] transition-colors cursor-pointer hover:bg-[var(--bg-hover)]',
                      row.original.isHotJob && 'bg-orange-500/[0.12] hover:bg-orange-500/[0.16] border-l-2 border-l-orange-500'
                    )}
                    onClick={e => {
                      // Don't open drawer if clicking a dropdown button or link
                      if ((e.target as HTMLElement).closest('button, a, select')) return;
                      e.preventDefault();
                      setSelectedWO(row.original);
                    }}
                  >
                    {row.getVisibleCells().map(cell => {
                      const isPartName = cell.column.id === 'partName';
                      return (
                        <td 
                          key={cell.id} 
                          className={isPartName ? "px-4 py-3.5" : "px-4 py-3.5 whitespace-nowrap"} 
                          style={{ maxWidth: isPartName ? '350px' : cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer - portaled to body so opening it does not scroll main */}
      {(selectedWO || isCreating) &&
        createPortal(
          <WorkOrderDrawer
            workOrder={selectedWO}
            isCreating={isCreating}
            onClose={() => {
              setSelectedWO(null);
              setIsCreating(false);
            }}
            onUpdate={handleUpdate}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onCopyProperty={(field, value) => {
              setCopiedProperty({ field, value });
              toast.success(`Copied ${field}`);
            }}
          />,
          document.body
        )}
    </div>
  );
}

