import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import {
  getTimeTracking,
  getTimeTrackingRange,
  getTimeTrackingLatestDate,
  getTimeTrackingStats,
  getCachedTimeTracking,
  getCachedTimeTrackingLatestDate,
  getCachedTimeTrackingStats,
  isProshopRateLimitError,
} from '@/services/api';
import { erpWorkOrderUrl, isAdmin } from '@/lib/utils';
import type { TimeTrackingData, TimeTrackingUser, TimeTrackingEntry, TimeTrackingUserStats } from '@/types';
import { addDays as dateFnsAddDays, format as dateFnsFormat, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type ViewMode = 'by-user' | 'chronological';

const USER_STYLE: Record<string, { badge: string; dot: string; line: string; card: string }> = {
  'Alex Vincent': {
    badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    dot: 'bg-blue-500',
    line: 'border-l-blue-500',
    card: 'border-l-blue-500',
  },
  'Thad Slone': {
    badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    dot: 'bg-emerald-500',
    line: 'border-l-emerald-500',
    card: 'border-l-emerald-500',
  },
  'Rob Perkins': {
    badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    dot: 'bg-amber-500',
    line: 'border-l-amber-500',
    card: 'border-l-amber-500',
  },
  'Damien McDaniel': {
    badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    dot: 'bg-rose-500',
    line: 'border-l-rose-500',
    card: 'border-l-rose-500',
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  Programming: 'bg-purple-500/20 text-purple-400',
  Engineering: 'bg-blue-500/20 text-blue-400',
  'Manufacturing Process': 'bg-teal-500/20 text-teal-400',
  Setup: 'bg-yellow-500/20 text-yellow-400',
  Run: 'bg-green-500/20 text-green-400',
  Inspection: 'bg-cyan-500/20 text-cyan-400',
  Meeting: 'bg-orange-500/20 text-orange-400',
  Training: 'bg-indigo-500/20 text-indigo-400',
};

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });
  } catch {
    return '—';
  }
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  return Number(hours).toFixed(2);
}

function formatDateLong(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return dateFnsFormat(d, 'EEEE, MMMM d, yyyy');
  } catch {
    return dateStr;
  }
}

function getToday(): string {
  return dateFnsFormat(new Date(), 'yyyy-MM-dd');
}

function addDays(dateStr: string, days: number): string {
  try {
    const d = parseISO(dateStr);
    return dateFnsFormat(dateFnsAddDays(d, days), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-[var(--bg-elevated)]/80 text-[var(--text-secondary)]';
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', cls)}>
      {category}
    </span>
  );
}

function WOLink({ wo }: { wo: string | null }) {
  if (!wo) return <span>—</span>;
  return (
    <a
      href={erpWorkOrderUrl(wo)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline"
    >
      {wo}
    </a>
  );
}

function UserTimeCard({ user, defaultExpanded = true }: { user: TimeTrackingUser; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selectedEntry, setSelectedEntry] = useState<TimeTrackingEntry | null>(null);
  const style = USER_STYLE[user.displayName];
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  if (user.error) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-secondary)] text-sm font-medium">
            {initials}
          </div>
          <div>
            <p className="font-medium text-[var(--text-primary)]">{user.displayName}</p>
            <p className="text-sm text-red-400">{user.error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 text-white',
            style?.dot ?? 'bg-[var(--bg-surface)]'
          )}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--text-primary)]">{user.displayName}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {user.totalEntries} {user.totalEntries === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <p className="text-[var(--text-secondary)] font-medium shrink-0">
          {formatHours(user.totalLaborTime)}h
        </p>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
        )}
      </button>
      {expanded && user.entries.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">WO#</th>
                <th className="px-4 py-2 font-medium">Op#</th>
                <th className="px-4 py-2 font-medium">Work Cell</th>
                <th className="px-4 py-2 font-medium">Time In</th>
                <th className="px-4 py-2 font-medium">Time Out</th>
                <th className="px-4 py-2 font-medium">Labor Time</th>
                <th className="px-4 py-2 font-medium">Spent Doing What?</th>
              </tr>
            </thead>
            <tbody>
              {user.entries.map((entry) => (
                <tr
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEntry(entry)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedEntry(entry)}
                  className="border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="px-4 py-2">
                    <CategoryBadge category={entry.category} />
                  </td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <WOLink wo={entry.workOrderNumber} />
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{entry.operationNumber ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{entry.workCell ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{formatTime(entry.timeIn)}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{formatTime(entry.timeOut)}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{formatHours(entry.laborTime)}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)] max-w-xs truncate" title={entry.spentDoing ?? undefined}>
                    {entry.spentDoing ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] font-medium text-[var(--text-secondary)]">
                <td className="px-4 py-2" colSpan={6}>
                  Total
                </td>
                <td className="px-4 py-2">{formatHours(user.totalLaborTime)}h</td>
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {expanded && user.entries.length === 0 && (
        <div className="px-4 py-6 text-center text-[var(--text-muted)] text-sm border-t border-[var(--border-subtle)]">
          No entries for this day
        </div>
      )}
      <Dialog.Root open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-lg p-6 z-[61] max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)] mb-2">Spent Doing What?</Dialog.Title>
            {selectedEntry && (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  <CategoryBadge category={selectedEntry.category} />
                  {selectedEntry.workOrderNumber && (
                    <WOLink wo={selectedEntry.workOrderNumber} />
                  )}
                  <span className="text-[var(--text-muted)] text-sm">
                    {formatTime(selectedEntry.timeIn)} – {formatTime(selectedEntry.timeOut)}
                    {selectedEntry.laborTime != null && ` · ${formatHours(selectedEntry.laborTime)}h`}
                  </span>
                </div>
                <p className="text-[var(--text-secondary)] text-sm whitespace-pre-wrap overflow-y-auto flex-1 min-h-0">
                  {selectedEntry.spentDoing ?? '—'}
                </p>
              </>
            )}
            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <button type="button" className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm">
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

type EntryWithUser = TimeTrackingEntry & { displayName: string };

function TimelineView({ data }: { data: TimeTrackingData }) {
  if (!data) return null;
  const entries: EntryWithUser[] = [];
  data.users.forEach((u) => {
    if (u.error) return;
    u.entries.forEach((e) => {
      entries.push({ ...e, displayName: u.displayName });
    });
  });
  entries.sort((a, b) => {
    const outA = a.timeOut ? new Date(a.timeOut).getTime() : 0;
    const outB = b.timeOut ? new Date(b.timeOut).getTime() : 0;
    if (outA !== outB) return outA - outB;
    const inA = a.timeIn ? new Date(a.timeIn).getTime() : 0;
    const inB = b.timeIn ? new Date(b.timeIn).getTime() : 0;
    return inA - inB;
  });

  const totalHours = data.users.reduce((sum, u) => sum + (u.error ? 0 : u.totalLaborTime), 0);

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--text-muted)] text-sm">
        No entries for this day
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative flex">
        <div className="absolute left-[5px] top-0 bottom-0 w-0.5 bg-[var(--border-subtle)] rounded-full" />
        <div className="pl-6 space-y-4 flex-1">
          {entries.map((entry) => {
            const style = USER_STYLE[entry.displayName];
            return (
              <div key={entry.id} className="relative flex gap-3">
                <div
                  className={cn(
                    'absolute left-0 w-[11px] h-[11px] rounded-full ring-2 ring-[var(--bg-primary)] shrink-0 mt-0.5',
                    style?.dot ?? 'bg-[var(--text-muted)]'
                  )}
                />
                <div
                  className={cn(
                    'flex-1 min-w-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] border-l-[3px]',
                    style?.card ?? 'border-l-[var(--text-muted)]'
                  )}
                >
                  <div className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border',
                          style?.badge ?? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]'
                        )}
                      >
                        {entry.displayName}
                      </span>
                      <CategoryBadge category={entry.category} />
                      <WOLink wo={entry.workOrderNumber} />
                      {entry.operationNumber && (
                        <span className="text-[var(--text-muted)] text-xs">Op {entry.operationNumber}</span>
                      )}
                      {entry.laborTime != null && (
                        <span className="text-[var(--text-secondary)] text-xs">{formatHours(entry.laborTime)}h</span>
                      )}
                    </div>
                    {entry.spentDoing && (
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{entry.spentDoing}</p>
                    )}
                  </div>
                  <div className="px-3 py-2 bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex flex-wrap gap-x-4 gap-y-1">
                    <span>In: {formatTime(entry.timeIn)}</span>
                    <span>Out: {formatTime(entry.timeOut)}</span>
                    <span>Duration: {formatHours(entry.laborTime)}h</span>
                    {entry.workCell && <span>{entry.workCell}</span>}
                  </div>
                  </div>
                </div>
              );
          })}
        </div>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Total across all users {formatHours(totalHours)}h
      </p>
    </div>
  );
}

function isCurrentUser(userEntry: { firstName?: string; displayName?: string }, currentDisplayName: string | undefined): boolean {
  if (!currentDisplayName) return false;
  return userEntry.firstName === currentDisplayName || userEntry.displayName === currentDisplayName;
}

export default function TimeTracking() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const currentDisplayName = user?.displayName;

  const [date, setDate] = useState('');
  const [data, setData] = useState<TimeTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('by-user');
  const [stats, setStats] = useState<TimeTrackingUserStats[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [rateLimitData, setRateLimitData] = useState(false);
  const [rateLimitStats, setRateLimitStats] = useState(false);

  // Custom range summary
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeEmployeeId, setRangeEmployeeId] = useState('all');
  const [rangeData, setRangeData] = useState<TimeTrackingData | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // For non-admin: only show current user's data (filter client-side)
  const displayData = useMemo<TimeTrackingData | null>(() => {
    if (!data) return null;
    if (admin) return data;
    if (!currentDisplayName) return { ...data, users: [] };
    const filtered = data.users.filter((u) => isCurrentUser(u, currentDisplayName));
    return { ...data, users: filtered };
  }, [data, admin, currentDisplayName]);

  const displayStats = useMemo<TimeTrackingUserStats[] | null>(() => {
    if (!stats) return null;
    if (admin) return stats;
    if (!currentDisplayName) return [];
    return stats.filter((s) => isCurrentUser(s, currentDisplayName));
  }, [stats, admin, currentDisplayName]);

  const displayRangeData = useMemo<TimeTrackingData | null>(() => {
    if (!rangeData) return null;
    if (admin) return rangeData;
    if (!currentDisplayName) return { ...rangeData, users: [] };
    const filtered = rangeData.users.filter((u) => isCurrentUser(u, currentDisplayName));
    return { ...rangeData, users: filtered };
  }, [rangeData, admin, currentDisplayName]);

  const TT_RETRY_DELAY_MS = 2500;
  const TT_MAX_ATTEMPTS = 3;

  const fetchData = useCallback(async (d: string) => {
    if (!d) return;
    setRateLimitData(false);
    const cached = getCachedTimeTracking(d);
    const hasCache = cached != null;
    if (hasCache) setData(cached);
    if (!hasCache) setLoading(true);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= TT_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await getTimeTracking(d);
        setData(res.data ?? null);
        setLoading(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load time tracking');
        if (isProshopRateLimitError(err)) {
          setRateLimitData(true);
          setLoading(false);
          return;
        }
        if (attempt < TT_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, TT_RETRY_DELAY_MS));
        }
      } finally {
        if (attempt === TT_MAX_ATTEMPTS) setLoading(false);
      }
    }
    setData(null);
  }, []);

  const INIT_TIMEOUT_MS = 10000;
  useEffect(() => {
    const cached = getCachedTimeTrackingLatestDate();
    if (cached?.date) setDate(cached.date);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setDate(getToday());
        setInitializing(false);
      }
    }, INIT_TIMEOUT_MS);
    getTimeTrackingLatestDate()
      .then((res) => {
        if (cancelled) return;
        setDate(res.data?.date || getToday());
      })
      .catch(() => {
        if (!cancelled) setDate(getToday());
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
        clearTimeout(timeoutId);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!initializing && date) {
      fetchData(date);
    }
  }, [initializing, date, fetchData]);

  useEffect(() => {
    if (initializing) return;
    const cached = getCachedTimeTrackingStats();
    const hasCache = cached != null && cached.users != null;
    if (hasCache) setStats(cached.users);
    if (!hasCache) setStatsLoading(true);
    setStatsError(null);
    setRateLimitStats(false);
    let cancelled = false;
    const loadStats = async () => {
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= TT_MAX_ATTEMPTS; attempt++) {
        try {
          const res = await getTimeTrackingStats();
          if (cancelled) return;
          if (res.success && res.data) setStats(res.data.users);
          else setStats(null);
          setStatsLoading(false);
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error('Failed to load stats');
          if (isProshopRateLimitError(err)) {
            if (!cancelled) {
              setRateLimitStats(true);
              setStatsLoading(false);
            }
            return;
          }
          if (attempt < TT_MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, TT_RETRY_DELAY_MS));
        }
        if (attempt === TT_MAX_ATTEMPTS && !cancelled) {
          setStatsLoading(false);
          setStats(null);
          setStatsError(lastErr?.message ?? 'Failed to load stats');
        }
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [initializing]);

  const handlePrevDay = () => setDate((d) => (d ? addDays(d, -1) : d));
  const handleNextDay = () => setDate((d) => (d ? addDays(d, 1) : d));
  const handleToday = () => setDate(getToday());

  const handleRangeStartChange = (v: string) => {
    setRangeStart(v);
    setRangeData(null);
  };
  const handleRangeEndChange = (v: string) => {
    setRangeEnd(v);
    setRangeData(null);
  };
  const handleRangeEmployeeChange = (v: string) => {
    setRangeEmployeeId(v);
    setRangeData(null);
  };

  const handleGenerateRangeSummary = useCallback(async () => {
    if (!rangeStart || !rangeEnd) {
      setRangeError('Please select both start and end date.');
      return;
    }
    if (rangeStart > rangeEnd) {
      setRangeError('Start date must be on or before end date.');
      return;
    }
    setRangeError(null);
    setRangeLoading(true);
    try {
      const res = await getTimeTrackingRange(
        rangeStart,
        rangeEnd,
        rangeEmployeeId === 'all' ? undefined : rangeEmployeeId
      );
      if (res.success && res.data) {
        setRangeData(res.data);
      } else {
        setRangeData(null);
        setRangeError(res.message ?? 'Failed to load range summary');
      }
    } catch (err) {
      setRangeData(null);
      setRangeError(err instanceof Error ? err.message : 'Failed to load range summary');
    } finally {
      setRangeLoading(false);
    }
  }, [rangeStart, rangeEnd, rangeEmployeeId]);

  const totalHours = displayData?.users.reduce((s, u) => s + (u.error ? 0 : u.totalLaborTime), 0) ?? 0;
  const userCount = displayData?.users.filter((u) => !u.error).length ?? 0;

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Time Tracking</h1>
        {admin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('by-user')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'by-user'
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              )}
            >
              By User
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chronological')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'chronological'
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              )}
            >
              Timeline
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePrevDay}
          className="p-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input rounded-lg px-3 py-2 text-sm"
        />
        <span className="text-sm text-[var(--text-secondary)] min-w-[200px]">{date ? formatDateLong(date) : ''}</span>
        <button
          type="button"
          onClick={handleNextDay}
          className="p-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleToday}
          className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm font-medium"
        >
          Today
        </button>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
        {admin && <span>Users Tracked: {userCount}</span>}
        <span>Total Hours: {formatHours(totalHours)}</span>
      </div>

      {rateLimitData ? (
        <div className="flex flex-col items-center justify-center min-h-[120px] gap-3 text-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6">
          <p className="text-sm text-amber-400">
            ProShop rate limit – data temporarily unavailable. Try again in a minute.
          </p>
          <button
            onClick={() => fetchData(date)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[120px]">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : viewMode === 'by-user' ? (
        <div className="space-y-3">
          {displayData?.users.length === 0 && !admin ? (
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 text-center text-[var(--text-muted)] text-sm">
              No time tracking data for you for this day.
            </div>
          ) : (
            displayData?.users.map((u) => (
              <UserTimeCard key={u.userId} user={u} defaultExpanded />
            ))
          )}
        </div>
      ) : displayData ? (
        displayData.users.length === 0 && !admin ? (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 text-center text-[var(--text-muted)] text-sm">
            No time tracking data for you for this day.
          </div>
        ) : (
          <TimelineView data={displayData} />
        )
      ) : null}

      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
        <h2 className="px-4 py-3 text-base font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]">
          Time & work order stats
        </h2>
        {rateLimitStats ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <p className="text-sm text-amber-400">
              ProShop rate limit – stats temporarily unavailable. Try again in a minute.
            </p>
            <button
              type="button"
              onClick={() => {
                setRateLimitStats(false);
                setStatsLoading(true);
                getTimeTrackingStats()
                  .then((res) => {
                    if (res.success && res.data) setStats(res.data.users);
                    else setStats(null);
                  })
                  .catch((err) => {
                    if (isProshopRateLimitError(err)) setRateLimitStats(true);
                    else setStats(null);
                  })
                  .finally(() => setStatsLoading(false));
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : statsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : statsError ? (
          <div className="px-4 py-4 text-sm text-red-400">{statsError}</div>
        ) : displayStats && displayStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Unique WOs (Year)</th>
                  <th className="px-4 py-2 font-medium">Unique WOs (Quarter)</th>
                  <th className="px-4 py-2 font-medium">Unique WOs (Month)</th>
                  <th className="px-4 py-2 font-medium">Unique WOs (Week)</th>
                  <th className="px-4 py-2 font-medium">Hours This Week</th>
                  <th className="px-4 py-2 font-medium">Avg per work week (Mon–Fri, YTD)</th>
                </tr>
              </thead>
              <tbody>
                {displayStats.map((row) => {
                  const style = USER_STYLE[row.displayName];
                  return (
                    <tr
                      key={row.userId}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-4 py-2">
                        {row.error ? (
                          <span className="text-red-400">{row.displayName} — Failed to load</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border',
                              style?.badge ?? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]'
                            )}
                          >
                            {row.displayName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : row.uniqueWorkOrdersThisYear}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : row.uniqueWorkOrdersThisQuarter}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : row.uniqueWorkOrdersThisMonth}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : row.uniqueWorkOrdersThisWeek}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : formatHours(row.hoursThisWeek)}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{row.error ? '—' : formatHours(row.averageWeeklyHoursYTD)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-[var(--text-muted)]">No stats available.</div>
        )}
      </section>

      {admin && (
        <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          <h2 className="px-4 py-3 text-base font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]">
            Custom range summary
          </h2>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
                Start date
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => handleRangeStartChange(e.target.value)}
                  className="input rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
                End date
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => handleRangeEndChange(e.target.value)}
                  className="input rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
                Employee
                <select
                  value={rangeEmployeeId}
                  onChange={(e) => handleRangeEmployeeChange(e.target.value)}
                  disabled={statsLoading || !stats?.length}
                  className="input rounded-lg px-3 py-2 text-sm min-w-[160px] disabled:opacity-50"
                >
                  <option value="all">Everyone</option>
                  {stats?.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleGenerateRangeSummary}
                  disabled={rangeLoading}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {rangeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Generate summary
                </button>
              </div>
            </div>
            {rangeError ? (
              <p className="text-sm text-red-400">{rangeError}</p>
            ) : null}
          </div>
          {displayRangeData ? (() => {
            const uniqueWOs = displayRangeData.users.reduce<Set<string>>((set, u) => {
              u.entries.forEach((e) => {
                if (e.workOrderNumber?.trim()) set.add(e.workOrderNumber.trim());
              });
              return set;
            }, new Set());
            const uniqueWOCount = uniqueWOs.size;
            const totalEntries = displayRangeData.users.reduce((s, u) => s + (u.error ? 0 : u.totalEntries), 0);
            return (
            <div className="border-t border-[var(--border-subtle)] p-4 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Summary:{' '}
                {displayRangeData.users.length === 1
                  ? displayRangeData.users[0].displayName
                  : 'Everyone'}
                {displayRangeData.endDate
                  ? ` · ${formatDateLong(displayRangeData.date)} – ${formatDateLong(displayRangeData.endDate)}`
                  : ` · ${formatDateLong(displayRangeData.date)}`}
              </p>
              {viewMode === 'by-user' ? (
                <div className="space-y-3">
                  {displayRangeData.users.map((u) => (
                    <UserTimeCard key={u.userId} user={u} defaultExpanded />
                  ))}
                </div>
              ) : (
                <TimelineView data={displayRangeData} />
              )}
              <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-4">
                <span>Total entries: {totalEntries}</span>
                <span>Unique work orders: {uniqueWOCount}</span>
              </div>
            </div>
            );
          })() : null}
        </section>
      )}
    </div>
  );
}
