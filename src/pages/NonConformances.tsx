import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  X,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getNcrsRecent,
  getNcrsLast24h,
  getNcrsByAssignee,
  getTimeTrackingStats,
  getCachedNcrsRecent,
  getCachedNcrsLast24h,
  getCachedNcrsByAssignee,
  getCachedTimeTrackingStats,
  isProshopRateLimitError,
  isProshopUnavailableResponse,
} from '@/services/api';
import type { NCR, NCRByAssigneeData, NCRByAssigneeStats } from '@/types';
import type { TimeTrackingStatsData } from '@/types';
import { cn, isAdmin } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

/** ProShop returns compact ISO e.g. 2024-06-27T171127Z (no colons). Normalize so Date parses. */
function parseProshopDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  let s = String(dateStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (m) s = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateTime(dateStr: string | null | undefined): string {
  const d = parseProshopDate(dateStr);
  if (!d) return dateStr || '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NcrTable({ ncrs, emptyMessage }: { ncrs: NCR[]; emptyMessage: string }) {
  if (ncrs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">{emptyMessage}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-400 border-b border-white/10">
            <th className="pb-2 pr-4 font-medium">NCR #</th>
            <th className="pb-2 pr-4 font-medium">Created</th>
            <th className="pb-2 pr-4 font-medium">Assigned to</th>
            <th className="pb-2 pr-4 font-medium">WO #</th>
            <th className="pb-2 pr-4 font-medium">Part</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ncrs.map((ncr) => (
            <tr
              key={ncr.ncrRefNumber ?? ''}
              className="border-b border-white/5 hover:bg-white/[0.03]"
            >
              <td className="py-2 pr-4 text-zinc-200 font-mono">
                {ncr.ncrRefNumber ? (
                  <a
                    href={`https://est.adionsystems.com/procnc/nonconformancereports/${encodeURIComponent(ncr.ncrRefNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300 underline"
                  >
                    {ncr.ncrRefNumber}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                {formatDateTime(ncr.createdTime)}
              </td>
              <td className="py-2 pr-4 text-zinc-300">
                {ncr.assignedToPlainText ?? '—'}
              </td>
              <td className="py-2 pr-4 text-zinc-300">
                {ncr.workOrderNumber ?? '—'}
              </td>
              <td className="py-2 pr-4 text-zinc-400 max-w-[140px] truncate">
                {ncr.partNumber ?? '—'}
              </td>
              <td className="py-2 text-zinc-400">{ncr.status ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ASSIGNEE_ORDER = ['Damien', 'Alex', 'Thad', 'Rob'];

export default function NonConformances() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const admin = isAdmin(user);
  const [recent, setRecent] = useState<NCR[]>([]);
  const [last24h, setLast24h] = useState<NCR[]>([]);
  const [byAssigneeData, setByAssigneeData] = useState<NCRByAssigneeData | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [loading24h, setLoading24h] = useState(true);
  const [loadingByAssignee, setLoadingByAssignee] = useState(true);
  const [rateLimitRecent, setRateLimitRecent] = useState(false);
  const [rateLimit24h, setRateLimit24h] = useState(false);
  const [rateLimitByAssignee, setRateLimitByAssignee] = useState(false);
  const [timeTrackingStats, setTimeTrackingStats] = useState<TimeTrackingStatsData | null>(null);
  const [loadingTimeTracking, setLoadingTimeTracking] = useState(true);
  const [assigneeModal, setAssigneeModal] = useState<string | null>(null);

  /** First name -> unique WOs this year (for NCR rate = NCRs / unique WOs) */
  const uniqueWOsByFirstName = useMemo(() => {
    const m: Record<string, number> = {};
    timeTrackingStats?.users?.forEach((u) => {
      m[u.firstName] = u.uniqueWorkOrdersThisYear ?? 0;
    });
    return m;
  }, [timeTrackingStats]);

  const NCR_RETRY_DELAY_MS = 2500;
  const NCR_MAX_ATTEMPTS = 3;

  const loadRecent = useCallback(async () => {
    setRateLimitRecent(false);
    const cached = getCachedNcrsRecent(10);
    const hasCache = cached != null && cached.length >= 0;
    if (hasCache) setRecent(cached);
    if (!hasCache) setLoadingRecent(true);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= NCR_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await getNcrsRecent(10);
        if (isProshopUnavailableResponse(res)) {
          setRateLimitRecent(true);
          setLoadingRecent(false);
          return;
        }
        const list = res?.success && Array.isArray(res.data) ? res.data : [];
        setRecent(list);
        if (res?.success === false && res?.error) {
          const code = (res as { code?: string }).code;
          if (code === 'PROSHOP_RATE_LIMIT') {
            setRateLimitRecent(true);
          } else {
            toast.error(res.error);
          }
        }
        setLoadingRecent(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load recent NCRs');
        if (isProshopRateLimitError(err)) {
          setRateLimitRecent(true);
          setLoadingRecent(false);
          return;
        }
        if (attempt < NCR_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, NCR_RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === NCR_MAX_ATTEMPTS) {
          setLoadingRecent(false);
        }
      }
    }
    toast.error(lastError?.message ?? 'Failed to load recent NCRs');
    setRecent([]);
  }, []);

  const loadLast24h = useCallback(async () => {
    setRateLimit24h(false);
    const cached = getCachedNcrsLast24h();
    const hasCache = cached != null && cached.length >= 0;
    if (hasCache) setLast24h(cached);
    if (!hasCache) setLoading24h(true);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= NCR_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await getNcrsLast24h();
        if (isProshopUnavailableResponse(res)) {
          setRateLimit24h(true);
          setLoading24h(false);
          return;
        }
        const list = res?.success && Array.isArray(res.data) ? res.data : [];
        setLast24h(list);
        if (res?.success === false && res?.error) {
          const code = (res as { code?: string }).code;
          if (code === 'PROSHOP_RATE_LIMIT') {
            setRateLimit24h(true);
          } else {
            toast.error(res.error);
          }
        }
        setLoading24h(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load NCRs from last 24h');
        if (isProshopRateLimitError(err)) {
          setRateLimit24h(true);
          setLoading24h(false);
          return;
        }
        if (attempt < NCR_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, NCR_RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === NCR_MAX_ATTEMPTS) {
          setLoading24h(false);
        }
      }
    }
    toast.error(lastError?.message ?? 'Failed to load NCRs from last 24h');
    setLast24h([]);
  }, []);

  const loadByAssignee = useCallback(async () => {
    setRateLimitByAssignee(false);
    const cached = getCachedNcrsByAssignee();
    const hasCache = cached != null && typeof cached === 'object' && 'byAssignee' in cached;
    if (hasCache) setByAssigneeData(cached);
    if (!hasCache) setLoadingByAssignee(true);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= NCR_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await getNcrsByAssignee();
        if (isProshopUnavailableResponse(res)) {
          setRateLimitByAssignee(true);
          setLoadingByAssignee(false);
          return;
        }
        const data =
          res?.success && res?.data && typeof res.data === 'object' && 'byAssignee' in res.data
            ? res.data
            : null;
        setByAssigneeData(data);
        if (res?.success === false && res?.error) {
          const code = (res as { code?: string }).code;
          if (code === 'PROSHOP_RATE_LIMIT') {
            setRateLimitByAssignee(true);
          } else {
            toast.error(res.error);
          }
        }
        setLoadingByAssignee(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load NCRs by assignee');
        if (isProshopRateLimitError(err)) {
          setRateLimitByAssignee(true);
          setLoadingByAssignee(false);
          return;
        }
        if (attempt < NCR_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, NCR_RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === NCR_MAX_ATTEMPTS) {
          setLoadingByAssignee(false);
        }
      }
    }
    toast.error(lastError?.message ?? 'Failed to load NCRs by assignee');
    setByAssigneeData(null);
  }, []);

  const loadTimeTrackingStats = useCallback(async () => {
    const cached = getCachedTimeTrackingStats();
    const hasCache = cached != null && cached.users != null;
    if (hasCache) setTimeTrackingStats(cached);
    if (!hasCache) setLoadingTimeTracking(true);
    try {
      const res = await getTimeTrackingStats();
      const data = res?.success && res?.data?.users ? res.data : null;
      setTimeTrackingStats(data ?? null);
    } catch {
      setTimeTrackingStats(null);
    } finally {
      setLoadingTimeTracking(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadRecent();
    loadLast24h();
    if (admin) {
      loadByAssignee();
      loadTimeTrackingStats();
    }
  }, [loadRecent, loadLast24h, loadByAssignee, loadTimeTrackingStats, admin]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);
  useEffect(() => {
    loadLast24h();
  }, [loadLast24h]);
  useEffect(() => {
    if (admin || searchParams.get('assignee')) loadByAssignee();
  }, [admin, searchParams.get('assignee'), loadByAssignee]);

  // When arriving with ?assignee=Name (e.g. from Dashboard "View all"), open modal for that user once data is loaded
  const assigneeParam = searchParams.get('assignee');
  useEffect(() => {
    if (!assigneeParam || !user?.displayName || !byAssigneeData) return;
    if (assigneeParam !== user.displayName && admin) return;
    setAssigneeModal(assigneeParam);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('assignee');
      return next;
    }, { replace: true });
  }, [assigneeParam, user?.displayName, admin, byAssigneeData]);

  useEffect(() => {
    if (admin) loadTimeTrackingStats();
  }, [admin, loadTimeTrackingStats]);

  const modalNcrs = assigneeModal && byAssigneeData?.allNcrsByAssignee?.[assigneeModal]
    ? byAssigneeData.allNcrsByAssignee[assigneeModal]
    : [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-100">
            <AlertCircle className="w-7 h-7 text-amber-500" />
            NCRs
          </h1>
        </div>
        <button
          onClick={refreshAll}
          disabled={
            loadingRecent ||
            loading24h ||
            (admin && (loadingByAssignee || loadingTimeTracking))
          }
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 text-sm"
        >
          <RefreshCw
            className={cn(
              'w-4 h-4',
              (loadingRecent ||
                loading24h ||
                (admin && (loadingByAssignee || loadingTimeTracking))) &&
                'animate-spin'
            )}
          />
          Refresh
        </button>
      </div>

      {/* Section A: Last 10 */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-zinc-400" />
            Last 10 NCRs
          </h2>
          <button
            onClick={loadRecent}
            disabled={loadingRecent}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {rateLimitRecent ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-amber-400">
              ProShop rate limit – data temporarily unavailable. Try again in a minute.
            </p>
            <button
              onClick={loadRecent}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : loadingRecent ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : (
          <NcrTable ncrs={recent} emptyMessage="No NCRs found." />
        )}
      </section>

      {/* Section B: Last 24h */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            NCRs in the last 24 hours
            {!loading24h && (
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({last24h.length})
              </span>
            )}
          </h2>
          <button
            onClick={loadLast24h}
            disabled={loading24h}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {rateLimit24h ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-amber-400">
              ProShop rate limit – data temporarily unavailable. Try again in a minute.
            </p>
            <button
              onClick={loadLast24h}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : loading24h ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : (
          <NcrTable
            ncrs={last24h}
            emptyMessage="No NCRs created in the last 24 hours."
          />
        )}
      </section>

      {/* Section C: By assignee (admin only) */}
      {admin && (
      <section className="card">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          By assignee (year, quarter, month, week)
        </h2>
        {rateLimitByAssignee ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-amber-400">
              ProShop rate limit – data temporarily unavailable. Try again in a minute.
            </p>
            <button
              onClick={loadByAssignee}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : loadingByAssignee ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : byAssigneeData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-white/10">
                  <th className="pb-2 pr-4 font-medium">Assignee</th>
                  <th className="pb-2 pr-4 font-medium text-right">Year</th>
                  <th className="pb-2 pr-4 font-medium text-right">Quarter</th>
                  <th className="pb-2 pr-4 font-medium text-right">Month</th>
                  <th className="pb-2 pr-4 font-medium text-right">Week</th>
                  <th className="pb-2 pr-4 font-medium text-right">Monthly avg</th>
                  <th className="pb-2 pr-4 font-medium text-right">Weekly avg</th>
                  <th className="pb-2 font-medium text-right">NCR rate</th>
                </tr>
              </thead>
              <tbody>
                {ASSIGNEE_ORDER.map((name) => {
                  const stats: NCRByAssigneeStats = byAssigneeData.byAssignee[name] ?? {
                    year: 0,
                    quarter: 0,
                    month: 0,
                    week: 0,
                    monthlyAvg: 0,
                    weeklyAvg: 0,
                  };
                  const uniqueWOs = uniqueWOsByFirstName[name] ?? 0;
                  const ncrRatePct =
                    uniqueWOs > 0 ? (stats.year / uniqueWOs) * 100 : null;
                  return (
                    <tr
                      key={name}
                      className="border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => setAssigneeModal(name)}
                          className="flex items-center gap-1 text-accent hover:underline font-medium"
                        >
                          {name}
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {stats.year}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {stats.quarter}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {stats.month}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {stats.week}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">
                        {stats.monthlyAvg.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">
                        {stats.weeklyAvg.toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-zinc-300">
                        {ncrRatePct != null
                          ? `${ncrRatePct.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
                {(() => {
                  const totalYear = ASSIGNEE_ORDER.reduce(
                    (sum, name) => sum + (byAssigneeData.byAssignee[name]?.year ?? 0),
                    0
                  );
                  const totalQuarter = ASSIGNEE_ORDER.reduce(
                    (sum, name) => sum + (byAssigneeData.byAssignee[name]?.quarter ?? 0),
                    0
                  );
                  const totalMonth = ASSIGNEE_ORDER.reduce(
                    (sum, name) => sum + (byAssigneeData.byAssignee[name]?.month ?? 0),
                    0
                  );
                  const totalWeek = ASSIGNEE_ORDER.reduce(
                    (sum, name) => sum + (byAssigneeData.byAssignee[name]?.week ?? 0),
                    0
                  );
                  const totalUniqueWOs = ASSIGNEE_ORDER.reduce(
                    (sum, name) => sum + (uniqueWOsByFirstName[name] ?? 0),
                    0
                  );
                  const totalNcrRatePct =
                    totalUniqueWOs > 0 ? (totalYear / totalUniqueWOs) * 100 : null;
                  return (
                    <tr className="border-t-2 border-white/20 bg-white/[0.02] font-medium">
                      <td className="py-2 pr-4 text-zinc-100">Total</td>
                      <td className="py-2 pr-4 text-right text-zinc-100">
                        {totalYear}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-100">
                        {totalQuarter}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-100">
                        {totalMonth}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-100">
                        {totalWeek}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {(totalYear / 12).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-300">
                        {(totalYear / 52).toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-zinc-300">
                        {totalNcrRatePct != null
                          ? `${totalNcrRatePct.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 py-4">No assignee data.</p>
        )}
      </section>
      )}

      {/* Drill-down modal (admin viewing any assignee, or current user viewing own NCRs) */}
      {assigneeModal && (admin || assigneeModal === user?.displayName) && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setAssigneeModal(null)}
          />
          <div className="fixed top-4 bottom-4 left-4 right-4 md:top-8 md:bottom-8 md:left-8 md:right-8 lg:top-12 lg:bottom-12 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-full lg:max-w-5xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-lg font-semibold text-zinc-100">
                All NCRs assigned to {assigneeModal} (this year)
              </h3>
              <button
                onClick={() => setAssigneeModal(null)}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {modalNcrs.length === 0 ? (
                <p className="text-zinc-500 text-sm">No NCRs for this assignee this year.</p>
              ) : (
                <NcrTable ncrs={modalNcrs} emptyMessage="" />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
