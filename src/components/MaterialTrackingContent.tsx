import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  RefreshCw,
  AlertCircle,
  Truck,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  ExternalLink,
  Search as SearchIcon,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { getProshopMaterialStatus, getCachedProshopMaterialStatus, isProshopUnavailableResponse } from '@/services/api';
import { erpWorkOrderUrl, erpPoUrl } from '@/lib/utils';
import type { ProshopMaterialStatus } from '@/types';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'not-ordered' | 'requested' | 'ordered' | 'arrived' | 'not-applicable';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof AlertCircle; className: string }> = {
  'not-ordered': {
    label: 'Not Ordered',
    icon: AlertCircle,
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  requested: {
    label: 'Requested',
    icon: Send,
    className: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  },
  ordered: {
    label: 'Ordered',
    icon: Truck,
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  arrived: {
    label: 'Arrived',
    icon: CheckCircle2,
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    className: 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-default)]',
  },
  'not-applicable': {
    label: 'N/A',
    icon: Package,
    className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  },
};

export function MaterialStatusBadge({
  status,
  bomOrdered,
  bomArrived,
}: {
  status: ProshopMaterialStatus['materialStatus'];
  bomOrdered?: boolean;
  bomArrived?: boolean;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const Icon = config.icon;
  const label =
    status === 'arrived' && bomArrived
      ? 'Arrived (BOM)'
      : status === 'ordered' && bomOrdered
        ? 'Ordered (BOM)'
        : config.label;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium',
        config.className
      )}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}

function WOLink({ wo }: { wo: string }) {
  return (
    <a
      href={erpWorkOrderUrl(wo)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-mono text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {wo}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

function POLink({ po }: { po: string }) {
  return (
    <a
      href={erpPoUrl(po)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-mono text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {po}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

/** Format receivedDate (e.g. "12/05/2025; 08:33:53 AM") to date only for display */
function formatReceivedDate(s: string | null): string {
  if (!s) return '—';
  const part = s.split(';')[0]?.trim();
  return part || s;
}

/** Compact panel of Proshop material/stock/BOM details for use in schedule table popover */
export function ProshopMaterialDetailPanel({ row }: { row: ProshopMaterialStatus }) {
  return (
    <div className="space-y-3 text-sm max-h-[320px] overflow-y-auto">
      {row.stockDetails?.length ? (
        row.stockDetails.map((s, i) => (
          <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[var(--text-muted)]">Material:</span>
              <span className="text-[var(--text-primary)]">
                {[s.material, s.materialGrade].filter(Boolean).join(' ') || '—'}
              </span>
              <span className="text-[var(--text-muted)]">Type:</span>
              <span className="text-[var(--text-primary)]">{s.stockType ?? '—'}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[var(--text-muted)]">PO:</span>
              <span>{s.poNumber ? <POLink po={s.poNumber} /> : '—'}</span>
              {s.supplier && (
                <>
                  <span className="text-[var(--text-muted)]">Supplier:</span>
                  <span className="text-[var(--text-primary)]">{s.supplier}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[var(--text-muted)]">Due at Dock:</span>
              <span className="text-yellow-400">{s.dueAtDock ?? '—'}</span>
              <span className="text-[var(--text-muted)]">Received:</span>
              <span className="text-green-400">{formatReceivedDate(s.receivedDate)}</span>
            </div>
            {s.dimensions && (
              <div>
                <span className="text-[var(--text-muted)]">Size: </span>
                <span className="text-[var(--text-primary)]">{s.dimensions}</span>
              </div>
            )}
          </div>
        ))
      ) : (
        <p className="text-[var(--text-muted)]">No stock details</p>
      )}
      {row.bomDetails && row.bomDetails.lines.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
          <p className="text-[var(--text-secondary)] font-medium">
            {row.bomArrived ? 'BOM items arrived' : 'BOM items ordered'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-1.5">
            <span className="text-[var(--text-muted)]">POs:</span>
            <span className="flex flex-wrap gap-2">
              {row.bomDetails.poNumbers.map((po) => (
                <POLink key={po} po={po} />
              ))}
            </span>
          </div>
          <div className="space-y-1">
            {row.bomDetails.lines.slice(0, 10).map((line, i) => (
              <div key={i} className="flex flex-wrap gap-x-3 gap-y-0 text-[var(--text-secondary)]">
                {line.partNumber && <span className="font-mono text-xs">{line.partNumber}</span>}
                {line.description && <span className="text-xs">{line.description}</span>}
                {line.poNumber && <POLink po={line.poNumber} />}
              </div>
            ))}
            {row.bomDetails.lines.length > 10 && (
              <p className="text-[var(--text-muted)] text-xs">+{row.bomDetails.lines.length - 10} more</p>
            )}
          </div>
        </div>
      )}
      {row.partstockNote && (
        <p className="text-[var(--text-muted)]">
          <span className="text-[var(--text-muted)]">Note: </span>
          <span className="text-[var(--text-secondary)] whitespace-pre-wrap">{row.partstockNote}</span>
        </p>
      )}
    </div>
  );
}

export interface MaterialTrackingContentProps {
  /** Optional title shown above the content (e.g. "Material Tracking" on standalone page) */
  title?: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Whether to show the header block with title and Refresh button (default true) */
  showHeader?: boolean;
}

export default function MaterialTrackingContent({
  title = 'Material Tracking',
  subtitle = 'Material status from Proshop ERP for scheduled work orders',
  showHeader = true,
}: MaterialTrackingContentProps) {
  const [data, setData] = useState<ProshopMaterialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedWo, setExpandedWo] = useState<string | null>(null);

  const MATERIAL_RETRY_DELAY_MS = 2500;
  const MATERIAL_MAX_ATTEMPTS = 3;

  const [materialError, setMaterialError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setMaterialError(null);
    const cached = getCachedProshopMaterialStatus();
    const hasCache = cached != null;
    if (hasCache) setData(cached);
    if (!hasCache) setLoading(true);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MATERIAL_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await getProshopMaterialStatus();
        if (isProshopUnavailableResponse(res)) {
          setMaterialError(res.message);
          setLoading(false);
          return;
        }
        if (res.success) setData(res.data ?? []);
        else toast.error(res.error || 'Failed to load material status');
        setLoading(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load material status');
        if (attempt < MATERIAL_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, MATERIAL_RETRY_DELAY_MS));
        }
      }
      if (attempt === MATERIAL_MAX_ATTEMPTS) {
        setLoading(false);
        toast.error(lastError?.message ?? 'Failed to load material status');
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = data.length;
  const notOrderedCount = data.filter((d) => d.materialStatus === 'not-ordered').length;
  const orderedCount = data.filter((d) => d.materialStatus === 'ordered').length;
  const arrivedCount = data.filter((d) => d.materialStatus === 'arrived').length;
  const requestedCount = data.filter((d) => d.materialStatus === 'requested').length;
  const notApplicableCount = data.filter((d) => d.materialStatus === 'not-applicable').length;

  const filtered = data.filter((row) => {
    if (statusFilter !== 'all' && row.materialStatus !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const wo = (row.workOrderNumber ?? '').toLowerCase();
    const part = (row.partNumber ?? '').toLowerCase();
    const customer = (row.customer ?? '').toLowerCase();
    const note = (row.partstockNote ?? '').toLowerCase();
    return wo.includes(q) || part.includes(q) || customer.includes(q) || note.includes(q);
  });

  const toggleStatusFilter = (key: StatusFilter) => {
    setStatusFilter((prev) => (prev === key ? 'all' : key));
  };

  const clearAll = () => {
    setStatusFilter('all');
    setSearch('');
  };

  const firstDueAtDock = (row: ProshopMaterialStatus) =>
    row.stockDetails?.[0]?.dueAtDock ?? null;
  const firstMaterial = (row: ProshopMaterialStatus) => {
    const s = row.stockDetails?.[0];
    if (!s) return '—';
    const mat = [s.material, s.materialGrade].filter(Boolean).join(' ').trim();
    return mat || '—';
  };
  const firstPo = (row: ProshopMaterialStatus) => row.stockDetails?.[0]?.poNumber ?? null;

  if (materialError && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <p className="text-sm text-amber-400">{materialError}</p>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }
  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-7 h-7 text-[var(--text-secondary)]" />
              {title}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => toggleStatusFilter('all')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'all' ? 'border-blue-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Total Active</div>
          <div className="text-xl font-semibold text-[var(--text-primary)] mt-0.5">{total}</div>
        </button>
        <button
          type="button"
          onClick={() => toggleStatusFilter('not-ordered')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'not-ordered' ? 'border-red-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            Not Ordered
          </div>
          <div className="text-xl font-semibold text-red-400 mt-0.5">{notOrderedCount}</div>
        </button>
        <button
          type="button"
          onClick={() => toggleStatusFilter('requested')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'requested' ? 'border-sky-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <Send className="w-3.5 h-3.5 text-sky-400" />
            Requested
          </div>
          <div className="text-xl font-semibold text-sky-400 mt-0.5">{requestedCount}</div>
        </button>
        <button
          type="button"
          onClick={() => toggleStatusFilter('ordered')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'ordered' ? 'border-yellow-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <Truck className="w-3.5 h-3.5 text-yellow-400" />
            Ordered
          </div>
          <div className="text-xl font-semibold text-yellow-400 mt-0.5">{orderedCount}</div>
        </button>
        <button
          type="button"
          onClick={() => toggleStatusFilter('arrived')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'arrived' ? 'border-green-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            Arrived
          </div>
          <div className="text-xl font-semibold text-green-400 mt-0.5">{arrivedCount}</div>
        </button>
        <button
          type="button"
          onClick={() => toggleStatusFilter('not-applicable')}
          className={cn(
            'rounded-xl p-3.5 bg-[var(--bg-surface)] border text-left transition-colors',
            statusFilter === 'not-applicable' ? 'border-slate-500/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            N/A
          </div>
          <div className="text-xl font-semibold text-slate-400 mt-0.5">{notApplicableCount}</div>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search WO, part, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 pl-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-default)]"
          />
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-sm font-medium"
        >
          Clear All
        </button>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Showing {filtered.length} of {total} work orders
      </p>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wider border-b border-[var(--border-subtle)]">
                <th className="py-3 px-4 font-medium">Material Status</th>
                <th className="py-3 px-4 font-medium">WO #</th>
                <th className="py-3 px-4 font-medium">Part #</th>
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Due at Dock</th>
                <th className="py-3 px-4 font-medium">Material</th>
                <th className="py-3 px-4 font-medium">PO #</th>
                <th className="py-3 px-4 w-8" aria-label="Expand" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.flatMap((row) => {
                const isExpanded = expandedWo === row.workOrderNumber;
                return [
                  <tr
                    key={row.workOrderNumber}
                    onClick={() => setExpandedWo(isExpanded ? null : row.workOrderNumber)}
                    className="hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <MaterialStatusBadge status={row.materialStatus} bomOrdered={row.bomOrdered} bomArrived={row.bomArrived} />
                    </td>
                    <td className="py-2.5 px-4">
                      <WOLink wo={row.workOrderNumber} />
                    </td>
                    <td className="py-2.5 px-4 text-sm text-[var(--text-secondary)] font-mono truncate max-w-[140px]" title={row.partNumber ?? ''}>
                      {row.partNumber ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-[var(--text-secondary)]">{row.customer ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm text-[var(--text-secondary)]">{firstDueAtDock(row) ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm text-[var(--text-secondary)]">{firstMaterial(row)}</td>
                    <td className="py-2.5 px-4">
                      {firstPo(row) ? <POLink po={firstPo(row)!} /> : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <ChevronRight
                        className={cn('w-4 h-4 text-[var(--text-muted)] transition-transform', isExpanded && 'rotate-90')}
                      />
                    </td>
                  </tr>,
                  ...(isExpanded
                    ? [
                        <tr key={`${row.workOrderNumber}-exp`}>
                          <td colSpan={8} className="bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] p-4">
                            <div className="space-y-3 text-sm">
                              {row.stockDetails?.length ? (
                                row.stockDetails.map((s, i) => (
                                  <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1.5">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      <span className="text-[var(--text-muted)]">Material:</span>
                                      <span className="text-[var(--text-primary)]">
                                        {[s.material, s.materialGrade].filter(Boolean).join(' ') || '—'}
                                      </span>
                                      <span className="text-[var(--text-muted)]">Type:</span>
                                      <span className="text-[var(--text-primary)]">{s.stockType ?? '—'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      <span className="text-[var(--text-muted)]">PO:</span>
                                      <span>{s.poNumber ? <POLink po={s.poNumber} /> : '—'}</span>
                                      {s.supplier && (
                                        <>
                                          <span className="text-[var(--text-muted)]">Supplier:</span>
                                          <span className="text-[var(--text-primary)]">{s.supplier}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      <span className="text-[var(--text-muted)]">Due at Dock:</span>
                                      <span className="text-yellow-400">{s.dueAtDock ?? '—'}</span>
                                      <span className="text-[var(--text-muted)]">Received:</span>
                                      <span className="text-green-400">{formatReceivedDate(s.receivedDate)}</span>
                                    </div>
                                    {s.dimensions && (
                                      <div>
                                        <span className="text-[var(--text-muted)]">Size: </span>
                                        <span className="text-[var(--text-primary)]">{s.dimensions}</span>
                                      </div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="text-[var(--text-muted)]">No stock details</p>
                              )}
                              {row.bomDetails && row.bomDetails.lines.length > 0 && (
                                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
                                  <p className="text-[var(--text-secondary)] font-medium">
                                    {row.bomArrived ? 'BOM items arrived' : 'BOM items ordered'}
                                  </p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-1.5">
                                    <span className="text-[var(--text-muted)]">POs:</span>
                                    <span className="flex flex-wrap gap-2">
                                      {row.bomDetails.poNumbers.map((po) => (
                                        <POLink key={po} po={po} />
                                      ))}
                                    </span>
                                  </div>
                                  <div className="space-y-1">
                                    {row.bomDetails.lines.slice(0, 10).map((line, i) => (
                                      <div key={i} className="flex flex-wrap gap-x-3 gap-y-0 text-[var(--text-secondary)]">
                                        {line.partNumber && <span className="font-mono text-xs">{line.partNumber}</span>}
                                        {line.description && <span className="text-xs">{line.description}</span>}
                                        {line.poNumber && <POLink po={line.poNumber} />}
                                      </div>
                                    ))}
                                    {row.bomDetails.lines.length > 10 && (
                                      <p className="text-[var(--text-muted)] text-xs">+{row.bomDetails.lines.length - 10} more</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {row.partstockNote && (
                                <p className="text-[var(--text-muted)]">
                                  <span className="text-[var(--text-muted)]">Note: </span>
                                  <span className="text-[var(--text-secondary)] whitespace-pre-wrap">{row.partstockNote}</span>
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>,
                      ]
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-[var(--text-muted)] text-sm">
            No work orders match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
