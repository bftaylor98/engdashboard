import { useEffect, useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ClipboardList,
  Flame,
  Loader2,
  Package,
  PauseCircle,
  Users,
  BarChart3,
  Clock,
  TrendingUp,
  CalendarDays,
} from 'lucide-react';
import type { DashboardStats, WorkloadEntry } from '@/types';
import type { CalendarEvent, TvConfig } from '@/types';
import { cn, calendarEventColor } from '@/lib/utils';
import { getTvConfig } from '@/services/api';
import { DEFAULT_TV_CONFIG, TV_GRID_COLS, TV_GRID_ROWS } from '@/constants/tvWidgets';
import BasketballScoreWidget from '@/components/widgets/BasketballScoreWidget';

/** Scale factor for TV display (1.5 = 150%). Set to 1 to roll back to 100%. */
const TV_SCALE = 1.5;

const POLL_INTERVAL_MS = 60 * 1000;
const WEATHER_POLL_MS = 30 * 60 * 1000; // 30 minutes
const API_TV = '/api/tv';
const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=37.4073&longitude=-84.4113&current_weather=true&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&windspeed_unit=mph';
/** Proshop can be slow when cache is cold; wait long enough to get full data (speed later) */
const FETCH_TIMEOUT_MS = 120000;

/** Map WMO weather code to readable label (Open-Meteo uses WMO codes) */
function weatherCodeToLabel(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Dense Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    66: 'Light Freezing Rain',
    67: 'Freezing Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Light Rain Showers',
    81: 'Rain Showers',
    82: 'Heavy Rain Showers',
    85: 'Light Snow Showers',
    86: 'Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm (Light Hail)',
    99: 'Thunderstorm (Hail)',
  };
  return map[code] ?? 'Unknown';
}

interface TVStats extends DashboardStats {
  revisionCount?: number;
  materialArrivedCount?: number;
}

interface StatusBreakdownItem {
  value: string;
  label: string;
  count: number;
}

/** Open-Meteo current_weather + daily today high/low (°F, windspeed mph, weathercode WMO) */
interface TVWeather {
  temperature: number;
  weathercode: number;
  windspeed: number;
  todayHigh: number | null;
  todayLow: number | null;
}

interface HotJobEntry {
  wo_number: string;
  part_name: string;
  due_date: string | null;
}

interface TVData {
  stats: TVStats;
  workload: WorkloadEntry[];
  statusBreakdown?: StatusBreakdownItem[];
  ncrCountLast30Days?: number | null;
  toolingSpendCurrentMonth?: number | null;
  calendarThisWeek?: CalendarEvent[];
  hotJobList?: HotJobEntry[];
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  compact,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4">
        <div className={`p-2 rounded-lg shrink-0 ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] tabular-nums truncate">{value}</p>
          <p className="text-sm text-[var(--text-secondary)] truncate">{label}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div>
        <p className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
        <p className="text-lg text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  );
}

function statusBarColor(status: string): string {
  switch (status) {
    case 'engineering':
      return 'bg-blue-500';
    case 'engineering-completed':
      return 'bg-yellow-500';
    case 'programming':
      return 'bg-purple-500';
    case 'programming-completed':
      return 'bg-green-500';
    case 'hold':
      return 'bg-orange-500';
    default:
      return 'bg-[var(--bg-elevated)]';
  }
}

const EASTERN_TZ = 'America/New_York';

/**
 * Format a time in 12-hour format (e.g. "2:45 PM") without relying on system locale.
 * Use this so the display is always 12hr even when the device is set to 24hr.
 * If timeZone is provided, the date is interpreted in that zone (e.g. Eastern).
 */
function formatTime12hr(date: Date, timeZone?: string): string {
  let h: number;
  let m: number;
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
    h = parseInt(parts.hour ?? '0', 10);
    m = parseInt(parts.minute ?? '0', 10);
  } else {
    h = date.getHours();
    m = date.getMinutes();
  }
  const hour12 = h % 12 || 12;
  const minute = String(m).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${minute} ${ampm}`;
}

/** Eastern time, 12hr HH:MM (e.g. 2:45 PM) — always 12hr regardless of system settings */
function useEasternTime() {
  const [time, setTime] = useState(() => formatTime12hr(new Date(), EASTERN_TZ));
  useEffect(() => {
    const id = setInterval(() => setTime(formatTime12hr(new Date(), EASTERN_TZ)), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function TVDashboard() {
  const easternTime = useEasternTime();
  const [data, setData] = useState<TVData | null>(null);
  const [weather, setWeather] = useState<TVWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tvConfig, setTvConfig] = useState<TvConfig | null>(null);

  const fetchData = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(API_TV, {
        signal: controller.signal,
        credentials: 'omit',
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      let json: { success?: boolean; data?: TVData; error?: string };
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? 'Invalid response' : `Server error ${res.status}`);
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      setData(json.data ?? null);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out. Check that the server is running.'
            : err.message
          : 'Failed to load';
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch(OPEN_METEO_URL, { credentials: 'omit' });
      if (!res.ok) throw new Error(`Weather ${res.status}`);
      const json = await res.json();
      const current = json?.current_weather;
      const daily = json?.daily;
      const todayHigh = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
      const todayLow = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
      if (current && typeof current.temperature === 'number') {
        setWeather({
          temperature: current.temperature,
          weathercode: current.weathercode ?? 0,
          windspeed: current.windspeed ?? 0,
          todayHigh: todayHigh != null ? Number(todayHigh) : null,
          todayLow: todayLow != null ? Number(todayLow) : null,
        });
      } else {
        setWeatherError('Invalid weather data');
        setWeather(null);
      }
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Failed to load weather');
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    fetchWeather();
    const id = setInterval(fetchWeather, WEATHER_POLL_MS);
    return () => clearInterval(id);
  }, [fetchWeather]);

  useEffect(() => {
    getTvConfig()
      .then((res) => {
        if (res.success && res.data) setTvConfig(res.data);
        else setTvConfig(DEFAULT_TV_CONFIG);
      })
      .catch(() => setTvConfig(DEFAULT_TV_CONFIG));
  }, []);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center" style={{ zoom: TV_SCALE }}>
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-red-400 text-xl" style={{ zoom: TV_SCALE }}>
        {error}
      </div>
    );
  }

  const stats = data?.stats;
  const workload = data?.workload ?? [];
  const statusBreakdown = data?.statusBreakdown ?? [];
  const ncrCount = data?.ncrCountLast30Days;
  const toolingSpend = data?.toolingSpendCurrentMonth;
  const calendarThisWeek = data?.calendarThisWeek ?? [];
  const hotJobList = data?.hotJobList ?? [];
  const totalForStatusPct = statusBreakdown.reduce((s, x) => s + x.count, 0);
  const holdCount = statusBreakdown.find((s) => s.value === 'hold')?.count ?? 0;

  const formatEventTime = (ev: CalendarEvent) => {
    if (ev.allDay) return null;
    const start = parseISO(ev.start);
    return format(start, 'h:mm a');
  };

  const activeSet = tvConfig ? new Set(tvConfig.activeWidgetIds) : null;
  const layout = tvConfig?.layout ?? [];

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'clock':
        return (
          <StatCard
            label="Eastern"
            value={easternTime}
            icon={Clock}
            color="bg-[var(--bg-elevated)]"
            compact
          />
        );
      case 'work-orders':
        return stats ? (
          <StatCard
            label="Work Orders"
            value={Math.max(0, stats.total - holdCount)}
            icon={ClipboardList}
            color="bg-blue-600"
            compact
          />
        ) : null;
      case 'on-hold':
        return stats ? (
          <StatCard label="On Hold" value={holdCount} icon={PauseCircle} color="bg-orange-600" compact />
        ) : null;
      case 'material-arrived':
        return stats ? (
          <StatCard
            label="Material Arrived"
            value={stats.materialArrivedCount ?? 0}
            icon={Package}
            color="bg-emerald-600"
            compact
          />
        ) : null;
      case 'tooling-cost':
        return (
          <StatCard
            label={`${format(new Date(), 'MMMM')} Tooling Cost`}
            value={
              toolingSpend != null
                ? `$${toolingSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                : '—'
            }
            icon={TrendingUp}
            color="bg-cyan-600"
            compact
          />
        );
      case 'status-breakdown':
        return (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col h-full min-h-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Status Breakdown
            </h2>
            {statusBreakdown.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No status data</p>
            ) : (
              <div className="space-y-2 flex-1">
                {statusBreakdown.map((s) => {
                  const pct = totalForStatusPct ? Math.round((s.count / totalForStatusPct) * 100) : 0;
                  return (
                    <div key={s.value} className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-secondary)] w-24 text-right shrink-0">{s.label}</span>
                      <div className="flex-1 h-6 bg-[var(--bg-elevated)] rounded-lg overflow-hidden relative min-w-0">
                        <div
                          className={cn('h-full rounded-lg transition-all', statusBarColor(s.value))}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/80">
                          {s.count} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'workload-distribution':
        return (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col h-full min-h-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Workload Distribution
            </h2>
            {workload.length === 0 ? (
              <p className="text-[var(--text-muted)] text-center py-4">No assignees with active work orders</p>
            ) : (
              <div className="space-y-3">
                {workload.map((row) => {
                  const maxCount = Math.max(...workload.map((x) => x.jobCount));
                  const progHours = Number(row.programmingHours);
                  const engHours = Number(row.engineeringHours);
                  const overdueCount = row.overdueCount ?? 0;
                  return (
                    <div key={row.assignee}>
                      <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--text-primary)] font-medium">{row.assignee}</span>
                            <span className="text-[var(--text-secondary)] text-xs">
                          {row.jobCount} items · {progHours.toFixed(1)}h prog · {engHours.toFixed(1)}h eng
                          {overdueCount > 0 && (
                            <span className="text-red-400 ml-1">({overdueCount} overdue)</span>
                          )}
                        </span>
                      </div>
                          <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                          style={{ width: `${maxCount > 0 ? (row.jobCount / maxCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'calendar-this-week':
        return (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col h-full min-h-0 overflow-hidden">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              This week
            </h2>
            {calendarThisWeek.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No events this week</p>
            ) : (
              <div className="space-y-1.5 overflow-y-auto max-h-[280px]">
                {calendarThisWeek.map((ev) => {
                  const start = parseISO(ev.start);
                  const timeStr = formatEventTime(ev);
                  const pillColor = calendarEventColor(ev.title);
                  return (
                    <div
                      key={ev.id}
                      className={cn('text-sm px-2 py-1.5 rounded-lg border truncate', pillColor)}
                      title={ev.title + (timeStr ? ` • ${timeStr}` : '')}
                    >
                      <span className="text-[var(--text-secondary)] text-xs font-medium">
                        {format(start, 'EEE M/d')}
                        {timeStr ? ` · ${timeStr}` : ''}
                      </span>
                      <span className="block truncate">{ev.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'hot-jobs':
        return (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col h-full min-h-0 overflow-hidden">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400 animate-fire-flicker" aria-hidden />
              Hot Jobs
            </h2>
            {hotJobList.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No hot jobs</p>
            ) : (
              <div className="space-y-1">
                {hotJobList.map((job) => {
                  const dueStr = job.due_date ? format(parseISO(job.due_date), 'M/d/yyyy') : '—';
                  return (
                    <div
                      key={job.wo_number + (job.part_name || '')}
                      className="flex items-center justify-between gap-2 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-white min-h-0"
                      title={`${job.wo_number} · ${job.part_name} · Due: ${dueStr}`}
                    >
                      <span className="min-w-0 truncate">{job.wo_number} · {job.part_name}</span>
                      <span className="shrink-0 text-[var(--text-secondary)]">Due: {dueStr}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'basketball-score':
        return <BasketballScoreWidget />;
      case 'weather-footer':
        return (
          <div className="flex items-center justify-between text-sm text-[var(--text-muted)] flex-wrap gap-x-4">
            <span>
              Brodhead, KY:{' '}
              {weatherLoading ? (
                'Loading…'
              ) : weatherError ? (
                weatherError
              ) : weather ? (
                <>
                  {Math.round(weather.temperature)}°F · {weatherCodeToLabel(weather.weathercode)}
                  {weather.todayHigh != null || weather.todayLow != null
                    ? ` · H ${weather.todayHigh != null ? Math.round(weather.todayHigh) : '—'}° / L ${weather.todayLow != null ? Math.round(weather.todayLow) : '—'}°`
                    : ''}
                  {' '}
                  · {weather.windspeed} mph wind
                </>
              ) : (
                '—'
              )}
            </span>
            {lastUpdated && (
              <span>Last updated {formatTime12hr(lastUpdated, EASTERN_TZ)}</span>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const useConfigLayout = tvConfig && activeSet && layout.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-8 md:p-10 flex flex-col" style={{ zoom: TV_SCALE }}>
      <div className="max-w-7xl mx-auto flex-1 w-full relative pb-8">
        {useConfigLayout ? (
          <div
            className="grid gap-3 md:gap-4 w-full"
            style={{
              gridTemplateColumns: `repeat(${TV_GRID_COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${TV_GRID_ROWS}, minmax(0, auto))`,
            }}
          >
            {layout
              .filter((item) => activeSet!.has(item.widgetId))
              .map((item) => (
                <div
                  key={item.widgetId}
                  className="min-h-0"
                  style={{
                    gridColumn: `${item.gridCol} / span ${item.gridColSpan}`,
                    gridRow: `${item.gridRow} / span ${item.gridRowSpan}`,
                  }}
                >
                  {renderWidget(item.widgetId)}
                </div>
              ))}
          </div>
        ) : (
          <>
            {/* Fallback: hardcoded layout when no config yet */}
            <section className="grid grid-cols-2 lg:grid-cols-[minmax(8rem,1.2fr)_1fr_1fr_1fr_1fr] gap-3 md:gap-4 mb-6">
              <StatCard
                label="Eastern"
                value={easternTime}
                icon={Clock}
                color="bg-[var(--bg-elevated)]"
                compact
              />
              {stats && (
                <>
                  <StatCard
                    label="Work Orders"
                    value={Math.max(0, stats.total - holdCount)}
                    icon={ClipboardList}
                    color="bg-blue-600"
                    compact
                  />
                  <StatCard label="On Hold" value={holdCount} icon={PauseCircle} color="bg-orange-600" compact />
                  <StatCard
                    label="Material Arrived"
                    value={stats.materialArrivedCount ?? 0}
                    icon={Package}
                    color="bg-emerald-600"
                    compact
                  />
                </>
              )}
              <StatCard
                label={`${format(new Date(), 'MMMM')} Tooling Cost`}
                value={
                  toolingSpend != null
                    ? `$${toolingSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    : '—'
                }
                icon={TrendingUp}
                color="bg-cyan-600"
                compact
              />
            </section>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Status Breakdown
                </h2>
                {statusBreakdown.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No status data</p>
                ) : (
                  <div className="space-y-2 flex-1">
                    {statusBreakdown.map((s) => {
                      const pct = totalForStatusPct ? Math.round((s.count / totalForStatusPct) * 100) : 0;
                      return (
                        <div key={s.value} className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-secondary)] w-24 text-right shrink-0">{s.label}</span>
                          <div className="flex-1 h-6 bg-[var(--bg-elevated)] rounded-lg overflow-hidden relative min-w-0">
                            <div
                              className={cn('h-full rounded-lg transition-all', statusBarColor(s.value))}
                              style={{ width: `${pct}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/80">
                              {s.count} ({pct}%)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Workload Distribution
                </h2>
                {workload.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-center py-4">No assignees with active work orders</p>
                ) : (
                  <div className="space-y-3">
                    {workload.map((row) => {
                      const maxCount = Math.max(...workload.map((x) => x.jobCount));
                      const progHours = Number(row.programmingHours);
                      const engHours = Number(row.engineeringHours);
                      const overdueCount = row.overdueCount ?? 0;
                      return (
                        <div key={row.assignee}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--text-primary)] font-medium">{row.assignee}</span>
                            <span className="text-[var(--text-secondary)] text-xs">
                              {row.jobCount} items · {progHours.toFixed(1)}h prog · {engHours.toFixed(1)}h eng
                              {overdueCount > 0 && (
                                <span className="text-red-400 ml-1">({overdueCount} overdue)</span>
                              )}
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                              style={{ width: `${maxCount > 0 ? (row.jobCount / maxCount) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  This week
                </h2>
                {calendarThisWeek.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No events this week</p>
                ) : (
                  <div className="space-y-1.5 overflow-y-auto max-h-[280px]">
                    {calendarThisWeek.map((ev) => {
                      const start = parseISO(ev.start);
                      const timeStr = formatEventTime(ev);
                      const pillColor = calendarEventColor(ev.title);
                      return (
                        <div
                          key={ev.id}
                          className={cn('text-sm px-2 py-1.5 rounded-lg border truncate', pillColor)}
                          title={ev.title + (timeStr ? ` • ${timeStr}` : '')}
                        >
                          <span className="text-[var(--text-secondary)] text-xs font-medium">
                            {format(start, 'EEE M/d')}
                            {timeStr ? ` · ${timeStr}` : ''}
                          </span>
                          <span className="block truncate">{ev.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-400 animate-fire-flicker" aria-hidden />
                  Hot Jobs
                </h2>
                {hotJobList.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No hot jobs</p>
                ) : (
                  <div className="space-y-1">
                    {hotJobList.map((job) => {
                      const dueStr = job.due_date ? format(parseISO(job.due_date), 'M/d/yyyy') : '—';
                      return (
                        <div
                          key={job.wo_number + (job.part_name || '')}
                          className="flex items-center justify-between gap-2 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-white min-h-0"
                          title={`${job.wo_number} · ${job.part_name} · Due: ${dueStr}`}
                        >
                          <span className="min-w-0 truncate">{job.wo_number} · {job.part_name}</span>
                          <span className="shrink-0 text-[var(--text-secondary)]">Due: {dueStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
              <span>
                Brodhead, KY:{' '}
                {weatherLoading ? (
                  'Loading…'
                ) : weatherError ? (
                  weatherError
                ) : weather ? (
                  <>
                    {Math.round(weather.temperature)}°F · {weatherCodeToLabel(weather.weathercode)}
                    {weather.todayHigh != null || weather.todayLow != null
                      ? ` · H ${weather.todayHigh != null ? Math.round(weather.todayHigh) : '—'}° / L ${weather.todayLow != null ? Math.round(weather.todayLow) : '—'}°`
                      : ''}
                    {' '}
                    · {weather.windspeed} mph wind
                  </>
                ) : (
                  '—'
                )}
              </span>
              {lastUpdated && (
                <span>Last updated {formatTime12hr(lastUpdated, EASTERN_TZ)}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
