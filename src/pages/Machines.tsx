import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Cpu } from 'lucide-react';
import { getMachinesData, isProshopUnavailableResponse, type MachinesData, type MachineWorkOrder } from '@/services/api';
import { erpWorkOrderUrl, formatDate, daysUntilDue } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MACHINE_KEYS = ['VMX 84-1', 'VMX 64-1', 'VMX 64-2'] as const;
const BACKLOG_HOURS_CAP = 40;

function dueDateIndicatorClass(dueDate: string | null): string {
  const days = daysUntilDue(dueDate);
  if (days === null) return 'border-l-zinc-500';
  if (days < 0) return 'border-l-red-500';
  if (days < 2) return 'border-l-red-500';
  if (days <= 5) return 'border-l-yellow-500';
  return 'border-l-green-500';
}

export default function Machines() {
  const [data, setData] = useState<MachinesData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateLimited, setRateLimited] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setRateLimited(false);
    try {
      const res = await getMachinesData();
      if (isProshopUnavailableResponse(res)) {
        setRateLimited(true);
        setData(null);
        setLastUpdated(null);
        return;
      }
      if (res.success) {
        setData(res.data ?? null);
        setLastUpdated(res.lastUpdated ?? null);
      } else {
        setData(null);
        setLastUpdated(null);
      }
    } catch {
      setData(null);
      setLastUpdated(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (rateLimited) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Machines</h1>
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center">
          <p className="text-sm text-amber-400">
            ProShop rate limit – data temporarily unavailable. Try again in a minute.
          </p>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Machines</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[var(--text-muted)]">
              Last updated {new Date(lastUpdated).toLocaleString()}
            </span>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] text-sm transition-colors',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MACHINE_KEYS.map((key) => (
            <div key={key} className="skeleton h-64 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MACHINE_KEYS.map((machineKey) => {
            const workOrders: MachineWorkOrder[] = data?.[machineKey] ?? [];
            const totalHours = workOrders.reduce((sum, wo) => sum + (wo.totalEstimatedHours ?? 0), 0);
            const progressPercent = Math.min(100, (totalHours / BACKLOG_HOURS_CAP) * 100);

            return (
              <div
                key={machineKey}
                className="card flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-subtle)]">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-accent" />
                    {machineKey}
                  </h2>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {totalHours.toFixed(1)}h backlog
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                  {workOrders.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                      No jobs currently scheduled
                    </p>
                  ) : (
                    workOrders.map((wo) => (
                      <div
                        key={`${machineKey}-${wo.workOrderNumber}`}
                        className={cn(
                          'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 border-l-4',
                          dueDateIndicatorClass(wo.dueDate)
                        )}
                      >
                        <a
                          href={erpWorkOrderUrl(wo.workOrderNumber)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline font-mono text-sm"
                        >
                          {wo.workOrderNumber}
                        </a>
                        <div className="mt-1 text-xs text-[var(--text-secondary)] space-y-0.5">
                          <div>{wo.partNumber || '—'}</div>
                          <div>{wo.customer || '—'}</div>
                          <div>
                            Due {wo.dueDate ? formatDate(wo.dueDate) : '—'} · {wo.totalEstimatedHours.toFixed(1)}h
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
