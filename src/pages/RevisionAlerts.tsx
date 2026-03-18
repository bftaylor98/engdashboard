import { useEffect, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, Bell, Clock, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { getRevisionAlerts } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import type { RevisionAlert } from '@/types';
import { cn, formatDate, erpWorkOrderUrl } from '@/lib/utils';

export default function RevisionAlerts() {
  const [alerts, setAlerts] = useState<RevisionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all');

  const refreshData = useCallback(async () => {
    try {
      const res = await getRevisionAlerts();
      if (res.success) setAlerts(res.data);
    } catch (err) {
      toast.error('Failed to load revision alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Silently refresh when server pushes events (e.g. import may add new alerts)
  useSSE(useCallback(() => { refreshData(); }, [refreshData]));

  const filtered = alerts.filter(a => {
    if (filter === 'linked') return a.linkedWorkOrders.length > 0;
    if (filter === 'unlinked') return a.linkedWorkOrders.length === 0;
    return true;
  });

  const linkedCount = alerts.filter(a => a.linkedWorkOrders.length > 0).length;
  const unlinkedCount = alerts.filter(a => a.linkedWorkOrders.length === 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Revision Alerts
            {unlinkedCount > 0 && (
              <span className="text-sm bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-normal">
                {unlinkedCount} unlinked
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">Parts that need engineering revision attention</p>
        </div>
        <div className="flex items-center gap-2">
          {([
            { key: 'all' as const, label: `All (${alerts.length})` },
            { key: 'linked' as const, label: `Linked (${linkedCount})` },
            { key: 'unlinked' as const, label: `Unlinked (${unlinkedCount})` },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === f.key ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500">No revision alerts {filter !== 'all' ? `matching filter "${filter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <div
              key={alert.id}
              className={cn(
                'card flex items-start gap-4 transition-all',
                alert.linkedWorkOrders.length === 0 && 'border-l-2 border-l-yellow-500',
              )}
            >
              <div className={cn(
                'p-2 rounded-lg mt-0.5',
                alert.linkedWorkOrders.length > 0 ? 'bg-blue-500/10' : 'bg-yellow-500/10',
              )}>
                {alert.linkedWorkOrders.length > 0 ? (
                  <Link2 className="w-5 h-5 text-blue-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-accent">{alert.partNumber}</span>
                  {alert.partName && (
                    <span className="text-xs text-zinc-400">— {alert.partName}</span>
                  )}
                </div>

                {/* Linked work orders */}
                {alert.linkedWorkOrders.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-1.5">
                    {alert.linkedWorkOrders.map(wo => (
                      <a
                        key={wo.id}
                        href={erpWorkOrderUrl(wo.woNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs bg-zinc-800 text-zinc-300 hover:text-white px-2 py-0.5 rounded transition-colors"
                      >
                        WO {wo.woNumber}
                        <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  {alert.revisionDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Rev: {formatDate(alert.revisionDate)}
                    </span>
                  )}
                  <span>Created: {formatDate(alert.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
