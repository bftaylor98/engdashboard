import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  Search, ChevronUp, ChevronDown,
  Loader2, ExternalLink, X
} from 'lucide-react';
import { toast } from 'sonner';
import { getWorkOrders, updateWorkOrder } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import type { WorkOrder, WorkOrderFilters } from '@/types';
import { CUSTOMERS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/types';
import { cn, formatDate, isOverdue, statusColor, statusLabel, erpWorkOrderUrl } from '@/lib/utils';
import WorkOrderDrawer from '@/components/WorkOrderDrawer';

const columnHelper = createColumnHelper<WorkOrder>();

export default function Completed() {
  const [data, setData] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<WorkOrderFilters>({
    page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc',
    currentStatus: 'completed',
  });
  const [search, setSearch] = useState('');
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getWorkOrders({ ...filters, search: search || undefined, currentStatus: 'completed' });
      if (res.success) {
        setData(res.data);
        setTotal(res.pagination.total);
      }
    } catch (err) {
      toast.error('Failed to load completed work orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Silently refresh on real-time events
  useSSE(useCallback(() => {
    getWorkOrders({ ...filters, search: search || undefined, currentStatus: 'completed' }).then(res => {
      if (res.success) {
        setData(res.data);
        setTotal(res.pagination.total);
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

  const columns = useMemo(() => [
    columnHelper.accessor('priority', {
      header: 'Pri',
      size: 60,
      cell: ({ row }) => (
        <span className={cn('inline-flex items-center justify-center min-w-[36px] h-6 rounded text-xs font-bold text-white', PRIORITY_COLORS[row.original.priority])}>
          {PRIORITY_LABELS[row.original.priority]}
        </span>
      ),
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
    columnHelper.accessor('dueDate', {
      header: 'Due Date',
      size: 100,
      cell: ({ row }) => {
        const overdue = isOverdue(row.original.dueDate);
        return (
          <span className={cn('text-xs', overdue ? 'text-red-400 font-medium' : 'text-zinc-300')}>
            {formatDate(row.original.dueDate)}
          </span>
        );
      },
    }),
    columnHelper.accessor('partNumber', {
      header: 'Part #',
      size: 120,
      cell: ({ getValue }) => <span className="font-mono text-xs text-zinc-300">{getValue()}</span>,
    }),
    columnHelper.accessor('partName', {
      header: 'Part Name',
      size: 350,
      cell: ({ row }) => (
        <button onClick={() => setSelectedWO(row.original)} className="text-xs text-zinc-200 hover:text-white hover:underline text-left block w-full" style={{ maxWidth: '350px' }} title={row.original.partName}>
          <span className="truncate block">{row.original.partName}</span>
        </button>
      ),
    }),
    columnHelper.accessor('project', {
      header: 'Project',
      size: 130,
      cell: ({ getValue }) => <span className="text-xs text-zinc-400 truncate max-w-[130px]">{getValue() || '—'}</span>,
    }),
    columnHelper.accessor('customer', {
      header: 'Customer',
      size: 70,
      cell: ({ getValue }) => <span className="text-xs font-medium text-zinc-300">{getValue()}</span>,
    }),
    columnHelper.accessor('currentBox', {
      header: 'Assignee',
      size: 100,
      cell: ({ getValue }) => <span className="text-sm text-zinc-300">{getValue() || '—'}</span>,
    }),
    columnHelper.accessor('currentStatus', {
      header: 'Status',
      size: 150,
      cell: ({ row }) => (
        <span className={cn('badge', statusColor(row.original.currentStatus))}>
          {statusLabel(row.original.currentStatus)}
        </span>
      ),
    }),
    columnHelper.accessor('updatedAt', {
      header: 'Completed Date',
      size: 120,
      cell: ({ getValue }) => <span className="text-xs text-zinc-400">{formatDate(getValue())}</span>,
    }),
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const totalPages = Math.ceil(total / (typeof filters.limit === 'number' ? filters.limit : 50));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Completed Work Orders</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {total} completed work orders
          </p>
        </div>
      </div>

      {/* Search & Filters bar */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setFilters(f => ({ ...f, page: 1 })); }}
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
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value, page: 1 }))}
          className="select max-w-[160px]"
        >
          <option value="updatedAt">Sort: Completed Date</option>
          <option value="dueDate">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="woNumber">Sort: WO Number</option>
          <option value="customer">Sort: Customer</option>
        </select>

        <button
          onClick={() => setFilters(f => ({ ...f, sortOrder: f.sortOrder === 'asc' ? 'desc' : 'asc' }))}
          className="btn-ghost"
          title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {filters.sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                <tr><td colSpan={columns.length} className="text-center py-12 text-[var(--text-muted)]">No completed work orders found</td></tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer',
                      row.original.isHotJob && 'bg-orange-500/[0.04] hover:bg-orange-500/[0.08] border-l-2 border-l-orange-500'
                    )}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button, a, select')) return;
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-secondary)]">
              Page {filters.page} of {totalPages} ({total} items)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={filters.page === 1}
                onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page || 1) - 1) }))}
                className="btn-ghost text-xs disabled:opacity-30"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = filters.page! <= 3 ? i + 1 : filters.page! - 2 + i;
                if (page < 1 || page > totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setFilters(f => ({ ...f, page }))}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                      filters.page === page ? 'bg-accent text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                    )}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                disabled={filters.page === totalPages}
                onClick={() => setFilters(f => ({ ...f, page: Math.min(totalPages, (f.page || 1) + 1) }))}
                className="btn-ghost text-xs disabled:opacity-30"
              >
                Next
              </button>
            </div>
            <select
              value={filters.limit}
              onChange={e => setFilters(f => ({ ...f, limit: e.target.value === 'all' ? 'all' : Number(e.target.value), page: 1 }))}
              className="select max-w-[100px] text-xs"
            >
              {[15, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              <option value="all">All</option>
            </select>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <WorkOrderDrawer
        workOrder={selectedWO}
        onClose={() => setSelectedWO(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}


