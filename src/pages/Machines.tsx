import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Cpu } from 'lucide-react';
import { getMachinesData, isProshopUnavailableResponse, type MachinesData, type MachineWorkOrder } from '@/services/api';
import { erpWorkOrderUrl, daysUntilDue } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MACHINE_KEYS = ['VMX 84-1', 'VMX 64-1', 'VMX 64-2'] as const;

type MachineOp = {
  operationNumber: unknown;
  estimatedSetupTime: unknown;
  estimatedRunTime: unknown;
  completedTime:
    | {
        setupTimeSpent?: unknown;
        runTimeSpent?: unknown;
      }
    | null;
};

function dueDateIndicatorClass(dueDate: string | null): string {
  const days = daysUntilDue(dueDate);
  if (days === null) return 'border-l-zinc-500';
  if (days < 0) return 'border-l-red-500';
  if (days < 2) return 'border-l-red-500';
  if (days <= 5) return 'border-l-yellow-500';
  return 'border-l-green-500';
}

function opRemainingHours(op: MachineOp): number {
  const parse = (v: unknown) => Math.max(0, parseFloat(String(v ?? 0).replace(/,/g, '')) || 0);
  const setupMinutes = parse(op.estimatedSetupTime);
  const runMinutes = parse(op.estimatedRunTime);
  const spentMinutes = parse(op.completedTime?.setupTimeSpent) + parse(op.completedTime?.runTimeSpent);
  const remainingMinutes = Math.max(0, setupMinutes + runMinutes - spentMinutes);
  return Math.round((remainingMinutes / 60) * 100) / 100;
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
            const totalHours = workOrders.reduce((sum, wo) =>
              sum + (((wo.scheduledOps as MachineOp[] | undefined) ?? []).reduce((s, op) => s + opRemainingHours(op), 0)), 0);

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
                    workOrders.map((wo) => {
                      const ops: MachineOp[] = (wo.scheduledOps as MachineOp[] | undefined) ?? [];

                      return (
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

                          <div className="mt-2 text-xs text-[var(--text-secondary)] space-y-2">
                            <div>
                              {wo.partNumber || '—'} · {wo.customer || '—'}
                            </div>

                            <div className="space-y-1">
                              {ops.length ? (
                                ops.map((op) => {
                                  const opNumber = op.operationNumber ?? '—';
                                  const remaining = opRemainingHours(op);
                                  return (
                                    <div
                                      key={`${wo.workOrderNumber}-${String(opNumber)}`}
                                      className="grid grid-cols-[auto_1fr] gap-x-3 items-start"
                                    >
                                      <div>OP {String(opNumber)}</div>
                                      <div className="text-right">{remaining.toFixed(2)}h</div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-[var(--text-muted)]">No ops scheduled</div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                              Total remaining: {(((wo.scheduledOps as MachineOp[] | undefined) ?? []).reduce((sum, op) => sum + opRemainingHours(op), 0)).toFixed(2)}h
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
